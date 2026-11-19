"""Wave 3: connectors, partner keys, blocked users, citizen view, assisted channel."""
import os, uuid
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""
import pytest
from fastapi.testclient import TestClient
from app.api import app
from app.db import connect

c = TestClient(app)


def q(sql, *p):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, p)
        return cur.fetchall()


def setpol(key, value):
    assert c.post("/api/x/policy", json={"key": key, "value": value, "note": "wave3 test"}).status_code == 200


def pol(key):
    return {x["key"]: x for x in c.get("/api/x/policy").json()["policies"]}[key]["value"]


@pytest.fixture(autouse=True)
def _no_limit():
    old = pol("max_lookups_per_hour")
    setpol("max_lookups_per_hour", 1000)
    yield
    setpol("max_lookups_per_hour", old)


def person_with_cert():
    r = q("""SELECT s.person_id, i.source_rid AS token FROM mdm.source_record s JOIN mdm.source_record i ON i.person_id=s.person_id AND i.source='identity_reference'
             WHERE s.source='revenue_certificates' AND s.rtype='INCOME' AND s.payload->>'status'='ACTIVE'
               AND (SELECT count(*) FROM mdm.source_record x WHERE x.person_id=s.person_id AND x.source='revenue_certificates' AND x.rtype='INCOME')=1
               AND COALESCE((SELECT birth_year FROM mdm.person p WHERE p.id=s.person_id),1900) < 1990 LIMIT 1""")
    return r[0]["person_id"], r[0]["token"]


def test_existing_feeds_appear_as_active_connectors_and_a_new_one_must_pass_a_test_first():
    lst = c.get("/api/x/connectors").json()
    assert any(x["source"] == "pds_view" and x["status"] == "ACTIVE" and x["records"] > 0 for x in lst["items"])
    tag = uuid.uuid4().hex[:5]
    bad = c.post("/api/x/connectors", json={"source": "new feed " + tag, "system": "nope", "auth_method": "MTLS_KEY"})
    assert bad.status_code == 400
    r = c.post("/api/x/connectors", json={"source": "water_" + tag, "name": "Water board", "system": "housing", "auth_method": "OAUTH_CLIENT", "interface": "REST", "mapping": {"cust_name": "name"}})
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    assert c.post(f"/api/x/connectors/{cid}/state", json={"action": "ACTIVATE", "reason": "go live now please"}).status_code == 409          # untested
    t = c.post(f"/api/x/connectors/{cid}/test").json()
    assert t["ok"] is False and any("Linkable" in x["check"] and not x["ok"] for x in t["checks"])                                         # nothing to link people by
    assert c.post(f"/api/x/connectors/{cid}/mapping", json={"mapping": {"cust_name": "name", "dob": "not_an_element"}}).status_code == 400
    assert c.post(f"/api/x/connectors/{cid}/mapping", json={"mapping": {"cust_name": "name", "token": "identity_reference"}}).status_code == 200
    assert c.post(f"/api/x/connectors/{cid}/test").json()["ok"] is True
    assert c.post(f"/api/x/connectors/{cid}/state", json={"action": "ACTIVATE", "reason": "ok"}).status_code == 400                       # reason too short
    on = c.post(f"/api/x/connectors/{cid}/state", json={"action": "ACTIVATE", "reason": "Tested with the department"})
    assert on.status_code == 200 and on.json()["status"] == "ACTIVE"
    assert c.post(f"/api/x/connectors/{cid}/mapping", json={"mapping": {"a": "name"}}).status_code == 409                                  # suspend first
    d = c.get(f"/api/x/connectors/{cid}").json()
    assert [x["action"] for x in d["log"]][:2] == ["ACTIVATED", "TESTED"]
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_partner_key_is_shown_once_scoped_rotatable_and_revocable():
    pid, token = person_with_cert()
    assert c.post("/api/x/keys", json={"system": "education", "scopes": ["PENSION_ELIGIBILITY"]}).status_code == 400                       # not this department's use
    k = c.post("/api/x/keys", json={"system": "education", "label": "test", "scopes": ["SCHOLARSHIP_ELIGIBILITY"], "days": 30})
    assert k.status_code == 200, k.text
    key, kid = k.json()["key"], k.json()["key_id"]
    listing = [x for x in c.get("/api/x/keys").json() if x["key_id"] == kid][0]
    assert "secret_hash" not in listing and key.split(".")[1] not in str(listing)                                                          # the secret is never shown again
    body = {"purpose": "SCHOLARSHIP_ELIGIBILITY", "question": "INCOME_AT_MOST", "params": {"limit": 250000}, "reference_token": token}
    assert c.post("/api/partner/verify", json=body).status_code == 401                                                                       # no key
    assert c.post("/api/partner/verify", json=body, headers={"X-Api-Key": kid + ".wrong"}).status_code == 401
    # the person has not agreed, so the department is refused, and that is logged under the key
    for g in c.get("/api/x/consents", params={"person_id": pid, "status": "GRANTED", "limit": 200}).json()["items"]:
        c.post(f"/api/x/consents/{g['id']}/revoke", json={})
    r = c.post("/api/partner/verify", json=body, headers={"X-Api-Key": key}).json()
    assert r["outcome"] == "DENIED_NO_CONSENT"
    cons = c.post("/api/x/consents", json={"person_id": pid, "purpose": "SCHOLARSHIP_ELIGIBILITY"}).json()
    c.post(f"/api/x/consents/{cons['id']}/respond", json={"decision": "GRANT"})
    assert c.post("/api/partner/verify", json=body, headers={"X-Api-Key": key}).json()["outcome"] == "ANSWERED"
    out = c.post("/api/partner/verify", json={**body, "purpose": "HOUSEHOLD_BENEFIT"}, headers={"X-Api-Key": key}).json()
    assert out["outcome"] == "DENIED_POLICY" and "not allowed" in out["message"]                                                             # outside the key's scopes
    assert c.get("/api/partner/catalogue", headers={"X-Api-Key": key}).json()["uses"][0]["purpose"] == "SCHOLARSHIP_ELIGIBILITY"
    new = c.post(f"/api/x/keys/{kid}/rotate").json()["key"]
    assert c.post("/api/partner/verify", json=body, headers={"X-Api-Key": key}).status_code == 401                                          # old secret dead
    assert c.post("/api/partner/verify", json=body, headers={"X-Api-Key": new}).status_code == 200
    assert c.post(f"/api/x/keys/{kid}/revoke", json={"reason": "no"}).status_code == 400
    assert c.post(f"/api/x/keys/{kid}/revoke", json={"reason": "Department asked us to"}).status_code == 200
    assert c.post("/api/partner/verify", json=body, headers={"X-Api-Key": new}).status_code == 401
    ledger = c.get("/api/x/ledger", params={"limit": 20}).json()["items"]
    assert any((x["requester_actor"] or "").startswith("partner:" + kid) for x in ledger)


