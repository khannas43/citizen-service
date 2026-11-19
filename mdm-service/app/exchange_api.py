"""Data exchange API: consent, policy, verification-only queries, deliveries, approvals inbox and the ledger. Under /api/x."""
from __future__ import annotations
from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from . import auth, exchange
from .api import cur_dep
from .stewardship import Refused

router = APIRouter()


def run(fn, *a, **k):
    try:
        return fn(*a, **k)
    except Refused as e:
        raise HTTPException(e.code, str(e))


class PolicyIn(BaseModel):
    key: str
    value: Any
    note: Optional[str] = None


class ConsentIn(BaseModel):
    person_id: int
    purpose: str
    subject_person_id: Optional[int] = None
    channel: Optional[str] = None


class RespondIn(BaseModel):
    decision: str
    channel: str = "PORTAL"
    operator: Optional[str] = None
    note: Optional[str] = None
    given_by_person_id: Optional[int] = None
    elements: Optional[list[str]] = None
    expires_days: Optional[int] = None
    as_of: Optional[str] = None


class RevokeIn(BaseModel):
    channel: str = "PORTAL"
    operator: Optional[str] = None
    note: Optional[str] = None


class AsOf(BaseModel):
    as_of: Optional[str] = None


class VerifyIn(BaseModel):
    requester: str
    purpose: str
    question: str
    params: dict = {}
    person_id: Optional[int] = None
    reference_token: Optional[str] = None


@router.get("/api/x/purposes")
def purposes(_=Depends(auth.can_read)):
    return [{"code": k, "name": v["name"], "system": v["system"], "system_name": exchange.SYSTEMS[v["system"]], "uc": v["uc"],
             "consent_required": v["consent"], "elements": v["elements"]} for k, v in exchange.PURPOSES.items()]


@router.get("/api/x/questions")
def questions(_=Depends(auth.can_read)):
    return [{"code": k, **v} for k, v in exchange.QUESTIONS.items()]


# ---- policy
@router.get("/api/x/policy")
def policy(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return {"policies": exchange.policy_list(cur)}


@router.get("/api/x/policy/{key}/history")
def policy_history(key: str, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return run(exchange.policy_history, cur, key)


@router.post("/api/x/policy/preview")
def policy_preview(body: PolicyIn, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return run(exchange.impact, cur, body.key, body.value)


@router.post("/api/x/policy")
def policy_set(body: PolicyIn, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(exchange.set_policy, cur, body.key, body.value, u["actor"], body.note)


# ---- consent
@router.get("/api/x/consents")
def consents(status: Optional[str] = None, purpose: Optional[str] = None, person_id: Optional[int] = None, q: Optional[str] = None,
             limit: int = Query(50, le=200), offset: int = 0, date_from: Optional[date] = None, date_to: Optional[date] = None,
             sort: Optional[str] = None, dir: str = "desc", cur=Depends(cur_dep), u=Depends(auth.can_read)):
    return exchange.list_consents(cur, status, purpose, person_id, q, limit, offset, date_from, date_to, sort, dir,
                                  system=auth.scope(u))


@router.post("/api/x/consents/sweep")
def consents_sweep(body: AsOf, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(exchange.sweep, cur, u["actor"], body.as_of)


@router.get("/api/x/consents/{cid}")
def consent_get(cid: int, cur=Depends(cur_dep), u=Depends(auth.can_read)):
    return run(exchange.consent_detail, cur, cid, system=auth.scope(u))


@router.post("/api/x/consents")
def consent_new(body: ConsentIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    subject = body.subject_person_id
    if subject is None and body.purpose == "SCHOLARSHIP_ELIGIBILITY":
        # UC4: a minor's scholarship consent names the student as its subject, so a recorded parent can find it (PARENT_OF).
        age = run(exchange.person_age, cur, body.person_id)
        if age is not None and age < exchange.current(cur)["adult_age"]:
            subject = body.person_id
    return run(exchange.request_consent, cur, body.person_id, body.purpose, u["actor"], subject, None, body.channel)


@router.post("/api/x/consents/{cid}/respond")
def consent_respond(cid: int, body: RespondIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(exchange.respond, cur, cid, body.decision, u["actor"], body.channel, body.operator, body.note,
               body.given_by_person_id, body.elements, body.expires_days, body.as_of)


@router.post("/api/x/consents/{cid}/revoke")
def consent_revoke(cid: int, body: RevokeIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(exchange.revoke, cur, cid, u["actor"], body.channel, body.operator, body.note)


@router.post("/api/x/consents/{cid}/remind")
def consent_remind(cid: int, body: AsOf, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    dept = auth.scope(u)
    if dept:
        run(exchange.consent_detail, cur, cid, system=dept)  # 404 if not own department
    return run(exchange.remind, cur, cid, u["actor"], body.as_of)


@router.post("/api/x/persons/{pid}/handover")
def handover(pid: int, body: AsOf, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(exchange.handover_at_majority, cur, pid, u["actor"], body.as_of)


# ---- exchange
@router.post("/api/x/verify")
def verify(body: VerifyIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(exchange.verify, cur, body.requester, body.purpose, body.question, body.params, u["actor"], body.person_id, body.reference_token)


@router.get("/api/x/ledger")
def ledger(outcome: Optional[str] = None, person_id: Optional[int] = None, kind: Optional[str] = None, q: Optional[str] = None,
           limit: int = Query(50, le=200), offset: int = 0, date_from: Optional[date] = None, date_to: Optional[date] = None,
           sort: Optional[str] = None, dir: str = "desc", cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return exchange.list_ledger(cur, outcome, person_id, kind, limit, offset, q, date_from, date_to, sort, dir)


@router.get("/api/x/deliveries")
def deliveries(status: Optional[str] = None, limit: int = Query(50, le=200), offset: int = 0, cur=Depends(cur_dep), u=Depends(auth.can_read)):
    return exchange.list_deliveries(cur, status, limit, offset, system=auth.scope(u))


@router.get("/api/x/events")
def event_stream(uc: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None, limit: int = Query(50, le=200), offset: int = 0,
                 date_from: Optional[date] = None, date_to: Optional[date] = None, sort: Optional[str] = None, dir: str = "desc",
                 cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return exchange.event_stream(cur, uc, status, limit, offset, q, date_from, date_to, sort, dir)


@router.get("/api/x/events/{eid}/flow")
def event_flow(eid: int, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return run(exchange.event_flow, cur, eid)


@router.get("/api/x/approvals")
def approvals(system: Optional[str] = None, status: str = "PROPOSED", q: Optional[str] = None, uc: Optional[str] = None, limit: int = Query(50, le=200), offset: int = 0,
              cur=Depends(cur_dep), u=Depends(auth.can_read)):
    system = auth.scope(u) or system
    return exchange.approvals(cur, system, status, limit, offset, q, uc)


@router.get("/api/x/persons/{pid}/exchange")
def person_exchange(pid: int, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return exchange.person_exchange_summary(cur, pid)
