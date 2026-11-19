"""Demo cleanup + volume seeder safety (Officer_Scale Slice1 Review item 6, Sameer 5 Nov).

Tests use the isolated database citizen_db_test (see tests/conftest.py). They refuse to run
against citizen_db unless ALLOW_LIVE_DB=1. Synthetic registrations only (DEMO-CLEAN- / DEMO-VOL-).

  MDM_AUTH_DISABLED=true MDM_DB_DSN='... dbname=citizen_db_test ...' \\
    python -m pytest tests/test_demo_cleanup.py -q
"""
from __future__ import annotations
import os
import uuid
from datetime import datetime, timezone
from unittest import mock

os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.db import connect
from tools import demo_cleanup, volume_seed

c = TestClient(app)


def q(sql, *p):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, p)
        return cur.fetchall()


def _tag():
    return uuid.uuid4().hex[:8]


def _insert_event(reg, et="BIRTH_REGISTERED"):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO mdm.event (seq, event_key, event_type, uc, payload, status, note)
               VALUES (1,%s,%s,'UC2',%s::jsonb,'PROCESSED','demo cleanup test') RETURNING id""",
            (reg, et, '{"registration_no": "%s"}' % reg.replace('"', "")),
        )
        eid = cur.fetchone()["id"]
        conn.commit()
        return eid


def _open_proposal(eid, kind="ADD_TO_RATION_CARD", system="Civil supplies (PDS)"):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO mdm.proposal (event_id, uc, kind, system, system_code, summary, status, reason_code, risk_class)
               VALUES (%s,'UC2',%s,%s,'pds','cleanup test','PROPOSED','BIRTH_CLEAN','B') RETURNING id""",
            (eid, kind, system),
        )
        pid = cur.fetchone()["id"]
        conn.commit()
        return pid


def _pending_consent(eid, purpose="BIRTH_HEALTH"):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM mdm.person ORDER BY id LIMIT 1")
        person_id = cur.fetchone()["id"]
        cur.execute(
            """INSERT INTO mdm.consent (event_id, person_id, purpose, system, status, requested_at, respond_by)
               VALUES (%s,%s,%s,'health','PENDING',now(), now() + interval '7 days') RETURNING id""",
            (eid, person_id, purpose),
        )
        cid = cur.fetchone()["id"]
        conn.commit()
        return cid


def _citizen_confirm():
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM mdm.person ORDER BY id LIMIT 1")
        person_id = cur.fetchone()["id"]
        cur.execute(
            """INSERT INTO mdm.proposal (event_id, uc, kind, system, system_code, person_id, summary, status, reason_code, risk_class)
               VALUES (NULL,NULL,'CITIZEN_CONFIRM','MDM steward','mdm',%s,'citizen confirm test','PROPOSED','CITIZEN_CONFIRM','C')
               RETURNING id""",
            (person_id,),
        )
        pid = cur.fetchone()["id"]
        conn.commit()
        return pid


def test_isolation_guard_refuses_citizen_db():
    """conftest refuses citizen_db unless ALLOW_LIVE_DB=1."""
    with pytest.raises(SystemExit) as ei:
        from tests.conftest import assert_db_allowed
        assert_db_allowed("citizen_db", allow_live=False)
    assert "citizen_db" in str(ei.value).lower() or "ALLOW_LIVE_DB" in str(ei.value)


def test_dry_run_changes_nothing():
    tag = _tag()
    reg = f"AP-CLEAN-{tag}"
    eid = _insert_event(reg)
    prop = _open_proposal(eid)
    cons = _pending_consent(eid)
    before = q("SELECT status FROM mdm.proposal WHERE id=%s", prop)[0]["status"]
    before_c = q("SELECT status FROM mdm.consent WHERE id=%s", cons)[0]["status"]
    report = demo_cleanup.run(prefixes=["AP-"], apply=False, dsn=None)
    assert report["dry_run"] is True
    assert q("SELECT status FROM mdm.proposal WHERE id=%s", prop)[0]["status"] == before
    assert q("SELECT status FROM mdm.consent WHERE id=%s", cons)[0]["status"] == before_c
    assert any(r["prefix"] == "AP-" and r["open_proposals"] >= 1 for r in report["by_prefix"])


