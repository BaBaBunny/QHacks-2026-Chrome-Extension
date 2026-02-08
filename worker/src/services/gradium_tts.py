import os
import gradium


GRADIUM_API_KEY = os.environ.get("GRADIUM_API_KEY", "")
GRADIUM_BASE_URL = os.environ.get("GRADIUM_BASE_URL", "https://us.api.gradium.ai/api")

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
        audio = await client.tts(setup=setup, text=chunk)
        all_audio.append(audio)

    return b"".join(all_audio)
