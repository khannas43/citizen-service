"""The UC3 story, end to end: a death is registered and what follows is only ever proposed, never done.

Who is in it (all synthetic; planted and cleared by the scenario page)
  Ramaiah Goud       pensioner, 75, has a ration card and a land record, a pension payment is due in four days
  Sarojini Goud      his wife; citizen sign-in XXXX-XXXX-2701. She sees a read-only notice once an officer approves contacting her.
  Narsimha Chary     pensioner, 79, no spouse and no nominee on any record
  Gangadhar Rao (two) two living pensioners with the same name and nearly the same age, so one death cannot be matched to one of them

Two data layers are written: the master data (people, pension and card records, proposals, the sign-in) and the older registry layer that the
Beneficiaries and Families screens read (family registry persons, scheme engine beneficiaries). The registry writes are best effort: if a table
is missing, the story still runs and says what it could not write. After every officer decision the beneficiary note is kept in step.
"""
from __future__ import annotations
import json
import uuid
from datetime import date, timedelta

from . import citizen, store
from .survivorship import REF_DATE

ACTOR = "demo-uc3-story"
PREFIX = "DEMO-UC3-"
SCHEME_ID = "a1000001-0000-0000-0000-0000000018c3"
SCHEME_NAME = "Old Age Pension (family review)"
LOGIN_WIDOW = "XXXX-XXXX-2701"

# key -> (name, gender, dob, registry uuid, registry sign-in ref, ration card or None, land record, nominee)
PEOPLE = {
    "ramaiah": ("Ramaiah Goud", "M", date(1951, 4, 2), "27010001-0000-0000-0000-000000000001", "XXXX-XXXX-2711", PREFIX + "RC-RAMAIAH", True),
    "sarojini": ("Sarojini Goud", "F", date(1956, 9, 15), "27010002-0000-0000-0000-000000000001", LOGIN_WIDOW, PREFIX + "RC-RAMAIAH", False),
    "narsimha": ("Narsimha Chary", "M", date(1947, 8, 20), "27020001-0000-0000-0000-000000000001", "XXXX-XXXX-2721", None, False),
    "gangadhar1": ("Gangadhar Rao", "M", date(1953, 2, 10), "27030001-0000-0000-0000-000000000001", "XXXX-XXXX-2731", None, False),
    "gangadhar2": ("Gangadhar Rao", "M", date(1954, 6, 1), "27030002-0000-0000-0000-000000000001", "XXXX-XXXX-2732", None, False),
}
FAMILIES = {"ramaiah": ("a9000000-0000-0000-0000-000000002701", ["sarojini"]), "narsimha": ("a9000000-0000-0000-0000-000000002702", []),
            "gangadhar1": ("a9000000-0000-0000-0000-000000002703", []), "gangadhar2": ("a9000000-0000-0000-0000-000000002704", [])}
PENSIONERS = ("ramaiah", "narsimha", "gangadhar1", "gangadhar2")      # the people who get a pension and a beneficiary row


def _rid(key):
    return PREFIX + key.upper()


def _by_key(cur, key):
    cur.execute("SELECT person_id FROM mdm.source_record WHERE source='crs' AND source_rid=%s LIMIT 1", (_rid(key),))
    r = cur.fetchone()
    return r["person_id"] if r else None


def _key_of(cur, pid):
    cur.execute("SELECT source_rid FROM mdm.source_record WHERE person_id=%s AND source='crs' AND source_rid LIKE %s LIMIT 1", (pid, PREFIX + "%"))
    r = cur.fetchone()
    return r["source_rid"][len(PREFIX):].lower() if r else None


def _try(cur, notes, what, fn):
    cur.execute("SAVEPOINT uc3_try")
    try:
        fn()
        cur.execute("RELEASE SAVEPOINT uc3_try")
        return True
    except Exception as e:  # noqa: BLE001
        cur.execute("ROLLBACK TO SAVEPOINT uc3_try")
        notes.append(f"{what}: not written ({type(e).__name__}: {str(e).splitlines()[0][:120]})")
        return False


