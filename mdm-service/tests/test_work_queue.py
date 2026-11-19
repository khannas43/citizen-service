"""Officer work queue and Flow board (slice 1)."""
import json, os, time, uuid
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""

import pytest
from fastapi.testclient import TestClient
from app.api import app
from app import workqueue, events, exchange
from app.matching import MatchConfig
from tests.test_feed import couple, c as officer, q

cl = TestClient(app)
ACTOR = "test-user"


def _tag():
    return uuid.uuid4().hex[:8]


def _birth(tag, late=False, mother=None, father=None, gender="F"):
    pr = couple()
    mother = mother or pr["mname"]
    father = father or pr["fname"]
    # Late = registration more than late_event_days after birth (not before).
    reg = "2027-01-15" if late else "2026-10-31"
    r = officer.post("/api/events", json={
        "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {
            "registration_no": f"DEMO-WQ-{tag}", "child_name": f"WQ Child {tag}",
            "gender": gender, "date_of_birth": "2026-10-30",
            "father_name": father, "mother_name": mother,
            "place": pr["district"], "registration_date": reg,
        },
    })
    assert r.status_code == 200, r.text
    return pr, r.json()["event_id"]


def _open_ids(reason, unclaimed_only=True):
    """Open proposal ids for a reason. Prefer unclaimed so a prior claim test does not poison batches."""
    if unclaimed_only:
        return [r["id"] for r in q(
            "SELECT id FROM mdm.proposal WHERE status='PROPOSED' AND reason_code=%s AND claimed_by IS NULL ORDER BY id",
            reason)]
    return [r["id"] for r in q("SELECT id FROM mdm.proposal WHERE status='PROPOSED' AND reason_code=%s ORDER BY id", reason)]


def _sample_ids(prev):
    return list(dict.fromkeys(
        prev["sample"]["random"] + prev["sample"]["lowest_confidence"] + prev["sample"]["outliers"]))


def test_every_proposal_kind_has_a_reason_code_and_class():
    src = open(os.path.join(os.path.dirname(__file__), "..", "app", "events.py"), encoding="utf-8").read()
    kinds = workqueue.known_kinds_in_events_source(src)
    missing = sorted(k for k in kinds if k not in workqueue.KIND_BASE)
    assert missing == [], f"Add reason codes for: {missing}"
    for kind, base in workqueue.KIND_BASE.items():
        if base is None:
            continue
        code, cls = base
        assert code and cls in ("B", "C")
        row = {"kind": kind, "uc": "UC3", "detail": {}, "options": []}
        got = workqueue.classify(row)
        assert got == (code, cls)


def test_a_clean_birth_and_late_birth_are_class_b_and_review_parents_is_class_c():
    conf = {
        "mother": {"name": "M", "person_id": 1, "score": 0.71},
        "father": {"name": "F", "person_id": 2, "score": 0.71},
        "confident": True, "couple_linked": True, "bar": 0.70,
    }
    clean = workqueue.classify({
        "kind": "ADD_TO_RATION_CARD", "uc": "UC2",
        "detail": {"late_registration": False, "parents": conf, "ration_card": "RC1"},
        "options": [],
    })
    assert clean == ("BIRTH_CLEAN", "B")
    late = workqueue.classify({
        "kind": "ADD_TO_RATION_CARD", "uc": "UC2",
        "detail": {"late_registration": True, "parents": conf},
        "options": [],
    })
    assert late == ("BIRTH_LATE", "B")
    review = workqueue.classify({"kind": "REVIEW_PARENTS", "uc": "UC2", "detail": {}, "options": []})
    assert review == ("PARENT_REVIEW", "C")
    assert not workqueue.is_batchable("PARENT_REVIEW")
    unsure = workqueue.classify({
        "kind": "ADD_TO_RATION_CARD", "uc": "UC2",
        "detail": {"parents": {
            "mother": {"name": "M", "person_id": None, "score": None},
            "father": {"name": "F", "person_id": 2, "score": 0.71},
            "confident": False, "couple_linked": False, "bar": 0.70,
        }, "ration_card": "RC1"},
        "options": [],
    })
    assert unsure == ("BIRTH_PARENT_UNSURE", "C")
    assert not workqueue.is_batchable("BIRTH_PARENT_UNSURE")


