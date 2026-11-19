"""Data exchange core: consent, policy, verification-only queries, deliveries, rationale.
Run against a loaded database:  MDM_AUTH_DISABLED=true MDM_DB_DSN=... python -m pytest tests -q"""
import os, uuid
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""
from fastapi.testclient import TestClient
from app.api import app
from app.db import connect

c = TestClient(app)

import pytest


@pytest.fixture(autouse=True)
def _no_lookup_limit():
    """The misuse limiter is tested on its own; other tests look the same person up many times."""
    cur = {x["key"]: x for x in c.get("/api/x/policy").json()["policies"]}["max_lookups_per_hour"]["value"]
    c.post("/api/x/policy", json={"key": "max_lookups_per_hour", "value": 1000, "note": "tests"})
    yield
    c.post("/api/x/policy", json={"key": "max_lookups_per_hour", "value": cur, "note": "tests restored"})


def q(sql, *p):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, p)
        return cur.fetchall()


def person_with_income_cert():
    rows = q("""SELECT s.person_id, i.source_rid AS token FROM mdm.source_record s
                JOIN mdm.source_record i ON i.person_id=s.person_id AND i.source='identity_reference'
                WHERE s.source='revenue_certificates' AND s.rtype='INCOME' AND s.payload->>'status'='ACTIVE'
                  AND (SELECT count(*) FROM mdm.source_record x WHERE x.person_id=s.person_id AND x.source='revenue_certificates' AND x.rtype='INCOME')=1
                  AND (SELECT count(*) FROM mdm.person p WHERE p.id=s.person_id AND COALESCE(p.birth_year, 1900) < 1990)=1
                LIMIT 1""")
    assert rows, "the loaded data should hold an adult with one valid income certificate and an identity reference"
    return rows[0]["person_id"], rows[0]["token"]


def adult_without_cert():
    rows = q("""SELECT p.id FROM mdm.person p WHERE COALESCE(p.birth_year,1900) < 1990
                AND NOT EXISTS (SELECT 1 FROM mdm.source_record s WHERE s.person_id=p.id AND s.source='revenue_certificates') LIMIT 1""")
    return rows[0]["id"]


def grant(person_id, purpose, elements=None):
    r = c.post("/api/x/consents", json={"person_id": person_id, "purpose": purpose})
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    body = {"decision": "GRANT", "channel": "PORTAL"}
    if elements:
        body["elements"] = elements
    ok = c.post(f"/api/x/consents/{cid}/respond", json=body)
    assert ok.status_code == 200, ok.text
    return cid


