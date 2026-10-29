"""Demo API under /api/x/demo: scenario runner, event injector, evidence pack and written-evidence register."""
from __future__ import annotations
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from . import auth, demo
from .api import cur_dep
from .stewardship import Refused

router = APIRouter()


def run(fn, *a, **k):
    try:
        return fn(*a, **k)
    except Refused as e:
        raise HTTPException(e.code, str(e))


class RunIn(BaseModel):
    kind: str = "ALL"


class InjectIn(BaseModel):
    category: str
    params: dict[str, Any] = {}


class DocIn(BaseModel):
    status: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    owner: Optional[str] = None


@router.get("/api/x/demo/scenarios")
def scenarios(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return demo.catalogue(cur)


@router.post("/api/x/demo/runs")
def start(body: RunIn, u=Depends(auth.can_write)):
    return {"run_id": run(demo.start_run, u["actor"], body.kind)}


@router.post("/api/x/demo/runs/{run_id}/scenarios/{sid}")
def one(run_id: int, sid: str, u=Depends(auth.can_write)):
    return run(demo.run_scenario, run_id, sid, u["actor"])


@router.post("/api/x/demo/runs/{run_id}/finish")
def finish(run_id: int, u=Depends(auth.can_write)):
    return run(demo.finish_run, run_id, u["actor"])


@router.get("/api/x/demo/runs/latest")
def latest(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return run(demo.get_run, cur, None)


@router.get("/api/x/demo/runs/{run_id}")
def get_run(run_id: int, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return run(demo.get_run, cur, run_id)


@router.get("/api/x/demo/injections")
def injections(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return {"categories": demo.injection_list(), "log": demo.injection_log(cur)}


@router.post("/api/x/demo/inject")
def inject(body: InjectIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(demo.inject, cur, body.category, body.params, u["actor"])


@router.get("/api/x/demo/documents")
def docs(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return demo.documents(cur)


@router.put("/api/x/demo/documents/{item}")
def put_doc(item: str, body: DocIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(demo.update_document, cur, item, body.model_dump(exclude_none=True), u["actor"])


@router.get("/api/x/demo/evidence")
def evidence(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return demo.evidence_pack(cur)


@router.get("/api/x/demo/evidence.md", response_class=PlainTextResponse)
def evidence_md(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return demo.evidence_markdown(demo.evidence_pack(cur))


@router.post("/api/x/demo/reset")
def reset(cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(demo.reset, cur, u["actor"])
