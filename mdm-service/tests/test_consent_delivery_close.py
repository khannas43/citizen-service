"""When a consent is expired, withdrawn or refused, its waiting deliveries must close.

Uses citizen_db_test (see tests/conftest.py). Synthetic registrations only.

  MDM_AUTH_DISABLED=true MDM_DB_DSN='... dbname=citizen_db_test ...' \\
    python -m pytest tests/test_consent_delivery_close.py -q
"""
from __future__ import annotations
import os
import uuid

os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""

from fastapi.testclient import TestClient

from app.api import app
from app.db import connect
from app import exchange
from tools import demo_cleanup

c = TestClient(app)


def q(sql, *p):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, p)
        return cur.fetchall()


def _tag():
    return uuid.uuid4().hex[:8]


def _person():
    return q("SELECT id FROM mdm.person ORDER BY id LIMIT 1")[0]["id"]


def _event(reg):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO mdm.event (seq, event_key, event_type, uc, payload, status, note)
               VALUES (1,%s,'BIRTH_REGISTERED','UC2',%s::jsonb,'PROCESSED','consent delivery close test')
               RETURNING id""",
            (reg, '{"registration_no": "%s"}' % reg),
        )
        eid = cur.fetchone()["id"]
        conn.commit()
        return eid


def _consent(eid, person_id, respond_by_sql="now() - interval '1 day'"):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""INSERT INTO mdm.consent (event_id, person_id, purpose, system, status, requested_at, respond_by)
                VALUES (%s,%s,'BIRTH_HEALTH','health','PENDING',now(), {respond_by_sql})
                RETURNING id""",
            (eid, person_id),
        )
        cid = cur.fetchone()["id"]
        conn.commit()
        return cid


def _delivery(eid, cid, person_id, status="PENDING_CONSENT", system="health"):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO mdm.delivery (event_id, consent_id, person_id, purpose, system, status, attempts)
               VALUES (%s,%s,%s,'BIRTH_HEALTH',%s,%s,0) RETURNING id""",
            (eid, cid, person_id, system, status),
        )
        did = cur.fetchone()["id"]
        conn.commit()
        return did


def _waiting_total():
    board = c.get("/api/x/flow-board").json()
    return int(board["totals"]["waiting_citizen"])


def test_a_delivery_of_an_expired_consent_is_closed_by_the_sweep():
    tag = _tag()
    pid = _person()
    eid = _event(f"CDC-SW-{tag}")
    cid = _consent(eid, pid)
    did = _delivery(eid, cid, pid, "PENDING_CONSENT")
    retry = _delivery(eid, cid, pid, "RETRYING", system="pds")
    sw = c.post("/api/x/consents/sweep", json={"as_of": "2099-01-01"})
    assert sw.status_code == 200, sw.text
    assert q("SELECT status FROM mdm.consent WHERE id=%s", cid)[0]["status"] == "EXPIRED"
    assert q("SELECT status FROM mdm.delivery WHERE id=%s", did)[0]["status"] == "BLOCKED_EXPIRED"
    assert q("SELECT status FROM mdm.delivery WHERE id=%s", retry)[0]["status"] == "BLOCKED_EXPIRED"


def test_delivered_rows_are_untouched_when_consent_expires():
    tag = _tag()
    pid = _person()
    eid = _event(f"CDC-DEL-{tag}")
    cid = _consent(eid, pid)
    pending = _delivery(eid, cid, pid, "PENDING_CONSENT")
    delivered = _delivery(eid, cid, pid, "DELIVERED", system="pds")
    assert c.post("/api/x/consents/sweep", json={"as_of": "2099-01-01"}).status_code == 200
    assert q("SELECT status FROM mdm.delivery WHERE id=%s", pending)[0]["status"] == "BLOCKED_EXPIRED"
    assert q("SELECT status FROM mdm.delivery WHERE id=%s", delivered)[0]["status"] == "DELIVERED"


def test_flow_board_waiting_count_drops_by_exactly_the_closed_number():
    tag = _tag()
    pid = _person()
    eid = _event(f"CDC-FB-{tag}")
    cid = _consent(eid, pid)
    d1 = _delivery(eid, cid, pid, "PENDING_CONSENT", system="health")
    d2 = _delivery(eid, cid, pid, "PENDING_CONSENT", system="pds")
    before = _waiting_total()
    before_board = c.get("/api/x/flow-board").json()
    before_stopped = int(before_board["totals"].get("stopped") or 0)
    assert c.post("/api/x/consents/sweep", json={"as_of": "2099-01-01"}).status_code == 200
    after = _waiting_total()
    assert before - after == 2, (before, after, d1, d2)
    board = c.get("/api/x/flow-board").json()
    assert board["definitions"]["failed"] == "Status DEAD_LETTER — a delivery attempt that went wrong."
    assert "BLOCKED_EXPIRED" in board["definitions"]["stopped"]
    assert "BLOCKED_EXPIRED" not in board["definitions"]["failed"]
    assert int(board["totals"]["stopped"]) == before_stopped + 2


def test_cleanup_closes_deliveries_only_for_listed_prefixes():
    tag = _tag()
    pid = _person()
    match_eid = _event(f"AP-CDC-{tag}")
    other_eid = _event(f"KEEP-CDC-{tag}")
    match_c = _consent(match_eid, pid, respond_by_sql="now() + interval '7 days'")
    other_c = _consent(other_eid, pid, respond_by_sql="now() + interval '7 days'")
    match_d = _delivery(match_eid, match_c, pid, "PENDING_CONSENT")
    other_d = _delivery(other_eid, other_c, pid, "PENDING_CONSENT")
    dry = demo_cleanup.run(prefixes=["AP-"], apply=False, dsn=None)
    assert dry["dry_run"] is True
    ap = next(r for r in dry["before"] if r["prefix"] == "AP-")
    assert ap["pending_deliveries"] >= 1
    assert ap.get("deliveries_by_status", {}).get("PENDING_CONSENT", 0) >= 1
    demo_cleanup.run(prefixes=["AP-"], apply=True, dsn=None)
    assert q("SELECT status FROM mdm.delivery WHERE id=%s", match_d)[0]["status"] == "BLOCKED_EXPIRED"
    assert q("SELECT status FROM mdm.delivery WHERE id=%s", other_d)[0]["status"] == "PENDING_CONSENT"


def test_cleanup_delivery_close_is_idempotent():
    tag = _tag()
    pid = _person()
    eid = _event(f"W2-CDC-{tag}")
    cid = _consent(eid, pid, respond_by_sql="now() + interval '7 days'")
    did = _delivery(eid, cid, pid, "PENDING_CONSENT")
    r1 = demo_cleanup.run(prefixes=["W2-"], apply=True, dsn=None)
    assert r1["closed_deliveries"] >= 1
    assert q("SELECT status FROM mdm.delivery WHERE id=%s", did)[0]["status"] == "BLOCKED_EXPIRED"
    r2 = demo_cleanup.run(prefixes=["W2-"], apply=True, dsn=None)
    assert r2["closed_deliveries"] == 0
    assert q("SELECT status FROM mdm.delivery WHERE id=%s", did)[0]["status"] == "BLOCKED_EXPIRED"


def test_backfill_closes_orphan_pending_deliveries_of_already_expired_consents():
    """Rows left behind when consents were expired without closing deliveries (demo_cleanup defect)."""
    tag = _tag()
    pid = _person()
    eid = _event(f"CDC-BF-{tag}")
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO mdm.consent (event_id, person_id, purpose, system, status, requested_at, respond_by, ended_reason)
               VALUES (%s,%s,'BIRTH_HEALTH','health','EXPIRED',now(), now() - interval '1 day', 'demo cleanup')
               RETURNING id""",
            (eid, pid),
        )
        cid = cur.fetchone()["id"]
        cur.execute(
            """INSERT INTO mdm.delivery (event_id, consent_id, person_id, purpose, system, status, attempts)
               VALUES (%s,%s,%s,'BIRTH_HEALTH','health','PENDING_CONSENT',0) RETURNING id""",
            (eid, cid, pid),
        )
        did = cur.fetchone()["id"]
        conn.commit()
    with connect() as conn:
        cur = conn.cursor()
        n = exchange.backfill_closed_consent_deliveries(cur)
        conn.commit()
        assert n >= 1
    assert q("SELECT status FROM mdm.delivery WHERE id=%s", did)[0]["status"] == "BLOCKED_EXPIRED"


