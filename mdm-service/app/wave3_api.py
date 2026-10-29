"""Wave 3 API: connectors, keys, access controls, partner API (key-authenticated), citizen view and assisted channel."""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from . import auth, wave3
from .api import cur_dep
from .stewardship import Refused

router = APIRouter()


def run(fn, *a, **k):
    try:
        return fn(*a, **k)
    except Refused as e:
        raise HTTPException(e.code, str(e))


class ConnIn(BaseModel):
    source: str
    name: Optional[str] = None
    system: str
    interface: Optional[str] = None
    auth_method: str
    schedule: Optional[str] = None
    mapping: dict = {}


class MapIn(BaseModel):
    mapping: dict


class StateIn(BaseModel):
    action: str
    reason: Optional[str] = None


class KeyIn(BaseModel):
    system: str
    label: Optional[str] = None
    scopes: list[str]
    days: int = 180


class ReasonIn(BaseModel):
    reason: Optional[str] = None


class BlockIn(BaseModel):
    actor: str
    reason: str


class PartnerIn(BaseModel):
    purpose: str
    question: str
    params: dict = {}
    reference_token: str


class AnswerIn(BaseModel):
    decision: str
    channel: str = "PORTAL"
    operator: Optional[str] = None
    elements: Optional[list[str]] = None


class WithdrawIn(BaseModel):
    channel: str = "PORTAL"
    operator: Optional[str] = None


class ReportIn(BaseModel):
    attribute: str
    current_value: Optional[str] = None
    reported_value: str
    reason: Optional[str] = None
    channel: str = "PORTAL"
    operator: Optional[str] = None


class DeclareIn(BaseModel):
    spouse_name: str
    channel: str = "PORTAL"
    operator: Optional[str] = None


class SessionIn(BaseModel):
    operator: str
    token: str
    visit_reason: Optional[str] = None


# ---- connectors
@router.get("/api/x/connectors")
def connectors(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return wave3.list_connectors(cur)


@router.post("/api/x/connectors")
def connector_new(body: ConnIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(wave3.create_connector, cur, body.model_dump(), u["actor"])


@router.get("/api/x/connectors/{cid}")
def connector_get(cid: int, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return run(wave3.get_connector, cur, cid)


@router.post("/api/x/connectors/{cid}/mapping")
def connector_mapping(cid: int, body: MapIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(wave3.update_mapping, cur, cid, body.mapping, u["actor"])


@router.post("/api/x/connectors/{cid}/test")
def connector_test(cid: int, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(wave3.test_connector, cur, cid, u["actor"])


@router.post("/api/x/connectors/{cid}/state")
def connector_state(cid: int, body: StateIn, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(wave3.set_state, cur, cid, body.action, u["actor"], body.reason)


# ---- keys
@router.get("/api/x/keys")
def keys(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return wave3.list_keys(cur)


@router.post("/api/x/keys")
def key_new(body: KeyIn, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(wave3.issue_key, cur, body.system, body.label or "", body.scopes, body.days, u["actor"])


@router.post("/api/x/keys/{key_id}/rotate")
def key_rotate(key_id: str, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(wave3.rotate_key, cur, key_id, u["actor"])


@router.post("/api/x/keys/{key_id}/revoke")
def key_revoke(key_id: str, body: ReasonIn, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(wave3.revoke_key, cur, key_id, u["actor"], body.reason)


# ---- partner API (a department's system calls this with its key; no officer sign-in)
@router.post("/api/partner/verify")
def partner_verify(body: PartnerIn, x_api_key: Optional[str] = Header(None), cur=Depends(cur_dep)):
    k = run(wave3.key_from_header, cur, x_api_key)
    return run(wave3.partner_verify, cur, k, body.purpose, body.question, body.params, body.reference_token)


@router.get("/api/partner/catalogue")
def partner_catalogue(x_api_key: Optional[str] = Header(None), cur=Depends(cur_dep)):
    return wave3.partner_catalogue(run(wave3.key_from_header, cur, x_api_key))


# ---- access and misuse
@router.get("/api/x/access")
def access(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return wave3.access_overview(cur)


@router.post("/api/x/access/block")
def access_block(body: BlockIn, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(wave3.block_actor, cur, body.actor, body.reason, u["actor"])


@router.post("/api/x/access/{bid}/lift")
def access_lift(bid: int, body: ReasonIn, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(wave3.unblock_actor, cur, bid, u["actor"], body.reason)


# ---- citizen view (the identity reference token stands in for the citizen's sign-in)
@router.get("/api/x/citizen/{token}")
def citizen_data(token: str, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return run(wave3.my_data, cur, token)


@router.post("/api/x/citizen/{token}/consents/{cid}/respond")
def citizen_answer(token: str, cid: int, body: AnswerIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(wave3.my_consent_answer, cur, token, cid, body.decision, body.channel, body.operator, body.elements, u["actor"])


@router.post("/api/x/citizen/{token}/consents/{cid}/withdraw")
def citizen_withdraw(token: str, cid: int, body: WithdrawIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(wave3.my_consent_withdraw, cur, token, cid, body.channel, body.operator, u["actor"])


@router.post("/api/x/citizen/{token}/report")
def citizen_report(token: str, body: ReportIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(wave3.my_report, cur, token, body.attribute, body.current_value, body.reported_value, body.reason, body.channel, body.operator, u["actor"])


@router.post("/api/x/citizen/{token}/declaration")
def citizen_declare(token: str, body: DeclareIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(wave3.my_declaration, cur, token, body.spouse_name, body.channel, body.operator, u["actor"])


# ---- assisted channel
@router.get("/api/x/sessions")
def sessions(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return wave3.list_sessions(cur)


@router.post("/api/x/sessions")
def session_start(body: SessionIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(wave3.start_session, cur, body.operator, body.token, body.visit_reason, u["actor"])


@router.post("/api/x/sessions/{sid}/end")
def session_end(sid: int, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(wave3.end_session, cur, sid, u["actor"])
