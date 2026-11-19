"""UC5 route under /api/x: counts of housing checks by outcome. Not on the department allow-list, so a department-scoped
officer gets 403 from the middleware; a read role is enough."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from . import auth, uc5
from .api import cur_dep
from .stewardship import Refused

router = APIRouter()


@router.get("/api/x/housing/outcomes")
def housing_outcomes(days: int = Query(7, ge=1, le=90), cur=Depends(cur_dep), u=Depends(auth.can_read)):
    try:
        return uc5.housing_outcomes(cur, days)
    except Refused as e:
        raise HTTPException(e.code, str(e))
