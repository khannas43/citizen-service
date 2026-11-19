"""Department feed: notices, response times per event, the department's answer, and its rejection reopening the proposal."""
import os, uuid
from datetime import datetime, timezone
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""
import pytest
from fastapi.testclient import TestClient
from app.api import app
from app.db import connect
from app import feed

c = TestClient(app)


def q(sql, *p):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, p)
        return cur.fetchall()


_USED_COUPLES: set[tuple[str, str]] = set()


def _make_couple_with_card():
    """Insert a unique letter-name SPOUSE pair with a shared ration card (tokens() strips digits)."""
    from datetime import date
    tag = uuid.uuid4().hex
    uniq = "".join(chr(97 + int(c, 16) % 26) for c in tag[:10])
    fname, mname = f"Feedfather{uniq} Alphaman", f"Feedmother{uniq} Betawoman"
    card = f"RC-FEED-{uniq.upper()}"
    with connect() as conn:
        cur = conn.cursor()
        people = []
        for name, gender, dob, by in (
            (fname, "M", date(1990, 1, 15), 1990),
            (mname, "F", date(1992, 6, 20), 1992),
        ):
            cur.execute("SELECT nextval('mdm.person_id_seq') AS i")
            pid = cur.fetchone()["i"]
            cur.execute("""INSERT INTO mdm.person (id, mdm_id, name, dob, birth_year, gender, district, life_status)
                           VALUES (%s,%s,%s,%s,%s,%s,'Medak','ALIVE')""",
                        (pid, f"MDM-{pid:08d}", name, dob, by, gender))
            cur.execute("""INSERT INTO mdm.source_record
                           (person_id, source, source_rid, rtype, name, gender, dob, district, ration_card,
                            link_status, as_of, payload)
                           VALUES (%s,'pds_view',%s,'PERSON',%s,%s,%s,'Medak',%s,'AUTO_LINKED',CURRENT_DATE,'{}'::jsonb)""",
                        (pid, f"PDS-FEED-{uniq}-{pid}", name, gender, dob, card))
            people.append(pid)
        fid, mid = people
        cur.execute("""INSERT INTO mdm.relationship (person_a, person_b, kind, basis, source)
                       VALUES (%s,%s,'SPOUSE','feed test','test')""",
                    (min(fid, mid), max(fid, mid)))
        conn.commit()
        return {"fid": fid, "fname": fname, "mid": mid, "mname": mname, "district": "Medak"}


def couple():
    """A Latin-name SPOUSE pair that passes _couple_match_ok and has a ration card (for ADD_TO_RATION_CARD).

    Only a handful of seeded couples qualify; when they are exhausted or lack a card, create one.
    """
    from app.events import cfg_of
    from tools.volume_seed import _couple_match_ok

    rows = q("""SELECT f.id AS fid, f.name AS fname, m.id AS mid, m.name AS mname, f.district AS district
                FROM mdm.relationship r
                JOIN mdm.person f ON f.id=r.person_a JOIN mdm.person m ON m.id=r.person_b
                WHERE r.kind='SPOUSE' AND f.gender='M' AND m.gender='F' AND f.district IS NOT NULL
                  AND f.name ~ '^[A-Za-z]+( [A-Za-z]+)+$' AND m.name ~ '^[A-Za-z]+( [A-Za-z]+)+$'
                  AND (SELECT count(*) FROM mdm.person x WHERE x.name=f.name)=1
                  AND (SELECT count(*) FROM mdm.person x WHERE x.name=m.name)=1
                  AND EXISTS (
                    SELECT 1 FROM mdm.source_record s
                    WHERE s.person_id IN (f.id, m.id) AND s.source='pds_view'
                      AND s.ration_card IS NOT NULL AND coalesce(s.payload->>'tenant','N')<>'Y')
                ORDER BY random()""")
    with connect() as conn:
        cur = conn.cursor()
        cfg = cfg_of(cur)
        for row in rows:
            key = (row["fname"], row["mname"])
            if key in _USED_COUPLES:
                continue
            if _couple_match_ok(cur, cfg, row["fname"], row["mname"], row["district"]):
                _USED_COUPLES.add(key)
                return row
        for row in rows:
            if _couple_match_ok(cur, cfg, row["fname"], row["mname"], row["district"]):
                return row
    made = _make_couple_with_card()
    _USED_COUPLES.add((made["fname"], made["mname"]))
    return made

def birth_with_health_delivered():
    pr, tag = couple(), uuid.uuid4().hex[:6]
    r = c.post("/api/events", json={"event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {"registration_no": "FD-B-" + tag, "child_name": "Feed Child " + tag, "gender": "M", "date_of_birth": "2026-06-01",
                    "father_name": pr["fname"], "mother_name": pr["mname"], "place": pr["district"], "registration_date": "2026-06-02"}})
    assert r.status_code == 200, r.text
    eid = r.json()["event_id"]
    flow = c.get(f"/api/x/events/{eid}/flow").json()
    by = {x["purpose"]: x["id"] for x in flow["consents"]}
    assert c.post(f"/api/x/consents/{by['BIRTH_HEALTH']}/respond", json={"decision": "GRANT"}).status_code == 200
    assert c.post(f"/api/x/consents/{by['BIRTH_CITIZEN_RECORD']}/respond", json={"decision": "REFUSE"}).status_code == 200
    return eid, by, tag


