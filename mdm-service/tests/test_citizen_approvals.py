"""Citizen approvals: one birth → one approval group; either linked parent may answer; other approvals are proposals."""
import uuid, os
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""
import pytest
from fastapi.testclient import TestClient
from app.api import app
from app import citizen, notify, exchange
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
            "Bearer s": "REF-STRANGER-" + t,
        }.get(h) or (_ for _ in ()).throw(citizen.Refused("Your session is not valid or has expired", 401)),
    )
    return tag


def _set_parent_scores(eid, score, confident=None, couple_linked=None):
    """Force mother/father match scores; clear or set the Change 3 confident flag for on-read tests."""
    from app.db import connect
    import json as _json
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""UPDATE mdm.proposal SET detail = jsonb_set(
                         jsonb_set(detail, '{parents,mother,score}', %s::jsonb, true),
                         '{parents,father,score}', %s::jsonb, true)
                       WHERE event_id=%s AND detail ? 'parents'""",
                    (str(score), str(score), eid))
        if confident is None:
            cur.execute("""UPDATE mdm.proposal SET detail = detail #- '{parents,confident}'
                           WHERE event_id=%s AND detail ? 'parents'""", (eid,))
        else:
            cur.execute("""UPDATE mdm.proposal SET detail = jsonb_set(detail, '{parents,confident}', %s::jsonb, true)
                           WHERE event_id=%s AND detail ? 'parents'""",
                        (_json.dumps(bool(confident)), eid))
        if couple_linked is not None:
            cur.execute("""UPDATE mdm.proposal SET detail = jsonb_set(detail, '{parents,couple_linked}', %s::jsonb, true)
                           WHERE event_id=%s AND detail ? 'parents'""",
                        (_json.dumps(bool(couple_linked)), eid))
        # Re-classify open ration-card rows after score edits.
        from app import workqueue
        cur.execute("SELECT id FROM mdm.proposal WHERE event_id=%s AND status='PROPOSED'", (eid,))
        for row in cur.fetchall():
            workqueue.apply_classification(cur, row["id"])
        conn.commit()


def _lower_parent_scores(eid, score=0.5):
    _set_parent_scores(eid, score, confident=False, couple_linked=True)


def birth(tag, gender="F"):
    """Real demo couple — no score edits (Change 2/3)."""
    pr = couple()
    r = officer.post("/api/events", json={
        "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {
            "registration_no": f"AP-B-{tag}-{gender}", "child_name": f"Approval Child {tag}{gender}",
            "gender": gender, "date_of_birth": "2026-10-30",
            "father_name": pr["fname"], "mother_name": pr["mname"],
            "place": pr["district"], "registration_date": "2026-10-31",
        },
    })
    assert r.status_code == 200, r.text
    eid = r.json()["event_id"]
    flow = officer.get(f"/api/x/events/{eid}/flow").json()
    consents = flow["consents"]
    assert consents, flow
    # Matched parents come from the birth proposal — not couple() ids (duplicate names can mismatch).
    prow = q("""SELECT detail->'parents' AS parents FROM mdm.proposal
                WHERE event_id=%s AND detail ? 'parents' ORDER BY id LIMIT 1""", eid)
    assert prow and prow[0]["parents"], (eid, prow)
    parents = prow[0]["parents"]
    mid = (parents.get("mother") or {}).get("person_id")
    fid = (parents.get("father") or {}).get("person_id")
    mid = int(mid) if mid is not None else None
    fid = int(fid) if fid is not None else None
    owner = q("SELECT person_id FROM mdm.consent WHERE id=%s", consents[0]["id"])[0]["person_id"]
    other = next((p for p in (mid, fid) if p and p != owner), None)
    assert other, (owner, mid, fid)
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-MOTHER-" + tag, "person_id": owner}).status_code == 200
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-FATHER-" + tag, "person_id": other}).status_code == 200
    return pr, eid, consents, owner, other


def _approve_parent_review(eid, note="Parents confirmed after review by steward"):
    rows = q("SELECT id FROM mdm.proposal WHERE event_id=%s AND kind='REVIEW_PARENTS' AND status='PROPOSED'", eid)
    assert rows, "expected a REVIEW_PARENTS proposal"
    r = officer.post(f"/api/proposals/{rows[0]['id']}/decision",
                     json={"decision": "APPROVE", "note": note})
    assert r.status_code == 200, r.text
    return rows[0]["id"]


def h(who="m"):
    return {"Authorization": f"Bearer {who}"}


def test_a_birth_makes_one_approval_group_with_one_line_per_department(signin):
    _, eid, consents, _, _ = birth(signin, "F")
    data = cl.get("/api/citizen/approvals", headers=h("m")).json()
    group = next(i for i in data["items"] if i["key"] == f"event-{eid}")
    assert group["kind"] == "CONSENT_GROUP"
    assert group["status"] == "PENDING"
    assert group["child"]["name"]
    assert {ln["consent_id"] for ln in group["lines"]} == {c["id"] for c in consents}
    assert all(ln["department_name"] and ln["purpose_name"] and ln["elements"] for ln in group["lines"])


def test_a_girl_birth_has_four_lines_a_boy_birth_three(signin):
    _, eid_f, consents_f, _, _ = birth(signin, "F")
    assert len(consents_f) == 4
    girl = cl.get(f"/api/citizen/approvals/event-{eid_f}", headers=h("m")).json()
    assert len(girl["lines"]) == 4 and any(l["purpose"] == "BIRTH_GIRL_SCHEME" for l in girl["lines"])

    pr = couple()
    tag = signin + "boy"
    r = officer.post("/api/events", json={
        "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {
            "registration_no": "AP-BOY-" + tag, "child_name": "Boy Child " + tag,
            "gender": "M", "date_of_birth": "2026-10-30",
            "father_name": pr["fname"], "mother_name": pr["mname"],
            "place": pr["district"], "registration_date": "2026-10-31",
        },
    })
    assert r.status_code == 200, r.text
    eid_m = r.json()["event_id"]
    consents_m = officer.get(f"/api/x/events/{eid_m}/flow").json()["consents"]
    assert len(consents_m) == 3
    owner = q("SELECT person_id FROM mdm.consent WHERE id=%s", consents_m[0]["id"])[0]["person_id"]
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-MOTHER-" + signin, "person_id": owner}).status_code == 200
    boy = cl.get(f"/api/citizen/approvals/event-{eid_m}", headers=h("m")).json()
    assert len(boy["lines"]) == 3 and all(l["purpose"] != "BIRTH_GIRL_SCHEME" for l in boy["lines"])


def test_an_unrelated_citizen_does_not_see_the_approval_and_cannot_answer_it(signin):
    _, eid, consents, owner, other = birth(signin, "F")
    # Pick someone who is not either parent of this birth (by match or by relationship).
    stranger_rows = q("""SELECT id FROM mdm.person WHERE id NOT IN (%s,%s)
                         AND NOT EXISTS (SELECT 1 FROM mdm.proposal p
                           WHERE p.event_id=%s AND p.detail ? 'parents'
                             AND ((p.detail->'parents'->'mother'->>'person_id') = mdm.person.id::text
                               OR (p.detail->'parents'->'father'->>'person_id') = mdm.person.id::text))
                         AND NOT EXISTS (SELECT 1 FROM mdm.relationship r
                           WHERE r.kind IN ('PARENT_OF','SAME_HOUSEHOLD','SPOUSE')
                             AND ((r.person_a=mdm.person.id AND r.person_b IN (%s,%s))
                               OR (r.person_b=mdm.person.id AND r.person_a IN (%s,%s))))
                         LIMIT 1""", owner, other, eid, owner, other, owner, other)
    assert stranger_rows
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-STRANGER-" + signin, "person_id": stranger_rows[0]["id"]}).status_code == 200
    items = cl.get("/api/citizen/approvals", headers=h("s")).json()["items"]
    assert all(i["key"] != f"event-{eid}" for i in items)
    assert cl.get(f"/api/citizen/approvals/event-{eid}", headers=h("s")).status_code == 404
    body = {
        "relationship": "father", "declared": True,
        "answers": [{"consent_id": consents[0]["id"], "decision": "GRANT"}],
    }
    assert cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("s")).status_code == 403


def test_the_other_linked_parent_sees_it_and_can_answer(signin):
    _, eid, consents, _, _ = birth(signin, "F")
    seen = cl.get("/api/citizen/approvals", headers=h("f")).json()
    assert any(i["key"] == f"event-{eid}" for i in seen["items"])
    body = {
        "relationship": "father", "declared": True,
        "answers": [{"consent_id": c["id"], "decision": "GRANT"} for c in consents],
    }
    r = cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("f"))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ANSWERED"
    assert q("SELECT answered_as FROM mdm.consent WHERE id=%s", consents[0]["id"])[0]["answered_as"] == "father"


def test_once_one_parent_answers_the_other_gets_409_with_the_name(signin):
    _, eid, consents, _, _ = birth(signin, "F")
    body = {
        "relationship": "mother", "declared": True,
        "answers": [{"consent_id": c["id"], "decision": "GRANT"} for c in consents],
    }
    assert cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("m")).status_code == 200
    again = cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("f"))
    assert again.status_code == 409
    assert "Already answered by" in again.json()["detail"]
    detail = cl.get(f"/api/citizen/approvals/event-{eid}", headers=h("f")).json()
    assert detail["can_answer"] is False and detail["answered_by"]


def test_approving_without_the_declaration_is_refused(signin):
    _, eid, consents, _, _ = birth(signin, "F")
    body = {
        "relationship": "mother", "declared": False,
        "answers": [{"consent_id": consents[0]["id"], "decision": "GRANT"}],
    }
    r = cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("m"))
    assert r.status_code == 422
    assert q("SELECT status FROM mdm.consent WHERE id=%s", consents[0]["id"])[0]["status"] == "PENDING"


def test_declining_does_not_need_the_declaration(signin):
    _, eid, consents, _, _ = birth(signin, "F")
    body = {
        "relationship": "mother", "declared": False,
        "answers": [{"consent_id": c["id"], "decision": "REFUSE"} for c in consents],
    }
    r = cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("m"))
    assert r.status_code == 200, r.text
    assert all(q("SELECT status FROM mdm.consent WHERE id=%s", c["id"])[0]["status"] == "REFUSED" for c in consents)


def test_partial_elements_are_kept_and_the_delivery_releases_only_those(signin):
    _, eid, consents, _, _ = birth(signin, "F")
    pds = next(c for c in consents if c["purpose"] == "BIRTH_PDS")
    els = exchange.PURPOSES["BIRTH_PDS"]["elements"][:1]
    body = {
        "relationship": "mother", "declared": True,
        "answers": [
            {"consent_id": pds["id"], "decision": "GRANT", "elements": els},
            *[{"consent_id": c["id"], "decision": "REFUSE"} for c in consents if c["id"] != pds["id"]],
        ],
    }
    r = cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("m"))
    assert r.status_code == 200, r.text
    row = q("SELECT status, scope FROM mdm.consent WHERE id=%s", pds["id"])[0]
    assert row["status"] == "GRANTED" and row["scope"]["elements"] == els and row["scope"]["partial"] is True
    delivered = q("SELECT status FROM mdm.delivery WHERE consent_id=%s", pds["id"])
    assert delivered and delivered[0]["status"] == "DELIVERED"


def test_a_bad_consent_id_in_the_answer_saves_nothing(signin):
    _, eid, consents, _, _ = birth(signin, "F")
    body = {
        "relationship": "mother", "declared": True,
        "answers": [
            {"consent_id": consents[0]["id"], "decision": "GRANT"},
            {"consent_id": 999999999, "decision": "GRANT"},
        ],
    }
    r = cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("m"))
    assert r.status_code == 422
    assert q("SELECT status FROM mdm.consent WHERE id=%s", consents[0]["id"])[0]["status"] == "PENDING"


def test_the_answer_records_relationship_declaration_version_and_who_answered(signin):
    _, eid, consents, owner, _ = birth(signin, "F")
    body = {
        "relationship": "mother", "declared": True,
        "answers": [{"consent_id": c["id"], "decision": "GRANT"} for c in consents],
    }
    assert cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("m")).status_code == 200
    row = q("SELECT answered_as, declaration_version FROM mdm.consent WHERE id=%s", consents[0]["id"])[0]
    assert row["answered_as"] == "mother" and row["declaration_version"] == "parent-v1"
    log = q("SELECT detail FROM mdm.consent_log WHERE consent_id=%s AND action='GRANTED' ORDER BY id DESC LIMIT 1", consents[0]["id"])[0]
    assert log["detail"]["answered_as"] == "mother" and log["detail"]["declaration_version"] == "parent-v1"
    assert log["detail"]["answered_by_person_id"] == owner


def test_first_open_sets_seen_at_and_a_second_open_does_not_change_it(signin):
    _, eid, consents, _, _ = birth(signin, "F")
    assert q("SELECT seen_at FROM mdm.consent WHERE id=%s", consents[0]["id"])[0]["seen_at"] is None
    assert cl.get(f"/api/citizen/approvals/event-{eid}", headers=h("m")).status_code == 200
    first = q("SELECT seen_at FROM mdm.consent WHERE id=%s", consents[0]["id"])[0]["seen_at"]
    assert first is not None
    assert cl.get(f"/api/citizen/approvals/event-{eid}", headers=h("m")).status_code == 200
    second = q("SELECT seen_at FROM mdm.consent WHERE id=%s", consents[0]["id"])[0]["seen_at"]
    assert second == first


def test_an_expired_consent_shows_expired_and_cannot_be_answered(signin):
    from app.db import connect
    _, eid, consents, _, _ = birth(signin, "F")
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE mdm.consent SET respond_by=now() - interval '1 day' WHERE event_id=%s", (eid,))
        conn.commit()
    detail = cl.get(f"/api/citizen/approvals/event-{eid}", headers=h("m")).json()
    assert detail["status"] == "EXPIRED"
    body = {
        "relationship": "mother", "declared": True,
        "answers": [{"consent_id": c["id"], "decision": "GRANT"} for c in consents],
    }
    assert cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("m")).status_code == 409


def test_summary_counts_only_pending_items_for_me(signin):
    _, eid, consents, _, _ = birth(signin, "F")
    s = cl.get("/api/citizen/approvals/summary", headers=h("m")).json()
    assert s["pending"] >= 1
    body = {
        "relationship": "mother", "declared": True,
        "answers": [{"consent_id": c["id"], "decision": "GRANT"} for c in consents],
    }
    assert cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("m")).status_code == 200
    after = cl.get("/api/citizen/approvals/summary", headers=h("m")).json()
    assert after["pending"] == s["pending"] - 1


def test_a_notification_is_sent_when_the_birth_consent_is_raised_and_a_failure_does_not_block_it(signin, monkeypatch):
    calls = []

    def fake_post(aadhaar_ref, title, message, tracking_id):
        calls.append({"ref": aadhaar_ref, "tracking_id": tracking_id, "title": title})
        return True

    monkeypatch.setenv("NOTIFY_ENABLED", "true")
    monkeypatch.setattr(notify, "_post", fake_post)
    # Change 3: a real demo couple at ~0.71 is confident → notice at raise.
    pr = couple()
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-MOTHER-" + signin, "person_id": pr["mid"]}).status_code == 200
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-FATHER-" + signin, "person_id": pr["fid"]}).status_code == 200
    r = officer.post("/api/events", json={
        "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {
            "registration_no": "AP-N-" + signin, "child_name": "Notify Child " + signin,
            "gender": "F", "date_of_birth": "2026-10-30",
            "father_name": pr["fname"], "mother_name": pr["mname"],
            "place": pr["district"], "registration_date": "2026-10-31",
        },
    })
    assert r.status_code == 200, r.text
    eid = r.json()["event_id"]
    assert any(c["tracking_id"] == f"event-{eid}" for c in calls)

    monkeypatch.setattr(notify, "_post", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    consents = officer.get(f"/api/x/events/{eid}/flow").json()["consents"]
    assert officer.post(f"/api/x/consents/{consents[0]['id']}/remind", json={}).status_code == 200


def test_remind_sends_a_notification_and_stops_at_the_policy_limit(signin, monkeypatch):
    calls = []
    monkeypatch.setenv("NOTIFY_ENABLED", "true")
    monkeypatch.setattr(notify, "_post", lambda *a, **k: calls.append(a) or True)
    _, eid, consents, _, _ = birth(signin, "F")
    cid = consents[0]["id"]
    r1 = officer.post(f"/api/x/consents/{cid}/remind", json={})
    assert r1.status_code == 200, r1.text
    assert calls
    while True:
        r = officer.post(f"/api/x/consents/{cid}/remind", json={})
        if r.status_code == 409:
            break
        assert r.status_code == 200
    assert officer.post(f"/api/x/consents/{cid}/remind", json={}).status_code == 409


def test_confirming_a_request_creates_a_proposal_and_never_edits_the_person(signin):
    pr = couple()
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-MOTHER-" + signin, "person_id": pr["mid"]}).status_code == 200
    before = q("SELECT name, birth_year, gender FROM mdm.person WHERE id=%s", pr["mid"])[0]
    raised = officer.post("/api/x/citizen-requests", json={
        "person_id": pr["mid"], "kind": "CONFIRM_DETAILS",
        "summary": "Please confirm your year of birth",
        "detail": {"fields": [{"label": "Year of birth", "current": before["birth_year"], "proposed": before["birth_year"]}]},
    })
    assert raised.status_code == 200, raised.text
    rid = raised.json()["request_id"]
    assert raised.json().get("proposal_id") is None
    r = cl.post(f"/api/citizen/approvals/req-{rid}/answer", json={"decision": "CONFIRM"}, headers=h("m"))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "CONFIRMED" and r.json()["proposal_id"]
    after = q("SELECT name, birth_year, gender FROM mdm.person WHERE id=%s", pr["mid"])[0]
    assert after == before
    assert q("SELECT status, kind FROM mdm.proposal WHERE id=%s", r.json()["proposal_id"])[0] == {"status": "PROPOSED", "kind": "CITIZEN_CONFIRM"}


def test_disputing_a_request_records_the_note_and_changes_nothing(signin):
    pr = couple()
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-MOTHER-" + signin, "person_id": pr["mid"]}).status_code == 200
    before = q("SELECT name FROM mdm.person WHERE id=%s", pr["mid"])[0]["name"]
    raised = officer.post("/api/x/citizen-requests", json={
        "person_id": pr["mid"], "kind": "CONFIRM_DETAILS",
        "summary": "Confirm spelling of your name",
        "detail": {"fields": [{"label": "Name", "current": before, "proposed": before}]},
    })
    rid = raised.json()["request_id"]
    r = cl.post(f"/api/citizen/approvals/req-{rid}/answer",
                json={"decision": "DISPUTE", "note": "The spelling on the card is wrong"}, headers=h("m"))
    assert r.status_code == 200 and r.json()["status"] == "DISPUTED"
    assert q("SELECT note, status FROM mdm.citizen_request WHERE id=%s", rid)[0]["note"] == "The spelling on the card is wrong"
    assert q("SELECT name FROM mdm.person WHERE id=%s", pr["mid"])[0]["name"] == before
    assert r.json().get("proposal_id") is None


def test_a_citizen_cannot_raise_a_request_only_a_steward_can(signin):
    pr = couple()
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-MOTHER-" + signin, "person_id": pr["mid"]}).status_code == 200
    assert cl.post("/api/citizen/approvals", json={"person_id": pr["mid"], "kind": "CONFIRM_DETAILS", "summary": "x"},
                   headers=h("m")).status_code in (404, 405, 422)
    assert officer.post("/api/x/citizen-requests", json={
        "person_id": pr["mid"], "kind": "CONFIRM_DETAILS", "summary": "Steward ask",
        "detail": {},
    }).status_code == 200


def _rel(a, b, kind):
    from app.db import connect
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO mdm.relationship (person_a, person_b, kind, basis, source)
                       SELECT %s, %s, %s, 'approval test', 'test'
                       WHERE NOT EXISTS (
                         SELECT 1 FROM mdm.relationship WHERE kind=%s AND person_a=%s AND person_b=%s)""",
                    (a, b, kind, kind, a, b))
        conn.commit()


