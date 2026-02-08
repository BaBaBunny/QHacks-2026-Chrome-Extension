"""
PDF reconstruction service using reportlab.
Rebuilds PDFs with preserved layout while cleaning problematic elements.
"""
import logging
from typing import List, Dict, Any
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import black
from io import BytesIO

from .pdf_structure import PageStructure, TextElement, GraphicElement

logger = logging.getLogger(__name__)


def rebuild_pdf(
    structures: List[PageStructure],
    cleaned_texts: List[str],
    gemini_analyses: List[Dict[str, Any]] = None,
    output_path: str = None
) -> bytes:
    """
    Rebuild a PDF with preserved layout using cleaned text and metadata.
    
    Args:
        structures: List of page structures from original PDF
        cleaned_texts: List of cleaned text for each page
        gemini_analyses: List of Gemini analysis results for each page (optional)
        output_path: Optional path to save PDF (if None, returns bytes)
        
    Returns:
        PDF as bytes
    """
    try:
        # Create PDF in memory
        buffer = BytesIO()
        
        # Create canvas
        if structures and len(structures) > 0:
            first_page = structures[0]
            page_size = (first_page.width, first_page.height)
        else:
            page_size = letter
        
        c = canvas.Canvas(buffer if not output_path else output_path, pagesize=page_size)
        
        # Process each page
        for i, structure in enumerate(structures):
            logger.info(f"Rebuilding page {i + 1}/{len(structures)}")
            
            # Set page size for this page
            c.setPageSize((structure.width, structure.height))
            
            # Get analysis for this page if available
            analysis = gemini_analyses[i] if gemini_analyses and i < len(gemini_analyses) else None
            cleaned_text = cleaned_texts[i] if i < len(cleaned_texts) else ""
            
            # Rebuild page content with metadata
            _rebuild_page_with_metadata(c, structure, cleaned_text, analysis)
            
            # Create new page for next iteration (except last page)
            if i < len(structures) - 1:
                c.showPage()
        
        # Save the PDF
        c.save()
        
        # Get PDF bytes
        if not output_path:
            pdf_bytes = buffer.getvalue()
            buffer.close()
            return pdf_bytes
        else:
            with open(output_path, 'rb') as f:
                return f.read()
        
    except Exception as e:
        logger.error(f"PDF rebuild failed: {e}")
        raise


def _match_text_to_elements(cleaned_lines: List[str], text_elements: List[TextElement]) -> Dict[int, TextElement]:
    """
    Match cleaned text lines to original text elements by content similarity.
    
    With fitz extraction, text_elements are already full lines (not individual words),
    so no aggregation is needed.
    
    Args:
        cleaned_lines: List of cleaned text lines
        text_elements: List of TextElement objects from fitz extraction
        
    Returns:
        Dictionary mapping line index to best matching TextElement
    """
    matches = {}
    
    if not text_elements:
        return matches
    
    print(f"[PDF_REBUILD] Matching {len(cleaned_lines)} cleaned lines to {len(text_elements)} text elements")
    
    # For each cleaned line, find best matching text element
    for line_idx, line in enumerate(cleaned_lines):
        line_stripped = line.strip()
        if not line_stripped or len(line_stripped) < 3:
            continue
        
        line_lower = line_stripped.lower()
        best_match = None
        best_score = 0
        
        for elem in text_elements:
            elem_text = elem.text.strip().lower()
            if not elem_text:
                continue
            
            score = 0
            
            # Exact match
            if line_lower == elem_text:
                score = 100
            # Line starts with element text (handles trailing spaces etc)
            elif line_lower.startswith(elem_text[:min(20, len(elem_text))]):
                score = 90
            # Element starts with line text
            elif elem_text.startswith(line_lower[:min(20, len(line_lower))]):
                score = 85
            # Element contained in line
            elif elem_text in line_lower:
                score = 80
            # Line contained in element
            elif line_lower in elem_text:
                score = 70
            # First 2 words match
            else:
                line_words = line_lower.split()[:2]
                elem_words = elem_text.split()[:2]
                if len(line_words) >= 2 and len(elem_words) >= 2 and line_words == elem_words:
                    score = 60
                elif line_words and elem_words and line_words[0] == elem_words[0]:
                    score = 50
            
            if score > best_score:
                best_score = score
                best_match = elem
        
        if best_match and best_score > 45:
            matches[line_idx] = best_match
            print(f"[PDF_REBUILD]   Matched line {line_idx} (score={best_score}): '{line_stripped[:35]}' -> font={best_match.font_name} size={best_match.font_size:.1f} y={best_match.y:.1f}")
    
    print(f"[PDF_REBUILD] Matched {len(matches)} out of {len(cleaned_lines)} cleaned lines")
    return matches


