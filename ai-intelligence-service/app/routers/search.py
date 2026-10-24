import asyncio
import json

from fastapi import APIRouter, HTTPException
from pgvector.asyncpg import Vector
from pydantic import BaseModel

from app.config import settings
from app.db import get_pool
from app.llm import ollama_generate
from models.embedder import embed

router = APIRouter(prefix="/v1/search", tags=["AI-1 Search"])


class SearchRequest(BaseModel):
    query: str
    profile: dict = {}
    top_k: int = 6


class SearchResult(BaseModel):
    key: str
    name: str
    name_gu: str | None
    description: str | None
    route: str | None
    score: float
    rerank_reason: str | None = None
    profile_match: bool = False


@router.post("", response_model=list[SearchResult])
async def semantic_search(req: SearchRequest):
    if not req.query.strip():
        raise HTTPException(400, "query cannot be empty")

    query_clean = req.query.strip().lower()
    query_vec = Vector(embed(req.query))

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT service_key, service_name, service_name_gu, description, route,
                   1 - (embedding <=> $1) AS cosine_score
            FROM ai.service_embedding
            ORDER BY embedding <=> $1
            LIMIT $2
            """,
            query_vec,
            req.top_k * 2,
        )
        syn_rows = await conn.fetch(
            """
            SELECT service_key, service_name, service_name_gu, description, route,
                   0.85 AS cosine_score
            FROM ai.service_embedding
            WHERE EXISTS (
                SELECT 1 FROM unnest(synonyms) AS s
                WHERE lower(s) = $1
                   OR lower(s) LIKE '%' || $1 || '%'
                   OR $1 LIKE '%' || lower(s) || '%'
            )
            """,
            query_clean,
        )

    if not rows and not syn_rows:
        return []

    by_key: dict[str, dict] = {}
    for r in rows:
        by_key[r["service_key"]] = dict(r)
    for r in syn_rows:
        key = r["service_key"]
        entry = dict(r)
        if key in by_key:
            entry["cosine_score"] = max(float(by_key[key]["cosine_score"]), float(entry["cosine_score"]))
        by_key[key] = entry

    candidates = sorted(by_key.values(), key=lambda c: float(c["cosine_score"]), reverse=True)

    if settings.SEARCH_LLM_RERANK:
        reranked = await _gemma_rerank(req.query, req.profile, candidates, req.top_k)
        return reranked

    return _embedding_fallback(candidates, req.profile, req.top_k)


def _is_profile_match(service_key: str, profile: dict, rank: int) -> bool:
    """Returns True when this service is clearly relevant to the citizen profile."""
    caste = (profile.get("casteCategory") or "").upper()
    income = float(profile.get("annualIncome") or 999999)
    age = int(profile.get("age") or 0)
    is_welfare_citizen = caste in ("OBC", "SC", "ST", "NT") or income < 250000

    if is_welfare_citizen and rank < 4:
        return True
    if age >= 55 and service_key in ("old_age_pension", "pension", "old_age_home"):
        return True
    if caste in ("SC", "ST") and service_key in ("scholarships_sc", "irrigation"):
        return True
    if caste in ("OBC", "SC", "ST", "NT") and service_key == "obc_scholarship":
        return True
    return False


def _profile_boost_score(service_key: str, profile: dict, cosine: float) -> float:
    boost = 0.0
    caste = (profile.get("casteCategory") or "").upper()
    income = float(profile.get("annualIncome") or 999999)
    age = int(profile.get("age") or 0)

    if caste in ("OBC", "SC", "ST", "NT") and service_key in (
        "obc_scholarship",
        "bpl_ration",
        "caste_cert",
        "scholarships_sc",
    ):
        boost += 0.12
    if income < 250000 and service_key in ("bpl_ration", "old_age_pension", "widow_pension"):
        boost += 0.1
    if age >= 55 and service_key in ("old_age_pension", "pension", "widow_pension"):
        boost += 0.15
    return cosine + boost


def _fallback_reason(profile: dict, top_name: str) -> str:
    caste = profile.get("casteCategory")
    income = profile.get("annualIncome")
    if caste and income:
        return f"Best semantic match for your {caste} profile (₹{int(income):,}/year)."
    if caste:
        return f"Best semantic match for your {caste} category."
    return f"Closest match to “{top_name}” in the service catalogue."


def _embedding_fallback(candidates: list[dict], profile: dict, top_k: int) -> list[SearchResult]:
    ranked = sorted(
        candidates,
        key=lambda c: _profile_boost_score(c["service_key"], profile, float(c["cosine_score"])),
        reverse=True,
    )[:top_k]
    top_reason = _fallback_reason(profile, ranked[0]["service_name"]) if ranked else None
    return [
        SearchResult(
            key=c["service_key"],
            name=c["service_name"],
            name_gu=c["service_name_gu"],
            description=c["description"],
            route=c["route"],
            score=float(c["cosine_score"]),
            rerank_reason=top_reason if i == 0 else None,
            profile_match=_is_profile_match(c["service_key"], profile, i),
        )
        for i, c in enumerate(ranked)
    ]


async def _gemma_rerank(
    query: str, profile: dict, candidates: list[dict], top_k: int
) -> list[SearchResult]:
    try:
        caste = profile.get("casteCategory", "")
        income = profile.get("annualIncome", "")
        age = profile.get("age", "")

        services_json = json.dumps(
            [{"key": c["service_key"], "name": c["service_name"]} for c in candidates[:8]],
            ensure_ascii=False,
        )

        prompt = f"""You are a government services assistant for Gujarat, India.
Citizen profile: caste={caste}, income=₹{income}/year, age={age}.
Search query: "{query}"

Rank these services by relevance to the query and profile. Return ONLY a JSON array of keys in ranked order, plus a one-line reason for the top result.

Services: {services_json}

Respond in this exact JSON format (no other text):
{{"ranked_keys": ["key1","key2",...], "top_reason": "one sentence"}}"""

        raw = await asyncio.wait_for(
            ollama_generate(
                prompt,
                max_tokens=120,
                timeout=settings.SEARCH_LLM_TIMEOUT_SEC,
                retries=1,
            ),
            timeout=settings.SEARCH_LLM_TIMEOUT_SEC + 1,
        )
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw.strip())
        ranked_keys = data.get("ranked_keys", [])
        top_reason = data.get("top_reason", "")

        key_to_candidate = {c["service_key"]: c for c in candidates}
        results = []
        for i, key in enumerate(ranked_keys[:top_k]):
            if key not in key_to_candidate:
                continue
            c = key_to_candidate[key]
            results.append(
                SearchResult(
                    key=c["service_key"],
                    name=c["service_name"],
                    name_gu=c["service_name_gu"],
                    description=c["description"],
                    route=c["route"],
                    score=c["cosine_score"],
                    rerank_reason=top_reason if i == 0 else None,
                    profile_match=_is_profile_match(c["service_key"], profile, i),
                )
            )
        if not results:
            raise ValueError("empty rerank results")
        return results

    except Exception:
        return _embedding_fallback(candidates, profile, top_k)