def _child_of(eid):
    return q("SELECT subject_person_id AS id FROM mdm.consent WHERE event_id=%s LIMIT 1", eid)[0]["id"]


def test_an_adult_who_is_only_in_the_same_household_cannot_see_or_answer(signin):
    from app.survivorship import REF_DATE
    _, eid, consents, owner, other = birth(signin, "F")
    child = _child_of(eid)
    adult = q("""SELECT id FROM mdm.person
                 WHERE id NOT IN (%s,%s,%s) AND birth_year IS NOT NULL AND %s - birth_year >= 18
                   AND NOT EXISTS (SELECT 1 FROM mdm.relationship r WHERE r.kind='PARENT_OF'
                     AND ((r.person_a=mdm.person.id AND r.person_b=%s) OR (r.person_b=mdm.person.id AND r.person_a=%s)))
                 LIMIT 1""", owner, other, child, REF_DATE.year, child, child)
    assert adult
    aid = adult[0]["id"]
    _rel(aid, child, "SAME_HOUSEHOLD")
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-STRANGER-" + signin, "person_id": aid}).status_code == 200
    items = cl.get("/api/citizen/approvals", headers=h("s")).json()["items"]
    assert all(i["key"] != f"event-{eid}" for i in items)
    assert cl.get(f"/api/citizen/approvals/event-{eid}", headers=h("s")).status_code == 404
    body = {"relationship": "guardian", "declared": True,
            "answers": [{"consent_id": consents[0]["id"], "decision": "GRANT"}]}
    assert cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("s")).status_code == 403


