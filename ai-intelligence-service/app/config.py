from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://citizenuser:egovpass@postgres.citizen.svc.cluster.local:5432/citizen_db"
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"
    OLLAMA_MODEL: str = "gemma3:4b"
    EMBED_MODEL: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    EMBED_DIM: int = 384
    PORT: int = 8089
    # Semantic retrieval only — Gemma rerank disabled for responsive search UX.
    SEARCH_LLM_RERANK: bool = False
    SEARCH_LLM_TIMEOUT_SEC: float = 3.0
    RECOMMEND_USE_LLM: bool = False
    RECOMMEND_LLM_TIMEOUT_SEC: float = 4.0
    # Voice — faster-whisper models. A size name (tiny|base|small|medium|large-v3) or a local directory.
    # English is accurate and fast on `base`. Gujarati is not: `base`/`small` return garbage, while `medium`
    # understands it (written in Devanagari, which the profile extractor handles) at a cost of ~2 GB of RAM.
    WHISPER_MODEL: str = "base"            # English (also the fallback for any other language)
    WHISPER_MODEL_GU: str = "medium"       # Gujarati
    WHISPER_BEAM_SIZE: int = 5             # beam 1 (greedy) made Gujarati much worse
    WHISPER_CPU_THREADS: int = 0           # 0 = let CTranslate2 decide
    STT_REMOTE_URL: str = ""               # host-side speech worker, e.g. http://host.lima.internal:8091; empty = local only
    STT_REMOTE_TOKEN: str = ""
    STT_REMOTE_TIMEOUT_SEC: float = 60.0
    WHISPER_WARMUP: bool = True            # load the models in the background at startup

    class Config:
        env_file = ".env"


settings = Settings()
