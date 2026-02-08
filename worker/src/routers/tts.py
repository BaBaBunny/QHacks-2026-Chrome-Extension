from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from ..services.gradium_tts import synthesize
from ..utils.audio import wav_to_mp3

router = APIRouter()


class TTSRequest(BaseModel):
    text: str
    voice_id: str | None = None
    language: str = "en"
    format: str = "mp3"


@router.post("")
async def tts_endpoint(req: TTSRequest):
    try:
        wav_bytes = await synthesize(req.text, req.voice_id, req.language)

        if req.format == "mp3":
            audio_bytes = wav_to_mp3(wav_bytes)
            media_type = "audio/mpeg"
        else:
            audio_bytes = wav_bytes
            media_type = "audio/wav"

        return Response(content=audio_bytes, media_type=media_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