def test_a_minor_cannot_see_or_answer(signin):
    from app.survivorship import REF_DATE
    _, eid, consents, owner, other = birth(signin, "F")
    child = _child_of(eid)
    minor = q("""SELECT id FROM mdm.person
                 WHERE id NOT IN (%s,%s,%s) AND birth_year IS NOT NULL
                   AND %s - birth_year BETWEEN 10 AND 16 LIMIT 1""", owner, other, child, REF_DATE.year)
    assert minor
    mid = minor[0]["id"]
    _rel(mid, child, "SAME_HOUSEHOLD")
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-STRANGER-" + signin, "person_id": mid}).status_code == 200
    items = cl.get("/api/citizen/approvals", headers=h("s")).json()["items"]
    assert all(i["key"] != f"event-{eid}" for i in items)
    body = {"relationship": "guardian", "declared": True,
            "answers": [{"consent_id": consents[0]["id"], "decision": "GRANT"}]}
    assert cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("s")).status_code == 403


def test_a_parent_of_relationship_can_answer(signin):
    from app.survivorship import REF_DATE
    _, eid, consents, owner, other = birth(signin, "F")
    child = _child_of(eid)
    adult = q("""SELECT id FROM mdm.person
                 WHERE id NOT IN (%s,%s,%s) AND birth_year IS NOT NULL AND %s - birth_year >= 18 LIMIT 1""",
              owner, other, child, REF_DATE.year)
    assert adult
    aid = adult[0]["id"]
    _rel(aid, child, "PARENT_OF")
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-STRANGER-" + signin, "person_id": aid}).status_code == 200
    seen = cl.get("/api/citizen/approvals", headers=h("s")).json()
    assert any(i["key"] == f"event-{eid}" for i in seen["items"])
    body = {
        "relationship": "guardian", "declared": True,
        "answers": [{"consent_id": c["id"], "decision": "GRANT"} for c in consents],
    }
    r = cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("s"))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ANSWERED"