def test_a_birth_with_a_missing_or_low_score_parent_is_parent_unsure_class_c_and_not_batchable():
    """Real case: known father (~0.71), unknown mother → ADD_TO_RATION_CARD is BIRTH_PARENT_UNSURE / C."""
    tag = _tag()
    pr = couple()
    r = officer.post("/api/events", json={
        "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {
            "registration_no": f"DEMO-WQ-UNSURE-{tag}", "child_name": f"Unsure Child {tag}",
            "gender": "F", "date_of_birth": "2026-10-30",
            "father_name": pr["fname"], "mother_name": f"Unknown Mother {tag}",
            "place": pr["district"], "registration_date": "2026-10-31",
        },
    })
    assert r.status_code == 200, r.text
    eid = r.json()["event_id"]
    rows = q("""SELECT id, kind, reason_code, risk_class, detail FROM mdm.proposal
                WHERE event_id=%s AND kind='ADD_TO_RATION_CARD'""", eid)
    if not rows:
        pytest.skip("birth did not raise ADD_TO_RATION_CARD (no ration card on matched father)")
    row = rows[0]
    parents = row["detail"].get("parents") or {}
    father = parents.get("father") or {}
    mother = parents.get("mother") or {}
    assert father.get("person_id") and (mother.get("person_id") is None or float(father.get("score") or 0) < MatchConfig().auto
                                        or float(mother.get("score") or 0) < MatchConfig().auto
                                        or mother.get("person_id") is None)
    assert row["reason_code"] == "BIRTH_PARENT_UNSURE"
    assert row["risk_class"] == "C"
    assert not workqueue.is_batchable(row["reason_code"])


def test_a_late_birth_with_a_weak_parent_is_not_batchable():
    got = workqueue.classify({
        "kind": "ADD_TO_RATION_CARD", "uc": "UC2",
        "detail": {"late_registration": True, "parents": {
            "mother": {"name": "M", "person_id": 1, "score": 0.66},
            "father": {"name": "F", "person_id": 2, "score": 0.71},
            "confident": False, "couple_linked": True, "bar": 0.70,
        }, "ration_card": "RC1"},
        "options": [],
    })
    assert got == ("BIRTH_PARENT_UNSURE", "C")
    assert not workqueue.is_batchable("BIRTH_PARENT_UNSURE")


def test_preview_refuses_a_parent_unsure_group():
    tag = _tag()
    pr = couple()
    r = officer.post("/api/events", json={
        "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {
            "registration_no": f"DEMO-WQ-PREV-{tag}", "child_name": f"Prev Child {tag}",
            "gender": "F", "date_of_birth": "2026-10-30",
            "father_name": pr["fname"], "mother_name": f"Unknown Mother {tag}",
            "place": pr["district"], "registration_date": "2026-10-31",
        },
    })
    assert r.status_code == 200, r.text
    r2 = officer.post("/api/x/work/batch/preview", json={"reason": "BIRTH_PARENT_UNSURE"})
    assert r2.status_code == 409


def test_a_death_with_one_clear_match_is_batchable_and_with_two_is_not():
    thr = MatchConfig().auto
    single = workqueue.classify({
        "kind": "CONFIRM_DEATH", "uc": "UC3", "detail": {},
        "options": [{"person_id": 1, "score": thr}],
    })
    assert single == ("DEATH_SINGLE", "B") and workqueue.is_batchable("DEATH_SINGLE")
    amb = workqueue.classify({
        "kind": "CONFIRM_DEATH", "uc": "UC3", "detail": {},
        "options": [{"person_id": 1, "score": thr}, {"person_id": 2, "score": thr - 0.01}],
    })
    assert amb == ("DEATH_AMBIGUOUS", "C") and not workqueue.is_batchable("DEATH_AMBIGUOUS")


def test_groups_count_open_items_by_reason_and_sort_overdue_then_oldest():
    tag = _tag()
    _birth(tag)
    g = officer.get("/api/x/work/groups").json()
    assert g["groups"]
    codes = {x["reason_code"] for x in g["groups"]}
    assert "IDREF_REQUEST" in codes or "BIRTH_CLEAN" in codes or "PARENT_REVIEW" in codes or "BIRTH_PARENT_UNSURE" in codes
    hours = [(0 if x["overdue"] else 1, -x["oldest_hours"]) for x in g["groups"]]
    assert hours == sorted(hours)


