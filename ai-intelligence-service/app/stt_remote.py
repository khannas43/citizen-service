"""Client for the optional external speech worker (see scripts/stt_worker.py)."""
from __future__ import annotations

import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)


class RemoteSttUnavailable(RuntimeError):
    """The worker is not configured, down, or rejected the request; callers fall back to the local model."""


def transcribe_remote(data: bytes, filename: str, language: str) -> dict:
    if not settings.STT_REMOTE_URL:
        raise RemoteSttUnavailable("not configured")
    url = settings.STT_REMOTE_URL.rstrip("/") + "/transcribe"
    timeout = httpx.Timeout(settings.STT_REMOTE_TIMEOUT_SEC, connect=2.0)   # a dead worker must fail fast
    try:
        res = httpx.post(
            url,
            files={"audio": (filename or "audio.webm", data)},
            data={"language": language},
            headers={"X-STT-Token": settings.STT_REMOTE_TOKEN.strip()},
            timeout=timeout,
        )
    except httpx.HTTPError as exc:
        raise RemoteSttUnavailable(f"{type(exc).__name__}: {exc}") from exc
    if res.status_code != 200:
        raise RemoteSttUnavailable(f"worker answered HTTP {res.status_code}")
    body = res.json()
    if not isinstance(body, dict) or "text" not in body:
        raise RemoteSttUnavailable("unexpected worker response")
    return {"text": str(body["text"]), "language": body.get("language") or language}
