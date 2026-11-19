"""Flow board and Work queue API under /api/x."""
from __future__ import annotations
from typing import Optional, Union

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from . import auth, exchange, stewardship, workqueue
from .api import cur_dep
from .stewardship import Refused

router = APIRouter()


def run(fn, *a, **k):
    try:
        return fn(*a, **k)
    except Refused as e:
        raise HTTPException(e.code, str(e))


# An item key: a bare number is a proposal (slice 1); p-12, r-45 and i-9 name a proposal, review task and issue.
ItemKey = Union[int, str]


class ClaimIn(BaseModel):
    ids: Optional[list[ItemKey]] = None
    reason: Optional[str] = None
    system: Optional[str] = None


class PreviewIn(BaseModel):
    reason: str
    ids: Optional[list[ItemKey]] = None
    system: Optional[str] = None


class ApproveIn(BaseModel):
    token: str
    rationale: str
    sample_opened: list[ItemKey] = []


@router.get("/api/x/flow-board")
def flow_board(request: Request, system: Optional[str] = None, cur=Depends(cur_dep), u=Depends(auth.can_read)):
    system = auth.dept_or_param(request, system)
    if auth.scope(u):
        system = auth.scope(u)
    out = run(workqueue.flow_board, cur, system)
    if auth.scope(u) and out.get("totals") and out.get("rows"):
        # Totals row is that department alone.
        row = out["rows"][0]
        tot = {**out["totals"]}
        for k in ("received_24h", "delivered", "waiting_citizen", "retrying", "failed",
                  "needs_person", "routine", "decision", "overdue"):
            if k in row:
                tot[k] = row[k]
        tot["oldest_waiting_hours"] = row.get("oldest_waiting_hours", 0)
        tot["on_time_pct"] = row.get("on_time_pct", 100.0)
        tot["name"] = row.get("name") or tot.get("name")
        out["totals"] = tot
        out["scoping"] = f"Department scope: {auth.scope(u)}"
    return out


@router.get("/api/x/work/groups")
def work_groups(request: Request, system: Optional[str] = None, risk_class: Optional[str] = None, claimed: Optional[str] = None,
                q: Optional[str] = None, cur=Depends(cur_dep), u=Depends(auth.can_read),
                accept_language: Optional[str] = Header(None, alias="Accept-Language")):
    system = auth.dept_or_param(request, system) or auth.scope(u) or system
    return run(workqueue.groups, cur, system, risk_class, claimed, q, u.get("actor"), accept_language)


@router.get("/api/x/work/items")
def work_items(request: Request, reason: str, system: Optional[str] = None, department: Optional[str] = None,
               q: Optional[str] = None, claimed: Optional[str] = None, min_age_hours: Optional[float] = None,
               sort: Optional[str] = None, dir: Optional[str] = "desc",
               limit: int = 50, offset: Optional[int] = None, after: Optional[str] = None,
               cur=Depends(cur_dep), u=Depends(auth.can_read),
               accept_language: Optional[str] = Header(None, alias="Accept-Language")):
    system = auth.dept_or_param(request, system or department) or auth.scope(u) or system or department
    return run(workqueue.items, cur, reason, system, q, claimed, u.get("actor"), limit, after, accept_language,
               min_age_hours=min_age_hours, sort=sort, dir=dir, offset=offset)


@router.post("/api/x/work/claim")
def work_claim(body: ClaimIn, request: Request, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    dept = auth.scope(u)
    system = dept or body.system
    return run(workqueue.claim, cur, u.get("actor"), body.ids, body.reason, system, dept_scope=dept)


@router.post("/api/x/work/unclaim")
def work_unclaim(body: ClaimIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(workqueue.unclaim, cur, u.get("actor"), body.ids, body.reason, dept_scope=auth.scope(u))


@router.post("/api/x/work/batch/preview")
def batch_preview(body: PreviewIn, request: Request, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    dept = auth.scope(u)
    system = dept or body.system
    return run(workqueue.preview, cur, body.reason, body.ids, system, u.get("actor"), dept_scope=dept)


@router.post("/api/x/work/batch/approve")
def batch_approve(body: ApproveIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(workqueue.batch_approve, cur, body.token, body.rationale, body.sample_opened, u.get("actor"),
               dept_scope=auth.scope(u))


@router.get("/api/x/work/batches/{batch_id}")
def batch_get(batch_id: int, cur=Depends(cur_dep), u=Depends(auth.can_read)):
    return run(workqueue.batch_receipt, cur, batch_id, dept_scope=auth.scope(u))


class ReviewDecisionIn(BaseModel):
    decision: str
    person_id: Optional[int] = None
    note: Optional[str] = None


def _review_decide(cur, task_id: int, body: ReviewDecisionIn, actor: str) -> dict:
    """One link decision from the Work queue. stewardship.decide stays the only write path for a link."""
    cur.execute("SELECT id, status, reason_code FROM mdm.review_task WHERE id=%s", (task_id,))
    t = cur.fetchone()
    if not t:
        raise Refused("Review task not found", 404)
    if t["status"] != "OPEN":
        raise Refused("This task has already been decided", 409)
    decision = (body.decision or "").upper()
    if decision not in ("LINK", "SEPARATE"):
        raise Refused("decision must be LINK or SEPARATE", 422)
    pol = exchange.current(cur)
    min_chars = int(pol.get("rationale_min_chars") or 10)
    if workqueue.needs_reason(pol, t["reason_code"] or "") and len((body.note or "").strip()) < min_chars:
        raise Refused(f"Give a reason of at least {min_chars} characters", 422)
    return stewardship.decide(cur, task_id, decision, body.person_id, actor, (body.note or "").strip() or None)


@router.post("/api/x/work/review/{task_id}/decide")
def work_review_decide(task_id: int, body: ReviewDecisionIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    # Not on the department allow-list: the middleware answers 403 for a department officer. Checked here too.
    if auth.scope(u):
        raise HTTPException(403, auth.DEPT_FORBIDDEN_MSG)
    return run(_review_decide, cur, task_id, body, u["actor"])