def test_the_old_respond_route_refuses_a_childs_consent(signin):
    _, eid, consents, _, _ = birth(signin, "F")
    r = cl.post(f"/api/citizen/consents/{consents[0]['id']}/respond",
                json={"decision": "GRANT"}, headers=h("m"))
    assert r.status_code == 409
    assert "Approvals screen" in (r.json().get("detail") or "")
    row = q("SELECT status, answered_as, declaration_version FROM mdm.consent WHERE id=%s", consents[0]["id"])[0]
    assert row["status"] == "PENDING" and row["answered_as"] is None and row["declaration_version"] is None


def test_a_rejected_parent_match_cannot_see_or_answer(signin):
    """Rejecting REVIEW_PARENTS keeps held parents out (Change 2)."""
    from app.db import connect
    _, eid, consents, owner, other = birth(signin, "F")
    # Force a held state so a REVIEW_PARENTS exists, then reject it.
    _lower_parent_scores(eid, 0.5)
    # Ensure a REVIEW_PARENTS row (may already exist from a non-confident birth; create if needed)
    revs = q("SELECT id FROM mdm.proposal WHERE event_id=%s AND kind='REVIEW_PARENTS'", eid)
    if not revs:
        from app.db import connect as _c
        from app import events
        with _c() as conn:
            cur = conn.cursor()
            parents = q("SELECT detail->'parents' AS parents FROM mdm.proposal WHERE event_id=%s AND detail ? 'parents' LIMIT 1", eid)[0]["parents"]
            events._propose(cur, eid, "UC2", "REVIEW_PARENTS", "MDM steward", owner,
                            "Confirm the parent match (score 0.5 is below the bar 0.70)",
                            {"parents": {**parents, "confident": False}})
            conn.commit()
        revs = q("SELECT id FROM mdm.proposal WHERE event_id=%s AND kind='REVIEW_PARENTS' AND status='PROPOSED'", eid)
    assert officer.post(f"/api/proposals/{revs[0]['id']}/decision",
                        json={"decision": "REJECT", "note": "Not the right parents after check"}).status_code == 200
    for who in ("m", "f"):
        items = cl.get("/api/citizen/approvals", headers=h(who)).json()["items"]
        assert all(i["key"] != f"event-{eid}" for i in items)
        assert cl.get(f"/api/citizen/approvals/event-{eid}", headers=h(who)).status_code == 404
    body = {"relationship": "father", "declared": True,
            "answers": [{"consent_id": consents[0]["id"], "decision": "GRANT"}]}
    assert cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("f")).status_code == 403
    assert cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("m")).status_code == 403


