"""Speech-to-text worker that runs natively on the host (outside the cluster).

Why: the cluster VM cannot use Apple's matrix hardware, so Whisper `medium` takes ~35 s per Gujarati clip
there against ~7 s natively on the Mac. The AI service sends audio here when STT_REMOTE_URL is set and falls
back to its own model if this worker is down.

Run (from ai-intelligence-service/):
    pip install faster-whisper fastapi uvicorn python-multipart pydantic-settings httpx
    STT_WORKER_TOKEN=... PYTHONPATH=. python -m uvicorn scripts.stt_worker:app --host 0.0.0.0 --port 8091
or use scripts/run_stt_worker.sh, which creates and reuses a token.
"""
import hmac
import logging
import os

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.speech_engine import stt_status, transcribe_local, warm_up

log = logging.getLogger("stt_worker")
TOKEN = os.environ.get("STT_WORKER_TOKEN", "")
MAX_AUDIO_BYTES = 5 * 1024 * 1024

app = FastAPI(title="DG 2.0 speech worker")


@app.on_event("startup")
async def _startup() -> None:
    if not TOKEN:
        raise RuntimeError("STT_WORKER_TOKEN must be set: the worker is reachable from the network")
    import threading

    threading.Thread(target=warm_up, name="whisper-warmup", daemon=True).start()


@app.get("/health")
async def health():
    return {"status": "ok", "stt": stt_status()}


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form("en"),
    x_stt_token: str = Header(default=""),
):
    if not hmac.compare_digest(x_stt_token.encode(), TOKEN.encode()):
        raise HTTPException(status_code=401, detail="bad token")
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="audio too large")
    if not data:
        raise HTTPException(status_code=400, detail="empty audio")
    return await run_in_threadpool(transcribe_local, data, audio.filename or "audio.webm", language)
