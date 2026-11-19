"""Department feed API. Officers manage response times, channels and see notices (/api/x); a department uses its key (/api/partner)."""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel

from . import auth, feed, wave3
from .api import cur_dep
from .stewardship import Refused

router = APIRouter()


def run(fn, *a, **k):
    try:
        return fn(*a, **k)
    except Refused as e:
        raise HTTPException(e.code, str(e))


class RuleIn(BaseModel):
    scope: str
    key: str
    days: int
    day_kind: str
    note: Optional[str] = None


class RuleDel(BaseModel):
    scope: str = "USE"
    key: str
    note: Optional[str] = None


class ChannelIn(BaseModel):
    channel: str
    note: Optional[str] = None


class BatchItem(BaseModel):
    notice_id: int
    outcome: Optional[str] = None
    reason: Optional[str] = None
    department_ref: Optional[str] = None


class BatchIn(BaseModel):
    answers: list[BatchItem]
    shared_reason: Optional[str] = None
    check_only: bool = False


class AllIn(BaseModel):
    system: str
    outcome: str
    reason: Optional[str] = None
    check_only: bool = False


def _csv(text: str, name: str) -> Response:
    return Response(content=text, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}"'})


async def _body_text(request: Request) -> str:
    raw = await request.body()
    if len(raw) > 2_000_000:
        raise HTTPException(413, "The file is too large (2 MB at most)")
    return raw.decode("utf-8-sig", errors="replace")


class AnswerIn(BaseModel):
    outcome: str
    reason: Optional[str] = None
    department_ref: Optional[str] = None


# ---- response times
@router.get("/api/x/response-rules")
def rules(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return feed.rules_list(cur)


@router.get("/api/x/response-rules/history")
def rule_history(scope: str, key: str, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return {"history": feed.rule_history(cur, scope.upper(), key)}


@router.put("/api/x/response-rules")
def rule_set(body: RuleIn, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(feed.rule_set, cur, body.scope, body.key, body.days, body.day_kind, u["actor"], body.note)


@router.post("/api/x/response-rules/remove")
def rule_remove(body: RuleDel, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(feed.rule_remove, cur, body.scope, body.key, u["actor"], body.note)


# ---- channels
@router.get("/api/x/channels")
def channels(cur=Depends(cur_dep), u=Depends(auth.can_read)):
    return {"channels": feed.channels(cur, auth.scope(u))}


@router.put("/api/x/channels/{system}")
def channel_set(system: str, body: ChannelIn, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(feed.set_channel, cur, system, body.channel, u["actor"], body.note)


# ---- notices (officer view) and the demo stand-in
@router.get("/api/x/notices")
def notices(system: Optional[str] = None, state: Optional[str] = None, q: Optional[str] = None,
            limit: int = Query(25, le=200), offset: int = 0, sort: Optional[str] = None, dir: Optional[str] = None,
            cur=Depends(cur_dep), u=Depends(auth.can_read)):
    system = auth.scope(u) or system
    return feed.list_notices(cur, system, state, (q or "").strip() or None, limit, offset, sort, dir)


@router.get("/api/x/events/{event_id}/notices")
def event_notices(event_id: int, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return {"notices": feed.notices_for_event(cur, event_id)}


@router.post("/api/x/notices/{notice_id}/simulate")
def simulate(notice_id: int, body: AnswerIn, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(feed.simulate, cur, notice_id, body.outcome, body.reason, body.department_ref, u["actor"])


# ---- partner API (a department's system, with its key; no officer sign-in)
@router.get("/api/partner/feed")
def partner_feed(after: int = 0, limit: int = Query(50, le=200), answered: bool = False,
                 x_api_key: Optional[str] = Header(None), cur=Depends(cur_dep)):
    k = run(wave3.key_from_header, cur, x_api_key)
    return run(feed.feed, cur, k, after, limit, answered)


@router.post("/api/partner/feed/{notice_id}/response")
def partner_response(notice_id: int, body: AnswerIn, x_api_key: Optional[str] = Header(None), cur=Depends(cur_dep)):
    k = run(wave3.key_from_header, cur, x_api_key)
    return run(feed.respond, cur, notice_id, body.outcome, body.reason, body.department_ref, "FEED", f"partner:{k['key_id']}", k["system"])


# ---- many answers at once (partner key)
@router.get("/api/partner/feed/file")
def partner_file(answered: bool = False, x_api_key: Optional[str] = Header(None), cur=Depends(cur_dep)):
    k = run(wave3.key_from_header, cur, x_api_key)
    return _csv(run(feed.export_csv, cur, k, None, answered), f"open-notices-{k['system']}.csv")


@router.post("/api/partner/feed/responses")
def partner_batch(body: BatchIn, format: str = "json", x_api_key: Optional[str] = Header(None), cur=Depends(cur_dep)):
    k = run(wave3.key_from_header, cur, x_api_key)
    res = run(feed.respond_batch, cur, [a.model_dump() for a in body.answers], "FEED", f"partner:{k['key_id']}", k["system"], body.shared_reason, body.check_only, "batch call")
    return _csv(feed.results_csv(res), "results.csv") if format == "csv" else res


@router.post("/api/partner/feed/responses/file")
async def partner_batch_file(request: Request, check_only: bool = False, shared_reason: Optional[str] = None, format: str = "json",
                             x_api_key: Optional[str] = Header(None), cur=Depends(cur_dep)):
    k = run(wave3.key_from_header, cur, x_api_key)
    answers = run(feed.parse_answers_csv, await _body_text(request))
    res = run(feed.respond_batch, cur, answers, "FILE", f"partner:{k['key_id']}", k["system"], shared_reason, check_only, "file upload")
    return _csv(feed.results_csv(res), "results.csv") if format == "csv" else res


# ---- many answers at once (officer simulator)
@router.get("/api/x/notices/export")
def notices_export(system: str, answered: bool = False, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return _csv(run(feed.export_csv, cur, None, system, answered), f"open-notices-{system}.csv")


@router.post("/api/x/notices/batch")
def officer_batch(body: BatchIn, system: str, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(feed.respond_batch, cur, [a.model_dump() for a in body.answers], "SIMULATED", u["actor"], system, body.shared_reason, body.check_only, "simulator batch")


@router.post("/api/x/notices/file")
async def officer_file(request: Request, system: str, check_only: bool = False, shared_reason: Optional[str] = None,
                       cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    answers = run(feed.parse_answers_csv, await _body_text(request))
    return run(feed.respond_batch, cur, answers, "SIMULATED", u["actor"], system, shared_reason, check_only, "simulator file")


@router.post("/api/x/notices/answer-all")
def officer_all(body: AllIn, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(feed.answer_all_waiting, cur, body.system, body.outcome, body.reason, "SIM", u["actor"], body.check_only, "SIMULATED")
