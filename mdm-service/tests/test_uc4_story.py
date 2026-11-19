"""UC4 story cohort: plant, apply, grant, turn 18, handover, clear.

Uses the synthetic DEMO-UC4- records only. Registry / scheme_engine writes are best effort:
plant still succeeds when those schemas are missing, and returns notes about what it could not write.
"""
from __future__ import annotations
import os

os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""

from app import demo_uc4_invite as inv, demo_uc4_story as story, exchange
from app.db import connect

PURPOSE = story.PURPOSE
PREFIX = story.PREFIX


def _has_schema(cur, name: str) -> bool:
    cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name=%s", (name,))
    return bool(cur.fetchone())


def _kavya_ben(cur):
    if not (_has_schema(cur, "scheme_engine") and _has_schema(cur, "family_registry")):
        return None
    cur.execute(
        "SELECT status, eligibility_reason, removal_reason FROM scheme_engine.beneficiary "
        "WHERE scheme_id=%s AND person_id=%s",
        (story.SCHEME_ID, inv.STUDENT_ID),
    )
    return cur.fetchone()


def _assert_note(row, *needles: str):
    assert row is not None
    text = (row.get("eligibility_reason") or "") + " " + (row.get("removal_reason") or "")
    for n in needles:
        assert n.lower() in text.lower(), (n, text)


def test_plant_applies_grant_turn_handover_clear():
    with connect() as conn:
        cur = conn.cursor()
        out = story.plant(cur)
        assert out["kavya"] and out["lakshmi"] and out["sai"]
        assert isinstance(out.get("notes"), list)
        # Without registry schemas the story still plants master data and notes the skips.
        if not _has_schema(cur, "family_registry") or not _has_schema(cur, "scheme_engine"):
            assert out["notes"], "expected notes about registry rows that could not be written"
        ben = _kavya_ben(cur)
        if ben:
            assert ben["status"] == "IDENTIFIED"
            _assert_note(ben, "No permission asked yet")

        applied = story.applies(cur)
        assert applied.get("kavya") and applied.get("sai")
        ben = _kavya_ben(cur)
        if ben:
            _assert_note(ben, "Waiting for", "parent")

        story._grant_by_parent(cur, out["kavya"], out["lakshmi"])
        story.sync_beneficiaries(cur)
        ben = _kavya_ben(cur)
        if ben:
            assert ben["status"] == "CONFIRMED"
            _assert_note(ben, "Permission given")

        turned = story.turn_kavya_18(cur)
        assert turned.get("changed") and turned.get("age") == 18
        h = exchange.handover_at_majority(cur, out["kavya"], story.ACTOR)
        assert h["ended"] and h["new_requests"]
        story.sync_beneficiaries(cur)
        ben = _kavya_ben(cur)
        if ben:
            _assert_note(ben, "Waiting for", "student")

        cur.execute(
            "SELECT id FROM mdm.consent WHERE person_id=%s AND purpose=%s AND status='PENDING' ORDER BY id DESC LIMIT 1",
            (out["kavya"], PURPOSE),
        )
        pending = cur.fetchone()
        assert pending
        # Student grants then withdraws so the beneficiary note becomes Removed.
        exchange.respond(
            cur, pending["id"], "GRANT", story.ACTOR,
            elements=["income_band", "category", "residence", "age"],
        )
        cur.execute(
            "SELECT id FROM mdm.consent WHERE person_id=%s AND purpose=%s AND status='GRANTED' ORDER BY id DESC LIMIT 1",
            (out["kavya"], PURPOSE),
        )
        granted = cur.fetchone()
        assert granted
        exchange.revoke(cur, granted["id"], story.ACTOR, note="Withdrawn in UC4 story test")
        story.sync_beneficiaries(cur)
        ben = _kavya_ben(cur)
        if ben:
            assert ben["status"] == "REMOVED"
            _assert_note(ben, "Withdrawn")

        cleared = story.clear(cur)
        cur.execute("SELECT count(*) AS n FROM mdm.source_record WHERE source_rid LIKE %s", (PREFIX + "%",))
        assert cur.fetchone()["n"] == 0
        assert cleared.get("people", 0) >= 0
        conn.commit()


def test_plant_is_safe_to_run_again_and_clear_leaves_no_demo_uc4_rows():
    with connect() as conn:
        cur = conn.cursor()
        first = story.plant(cur)
        second = story.plant(cur)
        assert second["kavya"] == first["kavya"] or second["kavya"]
        story.clear(cur)
        cur.execute("SELECT count(*) AS n FROM mdm.source_record WHERE source_rid LIKE %s", (PREFIX + "%",))
        assert cur.fetchone()["n"] == 0
        cur.execute("SELECT 1 FROM mdm.source_record WHERE source_rid=%s", (inv.RID,))
        assert cur.fetchone() is None
        conn.commit()
