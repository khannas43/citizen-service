import httpx

from app.config import settings


async def ollama_generate(
    prompt: str,
    max_tokens: int = 512,
    timeout: float = 90.0,
    retries: int = 2,
) -> str:
    """Single-shot generation via Ollama REST API with retry."""
    payload = {
        "model": settings.OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"num_predict": max_tokens, "temperature": 0.1},
    }
    last_exc = None
    attempts = max(1, retries)
    for attempt in range(attempts):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{settings.OLLAMA_BASE_URL}/api/generate",
                    json=payload,
                )
                resp.raise_for_status()
                text = resp.json().get("response", "").strip()
                if text:
                    return text
        except Exception as exc:
            last_exc = exc
    raise RuntimeError(f"Ollama failed after {attempts} attempts: {last_exc}")


async def ollama_health() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            return r.status_code == 200
    except Exception:
        return False
