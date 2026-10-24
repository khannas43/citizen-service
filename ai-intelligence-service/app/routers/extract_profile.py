"""Profile slot extraction for voice eligibility (rules + optional LLM fallback)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from typing import Literal

from pydantic import BaseModel, Field

from app.profile_extract import extract_profile
from app.rate_limit import check_rate_limit

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/speech", tags=["speech"])


class ExtractProfileRequest(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=4000)
    language: Literal["en", "gu"] = "en"
    priorSlots: dict | None = None


@router.post("/extract-profile")
async def extract_profile_route(body: ExtractProfileRequest, request: Request):
    check_rate_limit(request)
    if not body.transcript.strip():
        raise HTTPException(status_code=400, detail="Empty transcript")
    log.debug("extract-profile lang=%s len=%s", body.language, len(body.transcript))
    return await extract_profile(body.transcript.strip(), body.language, body.priorSlots)