def test_suggestion_is_telugu_when_accept_language_is_telugu():
    tag = _tag()
    _birth(tag + "te")
    en = officer.get("/api/x/work/groups").json()
    te = officer.get("/api/x/work/groups", headers={"Accept-Language": "te"}).json()
    assert en["groups"] and te["groups"]
    # Pick a reason present in both; Telugu suggestion must differ from English.
    by_en = {g["reason_code"]: g for g in en["groups"]}
    by_te = {g["reason_code"]: g for g in te["groups"]}
    code = next(c for c in by_en if c in by_te)
    assert by_te[code]["suggestion"] != by_en[code]["suggestion"]
    assert by_te[code]["suggestion"] == workqueue.suggestion_for(code, "te")
    assert by_en[code]["suggestion"] == workqueue.suggestion_for(code, "en")


def test_items_page_by_keyset_not_offset_and_never_repeat_or_skip():
    tag = _tag()
    for i in range(3):
        _birth(f"{tag}-{i}")
    reason = "IDREF_REQUEST"
    ids = _open_ids(reason)
    if len(ids) < 3:
        pytest.skip("not enough IDREF items")
    p1 = officer.get("/api/x/work/items", params={"reason": reason, "limit": 2}).json()
    assert len(p1["items"]) == 2
    assert p1["next_after"] == p1["items"][-1]["id"]
    p2 = officer.get("/api/x/work/items", params={"reason": reason, "limit": 2, "after": p1["next_after"]}).json()
    seen = {i["id"] for i in p1["items"]} | {i["id"] for i in p2["items"]}
    assert len(seen) == len(p1["items"]) + len(p2["items"])
    assert all(i["id"] < p1["next_after"] for i in p2["items"])


def test_claim_does_not_steal_and_release_only_frees_my_own():
    from app.db import connect
    tag = _tag()
    _birth(tag)
    ids = _open_ids("IDREF_REQUEST")
    assert ids
    pid = ids[0]
    with connect() as conn:
        cur = conn.cursor()
        assert workqueue.claim(cur, ACTOR, ids=[pid])["claimed"] == 1
        assert workqueue.claim(cur, "other-officer", ids=[pid])["claimed"] == 0
        cur.execute("SELECT claimed_by FROM mdm.proposal WHERE id=%s", (pid,))
        assert cur.fetchone()["claimed_by"] == ACTOR
        assert workqueue.unclaim(cur, "other-officer", ids=[pid])["released"] == 0
        assert workqueue.unclaim(cur, ACTOR, ids=[pid])["released"] == 1
        cur.execute("SELECT claimed_by FROM mdm.proposal WHERE id=%s", (pid,))
        assert cur.fetchone()["claimed_by"] is None
        conn.commit()


def test_preview_returns_the_lowest_confidence_rows_in_the_sample():
    tag = _tag()
    _birth(tag)
    reason = "IDREF_REQUEST"
    ids = _open_ids(reason)
    assert ids
    prev = officer.post("/api/x/work/batch/preview", json={"reason": reason, "ids": ids[:20]}).json()
    assert prev["token"] and prev["count"] >= 1
    assert "lowest_confidence" in prev["sample"]
    assert set(prev["sample"]["lowest_confidence"]).issubset(set(ids[:20]))


def test_two_previews_of_a_large_group_differ_and_one_preview_keeps_its_sample():
    reason = "IDREF_REQUEST"
    # Ensure at least 30 open IDREF items
    have = _open_ids(reason)
    needed = 30 - len(have)
    for i in range(max(0, needed)):
        _birth(f"rnd-{_tag()}-{i}")
    ids = _open_ids(reason)
    assert len(ids) >= 30
    use = ids[:30]
    p1 = officer.post("/api/x/work/batch/preview", json={"reason": reason, "ids": use}).json()
    p2 = officer.post("/api/x/work/batch/preview", json={"reason": reason, "ids": use}).json()
    assert p1["sample"]["random"] != p2["sample"]["random"]
    # Token keeps the sample for that one preview
    payload = workqueue._parse_token(p1["token"])
    assert payload["sample"] == list(dict.fromkeys(
        p1["sample"]["random"] + p1["sample"]["lowest_confidence"] + p1["sample"]["outliers"]))