def test_policy_versions_and_impact():
    p = {x["key"]: x for x in c.get("/api/x/policy").json()["policies"]}
    assert {"min_marriage_age", "adult_age", "consent_expiry_days", "max_reminders"} <= set(p)
    old = p["max_reminders"]["value"]
    pv = c.post("/api/x/policy/preview", json={"key": "min_marriage_age", "value": {"M": 21, "F": 21}}).json()
    assert any("Marriage records below the minimum age" in l for l in pv["lines"])
    assert c.post("/api/x/policy", json={"key": "max_reminders", "value": -1}).status_code == 400
    assert c.post("/api/x/policy", json={"key": "nope", "value": 1}).status_code == 400
    r = c.post("/api/x/policy", json={"key": "max_reminders", "value": old + 1, "note": "test"})
    assert r.status_code == 200 and r.json()["version"] > 1
    hist = c.get("/api/x/policy/max_reminders/history").json()
    assert hist[0]["active"] and hist[0]["value"] == old + 1 and not hist[1]["active"]
    c.post("/api/x/policy", json={"key": "max_reminders", "value": old, "note": "restore"})
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_verification_needs_consent_and_returns_only_outcomes():
    pid, token = person_with_income_cert()
    ask = {"requester": "education", "purpose": "SCHOLARSHIP_ELIGIBILITY", "question": "INCOME_AT_MOST", "params": {"limit": 250000}, "reference_token": token}
    # make sure no consent from an earlier run is lingering
    for k in c.get("/api/x/consents", params={"person_id": pid, "status": "GRANTED", "limit": 200}).json()["items"]:
        c.post(f"/api/x/consents/{k['id']}/revoke", json={})
    r = c.post("/api/x/verify", json=ask).json()
    assert r["outcome"] == "DENIED_NO_CONSENT"
    cid = grant(pid, "SCHOLARSHIP_ELIGIBILITY")
    r = c.post("/api/x/verify", json=ask).json()
    assert r["outcome"] == "ANSWERED" and r["answer"] in ("YES", "NO") and r["band"] and r["consent_id"] == cid
    assert "annual_income" not in r and "income" not in {k for k in r}     # the amount itself never leaves
    again = c.post("/api/x/verify", json={**ask, "params": {"limit": 1}}).json()
    assert again["answer"] == "NO"
    # the wrong department, an element the purpose does not allow, and an unknown identity reference
    assert c.post("/api/x/verify", json={**ask, "requester": "housing"}).json()["outcome"] == "DENIED_POLICY"
    assert c.post("/api/x/verify", json={**ask, "question": "DEATH_REGISTERED"}).json()["outcome"] == "DENIED_POLICY"
    nr = c.post("/api/x/verify", json={**ask, "reference_token": "IDR-DOES-NOT-EXIST"}).json()
    assert nr["outcome"] == "NO_RECORD" and "elsewhere" in nr["message"]
    led = c.get("/api/x/ledger", params={"person_id": pid}).json()
    assert led["total"] >= 3 and {"ANSWERED", "DENIED_NO_CONSENT"} <= {i["outcome"] for i in led["items"]}
    c.post(f"/api/x/consents/{cid}/revoke", json={"note": "test over"})


def test_partial_consent_limits_what_can_be_asked():
    pid, token = person_with_income_cert()
    cid = grant(pid, "SCHOLARSHIP_ELIGIBILITY", elements=["age", "residence"])
    ask = {"requester": "education", "purpose": "SCHOLARSHIP_ELIGIBILITY", "question": "INCOME_AT_MOST", "params": {"limit": 250000}, "person_id": pid}
    r = c.post("/api/x/verify", json=ask).json()
    assert r["outcome"] == "DENIED_POLICY" and "does not cover" in r["message"]
    assert c.post("/api/x/verify", json={**ask, "question": "AGE_AT_LEAST", "params": {"years": 18}}).json()["outcome"] == "ANSWERED"
    d = c.get(f"/api/x/consents/{cid}").json()
    assert d["receipt"]["partial"] is True and [l["action"] for l in d["log"]][:2] == ["REQUESTED", "GRANTED"]
    c.post(f"/api/x/consents/{cid}/revoke", json={})


def test_no_record_is_not_a_no_and_no_death_is_not_alive():
    pid = adult_without_cert()
    cid = grant(pid, "SCHOLARSHIP_ELIGIBILITY")
    r = c.post("/api/x/verify", json={"requester": "education", "purpose": "SCHOLARSHIP_ELIGIBILITY", "question": "INCOME_AT_MOST",
                                       "params": {"limit": 100000}, "person_id": pid}).json()
    assert r["outcome"] == "NO_RECORD" and "answer" not in r
    d = c.post("/api/x/verify", json={"requester": "pension", "purpose": "PENSION_ELIGIBILITY", "question": "DEATH_REGISTERED", "person_id": pid}).json()
    assert d["outcome"] == "ANSWERED" and d["answer"] == "NO_DEATH_RECORD" and "not proof" in d["message"]
    c.post(f"/api/x/consents/{cid}/revoke", json={})


