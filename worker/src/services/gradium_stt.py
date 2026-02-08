import io
import os
import tempfile
from typing import Any

import numpy as np
import sphn
import gradium
from pydub import AudioSegment


GRADIUM_API_KEY = os.environ.get("GRADIUM_API_KEY", "")
GRADIUM_BASE_URL = os.environ.get("GRADIUM_BASE_URL", "https://us.api.gradium.ai/api")
TARGET_SAMPLE_RATE = 24000


def _ensure_ca_bundle() -> None:
    """Ensure Python has a CA bundle so HTTPS calls verify correctly on local setups."""
    if os.environ.get("SSL_CERT_FILE"):
        return

    try:
        import certifi
    except Exception:
        return

    ca_file = certifi.where()
    os.environ["SSL_CERT_FILE"] = ca_file
    os.environ.setdefault("REQUESTS_CA_BUNDLE", ca_file)


async def transcribe(audio_bytes: bytes, language: str = "en") -> str:
    """Transcribe audio bytes (PCM WAV 24kHz) to text via Gradium STT."""
    _ensure_ca_bundle()

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
        pcm, _ = sphn.read(tmp_path, sample_rate=TARGET_SAMPLE_RATE)
    finally:
        os.unlink(tmp_path)

    # Normalize channel layout to mono robustly; audio libs vary between
    # [channels, samples], [samples, channels], and [samples].
    pcm_array = np.asarray(pcm)
    if pcm_array.ndim == 1:
        mono = pcm_array
    elif pcm_array.ndim == 2:
        looks_channel_first = pcm_array.shape[0] <= 8 and pcm_array.shape[1] > pcm_array.shape[0]
        mono = pcm_array.mean(axis=0 if looks_channel_first else 1)
    else:
        mono = pcm_array.reshape(-1)

    # Remove leading/trailing near-silence (with padding) to focus STT on speech.
    mono = _trim_silence(mono, TARGET_SAMPLE_RATE)
    # Normalize level conservatively to improve recognition of quiet speech.
    mono = _normalize_level(mono)
    mono = np.clip(mono, -1.0, 1.0)
    pcm = (mono * 32767.0).astype(np.int16)

    client = gradium.client.GradiumClient(
        base_url=GRADIUM_BASE_URL,
        api_key=GRADIUM_API_KEY,
    )

    setup: dict = {
        "model_name": "default",
        "input_format": "pcm",
        "json_config": {"language": language or "en"},
    }

    async def audio_gen(audio: np.ndarray, chunk_size: int = 1920):
        for i in range(0, len(audio), chunk_size):
            yield audio[i : i + chunk_size]

    stream = await client.stt_stream(setup, audio_gen(pcm))

    def _extract_text(msg: Any) -> str | None:
        if isinstance(msg, str):
            text = msg.strip()
            return text or None
        if not isinstance(msg, dict):
            return None

        direct = msg.get("text")
        if isinstance(direct, str) and direct.strip():
            return direct.strip()

        for key in ("transcript", "final_text", "partial_text"):
            value = msg.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        payload = msg.get("data")
        if isinstance(payload, dict):
            for key in ("text", "transcript", "final_text", "partial_text"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

        return None

    def _is_final(msg: Any) -> bool:
        if not isinstance(msg, dict):
            return False
        if msg.get("type") in {"final", "segment_final", "final_text"}:
            return True
        for key in ("is_final", "final", "completed", "done"):
            if msg.get(key) is True:
                return True
        payload = msg.get("data")
        if isinstance(payload, dict):
            for key in ("is_final", "final", "completed", "done"):
                if payload.get(key) is True:
                    return True
        return False

    transcript_parts: list[str] = []
    partial_parts: list[str] = []
    latest_final: str | None = None
    latest_partial: str | None = None
    async for msg in stream._stream:
        piece = _extract_text(msg)
        if piece:
            if _is_final(msg):
                transcript_parts.append(piece)
                latest_final = piece
            else:
                partial_parts.append(piece)
                latest_partial = piece

    parts = transcript_parts if transcript_parts else partial_parts

    # Prefer the latest full-text message when available; stream APIs often re-send
    # cumulative text snapshots.
    latest_candidate = latest_final or latest_partial
    if latest_candidate and len(_normalize_text(latest_candidate)) >= len(
        _normalize_text(" ".join(parts))
    ):
        return latest_candidate.strip()

    return _merge_transcript_parts(parts)


def _normalize_level(samples: np.ndarray, target_peak: float = 0.85) -> np.ndarray:
    if samples.size == 0:
        return samples
    peak = float(np.max(np.abs(samples)))
    if peak < 1e-5:
        return samples
    gain = min(target_peak / peak, 3.0)
    return samples * gain


def _trim_silence(
    samples: np.ndarray,
    sample_rate: int,
    threshold: float = 0.003,
    pad_ms: int = 120,
) -> np.ndarray:
    if samples.size == 0:
        return samples

    above = np.where(np.abs(samples) > threshold)[0]
    if above.size == 0:
        return samples

    pad = int((pad_ms / 1000.0) * sample_rate)
    start = max(0, int(above[0]) - pad)
    end = min(samples.size, int(above[-1]) + pad + 1)
    return samples[start:end]


def _normalize_text(text: str) -> str:
    return " ".join(text.split()).strip().lower()


def _merge_transcript_parts(parts: list[str]) -> str:
    if not parts:
        return ""

    merged_parts: list[str] = []
    seen: set[str] = set()
    last_key = ""

    for piece in parts:
        cleaned_piece = piece.strip()
        if not cleaned_piece:
            continue
        key = _normalize_text(cleaned_piece)
        if not key or key in seen:
            continue

        # Streaming providers often send growing snapshots; keep the most complete one.
        if last_key and key.startswith(last_key):
            merged_parts[-1] = cleaned_piece
            seen.add(key)
            last_key = key
            continue

        merged_parts.append(cleaned_piece)
        seen.add(key)
        last_key = key

    return " ".join(" ".join(merged_parts).split()).strip()
