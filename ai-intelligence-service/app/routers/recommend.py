import asyncio

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings
from app.db import get_pool
from app.llm import ollama_generate
from models.ranker import predict_scores

router = APIRouter(prefix="/v1/recommendations", tags=["AI-2 Recommendations"])

FAMILY_ID_SQL = """
    SELECT fm.family_id::text
    FROM family_registry.family_member fm
    JOIN family_registry.person p ON p.id = fm.person_id
    WHERE p.aadhaar_ref = $1
    LIMIT 1
"""


class RecommendRequest(BaseModel):
    profile: dict
    enrolled_scheme_names: list[str] = []
    top_k: int = 4


class Recommendation(BaseModel):
    scheme_id: str
    scheme_name: str
    person_name: str | None = None
    match_score: float
    explanation: str
    eligibility_reasons: list[str]


@router.post("", response_model=list[Recommendation])
async def get_recommendations(req: RecommendRequest):
    aadhaar_ref = req.profile.get("aadhaarRef", "")
    if not aadhaar_ref:
        return []

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT ON (s.name)
                   s.id, s.name AS scheme_name, b.eligibility_reason,
                   b.person_name, s.benefit_value, s.benefit_type, b.amount AS beneficiary_amount
            FROM scheme_engine.beneficiary b
            JOIN scheme_engine.scheme s ON b.scheme_id = s.id
            WHERE b.family_id = (""" + FAMILY_ID_SQL + """)
            AND b.status = 'IDENTIFIED'
            AND s.name != ALL($2::text[])
            ORDER BY s.name, b.identified_at DESC
            LIMIT 20
            """,
            aadhaar_ref,
            req.enrolled_scheme_names,
        )

        if not rows:
            # Payments / confirm flows can leave a family with no IDENTIFIED rows.
            # Rank active catalogue schemes the family is not already availing.
            caste = (req.profile.get("casteCategory") or "").upper()
            income = float(req.profile.get("annualIncome") or 0)
            rows = await conn.fetch(
                """
                SELECT s.id, s.name AS scheme_name,
                       CONCAT_WS('|',
                         CASE WHEN $2 <> '' THEN 'Caste ' || $2 || ' in eligible list' END,
                         CASE WHEN s.income_ceiling IS NOT NULL THEN
                           'Income below ₹' || s.income_ceiling::text || ' ceiling'
                         END
                       ) AS eligibility_reason,
                       NULL::text AS person_name,
                       s.benefit_value, s.benefit_type, NULL::bigint AS beneficiary_amount
                FROM scheme_engine.scheme s
                WHERE COALESCE(s.is_active, true) = true
                  AND s.name != ALL($1::text[])
                  AND (
                    $2 = ''
                    OR s.eligible_castes IS NULL
                    OR btrim(s.eligible_castes) = ''
                    OR $2 = ANY(string_to_array(upper(replace(s.eligible_castes, ' ', '')), ','))
                  )
                  AND (s.income_ceiling IS NULL OR s.income_ceiling >= $3)
                ORDER BY s.name
                LIMIT 20
                """,
                req.enrolled_scheme_names,
                caste,
                income,
            )

    if not rows:
        return []

    caste_map = {"SC": 1, "ST": 2, "OBC": 3, "NT": 4, "GENERAL": 5}
    caste_code = caste_map.get(req.profile.get("casteCategory", ""), 0)
    income = float(req.profile.get("annualIncome") or 0)
    age = float(req.profile.get("age") or 30)

    features = []
    for row in rows:
        reasons = (row["eligibility_reason"] or "").split("|")
        beneficiary_amount = row["beneficiary_amount"]
        if beneficiary_amount is not None:
            benefit_feat = float(beneficiary_amount) / 50000
        else:
            bv = row["benefit_value"]
            try:
                benefit_feat = float(str(bv).replace(",", "").replace("₹", "").strip()) / 50000
            except (ValueError, TypeError):
                benefit_feat = 0.0
        features.append(
            [
                caste_code,
                min(1.0, income / 300000),
                min(1.0, age / 80),
                len(reasons),
                benefit_feat,
            ]
        )

    scores = predict_scores(np.array(features, dtype=np.float32))
    ranked = sorted(zip(rows, scores), key=lambda x: x[1], reverse=True)[: req.top_k]

    if settings.RECOMMEND_USE_LLM:
        explanations = await asyncio.gather(
            *[_gemma_explain(req.profile, dict(row)) for row, _ in ranked]
        )
    else:
        explanations = [_fallback_explanation(req.profile, dict(row)) for row, _ in ranked]

    results = []
    for (row, score), explanation in zip(ranked, explanations):
        reasons = [r.strip() for r in (row["eligibility_reason"] or "").split("|") if r.strip()]
        results.append(
            Recommendation(
                scheme_id=str(row["id"]),
                scheme_name=row["scheme_name"],
                person_name=row["person_name"],
                match_score=float(score),
                explanation=explanation,
                eligibility_reasons=reasons[:4],
            )
        )

    return results


def _fallback_explanation(profile: dict, beneficiary: dict) -> str:
    reasons = [
        r.strip()
        for r in (beneficiary.get("eligibility_reason") or "").split("|")
        if r.strip()
    ]
    scheme = beneficiary.get("scheme_name", "this scheme")
    person = beneficiary.get("person_name", "")
    caste = profile.get("casteCategory", "")
    income = profile.get("annualIncome")
    if reasons and person:
        return f"{person} qualifies: {reasons[0]}"
    if reasons:
        return reasons[0]
    if caste and income:
        return f"Eligible based on {caste} category and family income of ₹{int(income):,}/year."
    return f"Your family profile qualifies for {scheme}."


async def _gemma_explain(profile: dict, beneficiary: dict) -> str:
    try:
        prompt = f"""Write one sentence (max 15 words) explaining why this citizen
qualifies for this welfare scheme. Be specific about which criterion matches.
Citizen: caste={profile.get('casteCategory')}, age={profile.get('age')},
income=₹{profile.get('annualIncome')}/year.
Scheme: {beneficiary.get('scheme_name', '')}
Criteria met: {beneficiary.get('eligibility_reason', '')}
Reply with ONLY the explanation sentence."""
        result = await asyncio.wait_for(
            ollama_generate(
                prompt,
                max_tokens=50,
                timeout=settings.RECOMMEND_LLM_TIMEOUT_SEC,
                retries=1,
            ),
            timeout=settings.RECOMMEND_LLM_TIMEOUT_SEC + 1,
        )
        if result and len(result) > 5:
            return result
        raise ValueError("empty response")
    except Exception:
        return _fallback_explanation(profile, beneficiary)
