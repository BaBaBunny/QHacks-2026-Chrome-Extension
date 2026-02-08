"""
Gemini AI integration for PDF layout analysis and text cleaning.
"""
import os
import logging
import json
from typing import Dict, List, Any, Optional
import google.generativeai as genai
from .pdf_structure import PageStructure, TextElement, GraphicElement

logger = logging.getLogger(__name__)

# Initialize Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not found in environment")
else:
    genai.configure(api_key=GEMINI_API_KEY)

MODEL_NAME = "gemini-2.0-flash"


def _format_text_elements_for_gemini(elements: List[TextElement], max_elements: int = 50) -> str:
    """Format text elements with metadata for Gemini analysis."""
    lines = []
    for i, elem in enumerate(elements[:max_elements]):
        is_bold = "Bold" in elem.font_name or "bold" in elem.font_name.lower()
        is_italic = "Italic" in elem.font_name or "italic" in elem.font_name.lower()
        style = []
        if is_bold:
            style.append("BOLD")
        if is_italic:
            style.append("ITALIC")
        style_str = f" [{', '.join(style)}]" if style else ""
        
        lines.append(f"[{i}] '{elem.text[:50]}' | font={elem.font_name} size={elem.font_size:.1f}pt pos=({elem.x:.0f},{elem.y:.0f}){style_str}")
    
    if len(elements) > max_elements:
        lines.append(f"... and {len(elements) - max_elements} more elements")
    
    return "\n".join(lines)


def _format_graphics_for_gemini(elements: List[GraphicElement]) -> str:
    """Format graphic elements for Gemini analysis."""
    lines = []
    for i, elem in enumerate(elements):
        r, g, b = elem.color
        is_gray = abs(r - g) < 0.1 and abs(g - b) < 0.1 and r < 0.95
        color_desc = f"gray({r:.2f})" if is_gray else f"rgb({r:.2f},{g:.2f},{b:.2f})"
        lines.append(f"[{i}] {elem.element_type} at ({elem.x:.0f},{elem.y:.0f}) size=({elem.width:.0f}x{elem.height:.0f}) color={color_desc}")
    
    return "\n".join(lines) if lines else "No graphic elements"


def analyze_layout_with_metadata(page_structure: PageStructure) -> Dict[str, Any]:
    """
    Analyze PDF layout using actual font and position metadata.
    Identifies headers by font properties (bold, size) and matches them to backgrounds.
    
    Args:
        page_structure: Structure with text elements and graphic elements
        
    Returns:
        Dictionary with element indices: {
            "header_mappings": [{"text_idx": 0, "graphic_idx": 1}, ...],
            "body_indices": [3, 4, 5, ...],
            "cleaned_text": "..."
        }
    """
    try:
        if not GEMINI_API_KEY:
            logger.warning("Skipping layout analysis - no API key")
            return {
                "header_mappings": [],
                "body_indices": list(range(len(page_structure.text_elements))),
                "cleaned_text": page_structure.raw_text
            }
        
        if not page_structure.text_elements:
            logger.warning("No text elements to analyze")
            return {
                "header_mappings": [],
                "body_indices": [],
                "cleaned_text": page_structure.raw_text
            }
        
        model = genai.GenerativeModel(MODEL_NAME)
        
        # Format elements for analysis
        text_info = _format_text_elements_for_gemini(page_structure.text_elements)
        graphics_info = _format_graphics_for_gemini(page_structure.graphic_elements)
        
        prompt = f"""Analyze this PDF page structure and identify document sections using actual font and position metadata.

TEXT ELEMENTS (with font, size, position):
{text_info}

BACKGROUND GRAPHICS (rectangles, typically gray for headers):
{graphics_info}

TASK:
1. Identify HEADERS: Look for text elements with:
   - Larger font size (typically >11pt)
   - Bold font (font name contains "Bold")
   - Question format or title-case
2. Match each header to its background graphic by Y position proximity (within 50 units)
3. Identify body text elements (non-headers)

Return ONLY valid JSON (no markdown, no explanation):
{{
  "header_mappings": [
    {{"text_idx": 0, "graphic_idx": 1, "reason": "bold, large font, has gray bg"}}
  ],
  "body_indices": [3, 4, 5],
  "footers": []
}}"""

        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Extract JSON from response (handle markdown code blocks)
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
        
        try:
            result = json.loads(response_text)
            logger.info(f"Layout analysis: {len(result.get('header_mappings', []))} headers identified")
            return result
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini JSON response: {e}")
            logger.debug(f"Response was: {response_text[:500]}")
            # Fallback: return all as body
            return {
                "header_mappings": [],
                "body_indices": list(range(len(page_structure.text_elements))),
                "footers": []
            }
        
    except Exception as e:
        logger.error(f"Layout analysis with metadata failed: {e}", exc_info=True)
        return {
            "header_mappings": [],
            "body_indices": list(range(len(page_structure.text_elements))),
            "footers": []
        }