# ------------------------------------------------------------------ master data
def _person(cur, key):
    name, gender, dob, _reg, _ref, card, land = PEOPLE[key]
    cur.execute("SELECT nextval('mdm.person_id_seq') AS i")
    pid = cur.fetchone()["i"]
    cur.execute("""INSERT INTO mdm.person (id, mdm_id, name, dob, birth_year, gender, district, life_status)
                   VALUES (%s,%s,%s,%s,%s,%s,'Medak','NO_DEATH_RECORD')""", (pid, f"MDM-{pid:08d}", name, dob, dob.year, gender))
    cur.execute("""INSERT INTO mdm.source_record (person_id, source, source_rid, rtype, name, gender, dob, district, link_status, score, as_of, payload)
                   VALUES (%s,'crs',%s,'BIRTH',%s,%s,%s,%s,'AUTO_LINKED',0.97,CURRENT_DATE,'{"synthetic": true}'::jsonb)""",
                (pid, _rid(key), name, gender, dob, "Medak"))
    if key in PENSIONERS:
        due = REF_DATE + timedelta(days=4 if key == "ramaiah" else 25)
        cur.execute("""INSERT INTO mdm.source_record (person_id, source, source_rid, rtype, name, gender, dob, district, link_status, score, as_of, payload)
                       VALUES (%s,'pension_batch',%s,'PENSIONER',%s,%s,%s,'Medak','AUTO_LINKED',0.96,CURRENT_DATE,%s::jsonb)""",
                    (pid, _rid(key) + "-PEN", name, gender, dob,
                     json.dumps({"status": "ACTIVE", "scheme": "Old Age Pension", "next_payment_on": due.isoformat(), "nominee_name": "", "synthetic": True})))
    if card:
        cur.execute("""INSERT INTO mdm.source_record (person_id, source, source_rid, rtype, name, gender, dob, district, ration_card, link_status, score, as_of, payload)
                       VALUES (%s,'pds_view',%s,'MEMBER',%s,%s,%s,'Medak',%s,'AUTO_LINKED',0.95,CURRENT_DATE,%s::jsonb)""",
                    (pid, f"{_rid(key)}-PDS", name, gender, dob, card, json.dumps({"member_status": "ACTIVE", "synthetic": True})))
    if land:
        cur.execute("""INSERT INTO mdm.source_record (person_id, source, source_rid, rtype, name, gender, dob, district, link_status, score, as_of, payload)
                       VALUES (%s,'revenue_land',%s,'LAND',%s,%s,%s,'Medak','AUTO_LINKED',0.9,CURRENT_DATE,%s::jsonb)""",
                    (pid, f"{_rid(key)}-LAND", name, gender, dob, json.dumps({"synthetic": True})))
    store.rebuild_person(cur, pid)
    return pid


def _spouses(cur, a, b):
    cur.execute("""INSERT INTO mdm.relationship (person_a, person_b, kind, basis, source)
                   SELECT LEAST(%s,%s), GREATEST(%s,%s), 'SPOUSE','demo uc3','demo' WHERE NOT EXISTS
                   (SELECT 1 FROM mdm.relationship WHERE kind='SPOUSE' AND person_a=LEAST(%s,%s) AND person_b=GREATEST(%s,%s))""", (a, b, a, b, a, b, a, b))


# ------------------------------------------------------------------ registry layer
def _registry(cur, notes):
    for key, (fid, others) in FAMILIES.items():
        def fam(key=key, fid=fid, others=others):
            for k in [key] + others:
                name, gender, dob, reg, ref, *_ = PEOPLE[k]
                cur.execute("""INSERT INTO family_registry.person (id, name, dob, gender, aadhaar_ref, occupation, annual_income, caste_category, is_alive, mobile)
                               VALUES (%s,%s,%s,%s,%s,'retired',60000,'OBC',true,%s)""", (reg, name, dob, gender, ref, "98765" + ref[-4:] + "0"))
            cur.execute("INSERT INTO family_registry.family (id, address, village, taluka, district) VALUES (%s,'Medak town','Medak','Medak','Medak')", (fid,))
            cur.execute("INSERT INTO family_registry.family_member (family_id, person_id, relationship_to_head) VALUES (%s,%s,'HEAD')", (fid, PEOPLE[key][3]))
            for k in others:
                cur.execute("INSERT INTO family_registry.family_member (family_id, person_id, relationship_to_head) VALUES (%s,%s,'WIFE')", (fid, PEOPLE[k][3]))
        _try(cur, notes, f"registry household for {PEOPLE[key][0]}", fam)


def _scheme(cur, notes):
    def row():
        cur.execute("""INSERT INTO scheme_engine.scheme (id, name, name_gujarati, description, department, benefit_type, benefit_value,
                         income_ceiling, eligible_castes, min_age, max_age, gender, district_scope, valid_from, valid_to, is_active, category, created_by, created_at)
                       VALUES (%s,%s,%s,%s,'Social Security','MONTHLY','1000',100000,'OBC,SC,ST,NT,GENERAL',60,100,'ANY',NULL,'2020-01-01','2035-12-31',true,'SOCIAL_SECURITY','dept.admin',NOW())
                       ON CONFLICT (id) DO NOTHING""",
                    (SCHEME_ID, SCHEME_NAME, "వృద్ధాప్య పింఛన్ (కుటుంబ సమీక్ష)",
                     "Monthly pension for older people. When a pensioner dies, an officer confirms the death, approves the stop, and contacts the surviving spouse."))
    return _try(cur, notes, "base scheme", row)