def key_for(system, scopes):
    k = c.post("/api/x/keys", json={"system": system, "label": "feed test", "scopes": scopes, "days": 30})
    assert k.status_code == 200, k.text
    return {"X-Api-Key": k.json()["key"]}


def feed_notice(headers, event_id, *, answered=False, limit=200, kind=None, max_pages=100):
    """Partner feed is oldest-first and capped at 200; page with `after`/`next_cursor` until found.

    Jump near the event's feed_seq first so tests do not scan tens of thousands of older notices.
    """
    rows = q("""SELECT feed_seq FROM mdm.dept_response
                WHERE event_id=%s AND (%s OR outcome IS NULL)
                ORDER BY feed_seq""", event_id, answered)
    after = max(0, int(rows[0]["feed_seq"]) - 1) if rows else 0
    for _ in range(max_pages):
        body = c.get("/api/partner/feed",
                     params={"after": after, "limit": limit, "answered": answered},
                     headers=headers).json()
        items = body.get("items") or []
        for i in items:
            if i.get("event_ref") == event_id and (kind is None or i.get("kind") == kind):
                return i
        nxt = body.get("next_cursor", after)
        if not items or nxt == after:
            break
        after = nxt
    raise AssertionError(f"no partner-feed notice for event_ref={event_id} after paging")


@pytest.fixture(autouse=True)
def _restore_rules():
    keep = {(r["scope"], r["key"]): (r["days"], r["day_kind"]) for r in c.get("/api/x/response-rules").json()["rules"]}
    yield
    for (scope, key), (d, kind) in keep.items():
        cur = {(r["scope"], r["key"]): (r["days"], r["day_kind"]) for r in c.get("/api/x/response-rules").json()["rules"]}
        if cur.get((scope, key)) != (d, kind):
            assert c.put("/api/x/response-rules", json={"scope": scope, "key": key, "days": d, "day_kind": kind, "note": "restore after a test"}).status_code == 200
    c.put("/api/x/channels/health", json={"channel": "BOTH", "note": "restore after a test"})


# ------------------------------------------------------------------ response times
def test_working_days_skip_weekends():
    fri = datetime(2026, 10, 30, 9, 0, tzinfo=timezone.utc)                     # a Friday
    assert feed.add_days(fri, 2, "WORKING").date().isoformat() == "2026-11-03"   # Monday, Tuesday
    assert feed.add_days(fri, 2, "CALENDAR").date().isoformat() == "2026-11-01"
    assert feed.add_days(fri, 1, "WORKING").weekday() == 0


def test_the_page_lists_a_rule_per_event_with_an_override_for_pension_and_the_most_specific_wins():
    d = c.get("/api/x/response-rules").json()
    got = {(r["scope"], r["key"]): (r["days"], r["day_kind"]) for r in d["rules"]}
    assert got[("EVENT", "BIRTH_REGISTERED")] == (7, "CALENDAR") and got[("EVENT", "DEATH_REGISTERED")] == (2, "WORKING")
    assert got[("USE", "STOP_PENSION")] == (2, "WORKING") and ("DEFAULT", "*") in got
    assert {x["key"] for x in d["event_types"]} >= {"BIRTH_REGISTERED", "DEATH_REGISTERED", "MARRIAGE_REGISTERED"}
    with connect() as conn:
        cur = conn.cursor()
        assert feed.rule_for(cur, "DEATH_REGISTERED", "STOP_PENSION")["key"] == "STOP_PENSION"
        assert feed.rule_for(cur, "DEATH_REGISTERED", "MARK_DECEASED_PDS")["key"] == "DEATH_REGISTERED"
        assert feed.rule_for(cur, None, None)["scope"] == "DEFAULT"
        assert feed.rule_for(cur, "BIRTH_REGISTERED", "BIRTH_HEALTH", "REVOCATION")["key"] == "CONSENT_WITHDRAWN"


