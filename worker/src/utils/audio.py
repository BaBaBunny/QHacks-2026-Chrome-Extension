import io
from pydub import AudioSegment


def wav_to_mp3(wav_bytes: bytes) -> bytes:
    """Convert WAV audio bytes to MP3 format, or return WAV if ffmpeg unavailable."""
    try:
        audio = AudioSegment.from_wav(io.BytesIO(wav_bytes))
        mp3_buffer = io.BytesIO()
        audio.export(mp3_buffer, format="mp3", bitrate="192k")
        return mp3_buffer.getvalue()
    except Exception as e:
        # If ffmpeg is not available, return WAV as-is (browsers support it natively)
        print(f"[AUDIO] MP3 conversion failed, returning WAV: {e}")
        return wav_bytes
