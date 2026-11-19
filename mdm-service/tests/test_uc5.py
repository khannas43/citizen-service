"""UC5 household and housing assistance: household worked out by the system, duplicates caught, one item per household,
one delivery on approval, no value in anything a department sees."""
from __future__ import annotations
import json, os, uuid
from datetime import date, timedelta

os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""

import pytest
from fastapi.testclient import TestClient
from app.api import app
from app import exchange, uc5, workqueue, events
from app.db import connect
from app.survivorship import REF_DATE
from tests.test_uc4 import _latin_person, _rel, _income_cert, _tag

cl = TestClient(app)
ADMIN = {"X-Test-Roles": "MDM_ADMIN,ADMIN", "X-Test-Actor": "test-user"}
PDS = {"X-Test-Roles": "PDS_OFFICER", "X-Test-Actor": "pds.officer"}
ELEMENTS = ["income_band", "residence", "household_benefit", "electricity_link", "land_holding", "duplicate_benefit"]


def _grant(pid: int, purpose: str = "HOUSEHOLD_BENEFIT") -> int:
    with connect() as conn:
        cur = conn.cursor()
        c = exchange.request_consent(cur, pid, purpose, "test", None)
        cur.execute("UPDATE mdm.consent SET status='GRANTED', responded_at=now(), scope=%s::jsonb, expires_at=now() + interval '90 days' WHERE id=%s",
                    (json.dumps({"elements": ELEMENTS, "partial": False}), c["id"]))
        conn.commit()
        return c["id"]


def _card(pid: int, card: str, rid: str):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO mdm.source_record (person_id, source, source_rid, rtype, name, link_status, score, as_of, ration_card, payload)
                       VALUES (%s,'pds_view',%s,'RATION',(SELECT name FROM mdm.person WHERE id=%s),'AUTO_LINKED',0.95,CURRENT_DATE,%s,'{}'::jsonb)""",
                    (pid, rid, pid, card))
        conn.commit()


def _application(pid: int, rid: str, status: str = "SUBMITTED", household_ref: str | None = None):
    pay = {"status": status}
    if household_ref:
        pay["household_ref"] = household_ref
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO mdm.source_record (person_id, source, source_rid, rtype, name, link_status, score, as_of, payload)
                       VALUES (%s,'housing',%s,'APPLICATION',(SELECT name FROM mdm.person WHERE id=%s),'AUTO_LINKED',0.95,CURRENT_DATE,%s::jsonb)""",
                    (pid, rid, pid, json.dumps(pay)))
        conn.commit()


