"""UC4 routes under /api/x: the daily job, the turning-18 invitation and the scholarship outcome counts.

None of these four routes is on the department allow-list (auth._DEPT_ALLOW), so a department-scoped officer gets 403
from the middleware. The job routes need an admin role; the invitation needs a write role; the counts need a read role."""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from fastapi import HTTPException

from . import auth, notify, uc4
from .api import cur_dep
from .stewardship import Refused

router = APIRouter()


def run(fn, *a, **k):
    try:
        return fn(*a, **k)
    except Refused as e:
        raise HTTPException(e.code, str(e))


class DailyIn(BaseModel):
    as_of: Optional[str] = None


class InviteIn(BaseModel):
    person_ids: Optional[list[int]] = None
    filter: Optional[dict] = None
    preview: bool = False
    as_of: Optional[str] = None


@router.post("/api/x/jobs/daily")
def jobs_daily(body: DailyIn, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    """Admin only, or a scheduler holding an admin service credential. Idempotent; one job_run row per run."""
    return run(uc4.daily_job, cur, u["actor"], body.as_of)


@router.get("/api/x/jobs/last")
def jobs_last(job: str = "daily", cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    return run(uc4.last_run, cur, job)


@router.post("/api/x/turning-18/invite")
def turning_18_invite(body: InviteIn, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    """An invitation to apply is a notice, not a consent request. Preview first; one notice per person, ever."""
    # With notices switched on, a person is marked invited only when the notice really went out, so a failed send is tried again.
    # With notices off (demo), the invitation is recorded and the result says no notice was sent.
    on = notify.enabled()
    out = run(uc4.invite, cur, body.person_ids, u["actor"], body.preview, body.filter, on, body.as_of)
    return {**out, "notifications_on": on}


@router.get("/api/x/eligibility/outcomes")
def eligibility_outcomes(days: int = Query(7, ge=1, le=90), cur=Depends(cur_dep), u=Depends(auth.can_read)):
    return run(uc4.eligibility_outcomes, cur, days)
