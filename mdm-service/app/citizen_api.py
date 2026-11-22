"""Citizen-facing routes. Authenticated with the citizen's own sign-in token, not an officer role. Only /api/citizen/* is exposed to the citizen portal."""
from __future__ import annotations
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from . import auth, citizen, dept_profile
from .api import cur_dep
from .stewardship import Refused

router = APIRouter()


def run(fn, *a, **k):
    try:
        return fn(*a, **k)
    except Refused as e:
        raise HTTPException(e.code, str(e))


def me(authorization: str = Header(default="")) -> str:
    return run(citizen.verify_citizen_token, authorization)


class AnswerIn(BaseModel):
    decision: str
    elements: Optional[list[str]] = None


class LinkIn(BaseModel):
    aadhaar_ref: str
    person_id: int


class LineAnswer(BaseModel):
    consent_id: int
    decision: str
    elements: Optional[list[str]] = None


class EventAnswerIn(BaseModel):
    relationship: Optional[str] = None
    declared: bool = False
    answers: list[LineAnswer] = Field(default_factory=list)


class ConsentAnswerIn(BaseModel):
    decision: str
    elements: Optional[list[str]] = None
    relationship: Optional[str] = None
    declared: bool = False


class RequestAnswerIn(BaseModel):
    decision: str
    note: Optional[str] = None
    choice: Optional[str] = None            # CONFIRM_DETAILS about two departments' values: A, B or OTHER
    reported_value: Optional[str] = None    # what it should be, when the answer is OTHER or a dispute


class ReportIn(BaseModel):
    attribute: str
    reported_value: str
    reason: Optional[str] = None


class CitizenRequestIn(BaseModel):
    person_id: int
    subject_person_id: Optional[int] = None
    kind: str
    summary: str
    detail: Optional[dict[str, Any]] = None
    proposal_id: Optional[int] = None
    attribute: Optional[str] = None


@router.get("/api/citizen/consents")
def my_consents(ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(citizen.inbox, cur, ref)


@router.post("/api/citizen/consents/{cid}/respond")
def my_answer(cid: int, body: AnswerIn, ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(citizen.answer, cur, ref, cid, body.decision, body.elements)


@router.post("/api/citizen/consents/{cid}/withdraw")
def my_withdraw(cid: int, ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(citizen.withdraw, cur, ref, cid)


@router.get("/api/citizen/approvals/summary")
def approvals_summary(ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(citizen.summary, cur, ref)


@router.get("/api/citizen/approvals")
def approvals_list(ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(citizen.list_approvals, cur, ref)


@router.get("/api/citizen/approvals/{key}")
def approvals_one(key: str, ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(citizen.get_approval, cur, ref, key)


@router.post("/api/citizen/approvals/event-{eid}/answer")
def approvals_answer_event(eid: int, body: EventAnswerIn, ref: str = Depends(me), cur=Depends(cur_dep)):
    answers = [a.model_dump() for a in body.answers]
    return run(citizen.answer_event, cur, ref, eid, body.relationship, body.declared, answers)


@router.post("/api/citizen/approvals/consent-{cid}/answer")
def approvals_answer_consent(cid: int, body: ConsentAnswerIn, ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(citizen.answer_consent, cur, ref, cid, body.decision, body.elements, body.relationship, body.declared)


@router.post("/api/citizen/approvals/req-{rid}/answer")
def approvals_answer_request(rid: int, body: RequestAnswerIn, ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(citizen.answer_request, cur, ref, rid, body.decision, body.note, body.choice, body.reported_value)


@router.get("/api/citizen/reports/options")
def report_options(ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(citizen.report_options, cur, ref)


@router.post("/api/citizen/reports")
def report_new(body: ReportIn, ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(citizen.report_wrong_detail, cur, ref, body.attribute, body.reported_value, body.reason)


@router.get("/api/citizen/reports")
def reports_list(ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(citizen.list_reports, cur, ref)


@router.get("/api/citizen/records")
def my_records(ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(lambda: dept_profile.profile(cur, citizen.person_of(cur, ref)))


@router.get("/api/citizen/household")
def my_household(ref: str = Depends(me), cur=Depends(cur_dep)):
    return run(citizen.household, cur, ref)


# officer side: bind a sign-in reference to a master person
@router.post("/api/x/citizen-links")
def make_link(body: LinkIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(citizen.link, cur, body.aadhaar_ref, body.person_id, u["actor"])


@router.post("/api/x/citizen-requests")
def make_citizen_request(body: CitizenRequestIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(citizen.raise_request, cur, body.person_id, body.kind, body.summary, body.detail,
               u["actor"], body.subject_person_id, body.proposal_id, None, body.attribute)


@router.post("/api/x/citizen-requests/auto-confirm")
def auto_confirm(cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    """Admin only, idempotent: scan for details departments hold differently and ask the citizen to confirm (UC1 X2)."""
    return run(citizen.auto_confirm_scan, cur, u["actor"])