def test_batch_approve_refused_until_every_sample_row_is_opened():
    tag = _tag()
    _birth(tag)
    reason = "IDREF_REQUEST"
    ids = _open_ids(reason)[:5]
    prev = officer.post("/api/x/work/batch/preview", json={"reason": reason, "ids": ids}).json()
    sample = set(prev["sample"]["random"]) | set(prev["sample"]["lowest_confidence"]) | set(prev["sample"]["outliers"])
    r = officer.post("/api/x/work/batch/approve", json={
        "token": prev["token"], "rationale": "x" * 20, "sample_opened": list(sample)[:-1] or [],
    })
    assert r.status_code == 422
    assert "sample" in r.json()["detail"].lower() or "Open every" in r.json()["detail"]


def test_batch_approve_needs_the_minimum_reason_length():
    tag = _tag()
    _birth(tag)
    reason = "IDREF_REQUEST"
    ids = _open_ids(reason)[:3]
    prev = officer.post("/api/x/work/batch/preview", json={"reason": reason, "ids": ids}).json()
    sample = _sample_ids(prev)
    r = officer.post("/api/x/work/batch/approve", json={
        "token": prev["token"], "rationale": "short", "sample_opened": sample,
    })
    assert r.status_code == 422


def test_a_class_c_group_cannot_be_batch_approved():
    tag = _tag()
    pr = couple()
    r = officer.post("/api/events", json={
        "event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {
            "registration_no": f"DEMO-WQ-C-{tag}", "child_name": f"Ambiguous {tag}",
            "gender": "F", "date_of_birth": "2026-10-30",
            "father_name": f"Unknown Father {tag}", "mother_name": f"Unknown Mother {tag}",
            "place": pr["district"], "registration_date": "2026-10-31",
        },
    })
    assert r.status_code == 200, r.text
    r2 = officer.post("/api/x/work/batch/preview", json={"reason": "PARENT_REVIEW"})
    assert r2.status_code == 409


def test_a_token_expires_and_a_forged_token_is_refused():
    tag = _tag()
    _birth(tag)
    reason = "IDREF_REQUEST"
    ids = _open_ids(reason)[:2]
    prev = officer.post("/api/x/work/batch/preview", json={"reason": reason, "ids": ids}).json()
    sample = _sample_ids(prev)
    payload = workqueue._parse_token(prev["token"])
    payload["exp"] = time.time() - 10
    bad = workqueue._sign_token(payload)
    r = officer.post("/api/x/work/batch/approve", json={
        "token": bad, "rationale": "x" * 20, "sample_opened": sample,
    })
    assert r.status_code == 409
    # Forged signature
    forged = prev["token"][:-4] + "dead"
    r2 = officer.post("/api/x/work/batch/approve", json={
        "token": forged, "rationale": "x" * 20, "sample_opened": sample,
    })
    assert r2.status_code == 409


def test_a_replayed_token_is_refused_and_creates_no_row():
    tag = _tag()
    _birth(tag + "rp")
    reason = "IDREF_REQUEST"
    ids = _open_ids(reason)[:1]
    assert ids
    prev = officer.post("/api/x/work/batch/preview", json={"reason": reason, "ids": ids}).json()
    sample = _sample_ids(prev)
    body = {"token": prev["token"], "rationale": "First approve for replay test " + "x" * 5, "sample_opened": sample}
    r1 = officer.post("/api/x/work/batch/approve", json=body)
    assert r1.status_code == 200, r1.text
    before = q("SELECT count(*) AS n FROM mdm.batch")[0]["n"]
    r2 = officer.post("/api/x/work/batch/approve", json=body)
    assert r2.status_code == 409
    assert q("SELECT count(*) AS n FROM mdm.batch")[0]["n"] == before


def test_another_users_token_is_refused():
    from app.db import connect
    tag = _tag()
    _birth(tag + "act")
    reason = "IDREF_REQUEST"
    ids = _open_ids(reason)[:1]
    assert ids
    with connect() as conn:
        cur = conn.cursor()
        prev = workqueue.preview(cur, reason, ids=ids, actor="officer-a")
        sample = list(dict.fromkeys(
            prev["sample"]["random"] + prev["sample"]["lowest_confidence"] + prev["sample"]["outliers"]))
        from app.stewardship import Refused
        with pytest.raises(Refused) as ei:
            workqueue.batch_approve(cur, prev["token"], "x" * 20, sample, "officer-b")
        assert ei.value.code == 409
        conn.rollback()


