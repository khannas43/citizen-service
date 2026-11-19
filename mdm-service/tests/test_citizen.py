"""Citizen's own consent inbox: only their requests, answered with their own sign-in."""
import uuid, os
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""
import pytest
from fastapi.testclient import TestClient
from app.api import app
from app import citizen
from tests.test_feed import couple, c as officer, q

cl = TestClient(app)


@pytest.fixture
def signin(monkeypatch):
    tag = uuid.uuid4().hex[:6]
    monkeypatch.setattr(
        citizen, "verify_citizen_token",
        lambda h, t=tag: {
            "Bearer m": "REF-MOTHER-" + t,
            "Bearer f": "REF-FATHER-" + t,
            "Bearer x": "REF-NOBODY-" + t,
        }.get(h) or (_ for _ in ()).throw(citizen.Refused("Your session is not valid or has expired", 401)),
    )
    return tag


def birth(tag):
    """Create birth + citizen links from the matched parents (not couple() ids)."""
    pr = couple()
    r = officer.post("/api/events", json={
        "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {
            "registration_no": "CZ-B-" + tag, "child_name": "Citizen Child " + tag, "gender": "F",
            "date_of_birth": "2026-06-01", "father_name": pr["fname"], "mother_name": pr["mname"],
            "place": pr["district"], "registration_date": "2026-06-02",
        },
    })
    assert r.status_code == 200, r.text
    eid = r.json()["event_id"]
    flow = officer.get(f"/api/x/events/{eid}/flow").json()
    consents = flow["consents"]
    assert consents, flow
    prow = q("""SELECT detail->'parents' AS parents FROM mdm.proposal
                WHERE event_id=%s AND detail ? 'parents' ORDER BY id LIMIT 1""", eid)
    assert prow and prow[0]["parents"], (eid, prow)
    parents = prow[0]["parents"]
    mid = (parents.get("mother") if isinstance(parents.get("mother"), dict) else None) or {}
    fid = (parents.get("father") if isinstance(parents.get("father"), dict) else None) or {}
    mid_id = mid.get("person_id")
    fid_id = fid.get("person_id")
    owner = q("SELECT person_id FROM mdm.consent WHERE id=%s", consents[0]["id"])[0]["person_id"]
    other = next((p for p in (mid_id, fid_id) if p and int(p) != int(owner)), None)
    assert other, (owner, mid_id, fid_id)
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-MOTHER-" + tag, "person_id": owner}).status_code == 200
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-FATHER-" + tag, "person_id": other}).status_code == 200
    return pr, eid, consents[0], owner


def test_citizen_sees_and_answers_only_their_own_requests(signin):
    tag = signin
    pr, eid, pid, owner = birth(tag)

    inbox = cl.get("/api/citizen/consents", headers={"Authorization": "Bearer m"}).json()
    mine = [i for i in inbox["items"] if i["id"] == pid["id"]]
    assert mine and mine[0]["status"] == "PENDING" and mine[0]["elements"] and mine[0]["department_name"] and mine[0]["term_days"]
    assert inbox["pending"] >= 1
    # the other person cannot see or answer it on the old per-consent inbox
    assert all(i["id"] != pid["id"] for i in cl.get("/api/citizen/consents", headers={"Authorization": "Bearer f"}).json()["items"])
    assert cl.post(f"/api/citizen/consents/{pid['id']}/respond", json={"decision": "GRANT"}, headers={"Authorization": "Bearer f"}).status_code == 403
    # an unlinked sign-in is told so; a bad token is refused
    assert cl.get("/api/citizen/consents", headers={"Authorization": "Bearer x"}).status_code == 404
    assert cl.get("/api/citizen/consents", headers={"Authorization": "Bearer bad"}).status_code == 401
    # a child's consent must be answered on Approvals (with a declaration), not the old respond route
    assert cl.post(f"/api/citizen/consents/{pid['id']}/respond",
                   json={"decision": "GRANT", "elements": [mine[0]["elements"][0]]},
                   headers={"Authorization": "Bearer m"}).status_code == 409
    r = cl.post(f"/api/citizen/approvals/event-{eid}/answer", json={
        "relationship": "mother", "declared": True,
        "answers": [{"consent_id": pid["id"], "decision": "GRANT", "elements": [mine[0]["elements"][0]]}],
    }, headers={"Authorization": "Bearer m"})
    assert r.status_code == 200, r.text
    # Inbox is capped and PENDING-first; assert the row itself (and any inbox hit).
    row = q("SELECT status, scope FROM mdm.consent WHERE id=%s", pid["id"])[0]
    assert row["status"] == "GRANTED"
    scope = row["scope"] or {}
    assert scope.get("partial") is True
    after = [i for i in cl.get("/api/citizen/consents", headers={"Authorization": "Bearer m"}).json()["items"] if i["id"] == pid["id"]]
    if after:
        assert after[0]["status"] == "GRANTED" and after[0]["partial"] is True
    assert cl.post(f"/api/citizen/consents/{pid['id']}/withdraw", headers={"Authorization": "Bearer m"}).status_code == 200
    # the ledger records the citizen's own sign-in as the actor
    assert q("SELECT 1 FROM mdm.consent_log WHERE consent_id=%s AND actor LIKE 'citizen:%%'", pid["id"])


def test_an_identity_token_works_without_a_link(monkeypatch):
    tok = q("SELECT source_rid, person_id FROM mdm.source_record WHERE source='identity_reference' AND person_id IS NOT NULL LIMIT 1")[0]
    monkeypatch.setattr(citizen, "verify_citizen_token", lambda h: tok["source_rid"])
    assert cl.get("/api/citizen/consents", headers={"Authorization": "Bearer t"}).status_code == 200
