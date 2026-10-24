from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import close_pool, get_pool
from app.llm import ollama_health
from app.routers import dashboard_analytics, explain, extract_profile, recommend, search, sla, speech, superset_proxy
from app.speech_engine import stt_status
from models.embedder import get_embedder
from models.ranker import load_ranker
from models.sla_model import load_sla_model


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Soft-fail DB/models so /v1/speech stays up even if pgvector/embeddings lag
    try:
        await get_pool()
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING: DB pool init failed (search/rec may be down): {exc}")
    try:
        get_embedder()
        load_ranker()
        load_sla_model()
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING: model load failed: {exc}")
    # Whisper models load in the background so startup stays fast and the first voice request is not slow
    if settings.WHISPER_WARMUP:
        import threading

        from app.speech_engine import warm_up

        threading.Thread(target=warm_up, name="whisper-warmup", daemon=True).start()
    yield
    await close_pool()


app = FastAPI(title="DG 2.0 AI Intelligence Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(search.router)
app.include_router(recommend.router)
app.include_router(sla.router)
app.include_router(explain.router)
app.include_router(speech.router)
app.include_router(extract_profile.router)
app.include_router(superset_proxy.router)
app.include_router(dashboard_analytics.router)


@app.get("/health")
async def health():
    ollama_ok = await ollama_health()
    return {
        "status": "ok",
        "ollama": "reachable" if ollama_ok else "unreachable",
        "models": {
            "ranker": "loaded" if load_ranker() else "not_trained_yet",
            "sla": "loaded" if load_sla_model() else "not_trained_yet",
            "stt": stt_status(),
            "tts": "gtts",
        },
    }
