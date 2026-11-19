"""Lineage API under /api/x/lineage."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException

from . import auth, lineage
from .api import cur_dep
from .stewardship import Refused

router = APIRouter()


def run(fn, *a, **k):
    try:
        return fn(*a, **k)
    except Refused as e:
        raise HTTPException(e.code, str(e))


@router.get("/api/x/lineage/overview")
def overview(source: str | None = None, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return lineage.overview(cur, source or None)


@router.get("/api/x/lineage/person/{pid}")
def person(pid: int, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return run(lineage.person_lineage, cur, pid)


@router.get("/api/x/lineage/event/{eid}")
def event(eid: int, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return run(lineage.event_flow, cur, eid)


@router.get("/api/x/lineage/export")
def export(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return lineage.export(cur)