def _find_background_for_y(y_topdown: float, graphic_elements: List[GraphicElement]) -> tuple:
    """
    Find a light background color for a given top-down Y position.
    All coordinates are top-down (fitz convention).
    
    Simulates PDF draw order: later drawings cover earlier ones.
    White elements reset/cover previous backgrounds.
    Dark elements (overlays, stamps) are skipped.
    
    Returns:
        RGB tuple of background color, or None if no suitable background found
    """
    if not graphic_elements:
        return None
    
    last_bg = None
    
    for graphic in graphic_elements:
        if graphic.fill and graphic.element_type == 'rect':
            if graphic.y <= y_topdown <= (graphic.y + graphic.height):
                avg = (graphic.color[0] + graphic.color[1] + graphic.color[2]) / 3
                if avg < 0.5:
                    continue  # Skip dark overlays/stamps
                if avg > 0.98:
                    last_bg = None  # White element covers/resets previous BG
                    continue
                last_bg = graphic.color
    
    return last_bg


def _rebuild_page_with_metadata(
    c: canvas.Canvas,
    structure: PageStructure,
    cleaned_text: str,
    analysis: Dict[str, Any] = None
):
    """
    Rebuild a page using original styling from text_elements and graphic_elements.
    
    All text_elements and graphic_elements use top-down Y coordinates (from fitz).
    ReportLab uses bottom-up Y. Conversion: reportlab_y = page_height - fitz_y
    """
    try:
        from reportlab.lib.colors import Color
        
        page_h = structure.height
        margin = 50
        
        lines = cleaned_text.split('\n')
        
        # Match cleaned lines to original text elements (now with correct per-line Y)
        line_to_element = _match_text_to_elements(lines, structure.text_elements)
        
        # Detect headers
        def is_header_line(line):
            return line.endswith('?') and len(line) < 100
        
        # Step 1: Draw backgrounds for matched headers at their original positions
        for line_idx, line in enumerate(lines):
            line = line.strip()
            if not is_header_line(line):
                continue
            matched = line_to_element.get(line_idx)
            if not matched:
                continue
            
            # Find background that overlaps this header's Y
            bg_color = _find_background_for_y(matched.y, structure.graphic_elements)
            if bg_color:
                # Convert top-down to bottom-up for ReportLab
                bg_y_topdown = matched.y - 5  # Slight offset above text
                bg_height = matched.font_size * 2
                rl_y = page_h - bg_y_topdown - bg_height
                
                c.setFillColor(Color(*bg_color))
                c.rect(0, rl_y, structure.width, bg_height, fill=1, stroke=0)
                print(f"[PDF_REBUILD] Drew background for '{line[:25]}' at topdown_y={matched.y:.1f}, color={bg_color}")
            else:
                # Default gray background
                bg_height = matched.font_size * 2
                rl_y = page_h - matched.y - bg_height + 5
                c.setFillColor(Color(0.94, 0.94, 0.94))
                c.rect(0, rl_y, structure.width, bg_height, fill=1, stroke=0)
                print(f"[PDF_REBUILD] Drew default background for '{line[:25]}' at topdown_y={matched.y:.1f}")
        
        # Step 2: Draw text - use original positions for matched, sequential for unmatched
        # Track the current sequential Y for unmatched lines
        seq_y = page_h - margin  # Sequential Y in bottom-up (starts near top)
        
        print(f"[PDF_REBUILD] Drawing {len(lines)} lines ({len(line_to_element)} matched)")
        
        for line_idx, line in enumerate(lines):
            line = line.strip()
            if not line:
                seq_y -= 7  # Paragraph break
                continue
            
            # Skip scan artifacts
            if "SCANNED" in line and len(line) < 20:
                continue
            
            matched = line_to_element.get(line_idx)
            
            if is_header_line(line):
                if matched:
                    font_name = _map_font_name(matched.font_name)
                    font_size = matched.font_size if matched.font_size > 0 else 16
                    text_color = matched.color
                    # Use original position (convert top-down to bottom-up)
                    draw_y = page_h - matched.y - font_size
                else:
                    font_name = "Helvetica-Bold"
                    font_size = 16
                    text_color = (0, 0, 0)
                    draw_y = seq_y
                
                c.setFont(font_name, font_size)
                c.setFillColor(Color(*text_color))
                c.drawString(margin, draw_y, line)
                
                # Always update sequential Y to just below this header's position
                # This ensures body text starts from the right spot
                seq_y = draw_y - font_size * 1.5 - 5
                print(f"[PDF_REBUILD] Header '{line[:30]}' at rl_y={draw_y:.1f} font={font_name} size={font_size:.0f}, seq_y->{seq_y:.1f}")
            
            else:
                # Body text
                if matched:
                    font_name = _map_font_name(matched.font_name)
                    font_size = matched.font_size if matched.font_size > 0 else 11
                    text_color = matched.color
                else:
                    font_name = "Times-Roman"
                    font_size = 11
                    text_color = (0, 0, 0)
                
                if seq_y < margin:
                    break
                
                c.setFont(font_name, font_size)
                c.setFillColor(Color(*text_color))
                
                line_height = font_size * 1.3
                
                # Word wrapping
                words = line.split()
                current_line = ""
                
                for word in words:
                    test_line = current_line + " " + word if current_line else word
                    text_width = c.stringWidth(test_line, font_name, font_size)
                    
                    if text_width <= (structure.width - 2 * margin):
                        current_line = test_line
                    else:
                        if current_line and seq_y >= margin:
                            c.drawString(margin, seq_y, current_line)
                            seq_y -= line_height
                        current_line = word
                
                if current_line and seq_y >= margin:
                    c.drawString(margin, seq_y, current_line)
                    seq_y -= line_height
        
        print(f"[PDF_REBUILD] Completed layout with original styling")
        
    except Exception as e:
        logger.error(f"Page rebuild with metadata failed: {e}", exc_info=True)
        _rebuild_page(c, structure, cleaned_text)


