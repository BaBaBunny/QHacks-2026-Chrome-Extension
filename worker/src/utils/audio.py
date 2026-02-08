import io
from pydub import AudioSegment


def wav_to_mp3(wav_bytes: bytes) -> bytes:
    """Convert WAV audio bytes to MP3 format."""
    audio = AudioSegment.from_wav(io.BytesIO(wav_bytes))
    mp3_buffer = io.BytesIO()
    audio.export(mp3_buffer, format="mp3", bitrate="192k")
    return mp3_buffer.getvalue()