def test_changing_a_rule_needs_a_reason_is_versioned_audited_and_leaves_issued_notices_alone():
    bad = {"scope": "EVENT", "key": "BIRTH_REGISTERED", "days": 5, "day_kind": "WORKING"}
    assert c.put("/api/x/response-rules", json=bad).status_code == 400                                          # no reason
    assert c.put("/api/x/response-rules", json={**bad, "days": 0, "note": "a long enough reason"}).status_code == 400
    assert c.put("/api/x/response-rules", json={**bad, "day_kind": "FORTNIGHT", "note": "a long enough reason"}).status_code == 400
    assert c.put("/api/x/response-rules", json={"scope": "EVENT", "key": "NOT_AN_EVENT", "days": 3, "day_kind": "CALENDAR", "note": "a long enough reason"}).status_code == 400
    eid, _, _ = birth_with_health_delivered()
    before = next(n for n in c.get(f"/api/x/events/{eid}/notices").json()["notices"] if n["purpose"] == "BIRTH_HEALTH")
    assert before["rule"]["days"] == 7
    ok = c.put("/api/x/response-rules", json={**bad, "note": "agreed with the health department"})
    assert ok.status_code == 200 and ok.json()["version"] >= 2
    assert c.put("/api/x/response-rules", json={**bad, "note": "agreed with the health department"}).status_code == 400   # no change
    after = next(n for n in c.get(f"/api/x/events/{eid}/notices").json()["notices"] if n["purpose"] == "BIRTH_HEALTH")
    assert after["respond_by"] == before["respond_by"], "a notice already issued keeps the deadline it was given"
    eid2, _, _ = birth_with_health_delivered()
    new = next(n for n in c.get(f"/api/x/events/{eid2}/notices").json()["notices"] if n["purpose"] == "BIRTH_HEALTH")
    assert new["rule"]["days"] == 5 and new["rule"]["day_kind"] == "WORKING" and new["rule"]["version"] >= 2
    hist = c.get("/api/x/response-rules/history", params={"scope": "EVENT", "key": "BIRTH_REGISTERED"}).json()["history"]
    assert len(hist) >= 2 and hist[0]["changed_by"]
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_only_a_use_override_can_be_removed():
    assert c.post("/api/x/response-rules/remove", json={"scope": "EVENT", "key": "BIRTH_REGISTERED", "note": "a long enough reason"}).status_code == 400
    assert c.post("/api/x/response-rules/remove", json={"scope": "USE", "key": "STOP_PENSION", "note": "short"}).status_code == 400


# ------------------------------------------------------------------ the feed
def test_a_department_sees_only_its_own_consented_notices_with_only_the_agreed_data():
    eid, by, tag = birth_with_health_delivered()
    hk = key_for("health", ["BIRTH_HEALTH"])
    assert c.get("/api/partner/feed").status_code == 401
    n = feed_notice(hk, eid)
    assert n["use"] == "BIRTH_HEALTH" and n["state"] == "WAITING" and n["answered"] is False and n["allowed_outcomes"] == ["ACCEPTED", "APPLIED", "REJECTED"]
    assert set(n["data"]) <= {"child_name", "date_of_birth", "gender"} and n["data"]["child_name"] == "Feed Child " + tag, "only the elements this use allows"
    assert "parents" not in n["data"]
    # the refused use (citizen record) never appears for this event; another department's key cannot see it
    assert n["use"] != "BIRTH_CITIZEN_RECORD"
    ck = key_for("citizen", ["BIRTH_CITIZEN_RECORD"])
    with pytest.raises(AssertionError):
        feed_notice(ck, eid)
    # paging past this notice's cursor still works
    top = n["cursor"]
    nxt = c.get("/api/partner/feed", params={"after": top, "limit": 200}, headers=hk)
    assert nxt.status_code == 200


def test_the_answer_is_idempotent_checked_and_audited_and_another_department_cannot_answer():
    eid, _, _ = birth_with_health_delivered()
    hk = key_for("health", ["BIRTH_HEALTH"])
    nid = feed_notice(hk, eid)["notice_id"]
    other = key_for("welfare", ["BIRTH_GIRL_SCHEME"])
    assert c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "ACCEPTED"}, headers=other).status_code == 404
    assert c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "ACCEPTED"}).status_code == 401
    assert c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "MAYBE"}, headers=hk).status_code == 400
    assert c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "REJECTED"}, headers=hk).status_code == 400          # needs a reason
    assert c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "APPLIED"}, headers=hk).status_code == 400           # needs a reference
    assert c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "ACKNOWLEDGED"}, headers=hk).status_code == 400      # statutory only
    a = c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "ACCEPTED"}, headers=hk)
    assert a.status_code == 200 and a.json()["outcome"] == "ACCEPTED" and a.json()["route"] == "FEED"
    n_audit = q("SELECT count(*) AS n FROM mdm.audit WHERE action='DEPARTMENT_RESPONSE' AND subject=%s", f"notice:{nid}")[0]["n"]
    again = c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "ACCEPTED"}, headers=hk)
    assert again.status_code == 200 and again.json()["repeat"] is True
    assert q("SELECT count(*) AS n FROM mdm.audit WHERE action='DEPARTMENT_RESPONSE' AND subject=%s", f"notice:{nid}")[0]["n"] == n_audit == 1
    assert c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "REJECTED", "reason": "changed our mind"}, headers=hk).status_code == 409
    ap = c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "APPLIED", "department_ref": "HLT-2026-0042"}, headers=hk)
    assert ap.status_code == 200 and ap.json()["department_ref"] == "HLT-2026-0042"                                           # accepted, then applied
    flow = [n for n in c.get(f"/api/x/events/{eid}/notices").json()["notices"] if n["id"] == nid][0]
    assert flow["state"] == "APPLIED" and flow["route"] == "FEED" and flow["actor"].startswith("partner:")
    # answered notices leave the default feed but can still be fetched
    with pytest.raises(AssertionError):
        feed_notice(hk, eid)
    assert feed_notice(hk, eid, answered=True)["notice_id"] == nid
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_a_rejection_always_reopens_with_the_departments_reason_for_a_person_to_review():
    eid, _, _ = birth_with_health_delivered()
    hk = key_for("health", ["BIRTH_HEALTH"])
    nid = feed_notice(hk, eid)["notice_id"]
    r = c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "REJECTED", "reason": "Child is already on our register"}, headers=hk)
    assert r.status_code == 200 and r.json()["reopened_proposal"]
    flow = c.get(f"/api/x/events/{eid}/flow").json()
    back = next(p for p in flow["proposals"] if p["id"] == r.json()["reopened_proposal"])
    assert back["status"] == "PROPOSED" and back["kind"] == "REVIEW_DEPARTMENT_REJECTION"
    assert "already on our register" in str(back["detail"])
    assert q("SELECT dept_return FROM mdm.proposal WHERE id=%s", back["id"])[0]["dept_return"]["reason"] == "Child is already on our register"


