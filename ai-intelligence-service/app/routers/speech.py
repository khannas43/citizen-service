"""Voice endpoints for citizen chatbot — STT + TTS (no LLM)."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.rate_limit import check_rate_limit
from app.speech_engine import synthesize_speech, transcribe_audio

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/speech", tags=["speech"])

MAX_AUDIO_BYTES = 5 * 1024 * 1024  # 5 MB
CHUNK_SIZE = 1024 * 1024  # 1 MB — read bound so an oversized upload is rejected without fully buffering it
TTS_TIMEOUT_SEC = 20


class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    language: str = Field(default="en", description="en or gu")


async def _read_bounded(upload: UploadFile) -> bytes:
    """Read up to MAX_AUDIO_BYTES+1 without buffering an unbounded upload into memory."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(CHUNK_SIZE)
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        if total > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio too large (max 5MB)")
    return b"".join(chunks)


@router.post("/stt")
async def speech_to_text(
    request: Request,
    audio: UploadFile = File(...),
    language: str = Form("en"),
):
    check_rate_limit(request)
    data = await _read_bounded(audio)
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio")
    try:
        result = await run_in_threadpool(transcribe_audio, data, audio.filename or "audio.webm", language)
    except Exception as exc:  # noqa: BLE001
        log.exception("STT failed")
        raise HTTPException(status_code=503, detail=f"Speech recognition unavailable: {exc}") from exc
    if not result.get("text"):
        raise HTTPException(status_code=422, detail="Could not understand speech — please try again")
    return result


@router.post("/tts")
async def text_to_speech(body: TtsRequest, request: Request):
    check_rate_limit(request)
    try:
        mp3, truncated = await asyncio.wait_for(
            run_in_threadpool(synthesize_speech, body.text, body.language),
            timeout=TTS_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError as exc:
        log.warning("TTS timed out after %ss", TTS_TIMEOUT_SEC)
        raise HTTPException(status_code=504, detail="Speech synthesis timed out — please try again") from exc
    except Exception as exc:  # noqa: BLE001
        log.exception("TTS failed")
        raise HTTPException(status_code=503, detail=f"Speech synthesis unavailable: {exc}") from exc
    headers = {"X-Speech-Truncated": "true"} if truncated else {}
    return Response(content=mp3, media_type="audio/mpeg", headers=headers)