def test_a_below_threshold_parent_cannot_see_open_or_answer_until_the_officer_confirms(signin):
    _, eid, consents, owner, other = birth(signin, "F")
    _lower_parent_scores(eid, 0.5)
    # Birth may already have REVIEW_PARENTS if it was not confident; otherwise create via lower scores + ensure review
    if not q("SELECT id FROM mdm.proposal WHERE event_id=%s AND kind='REVIEW_PARENTS' AND status='PROPOSED'", eid):
        from app.db import connect
        from app import events
        with connect() as conn:
            cur = conn.cursor()
            parents = q("SELECT detail->'parents' AS parents FROM mdm.proposal WHERE event_id=%s AND detail ? 'parents' LIMIT 1", eid)[0]["parents"]
            events._propose(cur, eid, "UC2", "REVIEW_PARENTS", "MDM steward", owner,
                            "Confirm the parent match (score 0.5 is below the bar 0.70)",
                            {"parents": {**parents, "confident": False}})
            conn.commit()
    for who in ("m", "f"):
        items = cl.get("/api/citizen/approvals", headers=h(who)).json()["items"]
        assert all(i["key"] != f"event-{eid}" for i in items)
        assert cl.get(f"/api/citizen/approvals/event-{eid}", headers=h(who)).status_code == 404
    body = {"relationship": "mother", "declared": True,
            "answers": [{"consent_id": c["id"], "decision": "GRANT"} for c in consents]}
    assert cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("m")).status_code == 403
    _approve_parent_review(eid)
    seen = cl.get("/api/citizen/approvals", headers=h("m")).json()["items"]
    assert any(i["key"] == f"event-{eid}" for i in seen)
    assert cl.get(f"/api/citizen/approvals/event-{eid}", headers=h("m")).status_code == 200


def test_no_notification_is_sent_for_a_held_parent_and_one_is_sent_on_confirmation(signin, monkeypatch):
    calls = []
    monkeypatch.setenv("NOTIFY_ENABLED", "true")
    monkeypatch.setattr(notify, "_post", lambda *a, **k: calls.append({"ref": a[0] if a else k.get("aadhaar_ref"), "tracking": a[3] if len(a) > 3 else k.get("tracking_id")}) or True)
    # Raise the parent_confirm_score bar so a normal birth match is held at raise time.
    from app.db import connect
    with connect() as conn:
        cur = conn.cursor()
        exchange.set_policy(cur, "parent_confirm_score", 0.90, "test", "hold demo couples for notify test")
        conn.commit()
    try:
        pr = couple()
        assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-MOTHER-" + signin, "person_id": pr["mid"]}).status_code == 200
        assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-FATHER-" + signin, "person_id": pr["fid"]}).status_code == 200
        r = officer.post("/api/events", json={
            "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
            "payload": {
                "registration_no": "AP-HOLD-" + signin, "child_name": "Held Child " + signin,
                "gender": "F", "date_of_birth": "2026-10-30",
                "father_name": pr["fname"], "mother_name": pr["mname"],
                "place": pr["district"], "registration_date": "2026-10-31",
            },
        })
        assert r.status_code == 200, r.text
        eid = r.json()["event_id"]
        assert not any(c.get("tracking") == f"event-{eid}" for c in calls)
        before = len(calls)
        _approve_parent_review(eid, note="Confirming held parents after check")
        assert any(c.get("tracking") == f"event-{eid}" for c in calls[before:])
    finally:
        with connect() as conn:
            cur = conn.cursor()
            exchange.set_policy(cur, "parent_confirm_score", 0.70, "test", "restore default bar")
            conn.commit()


def test_an_above_threshold_parent_is_unaffected(signin):
    """Change 3: a confident demo couple sees and answers at once."""
    _, eid, consents, _, _ = birth(signin, "F")
    items = cl.get("/api/citizen/approvals", headers=h("m")).json()["items"]
    assert any(i["key"] == f"event-{eid}" for i in items)
    assert cl.get(f"/api/citizen/approvals/event-{eid}", headers=h("m")).status_code == 200
    body = {"relationship": "mother", "declared": True,
            "answers": [{"consent_id": c["id"], "decision": "GRANT"} for c in consents]}
    assert cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("m")).status_code == 200


def test_a_rejected_low_score_match_never_gets_access(signin):
    from app.db import connect
    _, eid, consents, owner, _ = birth(signin, "F")
    _lower_parent_scores(eid, 0.4)
    if not q("SELECT id FROM mdm.proposal WHERE event_id=%s AND kind='REVIEW_PARENTS' AND status='PROPOSED'", eid):
        from app import events
        with connect() as conn:
            cur = conn.cursor()
            parents = q("SELECT detail->'parents' AS parents FROM mdm.proposal WHERE event_id=%s AND detail ? 'parents' LIMIT 1", eid)[0]["parents"]
            events._propose(cur, eid, "UC2", "REVIEW_PARENTS", "MDM steward", owner,
                            "Confirm the parent match (score 0.4 is below the bar 0.70)",
                            {"parents": {**parents, "confident": False}})
            conn.commit()
    rev = q("SELECT id FROM mdm.proposal WHERE event_id=%s AND kind='REVIEW_PARENTS' AND status='PROPOSED'", eid)[0]
    assert officer.post(f"/api/proposals/{rev['id']}/decision",
                        json={"decision": "REJECT", "note": "low score reject after review"}).status_code == 200
    for who in ("m", "f"):
        assert all(i["key"] != f"event-{eid}" for i in cl.get("/api/citizen/approvals", headers=h(who)).json()["items"])
        assert cl.get(f"/api/citizen/approvals/event-{eid}", headers=h(who)).status_code == 404
    body = {"relationship": "mother", "declared": True,
            "answers": [{"consent_id": consents[0]["id"], "decision": "GRANT"}]}
    assert cl.post(f"/api/citizen/approvals/event-{eid}/answer", json=body, headers=h("m")).status_code == 403