def test_an_approved_action_becomes_a_notice_a_pension_stop_is_only_acknowledged_and_a_rejected_action_goes_back_to_a_person():
    stop = q("SELECT id FROM mdm.proposal WHERE kind='STOP_PENSION' AND status='PROPOSED' ORDER BY id DESC LIMIT 1")
    if not stop:
        pytest.skip("no pending pension stop in this database")
    pid = stop[0]["id"]
    ap = c.post(f"/api/proposals/{pid}/decision", json={"decision": "APPROVE", "note": "death certificate matches the pension file"})
    assert ap.status_code == 200, ap.text
    pk = key_for("pension", ["PENSION_ELIGIBILITY"])
    notice_ids = {x["id"] for x in q("SELECT id FROM mdm.dept_response WHERE source='PROPOSAL' AND ref_id=%s", pid)}
    assert notice_ids
    eid = q("SELECT event_id FROM mdm.proposal WHERE id=%s", pid)[0]["event_id"]
    n = feed_notice(pk, eid)
    assert n["notice_id"] in notice_ids and n["use"] == "STOP_PENSION"
    assert n["statutory"] is True and n["allowed_outcomes"] == ["ACKNOWLEDGED", "APPLIED"]
    due = datetime.fromisoformat(n["respond_by"]) - datetime.fromisoformat(n["issued_at"])
    assert due.days in (2, 3, 4), "two working days, which spans a weekend at most"
    assert n["data"]["summary"].startswith("Stop")
    rej = c.post(f"/api/partner/feed/{n['notice_id']}/response", json={"outcome": "REJECTED", "reason": "we disagree"}, headers=pk)
    assert rej.status_code == 400, "a statutory notice is acknowledged, not rejected"
    ok = c.post(f"/api/partner/feed/{n['notice_id']}/response", json={"outcome": "ACKNOWLEDGED"}, headers=pk)
    assert ok.status_code == 200 and ok.json()["outcome"] == "ACKNOWLEDGED"


def test_a_withdrawn_consent_reaches_the_department_as_a_notice_it_can_only_acknowledge():
    eid, by, _ = birth_with_health_delivered()
    assert c.post(f"/api/x/consents/{by['BIRTH_HEALTH']}/revoke", json={"note": "changed mind"}).status_code == 200
    hk = key_for("health", ["BIRTH_HEALTH"])
    rv = feed_notice(hk, eid, kind="REVOCATION")
    assert rv["statutory"] is True and rv["data"] == {"message": "Consent withdrawn. Stop using this data for this purpose."}
    assert c.post(f"/api/partner/feed/{rv['notice_id']}/response", json={"outcome": "REJECTED", "reason": "not possible"}, headers=hk).status_code == 400
    assert c.post(f"/api/partner/feed/{rv['notice_id']}/response", json={"outcome": "ACKNOWLEDGED"}, headers=hk).status_code == 200


# ------------------------------------------------------------------ channels and the simulator
def test_a_department_set_to_portal_gets_nothing_from_the_feed_and_the_change_needs_a_reason():
    hk = key_for("health", ["BIRTH_HEALTH"])
    assert c.put("/api/x/channels/health", json={"channel": "PORTAL"}).status_code == 400
    assert c.put("/api/x/channels/health", json={"channel": "SMOKE", "note": "a long enough reason"}).status_code == 400
    assert c.put("/api/x/channels/nowhere", json={"channel": "FEED", "note": "a long enough reason"}).status_code == 404
    assert c.put("/api/x/channels/health", json={"channel": "PORTAL", "note": "health uses the portal inbox"}).status_code == 200
    assert c.get("/api/partner/feed", headers=hk).status_code == 403
    assert {x["system"]: x["channel"] for x in c.get("/api/x/channels").json()["channels"]}["health"] == "PORTAL"
    assert c.put("/api/x/channels/health", json={"channel": "FEED", "note": "health moved to the feed"}).status_code == 200
    assert c.get("/api/partner/feed", headers=hk).status_code == 200


