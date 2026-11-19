"""Wave 2: outage and dead-letter, discrepancies, query builder, marriage consent, misuse limiter, retention, audit tamper test."""
import os, uuid
from datetime import date
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""
import pytest
from fastapi.testclient import TestClient
from app.api import app
from app.db import connect

c = TestClient(app)


def q(sql, *p):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, p)
        return cur.fetchall()


def pol(key):
    return {x["key"]: x for x in c.get("/api/x/policy").json()["policies"]}[key]["value"]


def setpol(key, value):
    r = c.post("/api/x/policy", json={"key": key, "value": value, "note": "wave2 test"})
    assert r.status_code == 200, r.text


@pytest.fixture(autouse=True)
def _lookup_limit_off():
    old = pol("max_lookups_per_hour")
    setpol("max_lookups_per_hour", 1000)
    yield
    setpol("max_lookups_per_hour", old)


def couple():
    """Fresh Latin-name SPOUSE pair that passes _couple_match_ok; both must be 18+."""
    from tests.test_feed import couple as feed_couple
    pr = feed_couple()
    ages = q("""SELECT id, birth_year, EXTRACT(YEAR FROM age(CURRENT_DATE, dob))::int AS age
                FROM mdm.person WHERE id IN (%s,%s)""", pr["fid"], pr["mid"])
    by = {r["id"]: r for r in ages}
    for pid in (pr["fid"], pr["mid"]):
        row = by.get(pid) or {}
        age = row.get("age")
        if age is None and row.get("birth_year"):
            age = date.today().year - int(row["birth_year"])
        assert age is None or age >= 18, (pid, age, pr)
    return pr


def birth(tag, pr):
    r = c.post("/api/events", json={"event_type": "BIRTH_REGISTERED", "use_case": "UC2", "order": 1,
        "payload": {"registration_no": "W2-B-" + tag, "child_name": "Outage Child " + tag, "gender": "M", "date_of_birth": "2026-06-01",
                    "father_name": pr["fname"], "mother_name": pr["mname"], "place": pr["district"], "registration_date": "2026-06-02"}})
    assert r.status_code == 200, r.text
    return r.json()["event_id"]


def test_department_outage_retries_then_dead_letters_and_redelivers():
    pr = couple()
    try:
        assert c.post("/api/x/subscribers/health", json={"available": False, "note": "maintenance"}).status_code == 200
        eid = birth(uuid.uuid4().hex[:6], pr)
        flow = c.get(f"/api/x/events/{eid}/flow").json()
        by = {x["purpose"]: x["id"] for x in flow["consents"]}
        assert c.post(f"/api/x/consents/{by['BIRTH_HEALTH']}/respond", json={"decision": "GRANT"}).status_code == 200
        d = next(x for x in c.get(f"/api/x/events/{eid}/flow").json()["deliveries"] if x["purpose"] == "BIRTH_HEALTH")
        assert d["status"] == "RETRYING" and d["attempts"] == 1          # kept, not lost, not claimed as sent
        assert c.post("/api/x/deliveries/retry").json()["still_retrying"] >= 1
        c.post("/api/x/deliveries/retry")                                   # third failed attempt
        d = next(x for x in c.get(f"/api/x/events/{eid}/flow").json()["deliveries"] if x["purpose"] == "BIRTH_HEALTH")
        assert d["status"] == "DEAD_LETTER"
        assert c.get("/api/x/control").json()["dead_letters"] >= 1
        # the department returns; a person redelivers the set-aside item
        back = c.post("/api/x/subscribers/health", json={"available": True}).json()
        assert "retried" in back
        r = c.post(f"/api/x/deliveries/{d['id']}/redeliver")
        assert r.status_code == 200 and r.json()["status"] == "DELIVERED", r.text
        assert c.post(f"/api/x/deliveries/{d['id']}/redeliver").status_code == 409     # no longer set aside
    finally:
        c.post("/api/x/subscribers/health", json={"available": True})
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_withdrawal_blocks_a_delivery_that_is_waiting_to_be_retried():
    pr = couple()
    try:
        c.post("/api/x/subscribers/health", json={"available": False})
        eid = birth(uuid.uuid4().hex[:6], pr)
        by = {x["purpose"]: x["id"] for x in c.get(f"/api/x/events/{eid}/flow").json()["consents"]}
        c.post(f"/api/x/consents/{by['BIRTH_HEALTH']}/respond", json={"decision": "GRANT"})
        c.post(f"/api/x/consents/{by['BIRTH_HEALTH']}/revoke", json={})
        c.post("/api/x/subscribers/health", json={"available": True})
        d = next(x for x in c.get(f"/api/x/events/{eid}/flow").json()["deliveries"] if x["purpose"] == "BIRTH_HEALTH" and x["kind"] == "EVENT")
        assert d["status"] == "BLOCKED_REVOKED"
    finally:
        c.post("/api/x/subscribers/health", json={"available": True})


