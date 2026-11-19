"""UC5 demo cases: plant (five households and a housing applicant with a sign-in), second plant is clean, clear removes everything.

Uses the synthetic DEMO-UC5- records only. Needs the database, like the other story tests."""
from __future__ import annotations
import os

os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""

from app import citizen, demo_uc5_story as story
from app.db import connect


def _count(cur):
    cur.execute("SELECT count(*) AS n FROM mdm.source_record WHERE source_rid LIKE %s", (story.PREFIX + "%",))
    return cur.fetchone()["n"]


def test_plant_raises_the_right_items_and_clear_removes_all():
    with connect() as conn:
        cur = conn.cursor()
        out = story.plant(cur)
        got = {r["case"]: r["reason_code"] for r in out["cases"]}
        assert got == story.EXPECT
        ap = citizen.list_approvals(cur, story.LOGIN)
        assert any(i.get("status") == "PENDING" for i in ap["items"]), "the applicant has a consent card waiting"
        again = story.plant(cur)                       # plant clears first, so a second run is the same, not doubled
        assert {r["case"]: r["reason_code"] for r in again["cases"]} == story.EXPECT
        cur.execute("SELECT count(*) AS n FROM mdm.citizen_link WHERE aadhaar_ref=%s", (story.LOGIN,))
        assert cur.fetchone()["n"] == 1
        story.clear(cur)
        assert _count(cur) == 0
        cur.execute("SELECT count(*) AS n FROM mdm.citizen_link WHERE aadhaar_ref=%s", (story.LOGIN,))
        assert cur.fetchone()["n"] == 0
        conn.rollback()
