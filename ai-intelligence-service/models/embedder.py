from sentence_transformers import SentenceTransformer

from app.config import settings

_model = None


def get_embedder() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(settings.EMBED_MODEL)
    return _model


def embed(text: str) -> list[float]:
    model = get_embedder()
    vec = model.encode(text, normalize_embeddings=True)
    return vec.tolist()


def embed_batch(texts: list[str]) -> list[list[float]]:
    model = get_embedder()
    vecs = model.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=True)
    return vecs.tolist()
