"""End-to-end check against a loaded database.

Uses citizen_db_test by default (see tests/conftest.py); refuses live citizen_db unless ALLOW_LIVE_DB=1.

  MDM_AUTH_DISABLED=true MDM_DB_DSN='... dbname=citizen_db_test ...' python -m pytest tests -q
"""
import os
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""
from fastapi.testclient import TestClient
from app.api import app

c = TestClient(app)


def test_health_and_dashboard():
    assert c.get("/api/health").json()["status"] == "ok"
    d = c.get("/api/dashboard").json()
    assert d["totals"]["persons"] > 0 and len(d["sources"]) == 10
    assert sum(d["links"].values()) == d["totals"]["records"]


def test_person_360_and_search():
    r = c.get("/api/persons", params={"q": "Goud", "limit": 5}).json()
    assert r["total"] > 0
    pid = max(r["items"], key=lambda x: x["source_count"])["id"]
    p = c.get(f"/api/persons/{pid}").json()
    assert p["records"] and p["attributes"] and "missing_sources" in p
    g = c.get(f"/api/persons/{pid}/graph").json()
    assert any(n["id"] == pid for n in g["nodes"])


def test_review_decision_and_unlink_roundtrip():
    q = c.get("/api/review", params={"limit": 50}).json()
    assert q["total"] > 0
    item = next(i for i in q["items"] if i["candidate_count"] > 0)
    t = c.get(f"/api/review/{item['id']}").json()
    assert t["candidate_details"]
    cand = t["candidate_details"][0]["person"]["id"]
    bad = c.post(f"/api/review/{item['id']}/decision", json={"decision": "LINK", "person_id": -5})
    assert bad.status_code == 400
    ok = c.post(f"/api/review/{item['id']}/decision", json={"decision": "LINK", "person_id": cand, "note": "test"})
    assert ok.status_code == 200, ok.text
    assert c.post(f"/api/review/{item['id']}/decision", json={"decision": "SEPARATE"}).status_code == 409
    rid = item["record_id"]
    u = c.post(f"/api/records/{rid}/unlink", json={"note": "undo"})
    assert u.status_code == 200, u.text
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_dq_and_rules():
    s = c.get("/api/dq/summary").json()
    assert s["by_code"]
    i = c.get("/api/dq/issues", params={"severity": "HIGH", "limit": 1}).json()["items"][0]
    assert c.post(f"/api/dq/issues/{i['id']}/correction", json={"note": "please verify"}).status_code == 200
    assert c.get("/api/rules").json()["active"]["match"]["auto"]
    # POST /api/rules/preview re-runs matching on every mdm.source_record via _recs_from_db +
    # cluster_records. That is a full-table scan in app code (no filter to limit to test rows);
    # do not call it here. Unknown settings are still refused quickly.
    assert c.post("/api/rules/preview", json={"match": {"bogus": 1}}).status_code == 400


def test_auth_required_when_enabled():
    import app.auth as a
    a.DISABLED = False
    try:
        assert c.get("/api/dashboard").status_code == 401
    finally:
        a.DISABLED = True


def _first(kind, status="PROPOSED"):
    items = c.get("/api/proposals", params={"status": status, "limit": 200}).json()["items"]
    return next((i for i in items if i["kind"] == kind), None)


def test_event_feed_birth_death_marriage_flow(tmp_path):
    import json, os, uuid
    tag = uuid.uuid4().hex[:6]
    feed = [
        {"order": 1, "use_case": "UC2", "event_type": "BIRTH_REGISTERED", "payload": {"registration_no": "T-B-1-" + tag, "child_name": "Test Child", "gender": "M", "date_of_birth": "2026-05-05", "father_name": "Nobody Known", "mother_name": "Nobody Either", "place": "Medak", "registration_date": "2026-05-06"}},
        {"order": 2, "use_case": "UC2", "event_type": "BIRTH_REGISTERED", "payload": {"registration_no": "T-B-1-" + tag, "child_name": "Test Child", "gender": "M", "date_of_birth": "2026-05-05", "father_name": "Nobody Known", "mother_name": "Nobody Either", "place": "Medak"}},
        {"order": 3, "use_case": "UC2", "event_type": "BIRTH_REGISTERED", "payload": {"registration_no": "T-B-2-" + tag, "child_name": None, "gender": "F", "date_of_birth": "2026-05-06", "father_name": "A Person", "mother_name": "B Person", "place": "Medak"}},
        {"order": 4, "use_case": "UC2", "event_type": "BIRTH_AMENDED", "payload": {"registration_no": "T-B-2-" + tag, "child_name": "Late Named"}},
        {"order": 5, "use_case": "UC2", "event_type": "BIRTH_WITHDRAWN", "payload": {"registration_no": "T-B-1-" + tag, "reason": "entered in error"}},
    ]
    f = tmp_path / "feed.jsonl"
    f.write_text("\n".join(json.dumps(e) for e in feed))
    os.environ["MDM_EVENTS_FILE"] = str(f)
    r = c.post("/api/events/replay")
    assert r.status_code == 200, r.text
    out = r.json()["outcomes"]
    assert out.get("DUPLICATE") == 1 and out.get("HELD") == 1
    evs = {}
    offset = 0
    while True:                                                   # page through; the table holds more than one page after other tests
        batch = c.get("/api/events", params={"limit": 200, "offset": offset}).json()["items"]
        if not batch:
            break
        for e in batch:
            evs.setdefault(e["event_key"] + e["event_type"], e)  # the first one received for each registration
        offset += len(batch)
    assert evs["T-B-1-" + tag + "BIRTH_REGISTERED"]["status"] == "WITHDRAWN"
    assert evs["T-B-2-" + tag + "BIRTH_REGISTERED"]["status"] == "PROCESSED" and evs["T-B-2-" + tag + "BIRTH_REGISTERED"]["person_id"]
    d = c.get(f"/api/events/{evs['T-B-1-' + tag + 'BIRTH_REGISTERED']['id']}").json()
    assert all(p["status"] == "WITHDRAWN" for p in d["proposals"])


def test_death_needs_confirmation_then_creates_follow_ups():
    c.post("/api/events/replay")           # the shipped sample feed, when present
    p = _first("CONFIRM_DEATH")
    if not p:
        return
    ev = c.get(f"/api/events/{p['event_id']}").json()
    prop = next(x for x in ev["proposals"] if x["id"] == p["id"])
    assert prop["options"] and ev["person"] is None
    bad = c.post(f"/api/proposals/{p['id']}/decision", json={"decision": "APPROVE", "person_id": -1})
    assert bad.status_code == 400
    pid = prop["detail"].get("suggested") or prop["options"][0]["person_id"]
    ok = c.post(f"/api/proposals/{p['id']}/decision", json={"decision": "APPROVE", "person_id": pid, "note": "Matches the death certificate"})
    assert ok.status_code == 200, ok.text
    assert c.get(f"/api/persons/{pid}").json()["person"]["life_status"] == "DECEASED"
    assert c.post(f"/api/proposals/{p['id']}/decision", json={"decision": "APPROVE", "person_id": pid}).status_code == 409
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_worklists_and_use_case_summary():
    uc = c.get("/api/usecases").json()
    assert [u["id"] for u in uc] == ["UC1", "UC2", "UC3", "UC4", "UC5", "UC6"]
    t = c.get("/api/worklists/turning-18", params={"limit": 5}).json()
    assert "items" in t and all("next_steps" in i for i in t["items"])
    h = c.get("/api/worklists/household").json()
    assert {"duplicate_benefit", "multi_card", "dead_active"} <= set(h)
