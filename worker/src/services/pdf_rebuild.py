"""
PDF reconstruction service using reportlab.
Rebuilds PDFs with preserved layout by drawing each original text element
at its exact position with its original styling.
"""
import logging
from typing import List, Dict, Any
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color
from io import BytesIO

from .pdf_structure import PageStructure

logger = logging.getLogger(__name__)


def rebuild_pdf(
    structures: List[PageStructure],
    cleaned_texts: List[str] = None,
    gemini_analyses: List[Dict[str, Any]] = None,
    output_path: str = None
) -> bytes:
    """
    Rebuild a PDF by drawing each original text element at its exact position.
    
    Args:
        structures: List of page structures from original PDF
        cleaned_texts: Unused (kept for backward compatibility)
        gemini_analyses: Unused (kept for backward compatibility)
        output_path: Optional path to save PDF (if None, returns bytes)
        
    Returns:
        PDF as bytes
    """
    try:
        buffer = BytesIO()
        
        if structures and len(structures) > 0:
            page_size = (structures[0].width, structures[0].height)
        else:
            page_size = letter
        
        c = canvas.Canvas(buffer if not output_path else output_path, pagesize=page_size)
        
        for i, structure in enumerate(structures):
            logger.info(f"Rebuilding page {i + 1}/{len(structures)}")
            c.setPageSize((structure.width, structure.height))
            _rebuild_page_with_metadata(c, structure)
            
            if i < len(structures) - 1:
                c.showPage()
        
        c.save()
        
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


def _rebuild_page_with_metadata(
    c: canvas.Canvas,
    structure: PageStructure,
):
    """
    Rebuild a page by drawing each original text element at its exact position
    with its original font, size, and color. No matching or text cleaning needed.
    
    Coordinates: text_elements use fitz top-down Y (0 = page top).
    ReportLab uses bottom-up Y (0 = page bottom).
    Conversion: rl_y = page_height - fitz_y - font_size
    """
    try:
        page_h = structure.height

        # Filter out text elements that are hidden under dark/opaque rectangles
        dark_rects = [
            g for g in structure.graphic_elements
            if g.element_type == 'rect' and g.fill
            and (g.color[0] + g.color[1] + g.color[2]) / 3 < 0.4  # dark fill
            and g.width > 10 and g.height > 5
        ]

        elements = []
        for elem in structure.text_elements:
            hidden = False
            for rect in dark_rects:
                # Check if text bbox center is inside the dark rectangle
                text_cx = elem.x + 10  # approximate center-x
                text_cy = elem.y + (elem.font_size or 12) / 2
                if (rect.x <= text_cx <= rect.x + rect.width and
                    rect.y <= text_cy <= rect.y + rect.height):
                    hidden = True
                    print(f"[PDF_REBUILD] Filtered hidden text: '{elem.text[:40]}' (under dark rect at {rect.x:.0f},{rect.y:.0f})")
                    break
            if not hidden:
                elements.append(elem)

        # Sort elements top-to-bottom (ascending fitz Y = top of page first)
        elements = sorted(elements, key=lambda e: (e.y, e.x))

        print(f"[PDF_REBUILD] Drawing {len(elements)} text elements (filtered {len(structure.text_elements) - len(elements)} hidden)")

        # Track previous element's baseline to detect and fix overlaps.
        # Using factor 1.0 (exact font_size) as min gap to prevent cascade:
        # with typical 1.4-1.5x line spacing, the cascade dies out in 1-2 elements.
        prev_rl_y = page_h + 100  # Above page top (no constraint for first element)

        for elem in elements:
            font_name = _map_font_name(elem.font_name)
            font_size = elem.font_size if elem.font_size > 0 else 11

            # Desired position from original fitz coordinates
            desired_rl_y = page_h - elem.y - font_size

            # Enforce minimum spacing: baselines must be at least font_size apart
            min_allowed_rl_y = prev_rl_y - font_size
            rl_y = min(desired_rl_y, min_allowed_rl_y)

            if rl_y != desired_rl_y:
                print(f"[PDF_REBUILD] Overlap fix: '{elem.text[:30]}' shifted {desired_rl_y:.1f} -> {rl_y:.1f}")

            # Skip elements pushed below bottom margin (don't break — keep processing)
            if rl_y < 30:
                print(f"[PDF_REBUILD] Skipped off-page: '{elem.text[:30]}' at rl_y={rl_y:.1f}")
                continue

            c.setFont(font_name, font_size)
            c.setFillColor(Color(*elem.color))
            c.drawString(elem.x, rl_y, elem.text)

            prev_rl_y = rl_y

        print(f"[PDF_REBUILD] Completed element-based layout")
        
    except Exception as e:
        logger.error(f"Page rebuild failed: {e}", exc_info=True)


def _map_font_name(pdf_font_name: str) -> str:
    """Map PDF font names to reportlab font names."""
    font = pdf_font_name.lstrip("/")
    
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
    
    if font in font_map:
        return font_map[font]
    
    if "Times" in font:
        if "Bold" in font and "Italic" in font:
            return "Times-BoldItalic"
        elif "Bold" in font:
            return "Times-Bold"
        elif "Italic" in font:
            return "Times-Italic"
        else:
            return "Times-Roman"
    
    if "Bold" in font and "Italic" in font:
        return "Helvetica-BoldOblique"
    elif "Bold" in font:
        return "Helvetica-Bold"
    elif "Italic" in font or "Oblique" in font:
        return "Helvetica-Oblique"
    
    return "Helvetica"
