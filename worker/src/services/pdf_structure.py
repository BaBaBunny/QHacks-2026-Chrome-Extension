"""
PDF structure extraction service using PyMuPDF (fitz).
Extracts detailed layout information including text positions, fonts, sizes, and colors.
"""
from typing import Dict, List, Any
import logging
import fitz  # PyMuPDF
import os

logger = logging.getLogger(__name__)


class TextElement:
    """Represents a text element with position and styling."""
    def __init__(self, text: str, x: float, y: float, font_name: str = "Unknown", 
                 font_size: float = 12.0, color: tuple = (0, 0, 0)):
        self.text = text
        self.x = x
        self.y = y
        self.font_name = font_name
        self.font_size = font_size
        self.color = color
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "x": self.x,
            "y": self.y,
            "font_name": self.font_name,
            "font_size": self.font_size,
            "color": self.color
        }


class GraphicElement:
    """Represents a graphic element (rectangle, line, etc.)."""
    def __init__(self, element_type: str, x: float, y: float, width: float = 0, 
                 height: float = 0, color: tuple = (0, 0, 0), fill: bool = True):
        self.element_type = element_type  # 'rect', 'line', etc.
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.color = color
        self.fill = fill
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.element_type,
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "color": self.color,
            "fill": self.fill
        }


class PageStructure:
    """Represents the structure of a single PDF page."""
    def __init__(self, page_num: int, width: float, height: float):
        self.page_num = page_num
        self.width = width
        self.height = height
        self.text_elements: List[TextElement] = []
        self.graphic_elements: List[GraphicElement] = []
        self.raw_text = ""
        self.background_color: tuple = (1, 1, 1)  # Default white
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "page_num": self.page_num,
            "width": self.width,
            "height": self.height,
            "text_elements": [el.to_dict() for el in self.text_elements],
            "graphic_elements": [el.to_dict() for el in self.graphic_elements],
            "raw_text": self.raw_text,
            "background_color": self.background_color
        }


def _extract_text_with_fitz(fitz_page) -> List[TextElement]:
    """
    Extract text elements using PyMuPDF (fitz) which provides correct
    per-line Y positions, accurate font sizes, and font names.

    Filters out text that is positioned outside the visible page bounds
    (off-page text used as a PDF obfuscation technique).

    All Y coordinates are top-down (distance from page top).
    """
    text_elements = []

    # Get page bounds for filtering off-page text
    page_rect = fitz_page.rect  # visible page rectangle
    page_w = page_rect.width
    page_h = page_rect.height

    try:
        text_dict = fitz_page.get_text("dict")

        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:  # Only text blocks
                continue

            for line in block.get("lines", []):
                # Combine all spans in a line into one text element
                line_text = ""
                first_span = None

                for span in line.get("spans", []):
                    span_text = span.get("text", "")
                    if not span_text.strip():
                        continue

                    if first_span is None:
                        first_span = span
                    line_text += span_text

                if not line_text.strip() or first_span is None:
                    continue

                # Get position from line bbox (top-down Y)
                bbox = line.get("bbox", block.get("bbox", (0, 0, 0, 0)))
                x = bbox[0]
                y = bbox[1]  # Top-down Y (distance from page top)
                x1 = bbox[2]  # right edge
                y1 = bbox[3]  # bottom edge

                # Filter out off-page text: skip if the text bbox is
                # entirely outside the visible page rectangle
                if x1 < 0 or x > page_w or y1 < 0 or y > page_h:
                    logger.info(f"Filtered off-page text: '{line_text.strip()[:40]}' at ({x:.0f},{y:.0f})-({x1:.0f},{y1:.0f})")
                    continue

                # Extract styling from first span
                font_name = first_span.get("font", "Helvetica")
                font_size = first_span.get("size", 12.0)

                # Extract color (fitz stores as integer: 0=black, 16777215=white)
                color_int = first_span.get("color", 0)
                r = ((color_int >> 16) & 0xFF) / 255.0
                g = ((color_int >> 8) & 0xFF) / 255.0
                b = (color_int & 0xFF) / 255.0
                text_color = (r, g, b)

                # Filter out white/near-white text — invisible on white background
                # and commonly used as a PDF obfuscation technique
                if r > 0.9 and g > 0.9 and b > 0.9:
                    logger.info(f"Filtered white text: '{line_text.strip()[:40]}' color=({r:.2f},{g:.2f},{b:.2f})")
                    continue

                text_elements.append(TextElement(
                    text=line_text.strip(),
                    x=float(x),
                    y=float(y),
                    font_name=font_name,
                    font_size=float(font_size),
                    color=text_color
                ))

        logger.info(f"Extracted {len(text_elements)} text elements via fitz (after filtering)")
    except Exception as e:
        logger.error(f"Failed to extract text with fitz: {e}", exc_info=True)

    return text_elements