def test_consent_state_machine():
    pid = adult_without_cert()
    r = c.post("/api/x/consents", json={"person_id": pid, "purpose": "HOUSEHOLD_BENEFIT"}).json()
    cid = r["id"]
    assert c.post("/api/x/consents", json={"person_id": pid, "purpose": "HOUSEHOLD_BENEFIT"}).json()["existing"] is True
    assert c.post(f"/api/x/consents/{cid}/respond", json={"decision": "GRANT", "channel": "ASSISTED"}).status_code == 400   # operator must be named
    assert c.post(f"/api/x/consents/{cid}/respond", json={"decision": "GRANT", "elements": ["bogus"]}).status_code == 400
    mx = {x["key"]: x for x in c.get("/api/x/policy").json()["policies"]}["max_reminders"]["value"]
    for _ in range(mx):
        assert c.post(f"/api/x/consents/{cid}/remind", json={}).status_code == 200
    assert c.post(f"/api/x/consents/{cid}/remind", json={}).status_code == 409                  # no repeated prompting beyond policy
    ok = c.post(f"/api/x/consents/{cid}/respond", json={"decision": "REFUSE", "channel": "ASSISTED", "operator": "Operator 7", "note": "does not want it"})
    assert ok.status_code == 200 and ok.json()["status"] == "REFUSED"
    assert c.post(f"/api/x/consents/{cid}/respond", json={"decision": "GRANT"}).status_code == 409
    assert c.post(f"/api/x/consents/{cid}/revoke", json={}).status_code == 409                  # only a granted consent can be withdrawn
    # a refusal does not block a later, fresh request
    new = c.post("/api/x/consents", json={"person_id": pid, "purpose": "HOUSEHOLD_BENEFIT"}).json()
    assert new["id"] != cid and new["status"] == "PENDING"
    # expiry: move the clock past the response window
    sw = c.post("/api/x/consents/sweep", json={"as_of": "2099-01-01"}).json()
    assert sw["no_response"] >= 1
    assert c.get(f"/api/x/consents/{new['id']}").json()["consent"]["status"] == "EXPIRED"
    assert c.post(f"/api/x/consents/{new['id']}/remind", json={}).status_code == 409
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_minor_needs_a_guardian_and_handover_ends_guardian_consent():
    minors = q("""SELECT p.id, (SELECT r.person_a FROM mdm.relationship r WHERE r.kind='PARENT_OF' AND r.person_b=p.id LIMIT 1) AS parent
                  FROM mdm.person p WHERE %s - p.birth_year BETWEEN 14 AND 16 AND p.life_status<>'DECEASED'
                  AND EXISTS (SELECT 1 FROM mdm.relationship r WHERE r.kind='PARENT_OF' AND r.person_b=p.id) LIMIT 1""", 2026)
    assert minors, "the data should hold a minor with a recorded parent"
    kid, parent = minors[0]["id"], minors[0]["parent"]
    cid = c.post("/api/x/consents", json={"person_id": kid, "purpose": "SCHOLARSHIP_ELIGIBILITY"}).json()["id"]
    assert c.post(f"/api/x/consents/{cid}/respond", json={"decision": "GRANT"}).status_code == 400          # the child cannot answer
    assert c.post(f"/api/x/consents/{cid}/respond", json={"decision": "GRANT", "given_by_person_id": kid + 100000}).status_code == 400
    ok = c.post(f"/api/x/consents/{cid}/respond", json={"decision": "GRANT", "given_by_person_id": parent})
    assert ok.status_code == 200 and ok.json()["given_by_person_id"] == parent
    assert c.post(f"/api/x/persons/{kid}/handover", json={}).status_code == 409                            # not yet an adult
    # three years on, the person is 18 or more: the guardian's consent ends and the person is asked afresh, with nothing enrolled
    h = c.post(f"/api/x/persons/{kid}/handover", json={"as_of": "2032-01-01"})
    assert h.status_code == 200, h.text
    assert h.json()["enrolled"] == 0 and cid in h.json()["ended"] and h.json()["new_requests"]
    assert c.get(f"/api/x/consents/{cid}").json()["consent"]["status"] == "ENDED"
    assert c.get(f"/api/x/consents/{h.json()['new_requests'][0]}").json()["consent"]["status"] == "PENDING"


