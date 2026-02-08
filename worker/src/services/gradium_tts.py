import os
import gradium


GRADIUM_API_KEY = os.environ.get("GRADIUM_API_KEY", "")
GRADIUM_BASE_URL = os.environ.get("GRADIUM_BASE_URL", "https://us.api.gradium.ai/api")


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

# Default voice per language
DEFAULT_VOICES: dict[str, str] = {
    "en": "YTpq7expH9539ERJ",
    "fr": "b35yykvVppLXyw_l",
    "de": "-uP9MuGtBqAvEyxI",
    "es": "B36pbz5_UoWn4BDl",
    "pt": "pYcGZz9VOo4n2ynh",
}


def chunk_text(text: str, max_chars: int = 1400) -> list[str]:
    """Split text into chunks at sentence boundaries."""
    sentences = text.replace("\n", " ").split(". ")
    chunks: list[str] = []
    current = ""

    for sentence in sentences:
        candidate = (current + sentence + ". ") if current else (sentence + ". ")
        if len(candidate) > max_chars and current:
            chunks.append(current.strip())
            current = sentence + ". "
        else:
            current = candidate

    if current.strip():
        chunks.append(current.strip())

    return chunks if chunks else [text]


async def synthesize(
    text: str,
    voice_id: str | None = None,
    language: str = "en",
) -> bytes:
    """Convert text to WAV audio bytes via Gradium TTS."""
    _ensure_ca_bundle()

    client = gradium.client.GradiumClient(
        base_url=GRADIUM_BASE_URL,
        api_key=GRADIUM_API_KEY,
    )

    resolved_voice = voice_id or DEFAULT_VOICES.get(language, DEFAULT_VOICES["en"])

    setup = {
        "voice_id": resolved_voice,
        "output_format": "wav",
        "rewrite_rules": language,
    }

    chunks = chunk_text(text)
    all_audio: list[bytes] = []

    for chunk in chunks:
        result = await client.tts(setup=setup, text=chunk)
        # TTSResult attributes: raw_data, pcm, pcm16, sample_rate, output_format, etc.
        audio_bytes = None
        
        # Try common audio field names
        for attr in ["raw_data", "pcm16", "pcm", "audio"]:
            if hasattr(result, attr):
                audio_bytes = getattr(result, attr)
                if isinstance(audio_bytes, bytes):
                    break
        
        if not audio_bytes:
            raise ValueError(f"Could not find audio data in TTSResult. Available: {dir(result)}")
        
        if isinstance(audio_bytes, bytes):
            all_audio.append(audio_bytes)
        else:
            all_audio.append(bytes(audio_bytes))

    return b"".join(all_audio)
