"""Routes for the officer portal's machine-translated view of department free text."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import auth, translate
from .api import cur_dep

router = APIRouter()


class In(BaseModel):
    texts: list[str]
    target: str = "te"


@router.get("/api/x/translate/status")
def mt_status(u=Depends(auth.can_read)):
    return translate.status()


@router.post("/api/x/translate")
def mt_translate(body: In, cur=Depends(cur_dep), u=Depends(auth.can_read)):
    if not body.texts or len(body.texts) > translate.MAX_TEXTS or any(len(t) > translate.MAX_CHARS for t in body.texts):
        raise HTTPException(400, f"Send between 1 and {translate.MAX_TEXTS} texts of at most {translate.MAX_CHARS} characters each")
    if body.target not in translate.LANGS:
        raise HTTPException(400, "That language is not available for machine translation")
    return translate.translate(cur, body.texts, body.target)


class Fix(BaseModel):
    text: str
    translated: str
    target: str = "te"


@router.get("/api/x/translate/memory")
def mt_memory(limit: int = 200, cur=Depends(cur_dep), u=Depends(auth.can_read)):
    cur.execute("SELECT source_text, translated, tgt_lang, reviewed_by, reviewed_at, origin FROM mdm.translation_memory ORDER BY reviewed_at DESC LIMIT %s", (max(1, min(limit, 1000)),))
    return {"items": cur.fetchall()}


@router.put("/api/x/translate/memory")
def mt_remember(body: Fix, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    """A steward's corrected translation. From now on it replaces the machine text for this sentence."""
    try:
        translate.remember(cur, body.text, body.translated, u["actor"], body.target)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.delete("/api/x/translate/memory")
def mt_forget(text: str, target: str = "te", cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return {"removed": translate.forget(cur, text, target)}