def test_default_prefixes_exclude_demo_vol_crs_and_cz():
    assert "DEMO-VOL-" not in demo_cleanup.DEFAULT_PREFIXES
    assert "CRS-" not in demo_cleanup.DEFAULT_PREFIXES
    assert "CZ-" not in demo_cleanup.DEFAULT_PREFIXES
    assert "AP-" in demo_cleanup.DEFAULT_PREFIXES


def test_cleanup_created_before_leaves_a_fresh_demo_vol_run_untouched():
    """Old DEMO-VOL- rows can be cleaned with a cutoff; a fresh seed after the cutoff is safe."""
    from datetime import datetime, timedelta, timezone
    tag = _tag()
    pid = _person()
    # "Old" event: received well before the cutoff.
    old_eid = _event(f"DEMO-VOL-B-old-{tag}-0")
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE mdm.event SET received_at = now() - interval '2 days' WHERE id=%s",
            (old_eid,),
        )
        conn.commit()
    old_c = _consent(old_eid, pid, respond_by_sql="now() + interval '7 days'")
    old_d = _delivery(old_eid, old_c, pid, "PENDING_CONSENT")
    # Fresh event: received now (after the cutoff).
    fresh_eid = _event(f"DEMO-VOL-B-fresh-{tag}-0")
    fresh_c = _consent(fresh_eid, pid, respond_by_sql="now() + interval '7 days'")
    fresh_d = _delivery(fresh_eid, fresh_c, pid, "PENDING_CONSENT")
    cutoff = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    dry = demo_cleanup.run(prefixes=["DEMO-VOL-"], apply=False, created_before=cutoff, dsn=None)
    assert dry["created_before"]
    assert dry["before"][0]["pending_deliveries"] >= 1
    demo_cleanup.run(prefixes=["DEMO-VOL-"], apply=True, created_before=cutoff, dsn=None)
    assert q("SELECT status FROM mdm.delivery WHERE id=%s", old_d)[0]["status"] == "BLOCKED_EXPIRED"
    assert q("SELECT status FROM mdm.delivery WHERE id=%s", fresh_d)[0]["status"] == "PENDING_CONSENT"
    assert q("SELECT status FROM mdm.consent WHERE id=%s", fresh_c)[0]["status"] == "PENDING"