def _map_font_name(pdf_font_name: str) -> str:
    """Map PDF font names to reportlab font names."""
    # Remove prefix if present
    font = pdf_font_name.lstrip("/")
    
    # Map common PDF fonts to reportlab fonts
    font_map = {
        "Helvetica": "Helvetica",
        "Helvetica-Bold": "Helvetica-Bold",
        "Helvetica-Oblique": "Helvetica-Oblique",
        "Helvetica-BoldOblique": "Helvetica-BoldOblique",
        "Times-Roman": "Times-Roman",
        "Times-Bold": "Times-Bold",
        "Times-Italic": "Times-Italic",
        "Times-BoldItalic": "Times-BoldItalic",
        "TimesNewRoman": "Times-Roman",
        "TimesNewRomanPS": "Times-Roman",
        "TimesNewRomanPSMT": "Times-Roman",
        "TimesNewRoman-Bold": "Times-Bold",
        "TimesNewRomanPS-Bold": "Times-Bold",
        "TimesNewRomanPS-BoldMT": "Times-Bold",
        "TimesNewRoman-Italic": "Times-Italic",
        "TimesNewRomanPS-Italic": "Times-Italic",
        "TimesNewRomanPS-ItalicMT": "Times-Italic",
        "TimesNewRoman-BoldItalic": "Times-BoldItalic",
        "TimesNewRomanPS-BoldItalic": "Times-BoldItalic",
        "TimesNewRomanPS-BoldItalicMT": "Times-BoldItalic",
        "Courier": "Courier",
        "Courier-Bold": "Courier-Bold",
        "Courier-Oblique": "Courier-Oblique",
        "Courier-BoldOblique": "Courier-BoldOblique",
    }
    
    # Try exact match first
    if font in font_map:
        return font_map[font]
    
    # Try partial matching for Times fonts
    if "Times" in font:
        if "Bold" in font and "Italic" in font:
            return "Times-BoldItalic"
        elif "Bold" in font:
            return "Times-Bold"
        elif "Italic" in font:
            return "Times-Italic"
        else:
            return "Times-Roman"
    
    # Try partial matching for other fonts
    if "Bold" in font and "Italic" in font:
        return "Helvetica-BoldOblique"
    elif "Bold" in font:
        return "Helvetica-Bold"
    elif "Italic" in font or "Oblique" in font:
        return "Helvetica-Oblique"
    
    return "Helvetica"


def _rebuild_page(c: canvas.Canvas, structure: PageStructure, cleaned_text: str):
    """
    Legacy rebuild function (fallback).
    """
    try:
        _draw_graphic_elements(c, structure)
        c.setFont("Helvetica", 12)
        c.setFillColor(black)
        
        if structure.text_elements and len(structure.text_elements) > 0:
            _rebuild_with_positions(c, structure, cleaned_text)
        else:
            _rebuild_simple(c, structure, cleaned_text)
            
    except Exception as e:
        logger.error(f"Page rebuild failed: {e}")
        _rebuild_simple(c, structure, cleaned_text)


