"""End-to-end check against a loaded database:  MDM_AUTH_DISABLED=true MDM_DB_DSN=... python -m pytest tests -q"""
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
    assert c.post("/api/rules/preview", json={"match": {"auto": 0.99, "review": 0.9}}).json()["would_produce"]["IN_REVIEW"] >= 0
    assert c.post("/api/rules/preview", json={"match": {"bogus": 1}}).status_code == 400


def test_auth_required_when_enabled():
    import app.auth as a
    a.DISABLED = False
    try:
        assert c.get("/api/dashboard").status_code == 401
    finally:
        a.DISABLED = True