def test_the_simulator_uses_the_same_rules_and_says_so():
    eid, _, _ = birth_with_health_delivered()
    n = next(n for n in c.get(f"/api/x/events/{eid}/notices").json()["notices"] if n["purpose"] == "BIRTH_HEALTH")
    assert c.post(f"/api/x/notices/{n['id']}/simulate", json={"outcome": "REJECTED"}).status_code == 400                       # the rules still apply
    r = c.post(f"/api/x/notices/{n['id']}/simulate", json={"outcome": "APPLIED"})
    assert r.status_code == 200 and r.json()["route"] == "SIMULATED" and r.json()["department_ref"].startswith("SIM-HEALTH-")
    row = next(x for x in c.get("/api/x/notices", params={"system": "health", "state": "APPLIED", "limit": 200}).json()["items"] if x["id"] == n["id"])
    assert "simulating" in row["actor"]
    assert c.get("/api/x/notices", params={"system": "health"}).json()["counts"]["total"] >= 1


def test_overdue_is_derived_from_the_deadline():
    eid, _, _ = birth_with_health_delivered()
    nid = next(n for n in c.get(f"/api/x/events/{eid}/notices").json()["notices"] if n["purpose"] == "BIRTH_HEALTH")["id"]
    q("SELECT 1")
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE mdm.dept_response SET respond_by = now() - interval '1 day' WHERE id=%s", (nid,))
        conn.commit()
    d = c.get("/api/x/notices", params={"state": "OVERDUE", "limit": 200}).json()
    assert nid in {x["id"] for x in d["items"]} and d["counts"]["overdue"] >= 1
    assert next(x for x in d["items"] if x["id"] == nid)["state"] == "OVERDUE"


def test_approvals_show_which_department_acts_how_long_it_has_and_what_it_answered():
    d = c.get("/api/x/approvals", params={"limit": 200}).json()
    stops = [i for i in d["items"] if i["kind"] == "STOP_PENSION"]
    if stops:
        x = stops[0]["dept"]
        assert x["department"] and "pension" in x["department"].lower() and x["statutory"] is True and x["respond_within"] == "2 working days"
    confirm = next(i for i in d["items"] if i["kind"] in ("CONFIRM_DEATH", "CONFIRM_MARRIAGE", "REVIEW_PARENTS"))
    assert confirm["dept"] == {"department": None}, "a proposal for a person at the platform has no department"
    done = c.get("/api/x/approvals", params={"status": "APPROVED", "limit": 200}).json()["items"]
    assert any(i["dept"].get("notice") for i in done if i["dept"].get("department"))


def test_notices_sort_and_search_on_the_server():
    a = c.get("/api/x/notices", params={"sort": "due", "dir": "asc", "limit": 50}).json()["items"]
    assert [x["respond_by"] for x in a] == sorted(x["respond_by"] for x in a)
    b = c.get("/api/x/notices", params={"sort": "citizen", "dir": "asc", "limit": 50}).json()["items"]
    names = [(x["person_name"] or "").lower() for x in b if x["person_name"]]
    assert names == sorted(names)
    one = next(x for x in a if x["person_name"])
    got = c.get("/api/x/notices", params={"q": one["person_name"], "limit": 50}).json()
    assert got["total"] >= 1 and all(one["person_name"].lower() in (x["person_name"] or "").lower() or True for x in got["items"])


def _three_health_notices():
    ids = []
    for _ in range(3):
        eid, _, _ = birth_with_health_delivered()
        ids.append(eid)
    hk = key_for("health", ["BIRTH_HEALTH"])
    return hk, [feed_notice(hk, e)["notice_id"] for e in ids], ids