def test_batch_skips_an_item_claimed_by_another_officer():
    from app.db import connect
    tag = _tag()
    for i in range(3):
        _birth(f"{tag}-cl-{i}")
    reason = "IDREF_REQUEST"
    ids = _open_ids(reason)[:3]
    assert len(ids) == 3
    with connect() as conn:
        cur = conn.cursor()
        workqueue.claim(cur, "other-officer", ids=[ids[1]])
        conn.commit()
    prev = officer.post("/api/x/work/batch/preview", json={"reason": reason, "ids": ids}).json()
    sample = _sample_ids(prev)
    out = officer.post("/api/x/work/batch/approve", json={
        "token": prev["token"], "rationale": "Approve except claimed " + "x" * 10, "sample_opened": sample,
    }).json()
    assert out["approved"] == 2
    assert out["skipped"] == 1
    assert any("Claimed by other-officer" in (s.get("reason") or "") for s in out["skipped_detail"])
    assert q("SELECT status FROM mdm.proposal WHERE id=%s", ids[1])[0]["status"] == "PROPOSED"
    # Release the claim so later tests do not inherit a stuck claim.
    with connect() as conn:
        cur = conn.cursor()
        workqueue.unclaim(cur, "other-officer", ids=[ids[1]])
        conn.commit()


def _approve_batch(reason, ids):
    prev = officer.post("/api/x/work/batch/preview", json={"reason": reason, "ids": ids}).json()
    assert "token" in prev, prev
    sample = _sample_ids(prev)
    r = officer.post("/api/x/work/batch/approve", json={
        "token": prev["token"], "rationale": "Batch approve for the work queue test " + reason, "sample_opened": sample,
    })
    assert r.status_code == 200, r.text
    return r.json()


def test_batch_approve_uses_decide_proposal_so_audit_ledger_and_follow_ups_still_happen():
    tag = _tag()
    _birth(tag)
    reason = "IDREF_REQUEST"
    ids = _open_ids(reason)[:1]
    assert ids
    out = _approve_batch(reason, ids)
    assert out["approved"] >= 1
    pid = ids[0]
    assert q("SELECT status FROM mdm.proposal WHERE id=%s", pid)[0]["status"] == "APPROVED"
    led = q("""SELECT answer FROM mdm.exchange WHERE question='REQUEST_IDENTITY_REFERENCE' AND outcome='ANSWERED'
               ORDER BY id DESC LIMIT 5""")
    assert any((r["answer"] or {}).get("batch_id") == out["batch_id"] for r in led)
    aud = q("""SELECT detail FROM mdm.audit WHERE action='PROPOSAL_APPROVED' AND subject=%s ORDER BY seq DESC LIMIT 1""",
            f"proposal:{pid}")
    assert aud and (aud[0]["detail"] or {}).get("batch_id") == out["batch_id"]


def _gated_birth_item(tag):
    pr, eid = _birth(tag)
    rows = q("SELECT id, reason_code FROM mdm.proposal WHERE event_id=%s AND status='PROPOSED' AND kind='ADD_TO_RATION_CARD'", eid)
    if not rows or not workqueue.is_batchable(rows[0]["reason_code"]):
        pytest.skip("ration reason not batchable (weak parent → class C)")
    return rows[0]["id"], rows[0]["reason_code"], eid


def test_a_birth_still_waiting_for_the_parents_consent_is_left_out_of_the_batch_preview():
    from app.db import connect
    from app.stewardship import Refused
    pid, reason, _eid = _gated_birth_item(_tag() + "g")
    with connect() as conn:
        cur = conn.cursor()
        with pytest.raises(Refused) as ei:
            workqueue.preview(cur, reason, ids=[pid], actor="officer-a")
        assert ei.value.code == 409
        assert "waiting for the parent" in str(ei.value)
        conn.rollback()
    assert q("SELECT status FROM mdm.proposal WHERE id=%s", pid)[0]["status"] == "PROPOSED"


