"""Department-scoped officers (PDS / Health): deny-by-default allowlist and own-department data only."""
import os
import re
import uuid

os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app import auth
from tests.test_feed import q

cl = TestClient(app)


def _hdr(roles, actor="dept-test"):
    """Test-mode role injection (MDM_AUTH_DISABLED). Production never reads these headers."""
    if isinstance(roles, str):
        roles = roles
    else:
        roles = ",".join(roles)
    return {"X-Test-Roles": roles, "X-Test-Actor": actor}


PDS = _hdr("PDS_OFFICER", "pds.officer")
HEALTH = _hdr("HEALTH_OFFICER", "health.officer")
ADMIN = _hdr("MDM_ADMIN,ADMIN", "test-user")
STEWARD = _hdr("MDM_STEWARD", "steward")
DEPT_ADMIN = _hdr("DEPT_ADMIN", "dept.admin")
BOTH = _hdr("PDS_OFFICER,MDM_ADMIN", "pds-and-admin")


def _open_prop(system_code: str):
    rows = q("""SELECT id, system_code, reason_code FROM mdm.proposal
                WHERE status='PROPOSED' AND system_code=%s ORDER BY id DESC LIMIT 1""", system_code)
    return rows[0] if rows else None


def _open_prop_other_than(system_code: str):
    rows = q("""SELECT id, system_code, reason_code FROM mdm.proposal
                WHERE status='PROPOSED' AND system_code IS DISTINCT FROM %s ORDER BY id DESC LIMIT 1""",
             system_code)
    return rows[0] if rows else None


def test_pds_officer_flow_board_shows_one_row_pds_only():
    r = cl.get("/api/x/flow-board", headers=PDS)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["rows"]) == 1
    assert body["rows"][0]["system"] == "pds"
    assert body["totals"]["system"] == "_total"
    # Totals are that row alone.
    row = body["rows"][0]
    for k in ("received_24h", "delivered", "waiting_citizen", "needs_person"):
        assert body["totals"][k] == row[k]


def test_health_officer_flow_board_shows_one_row_health_only():
    r = cl.get("/api/x/flow-board", headers=HEALTH)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["rows"]) == 1
    assert body["rows"][0]["system"] == "health"


def test_a_system_parameter_for_another_department_is_ignored():
    r = cl.get("/api/x/flow-board", params={"system": "health"}, headers=PDS)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["rows"]) == 1
    assert body["rows"][0]["system"] == "pds"


def test_pds_officer_work_groups_and_items_only_pds():
    admin = cl.get("/api/x/work/groups", headers=ADMIN).json()
    pds_admin = cl.get("/api/x/work/groups", params={"system": "pds"}, headers=ADMIN).json()
    scoped = cl.get("/api/x/work/groups", headers=PDS).json()
    admin_pds_count = sum(g["count"] for g in pds_admin["groups"])
    scoped_count = sum(g["count"] for g in scoped["groups"])
    assert scoped_count == admin_pds_count
    for g in scoped["groups"]:
        assert all(s == "pds" for s in (g.get("systems") or []) if s)
    # Items for a group the PDS officer sees are all pds.
    if scoped["groups"]:
        reason = scoped["groups"][0]["reason_code"]
        items = cl.get("/api/x/work/items", params={"reason": reason, "limit": 20}, headers=PDS).json()
        for it in items.get("items") or []:
            assert (it.get("system_code") or it.get("system")) in ("pds", "Civil supplies (PDS)")