def test_no_proposal_exists_until_the_citizen_confirms(signin):
    pr = couple()
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-MOTHER-" + signin, "person_id": pr["mid"]}).status_code == 200
    summary = "Confirm your district " + signin
    raised = officer.post("/api/x/citizen-requests", json={
        "person_id": pr["mid"], "kind": "CONFIRM_DETAILS",
        "summary": summary, "detail": {"district": {"current": "X", "proposed": "Y"}},
    })
    assert raised.status_code == 200
    rid = raised.json()["request_id"]
    assert raised.json().get("proposal_id") is None
    assert not q("SELECT id FROM mdm.proposal WHERE kind='CITIZEN_CONFIRM' AND person_id=%s AND summary=%s",
                 pr["mid"], summary)
    r = cl.post(f"/api/citizen/approvals/req-{rid}/answer", json={"decision": "CONFIRM"}, headers=h("m"))
    assert r.status_code == 200 and r.json()["proposal_id"]
    assert q("SELECT status FROM mdm.proposal WHERE id=%s", r.json()["proposal_id"])[0]["status"] == "PROPOSED"


def test_a_dispute_creates_no_proposal_and_withdraws_a_supplied_one(signin):
    from app.db import connect
    from app import events
    pr = couple()
    assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-MOTHER-" + signin, "person_id": pr["mid"]}).status_code == 200
    with connect() as conn:
        cur = conn.cursor()
        pid = events._propose(cur, None, None, "CITIZEN_CONFIRM", "MDM steward", pr["mid"], "pre-raised", {})
        conn.commit()
    raised = officer.post("/api/x/citizen-requests", json={
        "person_id": pr["mid"], "kind": "CONFIRM_DETAILS",
        "summary": "Confirm spelling", "detail": {}, "proposal_id": pid,
    })
    rid = raised.json()["request_id"]
    assert raised.json()["proposal_id"] == pid
    before = q("SELECT name FROM mdm.person WHERE id=%s", pr["mid"])[0]["name"]
    r = cl.post(f"/api/citizen/approvals/req-{rid}/answer",
                json={"decision": "DISPUTE", "note": "Wrong"}, headers=h("m"))
    assert r.status_code == 200 and r.json()["status"] == "DISPUTED"
    assert q("SELECT status FROM mdm.proposal WHERE id=%s", pid)[0]["status"] == "WITHDRAWN"
    assert q("SELECT name FROM mdm.person WHERE id=%s", pr["mid"])[0]["name"] == before
    # Plain dispute with no supplied proposal creates none.
    raised2 = officer.post("/api/x/citizen-requests", json={
        "person_id": pr["mid"], "kind": "CONFIRM_DETAILS", "summary": "Another", "detail": {},
    })
    rid2 = raised2.json()["request_id"]
    r2 = cl.post(f"/api/citizen/approvals/req-{rid2}/answer", json={"decision": "DISPUTE"}, headers=h("m"))
    assert r2.status_code == 200 and r2.json().get("proposal_id") is None


# ---- Change 3 (and remaining Change 2) -------------------------------------------------

def test_a_normal_demo_couple_at_071_is_confident_and_the_parent_sees_the_approval_at_once(signin, monkeypatch):
    """Real couple from couple(), no fixture edits: confident, no REVIEW_PARENTS, batchable, sees notice."""
    calls = []
    monkeypatch.setenv("NOTIFY_ENABLED", "true")
    monkeypatch.setattr(notify, "_post", lambda *a, **k: calls.append({"tracking": a[3] if len(a) > 3 else k.get("tracking_id")}) or True)
    pr, eid, consents, _, _ = birth(signin, "F")
    parents = q("SELECT detail->'parents' AS parents FROM mdm.proposal WHERE event_id=%s AND detail ? 'parents' LIMIT 1", eid)[0]["parents"]
    assert parents.get("confident") is True
    assert parents.get("couple_linked") is True
    assert float(parents.get("bar") or 0) == pytest.approx(0.70, abs=0.01)
    scores = [float((parents.get(s) or {}).get("score") or 0) for s in ("mother", "father")]
    assert all(0.70 <= s < 0.76 for s in scores) or all(s >= 0.70 for s in scores)
    assert not q("SELECT id FROM mdm.proposal WHERE event_id=%s AND kind='REVIEW_PARENTS'", eid)
    ration = q("SELECT reason_code, risk_class FROM mdm.proposal WHERE event_id=%s AND kind='ADD_TO_RATION_CARD'", eid)
    assert ration and ration[0]["reason_code"] == "BIRTH_CLEAN" and ration[0]["risk_class"] == "B"
    from app import workqueue
    assert workqueue.is_batchable("BIRTH_CLEAN")
    items = cl.get("/api/citizen/approvals", headers=h("m")).json()["items"]
    assert any(i["key"] == f"event-{eid}" for i in items)
    assert any(c.get("tracking") == f"event-{eid}" for c in calls)


def test_a_parent_below_the_bar_is_held_and_gets_a_parent_review(signin):
    from app.db import connect
    pr = couple()
    with connect() as conn:
        cur = conn.cursor()
        exchange.set_policy(cur, "parent_confirm_score", 0.80, "test", "raise bar")
        conn.commit()
    try:
        assert officer.post("/api/x/citizen-links", json={"aadhaar_ref": "REF-MOTHER-" + signin, "person_id": pr["mid"]}).status_code == 200
        r = officer.post("/api/events", json={
            "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
            "payload": {
                "registration_no": "AP-BELOW-" + signin, "child_name": "Below Child " + signin,
                "gender": "F", "date_of_birth": "2026-10-30",
                "father_name": pr["fname"], "mother_name": pr["mname"],
                "place": pr["district"], "registration_date": "2026-10-31",
            },
        })
        assert r.status_code == 200, r.text
        eid = r.json()["event_id"]
        revs = q("SELECT id, summary FROM mdm.proposal WHERE event_id=%s AND kind='REVIEW_PARENTS' AND status='PROPOSED'", eid)
        assert revs
        assert "below the bar" in revs[0]["summary"]
        items = cl.get("/api/citizen/approvals", headers=h("m")).json()["items"]
        assert all(i["key"] != f"event-{eid}" for i in items)
        ration = q("SELECT reason_code FROM mdm.proposal WHERE event_id=%s AND kind='ADD_TO_RATION_CARD'", eid)
        if ration:
            assert ration[0]["reason_code"] == "BIRTH_PARENT_UNSURE"
    finally:
        with connect() as conn:
            cur = conn.cursor()
            exchange.set_policy(cur, "parent_confirm_score", 0.70, "test", "restore")
            conn.commit()


