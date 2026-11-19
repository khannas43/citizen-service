"""Citizen household from master data: spouse, children, parents and ration-card sharers only."""
from __future__ import annotations
import json, os
from datetime import date, timedelta

os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""

import pytest
from fastapi.testclient import TestClient
from app.api import app
from app import citizen, uc5
from app.db import connect
from app.survivorship import REF_DATE
from tests.test_uc4 import _latin_person, _rel, _tag

cl = TestClient(app)
ADMIN = {"X-Test-Roles": "MDM_ADMIN,ADMIN", "X-Test-Actor": "test-user"}
PDS = {"X-Test-Roles": "PDS_OFFICER", "X-Test-Actor": "pds.officer"}


@pytest.fixture
def signin(monkeypatch):
    tag = _tag()
    monkeypatch.setattr(
        citizen, "verify_citizen_token",
        lambda h, t=tag: {
            "Bearer a": "REF-A-" + t,
            "Bearer b": "REF-B-" + t,
            "Bearer c": "REF-C-" + t,
            "Bearer x": "REF-NOBODY-" + t,
            "Bearer s": "REF-SHARE-" + t,
        }.get(h) or (_ for _ in ()).throw(citizen.Refused("Your session is not valid or has expired", 401)),
    )
    return tag


def q(sql, *p):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, p)
        return cur.fetchall()


def _link(ref: str, pid: int):
    r = cl.post("/api/x/citizen-links", json={"aadhaar_ref": ref, "person_id": pid}, headers=ADMIN)
    assert r.status_code == 200, r.text


def _card(pid: int, card: str, rid: str):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO mdm.source_record
                       (person_id, source, source_rid, rtype, name, link_status, score, as_of, ration_card, payload)
                       VALUES (%s,'pds_view',%s,'RATION',(SELECT name FROM mdm.person WHERE id=%s),
                               'AUTO_LINKED',0.95,CURRENT_DATE,%s,'{}'::jsonb)""",
                    (pid, rid, pid, card))
        conn.commit()


def _birth_source(pid: int, reg: str, *, days_ago: int = 5, reg_date: str | None = None):
    """crs BIRTH source + BIRTH_REGISTERED event within the last 90 days."""
    reg_date = reg_date or (date.today() - timedelta(days=days_ago)).isoformat()
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO mdm.source_record
                       (person_id, source, source_rid, rtype, name, link_status, score, as_of, payload)
                       VALUES (%s,'crs',%s,'BIRTH',(SELECT name FROM mdm.person WHERE id=%s),
                               'AUTO_LINKED',0.95,CURRENT_DATE,'{}'::jsonb)""",
                    (pid, reg, pid))
        cur.execute("""INSERT INTO mdm.event
                       (event_type, uc, event_key, status, received_at, payload)
                       VALUES ('BIRTH_REGISTERED','UC2',%s,'PROCESSED',
                               now() - (%s || ' days')::interval,
                               %s::jsonb)""",
                    (reg, str(days_ago), json.dumps({"registration_no": reg, "registration_date": reg_date,
                                                     "child_name": q("SELECT name FROM mdm.person WHERE id=%s", pid)[0]["name"]})))
        conn.commit()
    return reg_date


def _family(tag: str):
    """Spouse pair, newborn CHILD with recent birth registration, shared ration card."""
    a = _latin_person(f"Housepa {tag}", birth_year=REF_DATE.year - 35, gender="M")
    b = _latin_person(f"Housemo {tag}", birth_year=REF_DATE.year - 32, gender="F")
    kid = _latin_person(f"Housekid {tag}", dob=date.today() - timedelta(days=20), gender="F")
    _rel(a, b, "SPOUSE")
    _rel(a, kid, "PARENT_OF")
    _rel(b, kid, "PARENT_OF")
    card = f"RC-HH-{tag.upper()}1234"
    _card(a, card, f"PDS-HH-a-{tag}")
    _card(b, card, f"PDS-HH-b-{tag}")
    added = _birth_source(kid, f"CRS-HH-{tag}")
    return a, b, kid, card, added


def _get(who: str):
    return cl.get("/api/citizen/household", headers={"Authorization": f"Bearer {who}"})


def test_parent_sees_spouse_and_newborn_with_birth_registration(signin):
    tag = signin
    a, b, kid, card, added = _family(tag)
    _link("REF-A-" + tag, a)
    r = _get("a")
    assert r.status_code == 200, r.text
    data = r.json()
    by_rel = {}
    for it in data["items"]:
        by_rel.setdefault(it["relationship_to_me"], []).append(it)
    assert any(i["relationship_to_me"] == "SELF" for i in data["items"])
    assert by_rel["SPOUSE"] and "Housemo" in by_rel["SPOUSE"][0]["name"]
    child = by_rel["CHILD"][0]
    assert "Housekid" in child["name"]
    assert child["registered_via"] == "BIRTH_REGISTRATION"
    assert child["added_on"] == added
    assert child["age_band"] in ("0 to 1", "2 to 17")
    assert "age" in child and isinstance(child["age"], int)
    assert data["count"] == len(data["items"])