def test_apply_withdraws_only_matching_prefixes():
    tag = _tag()
    match_eid = _insert_event(f"FD-CLEAN-{tag}")
    other_eid = _insert_event(f"KEEP-CLEAN-{tag}")
    match_p = _open_proposal(match_eid)
    other_p = _open_proposal(other_eid)
    match_c = _pending_consent(match_eid)
    demo_cleanup.run(prefixes=["FD-"], apply=True, dsn=None)
    assert q("SELECT status, note FROM mdm.proposal WHERE id=%s", match_p)[0]["status"] == "WITHDRAWN"
    assert "demo cleanup" in (q("SELECT note FROM mdm.proposal WHERE id=%s", match_p)[0]["note"] or "")
    assert q("SELECT status FROM mdm.proposal WHERE id=%s", other_p)[0]["status"] == "PROPOSED"
    assert q("SELECT status FROM mdm.consent WHERE id=%s", match_c)[0]["status"] == "EXPIRED"


def test_citizen_confirm_and_marriage_confirm_untouched():
    cc = _citizen_confirm()
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM mdm.person ORDER BY id LIMIT 1")
        person_id = cur.fetchone()["id"]
        cur.execute(
            """INSERT INTO mdm.proposal (event_id, uc, kind, system, system_code, person_id, summary, status, reason_code, risk_class)
               VALUES (NULL,NULL,'MARRIAGE_CONFIRM','MDM steward','mdm',%s,'marriage confirm test','PROPOSED','MARRIAGE_CONFIRM','C')
               RETURNING id""",
            (person_id,),
        )
        mc = cur.fetchone()["id"]
        conn.commit()
    demo_cleanup.run(prefixes=demo_cleanup.DEFAULT_PREFIXES, apply=True, dsn=None)
    assert q("SELECT status FROM mdm.proposal WHERE id=%s", cc)[0]["status"] == "PROPOSED"
    assert q("SELECT status FROM mdm.proposal WHERE id=%s", mc)[0]["status"] == "PROPOSED"


def test_second_apply_changes_nothing():
    tag = _tag()
    eid = _insert_event(f"T-CLEAN-{tag}")
    prop = _open_proposal(eid)
    cons = _pending_consent(eid)
    r1 = demo_cleanup.run(prefixes=["T-"], apply=True, dsn=None)
    assert r1["withdrawn"] >= 1
    after1_p = q("SELECT status, decided_at FROM mdm.proposal WHERE id=%s", prop)[0]
    after1_c = q("SELECT status, expires_at FROM mdm.consent WHERE id=%s", cons)[0]
    r2 = demo_cleanup.run(prefixes=["T-"], apply=True, dsn=None)
    after2_p = q("SELECT status, decided_at FROM mdm.proposal WHERE id=%s", prop)[0]
    after2_c = q("SELECT status, expires_at FROM mdm.consent WHERE id=%s", cons)[0]
    assert after2_p == after1_p
    assert after2_c["status"] == after1_c["status"]
    assert r2["withdrawn"] == 0


def test_seeder_refuses_rerun_with_same_seed():
    seed = int(uuid.uuid4().hex[:6], 16) % 100000
    s1 = volume_seed.generate(births=2, deaths=1, exception_rate=0.0, client=c, seed=seed)
    assert s1.get("refused") is not True
    with pytest.raises(SystemExit) as ei:
        volume_seed.generate(births=2, deaths=1, exception_rate=0.0, client=c, seed=seed)
    assert "already" in str(ei.value).lower() or "exist" in str(ei.value).lower()


def test_seeder_fail_fast_on_401():
    class Boom:
        def post(self, *a, **k):
            class R:
                status_code = 401
                content = b'{"detail":"unauthorized"}'
                def json(self):
                    return {"detail": "unauthorized"}
            return R()
        def get(self, *a, **k):
            class R:
                status_code = 401
                content = b"{}"
                def json(self):
                    return {}
            return R()

    with pytest.raises(SystemExit) as ei:
        volume_seed.generate(
            births=1, deaths=0, exception_rate=0.0, client=Boom(), seed=None,
            tag=f"auth-{_tag()}",
            people=[{"mname": "Auth Mother", "fname": "Auth Father", "district": "Hyderabad"}],
        )
    assert "401" in str(ei.value) or "403" in str(ei.value) or "auth" in str(ei.value).lower()


def test_deaths_chosen_by_the_seeder_match_exactly_one_person():
    chosen = volume_seed.pick_deceased(limit=20, client=c)
    assert chosen, "need at least one unique alive person on the test database"
    for row in chosen:
        hits = q("SELECT id FROM mdm.person WHERE name=%s AND life_status IS DISTINCT FROM 'DECEASED'", row["name"])
        assert len(hits) == 1, (row["name"], len(hits))
        # API pre-check path also returns exactly one.
        r = c.get("/api/persons", params={"q": row["name"], "limit": 10})
        assert r.status_code == 200
        exact = [p for p in r.json()["items"] if p["name"] == row["name"] and p.get("life_status") != "DECEASED"]
        assert len(exact) == 1