def _merge_backgrounds(backgrounds: List[GraphicElement]) -> List[GraphicElement]:
    """
    Merge and filter backgrounds to create clean header regions.
    Returns list of merged background elements.
    """
    # Sort by Y position (top to bottom)
    sorted_bgs = sorted(backgrounds, key=lambda g: g.y + g.height, reverse=True)
    
    # Filter out very small decorative bands (< 8pt height)
    significant = [bg for bg in sorted_bgs if bg.height >= 8]
    print(f"[PDF_REBUILD] Filtered {len(sorted_bgs)} → {len(significant)} significant backgrounds")
    
    # Merge backgrounds that are VERY close (within 12pt)
    merged = []
    i = 0
    while i < len(significant):
        current = significant[i]
        group_top = current.y + current.height
        group_bottom = current.y
        
        j = i + 1
        while j < len(significant):
            next_bg = significant[j]
            next_top = next_bg.y + next_bg.height
            
            # Only merge if gap is < 12pt (very close)
            if group_bottom - next_top < 12:
                group_bottom = min(group_bottom, next_bg.y)
                j += 1
            else:
                break
        
        # Create merged background
        merged_bg = GraphicElement(
            element_type='rect',
            x=0,
            y=group_bottom,
            width=current.width,
            height=group_top - group_bottom,
            color=current.color,
            fill=True
        )
        merged.append(merged_bg)
        i = j
    
    print(f"[PDF_REBUILD] Merged into {len(merged)} background regions")
    return merged


def _rebuild_with_positions(c: canvas.Canvas, structure: PageStructure, cleaned_text: str):
    """
    Rebuild page using original text element positions.
    """
    # For now, use the first text element's position as a starting point
    # In a more advanced implementation, we would map cleaned text back to elements
    
    if not structure.text_elements:
        _rebuild_simple(c, structure, cleaned_text)
        return
    
    # Get the first element's properties
    first_elem = structure.text_elements[0]
    
    # Use cleaned text but preserve approximate positioning
    start_x = first_elem.x
    start_y = first_elem.y
    font_size = first_elem.font_size
    
    # Set font
    try:
        c.setFont(first_elem.font_name, font_size)
    except:
        c.setFont("Helvetica", font_size)
    
    # Draw text with line wrapping
    _draw_wrapped_text(c, cleaned_text, start_x, start_y, structure.width - 100, font_size)


def _rebuild_with_flow(c: canvas.Canvas, structure: PageStructure, cleaned_text: str):
    """
    Rebuild page with text flowing in standard layout, aligning with backgrounds.
    """
    margin = 50
    font_size = 11
    line_height = font_size * 1.4
    header_font_size = 12
    
    c.setFont("Helvetica", font_size)
    
    # If we have graphic elements (backgrounds), try to align text sections with them
    if structure.graphic_elements and len(structure.graphic_elements) > 0:
        # Use the already-merged backgrounds from the structure
        sorted_backgrounds = sorted(structure.graphic_elements, 
                                   key=lambda g: g.y + g.height, reverse=True)
        
        # Look for common header patterns in the text
        import re
        header_patterns = [
            r'^(What|Why|Where|How|When)\s+.{10,}?\?',  # Questions
            r'^[A-Z][^.!?]*[A-Z][^.!?]*$',  # All caps or title case without punctuation
        ]
        
        # Split text into lines and identify potential headers
        lines = cleaned_text.split('\n')
        header_indices = []
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            if len(line_stripped) > 10 and len(line_stripped) < 100:
                for pattern in header_patterns:
                    if re.match(pattern, line_stripped, re.IGNORECASE):
                        header_indices.append(i)
                        break
        
        print(f"[PDF_REBUILD] Found {len(header_indices)} potential headers")
        print(f"[PDF_REBUILD] Found {len(sorted_backgrounds)} backgrounds")
        
        # Draw text, aligning headers with backgrounds
        current_y = structure.height - margin
        line_idx = 0
        bg_idx = 0
        
        print(f"[PDF_REBUILD] Starting text placement: {len(lines)} lines")
        
        while line_idx < len(lines):
            line = lines[line_idx]
            
            # Check if this is a header line
            if line_idx in header_indices and bg_idx < len(sorted_backgrounds):
                # Position at the corresponding background
                bg = sorted_backgrounds[bg_idx]
                current_y = bg.y + bg.height - 6  # Position text in middle of background
                
                print(f"[PDF_REBUILD] Header {bg_idx+1} at line {line_idx}: '{line[:50]}' → y={current_y:.1f}")
                
                # Draw header in bold
                c.setFont("Helvetica-Bold", header_font_size)
                c.setFillColor(black)
                c.drawString(margin, current_y, line.strip())
                current_y -= line_height * 1.2
                
                bg_idx += 1
                c.setFont("Helvetica", font_size)
            elif line.strip():
                # Regular text - word wrap it
                if current_y < 50:
                    break
                c.setFillColor(black)
                
                # Simple word wrap for this line
                words = line.split()
                current_line = ""
                for word in words:
                    test_line = current_line + " " + word if current_line else word
                    text_width = c.stringWidth(test_line, c._fontname, font_size)
                    
                    if text_width <= (structure.width - 2 * margin):
                        current_line = test_line
                    else:
                        if current_line:
                            c.drawString(margin, current_y, current_line)
                            current_y -= line_height
                        current_line = word
                
                if current_line:
                    c.drawString(margin, current_y, current_line)
                    current_y -= line_height
            else:
                # Blank line
                current_y -= line_height * 0.5
            
            line_idx += 1
    else:
        # No backgrounds, standard flow
        top_margin = structure.height - 50
        _draw_wrapped_text(
            c, cleaned_text, 
            margin, top_margin,
            structure.width - (2 * margin),
            font_size, line_height
        )