def test_second_parent_sees_the_same_child(signin):
    tag = signin
    a, b, kid, card, added = _family(tag)
    _link("REF-A-" + tag, a)
    _link("REF-B-" + tag, b)
    child_a = next(i for i in _get("a").json()["items"] if i["relationship_to_me"] == "CHILD")
    child_b = next(i for i in _get("b").json()["items"] if i["relationship_to_me"] == "CHILD")
    assert child_a["name"] == child_b["name"]
    assert child_a["registered_via"] == child_b["registered_via"] == "BIRTH_REGISTRATION"


def test_unrelated_citizen_sees_none_of_them(signin):
    tag = signin
    a, b, kid, card, _ = _family(tag)
    # Probe: another father–son pair that shares the child's given name, not the household.
    stranger = _latin_person(f"Strangerpa {tag}", birth_year=REF_DATE.year - 40, gender="M")
    probe = _latin_person(f"Housekid {tag}", dob=date(REF_DATE.year - 5, 1, 1), gender="M")
    _rel(stranger, probe, "PARENT_OF")
    _link("REF-A-" + tag, a)
    _link("REF-C-" + tag, stranger)
    names = {i["name"] for i in _get("c").json()["items"]}
    assert f"Housepa {tag}" not in names
    assert f"Housemo {tag}" not in names
    # Own son may appear as CHILD; the birth-registered family must not.
    assert all(i.get("registered_via") is None for i in _get("c").json()["items"])
    fam = {i["name"] for i in _get("a").json()["items"]}
    assert f"Housekid {tag}" in fam


def _walk_forbidden(obj, path=""):
    """Yield (path, key) for any forbidden key anywhere in the JSON."""
    forbidden = {"income", "annual_income", "identity", "aadhaar", "aadhaar_ref", "phone", "mobile",
                 "address", "dob", "date_of_birth", "birth_year", "person_id", "mdm_id", "id"}
    if isinstance(obj, dict):
        for k, v in obj.items():
            lk = k.lower()
            if lk in forbidden or lk.endswith("_person_id") or lk == "personid":
                yield f"{path}.{k}", k
            # opaque person_ref is allowed; master numeric id keys are not
            yield from _walk_forbidden(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _walk_forbidden(v, f"{path}[{i}]")


def test_response_has_no_sensitive_keys(signin):
    tag = signin
    a, b, kid, card, _ = _family(tag)
    _link("REF-A-" + tag, a)
    data = _get("a").json()
    bad = list(_walk_forbidden(data))
    assert not bad, bad
    for it in data["items"]:
        assert set(it.keys()) <= {"person_ref", "name", "name_te", "relationship_to_me", "relationship_detail",
                                  "age", "age_band", "registered_via", "on_ration_card", "added_on"}
        assert not str(it["person_ref"]).isdigit()
        assert it["person_ref"] != str(a) and it["person_ref"] != str(kid)


def test_ration_card_is_masked(signin):
    tag = signin
    a, b, kid, card, _ = _family(tag)
    _link("REF-A-" + tag, a)
    data = _get("a").json()
    assert data["ration_cards"]
    for masked in data["ration_cards"]:
        assert masked == card[-4:]
        assert masked != card
        assert len(masked) == 4


def test_minor_is_member_to_card_sharer_who_is_not_a_parent(signin):
    tag = signin
    a, b, kid, card, _ = _family(tag)
    sharer = _latin_person(f"Cardshare {tag}", birth_year=REF_DATE.year - 28, gender="M")
    _card(sharer, card, f"PDS-HH-s-{tag}")
    _card(kid, card, f"PDS-HH-k-{tag}")  # child on the card too
    _link("REF-SHARE-" + tag, sharer)
    items = _get("s").json()["items"]
    minors = [i for i in items if i["relationship_to_me"] == "SAME_CARD" and i["age_band"] in ("0 to 1", "2 to 17")]
    assert minors, items
    assert all(i["name"] == "Member" for i in minors)


def test_unlinked_signin_gets_404(signin):
    r = _get("x")
    assert r.status_code == 404
    assert "linked" in (r.json().get("detail") or "").lower()


def test_department_officer_cannot_call_citizen_household():
    r = cl.get("/api/citizen/household", headers=PDS)
    assert r.status_code == 403


def test_cap_respected_for_household_of_sixty(signin):
    tag = signin
    head = _latin_person(f"Caphead {tag}", birth_year=REF_DATE.year - 45, gender="M")
    card = f"RC-CAP-{tag.upper()}9999"
    _card(head, card, f"PDS-CAP-h-{tag}")
    for i in range(59):
        # letter-only suffix so _latin_person accepts the name
        suffix = "".join(chr(ord("a") + ((i // 26) % 26)) + chr(ord("a") + (i % 26)))
        p = _latin_person(f"Capmem {tag}{suffix}", birth_year=REF_DATE.year - 30, gender="M")
        _card(p, card, f"PDS-CAP-{i}-{tag}")
    _link("REF-A-" + tag, head)
    data = _get("a").json()
    assert data["count"] <= uc5.HOUSEHOLD_CAP
    assert data["count"] == len(data["items"])
    assert any(i["relationship_to_me"] == "SELF" for i in data["items"])
