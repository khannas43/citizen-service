"""Lineage: field, record and flow level, the sources-to-consumers overview, and the OpenLineage-shaped export."""
import os
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""
from fastapi.testclient import TestClient
from app.api import app

c = TestClient(app)


def _multi_source_person():
    r = c.get("/api/persons", params={"min_sources": 4, "limit": 5})
    assert r.status_code == 200, r.text
    return r.json()["items"][0]["id"]


def test_person_lineage_shows_each_system_its_records_and_which_value_won():
    r = c.get(f"/api/x/lineage/person/{_multi_source_person()}")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["summary"]["systems"] >= 4 and d["summary"]["records"] >= d["summary"]["systems"]
    rec = d["sources"][0]["records"][0]
    assert rec["source_rid"] and rec["link_status"] and "loaded_at" in rec
    name = next(f for f in d["fields"] if f["attribute"] == "name")
    assert name["rule"] and name["chosen_source_name"]
    assert sum(1 for o in name["offers"] if o["chosen"]) == 1, "exactly one offer is marked as the winner"
    assert all(o["source_name"] for o in name["offers"])


def test_person_lineage_unknown_person_is_404():
    assert c.get("/api/x/lineage/person/999999999").status_code == 404


def test_event_flow_runs_from_source_to_event_and_lists_what_followed():
    ev = c.get("/api/x/events", params={"limit": 50}).json()["items"]
    pick = next((e for e in ev if e.get("delivered") or e.get("open_proposals")), ev[0])
    r = c.get(f"/api/x/lineage/event/{pick['id']}")
    assert r.status_code == 200, r.text
    d = r.json()
    kinds = {n["kind"] for n in d["nodes"]}
    assert {"source", "event"} <= kinds
    ids = {n["id"] for n in d["nodes"]}
    assert all(e["from"] in ids and e["to"] in ids for e in d["edges"]), "every edge joins two nodes that exist"
    assert any(e["from"] == "src" and e["to"] == "ev" for e in d["edges"])


def test_overview_counts_match_the_records_and_name_consumers():
    d = c.get("/api/x/lineage/overview").json()
    assert d["core"]["records"] == sum(s["records"] for s in d["sources"]) > 0
    assert all(s["name"] and "loaded_at" in s for s in d["sources"])
    assert d["core"]["persons"] > 0 and d["outputs"] and isinstance(d["consumers"], list)


def test_export_is_openlineage_shaped_with_inputs_and_outputs():
    d = c.get("/api/x/lineage/export").json()
    assert d["events"] and all(e["eventType"] == "COMPLETE" and e["job"]["name"] and "inputs" in e and "outputs" in e for e in d["events"])
    first = d["events"][0]
    assert len(first["inputs"]) >= 8 and first["outputs"][0]["name"] == "mdm.source_record"


def test_overview_can_focus_on_one_source():
    allv = c.get("/api/x/lineage/overview").json()
    src = allv["sources"][0]["source"]
    f = c.get("/api/x/lineage/overview", params={"source": src}).json()
    assert f["focus"] == src and len(f["sources"]) == len(allv["sources"])
    assert f["core"]["records"] == allv["sources"][0]["records"]
    assert f["core"]["persons"] <= allv["core"]["persons"] and f["core"]["review_open"] <= allv["core"]["review_open"]
    assert sum(o["count"] for o in f["outputs"]) <= sum(o["count"] for o in allv["outputs"])
    assert c.get("/api/x/lineage/overview", params={"source": "nope"}).json()["focus"] is None


def test_events_say_which_citizen_they_are_about():
    d = c.get("/api/x/events", params={"limit": 200}).json()
    named = [e for e in d["items"] if e["citizen"]]
    assert named and all("person_mdm_id" in e for e in d["items"])
    n = named[0]["citizen"]
    f = c.get("/api/x/events", params={"q": n}).json()
    assert any(e["citizen"] == n for e in f["items"])
    assert c.get("/api/x/events", params={"sort": "citizen", "dir": "asc"}).status_code == 200
    flow = c.get(f"/api/x/lineage/event/{named[0]['id']}").json()
    assert flow["event"]["citizen"] == n


def test_a_marriage_event_names_bride_and_groom_separately():
    d = c.get("/api/x/events", params={"limit": 200, "q": "MARRIAGE"}).json()
    ms = [e for e in d["items"] if e["event_type"] == "MARRIAGE_REGISTERED" and e["payload"].get("bride_name")]
    assert ms
    for e in ms:
        assert [p["role"] for p in e["people"]] == ["Bride", "Groom"]
        assert e["people"][0]["name"] == e["payload"]["bride_name"]
    solved = [e for e in ms if any(p["person_id"] for p in e["people"])]
    if solved:
        f = c.get(f"/api/x/lineage/event/{solved[0]['id']}").json()["event"]
        assert f["people"] == solved[0]["people"]
    one = next(e for e in c.get("/api/x/events", params={"limit": 50}).json()["items"] if "bride_name" not in e["payload"] and e["citizen"])
    assert len(one["people"]) == 1 and one["people"][0]["role"] is None


def test_a_repeat_delivery_is_about_the_same_citizen_as_the_first():
    """Create first+duplicate ourselves — do not hunt the shared event table."""
    import uuid
    from tests.test_feed import couple

    pr, tag = couple(), uuid.uuid4().hex[:6]
    reg = "LN-DUP-" + tag
    payload = {
        "registration_no": reg, "child_name": "Lineage Child " + tag, "gender": "M",
        "date_of_birth": "2026-06-01", "father_name": pr["fname"], "mother_name": pr["mname"],
        "place": pr["district"], "registration_date": "2026-06-02",
    }
    first = c.post("/api/events", json={"event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1, "payload": payload})
    assert first.status_code == 200 and first.json()["status"] == "PROCESSED", first.text
    first_pid = first.json()["person_id"]
    assert first_pid
    dup = c.post("/api/events", json={"event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 2, "payload": payload})
    assert dup.status_code == 200 and dup.json()["status"] == "DUPLICATE", dup.text
    dup_id = dup.json()["event_id"]
    row = c.get(f"/api/x/lineage/event/{dup_id}").json()["event"]
    # Duplicate keeps person_id null on the event row but people[] points at the first match
    assert row["status"] == "DUPLICATE"
    assert row.get("person_id") in (None, first_pid)
    people = row.get("people") or []
    assert people and people[0].get("person_id") == first_pid
    listed = c.get("/api/x/events", params={"q": reg, "limit": 50, "sort": "received_at", "dir": "asc"}).json()["items"]
    same_key = [e for e in listed if e["event_key"] == reg]
    assert len(same_key) >= 2
    original = next(e for e in same_key if e["status"] == "PROCESSED")
    assert original["person_id"] == first_pid