def test_two_matched_parents_who_are_not_a_couple_are_both_held(signin):
    from app.db import connect
    _, eid, _, owner, other = birth(signin + "nc", "F")
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""UPDATE mdm.proposal SET detail = jsonb_set(
                         jsonb_set(detail, '{parents,couple_linked}', 'false'::jsonb, true),
                         '{parents,confident}', 'false'::jsonb, true)
                       WHERE event_id=%s AND detail ? 'parents'""", (eid,))
        from app import workqueue
        cur.execute("SELECT id FROM mdm.proposal WHERE event_id=%s AND status='PROPOSED'", (eid,))
        for row in cur.fetchall():
            workqueue.apply_classification(cur, row["id"])
        conn.commit()
        assert exchange.parent_match_held(cur, owner, eid)
        assert exchange.parent_match_held(cur, other, eid)


def test_a_single_named_parent_at_071_is_confident(signin):
    """One named parent skips the couple test."""
    from app.db import connect
    parents = {
        "mother": {"name": "Only Mother", "person_id": 1, "score": 0.714},
        "father": {"name": None, "person_id": None, "score": None},
        "couple_linked": False,
    }
    bar, require = 0.70, True
    assert exchange.parent_side_confident(parents, "mother", bar, require)
    enriched = exchange.enrich_parents_confidence(
        {"mother": parents["mother"], "father": {"name": None, "person_id": None, "score": None}},
        bar, require, couple_linked=False,
    )
    # Father side not named → overall confident if mother ok
    # _side_named for father with name None and person_id None → not named
    assert enriched["confident"] is True


def test_raising_the_bar_to_080_changes_what_is_held_and_the_impact_preview_counts_it(signin):
    from app.db import connect
    birth(signin + "imp", "F")
    with connect() as conn:
        cur = conn.cursor()
        prev = exchange.impact(cur, "parent_confirm_score", 0.80)
        assert prev["lines"]
        assert any("would change group" in line for line in prev["lines"])


def test_lowering_parent_confirm_requires_couple_to_false_releases_the_non_couple_case(signin):
    parents = {
        "mother": {"name": "M", "person_id": 1, "score": 0.714},
        "father": {"name": "F", "person_id": 2, "score": 0.714},
        "couple_linked": False,
    }
    assert not exchange.parents_block_confident(parents, 0.70, True)
    assert exchange.parents_block_confident(parents, 0.70, False)


def test_old_proposals_without_the_flag_are_judged_by_current_policy_on_read(signin):
    from app.db import connect
    _, eid, _, owner, other = birth(signin + "old", "F")
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""UPDATE mdm.proposal SET detail = (detail #- '{parents,confident}') #- '{parents,bar}'
                       WHERE event_id=%s AND detail ? 'parents'""", (eid,))
        conn.commit()
        parents = exchange.parents_detail_for_event(cur, eid)
        assert "confident" not in (parents or {})
        # On read with default bar 0.70 and couple_linked still true → confident
        assert exchange.parent_is_confident_on_event(cur, owner, eid)
        assert not exchange.parent_match_held(cur, owner, eid)


def test_the_review_parents_summary_says_why(signin):
    from app.db import connect
    with connect() as conn:
        cur = conn.cursor()
        exchange.set_policy(cur, "parent_confirm_score", 0.80, "test", "raise for summary")
        conn.commit()
    try:
        pr = couple()
        r = officer.post("/api/events", json={
            "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
            "payload": {
                "registration_no": "AP-WHY-" + signin, "child_name": "Why Child " + signin,
                "gender": "F", "date_of_birth": "2026-10-30",
                "father_name": pr["fname"], "mother_name": pr["mname"],
                "place": pr["district"], "registration_date": "2026-10-31",
            },
        })
        assert r.status_code == 200, r.text
        eid = r.json()["event_id"]
        rev = q("SELECT summary FROM mdm.proposal WHERE event_id=%s AND kind='REVIEW_PARENTS'", eid)
        assert rev and ("below the bar" in rev[0]["summary"] or "not linked" in rev[0]["summary"])
    finally:
        with connect() as conn:
            cur = conn.cursor()
            exchange.set_policy(cur, "parent_confirm_score", 0.70, "test", "restore")
            conn.commit()


