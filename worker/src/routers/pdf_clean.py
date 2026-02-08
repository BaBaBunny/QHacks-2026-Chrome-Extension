"""
PDF cleaning router.
Handles PDF upload, structure extraction, AI-powered cleaning, and reconstruction.
"""
import os
import tempfile
import base64
import logging
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

from ..services.pdf_structure import extract_pdf_structure
from ..services.pdf_gemini import analyze_layout_with_metadata, clean_and_improve_text
from ..services.pdf_rebuild import rebuild_pdf

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/clean")
async def clean_pdf_endpoint(pdf: UploadFile = File(...)):
    """
    Clean a PDF while preserving its layout structure.
    
    Args:
        pdf: Uploaded PDF file
        
    Returns:
        JSON with base64-encoded cleaned PDF, extracted text, and metadata
    """
    temp_input = None
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_input:
            content = await pdf.read()
            temp_input.write(content)
            temp_input_path = temp_input.name
        
        print(f"[PDF_CLEAN] Processing PDF: {pdf.filename}, size: {len(content)} bytes")
        logger.info(f"Processing PDF: {pdf.filename}, size: {len(content)} bytes")
        
        # Step 1: Extract structure
        print("[PDF_CLEAN] Extracting PDF structure...")
        structures = extract_pdf_structure(temp_input_path)
        page_count = len(structures)
        print(f"[PDF_CLEAN] Extracted {page_count} pages")
        logger.info(f"Extracted {page_count} pages")
        
        if page_count == 0:
            raise HTTPException(status_code=400, detail="No pages found in PDF")
        
        # Step 2: Analyze layout with metadata and clean text with Gemini
        logger.info("Analyzing layout with metadata and cleaning text...")
        cleaned_pages = []
        all_text = []
        gemini_analyses = []
        
        for i, structure in enumerate(structures):
            print(f"[PDF_CLEAN] Processing page {i + 1}/{page_count}")
            print(f"[PDF_CLEAN] Page has {len(structure.text_elements)} text elements, {len(structure.graphic_elements)} graphic elements")
            
            # Analyze layout using actual font/position metadata
            layout_analysis = analyze_layout_with_metadata(structure)
            gemini_analyses.append(layout_analysis)
            
            print(f"[PDF_CLEAN] Found {len(layout_analysis.get('header_mappings', []))} header mappings")
            
            # Clean the text
            cleaned_text = clean_and_improve_text(
                structure.raw_text,
                context="body"
            )
            
            cleaned_pages.append(cleaned_text)
            all_text.append(cleaned_text)
            
            logger.info(f"Page {i + 1}: cleaned {len(structure.raw_text)} -> {len(cleaned_text)} chars")
        
        # Step 3: Rebuild PDF with cleaned content and metadata
        logger.info("Rebuilding PDF with metadata-based layout...")
        pdf_bytes = rebuild_pdf(structures, cleaned_pages, gemini_analyses)
        logger.info(f"Rebuilt PDF: {len(pdf_bytes)} bytes")
        
        # Step 4: Encode and return
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
        extracted_text = "\n\n--- Page Break ---\n\n".join(all_text)
        
        return JSONResponse({
            "pdf": pdf_base64,
            "text": extracted_text,
            "pageCount": page_count,
            "success": True
        })
        
    except Exception as e:
        logger.error(f"PDF cleaning failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF cleaning failed: {str(e)}")
        
    finally:
        # Cleanup temp file
        if temp_input and os.path.exists(temp_input_path):
            try:
                os.unlink(temp_input_path)
            except Exception as e:
                logger.warning(f"Failed to delete temp file: {e}")


@router.get("/health")
async def pdf_health():
    """Health check endpoint for PDF service."""
    return {"status": "ok", "service": "pdf-clean"}