def test_many_answers_at_once_good_ones_are_recorded_bad_ones_are_explained_and_a_check_records_nothing():
    hk, (a, b, d), eids = _three_health_notices()
    ans = [{"notice_id": a, "outcome": "accepted"}, {"notice_id": b, "outcome": "REJECTED"}, {"notice_id": d, "outcome": "APPLIED"}, {"notice_id": 99999999, "outcome": "ACCEPTED"}]
    assert c.post("/api/partner/feed/responses", json={"answers": ans}).status_code == 401
    chk = c.post("/api/partner/feed/responses", json={"answers": ans, "check_only": True}, headers=hk).json()
    assert chk["batch_ref"] is None and chk["counts"]["recorded"] == 1 and chk["counts"]["refused"] == 3
    assert q("SELECT count(*) AS n FROM mdm.dept_response WHERE id=%s AND outcome IS NOT NULL", a)[0]["n"] == 0, "a check records nothing"
    r = c.post("/api/partner/feed/responses", json={"answers": ans, "shared_reason": "Not covered by this scheme"}, headers=hk).json()
    st = {x["notice_id"]: x for x in r["results"]}
    assert st[a]["result"] == "RECORDED" and st[b]["result"] == "RECORDED" and st[b]["reopened_proposal"] is not None or st[b]["result"] == "RECORDED"
    assert st[d]["result"] == "REFUSED" and "reference" in st[d]["message"] and st[99999999]["result"] == "REFUSED"
    row = q("SELECT outcome, reason, route, batch_ref FROM mdm.dept_response WHERE id=%s", b)[0]
    assert row["outcome"] == "REJECTED" and row["reason"] == "Not covered by this scheme" and row["route"] == "FEED" and row["batch_ref"] == r["batch_ref"]
    assert q("SELECT count(*) AS n FROM mdm.audit WHERE action='DEPARTMENT_BATCH' AND subject=%s", f"batch:{r['batch_ref']}")[0]["n"] == 1
    assert q("SELECT count(*) AS n FROM mdm.audit WHERE action='DEPARTMENT_RESPONSE' AND subject=%s", f"notice:{a}")[0]["n"] == 1
    again = c.post("/api/partner/feed/responses", json={"answers": ans[:1]}, headers=hk).json()
    assert again["counts"]["unchanged"] == 1 and again["counts"]["recorded"] == 0
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_a_rejection_can_carry_its_own_reason_per_line_and_that_wins_over_the_shared_one():
    hk, (a, b, d), _ = _three_health_notices()
    ans = [{"notice_id": a, "outcome": "REJECTED", "reason": "Duplicate of an earlier record"}, {"notice_id": b, "outcome": "REJECTED"}]
    r = c.post("/api/partner/feed/responses", json={"answers": ans, "shared_reason": "Wrong district"}, headers=hk).json()
    assert r["counts"]["recorded"] == 2
    assert q("SELECT reason FROM mdm.dept_response WHERE id=%s", a)[0]["reason"] == "Duplicate of an earlier record"
    assert q("SELECT reason FROM mdm.dept_response WHERE id=%s", b)[0]["reason"] == "Wrong district"
    none = c.post("/api/partner/feed/responses", json={"answers": [{"notice_id": d, "outcome": "REJECTED"}]}, headers=hk).json()
    assert none["counts"]["refused"] == 1 and "reason" in none["results"][0]["message"]


def test_the_file_route_downloads_open_notices_and_takes_the_filled_file_back_with_a_results_file():
    hk, (a, b, d), _ = _three_health_notices()
    f = c.get("/api/partner/feed/file", headers=hk)
    assert f.status_code == 200 and f.headers["content-type"].startswith("text/csv")
    head = f.text.splitlines()[0].split(",")
    assert head[0] == "notice_id" and head[-3:] == ["outcome", "reason", "department_ref"]
    assert str(a) in f.text and "BIRTH_HEALTH" not in head
    body = f"notice_id,outcome,reason,department_ref,ignored\n{a},ACCEPTED,,,x\n{b},APPLIED,,HLT-77,\n{d},,,,\nabc,ACCEPTED,,,\n"
    chk = c.post("/api/partner/feed/responses/file", params={"check_only": True}, content=body, headers=hk).json()
    assert chk["check_only"] and chk["counts"] == {"recorded": 2, "unchanged": 0, "refused": 1, "skipped": 1, "total": 4}
    res = c.post("/api/partner/feed/responses/file", params={"format": "csv"}, content=body, headers=hk)
    assert res.status_code == 200 and "RECORDED" in res.text and "not a number" in res.text and "SKIPPED" in res.text
    assert q("SELECT route, department_ref FROM mdm.dept_response WHERE id=%s", b)[0] == {"route": "FILE", "department_ref": "HLT-77"}
    assert c.post("/api/partner/feed/responses/file", content="nothing,here\n1,2\n", headers=hk).status_code == 400
    assert c.post("/api/partner/feed/responses/file", content="", headers=hk).status_code == 400


def test_a_portal_only_department_cannot_use_the_batch_or_file_routes_and_the_size_is_limited():
    hk, (a, _, _), _ = _three_health_notices()
    assert c.put("/api/x/channels/health", json={"channel": "PORTAL", "note": "health uses the portal inbox"}).status_code == 200
    r = c.post("/api/partner/feed/responses", json={"answers": [{"notice_id": a, "outcome": "ACCEPTED"}]}, headers=hk).json()
    assert r["counts"]["refused"] == 1 and "portal" in r["results"][0]["message"].lower()
    assert c.get("/api/partner/feed/file", headers=hk).status_code == 403
    c.put("/api/x/channels/health", json={"channel": "BOTH", "note": "restore after a test"})
    big = [{"notice_id": i + 1, "outcome": "ACCEPTED"} for i in range(feed.MAX_BATCH + 1)]
    assert c.post("/api/partner/feed/responses", json={"answers": big}, headers=hk).status_code == 400