def _force_one_weak_parent(eid, owner, note="Confirm weak parent"):
    """Drop the principal parent's score below the bar and ensure a REVIEW_PARENTS with that detail."""
    from app.db import connect
    from app import events
    import copy
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT detail->'parents' AS parents FROM mdm.proposal
                       WHERE event_id=%s AND detail ? 'parents' LIMIT 1""", (eid,))
        parents = cur.fetchone()["parents"]
        side = "mother" if str((parents.get("mother") or {}).get("person_id")) == str(owner) else "father"
        other_side = "father" if side == "mother" else "mother"
        held = copy.deepcopy(parents)
        held[side] = {**(held.get(side) or {}), "score": 0.55}
        held["confident"] = False
        held["couple_linked"] = True
        held.setdefault("bar", 0.70)
        import json as _json
        cur.execute("""UPDATE mdm.proposal SET detail = jsonb_set(detail, '{parents}', %s::jsonb, true)
                       WHERE event_id=%s AND detail ? 'parents'""",
                    (_json.dumps(held), eid))
        cur.execute("""SELECT id FROM mdm.proposal WHERE event_id=%s AND kind='REVIEW_PARENTS' AND status='PROPOSED'""",
                    (eid,))
        if not cur.fetchone():
            events._propose(cur, eid, "UC2", "REVIEW_PARENTS", "MDM steward", owner,
                            note or f"Confirm the parent match ({side} score 0.55 is below the bar 0.70)",
                            {"parents": held})
        else:
            cur.execute("""UPDATE mdm.proposal SET detail = jsonb_set(detail, '{parents}', %s::jsonb, true)
                           WHERE event_id=%s AND kind='REVIEW_PARENTS' AND status='PROPOSED'""",
                        (_json.dumps(held), eid))
        from app import workqueue
        cur.execute("SELECT id FROM mdm.proposal WHERE event_id=%s AND status='PROPOSED'", (eid,))
        for row in cur.fetchall():
            workqueue.apply_classification(cur, row["id"])
        conn.commit()
    return side, other_side


def test_the_officer_can_confirm_one_weak_parent_while_the_other_is_strong(signin):
    """Strong parent proceeds; weak waits until REVIEW_PARENTS approve (Change 2)."""
    from app.db import connect
    _, eid, consents, owner, other = birth(signin + "mix", "F")
    side, other_side = _force_one_weak_parent(
        eid, owner, note="Confirm the parent match (score 0.55 is below the bar 0.70)")
    with connect() as conn:
        cur = conn.cursor()
        assert exchange.parent_match_held(cur, owner, eid)
        assert not exchange.parent_match_held(cur, other, eid)
        parents = exchange.parents_detail_for_event(cur, eid)
        assert exchange.parent_side_confident(parents, other_side, 0.70, True)
        assert not exchange.parent_side_confident(parents, side, 0.70, True)
    _approve_parent_review(eid)
    with connect() as conn:
        cur = conn.cursor()
        assert exchange._named_parent_approved(cur, owner, eid)
        assert not exchange.parent_match_held(cur, owner, eid)


def test_rejecting_the_parent_review_keeps_the_weak_parent_out_but_the_strong_parent_proceeds(signin):
    from app.db import connect
    _, eid, consents, owner, other = birth(signin + "rj", "F")
    side, other_side = _force_one_weak_parent(eid, owner, note="Confirm weak parent")
    rev = q("SELECT id FROM mdm.proposal WHERE event_id=%s AND kind='REVIEW_PARENTS' AND status='PROPOSED'", eid)[0]
    assert officer.post(f"/api/proposals/{rev['id']}/decision",
                        json={"decision": "REJECT", "note": "Weak parent is not correct"}).status_code == 200
    with connect() as conn:
        cur = conn.cursor()
        assert exchange._named_parent_rejected_only(cur, owner, eid)
        assert not exchange._named_parent_rejected_only(cur, other, eid)
        parents = exchange.parents_detail_for_event(cur, eid)
        assert exchange.parent_side_confident(parents, other_side, 0.70, True)
        assert not exchange.parent_side_confident(parents, side, 0.70, True)


def test_only_one_parent_review_exists_per_event_when_a_parent_is_also_unmatched(signin):
    pr = couple()
    r = officer.post("/api/events", json={
        "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {
            "registration_no": "AP-ONE-" + signin, "child_name": "One Review " + signin,
            "gender": "F", "date_of_birth": "2026-10-30",
            "father_name": pr["fname"], "mother_name": f"Unknown Mother {signin}",
            "place": pr["district"], "registration_date": "2026-10-31",
        },
    })
    assert r.status_code == 200, r.text
    eid = r.json()["event_id"]
    revs = q("SELECT id, summary FROM mdm.proposal WHERE event_id=%s AND kind='REVIEW_PARENTS'", eid)
    assert len(revs) == 1
    assert "not found" in revs[0]["summary"] or "Confirm" in revs[0]["summary"]


def test_a_confirmed_weak_parent_birth_stays_out_of_the_batchable_group(signin):
    from app.db import connect
    with connect() as conn:
        cur = conn.cursor()
        exchange.set_policy(cur, "parent_confirm_score", 0.80, "test", "weak birth")
        conn.commit()
    try:
        pr = couple()
        r = officer.post("/api/events", json={
            "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
            "payload": {
                "registration_no": "AP-STAY-" + signin, "child_name": "Stay Child " + signin,
                "gender": "F", "date_of_birth": "2026-10-30",
                "father_name": pr["fname"], "mother_name": pr["mname"],
                "place": pr["district"], "registration_date": "2026-10-31",
            },
        })
        assert r.status_code == 200, r.text
        eid = r.json()["event_id"]
        ration = q("SELECT id, reason_code FROM mdm.proposal WHERE event_id=%s AND kind='ADD_TO_RATION_CARD'", eid)
        if not ration:
            pytest.skip("no ration card proposal")
        assert ration[0]["reason_code"] == "BIRTH_PARENT_UNSURE"
        _approve_parent_review(eid)
        # Still BIRTH_PARENT_UNSURE after confirm (Change 2 item 4)
        row = q("SELECT reason_code, detail->'parents'->>'confident' AS conf FROM mdm.proposal WHERE id=%s", ration[0]["id"])[0]
        assert row["reason_code"] == "BIRTH_PARENT_UNSURE"
        assert row["conf"] in ("false", "False", False) or row["conf"] == "false"
        from app import workqueue
        assert not workqueue.is_batchable(row["reason_code"])
    finally:
        with connect() as conn:
            cur = conn.cursor()
            exchange.set_policy(cur, "parent_confirm_score", 0.70, "test", "restore")
            conn.commit()


def test_the_consent_screen_row_links_to_the_parent_review(signin):
    """Officer API exposes parent_review_reason for the Consent UI link."""
    from app.db import connect
    with connect() as conn:
        cur = conn.cursor()
        exchange.set_policy(cur, "parent_confirm_score", 0.80, "test", "held consent link")
        conn.commit()
    try:
        pr = couple()
        r = officer.post("/api/events", json={
            "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
            "payload": {
                "registration_no": "AP-LNK-" + signin, "child_name": "Link Child " + signin,
                "gender": "F", "date_of_birth": "2026-10-30",
                "father_name": pr["fname"], "mother_name": pr["mname"],
                "place": pr["district"], "registration_date": "2026-10-31",
            },
        })
        assert r.status_code == 200, r.text
        eid = r.json()["event_id"]
        consents = officer.get(f"/api/x/events/{eid}/flow").json()["consents"]
        assert consents
        detail = officer.get(f"/api/x/consents/{consents[0]['id']}").json()["consent"]
        assert detail["parent_held"] is True
        assert detail["parent_review_reason"] == "PARENT_REVIEW"
        assert detail["parent_review_id"]
    finally:
        with connect() as conn:
            cur = conn.cursor()
            exchange.set_policy(cur, "parent_confirm_score", 0.70, "test", "restore")
            conn.commit()
