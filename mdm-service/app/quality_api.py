"""Feed quality API under /api/x/quality."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from . import audit, auth, quality
from .api import cur_dep
from .db import connect

router = APIRouter()


@router.post("/api/x/quality/run")
def start(u=Depends(auth.can_write)):
    return quality.run(u["actor"] or "officer", "MANUAL")


@router.get("/api/x/quality/runs")
def runs(limit: int = 20, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return {"items": quality.list_runs(cur, max(1, min(limit, 100)))}


@router.get("/api/x/quality/latest")
def latest(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return quality.get_run(cur) or {"run": None, "summary": None, "results": []}


@router.get("/api/x/quality/runs/{run_id}")
def one(run_id: int, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    r = quality.get_run(cur, run_id)
    if not r:
        raise HTTPException(404, "No such run")
    return r


# ---------------------------------------------------------------------------------------------------- records received in a date range
def _bad(e: Exception):
    raise HTTPException(400, str(e))


@router.get("/api/x/quality/range")
def range_(date_from: str | None = None, date_to: str | None = None, source: str | None = None, rule: str | None = None,
           cur=Depends(cur_dep), _=Depends(auth.can_read)):
    try:
        return quality.range_report(cur, date_from, date_to, source or None, rule or None)
    except ValueError as e:
        _bad(e)


@router.get("/api/x/quality/range.csv")
def range_csv(kind: str = "summary", date_from: str | None = None, date_to: str | None = None, source: str | None = None, rule: str | None = None,
              cur=Depends(cur_dep), _=Depends(auth.can_read)):
    if kind not in ("summary", "daily"):
        raise HTTPException(400, "kind must be summary or daily")
    try:
        name, text = quality.range_csv(cur, kind, date_from, date_to, source or None, rule or None)
    except ValueError as e:
        _bad(e)
    return Response(content=text, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------------------------------------------- rule settings (one set for all feeds)
class RulesBody(BaseModel):
    settings: dict
    reason: str = ""


@router.get("/api/x/quality/rules")
def rules(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return quality.rules_overview(cur)


@router.post("/api/x/quality/rules/preview")
def rules_preview(b: RulesBody, cur=Depends(cur_dep), _=Depends(auth.can_write)):
    try:
        return quality.preview_rules(cur, b.settings)
    except ValueError as e:
        _bad(e)


@router.post("/api/x/quality/rules")
def rules_save(b: RulesBody, u=Depends(auth.can_write)):
    with connect() as conn:
        cur = conn.cursor()
        try:
            out = quality.save_rules(cur, u["actor"] or "officer", b.settings, b.reason)
        except ValueError as e:
            _bad(e)
        conn.commit()
    return out


# ---------------------------------------------------------------------------------------------------- demo helper
@router.post("/api/x/quality/demo-history")
def demo_history(days: int = 60, u=Depends(auth.can_write)):
    """DEMO ONLY: spread the synthetic records' received dates over the last N days."""
    with connect() as conn:
        cur = conn.cursor()
        out = quality.spread_demo_received(cur, u["actor"] or "officer", days)
        conn.commit()
    return out


# ---------------------------------------------------------------------------------------------------- department contacts
class ContactBody(BaseModel):
    name: str
    role: str = ""
    email: str = ""
    phone: str = ""


@router.get("/api/x/quality/contacts")
def contacts_(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return {"items": quality.contacts(cur)}


@router.put("/api/x/quality/contacts/{source}")
def contact_save(source: str, b: ContactBody, u=Depends(auth.can_write)):
    with connect() as conn:
        cur = conn.cursor()
        try:
            out = quality.save_contact(cur, u["actor"] or "officer", source, b.model_dump())
        except ValueError as e:
            _bad(e)
        conn.commit()
    return out


# ---------------------------------------------------------------------------------------------------- records behind a check, for a short window
@router.get("/api/x/quality/range/detail")
def range_detail(source: str, rule: str, date_from: str | None = None, date_to: str | None = None, district: str | None = None, u=Depends(auth.can_read)):
    with connect() as conn:
        cur = conn.cursor()
        try:
            out = quality.range_detail(cur, date_from, date_to, source, rule, district or None)
        except ValueError as e:
            _bad(e)
        audit.write(cur, u["actor"] or "officer", "QUALITY_VALUES_VIEWED", f"quality:{source}:{rule}", {"from": out["from"], "to": out["to"], "district": district, "records_shown": len(out["found"].get("examples", []))})
        conn.commit()
    return out


@router.get("/api/x/quality/range/chase.csv")
def chase(date_from: str | None = None, date_to: str | None = None, source: str | None = None, rule: str | None = None, u=Depends(auth.can_read)):
    with connect() as conn:
        cur = conn.cursor()
        try:
            name, text, n = quality.chase_csv(cur, date_from, date_to, source or None, rule or None)
        except ValueError as e:
            _bad(e)
        audit.write(cur, u["actor"] or "officer", "QUALITY_CHASE_LIST_EXPORTED", "quality:chase", {"from": date_from, "to": date_to, "feed": source, "rule": rule, "rows": n})
        conn.commit()
    return Response(content=text, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}"'})
