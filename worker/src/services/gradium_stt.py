import io
import os
import tempfile

import numpy as np
import sphn
import gradium
from pydub import AudioSegment


GRADIUM_API_KEY = os.environ.get("GRADIUM_API_KEY", "")
GRADIUM_BASE_URL = os.environ.get("GRADIUM_BASE_URL", "https://us.api.gradium.ai/api")


async def transcribe(audio_bytes: bytes, language: str = "en") -> str:
    """Transcribe audio bytes (PCM WAV 24kHz) to text via Gradium STT."""
    # If audio is not WAV, try converting it with pydub (requires ffmpeg)
    if not (audio_bytes[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE"):
        try:
            audio = AudioSegment.from_file(io.BytesIO(audio_bytes))
            audio = audio.set_frame_rate(24000).set_channels(1).set_sample_width(2)
            wav_buffer = io.BytesIO()
            audio.export(wav_buffer, format="wav")
            audio_bytes = wav_buffer.getvalue()
        except Exception as e:
            raise RuntimeError(
                "Unsupported audio codec. Install ffmpeg or enable server-side WAV conversion."
            ) from e

    # sphn.read expects a file path, so write to a temp file
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        pcm, _ = sphn.read(tmp_path, sample_rate=24000)
        pcm = (pcm[0] * 32768).astype(np.int16)
    finally:
        os.unlink(tmp_path)

    client = gradium.client.GradiumClient(
        base_url=GRADIUM_BASE_URL,
        api_key=GRADIUM_API_KEY,
    )

    setup: dict = {
        "model_name": "default",
        "input_format": "pcm",
    }
    if language != "en":
        setup["json_config"] = {"language": language}

    async def audio_gen(audio: np.ndarray, chunk_size: int = 1920):
        for i in range(0, len(audio), chunk_size):
            yield audio[i : i + chunk_size]

    stream = await client.stt_stream(setup, audio_gen(pcm))

    transcript_parts: list[str] = []
    async for msg in stream._stream:
        if msg.get("type") == "text":
            transcript_parts.append(msg["text"])

    return " ".join(transcript_parts)
