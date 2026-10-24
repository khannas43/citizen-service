"""Local STT (faster-whisper) + TTS (gTTS) for chatbot voice mode."""
from __future__ import annotations

import logging
import re
import subprocess
import tempfile
from pathlib import Path
from threading import Lock

from app.config import settings

log = logging.getLogger(__name__)

_whisper_models: dict[str, object] = {}
_whisper_lock = Lock()
_whisper_error: str | None = None


def model_for_language(lang: str) -> str:
    """English runs on a small fast model; Gujarati needs the larger one."""
    return settings.WHISPER_MODEL_GU if lang == "gu" else settings.WHISPER_MODEL


def stt_status() -> str:
    if _whisper_error:
        return f"error:{_whisper_error}"
    if _whisper_models:
        return "loaded:" + ",".join(sorted(_whisper_models))
    return "lazy"


def _get_whisper(model_name: str | None = None):
    global _whisper_error
    name = model_name or settings.WHISPER_MODEL
    model = _whisper_models.get(name)
    if model is not None:
        return model
    with _whisper_lock:
        model = _whisper_models.get(name)
        if model is not None:
            return model
        try:
            from faster_whisper import WhisperModel

            log.info("Loading faster-whisper model=%s", name)
            model = WhisperModel(
                name, device="cpu", compute_type="int8", cpu_threads=settings.WHISPER_CPU_THREADS,
            )
            _whisper_models[name] = model
            _whisper_error = None
            return model
        except Exception as exc:  # noqa: BLE001
            _whisper_error = f"{name}: {exc}"
            log.exception("Failed to load Whisper model %s", name)
            raise


def warm_up() -> None:
    """Load every configured model so the first citizen request does not wait for a ~1.5 GB model to load."""
    for lang in ("en", "gu"):
        try:
            _get_whisper(model_for_language(lang))
        except Exception:  # noqa: BLE001 - already logged; the service stays up and loads lazily on demand
            pass


_REPETITION = re.compile(r"(.{1,6}?)\1{7,}", re.DOTALL)


def is_degenerate(text: str) -> bool:
    """Whisper sometimes falls into a loop ("वर्ष्च्च्च्च्च्च…") on audio it cannot decode. Treat that as no result."""
    return bool(text) and bool(_REPETITION.search(text))


def _to_wav(src: Path) -> Path:
    """Convert browser/mobile audio (webm/m4a/ogg) to 16k mono wav for Whisper."""
    if src.suffix.lower() in {".wav", ".mp3", ".flac"}:
        return src
    dst = src.with_suffix(".wav")
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        "16000",
        str(dst),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=60)
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg not installed — required for speech upload conversion") from exc
    except subprocess.CalledProcessError as exc:
        err = (exc.stderr or b"").decode("utf-8", errors="ignore")[:400]
        raise RuntimeError(f"ffmpeg conversion failed: {err}") from exc
    return dst


def transcribe_audio(data: bytes, filename: str, language: str) -> dict:
    """Transcribe via the host-side worker when configured, else (or if it is unavailable) with the local model."""
    if settings.STT_REMOTE_URL:
        from app.stt_remote import RemoteSttUnavailable, transcribe_remote

        try:
            result = transcribe_remote(data, filename, language)
            if is_degenerate(result["text"]):
                result["text"] = ""
            return result
        except RemoteSttUnavailable as exc:
            log.warning("Remote STT unavailable, using local model: %s", exc)
    return transcribe_local(data, filename, language)


def transcribe_local(data: bytes, filename: str, language: str) -> dict:
    """Return {text, language} from uploaded audio bytes, using the in-process Whisper model."""
    lang = "gu" if language.lower().startswith("gu") else "en"
    suffix = Path(filename or "audio.webm").suffix or ".webm"
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"input{suffix}"
        src.write_bytes(data)
        wav = _to_wav(src)
        model = _get_whisper(model_for_language(lang))
        segments, info = model.transcribe(
            str(wav),
            language=lang,
            beam_size=settings.WHISPER_BEAM_SIZE,
            temperature=0.0,                      # no random retries: they loop on unclear audio and take minutes
            condition_on_previous_text=False,
            vad_filter=True,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        if is_degenerate(text):
            log.warning("Discarding repetitive transcription (%d chars) for lang=%s", len(text), lang)
            text = ""
        detected = getattr(info, "language", lang) or lang
        return {"text": text, "language": detected}


TTS_MAX_CHARS = 1200


def _truncate_at_boundary(text: str, limit: int) -> tuple[str, bool]:
    """Cut text at the last sentence/word boundary before `limit` rather than mid-word."""
    if len(text) <= limit:
        return text, False
    window = text[:limit]
    cut = max(window.rfind(". "), window.rfind("? "), window.rfind("! "))
    if cut == -1:
        cut = window.rfind(" ")
    if cut == -1:
        cut = limit
    else:
        cut += 1  # keep the punctuation/word, drop the trailing space
    return text[:cut].rstrip(), True


def synthesize_speech(text: str, language: str) -> tuple[bytes, bool]:
    """Return (mp3 bytes, truncated) for EN/GU text via gTTS."""
    from io import BytesIO

    from gtts import gTTS
    from gtts.tts import gTTSError

    clean = (text or "").strip()
    if not clean:
        raise ValueError("Empty text")
    clean, truncated = _truncate_at_boundary(clean, TTS_MAX_CHARS)
    lang = "gu" if language.lower().startswith("gu") else "en"
    buf = BytesIO()
    try:
        gTTS(text=clean, lang=lang).write_to_fp(buf)
    except gTTSError as exc:
        raise RuntimeError(f"TTS provider unreachable or rejected request: {exc}") from exc
    return buf.getvalue(), truncated