def extract_pdf_structure(pdf_path: str) -> List[PageStructure]:
    """
    Extract detailed structure from a PDF file using PyMuPDF (fitz)
    for accurate text positions, fonts, and graphics.
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        List of PageStructure objects, one per page
    """
    try:
        # Use fitz for text/graphics extraction (accurate positions)
        fitz_doc = fitz.open(pdf_path)

        structures = []
        
        for page_num in range(len(fitz_doc)):
            fitz_page = fitz_doc[page_num]
            
            # Get page dimensions
            width = float(fitz_page.mediabox.width)
            height = float(fitz_page.mediabox.height)
            
            page_structure = PageStructure(page_num + 1, width, height)
            
            # Extract text elements with fitz first (accurate Y positions, fonts, sizes)
            # This also filters out off-page text
            try:
                page_structure.text_elements = _extract_text_with_fitz(fitz_page)
                print(f"[PDF_STRUCT] Page {page_num + 1}: Extracted {len(page_structure.text_elements)} text elements via fitz")

                for elem in page_structure.text_elements[:5]:
                    print(f"[PDF_STRUCT]   Text: '{elem.text[:40]}' font={elem.font_name} size={elem.font_size:.1f} y={elem.y:.1f} color={elem.color}")
            except Exception as e:
                logger.error(f"Failed to extract text from page {page_num + 1}: {e}", exc_info=True)

            # Build raw_text from filtered fitz elements (sorted top-to-bottom)
            # This ensures off-page text is excluded from raw_text too
            sorted_elements = sorted(page_structure.text_elements, key=lambda e: (e.y, e.x))
            page_structure.raw_text = "\n".join(el.text for el in sorted_elements)

            # Extract graphic elements using fitz get_drawings()
            try:
                page_structure.graphic_elements = _extract_graphics_with_fitz(fitz_page, width, height)
                print(f"[PDF_STRUCT] Page {page_num + 1}: Extracted {len(page_structure.graphic_elements)} graphic elements via fitz")
                
                for elem in page_structure.graphic_elements[:3]:
                    print(f"[PDF_STRUCT]   Graphic: {elem.element_type} at ({elem.x:.1f}, {elem.y:.1f}) size ({elem.width:.1f}x{elem.height:.1f}) color={elem.color}")
            except Exception as e:
                logger.error(f"Failed to extract graphics from page {page_num + 1}: {e}", exc_info=True)
            
            structures.append(page_structure)
            logger.info(f"Extracted structure from page {page_num + 1}: {len(page_structure.text_elements)} text, {len(page_structure.graphic_elements)} graphics")
        
        fitz_doc.close()
        return structures
        
    except Exception as e:
        logger.error(f"Failed to extract PDF structure: {e}")
        raise


def _extract_graphics_with_fitz(fitz_page, width: float, height: float) -> List[GraphicElement]:
    """
    Extract graphic elements using PyMuPDF's get_drawings() method.
    This provides exact rectangle bounds, fill colors, and opacity values.
    
    All Y coordinates are top-down (distance from page top).
    
    Args:
        fitz_page: PyMuPDF page object
        width: Page width
        height: Page height
        
    Returns:
        List of GraphicElement objects
    """
    graphics = []
    
    try:
        drawings = fitz_page.get_drawings()
        
        for drawing in drawings:
            rect = drawing.get("rect")
            fill = drawing.get("fill")  # RGB tuple or None
            fill_opacity = drawing.get("fill_opacity", 1.0)
            
            if rect is None or fill is None:
                continue
            
            # Skip tiny or full-page rectangles
            w = rect.width
            h = rect.height
            if w < 5 or h < 5:
                continue
            if w >= width - 1 and h >= height - 1:
                # Skip full-page white background
                if fill == (1.0, 1.0, 1.0):
                    continue
            
            # Apply opacity to get effective color
            eff_r = fill[0] * fill_opacity + (1.0 - fill_opacity)
            eff_g = fill[1] * fill_opacity + (1.0 - fill_opacity)
            eff_b = fill[2] * fill_opacity + (1.0 - fill_opacity)
            effective_color = (
                round(eff_r, 4),
                round(eff_g, 4),
                round(eff_b, 4)
            )
            
            # Keep white elements (they can cover/reset previous backgrounds)
            # They'll be handled in _find_background_for_y
            
            # Y coordinates are already top-down from fitz
            graphics.append(GraphicElement(
                element_type='rect',
                x=float(rect.x0),
                y=float(rect.y0),  # Top-down Y
                width=float(w),
                height=float(h),
                color=effective_color,
                fill=True
            ))
            
            logger.debug(f"Found drawing: ({rect.x0:.1f},{rect.y0:.1f}) {w:.1f}x{h:.1f} fill={fill} opacity={fill_opacity:.2f} -> eff={effective_color}")
        
        logger.info(f"Extracted {len(graphics)} graphic elements via fitz get_drawings()")
    except Exception as e:
        logger.error(f"Failed to extract drawings with fitz: {e}", exc_info=True)
    
    return graphics


def identify_problematic_areas(page_structure: PageStructure) -> List[Dict[str, Any]]:
    """
    Identify areas in the page that might need cleaning.
    This is a placeholder for more advanced detection.
    
    Args:
        page_structure: Structure of a page
        
    Returns:
        List of problematic area descriptions
    """
    problems = []
    
    # Simple heuristic: look for very short text fragments that might be artifacts
    for element in page_structure.text_elements:
        if len(element.text.strip()) < 3 and not element.text.strip().isalnum():
            problems.append({
                "type": "artifact",
                "x": element.x,
                "y": element.y,
                "text": element.text
            })
    
    return problems