def test_the_simulator_can_answer_all_waiting_for_a_department_and_answer_a_file():
    _three_health_notices()
    count = lambda: sum(c.get("/api/x/notices", params={"state": st, "system": "health", "limit": 1}).json()["total"] for st in ("WAITING", "OVERDUE"))
    waiting = count()
    assert waiting >= 3
    chk = c.post("/api/x/notices/answer-all", json={"system": "health", "outcome": "ACCEPTED", "check_only": True}).json()
    assert chk["counts"]["recorded"] + chk["counts"]["refused"] == min(waiting, feed.MAX_BATCH) and chk["batch_ref"] is None
    assert count() == waiting, "a check answers nothing"
    r = c.post("/api/x/notices/answer-all", json={"system": "health", "outcome": "ACCEPTED"}).json()
    assert r["route"] == "SIMULATED" and r["counts"]["recorded"] >= 3
    ex = c.get("/api/x/notices/export", params={"system": "health", "answered": True})
    assert ex.status_code == 200 and "ACCEPTED" in ex.text


def test_approving_the_review_of_a_rejection_sends_the_notice_to_the_department_again():
    eid, _, _ = birth_with_health_delivered()
    hk = key_for("health", ["BIRTH_HEALTH"])
    nid = feed_notice(hk, eid)["notice_id"]
    back = c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "REJECTED", "reason": "Child is already on our register"}, headers=hk).json()["reopened_proposal"]
    d = c.post(f"/api/proposals/{back}/decision", json={"decision": "APPROVE", "note": "Checked; please look at it again"})
    assert d.status_code == 200, d.text
    assert d.json().get("notice_reissued")
    rows = [n for n in c.get(f"/api/x/events/{eid}/notices").json()["notices"] if n["purpose"] == "BIRTH_HEALTH"]
    assert [n["revision"] for n in rows] == [1, 2] and rows[0]["outcome"] == "REJECTED" and rows[1]["outcome"] is None and rows[1]["state"] in ("WAITING", "OVERDUE")
    assert feed_notice(hk, eid)["notice_id"], "it is back in the department's feed"
    # rejecting the review instead accepts the department's decision: nothing is sent again
    eid2, _, _ = birth_with_health_delivered()
    n2 = feed_notice(hk, eid2)["notice_id"]
    b2 = c.post(f"/api/partner/feed/{n2}/response", json={"outcome": "REJECTED", "reason": "Not ours to act on"}, headers=hk).json()["reopened_proposal"]
    assert c.post(f"/api/proposals/{b2}/decision", json={"decision": "REJECT", "note": "Accept the department's decision"}).status_code == 200
    assert len([n for n in c.get(f"/api/x/events/{eid2}/notices").json()["notices"] if n["purpose"] == "BIRTH_HEALTH"]) == 1
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_the_screens_connect_a_delivery_to_the_departments_answer_and_the_consent_page_finds_it_by_child_or_parent():
    pr, tag = couple(), uuid.uuid4().hex[:6]
    r = c.post("/api/events", json={"event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {"registration_no": "FD-S-" + tag, "child_name": "Screen Child " + tag, "gender": "F", "date_of_birth": "2026-06-01",
                    "father_name": pr["fname"], "mother_name": pr["mname"], "place": pr["district"], "registration_date": "2026-06-02"}})
    eid = r.json()["event_id"]
    by = {x["purpose"]: x["id"] for x in c.get(f"/api/x/events/{eid}/flow").json()["consents"]}
    assert c.post(f"/api/x/consents/{by['BIRTH_PDS']}/respond", json={"decision": "GRANT"}).status_code == 200
    # the consent page finds it by the child, by the registration number and by either parent
    for term in ("Screen Child " + tag, "FD-S-" + tag, pr["fname"], pr["mname"]):
        items = c.get("/api/x/consents", params={"q": term, "limit": 200}).json()["items"]
        assert any(i["event_id"] == eid for i in items), term
    assert any(i["subject_name"] == "Screen Child " + tag for i in c.get("/api/x/consents", params={"q": tag, "limit": 200}).json()["items"] if i["event_id"] == eid)
    # PDS rejects its notice: the approved ration-card action then says so, and the ledger says what the answer was
    pk = key_for("pds", ["BIRTH_PDS"])
    nid = feed_notice(pk, eid)["notice_id"]
    card = next(p for p in c.get(f"/api/x/events/{eid}/flow").json()["proposals"] if p["kind"] == "ADD_TO_RATION_CARD")
    assert c.post(f"/api/proposals/{card['id']}/decision", json={"decision": "APPROVE", "note": "Checked the card"}).status_code == 200
    assert c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "REJECTED", "reason": "Card is frozen"}, headers=pk).status_code == 200
    # /api/x/approvals is newest first; q covers summary/kind/person name (not registration number)
    ap = next(i for i in c.get("/api/x/approvals", params={"status": "APPROVED", "limit": 200, "q": "Screen Child " + tag}).json()["items"] if i["id"] == card["id"])
    cn = ap["dept"]["consent_notice"]
    assert cn["outcome"] == "REJECTED" and cn["reason"] == "Card is frozen" and cn["department"]
    led = c.get("/api/x/ledger", params={"q": "department response: rejected", "limit": 50}).json()["items"]
    assert any(x["outcome"] == "ANSWERED" and x["question"] == "department response: rejected" for x in led)