def test_a_blocked_user_gets_nothing_until_restored():
    pid, token = person_with_cert()
    ask = {"requester": "pension", "purpose": "PENSION_ELIGIBILITY", "question": "AGE_AT_LEAST", "params": {"years": 60}, "person_id": pid}
    assert c.post("/api/x/verify", json=ask).json()["outcome"] in ("ANSWERED", "NO_RECORD")
    assert c.post("/api/x/access/block", json={"actor": "test-user", "reason": "myself, for a test"}).status_code == 400                       # not yourself
    assert c.post("/api/x/access/block", json={"actor": "someone-else", "reason": "x"}).status_code == 400
    b = c.post("/api/x/access/block", json={"actor": "someone-else", "reason": "Repeated lookups of one person"})
    assert b.status_code == 200
    assert c.post("/api/x/access/block", json={"actor": "someone-else", "reason": "Repeated lookups of one person"}).status_code == 409
    ov = c.get("/api/x/access").json()
    assert any(x["actor"] == "someone-else" for x in ov["blocks"] if not x["lifted_at"]) and ov["roles"]
    assert c.post(f"/api/x/access/{b.json()['id']}/lift", json={"reason": "Reviewed, it was valid work"}).status_code == 200
    # enforcement: block the test user through the database, then restore
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO mdm.access_block (actor, reason, blocked_by) VALUES ('test-user','test','t') RETURNING id")
        bid = cur.fetchone()["id"]
        conn.commit()
    try:
        r = c.post("/api/x/verify", json=ask).json()
        assert r["outcome"] == "DENIED_POLICY" and r["alert"] == "BLOCKED"
        qr = c.post("/api/x/query", json={"requester": "pension", "purpose": "PENSION_ELIGIBILITY", "elements": ["age"], "filters": {"district": "Medak", "min_age": 80}}).json()
        assert qr["outcome"] == "DENIED_POLICY"
    finally:
        c.post(f"/api/x/access/{bid}/lift", json={"reason": "test finished, restoring"})
    assert c.post("/api/x/verify", json=ask).json()["outcome"] in ("ANSWERED", "NO_RECORD")