def _widow_of(cur, pid):
    """The living spouse of a pensioner who has died, from the master data."""
    cur.execute("SELECT o.id FROM mdm.relationship r JOIN mdm.person o ON o.id = CASE WHEN r.person_a=%s THEN r.person_b ELSE r.person_a END "
                "WHERE r.kind='SPOUSE' AND (r.person_a=%s OR r.person_b=%s) AND o.life_status<>'DECEASED'", (pid, pid, pid))
    r = cur.fetchone()
    return r["id"] if r else None


def _stop_state(cur, pid):
    """('NONE' | 'PROPOSED' | 'APPROVED', approver, date) for the pension stop proposal of this person."""
    cur.execute("SELECT status, decided_by, decided_at, detail FROM mdm.proposal WHERE person_id=%s AND kind='STOP_PENSION' ORDER BY id DESC LIMIT 1", (pid,))
    r = cur.fetchone()
    return (r["status"], r["decided_by"], r["detail"]) if r else (None, None, None)


def _row_for(cur, key, pid):
    """(status, eligibility_reason, removal_reason) for one person's beneficiary row, read from the master data."""
    cur.execute("SELECT life_status FROM mdm.person WHERE id=%s", (pid,))
    life = (cur.fetchone() or {}).get("life_status")
    if key == "sarojini":
        cur.execute("SELECT 1 FROM mdm.proposal WHERE kind='NOTIFY_SPOUSE' AND status='APPROVED' AND detail->>'spouse_id'=%s", (str(pid),))
        if cur.fetchone():
            return "IDENTIFIED", "Husband was a pensioner and has died. May be eligible for family pension. An officer will contact her. Nothing is changed automatically.", None
        return None
    if life == "DECEASED":
        st, by, det = _stop_state(cur, pid)
        if st == "APPROVED":
            eff = (det or {}).get("effective_from") or (det or {}).get("next_payment_on")
            return "REMOVED", "Death confirmed.", f"Pension stopped" + (f" from {eff}" if eff else "") + f" after the death was confirmed. Approved by {by}. The pension department acts on the notice."
        if cur_has_no_kin(cur, pid):
            return "CONFIRMED", "Death confirmed. The pension stop waits for an officer. No spouse or nominee on record: next of kin is being traced.", None
        return "CONFIRMED", "Death confirmed. The pension stop waits for an officer's approval. The payment already due is left as it is.", None
    return "CONFIRMED", "Receiving the pension. No death on record.", None


def cur_has_no_kin(cur, pid):
    cur.execute("SELECT 1 FROM mdm.proposal WHERE person_id=%s AND kind='REVIEW_NEXT_OF_KIN' AND status='PROPOSED'", (pid,))
    return bool(cur.fetchone())


def sync_beneficiaries(cur, notes=None) -> int:
    notes = notes if notes is not None else []
    n = 0
    for key in list(PENSIONERS) + ["sarojini"]:
        pid = _by_key(cur, key)
        if not pid:
            continue
        row = _row_for(cur, key, pid)
        name, gender, dob, reg, *_ = PEOPLE[key]
        fid = next(f for k, (f, o) in FAMILIES.items() if k == key or key in o)
        def go(key=key, pid=pid, row=row, name=name, reg=reg, fid=fid, gender=gender):
            if row is None:
                return
            status, reason, removal = row
            cur.execute("SELECT id FROM scheme_engine.beneficiary WHERE scheme_id=%s AND person_id=%s", (SCHEME_ID, reg))
            ex = cur.fetchone()
            if ex:
                cur.execute("""UPDATE scheme_engine.beneficiary SET status=%s, eligibility_reason=%s, removal_reason=%s,
                                      removed_at=CASE WHEN %s='REMOVED' THEN COALESCE(removed_at, now()) ELSE NULL END,
                                      confirmed_at=CASE WHEN %s='CONFIRMED' THEN COALESCE(confirmed_at, now()) ELSE NULL END WHERE id=%s""",
                            (status, reason, removal, status, status, ex["id"]))
            else:
                cur.execute("""INSERT INTO scheme_engine.beneficiary (id, scheme_id, family_id, person_id, person_name, family_village, family_district, family_taluka,
                                  status, identified_at, eligibility_reason, removal_reason, caste_category, gender, amount)
                               VALUES (%s,%s,%s,%s,%s,'Medak','Medak','Medak',%s,now(),%s,%s,'OBC',%s,1000)""",
                            (str(uuid.uuid4()), SCHEME_ID, fid, reg, name, status, reason, removal, gender))
        if _try(cur, notes, f"beneficiary row for {name}", go):
            n += 1
    return n