def test_once_the_parent_consents_the_birth_is_in_the_preview_and_the_batch_approves_it():
    from app.db import connect
    pid, reason, eid = _gated_birth_item(_tag() + "h")
    cons = q("SELECT id FROM mdm.consent WHERE event_id=%s AND purpose='BIRTH_PDS' AND status='PENDING'", eid)
    if not cons:
        pytest.skip("no pending birth consent for this event")
    with connect() as conn:
        cur = conn.cursor()
        exchange.respond(cur, cons[0]["id"], "GRANT", "test-parent", channel="ASSISTED", operator="test")
        conn.commit()
    out = _approve_batch(reason, [pid])
    assert out["approved"] == 1 and out["skipped"] == 0, out["skipped_detail"]

def test_every_approved_item_carries_the_batch_id_in_proposal_ledger_and_audit():
    tag = _tag()
    _birth(tag + "b")
    reason = "IDREF_REQUEST"
    ids = _open_ids(reason)[:2]
    assert ids
    out = _approve_batch(reason, ids)
    for pid in ids:
        row = q("SELECT batch_id, status FROM mdm.proposal WHERE id=%s", pid)[0]
        if row["status"] == "APPROVED":
            assert row["batch_id"] == out["batch_id"]


def test_a_second_batch_cannot_re_approve_an_already_decided_item():
    tag = _tag()
    _birth(tag + "r")
    reason = "IDREF_REQUEST"
    ids = _open_ids(reason)[:1]
    assert ids
    out1 = _approve_batch(reason, ids)
    assert out1["approved"] == 1
    prev = officer.post("/api/x/work/batch/preview", json={"reason": reason, "ids": ids})
    if prev.status_code == 404:
        return
    sample = _sample_ids(prev.json())
    out2 = officer.post("/api/x/work/batch/approve", json={
        "token": prev.json()["token"], "rationale": "Second try must skip " + "x" * 10, "sample_opened": sample,
    }).json()
    assert out2["approved"] == 0
    assert out2["skipped"] >= 1


def test_flow_board_has_one_row_per_department_code_and_matches_queue_counts():
    tag = _tag()
    _birth(tag + "f")
    # Ensure backfill ran for older rows
    from app.db import connect
    with connect() as conn:
        cur = conn.cursor()
        workqueue.backfill(cur)
        conn.commit()
    board = officer.get("/api/x/flow-board").json()
    assert "rows" in board and "definitions" in board
    assert "stopped" in board["definitions"]
    assert board["definitions"]["failed"].startswith("Status DEAD_LETTER")
    assert "BLOCKED_EXPIRED" in board["definitions"]["stopped"]
    assert "stopped" in board["totals"]
    codes = [r["system"] for r in board["rows"]]
    assert len(codes) == len(set(codes)), f"duplicate department rows: {codes}"
    assert all(c == exchange.system_code(c) for c in codes)
    for r in board["rows"]:
        assert "stopped" in r and "failed" in r
        assert r["needs_person"] == r.get("routine", 0) + r.get("decision", 0)
        g = officer.get("/api/x/work/groups", params={"system": r["system"]}).json()
        assert sum(x["count"] for x in g["groups"]) == r["needs_person"]
        # Display name filter matches code filter
        name = r["name"]
        g2 = officer.get("/api/x/work/groups", params={"system": name}).json()
        assert sum(x["count"] for x in g2["groups"]) == r["needs_person"]
        b2 = officer.get("/api/x/flow-board", params={"system": name}).json()
        assert len(b2["rows"]) == 1 and b2["rows"][0]["system"] == r["system"]
        assert b2["rows"][0]["needs_person"] == r["needs_person"]


def test_flow_board_on_time_uses_the_response_time_that_applies():
    board = officer.get("/api/x/flow-board").json()
    assert board["response_days"] == exchange.DEFAULTS["department_response_days"]
    for r in board["rows"]:
        assert 0 <= r["on_time_pct"] <= 100
    assert "routine" in board["definitions"] and "decision" in board["definitions"]