def test_citizen_sees_own_data_answers_consent_and_reports_a_wrong_value():
    pid, token = person_with_cert()
    me = c.get(f"/api/x/citizen/{token}").json()
    assert me["person"]["id"] == pid and me["held"] and all(h["source"] != "identity_reference" for h in me["held"])
    assert c.get("/api/x/citizen/NOT-A-TOKEN").status_code == 404
    cons = c.post("/api/x/consents", json={"person_id": pid, "purpose": "SCHOLARSHIP_ELIGIBILITY"}).json()
    if cons["status"] == "GRANTED":
        c.post(f"/api/x/consents/{cons['id']}/revoke", json={})
        cons = c.post("/api/x/consents", json={"person_id": pid, "purpose": "SCHOLARSHIP_ELIGIBILITY"}).json()
    other_pid = q("SELECT person_id FROM mdm.source_record WHERE source='identity_reference' AND person_id<>%s LIMIT 1", pid)[0]["person_id"]
    other_tok = q("SELECT source_rid FROM mdm.source_record WHERE source='identity_reference' AND person_id=%s LIMIT 1", other_pid)[0]["source_rid"]
    assert c.post(f"/api/x/citizen/{other_tok}/consents/{cons['id']}/respond", json={"decision": "GRANT"}).status_code == 403              # someone else's request
    assert c.post(f"/api/x/citizen/{token}/consents/{cons['id']}/respond", json={"decision": "GRANT", "channel": "ASSISTED"}).status_code == 400   # operator named
    ok = c.post(f"/api/x/citizen/{token}/consents/{cons['id']}/respond", json={"decision": "GRANT", "elements": ["income_band"]})
    assert ok.status_code == 200, ok.text
    assert c.post(f"/api/x/citizen/{token}/consents/{cons['id']}/withdraw", json={}).status_code == 200
    r = c.post(f"/api/x/citizen/{token}/report", json={"attribute": "address", "reported_value": "New address", "reason": "Moved"})
    assert r.status_code == 200 and r.json()["authoritative_system"] == "pds"
    me = c.get(f"/api/x/citizen/{token}").json()
    assert any(x["reported_value"] == "New address" for x in me["reports"]) and any(x["purpose"] == "SCHOLARSHIP_ELIGIBILITY" for x in me["consents"])
    assert me["asked"] is not None


def test_assisted_session_needs_an_operator_and_records_what_was_done():
    pid, token = person_with_cert()
    assert c.post("/api/x/sessions", json={"operator": " ", "token": token}).status_code == 400
    assert c.post("/api/x/sessions", json={"operator": "Op 7", "token": "bad"}).status_code == 404
    s = c.post("/api/x/sessions", json={"operator": "Operator 7", "token": token, "visit_reason": "Wants to withdraw a consent"}).json()
    cons = c.post("/api/x/consents", json={"person_id": pid, "purpose": "SCHOLARSHIP_ELIGIBILITY"}).json()
    if cons["status"] == "PENDING":
        assert c.post(f"/api/x/citizen/{token}/consents/{cons['id']}/respond", json={"decision": "REFUSE", "channel": "ASSISTED", "operator": "Operator 7"}).status_code == 200
    # UC1: one open ROUTED discrepancy per person+attribute — clear a leftover so this demo step is not blocked.
    from app.db import connect
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""UPDATE mdm.discrepancy SET status='REJECTED', resolved_by='test', resolved_at=now(),
                              resolution_note='cleared so the assisted-session test can raise a fresh report'
                       WHERE person_id=%s AND attribute='name' AND kind='DISCREPANCY' AND status='ROUTED'""", (pid,))
        conn.commit()
    assert c.post(f"/api/x/citizen/{token}/report", json={"attribute": "name", "reported_value": "Spelling", "channel": "ASSISTED", "operator": "Operator 7"}).status_code == 200
    e = c.post(f"/api/x/sessions/{s['id']}/end").json()
    assert e["ended_at"] and e["summary"]["reports_raised"] >= 1
    assert c.post(f"/api/x/sessions/{s['id']}/end").status_code == 409
    assert any(x["id"] == s["id"] for x in c.get("/api/x/sessions").json())
    assert c.get("/api/audit/verify").json()["ok"] is True
