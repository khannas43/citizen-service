"""Wave 4: scenario runner, event injector, evidence pack, written-evidence register."""
import os
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""
import pytest
from fastapi.testclient import TestClient
from app.api import app

c = TestClient(app)


@pytest.fixture(autouse=True)
def _lookup_limit_off():
    from app import exchange
    from app.db import connect

    cur = {x["key"]: x for x in c.get("/api/x/policy").json()["policies"]}["max_lookups_per_hour"]["value"]
    c.post("/api/x/policy", json={"key": "max_lookups_per_hour", "value": 1000, "note": "tests"})
    # Live step 2.4 may leave Health unavailable in citizen_db_test; keep it on for scripted scenarios.
    with connect() as conn:
        exchange.set_subscriber(conn.cursor(), "health", True, "test", "wave4 setup: Health on")
        conn.commit()
    yield
    c.post("/api/x/policy", json={"key": "max_lookups_per_hour", "value": cur, "note": "tests restored"})
    with connect() as conn:
        exchange.set_subscriber(conn.cursor(), "health", True, "test", "wave4 teardown: Health on")
        conn.commit()


def test_catalogue_lists_48_scripted_scenarios_and_9_cross_cutting_tests():
    cat = c.get("/api/x/demo/scenarios").json()
    ids = [i["id"] for i in cat["items"]]
    assert len(ids) == 57 and ids[:2] == ["1.1", "1.2"] and ids[-1] == "CC9"
    by_uc = {}
    for i in cat["items"]:
        by_uc[i["uc"]] = by_uc.get(i["uc"], 0) + 1
    assert by_uc == {"UC1": 6, "UC2": 13, "UC3": 10, "UC4": 8, "UC5": 6, "UC6": 5, "CC": 9}
    by_id = {i["id"]: i for i in cat["items"]}
    for sid in ("2.4", "2.5", "2.8", "2.9", "2.12", "2.13", "3.6", "3.7", "3.8", "3.9", "3.10", "4.7", "4.8"):
        assert sid in ids and by_id[sid]["type"] == "step", sid
    assert all(i["title"] and i["shows"] for i in cat["items"])