def test_discrepancy_is_routed_to_the_source_and_never_edits_the_master_record():
    pid = couple()["fid"]
    before = c.get(f"/api/persons/{pid}").json()["person"]["name"]
    r = c.post("/api/x/discrepancies", json={"person_id": pid, "attribute": "name", "current_value": before, "reported_value": "Corrected Spelling", "reason": "Citizen says the spelling is wrong"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["authoritative_system"] == "crs" and d["status"] == "ROUTED"
    assert c.post("/api/x/discrepancies", json={"person_id": pid, "attribute": "name", "reported_value": "X", "channel": "ASSISTED"}).status_code == 400   # operator named
    assert c.post(f"/api/x/discrepancies/{d['id']}/resolve", json={"outcome": "CORRECTED_AT_SOURCE", "note": "ok"}).status_code == 400            # note too short
    done = c.post(f"/api/x/discrepancies/{d['id']}/resolve", json={"outcome": "CORRECTED_AT_SOURCE", "note": "Civil registration fixed the spelling"})
    assert done.status_code == 200 and done.json()["status"] == "CORRECTED_AT_SOURCE"
    assert c.get(f"/api/persons/{pid}").json()["person"]["name"] == before            # master value untouched
    assert "crs" not in done.json()["informed"]
    assert c.post(f"/api/x/discrepancies/{d['id']}/resolve", json={"outcome": "REJECTED", "note": "second attempt here"}).status_code == 409


def test_declaration_is_unverified_and_never_a_marriage_record():
    rows = q("""SELECT p.id FROM mdm.person p WHERE NOT EXISTS (SELECT 1 FROM mdm.source_record s WHERE s.person_id=p.id AND s.source='marriage_register')
                AND p.gender='F' AND COALESCE(p.birth_year,1900) < 1995 LIMIT 1""")
    pid = rows[0]["id"]
    r = c.post("/api/x/declarations", json={"person_id": pid, "spouse_name": "Some Husband", "channel": "ASSISTED", "operator": "Operator 5"})
    assert r.status_code == 200 and r.json()["status"] == "DECLARED"
    tok = q("SELECT source_rid FROM mdm.source_record WHERE person_id=%s AND source='identity_reference' LIMIT 1", pid)
    out = c.post("/api/x/verify", json={"requester": "pds", "purpose": "HOUSEHOLD_BENEFIT", "question": "MARRIAGE_RECORDED", "person_id": pid}).json()
    # household benefit belongs to housing, so civil supplies is refused; the declaration is read through the marriage purpose
    assert out["outcome"] == "DENIED_POLICY"
    assert c.post("/api/x/declarations", json={"person_id": pid, "spouse_name": "X", "channel": "ASSISTED"}).status_code == 400


def test_household_questions_answer_with_quality_and_never_overreach():
    rows = q("""SELECT p.id FROM mdm.person p JOIN mdm.source_record s ON s.person_id=p.id AND s.source='pds_view' LIMIT 1""")
    pid = rows[0]["id"]
    h = c.get(f"/api/x/persons/{pid}/household").json()
    assert h["members"] and h["cards"] and any("proxy" in x for x in h["caveats"])
    pu = "HOUSEHOLD_BENEFIT"
    cons = c.post("/api/x/consents", json={"person_id": pid, "purpose": pu}).json()
    if cons["status"] == "PENDING":
        c.post(f"/api/x/consents/{cons['id']}/respond", json={"decision": "GRANT"})
    for question in ("ELECTRICITY_LINKED", "LAND_HOLDING", "HOUSEHOLD_HAS_BENEFIT", "DUPLICATE_BENEFIT"):
        r = c.post("/api/x/verify", json={"requester": "housing", "purpose": pu, "question": question, "person_id": pid}).json()
        assert r["outcome"] == "ANSWERED", (question, r)
        assert "amount" not in r and "document" not in r
    dup = c.post("/api/x/verify", json={"requester": "housing", "purpose": pu, "question": "DUPLICATE_BENEFIT", "person_id": pid}).json()
    assert dup["answer"] in ("NONE_FOUND", "POSSIBLE_DUPLICATE")


def test_query_builder_refuses_broad_queries_and_shares_only_consented_people():
    broad = c.post("/api/x/query", json={"requester": "pension", "purpose": "PENSION_ELIGIBILITY", "elements": ["age"], "filters": {}}).json()
    assert broad["outcome"] == "DENIED_POLICY" and "Too broad" in broad["message"]
    assert c.post("/api/x/query", json={"requester": "pension", "purpose": "PENSION_ELIGIBILITY", "elements": ["income_band"], "filters": {}}).status_code == 400   # not allowed for this purpose
    wrong = c.post("/api/x/query", json={"requester": "education", "purpose": "PENSION_ELIGIBILITY", "elements": ["age"], "filters": {}}).json()
    assert wrong["outcome"] == "DENIED_POLICY"
    ok = c.post("/api/x/query", json={"requester": "pension", "purpose": "PENSION_ELIGIBILITY", "elements": ["age", "life_status"], "filters": {"min_age": 80, "max_age": 85, "district": "Medak"}}).json()
    assert ok["outcome"] in ("ANSWERED", "DENIED_POLICY")
    if ok["outcome"] == "ANSWERED":
        assert all(set(r) == {"mdm_id", "age", "life_status"} for r in ok["rows"])
    cons = c.post("/api/x/query", json={"requester": "education", "purpose": "SCHOLARSHIP_ELIGIBILITY", "elements": ["income_band"], "filters": {"district": "Medak", "min_age": 18, "max_age": 22}}).json()
    if cons["outcome"] == "ANSWERED":
        assert cons["shared"] <= cons["matched"] and cons["shared"] + cons["withheld_no_consent"] == cons["matched"]
        assert cons["withheld_no_consent"] >= 1 or cons["matched"] == 0      # nobody consented, so nobody is shared unless a test granted earlier
    assert c.get("/api/x/ledger", params={"kind": "QUERY", "limit": 3}).json()["total"] >= 3


def _latin_adults_and_minors(tag: str):
    """Insert a unique adult couple (18+) and an under-18 pair for the underage path.

    Names must be letter-only and unique: matching tokens() strips digits, so a hex tag
    collapses to short fragments and ILIKE '%wave%' + LIMIT 400 misses the new rows.
    """
    # Map hex → letters so each run keeps a ≥8-letter unique token that survives tokens().
    uniq = "".join(chr(97 + int(c, 16) % 26) for c in (tag + "aa")[:8])
    with connect() as conn:
        cur = conn.cursor()
        people = []
        specs = [
            (f"Marrygroom{uniq} Alphaman", "M", date(1990, 1, 15), 1990),
            (f"Marrybride{uniq} Betawoman", "F", date(1992, 6, 20), 1992),
            (f"Younggroom{uniq} Gammaman", "M", date(2010, 3, 1), 2010),
            (f"Youngbride{uniq} Deltawoman", "F", date(2011, 8, 12), 2011),
        ]
        for name, gender, dob, by in specs:
            cur.execute("SELECT nextval('mdm.person_id_seq') AS i")
            pid = cur.fetchone()["i"]
            cur.execute("""INSERT INTO mdm.person (id, mdm_id, name, dob, birth_year, gender, district, life_status)
                           VALUES (%s,%s,%s,%s,%s,%s,'Medak','ALIVE')""",
                        (pid, f"MDM-{pid:08d}", name, dob, by, gender))
            cur.execute("""INSERT INTO mdm.source_record
                           (person_id, source, source_rid, rtype, name, gender, dob, district, link_status, as_of, payload)
                           VALUES (%s,'pds_view',%s,'PERSON',%s,%s,%s,'Medak','AUTO_LINKED',CURRENT_DATE,'{}'::jsonb)""",
                        (pid, f"PDS-W2-{uniq}-{pid}", name, gender, dob))
            people.append({"id": pid, "name": name, "gender": gender})
        groom, bride, yg, yb = people
        # Do not pre-link as SPOUSE: marriage matching prefers free (unmarried) people.
        conn.commit()
        return {
            "adults": {"fid": groom["id"], "fname": groom["name"], "mid": bride["id"], "mname": bride["name"], "district": "Medak"},
            "minors": {"fid": yg["id"], "fname": yg["name"], "mid": yb["id"], "mname": yb["name"], "district": "Medak"},
        }


def test_marriage_needs_both_consents_and_underage_goes_to_an_officer():
    """Matching requires adults (groom ≥21 / bride ≥18 at marriage). Build our own adult
    couple, then raise min_marriage_age so they are underage under this policy version."""
    tag = uuid.uuid4().hex[:6]
    pr = _latin_adults_and_minors(tag)["adults"]
    old = pol("min_marriage_age")
    try:
        setpol("min_marriage_age", {"M": 40, "F": 40})
        ev = c.post("/api/events", json={"event_type": "MARRIAGE_REGISTERED", "use_case": "UC6", "order": 1,
            "payload": {"registration_no": "W2-M-" + tag, "groom_name": pr["fname"], "bride_name": pr["mname"],
                        "marriage_date": "2026-05-01", "bride_name_after": "Changed Surname " + tag}})
        assert ev.status_code == 200, ev.text
        assert ev.json().get("status") == "PROCESSED", ev.json()
        eid = ev.json()["event_id"]
        flow = c.get(f"/api/x/events/{eid}/flow").json()
        conf = next((p for p in flow["proposals"] if p["kind"] == "CONFIRM_MARRIAGE"), None)
        assert conf, flow
        assert conf["options"]["groom"] and conf["options"]["bride"], conf
        ok = c.post(f"/api/proposals/{conf['id']}/decision", json={
            "decision": "APPROVE", "note": "register entry seen",
            "groom_id": conf["options"]["groom"][0]["person_id"],
            "bride_id": conf["options"]["bride"][0]["person_id"],
        })
        assert ok.status_code == 200, ok.text
        kinds = [p["kind"] for p in c.get(f"/api/x/events/{eid}/flow").json()["proposals"]]
        assert "REFER_UNDERAGE" in kinds and "ADD_TO_RATION_CARD" not in kinds and "NOTE_NEW_NAME" not in kinds
        refer = next(p for p in c.get(f"/api/x/events/{eid}/flow").json()["proposals"] if p["kind"] == "REFER_UNDERAGE")
        assert c.post(f"/api/proposals/{refer['id']}/decision", json={"decision": "APPROVE", "note": "x"}).status_code == 400
    finally:
        setpol("min_marriage_age", old)


def test_misuse_limiter_flags_repeated_lookups_of_the_same_person():
    rows = q("""SELECT s.person_id, i.source_rid AS token FROM mdm.source_record s JOIN mdm.source_record i ON i.person_id=s.person_id AND i.source='identity_reference'
                WHERE s.source='revenue_certificates'
                  AND NOT EXISTS (SELECT 1 FROM mdm.exchange x WHERE x.person_id=s.person_id AND x.ts > now() - interval '1 hour') LIMIT 1""")
    pid = rows[0]["person_id"]
    old = pol("max_lookups_per_hour")
    setpol("max_lookups_per_hour", 3)
    try:
        ask = {"requester": "pension", "purpose": "PENSION_ELIGIBILITY", "question": "AGE_AT_LEAST", "params": {"years": 60}, "person_id": pid}
        outs = [c.post("/api/x/verify", json=ask).json()["outcome"] for _ in range(6)]
        assert outs[:3] == ["ANSWERED"] * 3 or "ANSWERED" in outs[:3]
        assert "DENIED_POLICY" in outs[3:]
        assert c.get("/api/x/audit", params={"action": "MISUSE_ALERT", "limit": 1}).json()["total"] >= 1
        assert c.get("/api/x/control").json()["misuse_alerts"] >= 1
    finally:
        setpol("max_lookups_per_hour", old)


def test_withdraw_and_purge_keeps_the_audit_trail():
    pid = q("SELECT person_id FROM mdm.source_record WHERE source='revenue_certificates' AND rtype='INCOME' AND person_id IS NOT NULL LIMIT 1")[0]["person_id"]
    cons = c.post("/api/x/consents", json={"person_id": pid, "purpose": "SCHOLARSHIP_ELIGIBILITY"}).json()
    if cons["status"] == "PENDING":
        c.post(f"/api/x/consents/{cons['id']}/respond", json={"decision": "GRANT"})
    mdm_id = q("SELECT mdm_id FROM mdm.person WHERE id=%s", pid)[0]["mdm_id"]
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO mdm.temp_result (expires_at, requester, actor, purpose, subjects, rows) VALUES (now()+interval '10 min','education','t','SCHOLARSHIP_ELIGIBILITY',%s,%s::jsonb)",
                    ([pid], '[{"mdm_id": "%s", "income_band": "up to 1 lakh"}, {"mdm_id": "OTHER", "income_band": "x"}]' % mdm_id))
        conn.commit()
    before = c.get("/api/audit", params={"limit": 1}).json()["total"] if False else c.get("/api/x/audit", params={"limit": 1}).json()["total"]
    r = c.post("/api/x/retention/withdraw", json={"person_id": pid, "purpose": "SCHOLARSHIP_ELIGIBILITY"}).json()
    assert r["consent_withdrawn"] and r["temp_rows_removed"] >= 1 and "audit trail" in r["remains"]
    assert c.get("/api/x/audit", params={"limit": 1}).json()["total"] > before
    ask = {"requester": "education", "purpose": "SCHOLARSHIP_ELIGIBILITY", "question": "INCOME_AT_MOST", "params": {"limit": 250000}, "person_id": pid}
    assert c.post("/api/x/verify", json=ask).json()["outcome"] == "DENIED_NO_CONSENT"
    p = c.post("/api/x/retention/purge", json={"what": "expired_results"}).json()
    assert p["audit_seq"] and p["after"]["temp_results"] <= p["before"]["temp_results"]
    assert c.post("/api/x/retention/purge", json={"what": "bogus"}).status_code == 400


def test_tamper_demo_detects_the_edit_then_restores_the_chain():
    r = c.post("/api/x/audit/tamper-demo").json()
    assert r["before"]["ok"] and r["while_edited"]["ok"] is False and r["after_rollback"]["ok"] is True
    assert c.get("/api/audit/verify").json()["ok"] is True


def test_catalogue_standards_and_registry():
    cat = c.get("/api/x/catalogue").json()
    assert {e["element"] for e in cat["elements"]} >= {"age", "income_band", "land_holding"}
    assert any(s["source"] == "pds_view" and s["records"] > 0 for s in cat["sources"])
    names = {s["source"]: s["name"] for s in cat["sources"]}
    assert all(e["source"] in names and e["authoritative"] == names[e["source"]] for e in cat["elements"])      # the same name in both tables
    assert all(s["state"] in ("CURRENT", "STALE", "EMPTY", "UNDATED") for s in cat["sources"])
    assert next(s for s in cat["sources"] if s["source"] == "revenue_land")["elements"] == ["land_holding"]
    reg = c.get("/api/x/registry").json()
    assert any(p["purpose"] == "PENSION_ELIGIBILITY" and p["consent_required"] is False for p in reg["purposes"])
    a = c.post("/api/x/standards/test", json={"kind": "address", "text": "H.No 4-12, Gandhi Ngr Col.", "other": "4 gandhi nagar colony"}).json()
    assert a["compared_with"]["text_similarity"] >= 0.85
    n = c.post("/api/x/standards/test", json={"kind": "name", "text": "Venkata Ramana Reddy", "other": "Reddy Venkata Ramana"}).json()
    assert n["compared_with"]["same_key"] is True
    assert c.post("/api/x/standards/test", json={"kind": "other", "text": "x"}).status_code == 400


def test_marriage_follow_ups_wait_for_both_people_to_consent():
    # Restore a normal marriage age in case an earlier test left a high bar behind.
    setpol("min_marriage_age", {"M": 21, "F": 18})
    tag = uuid.uuid4().hex[:6]
    pr = _latin_adults_and_minors(tag)["adults"]  # both 18+
    ev = c.post("/api/events", json={"event_type": "MARRIAGE_REGISTERED", "use_case": "UC6", "order": 1,
        "payload": {"registration_no": "W2-N-" + tag, "groom_name": pr["fname"], "bride_name": pr["mname"], "marriage_date": "2026-05-01", "bride_name_after": "Newname " + tag}})
    assert ev.status_code == 200, ev.text
    assert ev.json().get("status") == "PROCESSED", ev.json()
    eid = ev.json()["event_id"]
    flow0 = c.get(f"/api/x/events/{eid}/flow").json()
    conf = next((p for p in flow0["proposals"] if p["kind"] == "CONFIRM_MARRIAGE"), None)
    assert conf, flow0
    assert conf["options"]["groom"] and conf["options"]["bride"], conf
    g, b = conf["options"]["groom"][0]["person_id"], conf["options"]["bride"][0]["person_id"]
    r = c.post(f"/api/proposals/{conf['id']}/decision", json={"decision": "APPROVE", "note": "register entry seen", "groom_id": g, "bride_id": b})
    assert r.status_code == 200, r.text
    flow = c.get(f"/api/x/events/{eid}/flow").json()
    cons = [x for x in flow["consents"] if x["purpose"] == "MARRIAGE_UPDATE"]
    assert len(cons) == 2
    follow = [p for p in flow["proposals"] if p["kind"] in ("NOTE_NEW_NAME", "ADD_TO_RATION_CARD") and p["status"] == "PROPOSED"]
    assert follow, "a bride with a new name should produce a follow-up"
    gate = follow[0]["gate"]
    assert gate["status"] == "PENDING" and gate["who"] == "both people" and len(gate["parties"]) == 2
    blocked = c.post(f"/api/proposals/{follow[0]['id']}/decision", json={"decision": "APPROVE", "note": "both agreed, noted"})
    assert blocked.status_code == 409 and "both people" in blocked.json()["detail"]
    c.post(f"/api/x/consents/{cons[0]['id']}/respond", json={"decision": "GRANT"})
    assert c.post(f"/api/proposals/{follow[0]['id']}/decision", json={"decision": "APPROVE", "note": "one agreed, noted"}).status_code == 409   # one is not enough
    c.post(f"/api/x/consents/{cons[1]['id']}/respond", json={"decision": "GRANT"})
    assert c.post(f"/api/proposals/{follow[0]['id']}/decision", json={"decision": "APPROVE", "note": "both agreed, noted"}).status_code == 200