def test_birth_waits_for_parent_consent_then_flows_and_revocation_is_told():
    # Need a ration card so the birth raises ADD_TO_RATION_CARD (pds_view alone is not enough).
    from tests.test_feed import couple
    pr = couple()
    tag = uuid.uuid4().hex[:6]
    ev = {"event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
          "payload": {"registration_no": "T-BC-" + tag, "child_name": "Consent Child " + tag, "gender": "F", "date_of_birth": "2026-06-01",
                      "father_name": pr["fname"], "mother_name": pr["mname"], "place": pr["district"], "registration_date": "2026-06-02"}}
    r = c.post("/api/events", json=ev)
    assert r.status_code == 200, r.text
    eid = r.json()["event_id"]
    flow = c.get(f"/api/x/events/{eid}/flow").json()
    assert {x["purpose"] for x in flow["consents"]} == {"BIRTH_PDS", "BIRTH_HEALTH", "BIRTH_CITIZEN_RECORD", "BIRTH_GIRL_SCHEME"}
    assert all(d["status"] == "PENDING_CONSENT" for d in flow["deliveries"])
    assert flow["timeline"][0]["what"].startswith("Event received")
    prop = next((p for p in flow["proposals"] if p["kind"] == "ADD_TO_RATION_CARD"), None)
    assert prop and prop["gate"]["status"] == "PENDING"
    blocked = c.post(f"/api/proposals/{prop['id']}/decision", json={"decision": "APPROVE"})
    assert blocked.status_code == 409 and "consent" in blocked.json()["detail"].lower()
    # the parent agrees to the ration card and the health schedule, and declines the rest
    by = {x["purpose"]: x["id"] for x in flow["consents"]}
    for pu in ("BIRTH_PDS", "BIRTH_HEALTH"):
        assert c.post(f"/api/x/consents/{by[pu]}/respond", json={"decision": "GRANT", "channel": "ASSISTED", "operator": "Operator 3"}).status_code == 200
    for pu in ("BIRTH_CITIZEN_RECORD", "BIRTH_GIRL_SCHEME"):
        assert c.post(f"/api/x/consents/{by[pu]}/respond", json={"decision": "REFUSE"}).status_code == 200
    st = {d["purpose"]: d["status"] for d in c.get(f"/api/x/events/{eid}/flow").json()["deliveries"]}
    assert st["BIRTH_PDS"] == st["BIRTH_HEALTH"] == "DELIVERED" and st["BIRTH_GIRL_SCHEME"] == st["BIRTH_CITIZEN_RECORD"] == "BLOCKED_REFUSED"
    ok = c.post(f"/api/proposals/{prop['id']}/decision", json={"decision": "APPROVE", "note": "parent consented"})
    assert ok.status_code == 200, ok.text
    # the parent later withdraws the health consent: the health department is told
    rv = c.post(f"/api/x/consents/{by['BIRTH_HEALTH']}/revoke", json={"note": "changed mind"}).json()
    assert "Health" in rv["departments_told"]
    kinds = [(d["kind"], d["system"], d["status"]) for d in c.get(f"/api/x/events/{eid}/flow").json()["deliveries"]]
    assert ("REVOCATION", "health", "DELIVERED") in kinds
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_birth_with_unidentified_parents_sends_nothing():
    tag = uuid.uuid4().hex[:6]
    r = c.post("/api/events", json={"event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {"registration_no": "T-BN-" + tag, "child_name": "Orphan Test " + tag, "gender": "M", "date_of_birth": "2026-06-01",
                    "father_name": "Zzzz Nobody", "mother_name": "Qqqq Unknown", "place": "Medak", "registration_date": "2026-06-02"}})
    flow = c.get(f"/api/x/events/{r.json()['event_id']}/flow").json()
    assert flow["deliveries"] and all(d["status"] == "BLOCKED_NO_PARENT" for d in flow["deliveries"]) and not flow["consents"]


