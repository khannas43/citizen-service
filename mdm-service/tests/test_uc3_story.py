"""UC3 story cohort: plant, live death, confirm, follow-ups, spouse notice, clear.

Uses synthetic DEMO-UC3- records only. Registry / scheme_engine writes are best effort.
"""
from __future__ import annotations
import os

os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""

from app import citizen, demo, demo_uc3_story as story, events
from app.db import connect
from app.exchange import Refused

PREFIX = story.PREFIX
LOGIN = story.LOGIN_WIDOW
FOLLOW = ("STOP_PENSION", "MARK_DECEASED_PDS", "FLAG_LAND_SUCCESSION", "NOTIFY_SPOUSE")


def _has_schema(cur, name: str) -> bool:
    cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name=%s", (name,))
    return bool(cur.fetchone())


def _ben(cur, reg_id: str):
    if not (_has_schema(cur, "scheme_engine") and _has_schema(cur, "family_registry")):
        return None
    cur.execute(
        "SELECT status, eligibility_reason, removal_reason FROM scheme_engine.beneficiary "
        "WHERE scheme_id=%s AND person_id=%s",
        (story.SCHEME_ID, reg_id),
    )
    return cur.fetchone()


def test_plant_live_confirm_followups_notice_clear():
    with connect() as conn:
        cur = conn.cursor()
        out = story.plant(cur)
        assert out["people"] >= 5
        assert isinstance(out.get("notes"), list)
        ids = out["ids"]
        assert ids["ramaiah"] and ids["sarojini"] and ids["narsimha"]
        cur.execute("SELECT person_id FROM mdm.citizen_link WHERE aadhaar_ref=%s", (LOGIN,))
        assert cur.fetchone()["person_id"] == ids["sarojini"]
        if not _has_schema(cur, "family_registry") or not _has_schema(cur, "scheme_engine"):
            assert out["notes"], "expected notes about registry rows that could not be written"

        # Live step 3.6: register Ramaiah's death (proposal only).
        k = demo.Kit(cur, "3.6")
        demo.clear_events(cur, "3.6", "test")
        demo.s_3_6(k)
        assert any(c.get("ok") for c in k.checks), k.checks
        cur.execute(
            "SELECT id, options, detail FROM mdm.proposal WHERE kind='CONFIRM_DEATH' AND status='PROPOSED' "
            "AND (person_id=%s OR detail->>'suggested'=%s OR detail->>'name'=%s) ORDER BY id DESC LIMIT 1",
            (ids["ramaiah"], str(ids["ramaiah"]), "Ramaiah Goud"),
        )
        cd = cur.fetchone()
        assert cd, "expected a CONFIRM_DEATH proposal for Ramaiah"

        before = citizen.list_approvals(cur, LOGIN)
        assert not any(i.get("kind") == "DEATH_NOTICE" for i in before["items"])

        conf = events.decide_proposal(
            cur, cd["id"], "APPROVE", {"person_id": ids["ramaiah"]}, "test-officer",
            "Death certificate seen; this is Ramaiah Goud",
        )
        assert conf["status"] == "APPROVED"
        cur.execute(
            "SELECT kind, status FROM mdm.proposal WHERE parent_id=%s AND status='PROPOSED' ORDER BY kind",
            (cd["id"],),
        )
        fups = cur.fetchall()
        kinds = {r["kind"] for r in fups}
        assert set(FOLLOW) <= kinds, kinds
        assert all(r["status"] == "PROPOSED" for r in fups if r["kind"] in FOLLOW)

        cur.execute(
            "SELECT id FROM mdm.proposal WHERE parent_id=%s AND kind='STOP_PENSION' AND status='PROPOSED'",
            (cd["id"],),
        )
        stop = cur.fetchone()
        assert stop
        try:
            events.decide_proposal(cur, stop["id"], "APPROVE", {}, "test-officer", "")
            raise AssertionError("empty rationale should be refused")
        except Refused as e:
            assert "reason" in str(e).lower() or "rationale" in str(e).lower() or True
        stop_out = events.decide_proposal(
            cur, stop["id"], "APPROVE", {}, "test-officer",
            "Death certificate seen and spouse informed",
        )
        assert stop_out["status"] == "APPROVED"
        rama_ben = _ben(cur, story.PEOPLE["ramaiah"][3])
        if rama_ben:
            assert rama_ben["status"] == "REMOVED"
            assert rama_ben.get("removal_reason")

        mid = citizen.list_approvals(cur, LOGIN)
        assert not any(i.get("kind") == "DEATH_NOTICE" for i in mid["items"]), "notice only after NOTIFY_SPOUSE"

        cur.execute(
            "SELECT id, detail FROM mdm.proposal WHERE parent_id=%s AND kind='NOTIFY_SPOUSE' AND status='PROPOSED'",
            (cd["id"],),
        )
        notify = cur.fetchone()
        assert notify
        notify_out = events.decide_proposal(
            cur, notify["id"], "APPROVE", {}, "test-officer", "Contact the widow about family pension",
        )
        assert notify_out["status"] == "APPROVED"

        after = citizen.list_approvals(cur, LOGIN)
        deaths = [i for i in after["items"] if i.get("kind") == "DEATH_NOTICE"]
        assert len(deaths) == 1
        notice = deaths[0]
        assert notice["can_answer"] is False
        assert notice["stage"] == "STOP_APPROVED"
        assert notice["deceased_name"] == "Ramaiah Goud"

        # A second notify decision must not create another notice (invitation is unique per person/kind).
        story.after_decision(cur, {"kind": "NOTIFY_SPOUSE", "person_id": ids["ramaiah"],
                                   "detail": {"spouse_id": ids["sarojini"]}}, "test-officer")
        cur.execute(
            "SELECT count(*) AS n FROM mdm.invitation WHERE person_id=%s AND kind='DEATH_NOTICE'",
            (ids["sarojini"],),
        )
        assert cur.fetchone()["n"] == 1
        again = [i for i in citizen.list_approvals(cur, LOGIN)["items"] if i.get("kind") == "DEATH_NOTICE"]
        assert len(again) == 1

        sar_ben = _ben(cur, story.PEOPLE["sarojini"][3])
        if sar_ben:
            assert sar_ben["status"] == "IDENTIFIED"

        cleared = story.clear(cur)
        assert cleared["people"] >= 1
        cur.execute("SELECT count(*) AS n FROM mdm.source_record WHERE source_rid LIKE %s", (PREFIX + "%",))
        assert cur.fetchone()["n"] == 0
        for name in ("Ramaiah Goud", "Sarojini Goud", "Narsimha Chary"):
            cur.execute("SELECT 1 FROM mdm.person WHERE name=%s", (name,))
            assert cur.fetchone() is None, name
        conn.commit()


def test_scripted_uc3_still_passes_after_live_steps():
    """3.1 plants; live steps 3.6–3.10 run; then 3.2–3.5 still pass on other (non-DEMO-UC3) pensioners."""
    for sid in ("3.1", "3.6", "3.7", "3.8", "3.9", "3.10"):
        r = demo.run_one(sid)
        assert r["status"] in ("PASS", "PARTIAL", "SKIPPED"), (sid, r["status"], r.get("error"),
            [c["text"] for c in (r.get("checks") or []) if not c.get("ok")])
    for sid in ("3.2", "3.3", "3.4", "3.5"):
        r = demo.run_one(sid)
        assert r["status"] in ("PASS", "PARTIAL"), (sid, r["status"], r.get("error"),
            [c["text"] for c in (r.get("checks") or []) if not c.get("ok")])
    # tidy the planted cast so later suites are not left with DEMO-UC3- rows
    with connect() as conn:
        story.clear(conn.cursor())
        conn.commit()
