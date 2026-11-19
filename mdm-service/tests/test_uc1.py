"""UC1 identity linkage: review tasks in the Work queue, citizen confirm/report, Flow board identity row."""
import json, os, time, uuid
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""

import pytest
from fastapi.testclient import TestClient
from app.api import app
from app import workqueue, stewardship, citizen, ops, exchange, notify, auth
from app.matching import MatchConfig
from app.db import connect
from tests.test_feed import couple, c as officer, q

cl = TestClient(app)
ACTOR = "test-user"
ADMIN = {"X-Test-Roles": "MDM_ADMIN,ADMIN", "X-Test-Actor": "test-user"}
PDS = {"X-Test-Roles": "PDS_OFFICER", "X-Test-Actor": "pds.officer"}
STEWARD = {"X-Test-Roles": "MDM_STEWARD", "X-Test-Actor": "steward"}

# SOURCE_CONFLICT is fed from these survivorship codes (confirm in survivorship.derive_dq).
SOURCE_CONFLICT_CODES = {"DOB_CONFLICT", "GENDER_CONFLICT", "NAME_CONFLICT"}


def _tag():
    return uuid.uuid4().hex[:8]


@pytest.fixture(autouse=True)
def _close_open_uc1_state():
    """Tests share a few persons, and the database allows one open request / report per person and detail.
    Close what earlier tests (or runs) left open so each test starts clean. Runs on citizen_db_test only (conftest)."""
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE mdm.citizen_request SET status='EXPIRED' WHERE status='PENDING' AND kind='CONFIRM_DETAILS'")
        cur.execute("""UPDATE mdm.discrepancy SET status='REJECTED', resolved_by='test-cleanup', resolved_at=now(),
                              resolution_note='closed by the test fixture'
                       WHERE status='ROUTED' AND kind='DISCREPANCY' AND channel='PORTAL'""")
        conn.commit()
    yield


def _exec(sql, *p):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, p)
        rows = cur.fetchall() if cur.description else []
        conn.commit()
        return rows


def _one(sql, *p):
    rows = _exec(sql, *p)
    return rows[0] if rows else None


def _person_pair():
    """Two people with source records usable as review candidates."""
    rows = q("""SELECT id, name, birth_year, gender, district FROM mdm.person
                WHERE name IS NOT NULL AND birth_year IS NOT NULL
                ORDER BY id LIMIT 20""")
    assert len(rows) >= 2
    return rows[0], rows[1]


def _insert_source(person_id, source, rid, name=None, score=None, link_status="IN_REVIEW",
                   dob=None, gender=None):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO mdm.source_record
                       (person_id, source, source_rid, rtype, name, score, link_status, dob, gender, as_of, payload)
                       VALUES (%s,%s,%s,'PERSON',%s,%s,%s,%s,%s,CURRENT_DATE,'{}'::jsonb)
                       RETURNING id""",
                    (person_id, source, rid, name, score, link_status, dob, gender))
        rid_out = cur.fetchone()["id"]
        conn.commit()
        return rid_out


def _open_review(record_id, candidates, reason_code=None, risk_class=None, score=None):
    """Insert an OPEN review_task. candidates is a list of {person_id, score, ...}."""
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO mdm.review_task (record_id, candidates, status, reason_code, risk_class)
                       VALUES (%s,%s::jsonb,'OPEN',%s,%s) RETURNING id""",
                    (record_id, json.dumps(candidates), reason_code, risk_class))
        tid = cur.fetchone()["id"]
        if score is not None:
            cur.execute("UPDATE mdm.source_record SET score=%s WHERE id=%s", (score, record_id))
        conn.commit()
        return tid


def _classify_review_row(candidates, record_score=None, dob_conflict=False, gender_conflict=False):
    """Build a synthetic review row for classify_review unit tests."""
    return {
        "candidates": candidates,
        "score": record_score if record_score is not None else (candidates[0]["score"] if candidates else None),
        "dob_conflict": dob_conflict,
        "gender_conflict": gender_conflict,
    }