def _mark_alive(cur, pid, alive: bool, notes=None):
    key = _key_of(cur, pid)
    if key:
        _try(cur, notes if notes is not None else [], "registry is_alive",
             lambda: cur.execute("UPDATE family_registry.person SET is_alive=%s WHERE id=%s", (alive, PEOPLE[key][3])))


def after_decision(cur, pr: dict, actor: str) -> None:
    """Called after an officer approves a death proposal. Creates the spouse's notice, and for the story cohort keeps the registry layer in step. Never raises."""
    try:
        kind, pid = pr["kind"], pr.get("person_id")
        if kind == "NOTIFY_SPOUSE":
            sid = (pr.get("detail") or {}).get("spouse_id")
            if sid:
                cur.execute("INSERT INTO mdm.invitation (person_id, kind, created_by) VALUES (%s,'DEATH_NOTICE',%s) ON CONFLICT (person_id, kind) DO NOTHING", (sid, actor))
        if not pid:
            return
        sync_pid = pid
        if kind == "NOTIFY_SPOUSE":
            sync_pid = (pr.get("detail") or {}).get("spouse_id") or pid
        cur.execute("SELECT 1 FROM mdm.source_record WHERE person_id = ANY(%s) AND source_rid LIKE %s LIMIT 1", ([pid, sync_pid], PREFIX + "%"))
        if not cur.fetchone():
            return
        if kind == "CONFIRM_DEATH":
            _mark_alive(cur, pid, False)
        sync_beneficiaries(cur)
    except Exception:  # noqa: BLE001
        pass


# ------------------------------------------------------------------ the story
def plant(cur, actor: str = ACTOR) -> dict:
    """Plants the cast. Safe to run again: it clears the earlier cast first."""
    clear(cur)
    notes: list[str] = []
    ids = {k: _person(cur, k) for k in PEOPLE}
    _spouses(cur, ids["ramaiah"], ids["sarojini"])
    citizen.link(cur, LOGIN_WIDOW, ids["sarojini"], actor)
    _registry(cur, notes)
    _scheme(cur, notes)
    n = sync_beneficiaries(cur, notes)
    return {"people": len(ids), "beneficiary_rows": n, "notes": notes, "ids": ids}


def fixture(cur, key):
    """The same shape death_fixture returns, for a planted person."""
    name, _g, dob, *_ = PEOPLE[key]
    pid = _by_key(cur, key)
    return {"name": name, "age": REF_DATE.year - dob.year, "person_id": pid} if pid else None


def clear(cur) -> dict:
    notes: list[str] = []
    cur.execute("SELECT DISTINCT person_id FROM mdm.source_record WHERE source_rid LIKE %s", (PREFIX + "%",))
    ids = [r["person_id"] for r in cur.fetchall()]
    regs = [v[3] for v in PEOPLE.values()]
    _try(cur, notes, "beneficiary rows", lambda: cur.execute("DELETE FROM scheme_engine.beneficiary WHERE scheme_id=%s", (SCHEME_ID,)))
    for k, (fid, others) in FAMILIES.items():
        def drop(fid=fid):
            cur.execute("DELETE FROM family_registry.family_member WHERE family_id=%s", (fid,))
            cur.execute("DELETE FROM family_registry.family WHERE id=%s", (fid,))
        _try(cur, notes, "registry household", drop)
    _try(cur, notes, "registry people", lambda: cur.execute("DELETE FROM family_registry.person WHERE id = ANY(%s)", (regs,)))
    if ids:
        cur.execute("UPDATE mdm.proposal SET status='WITHDRAWN', note='demo uc3 clear', decided_by=%s, decided_at=now() WHERE person_id = ANY(%s) AND status='PROPOSED'", (ACTOR, ids))
        cur.execute("DELETE FROM mdm.citizen_link WHERE person_id = ANY(%s)", (ids,))
        cur.execute("DELETE FROM mdm.invitation WHERE person_id = ANY(%s)", (ids,))
        cur.execute("DELETE FROM mdm.relationship WHERE person_a = ANY(%s) OR person_b = ANY(%s)", (ids, ids))
        cur.execute("DELETE FROM mdm.source_record WHERE person_id = ANY(%s)", (ids,))     # includes the death records a confirmation added
        for pid in ids:
            store.rebuild_person(cur, pid)
            cur.execute("SELECT 1 FROM mdm.person WHERE id=%s", (pid,))
            if cur.fetchone():
                cur.execute("DELETE FROM mdm.person WHERE id=%s", (pid,))
    return {"people": len(ids), "notes": notes}