def _rebuild_simple(c: canvas.Canvas, structure: PageStructure, cleaned_text: str):
    """
    Simple fallback: place text in standard layout.
    """
    margin = 50
    y = structure.height - margin
    font_size = 11
    line_height = font_size * 1.4
    
    c.setFont("Helvetica", font_size)
    
    lines = cleaned_text.split('\n')
    for line in lines:
        if y < margin:
            break  # Out of space
        
        # Simple line without wrapping
        c.drawString(margin, y, line[:100])  # Truncate if too long
        y -= line_height


def _draw_graphic_elements(c: canvas.Canvas, structure: PageStructure):
    """
    Draw background graphic elements (rectangles, shapes) on the canvas.
    
    Args:
        c: Canvas to draw on
        structure: Page structure containing graphic elements
    """
    try:
        print(f"[PDF_REBUILD] Drawing {len(structure.graphic_elements)} graphic elements")
        
        for i, element in enumerate(structure.graphic_elements):
            if element.element_type == 'rect':
                # Convert color from 0-1 range to reportlab format
                r, g, b = element.color
                print(f"[PDF_REBUILD] Drawing rect {i+1}: pos=({element.x}, {element.y}) size=({element.width}x{element.height}) color=({r}, {g}, {b}) fill={element.fill}")
                
                # Set fill color
                from reportlab.lib.colors import Color
                fill_color = Color(r, g, b)
                c.setFillColor(fill_color)
                
                # Draw filled rectangle
                if element.fill:
                    c.rect(element.x, element.y, element.width, element.height, 
                          fill=1, stroke=0)
                else:
                    c.rect(element.x, element.y, element.width, element.height, 
                          fill=0, stroke=1)
        
        print(f"[PDF_REBUILD] Successfully drew {len(structure.graphic_elements)} graphic elements")
        logger.info(f"Drew {len(structure.graphic_elements)} graphic elements")
        
    except Exception as e:
        print(f"[PDF_REBUILD] ERROR drawing graphics: {e}")
        logger.warning(f"Failed to draw graphic elements: {e}")


def _draw_wrapped_text(
    c: canvas.Canvas, 
    text: str, 
    x: float, 
    y: float, 
    max_width: float,
    font_size: float,
    line_height: float = None
):
    """
    Draw text with word wrapping.
    
    Args:
        c: Canvas to draw on
        text: Text to draw
        x: X position
        y: Y position (top)
        max_width: Maximum width for wrapping
        font_size: Font size
        line_height: Line height (default: font_size * 1.4)
    """
    if line_height is None:
        line_height = font_size * 1.4
    
    # Split into paragraphs
    paragraphs = text.split('\n\n')
    
    current_y = y
    
    for para in paragraphs:
        if not para.strip():
            current_y -= line_height  # Blank line
            continue
        
        # Word wrap this paragraph
        words = para.split()
        current_line = ""
        
        for word in words:
            test_line = current_line + " " + word if current_line else word
            
            # Check width
            text_width = c.stringWidth(test_line, c._fontname, font_size)
            
            if text_width <= max_width:
                current_line = test_line
            else:
                # Draw current line and start new one
                if current_line:
                    c.drawString(x, current_y, current_line)
                    current_y -= line_height
                current_line = word
        
        # Draw remaining text
        if current_line:
            c.drawString(x, current_y, current_line)
            current_y -= line_height
        
        # Paragraph break
        current_y -= line_height * 0.5
        
        # Check if we're running out of space
        if current_y < 50:
            break
