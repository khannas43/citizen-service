"""The UC4 invitation demo: one synthetic student who is about to turn 18, is not on the scholarship portal, and signs in with a demo login.

The student has her own sixth demo sign-in, XXXX-XXXX-2601 (OTP 123456), so Ahmed Shaikh keeps 4001. "Run the UC4 group" calls plant, which adds her
to the family registry (a small household of her own) and links the sign-in to her master record. So the invitation notice the officer sends shows in her bell.
Nothing real is touched: the student, her one civil registration record (source_rid DEMO-UC4-INVITE-STUDENT) and her invitation are synthetic.
"""
from __future__ import annotations
from datetime import date, timedelta

from . import citizen, store
from .survivorship import REF_DATE

LOGIN = "XXXX-XXXX-2601"
RID = "DEMO-UC4-INVITE-STUDENT"
NAME = "Kavya Muthyala"
DAYS_TO_18 = 25
FAM_ID = "a9000000-0000-0000-0000-000000002601"
MOTHER_ID = "26010001-0000-0000-0000-000000000001"
STUDENT_ID = "26010002-0000-0000-0000-000000000001"
MOTHER = "Lakshmi Muthyala"


def _best_effort(cur, fn):
    """Registry writes never break the demo: inside a savepoint, a missing table or a clash is skipped."""
    cur.execute("SAVEPOINT reg_try")
    try:
        fn()
        cur.execute("RELEASE SAVEPOINT reg_try")
    except Exception:  # noqa: BLE001
        cur.execute("ROLLBACK TO SAVEPOINT reg_try")


def _registry(cur, dob):
    """Her household in the family registry, so the demo sign-in works like the other five. Safe to run again."""
    cur.execute("DELETE FROM family_registry.family_member WHERE family_id=%s", (FAM_ID,))
    cur.execute("DELETE FROM family_registry.person WHERE id IN (%s,%s)", (MOTHER_ID, STUDENT_ID))
    cur.execute("DELETE FROM family_registry.family WHERE id=%s", (FAM_ID,))
    cur.execute("INSERT INTO family_registry.family (id, address, village, taluka, district) VALUES (%s,'8 Temple Street, Medak','Medak','Medak','Medak')", (FAM_ID,))
    cols = "(id, name, dob, gender, aadhaar_ref, occupation, annual_income, caste_category, is_alive, mobile)"
    cur.execute(f"INSERT INTO family_registry.person {cols} VALUES (%s,%s,'1980-06-12','F','XXXX-XXXX-2602','homemaker',0,'GENERAL',true,'9876542602')", (MOTHER_ID, MOTHER))
    cur.execute(f"INSERT INTO family_registry.person {cols} VALUES (%s,%s,%s,'F',%s,'student',0,'GENERAL',true,'9876542601')", (STUDENT_ID, NAME, dob, LOGIN))
    cur.execute("INSERT INTO family_registry.family_member (family_id, person_id, relationship_to_head) VALUES (%s,%s,'HEAD')", (FAM_ID, MOTHER_ID))
    cur.execute("INSERT INTO family_registry.family_member (family_id, person_id, relationship_to_head) VALUES (%s,%s,'DAUGHTER')", (FAM_ID, STUDENT_ID))


def _unregistry(cur):
    cur.execute("DELETE FROM family_registry.family_member WHERE family_id=%s", (FAM_ID,))
    cur.execute("DELETE FROM family_registry.person WHERE id IN (%s,%s)", (MOTHER_ID, STUDENT_ID))
    cur.execute("DELETE FROM family_registry.family WHERE id=%s", (FAM_ID,))


def _student(cur):
    cur.execute("SELECT person_id FROM mdm.source_record WHERE source='crs' AND source_rid=%s", (RID,))
    r = cur.fetchone()
    return r["person_id"] if r else None


def plant(cur, actor: str) -> dict:
    """Creates (or finds) the student, clears any earlier invitation, and lends her the login. Safe to run again."""
    pid = _student(cur)
    made = False
    if not pid:
        target = REF_DATE + timedelta(days=DAYS_TO_18)                     # she turns 18 in about three and a half weeks
        dob = date(target.year - 18, target.month, min(target.day, 28))
        cur.execute("SELECT nextval('mdm.person_id_seq') AS i")
        pid = cur.fetchone()["i"]
        cur.execute("""INSERT INTO mdm.person (id, mdm_id, name, dob, birth_year, gender, district, life_status)
                       VALUES (%s,%s,%s,%s,%s,'F','Medak','ALIVE')""", (pid, f"MDM-{pid:08d}", NAME, dob, dob.year))
        cur.execute("""INSERT INTO mdm.source_record (person_id, source, source_rid, rtype, name, gender, dob, district, link_status, score, as_of, payload)
                       VALUES (%s,'crs',%s,'BIRTH',%s,'F',%s,'Medak','AUTO_LINKED',0.97,CURRENT_DATE,'{"synthetic": true}'::jsonb)""", (pid, RID, NAME, dob))
        store.rebuild_person(cur, pid)
        made = True
    cur.execute("SELECT dob FROM mdm.person WHERE id=%s", (pid,))
    _dob = cur.fetchone()["dob"]
    _best_effort(cur, lambda: _registry(cur, _dob))
    cur.execute("DELETE FROM mdm.invitation WHERE person_id=%s", (pid,))
    invited_before = cur.rowcount
    citizen.link(cur, LOGIN, pid, actor)
    return {"person_id": pid, "created": made, "invitation_cleared": invited_before}


def clear(cur) -> dict:
    """Removes the student, her invitation, her sign-in and her registry household."""
    _best_effort(cur, lambda: _unregistry(cur))
    pid = _student(cur)
    if not pid:
        return {"removed": 0}
    cur.execute("DELETE FROM mdm.citizen_link WHERE person_id=%s", (pid,))
    cur.execute("DELETE FROM mdm.invitation WHERE person_id=%s", (pid,))
    cur.execute("DELETE FROM mdm.source_record WHERE person_id=%s AND source_rid=%s", (pid, RID))
    store.rebuild_person(cur, pid)                                          # no records left: the person goes
    cur.execute("SELECT 1 FROM mdm.person WHERE id=%s", (pid,))
    if cur.fetchone():
        cur.execute("DELETE FROM mdm.person WHERE id=%s", (pid,))
    return {"removed": 1}