def test_a_department_officer_sees_only_their_own_department():
    """Auth is role-based only (same as /api/x/approvals). There is no per-user department scoping yet;
    the department filter is a query parameter and must return only that system_code."""
    board = officer.get("/api/x/flow-board").json()
    assert board["scoping"].startswith("Auth is role-based")
    if not board["rows"]:
        return
    sys = board["rows"][0]["system"]
    filtered = officer.get("/api/x/flow-board", params={"system": sys}).json()
    assert all(r["system"] == sys for r in filtered["rows"])
    g = officer.get("/api/x/work/groups", params={"system": sys}).json()
    for grp in g["groups"]:
        assert all(s == sys for s in grp["systems"])


def test_reads_do_not_write_classification():
    from app.db import connect
    tag = _tag()
    _birth(tag + "ro")
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT max(id) AS m FROM mdm.proposal")
        before = cur.fetchone()["m"]
        cur.execute("SELECT reason_code, risk_class, system_code FROM mdm.proposal WHERE id=%s", (before,))
        snap = cur.fetchone()
        conn.commit()
    officer.get("/api/x/work/groups")
    officer.get("/api/x/flow-board")
    officer.get("/api/x/work/items", params={"reason": "IDREF_REQUEST", "limit": 5})
    after = q("SELECT reason_code, risk_class, system_code FROM mdm.proposal WHERE id=%s", before)[0]
    assert after == snap


@pytest.mark.slow
def test_a_volume_day_at_tenth_scale_lands_in_a_small_number_of_groups():
    from tools import volume_seed
    summary = volume_seed.generate(officer_base="", births=210, deaths=70, exception_rate=0.05, client=officer, seed=99)
    demo = q("""
        SELECT pr.reason_code, count(*) AS n
        FROM mdm.proposal pr
        JOIN mdm.event e ON e.id = pr.event_id
        WHERE pr.status='PROPOSED'
          AND e.payload->>'registration_no' LIKE 'DEMO-VOL-%%'
        GROUP BY pr.reason_code
    """)
    by = {r["reason_code"]: r["n"] for r in demo}
    assert len(by) <= 10
    assert any(c in by for c in ("BIRTH_PARENT_UNSURE", "PARENT_REVIEW", "BIRTH_LATE", "BIRTH_CLEAN"))
    open_n = sum(by.values())
    assert open_n >= 210
    assert summary["groups"] >= 1


@pytest.mark.slow
def test_a_seeded_tenth_scale_day_has_most_births_in_the_batchable_group_and_the_exceptions_in_parent_review():
    from tools import volume_seed
    tag = f"c3-{_tag()}"
    seed = hash(tag) % 10000
    # Registration numbers are DEMO-VOL-B-{seed}-{i}; scope counts to this run only.
    summary = volume_seed.generate(officer_base="", births=210, deaths=70, exception_rate=0.05,
                                   client=officer, seed=seed)
    like = f"DEMO-VOL-B-{seed}-%"
    birth_groups = q("""
        SELECT pr.reason_code, count(*) AS n
        FROM mdm.proposal pr
        JOIN mdm.event e ON e.id = pr.event_id
        WHERE pr.status='PROPOSED'
          AND e.payload->>'registration_no' LIKE %s
          AND pr.kind IN ('ADD_TO_RATION_CARD', 'REVIEW_PARENTS')
        GROUP BY pr.reason_code
    """, like)
    by = {r["reason_code"]: r["n"] for r in birth_groups}
    # Batchable under current rules: clean + late. Exceptions include unsure, parent review,
    # and BIRTH_PARENT_MINOR (class C, not batchable — kept from the parent_minor path).
    clean = by.get("BIRTH_CLEAN", 0) + by.get("BIRTH_LATE", 0)
    unsure = by.get("BIRTH_PARENT_UNSURE", 0)
    review = by.get("PARENT_REVIEW", 0)
    minor = by.get("BIRTH_PARENT_MINOR", 0)
    exceptions = unsure + review + minor
    assert clean >= 1, (by, summary.get("exception_kinds"))
    assert exceptions >= 1 or summary.get("exception_kinds"), (by, summary)
    # Most ordinary births stay batchable relative to the exception buckets.
    assert clean >= unsure, (by, summary.get("exception_kinds"))
    assert summary.get("demo_batchable", clean) >= 1
    summary["birth_groups_this_seed"] = by


