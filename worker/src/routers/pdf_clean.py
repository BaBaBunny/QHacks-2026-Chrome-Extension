"""
PDF cleaning router.
Handles PDF upload, structure extraction, and reconstruction with preserved layout.
"""
import os
import tempfile
import base64
import logging
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

from ..services.pdf_structure import extract_pdf_structure
from ..services.pdf_rebuild import rebuild_pdf

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/clean")
async def clean_pdf_endpoint(pdf: UploadFile = File(...)):
    """
    Clean a PDF while preserving its layout structure.
    
    Extracts text elements with exact positions via fitz, then rebuilds
    the PDF by drawing each element at its original position.
    
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
        
        # Step 1: Extract structure (text elements with positions, fonts, colors)
        print("[PDF_CLEAN] Extracting PDF structure...")
        structures = extract_pdf_structure(temp_input_path)
        page_count = len(structures)
        print(f"[PDF_CLEAN] Extracted {page_count} pages")
        logger.info(f"Extracted {page_count} pages")
        
        if page_count == 0:
            raise HTTPException(status_code=400, detail="No pages found in PDF")
        
        # Collect raw text for the response
        all_text = []
        for i, structure in enumerate(structures):
            print(f"[PDF_CLEAN] Page {i + 1}/{page_count}: {len(structure.text_elements)} text elements")
            all_text.append(structure.raw_text)
        
        # Step 2: Rebuild PDF by drawing each element at its exact original position
        logger.info("Rebuilding PDF with element-based layout...")
        pdf_bytes = rebuild_pdf(structures)
        logger.info(f"Rebuilt PDF: {len(pdf_bytes)} bytes")
        
        # Step 3: Encode and return
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
