from fastapi import APIRouter
from pydantic import BaseModel

from app.llm import ollama_generate

router = APIRouter(prefix="/v1/explain", tags=["Gemma — Beneficiary Explanation"])


class BenefExplainReq(BaseModel):
    scheme_name: str
    person_name: str
    caste: str | None = None
    income: int | None = None
    age: int | None = None
    eligibility_reason: str | None = None


class BenefExplainResp(BaseModel):
    explanation: str
    model: str = "gemma3:4b"


@router.post("/beneficiary", response_model=BenefExplainResp)
async def explain_beneficiary(req: BenefExplainReq):
    income_str = f"₹{req.income:,}" if req.income else "not recorded"
    age_str = f"{req.age} years" if req.age else "not recorded"
    prompt = (
        f"You are an eligibility verification assistant for a government welfare platform.\n"
        f"Write exactly 2 sentences in plain English explaining why this citizen qualifies "
        f"for the scheme. Be specific about which criteria they meet. "
        f"Start with the citizen's first name.\n\n"
        f"Scheme: {req.scheme_name}\n"
        f"Citizen: {req.person_name}\n"
        f"Caste category: {req.caste or 'not recorded'}\n"
        f"Annual household income: {income_str}\n"
        f"Age: {age_str}\n"
        f"Eligibility notes from system: {req.eligibility_reason or 'standard criteria met'}\n"
    )
    try:
        text = await ollama_generate(prompt, max_tokens=150)
        for prefix in ("here is", "here's", "sure", "certainly"):
            if text.lower().startswith(prefix):
                text = text.split("\n", 1)[-1].strip()
                break
        return BenefExplainResp(explanation=text or _fallback(req))
    except Exception:
        return BenefExplainResp(explanation=_fallback(req))


def _fallback(req: BenefExplainReq) -> str:
    parts = []
    if req.age:
        parts.append(f"age {req.age}")
    if req.caste:
        parts.append(f"{req.caste} category")
    if req.income:
        parts.append(f"income ₹{req.income:,}")
    criteria = ", ".join(parts) if parts else "standard eligibility criteria"
    note = f" {req.eligibility_reason}" if req.eligibility_reason else ""
    return f"{req.person_name} qualifies for {req.scheme_name} based on {criteria}.{note}".strip()