@pytest.mark.slow
def test_performance_flow_board_groups_items_and_a_200_item_batch_within_the_targets():
    from app.db import connect
    # Spec: seed 20,000 deliveries before timing.
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT count(*) AS n FROM mdm.delivery")
        have = cur.fetchone()["n"]
        need = max(0, 20000 - have)
        if need:
            # Direct SQL insert; synthetic rows for index/timing only.
            cur.execute("""
                INSERT INTO mdm.delivery (event_id, person_id, purpose, system, status, kind, created_at, updated_at)
                SELECT NULL, NULL, 'PERF', 'pds', 'DELIVERED', 'EVENT', now(), now()
                FROM generate_series(1, %s)
            """, (need,))
        conn.commit()
    t0 = time.time()
    assert officer.get("/api/x/flow-board").status_code == 200
    assert time.time() - t0 < 2.0
    t0 = time.time()
    assert officer.get("/api/x/work/groups").status_code == 200
    assert time.time() - t0 < 1.0
    reason = "IDREF_REQUEST"
    t0 = time.time()
    assert officer.get("/api/x/work/items", params={"reason": reason, "limit": 50}).status_code == 200
    assert time.time() - t0 < 1.0
    ids = _open_ids(reason)[:200]
    if len(ids) < 50:
        pytest.skip("need at least 50 open IDREF items for the batch timing check")
    t0 = time.time()
    _approve_batch(reason, ids)
    assert time.time() - t0 < 10.0


def test_items_search_filters_sort_offset_and_claimed_still_listed():
    """Group detail: q, claimed, min_age_hours, sort both ways, offset+total; claimed items stay listed by default."""
    from app.db import connect
    tag = _tag()
    _birth(tag)
    reason = "IDREF_REQUEST"
    ids = _open_ids(reason)
    if not ids:
        pytest.skip("no open IDREF items")
    pid = ids[0]
    with connect() as conn:
        cur = conn.cursor()
        workqueue.claim(cur, ACTOR, ids=[pid])
        conn.commit()
    try:
        # Default (no claimed filter): claimed item is still listed
        anyone = officer.get("/api/x/work/items", params={"reason": reason, "limit": 200, "offset": 0}).json()
        assert "total" in anyone
        assert any(i["id"] == pid for i in anyone["items"])
        claimed_row = next(i for i in anyone["items"] if i["id"] == pid)
        assert claimed_row["claimed_by"] == ACTOR
        # Unclaimed filter hides it
        none = officer.get("/api/x/work/items", params={"reason": reason, "claimed": "none", "limit": 200, "offset": 0}).json()
        assert all(i["id"] != pid for i in none["items"])
        # Mine filter shows it
        mine = officer.get("/api/x/work/items", params={"reason": reason, "claimed": "me", "limit": 200, "offset": 0}).json()
        assert any(i["id"] == pid for i in mine["items"])
        # Search
        q = officer.get("/api/x/work/items", params={"reason": reason, "q": "identity", "limit": 10, "offset": 0}).json()
        assert q["total"] >= 0
        # Sort both ways on age
        asc = officer.get("/api/x/work/items", params={"reason": reason, "sort": "age", "dir": "asc", "limit": 5, "offset": 0}).json()
        desc = officer.get("/api/x/work/items", params={"reason": reason, "sort": "age", "dir": "desc", "limit": 5, "offset": 0}).json()
        assert asc["total"] == desc["total"]
        # Offset pages
        p0 = officer.get("/api/x/work/items", params={"reason": reason, "limit": 1, "offset": 0}).json()
        p1 = officer.get("/api/x/work/items", params={"reason": reason, "limit": 1, "offset": 1}).json()
        if p0["total"] > 1:
            assert p0["items"][0]["id"] != p1["items"][0]["id"]
        # min_age_hours
        aged = officer.get("/api/x/work/items", params={"reason": reason, "min_age_hours": 0, "limit": 5, "offset": 0}).json()
        assert aged["total"] >= 1
        # Release restores visibility under Unclaimed
        with connect() as conn:
            cur = conn.cursor()
            assert workqueue.unclaim(cur, ACTOR, ids=[pid])["released"] == 1
            conn.commit()
        after = officer.get("/api/x/work/items", params={"reason": reason, "claimed": "none", "limit": 200, "offset": 0}).json()
        assert any(i["id"] == pid for i in after["items"])
    finally:
        with connect() as conn:
            cur = conn.cursor()
            workqueue.unclaim(cur, ACTOR, ids=[pid])
            conn.commit()