def test_pds_officer_cannot_open_decide_claim_or_batch_a_health_or_mdm_item():
    foreign = _open_prop_other_than("pds")
    if not foreign:
        pytest.skip("need a non-pds open proposal")
    fid = foreign["id"]
    # Decide → 404 (does not confirm the id exists)
    d = cl.post(f"/api/proposals/{fid}/decision",
                json={"decision": "APPROVE", "note": "Should not work for other department"},
                headers=PDS)
    assert d.status_code == 404, d.text
    # Claim by id → not claimed (or 404)
    c = cl.post("/api/x/work/claim", json={"ids": [fid]}, headers=PDS)
    assert c.status_code in (200, 404)
    if c.status_code == 200:
        assert fid not in (c.json().get("ids") or [])
        assert c.json().get("claimed", 0) == 0 or fid not in c.json().get("ids", [])
    # Batch: skip foreign with reason; do not approve it
    from app import workqueue
    own = _open_prop("pds")
    groups = cl.get("/api/x/work/groups", headers=PDS).json()["groups"]
    batchable = [g for g in groups if g.get("batchable")]
    if not own or not batchable or not workqueue.is_batchable(own.get("reason_code") or ""):
        if not batchable:
            # Decide/claim checks above already ran.
            return
        reason = batchable[0]["reason_code"]
        prev = cl.post("/api/x/work/batch/preview",
                       json={"reason": reason, "ids": [fid]}, headers=PDS)
        # Preview may exclude foreign ids (404) or include them for later skip.
        if prev.status_code == 404:
            return
        assert prev.status_code == 200, prev.text
        token = prev.json()["token"]
        sample = prev.json().get("sample") or {}
        opened = list(dict.fromkeys(
            (sample.get("random") or [])
            + (sample.get("lowest_confidence") or [])
            + (sample.get("outliers") or [])
        ))
        out = cl.post("/api/x/work/batch/approve",
                      json={"token": token, "rationale": "Department batch check for scope",
                            "sample_opened": opened},
                      headers=PDS)
        assert out.status_code == 200, out.text
        skipped = {s["id"]: s["reason"] for s in (out.json().get("skipped_detail") or [])}
        if fid in skipped:
            assert "Not in your department" in skipped[fid]
        assert q("SELECT status FROM mdm.proposal WHERE id=%s", fid)[0]["status"] == "PROPOSED"
        return
    reason = own["reason_code"]
    prev = cl.post("/api/x/work/batch/preview", json={"reason": reason, "ids": [own["id"], fid]}, headers=PDS)
    if prev.status_code == 200:
        token = prev.json()["token"]
        sample = prev.json().get("sample") or {}
        opened = list(dict.fromkeys(
            (sample.get("random") or []) + (sample.get("lowest_confidence") or []) + (sample.get("outliers") or [])
        ))
        # Open only sample ids that belong to the officer's preview
        out = cl.post("/api/x/work/batch/approve",
                      json={"token": token, "rationale": "Department batch check for scope", "sample_opened": opened},
                      headers=PDS)
        assert out.status_code == 200, out.text
        body = out.json()
        skipped = {s["id"]: s["reason"] for s in (body.get("skipped_detail") or [])}
        if fid in skipped:
            assert "Not in your department" in skipped[fid]
        assert q("SELECT status FROM mdm.proposal WHERE id=%s", fid)[0]["status"] == "PROPOSED"


def test_health_officer_sees_only_health_consents_and_deliveries():
    consents = cl.get("/api/x/consents", headers=HEALTH).json()
    for c in consents.get("items") or []:
        assert c.get("system") == "health" or c.get("system_name") in ("Health", "health")
    deliveries = cl.get("/api/x/deliveries", headers=HEALTH).json()
    for d in deliveries.get("items") or []:
        assert d.get("system") == "health"
    # Foreign consent id → 404
    other = q("SELECT id FROM mdm.consent WHERE system IS DISTINCT FROM 'health' ORDER BY id DESC LIMIT 1")
    if other:
        r = cl.get(f"/api/x/consents/{other[0]['id']}", headers=HEALTH)
        assert r.status_code == 404


