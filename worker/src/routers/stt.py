from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from ..services.gradium_stt import transcribe

router = APIRouter()


@router.post("")
async def stt_endpoint(
    audio: UploadFile = File(...),
    language: str = Form("en"),
):
    try:
        audio_bytes = await audio.read()
        transcript = await transcribe(audio_bytes, language)
        return {"transcript": transcript}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