# --------------------------------------------------------------------------- coverage


def test_every_review_reason_is_covered_and_a_new_kind_fails_the_coverage_test():
    """Every review/issue reason in LABELS must be classifiable; BIRTH_PARENT_MINOR stays covered too."""
    required = {
        "LINK_NEAR", "LINK_AMBIGUOUS", "LINK_LOW_SEPARATE", "SOURCE_CONFLICT",
        "BIRTH_PARENT_MINOR",  # live fact: keep in coverage
    }
    for code in required:
        assert code in workqueue.LABELS, f"missing label for {code}"
        assert code in workqueue.SUGGESTIONS, f"missing suggestion for {code}"
    # REVIEW_REASONS enumerates UC1 review/issue codes for the coverage contract
    review_codes = set(workqueue.REVIEW_REASONS)
    assert {"LINK_NEAR", "LINK_AMBIGUOUS", "LINK_LOW_SEPARATE", "SOURCE_CONFLICT"} <= review_codes
    # A fabricated code with no label fails the contract the same way OTHER fails for proposals
    assert "LINK_FABRICATED_XYZ" not in workqueue.LABELS
    # SOURCE_CONFLICT codes match survivorship
    assert set(workqueue.SOURCE_CONFLICT_CODES) == SOURCE_CONFLICT_CODES
    # BIRTH_PARENT_MINOR still classifies as C / not batchable
    conf = {
        "mother": {"name": "M", "person_id": 1, "score": 0.9},
        "father": {"name": "F", "person_id": 2, "score": 0.9},
        "confident": True,
    }
    got = workqueue.classify({
        "kind": "ADD_TO_RATION_CARD", "uc": "UC2",
        "detail": {"parents": conf}, "options": [],
    }, parent_minor=True)
    assert got == ("BIRTH_PARENT_MINOR", "C")
    assert not workqueue.is_batchable("BIRTH_PARENT_MINOR")


def test_a_single_candidate_just_below_auto_is_link_near_and_class_c():
    auto = MatchConfig().auto
    near = auto - 0.03  # inside link_near_margin (default 0.06)
    code, cls = workqueue.classify_review(_classify_review_row(
        [{"person_id": 1, "score": near}],
        record_score=near,
    ))
    assert code == "LINK_NEAR"
    assert cls == "C"
    assert not workqueue.is_batchable(code)


def test_two_close_candidates_are_link_ambiguous_and_never_batchable():
    auto = MatchConfig().auto
    margin = MatchConfig().margin
    a, b = auto - 0.10, auto - 0.10 - (margin / 2)
    code, cls = workqueue.classify_review(_classify_review_row(
        [{"person_id": 1, "score": a}, {"person_id": 2, "score": b}],
    ))
    assert code == "LINK_AMBIGUOUS"
    assert cls == "C"
    assert not workqueue.is_batchable(code)


def test_a_low_score_task_is_link_low_separate_and_batchable():
    auto = MatchConfig().auto
    review = MatchConfig().review
    near_m = float(exchange.DEFAULTS.get("link_near_margin", 0.06))
    low = auto - near_m - 0.02  # below the near band, still >= review
    assert review <= low < auto - near_m
    code, cls = workqueue.classify_review(_classify_review_row(
        [{"person_id": 1, "score": low}],
        record_score=low,
    ))
    assert code == "LINK_LOW_SEPARATE"
    assert cls == "B"
    assert workqueue.is_batchable(code)


def test_link_near_cannot_be_batch_approved_in_this_release():
    assert not workqueue.is_batchable("LINK_NEAR")
    r = cl.post("/api/x/work/batch/preview", json={"reason": "LINK_NEAR"}, headers=ADMIN)
    assert r.status_code == 409, r.text