def analyze_layout_structure(page_structure: PageStructure) -> Dict[str, Any]:
    """
    Use Gemini to analyze the layout structure of a PDF page.
    Identifies headers, body text, footers, and document structure.
    
    Args:
        page_structure: Structure of a page to analyze
        
    Returns:
        Dictionary with layout analysis results
    """
    try:
        if not GEMINI_API_KEY:
            logger.warning("Skipping layout analysis - no API key")
            return {
                "sections": [],
                "headers": [],
                "body": page_structure.raw_text,
                "footers": []
            }
        
        model = genai.GenerativeModel(MODEL_NAME)
        
        prompt = f"""Analyze this text extracted from a PDF page and identify its structure.

Text:
{page_structure.raw_text}

Please identify and categorize:
1. **Headers** - Any title, heading, or section header text
2. **Body** - Main content paragraphs
3. **Footers** - Page numbers, copyright, or footer information
4. **Problematic areas** - Any garbled text, artifacts, or overlapping content

Return your analysis in this format:
Headers: [list each header on a new line]
Body: [indicate start of main content]
Footers: [list footer elements]
Problems: [list any issues found]"""

        response = model.generate_content(prompt)
        analysis_text = response.text
        
        # Parse the response
        result = {
            "sections": [],
            "headers": [],
            "body": page_structure.raw_text,
            "footers": [],
            "problems": []
        }
        
        # Simple parsing of Gemini's response
        lines = analysis_text.split('\n')
        current_section = None
        
        for line in lines:
            line = line.strip()
            if line.startswith("Headers:"):
                current_section = "headers"
            elif line.startswith("Body:"):
                current_section = "body"
            elif line.startswith("Footers:"):
                current_section = "footers"
            elif line.startswith("Problems:"):
                current_section = "problems"
            elif line and current_section:
                if current_section == "headers":
                    result["headers"].append(line.lstrip("- "))
                elif current_section == "footers":
                    result["footers"].append(line.lstrip("- "))
                elif current_section == "problems":
                    result["problems"].append(line.lstrip("- "))
        
        logger.info(f"Layout analysis found {len(result['headers'])} headers, {len(result['problems'])} problems")
        return result
        
    except Exception as e:
        logger.error(f"Layout analysis failed: {e}")
        # Return basic structure
        return {
            "sections": [],
            "headers": [],
            "body": page_structure.raw_text,
            "footers": [],
            "problems": []
        }


def clean_and_improve_text(text: str, context: str = "body") -> str:
    """
    Use Gemini to clean and improve extracted text.
    Fixes OCR errors, removes artifacts, improves formatting.
    
    Args:
        text: Text to clean
        context: Context hint (header, body, footer)
        
    Returns:
        Cleaned text
    """
    try:
        if not GEMINI_API_KEY:
            logger.warning("Skipping text cleaning - no API key")
            return text
        
        if not text or len(text.strip()) < 5:
            return text
        
        model = genai.GenerativeModel(MODEL_NAME)
        
        prompt = f"""You are a text cleaner. Your job is to fix OCR errors while preserving ALL original text.

INPUT TEXT:
{text}

INSTRUCTIONS:
- Fix spelling/OCR errors only
- Remove duplicate lines if they appear twice in a row
- Keep ALL lines including titles, headers, body text, and footers
- Preserve paragraph breaks
- Output ONLY the cleaned text - no explanations, no labels, no commentary

OUTPUT (cleaned text only):"""

        response = model.generate_content(prompt)
        cleaned = response.text.strip()
        
        logger.info(f"Cleaned text: {len(text)} -> {len(cleaned)} chars")
        return cleaned
        
    except Exception as e:
        logger.error(f"Text cleaning failed: {e}")
        return text


def batch_clean_pages(pages_text: List[str]) -> List[str]:
    """
    Clean multiple pages of text in batch for efficiency.
    
    Args:
        pages_text: List of text content from each page
        
    Returns:
        List of cleaned text for each page
    """
    cleaned_pages = []
    
    for i, text in enumerate(pages_text):
        logger.info(f"Cleaning page {i + 1}/{len(pages_text)}")
        cleaned = clean_and_improve_text(text, context="body")
        cleaned_pages.append(cleaned)
    
    return cleaned_pages