def test_sensitive_approvals_need_a_recorded_reason():
    who = q("""SELECT p.id, p.name, p.birth_year FROM mdm.person p WHERE p.life_status<>'DECEASED' AND p.birth_year < 1960 AND p.name ~ '^[A-Za-z]+( [A-Za-z]+)+$'   -- Latin-letter names: a name in Telugu letters cannot be matched against the English records
               AND (SELECT count(*) FROM mdm.person x WHERE x.name=p.name)=1 AND EXISTS (SELECT 1 FROM mdm.source_record s WHERE s.person_id=p.id AND s.source='pension_batch')
               LIMIT 1""")
    assert who, "the data should hold an older person with a pension and a distinctive name"
    w, tag = who[0], uuid.uuid4().hex[:6]
    r = c.post("/api/events", json={"event_type": "DEATH_REGISTERED", "use_case": "UC3", "order": 1,
        "payload": {"registration_no": "T-D-" + tag, "name": w["name"], "age_at_death": 2026 - w["birth_year"], "date_of_death": "2026-06-10", "place_of_death": "Telangana"}})
    assert r.status_code == 200, r.text
    items = c.get("/api/x/approvals", params={"limit": 200}).json()["items"]
    sens = next(i for i in items if i["kind"] == "CONFIRM_DEATH" and i["detail"].get("registration_no") == "T-D-" + tag)
    assert sens["needs_rationale"] is True
    pid = sens["detail"].get("suggested") or sens["options"][0]["person_id"]
    r = c.post(f"/api/proposals/{sens['id']}/decision", json={"decision": "APPROVE", "person_id": pid})
    assert r.status_code == 400 and "reason" in r.json()["detail"].lower()
    assert c.post(f"/api/proposals/{sens['id']}/decision", json={"decision": "APPROVE", "person_id": pid, "note": "short"}).status_code == 400
    ok = c.post(f"/api/proposals/{sens['id']}/decision", json={"decision": "APPROVE", "person_id": pid, "note": "Matches the registered certificate"})
    assert ok.status_code == 200, ok.text
    done = c.get("/api/x/approvals", params={"status": "APPROVED", "limit": 200}).json()["items"]
    mine = next(i for i in done if i["id"] == sens["id"])
    assert mine["rationale"].startswith("Matches") and mine["decided_by"]
    # the follow-up actions are proposals in the departments' queues, not actions already taken
    follow = [i for i in c.get("/api/x/approvals", params={"limit": 200}).json()["items"] if i["parent_id"] == sens["id"]]
    assert follow and all(f["status"] == "PROPOSED" for f in follow)
    stop = next((f for f in follow if f["kind"] == "STOP_PENSION"), None)
    assert stop and stop["needs_rationale"]
    assert c.post(f"/api/proposals/{stop['id']}/decision", json={"decision": "APPROVE"}).status_code == 400


def test_identity_panel_and_person_exchange_summary():
    pid, token = person_with_income_cert()
    s = c.get(f"/api/x/persons/{pid}/exchange").json()
    assert s["identity"]["linked"] and any(t["token"] == token for t in s["identity"]["tokens"])
    assert "No identity number" in s["identity"]["note"]


def test_event_stream_shows_department_outcomes():
    s = c.get("/api/x/events", params={"limit": 200}).json()
    assert s["total"] > 0 and {"delivered", "waiting", "blocked", "open_proposals"} <= set(s["items"][0])
    births = [i for i in s["items"] if i["event_type"] == "BIRTH_REGISTERED" and (i["waiting"] or i["delivered"] or i["blocked"])]
    assert births, "births should show what happened for each department"
    assert c.get("/api/x/events", params={"uc": "UC2", "status": "PROCESSED"}).status_code == 200