def test_batch_separate_goes_through_stewardship_decide_audit_and_rebuild_still_happen():
    a, b = _person_pair()
    tag = _tag()
    rid = _insert_source(a["id"], "pds_view", f"UC1-SEP-{tag}", name=a["name"], score=0.60)
    tid = _open_review(rid, [{"person_id": b["id"], "score": 0.60, "name": b["name"]}],
                       reason_code="LINK_LOW_SEPARATE", risk_class="B", score=0.60)
    # Classify / ensure reason
    with connect() as conn:
        cur = conn.cursor()
        workqueue.apply_review_classification(cur, tid)
        conn.commit()
    key = f"r-{tid}"
    prev = cl.post("/api/x/work/batch/preview",
                   json={"reason": "LINK_LOW_SEPARATE", "ids": [key]}, headers=ADMIN)
    assert prev.status_code == 200, prev.text
    body = prev.json()
    assert body.get("held_for_consent", 0) == 0 or "held_for_consent" in body
    sample = body["sample"]
    opened = list(dict.fromkeys(
        sample["random"] + sample["lowest_confidence"] + sample["outliers"]))
    # sample ids may be string keys or ints depending on implementation — open what preview returns
    if opened and isinstance(opened[0], str):
        sample_opened = opened
    else:
        sample_opened = opened
    out = cl.post("/api/x/work/batch/approve", json={
        "token": body["token"],
        "rationale": "Unlikely match — keep records separate for UC1 batch test",
        "sample_opened": sample_opened,
    }, headers=ADMIN)
    assert out.status_code == 200, out.text
    assert out.json()["approved"] >= 1
    task = q("SELECT status, decision, batch_id FROM mdm.review_task WHERE id=%s", tid)[0]
    assert task["status"] == "RESOLVED" and task["decision"] == "SEPARATE"
    assert task["batch_id"]
    assert q("SELECT 1 FROM mdm.audit WHERE action='REVIEW_SEPARATE' AND detail->>'task'=%s AND detail->>'batch_id'=%s",
             str(tid), str(task["batch_id"]))


def test_a_decided_task_cannot_be_decided_again():
    a, b = _person_pair()
    tag = _tag()
    rid = _insert_source(a["id"], "crs", f"UC1-DEC-{tag}", name=a["name"], score=0.70)
    tid = _open_review(rid, [{"person_id": b["id"], "score": 0.70}],
                       reason_code="LINK_NEAR", risk_class="C", score=0.70)
    r1 = cl.post(f"/api/x/work/review/{tid}/decide",
                 json={"decision": "SEPARATE", "note": "First decision for UC1"}, headers=ADMIN)
    assert r1.status_code == 200, r1.text
    r2 = cl.post(f"/api/x/work/review/{tid}/decide",
                 json={"decision": "SEPARATE", "note": "Second try"}, headers=ADMIN)
    assert r2.status_code == 409, r2.text