def test_runner_runs_scenarios_step_by_step_and_records_evidence():
    rid = c.post("/api/x/demo/runs", json={"kind": "test"}).json()["run_id"]
    for sid in ("2.2", "3.2", "4.5"):
        r = c.post(f"/api/x/demo/runs/{rid}/scenarios/{sid}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] in ("PASS", "PARTIAL"), (sid, body["status"], [x["text"] for x in body["checks"] if not x["ok"]], body["error"])
        assert len([x for x in body["checks"] if not x.get("info")]) >= 3          # a pass is never an empty claim
    assert c.post(f"/api/x/demo/runs/{rid}/scenarios/9.9").status_code == 404
    done = c.post(f"/api/x/demo/runs/{rid}/finish").json()
    assert done["total"] == 3 and done["FAIL"] == 0 and done["ERROR"] == 0
    got = c.get(f"/api/x/demo/runs/{rid}").json()
    assert [x["scenario"] for x in got["results"]] == ["2.2", "3.2", "4.5"]
    assert c.get("/api/x/demo/runs/latest").json()["id"] >= rid
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_a_failing_check_is_reported_as_fail_not_hidden(monkeypatch):
    from app import demo

    def bad(k):
        k.ok(True, "fine")
        k.ok(False, "this did not happen")
    monkeypatch.setitem(demo.FUNCS, "1.1", bad)
    r = demo.run_one("1.1")
    assert r["status"] == "FAIL"

    def gap(k):
        k.ok(True, "fine")
        k.gap("not built yet")
    monkeypatch.setitem(demo.FUNCS, "1.1", gap)
    assert demo.run_one("1.1")["status"] == "PARTIAL"

    def boom(k):
        raise RuntimeError("x")
    monkeypatch.setitem(demo.FUNCS, "1.1", boom)
    assert demo.run_one("1.1")["status"] == "ERROR"

    def none(k):
        k.skip("no data")
    monkeypatch.setitem(demo.FUNCS, "1.1", none)
    assert demo.run_one("1.1")["status"] == "SKIPPED"


def test_injector_covers_late_duplicate_out_of_order_corrected_withdrawn_and_misuse():
    cats = {x["id"] for x in c.get("/api/x/demo/injections").json()["categories"]}
    assert {"LATE_BIRTH", "DUPLICATE_BIRTH", "OUT_OF_ORDER", "CORRECTED_NAME", "WITHDRAWN_BIRTH", "UNKNOWN_DEATH", "DEATH_IN_FLIGHT",
            "WRONG_RECORD", "DEPT_OUTAGE", "DEPT_RESTORE", "CONSENT_WITHDRAWN", "POLICY_CHANGE", "MISUSE_LOOKUPS"} <= cats
    assert c.post("/api/x/demo/inject", json={"category": "NOPE"}).status_code == 400
    dup = c.post("/api/x/demo/inject", json={"category": "DUPLICATE_BIRTH"}).json()
    assert dup["first"] == "PROCESSED" and dup["second"] == "DUPLICATE"
    ooo = c.post("/api/x/demo/inject", json={"category": "OUT_OF_ORDER"}).json()
    assert ooo["status"] == "HELD"
    wd = c.post("/api/x/demo/inject", json={"category": "WITHDRAWN_BIRTH"}).json()
    assert wd["second"] == "WITHDRAWN" and wd["open_proposals_left"] == 0
    late = c.post("/api/x/demo/inject", json={"category": "LATE_BIRTH"}).json()
    assert late["flagged_late"] is True
    ghost = c.post("/api/x/demo/inject", json={"category": "UNKNOWN_DEATH"}).json()
    assert ghost["status"] == "NO_MATCH"
    mis = c.post("/api/x/demo/inject", json={"category": "MISUSE_LOOKUPS", "params": {"count": 4}}).json()
    assert "look-ups" in mis["observed"]
    out = c.post("/api/x/demo/inject", json={"category": "DEPT_OUTAGE", "params": {"system": "health"}}).json()
    assert out["available"] is False
    back = c.post("/api/x/demo/inject", json={"category": "DEPT_RESTORE", "params": {"system": "health"}}).json()
    assert back["available"] is True
    assert c.get("/api/x/demo/injections").json()["log"][0]["category"] == "DEPT_RESTORE"


def test_late_amendment_is_applied_when_its_registration_arrives():
    rid = c.post("/api/x/demo/runs", json={"kind": "test"}).json()["run_id"]
    r = c.post(f"/api/x/demo/runs/{rid}/scenarios/CC4").json()
    assert r["status"] in ("PASS", "PARTIAL") and any("held correction is then applied" in x["text"] and x["ok"] for x in r["checks"])


def test_written_evidence_register_and_evidence_pack():
    docs = c.get("/api/x/demo/documents").json()
    assert {d["item"] for d in docs} >= {"hosting", "encryption", "dr"}
    assert c.put("/api/x/demo/documents/dr", json={"status": "READY"}).status_code in (200, 400)
    bad = c.put("/api/x/demo/documents/encryption", json={"status": "BOGUS"})
    assert bad.status_code == 400
    assert c.put("/api/x/demo/documents/nope", json={"status": "DRAFT"}).status_code == 404
    ok = c.put("/api/x/demo/documents/hosting", json={"status": "DRAFT", "owner": "DevOps lead", "notes": "outline written"})
    assert ok.status_code == 200 and ok.json()["status"] == "DRAFT"
    ready_no_ref = c.put("/api/x/demo/documents/capacity", json={"status": "READY", "reference": ""})
    assert ready_no_ref.status_code == 400
    pack = c.get("/api/x/demo/evidence").json()
    assert pack["scripted"]["total"] == 57 and pack["audit_chain"]["ok"] is True and len(pack["written_evidence"]) >= 6
    md = c.get("/api/x/demo/evidence.md")
    assert md.status_code == 200 and "evidence pack" in md.text and "Written evidence" in md.text and "Audit chain: intact" in md.text
    assert "BIRTH_REGISTERED" not in md.text            # the pack states results, not raw payloads


def test_reset_removes_demo_records_but_keeps_the_audit_trail():
    c.post("/api/x/demo/inject", json={"category": "DUPLICATE_BIRTH"})
    before = c.get("/api/x/audit", params={"limit": 1}).json()["total"]
    r = c.post("/api/x/demo/reset").json()
    assert r["events"] >= 1
    assert c.get("/api/x/audit", params={"limit": 1}).json()["total"] > before
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_list_search_params():
    """Event, approval, ledger and discrepancy lists accept a free-text search."""
    for path in ("/x/events", "/x/approvals", "/x/ledger", "/x/discrepancies"):
        base = c.get(f"/api{path}").json()
        none = c.get(f"/api{path}", params={"q": "zzzz-no-such-text-zzzz"}).json()
        assert none["total"] == 0, path
        assert base["total"] >= none["total"]