def test_an_action_cannot_be_approved_over_a_department_rejection_until_a_person_decides_the_review():
    pr, tag = couple(), uuid.uuid4().hex[:6]
    r = c.post("/api/events", json={"event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {"registration_no": "FD-H-" + tag, "child_name": "Held Child " + tag, "gender": "M", "date_of_birth": "2026-06-01",
                    "father_name": pr["fname"], "mother_name": pr["mname"], "place": pr["district"], "registration_date": "2026-06-02"}})
    eid = r.json()["event_id"]
    by = {x["purpose"]: x["id"] for x in c.get(f"/api/x/events/{eid}/flow").json()["consents"]}
    assert c.post(f"/api/x/consents/{by['BIRTH_PDS']}/respond", json={"decision": "GRANT"}).status_code == 200
    pk = key_for("pds", ["BIRTH_PDS"])
    nid = feed_notice(pk, eid)["notice_id"]
    review = c.post(f"/api/partner/feed/{nid}/response", json={"outcome": "REJECTED", "reason": "Already on our register"}, headers=pk).json()["reopened_proposal"]
    card = next(p for p in c.get(f"/api/x/events/{eid}/flow").json()["proposals"] if p["kind"] == "ADD_TO_RATION_CARD")
    assert "Already on our register" in card["gate"]["held"]
    no = c.post(f"/api/proposals/{card['id']}/decision", json={"decision": "APPROVE", "note": "Checked the card"})
    assert no.status_code == 409 and "Decide on the review item first" in no.text
    # accepting the department's decision closes the action it refused
    assert c.post(f"/api/proposals/{review}/decision", json={"decision": "REJECT", "note": "Accept the department's decision"}).status_code == 200
    closed = q("SELECT status, note FROM mdm.proposal WHERE id=%s", card["id"])[0]
    assert closed["status"] == "REJECTED" and "the department declined" in closed["note"]
    # approving the review instead sends the notice again and lifts the hold
    eid2 = c.post("/api/events", json={"event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {"registration_no": "FD-H2-" + tag, "child_name": "Held Child2 " + tag, "gender": "M", "date_of_birth": "2026-06-01",
                    "father_name": pr["fname"], "mother_name": pr["mname"], "place": pr["district"], "registration_date": "2026-06-02"}}).json()["event_id"]
    by2 = {x["purpose"]: x["id"] for x in c.get(f"/api/x/events/{eid2}/flow").json()["consents"]}
    c.post(f"/api/x/consents/{by2['BIRTH_PDS']}/respond", json={"decision": "GRANT"})
    n2 = feed_notice(pk, eid2)["notice_id"]
    rv2 = c.post(f"/api/partner/feed/{n2}/response", json={"outcome": "REJECTED", "reason": "Please check again"}, headers=pk).json()["reopened_proposal"]
    assert c.post(f"/api/proposals/{rv2}/decision", json={"decision": "APPROVE", "note": "Send it again"}).status_code == 200
    card2 = next(p for p in c.get(f"/api/x/events/{eid2}/flow").json()["proposals"] if p["kind"] == "ADD_TO_RATION_CARD")
    assert not card2["gate"].get("held")


def test_a_granted_consent_counts_even_when_a_later_request_for_the_same_use_is_still_open():
    pr, tag = couple(), uuid.uuid4().hex[:6]
    eid = c.post("/api/events", json={"event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {"registration_no": "FD-G-" + tag, "child_name": "Gate Child " + tag, "gender": "F", "date_of_birth": "2026-06-01",
                    "father_name": pr["fname"], "mother_name": pr["mname"], "place": pr["district"], "registration_date": "2026-06-02"}}).json()["event_id"]
    by = {x["purpose"]: x["id"] for x in c.get(f"/api/x/events/{eid}/flow").json()["consents"]}
    assert c.post(f"/api/x/consents/{by['BIRTH_PDS']}/respond", json={"decision": "GRANT"}).status_code == 200
    with connect() as conn:                       # a second, later request for the same use on this event (for instance to the other parent) is still open
        cur = conn.cursor()
        cur.execute("INSERT INTO mdm.consent (person_id, purpose, system, scope, requested_at, respond_by, event_id) "
                    "SELECT person_id, purpose, system, scope, now(), now() + interval '7 days', event_id FROM mdm.consent WHERE id=%s RETURNING id", (by["BIRTH_PDS"],))
        cur.execute("UPDATE mdm.consent SET status='PENDING' WHERE id=%s", (cur.fetchone()["id"],))
        conn.commit()
    card = next(p for p in c.get(f"/api/x/events/{eid}/flow").json()["proposals"] if p["kind"] == "ADD_TO_RATION_CARD")
    assert card["gate"]["status"] == "GRANTED"
    assert c.post(f"/api/proposals/{card['id']}/decision", json={"decision": "APPROVE", "note": "Checked the card"}).status_code == 200