def test_a_department_user_gets_403_on_every_route_outside_the_allowlist():
    """Walk OpenAPI paths so newly added routes fail this test until allowlisted."""
    schema = app.openapi()
    forbidden_hit = 0
    seen = 0
    for path, ops in schema.get("paths", {}).items():
        if path.startswith("/docs") or path in ("/openapi.json", "/redoc"):
            continue
        for method in ops:
            if method in ("head", "options", "parameters"):
                continue
            concrete = path
            for name in re.findall(r"\{([^}:]+)", path):
                concrete = concrete.replace("{" + name + "}", "1")
                concrete = re.sub(r"\{" + name + r":[^}]+\}", "1", concrete)
            seen += 1
            if auth.path_allowed_for_dept(method.upper(), concrete):
                continue
            fn = getattr(cl, method.lower())
            r = fn(concrete, headers=PDS)
            assert r.status_code == 403, f"{method.upper()} {concrete} → {r.status_code} {r.text[:160]}"
            assert "department" in r.text.lower()
            forbidden_hit += 1
    assert seen >= 30, f"expected a full OpenAPI surface, saw {seen}"
    assert forbidden_hit >= 10, f"expected many non-allowlisted routes; saw {forbidden_hit} of {seen}"


def test_an_unknown_route_returns_403_for_a_department_user():
    r = cl.get(f"/api/x/no-such-route-{uuid.uuid4().hex[:8]}", headers=PDS)
    assert r.status_code == 403
    assert "department" in r.text.lower()


def test_a_user_with_a_department_role_and_an_admin_role_is_not_scoped():
    r = cl.get("/api/x/flow-board", headers=BOTH)
    assert r.status_code == 200
    assert len(r.json()["rows"]) >= 1
    # Can open control overview style routes
    ctrl = cl.get("/api/x/events", headers=BOTH)
    assert ctrl.status_code == 200


def test_existing_roles_behave_exactly_as_before():
    for hdr in (ADMIN, STEWARD, DEPT_ADMIN):
        r = cl.get("/api/x/flow-board", headers=hdr)
        assert r.status_code == 200
        assert len(r.json()["rows"]) >= 1
        ev = cl.get("/api/x/events", headers=hdr)
        assert ev.status_code == 200
        pol = cl.get("/api/x/policy", headers=hdr)
        # policy may be admin-only for write; read should work for steward/admin/dept_admin as today
        assert pol.status_code in (200, 403)


def test_the_work_queue_evidence_for_a_department_user_has_no_other_department_records():
    groups = cl.get("/api/x/work/groups", headers=PDS).json().get("groups") or []
    if not groups:
        pytest.skip("no pds work groups")
    reason = groups[0]["reason_code"]
    items = cl.get("/api/x/work/items", params={"reason": reason, "limit": 5}, headers=PDS).json()
    for it in items.get("items") or []:
        ev = it.get("evidence") or {}
        # Evidence is the proposal's own detail only — no cross-department person dump.
        assert "other_department" not in ev
        assert "all_departments" not in ev
        blob = str(ev).lower()
        assert "system_code': 'health'" not in blob or "parents" in ev


def test_batch_receipt_for_another_department_returns_404():
    # Find a batch whose proposals are not pds (or any batch and assert 404 when none are pds)
    rows = q("""
        SELECT b.id FROM mdm.batch b
        WHERE EXISTS (
          SELECT 1 FROM mdm.proposal pr WHERE pr.batch_id=b.id AND pr.system_code IS DISTINCT FROM 'pds'
        )
        AND NOT EXISTS (
          SELECT 1 FROM mdm.proposal pr WHERE pr.batch_id=b.id AND pr.system_code='pds'
        )
        ORDER BY b.id DESC LIMIT 1
    """)
    if not rows:
        # Create nothing — if no foreign-only batch exists, assert a made-up id is 404
        r = cl.get("/api/x/work/batches/99999999", headers=PDS)
        assert r.status_code == 404
        return
    r = cl.get(f"/api/x/work/batches/{rows[0]['id']}", headers=PDS)
    assert r.status_code == 404


# ---- helpers used by tests (implemented in auth / workqueue) ----------------

def test_auth_scope_helpers():
    assert auth.scope({"roles": {"PDS_OFFICER"}}) == "pds"
    assert auth.scope({"roles": {"HEALTH_OFFICER"}}) == "health"
    assert auth.scope({"roles": {"PDS_OFFICER", "MDM_ADMIN"}}) is None
    assert auth.scope({"roles": {"MDM_STEWARD"}}) is None
    assert auth.scope({"roles": {"TALATI"}}) is None