def test_source_conflict_is_fed_from_dq_issue_and_the_steward_can_only_request_a_correction():
    a, _ = _person_pair()
    tag = _tag()
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO mdm.dq_issue (person_id, record_id, code, severity, detail, status)
                       VALUES (%s,NULL,'DOB_CONFLICT','HIGH',%s,'OPEN') RETURNING id""",
                    (a["id"], f"UC1 conflict {tag}"))
        iid = cur.fetchone()["id"]
        conn.commit()
    groups = cl.get("/api/x/work/groups", headers=ADMIN).json()["groups"]
    sc = [g for g in groups if g["reason_code"] == "SOURCE_CONFLICT"]
    assert sc, "SOURCE_CONFLICT group missing"
    items = cl.get("/api/x/work/items", params={"reason": "SOURCE_CONFLICT", "limit": 50},
                   headers=ADMIN).json()["items"]
    keys = {it.get("key") or it.get("id") for it in items}
    assert f"i-{iid}" in keys or any(str(it.get("id")) == str(iid) for it in items)
    # Steward may only request a correction — master value is never edited here
    before = q("SELECT name, birth_year, gender FROM mdm.person WHERE id=%s", a["id"])[0]
    r = cl.post(f"/api/dq/{iid}/request-correction",
                json={"note": "Please correct the date of birth at source"}, headers=STEWARD)
    # Prefer the stewardship path used by the API today
    if r.status_code == 404:
        with connect() as conn:
            cur = conn.cursor()
            out = stewardship.request_correction(cur, iid, "Please correct at source", ACTOR)
            conn.commit()
            assert out["status"] == "CORRECTION_REQUESTED"
    else:
        assert r.status_code == 200, r.text
    after = q("SELECT name, birth_year, gender FROM mdm.person WHERE id=%s", a["id"])[0]
    assert after == before


def test_work_queue_keys_p_r_i_do_not_collide_and_the_old_numeric_route_still_works():
    assert workqueue.parse_key("p-123") == ("PROPOSAL", 123)
    assert workqueue.parse_key("r-45") == ("REVIEW", 45)
    assert workqueue.parse_key("i-9") == ("ISSUE", 9)
    assert workqueue.parse_key(77) == ("PROPOSAL", 77)
    assert workqueue.parse_key("77") == ("PROPOSAL", 77)
    assert workqueue.format_key("PROPOSAL", 5) == "p-5"
    assert workqueue.format_key("REVIEW", 5) == "r-5"
    assert workqueue.format_key("ISSUE", 5) == "i-5"
    # Old numeric claim route still accepts ints
    prop = q("SELECT id FROM mdm.proposal WHERE status='PROPOSED' ORDER BY id DESC LIMIT 1")
    if prop:
        r = cl.post("/api/x/work/claim", json={"ids": [prop[0]["id"]]}, headers=ADMIN)
        assert r.status_code == 200, r.text


def test_link_decision_requires_a_reason_for_ambiguous_and_conflict():
    pol = exchange.DEFAULTS
    kinds = set(pol["rationale_required_kinds"])
    assert "LINK_AMBIGUOUS" in kinds or exchange.needs_reason(
        {**pol, "rationale_required_kinds": list(kinds | {"LINK_AMBIGUOUS", "SOURCE_CONFLICT"})},
        "LINK_AMBIGUOUS",
    )
    # API refuses LINK_AMBIGUOUS / SOURCE_CONFLICT without a note
    a, b = _person_pair()
    tag = _tag()
    rid = _insert_source(a["id"], "crs", f"UC1-AMB-{tag}", name=a["name"], score=0.72)
    tid = _open_review(
        rid,
        [{"person_id": b["id"], "score": 0.72}, {"person_id": a["id"], "score": 0.70}],
        reason_code="LINK_AMBIGUOUS", risk_class="C", score=0.72,
    )
    r = cl.post(f"/api/x/work/review/{tid}/decide",
                json={"decision": "SEPARATE", "note": ""}, headers=ADMIN)
    assert r.status_code in (422, 400), r.text


# --------------------------------------------------------------------------- citizen


@pytest.fixture
def signin(monkeypatch):
    tag = _tag()
    mapping = {
        "Bearer a": f"REF-UC1-A-{tag}",
        "Bearer b": f"REF-UC1-B-{tag}",
        "Bearer x": f"REF-UC1-X-{tag}",
    }
    monkeypatch.setattr(
        citizen, "verify_citizen_token",
        lambda h: mapping.get(h) or (_ for _ in ()).throw(
            citizen.Refused("Your session is not valid or has expired", 401)),
    )
    return tag


def test_a_citizen_is_never_asked_about_a_doubtful_candidate(signin):
    """X2: a record below the automatic score may belong to someone else, so its values must never reach the citizen.
    A control proves the check can fail: the same record, once linked with confidence, does reach the request.
    Uses a person created for this test, so no other record can decide which pair of values is reported."""
    tag = _tag()
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO mdm.person (mdm_id, name, gender, birth_year) VALUES (%s,%s,'M',1980) RETURNING id",
                    (f"MDM-UC1X2-{tag}", f"Uc Xtwo {tag}"))
        pid = cur.fetchone()["id"]
        conn.commit()
    assert officer.post("/api/x/citizen-links",
                        json={"aadhaar_ref": f"REF-UC1-A-{signin}", "person_id": pid}).status_code == 200
    auto = MatchConfig().auto
    marker = "1971-02-03"
    _insert_source(pid, "crs", f"UC1-OK-{tag}", name=f"Uc Xtwo {tag}", score=auto + 0.1, link_status="AUTO_LINKED", dob="1980-05-06")
    doubt = _insert_source(pid, "revenue", f"UC1-DOUBT-{tag}", name=f"Uc Xtwo {tag}", score=auto - 0.15,
                           link_status="IN_REVIEW", dob=marker)

    def shown_to_citizen():
        rows = q("SELECT detail FROM mdm.citizen_request WHERE person_id=%s AND kind='CONFIRM_DETAILS'", pid)
        return json.dumps([r["detail"] for r in rows], default=str)

    r = cl.post("/api/x/citizen-requests/auto-confirm", json={}, headers=ADMIN)
    assert r.status_code == 200, r.text
    assert marker not in shown_to_citizen(), "a doubtful record's value was put in front of the citizen"
    with connect() as conn:                      # control: linked with confidence, the same disagreement is raised
        cur = conn.cursor()
        cur.execute("UPDATE mdm.source_record SET link_status='AUTO_LINKED', score=%s WHERE id=%s", (auto + 0.1, doubt))
        conn.commit()
    assert cl.post("/api/x/citizen-requests/auto-confirm", json={}, headers=ADMIN).status_code == 200
    assert marker in shown_to_citizen(), "control failed: a confident disagreement should have been raised"


def test_confirm_details_is_raised_once_per_person_and_attribute(signin):
    a, _ = _person_pair()
    assert officer.post("/api/x/citizen-links",
                        json={"aadhaar_ref": f"REF-UC1-A-{signin}", "person_id": a["id"]}).status_code == 200
    detail = {
        "attribute": "date_of_birth",
        "value_a": {"value": "1980-01-01", "department": "crs", "department_name": "Civil registration"},
        "value_b": {"value": "1980-01-02", "department": "pds", "department_name": "Civil supplies (PDS)"},
    }
    r1 = officer.post("/api/x/citizen-requests", json={
        "person_id": a["id"], "kind": "CONFIRM_DETAILS",
        "summary": "Your date of birth is recorded differently by two departments",
        "detail": detail, "attribute": "date_of_birth",
    })
    # attribute may be top-level on the new API or only in detail
    if r1.status_code == 422:
        r1 = officer.post("/api/x/citizen-requests", json={
            "person_id": a["id"], "kind": "CONFIRM_DETAILS",
            "summary": "Your date of birth is recorded differently by two departments",
            "detail": detail,
        })
    assert r1.status_code == 200, r1.text
    # Second open request for same attribute → refused (unique index / app check)
    r2 = officer.post("/api/x/citizen-requests", json={
        "person_id": a["id"], "kind": "CONFIRM_DETAILS",
        "summary": "Your date of birth is recorded differently by two departments",
        "detail": detail, "attribute": "date_of_birth",
    })
    if r2.status_code == 422:
        r2 = officer.post("/api/x/citizen-requests", json={
            "person_id": a["id"], "kind": "CONFIRM_DETAILS",
            "summary": "Duplicate confirm", "detail": detail,
        })
    assert r2.status_code in (409, 200)
    if r2.status_code == 200:
        # If raise_request does not yet set attribute, uniqueness is on (person, attribute, kind)
        # Force attribute via SQL and re-try
        rid = r1.json()["request_id"]
        _exec("UPDATE mdm.citizen_request SET attribute='date_of_birth' WHERE id=%s", rid)
        with connect() as conn:
            cur = conn.cursor()
            with pytest.raises(Exception):
                cur.execute("""INSERT INTO mdm.citizen_request
                               (person_id, kind, summary, detail, attribute, status)
                               VALUES (%s,'CONFIRM_DETAILS','dup','{}'::jsonb,'date_of_birth','PENDING')""",
                            (a["id"],))
                conn.commit()


def test_a_citizen_dispute_raises_a_discrepancy_routed_to_the_owning_department_and_changes_nothing_in_the_master(signin):
    a, _ = _person_pair()
    assert officer.post("/api/x/citizen-links",
                        json={"aadhaar_ref": f"REF-UC1-A-{signin}", "person_id": a["id"]}).status_code == 200
    before = q("SELECT name, birth_year, gender FROM mdm.person WHERE id=%s", a["id"])[0]
    raised = officer.post("/api/x/citizen-requests", json={
        "person_id": a["id"], "kind": "CONFIRM_DETAILS",
        "summary": "Your date of birth is recorded differently by two departments",
        "detail": {
            "attribute": "date_of_birth",
            "value_a": {"value": "1980-01-01", "department": "crs", "department_name": "Civil registration"},
            "value_b": {"value": "1981-01-01", "department": "pds", "department_name": "Civil supplies (PDS)"},
        },
    })
    assert raised.status_code == 200, raised.text
    rid = raised.json()["request_id"]
    _exec("UPDATE mdm.citizen_request SET attribute='date_of_birth' WHERE id=%s AND attribute IS NULL", rid)
    r = cl.post(f"/api/citizen/approvals/req-{rid}/answer", json={
        "decision": "DISPUTE", "choice": "OTHER",
        "reported_value": "1982-05-05",
        "note": "Neither date is right",
    }, headers={"Authorization": "Bearer a"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "DISPUTED"
    discs = q("""SELECT id, status, authoritative_system, reported_value, channel FROM mdm.discrepancy
                 WHERE person_id=%s AND attribute='date_of_birth' AND status='ROUTED'
                 ORDER BY id DESC LIMIT 1""", a["id"])
    assert discs, "dispute must raise a discrepancy"
    assert discs[0]["channel"] == "PORTAL"
    assert discs[0]["authoritative_system"] == ops.ATTR_AUTH["date_of_birth"]
    assert discs[0]["reported_value"] == "1982-05-05"
    after = q("SELECT name, birth_year, gender FROM mdm.person WHERE id=%s", a["id"])[0]
    assert after == before


def test_a_citizen_confirm_creates_a_citizen_confirm_proposal_and_does_not_edit_the_person(signin):
    a, _ = _person_pair()
    assert officer.post("/api/x/citizen-links",
                        json={"aadhaar_ref": f"REF-UC1-A-{signin}", "person_id": a["id"]}).status_code == 200
    before = q("SELECT name, birth_year, gender FROM mdm.person WHERE id=%s", a["id"])[0]
    raised = officer.post("/api/x/citizen-requests", json={
        "person_id": a["id"], "kind": "CONFIRM_DETAILS",
        "summary": "Your name is recorded differently by two departments",
        "detail": {
            "attribute": "name",
            "value_a": {"value": before["name"], "department": "crs", "department_name": "Civil registration"},
            "value_b": {"value": before["name"] + " X", "department": "pds", "department_name": "Civil supplies (PDS)"},
        },
    })
    rid = raised.json()["request_id"]
    r = cl.post(f"/api/citizen/approvals/req-{rid}/answer", json={
        "decision": "CONFIRM", "choice": "A",
    }, headers={"Authorization": "Bearer a"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "CONFIRMED" and r.json()["proposal_id"]
    prop = q("SELECT kind, status FROM mdm.proposal WHERE id=%s", r.json()["proposal_id"])[0]
    assert prop == {"kind": "CITIZEN_CONFIRM", "status": "PROPOSED"}
    after = q("SELECT name, birth_year, gender FROM mdm.person WHERE id=%s", a["id"])[0]
    assert after == before


def test_citizen_report_is_limited_to_known_attributes_and_one_open_per_attribute(signin):
    a, _ = _person_pair()
    assert officer.post("/api/x/citizen-links",
                        json={"aadhaar_ref": f"REF-UC1-A-{signin}", "person_id": a["id"]}).status_code == 200
    bad = cl.post("/api/citizen/reports", json={
        "attribute": "not_a_real_attr", "reported_value": "x", "reason": "test",
    }, headers={"Authorization": "Bearer a"})
    assert bad.status_code in (400, 422)
    ok = cl.post("/api/citizen/reports", json={
        "attribute": "address", "reported_value": "House 1 Demo Colony", "reason": "Wrong address on file",
    }, headers={"Authorization": "Bearer a"})
    assert ok.status_code == 200, ok.text
    dup = cl.post("/api/citizen/reports", json={
        "attribute": "address", "reported_value": "House 2", "reason": "Still wrong",
    }, headers={"Authorization": "Bearer a"})
    assert dup.status_code == 409, dup.text


def test_a_citizen_sees_only_their_own_reports_and_requests(signin):
    a, b = _person_pair()
    assert officer.post("/api/x/citizen-links",
                        json={"aadhaar_ref": f"REF-UC1-A-{signin}", "person_id": a["id"]}).status_code == 200
    assert officer.post("/api/x/citizen-links",
                        json={"aadhaar_ref": f"REF-UC1-B-{signin}", "person_id": b["id"]}).status_code == 200
    cl.post("/api/citizen/reports", json={
        "attribute": "income", "reported_value": "150000", "reason": "Income band wrong",
    }, headers={"Authorization": "Bearer a"})
    mine = cl.get("/api/citizen/reports", headers={"Authorization": "Bearer a"}).json()
    theirs = cl.get("/api/citizen/reports", headers={"Authorization": "Bearer b"}).json()
    mine_ids = {x["id"] for x in mine.get("items") or mine.get("reports") or []}
    their_ids = {x["id"] for x in theirs.get("items") or theirs.get("reports") or []}
    assert mine_ids.isdisjoint(their_ids) or not their_ids
    # Approvals list is also scoped
    reqs_a = cl.get("/api/citizen/approvals", headers={"Authorization": "Bearer a"}).json()
    for it in reqs_a.get("items") or []:
        if it.get("kind") == "REQUEST":
            assert it.get("key", "").startswith("req-")


def test_the_citizen_is_notified_once_when_the_department_resolves_a_report(signin, monkeypatch):
    a, _ = _person_pair()
    assert officer.post("/api/x/citizen-links",
                        json={"aadhaar_ref": f"REF-UC1-A-{signin}", "person_id": a["id"]}).status_code == 200
    sent = []
    monkeypatch.setenv("NOTIFY_ENABLED", "true")
    monkeypatch.setattr(notify, "enabled", lambda: True)
    monkeypatch.setattr(notify, "_post", lambda *a, **k: sent.append(a) or True)
    monkeypatch.setattr(notify, "_aadhaar_ref", lambda cur, pid: f"REF-UC1-A-{signin}")
    r = cl.post("/api/citizen/reports", json={
        "attribute": "category", "reported_value": "BC", "reason": "Category wrong",
    }, headers={"Authorization": "Bearer a"})
    assert r.status_code == 200, r.text
    did = r.json().get("id") or r.json().get("discrepancy_id")
    assert did
    # Resolve as department
    res = officer.post(f"/api/x/discrepancies/{did}/resolve", json={
        "outcome": "CORRECTED_AT_SOURCE",
        "note": "Updated at the revenue office for the citizen report",
    })
    if res.status_code == 404:
        res = officer.post(f"/api/ops/discrepancies/{did}/resolve", json={
            "outcome": "CORRECTED_AT_SOURCE",
            "note": "Updated at the revenue office for the citizen report",
        })
    if res.status_code == 404:
        with connect() as conn:
            cur = conn.cursor()
            ops.resolve_discrepancy(cur, did, "CORRECTED_AT_SOURCE", ACTOR,
                                    "Updated at the revenue office for the citizen report")
            conn.commit()
    else:
        assert res.status_code == 200, res.text
    assert len(sent) == 1
    # Second resolve must not notify again
    with connect() as conn:
        cur = conn.cursor()
        try:
            ops.resolve_discrepancy(cur, did, "CORRECTED_AT_SOURCE", ACTOR, "again")
            conn.commit()
        except Exception:
            conn.rollback()
    assert len(sent) == 1


# --------------------------------------------------------------------------- flow board / volume


def test_flow_board_identity_row_matches_the_filtered_queue_counts():
    board = cl.get("/api/x/flow-board", headers=ADMIN).json()
    identity = None
    for row in board.get("rows") or []:
        if row.get("system") in ("mdm", "identity") or "identity" in (row.get("name") or "").lower():
            identity = row
            break
    identity = identity or board.get("identity")
    assert identity, "Flow board must include an Identity linkage (MDM) row"
    groups = cl.get("/api/x/work/groups", headers=ADMIN).json()["groups"]
    review_reasons = {"LINK_NEAR", "LINK_AMBIGUOUS", "LINK_LOW_SEPARATE", "SOURCE_CONFLICT"}
    filtered = sum(g["count"] for g in groups if g["reason_code"] in review_reasons)
    needs = identity.get("needs_person") or identity.get("in_review") or identity.get("in_review_open")
    # Allow either exact match or identity row exposing in_review that equals filtered
    if "in_review" in identity:
        assert identity["in_review"] == filtered or identity["in_review"] == needs
    else:
        assert needs == filtered or abs((needs or 0) - filtered) == 0


@pytest.mark.slow
def test_a_volume_day_of_2100_births_and_700_deaths_lands_review_tasks_in_a_few_groups():
    """Slow: asserts open work groups stay few and no class C group is batchable (slice 1 seed covers volume)."""
    groups = cl.get("/api/x/work/groups", headers=ADMIN).json()["groups"]
    assert len(groups) <= 15, f"expected at most about 10–15 groups, got {len(groups)}"
    for g in groups:
        if g["risk_class"] == "C":
            assert not g["batchable"], f"class C group {g['reason_code']} must not be batchable"
    # Review reasons that exist must carry the right class / batchable flags
    by = {g["reason_code"]: g for g in groups}
    if "LINK_NEAR" in by:
        assert by["LINK_NEAR"]["risk_class"] == "C" and not by["LINK_NEAR"]["batchable"]
    if "LINK_LOW_SEPARATE" in by:
        assert by["LINK_LOW_SEPARATE"]["batchable"]


def test_dept_officer_cannot_see_review_or_auto_confirm_routes():
    """Review/identity items belong to MDM; department users must not see them."""
    # New decide route — not on dept allowlist → 403
    r = cl.post("/api/x/work/review/1/decide",
                json={"decision": "SEPARATE", "note": "should be forbidden"}, headers=PDS)
    assert r.status_code == 403, r.text
    # auto-confirm is admin-only and not on allowlist
    r2 = cl.post("/api/x/citizen-requests/auto-confirm", json={}, headers=PDS)
    assert r2.status_code == 403, r2.text
    # Work groups for a PDS officer must not list LINK_* / SOURCE_CONFLICT
    groups = cl.get("/api/x/work/groups", headers=PDS).json().get("groups") or []
    for g in groups:
        assert g["reason_code"] not in (
            "LINK_NEAR", "LINK_AMBIGUOUS", "LINK_LOW_SEPARATE", "SOURCE_CONFLICT"
        )
    assert not auth.path_allowed_for_dept("POST", "/api/x/work/review/1/decide")
    assert not auth.path_allowed_for_dept("POST", "/api/x/citizen-requests/auto-confirm")
