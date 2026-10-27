"""Operations API under /api/x: control tower, discrepancies, query builder, catalogue, standards, retention, audit explorer, household."""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from . import auth, audit, exchange, ops
from .api import cur_dep
from .stewardship import Refused

router = APIRouter()


def run(fn, *a, **k):
    try:
        return fn(*a, **k)
    except Refused as e:
        raise HTTPException(e.code, str(e))


class DiscIn(BaseModel):
    person_id: int
    attribute: str
    current_value: Optional[str] = None
    reported_value: str
    reason: Optional[str] = None
    channel: str = "OFFICER"
    operator: Optional[str] = None
    authoritative_system: Optional[str] = None


class DeclIn(BaseModel):
    person_id: int
    spouse_name: str
    channel: str = "PORTAL"
    operator: Optional[str] = None
    note: Optional[str] = None


class ResolveIn(BaseModel):
    outcome: str
    note: Optional[str] = None


class QueryIn(BaseModel):
    requester: str
    purpose: str
    elements: list[str]
    filters: dict = {}


class NormIn(BaseModel):
    kind: str
    text: str
    other: Optional[str] = None


class PurgeIn(BaseModel):
    what: str = "expired_results"
    thin_events: bool = False


class WithdrawIn(BaseModel):
    person_id: int
    purpose: str
    channel: str = "PORTAL"
    operator: Optional[str] = None


class SubIn(BaseModel):
    available: bool
    note: Optional[str] = None


class LoadIn(BaseModel):
    requests: int
    seconds: float
    ok: int
    errors: int
    p50_ms: Optional[int] = None
    p95_ms: Optional[int] = None
    rps: Optional[float] = None
    note: Optional[str] = None


@router.get("/api/x/control")
def control(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return ops.control_tower(cur)


@router.get("/api/x/subscribers")
def subscribers(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return exchange.list_subscribers(cur)


@router.post("/api/x/subscribers/{system}")
def subscriber_set(system: str, body: SubIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    r = run(exchange.set_subscriber, cur, system, body.available, u["actor"], body.note)
    if body.available:
        r["retried"] = exchange.retry_due(cur, u["actor"])
    return r


@router.post("/api/x/deliveries/retry")
def deliveries_retry(cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return exchange.retry_due(cur, u["actor"])


@router.post("/api/x/deliveries/{did}/redeliver")
def delivery_redeliver(did: int, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(exchange.redeliver, cur, did, u["actor"])


@router.get("/api/x/discrepancies")
def discrepancies(status: Optional[str] = None, kind: Optional[str] = None, person_id: Optional[int] = None,
                  limit: int = Query(50, le=200), offset: int = 0, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return ops.list_discrepancies(cur, status, kind, person_id, limit, offset)


@router.post("/api/x/discrepancies")
def discrepancy_new(body: DiscIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(ops.raise_discrepancy, cur, body.person_id, body.attribute, body.current_value, body.reported_value, body.reason, u["actor"],
               body.channel, body.operator, body.authoritative_system)


@router.post("/api/x/declarations")
def declaration_new(body: DeclIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(ops.declare_marriage, cur, body.person_id, body.spouse_name, u["actor"], body.channel, body.operator, body.note)


@router.post("/api/x/discrepancies/{did}/resolve")
def discrepancy_resolve(did: int, body: ResolveIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(ops.resolve_discrepancy, cur, did, body.outcome, u["actor"], body.note)


@router.post("/api/x/query")
def query(body: QueryIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(ops.run_query, cur, body.requester, body.purpose, body.elements, body.filters, u["actor"])


@router.get("/api/x/catalogue")
def catalogue(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return ops.catalogue(cur)


@router.get("/api/x/registry")
def registry(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return ops.registry(cur)


@router.get("/api/x/standards")
def standards(_=Depends(auth.can_read)):
    return ops.standards()


@router.post("/api/x/standards/test")
def standards_test(body: NormIn, _=Depends(auth.can_read)):
    return run(ops.normalise, body.kind, body.text, body.other)


@router.get("/api/x/retention")
def retention(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return ops.retention_statement(cur)


@router.post("/api/x/retention/purge")
def retention_purge(body: PurgeIn, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(ops.purge, cur, u["actor"], body.what, body.thin_events)


@router.post("/api/x/retention/withdraw")
def retention_withdraw(body: WithdrawIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(ops.withdraw_and_purge, cur, body.person_id, body.purpose, u["actor"], body.channel, body.operator)


@router.get("/api/x/audit")
def audit_list(actor: Optional[str] = None, subject: Optional[str] = None, action: Optional[str] = None, q: Optional[str] = None,
               limit: int = Query(50, le=200), offset: int = 0, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return ops.list_audit(cur, actor, subject, action, q, limit, offset)


@router.post("/api/x/audit/tamper-demo")
def audit_tamper(cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(ops.tamper_demo, cur, u["actor"])


@router.get("/api/x/persons/{pid}/household")
def person_household(pid: int, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return run(ops.household, cur, pid)


@router.get("/api/x/loadtests")
def loadtests(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return ops.list_loadtests(cur, 20)


@router.post("/api/x/loadtests")
def loadtest_new(body: LoadIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return ops.record_loadtest(cur, body.model_dump(), u["actor"])