# ---------------------------------------------------------------- approvals, channels, retry (found by the live probe)
_SYS_KEYS = ("system", "to_system", "department", "dept", "system_code", "department_key")


def _systems_in(obj) -> set:
    """Every department-like value anywhere in a JSON body."""
    out = set()

    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k in _SYS_KEYS and isinstance(v, str):
                    out.add(v)
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(obj)
    return out


_PDS_OK = {"pds", "Civil supplies (PDS)"}
_HEALTH_OK = {"health", "Health"}


def test_approvals_for_a_pds_officer_name_only_pds():
    r = cl.get("/api/x/approvals", params={"limit": 200}, headers=PDS)
    assert r.status_code == 200, r.text
    body = r.json()
    assert _systems_in(body) <= _PDS_OK, _systems_in(body) - _PDS_OK
    admin = cl.get("/api/x/approvals", params={"system": "pds", "limit": 200}, headers=ADMIN).json()
    assert body["total"] == admin["total"]
    # the per-department tally is the user's own department only
    assert {x["system"] for x in body["by_system"]} <= _PDS_OK


def test_approvals_for_a_health_officer_are_empty_and_name_no_other_department():
    r = cl.get("/api/x/approvals", params={"limit": 200}, headers=HEALTH)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["items"] == [] and body["total"] == 0
    assert body["by_system"] == []
    assert _systems_in(body) <= _HEALTH_OK


def test_a_system_parameter_on_approvals_cannot_widen_a_department_user():
    r = cl.get("/api/x/approvals", params={"system": "health", "limit": 200}, headers=PDS)
    assert r.status_code == 200, r.text
    assert _systems_in(r.json()) <= _PDS_OK


def test_the_admin_approvals_tally_still_lists_every_department():
    r = cl.get("/api/x/approvals", headers=ADMIN)
    assert r.status_code == 200, r.text
    assert len(r.json()["by_system"]) >= 2


def test_channels_for_a_department_user_lists_only_its_own_department():
    for hdr, ok in ((PDS, "pds"), (HEALTH, "health")):
        r = cl.get("/api/x/channels", headers=hdr)
        assert r.status_code == 200, r.text
        assert [c["system"] for c in r.json()["channels"]] == [ok]
    admin = cl.get("/api/x/channels", headers=ADMIN).json()["channels"]
    assert len(admin) > 2


def test_a_department_user_retrying_deliveries_touches_only_its_own_department():
    from app.db import connect
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO mdm.delivery (system, status, kind, attempts, purpose)
                       VALUES ('health','RETRYING','EVENT',1,'BIRTH_HEALTH') RETURNING id""")
        hid = cur.fetchone()["id"]
        conn.commit()
    try:
        r = cl.post("/api/x/deliveries/retry", headers=PDS)
        assert r.status_code == 200, r.text
        row = q("SELECT status, attempts FROM mdm.delivery WHERE id=%s", hid)[0]
        assert row["status"] == "RETRYING" and row["attempts"] == 1, "a PDS officer retried a Health delivery"
    finally:
        with connect() as conn:
            conn.cursor().execute("DELETE FROM mdm.delivery WHERE id=%s", (hid,))
            conn.commit()


def test_no_other_department_appears_in_any_allowed_response_for_a_department_user():
    paths = ["/api/x/flow-board", "/api/x/work/groups", "/api/x/approvals", "/api/x/consents", "/api/x/deliveries",
             "/api/x/notices", "/api/x/channels"]
    for hdr, ok in ((PDS, _PDS_OK), (HEALTH, _HEALTH_OK)):
        for p in paths:
            r = cl.get(p, headers=hdr)
            assert r.status_code == 200, (p, r.text)
            extra = _systems_in(r.json()) - ok - {"_total"}
            assert not extra, (p, extra)