def _verify(pid: int, question: str, params: dict | None = None) -> dict:
    r = cl.post("/api/x/verify", json={"requester": "housing", "purpose": "HOUSEHOLD_BENEFIT", "question": question,
                                       "params": params or {}, "person_id": pid}, headers=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()


def _open(pid: int, kind: str) -> list[dict]:
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, status, reason_code FROM mdm.proposal WHERE person_id=%s AND kind=%s AND status='PROPOSED'", (pid, kind))
        return cur.fetchall()


def _adult(name: str, age: int = 40, gender: str = "M") -> int:
    return _latin_person(name, birth_year=REF_DATE.year - age, gender=gender)


def _household(tag: str, *, with_card=True):
    """An applicant, a spouse and a minor child, all on one ration card."""
    a = _adult(f"Demo Applicant {tag}", 42)
    s = _adult(f"Demo Spouse {tag}", 38, "F")
    kid = _latin_person(f"Demo Child {tag}", dob=date(REF_DATE.year - 9, 4, 2), gender="F")
    _rel(a, s, "SPOUSE")
    _rel(a, kid, "PARENT_OF")
    cardno = f"RC-UC5-{tag}"
    if with_card:
        for p, n in ((a, "a"), (s, "s")):
            _card(p, cardno, f"PDS-UC5-{n}-{tag}")
    return a, s, kid, cardno


# 1. the household is worked out by the system, not by the applicant
def test_the_household_is_the_card_sharers_spouse_and_minor_children_but_not_an_adult_child_or_parent():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    grown = _adult(f"Demo Grown {tag}", 22)
    elder = _adult(f"Demo Elder {tag}", 70)
    _rel(a, grown, "PARENT_OF")
    _rel(elder, a, "PARENT_OF")
    with connect() as conn:
        ids, cards = uc5.household_members(conn.cursor(), a)
    assert {a, s, kid} <= set(ids)
    assert grown not in ids and elder not in ids
    assert cards == [cardno]


def test_a_household_stops_at_the_cap_and_always_keeps_the_applicant():
    tag = _tag()
    a = _adult(f"Demo Applicant {tag}")
    others = [_adult(f"Demo Member {tag}x{chr(97 + i % 26)}") for i in range(uc5.HOUSEHOLD_CAP + 5)]
    for o in others:
        _rel(a, o, "SAME_HOUSEHOLD")
    with connect() as conn:
        ids, _ = uc5.household_members(conn.cursor(), a)
    assert a in ids and len(ids) <= uc5.HOUSEHOLD_CAP


# 2. household income: highest band, never the figures
def test_household_income_takes_the_highest_band_among_members_and_names_nobody():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    _income_cert(a, f"INC-A-{tag}", annual=90000)
    _income_cert(s, f"INC-S-{tag}", annual=450000)
    _grant(a)
    v = _verify(a, "HOUSEHOLD_INCOME_AT_MOST", {"limit": 200000})
    assert v["outcome"] == "ANSWERED" and v["answer"] == "NO"
    blob = json.dumps(v)
    assert "450000" not in blob and "90000" not in blob and f"INC-S-{tag}" not in blob
    assert v["household_members"] >= 2


def test_household_income_yes_when_every_members_certificate_is_under_the_limit():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    _income_cert(a, f"INC-A-{tag}", annual=90000)
    _income_cert(s, f"INC-S-{tag}", annual=120000)
    _grant(a)
    assert _verify(a, "HOUSEHOLD_INCOME_AT_MOST", {"limit": 200000})["answer"] == "YES"


def test_household_income_with_one_member_expired_is_flagged_incomplete_not_guessed():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    _income_cert(a, f"INC-A-{tag}", annual=90000)
    _income_cert(s, f"INC-S-{tag}", expired=True)
    _grant(a)
    v = _verify(a, "HOUSEHOLD_INCOME_AT_MOST", {"limit": 200000})
    assert v["outcome"] == "ANSWERED" and v.get("incomplete") is True


def test_household_income_conflict_inside_one_member_is_a_conflict_with_no_value():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    _income_cert(a, f"INC-A1-{tag}", annual=90000)
    _income_cert(a, f"INC-A2-{tag}", annual=900000)
    _grant(a)
    v = _verify(a, "HOUSEHOLD_INCOME_AT_MOST", {"limit": 200000})
    assert v["outcome"] == "CONFLICT"
    assert "900000" not in json.dumps(v)


def test_nobody_in_the_household_has_a_certificate_is_no_record_not_no():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    _grant(a)
    v = _verify(a, "HOUSEHOLD_INCOME_AT_MOST", {"limit": 200000})
    assert v["outcome"] == "NO_RECORD"


def test_the_household_income_question_is_refused_for_any_other_purpose():
    tag = _tag()
    a = _adult(f"Demo Applicant {tag}")
    _grant(a, "SCHOLARSHIP_ELIGIBILITY")
    r = cl.post("/api/x/verify", json={"requester": "education", "purpose": "SCHOLARSHIP_ELIGIBILITY", "question": "HOUSEHOLD_INCOME_AT_MOST",
                                       "params": {"limit": 1}, "person_id": a}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["outcome"] == "DENIED_POLICY"


# 3. a minor cannot be the applicant
def test_a_minor_cannot_be_asked_for_a_housing_check():
    tag = _tag()
    kid = _latin_person(f"Demo Minor {tag}", dob=date(REF_DATE.year - 12, 1, 1), gender="F")
    with connect() as conn:
        with pytest.raises(exchange.Refused) as e:
            exchange.request_consent(conn.cursor(), kid, "HOUSEHOLD_BENEFIT", "test", None)
    assert e.value.code == 409


# 4. duplicates, by household, not by person
def test_a_second_application_from_another_member_is_a_possible_duplicate_and_raises_one_item():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    _application(a, f"HSG-A-{tag}")
    _application(s, f"HSG-S-{tag}")
    _grant(a)
    v = _verify(a, "DUPLICATE_BENEFIT")
    assert v["answer"] == "POSSIBLE_DUPLICATE"
    _verify(a, "DUPLICATE_BENEFIT")                                   # again: nothing new
    open_ = _open(a, "REVIEW_DUPLICATE_BENEFIT")
    assert len(open_) == 1 and open_[0]["reason_code"] == "DUPLICATE_BENEFIT"
    assert "HSG-" not in json.dumps(v)                                 # which application, and where, is not shared


def test_a_benefit_already_given_to_the_household_is_already_receiving():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    _application(s, f"HSG-S-{tag}", status="SANCTIONED")
    _grant(a)
    v = _verify(a, "DUPLICATE_BENEFIT")
    assert v["answer"] == "ALREADY_RECEIVING"
    assert len(_open(a, "REVIEW_DUPLICATE_BENEFIT")) == 1


def test_a_household_with_one_application_is_not_a_duplicate_and_closes_an_open_item():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    _application(a, f"HSG-A-{tag}")
    _application(s, f"HSG-S-{tag}")
    _grant(a)
    _verify(a, "DUPLICATE_BENEFIT")
    assert len(_open(a, "REVIEW_DUPLICATE_BENEFIT")) == 1
    with connect() as conn:                                           # the second application is withdrawn at the source
        cur = conn.cursor()
        cur.execute("DELETE FROM mdm.source_record WHERE source='housing' AND source_rid=%s", (f"HSG-S-{tag}",))
        conn.commit()
    assert _verify(a, "DUPLICATE_BENEFIT")["answer"] == "NONE_FOUND"
    assert _open(a, "REVIEW_DUPLICATE_BENEFIT") == []


def test_the_open_item_is_one_per_household_even_when_two_members_are_checked():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    _application(a, f"HSG-A-{tag}")
    _application(s, f"HSG-S-{tag}")
    _grant(a)
    _grant(s)
    _verify(a, "DUPLICATE_BENEFIT")
    _verify(s, "DUPLICATE_BENEFIT")
    both = _open(a, "REVIEW_DUPLICATE_BENEFIT") + _open(s, "REVIEW_DUPLICATE_BENEFIT")
    assert len(both) == 1


# 5. the other items
def test_a_dead_person_still_active_on_the_card_raises_a_card_item_for_civil_supplies():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO mdm.dq_issue (person_id, code, severity, status) VALUES (%s,'DEAD_ACTIVE_ON_RATION_CARD','HIGH','OPEN')", (s,))
        conn.commit()
    _grant(a)
    _verify(a, "HOUSEHOLD_HAS_BENEFIT")
    items = _open(a, "REVIEW_CARD_MEMBER")
    assert len(items) == 1 and items[0]["reason_code"] == "CARD_DEAD_ACTIVE"


def test_a_housing_record_naming_another_household_raises_a_conflict_item_without_choosing():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    _application(a, f"HSG-A-{tag}", household_ref="RC-SOMEWHERE-ELSE")
    _grant(a)
    _verify(a, "HOUSEHOLD_HAS_BENEFIT")
    assert len(_open(a, "SETTLE_HOUSEHOLD_CONFLICT")) == 1


def test_an_applicant_with_no_card_and_nobody_linked_raises_no_household_and_approving_sends_one_notice_and_one_delivery():
    tag = _tag()
    a = _adult(f"Demo Alone {tag}")
    _grant(a)
    _verify(a, "HOUSEHOLD_HAS_BENEFIT")
    items = _open(a, "HOUSEHOLD_NOT_FOUND")
    assert len(items) == 1
    r = cl.post(f"/api/proposals/{items[0]['id']}/decision", json={"decision": "APPROVE"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT system, status, detail FROM mdm.delivery WHERE person_id=%s AND purpose='HOUSEHOLD_NOT_FOUND'", (a,))
        rows = cur.fetchall()
    assert len(rows) == 1 and rows[0]["system"] == "housing"
    assert "Civil supplies" in rows[0]["detail"]["message"]
    again = cl.post(f"/api/proposals/{items[0]['id']}/decision", json={"decision": "APPROVE"}, headers=ADMIN)
    assert again.status_code == 409


# 6. approving a person-decides item sends one delivery with references and a message, never a value or an edit
@pytest.mark.parametrize("kind", ["REVIEW_DUPLICATE_BENEFIT", "SETTLE_HOUSEHOLD_CONFLICT", "REVIEW_CARD_MEMBER"])
def test_approving_needs_a_reason_and_sends_one_delivery_with_no_values(kind):
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    _income_cert(s, f"INC-S-{tag}", annual=777777)
    with connect() as conn:
        cur = conn.cursor()
        prop = uc5.raise_item(cur, a, [a, s, kid], kind, "test item", {"application_refs": [f"HSG-{tag}"], "ration_cards": [cardno]}, "test")["id"]
        conn.commit()
    if kind in ("REVIEW_DUPLICATE_BENEFIT", "SETTLE_HOUSEHOLD_CONFLICT"):
        no_reason = cl.post(f"/api/proposals/{prop}/decision", json={"decision": "APPROVE"}, headers=ADMIN)
        assert no_reason.status_code in (400, 422), no_reason.text
    r = cl.post(f"/api/proposals/{prop}/decision", json={"decision": "APPROVE", "note": "Looked at the card and the housing record together"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT system, detail FROM mdm.delivery WHERE person_id=%s AND purpose=%s", (a, kind))
        rows = cur.fetchall()
        cur.execute("SELECT count(*) AS n FROM mdm.source_record WHERE person_id=ANY(%s) AND source='revenue_certificates' AND payload->>'annual_income'='777777'", ([a, s, kid],))
        certs = cur.fetchone()["n"]
    assert len(rows) == 1
    assert rows[0]["system"] == ("pds" if kind == "REVIEW_CARD_MEMBER" else "housing")
    assert "777777" not in json.dumps(rows[0]["detail"])
    assert certs == 1                                                  # nothing was edited


# 7. the work queue knows them
def test_the_four_kinds_are_classified_with_labels_in_both_languages():
    kinds = {"REVIEW_DUPLICATE_BENEFIT": ("DUPLICATE_BENEFIT", "C"), "REVIEW_CARD_MEMBER": ("CARD_DEAD_ACTIVE", "C"),
             "SETTLE_HOUSEHOLD_CONFLICT": ("HOUSEHOLD_CONFLICT", "C"), "HOUSEHOLD_NOT_FOUND": ("NO_HOUSEHOLD", "B")}
    for k, (reason, cls) in kinds.items():
        assert workqueue.KIND_BASE[k] == (reason, cls)
        assert workqueue.LABELS[reason][0] and workqueue.LABELS[reason][1]
        assert workqueue.SUGGESTIONS[reason][0] and workqueue.SUGGESTIONS[reason][1]
        assert k in workqueue.known_kinds_in_events_source(open(events.__file__).read())
    assert "NO_HOUSEHOLD" in workqueue.BATCHABLE
    assert {"DUPLICATE_BENEFIT", "HOUSEHOLD_CONFLICT"} <= set(workqueue.REVIEW_REASON_REQUIRED)


# 8. the outcomes route
def test_the_outcomes_route_counts_by_outcome_and_open_items_and_is_closed_to_a_department_officer():
    tag = _tag()
    a, s, kid, cardno = _household(tag)
    _application(a, f"HSG-A-{tag}")
    _application(s, f"HSG-S-{tag}")
    _grant(a)
    _verify(a, "DUPLICATE_BENEFIT")
    r = cl.get("/api/x/housing/outcomes?days=7", headers=ADMIN)
    assert r.status_code == 200
    body = r.json()
    assert body["answered"] >= 1 and body["duplicates_found"] >= 1 and body["open_items"]["DUPLICATE_BENEFIT"] >= 1
    assert set(uc5.REASON_OF.values()) <= set(body["open_items"])
    assert cl.get("/api/x/housing/outcomes?days=0", headers=ADMIN).status_code == 422
    assert cl.get("/api/x/housing/outcomes", headers=PDS).status_code == 403


# 9. policy
def test_the_housing_consent_lasts_90_days_by_default():
    with connect() as conn:
        cur = conn.cursor()
        assert exchange.expiry_days_for(exchange.current(cur), "HOUSEHOLD_BENEFIT") == 90
