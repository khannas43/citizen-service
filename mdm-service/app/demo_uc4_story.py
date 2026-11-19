"""The UC4 story, end to end: one small synthetic cohort that appears in the scheme simulator, the beneficiary list, the families view,
the task queue and the two citizen logins. Nothing real is touched. Every record is synthetic and can be cleared in one call.

Who is in it
  Kavya Muthyala   student, turns 18 soon, citizen login XXXX-XXXX-2601 (planted by demo_uc4_invite)
  Lakshmi Muthyala her mother, citizen login XXXX-XXXX-2602
  Sai Muthyala     her brother, 17
  Harika Reddy     income certificate expired
  Sandeep Naik     two income certificates disagree
  Vijay Pratap Singh   applicant from another state (master data only: there is no state record, which is the point)
  Anitha Rao       clean control

Two data layers are written: the master data (consents, certificates, proposals, logins) and the older registry layer that the
scheme simulator, beneficiary list and families screens read (family registry persons and scheme engine beneficiaries).
The registry writes are best effort: if a table is missing the story still runs and says what it could not write.
"""
from __future__ import annotations
import json
import uuid
from datetime import date, timedelta

from . import citizen, demo_uc4_invite as inv, exchange, store
from .survivorship import REF_DATE

ACTOR = "demo-uc4-story"
PREFIX = "DEMO-UC4-"
SCHEME_ID = "a1000001-0000-0000-0000-0000000018c4"
SCHEME_NAME = "Higher Education Scholarship (turning 18)"
LOGIN_MOTHER = "XXXX-XXXX-2602"
PURPOSE = "SCHOLARSHIP_ELIGIBILITY"

# the registry uuid and master source_rid for each person in the cohort
SAI_RID, MOTHER_RID = PREFIX + "SAI", PREFIX + "LAKSHMI"
SAI_REG = "26010003-0000-0000-0000-000000000001"

CASES = [  # key, student, parent, district, certificates, registry family income
    ("expired", "Harika Reddy", "Padma Reddy", "Medak", [("expired", 120000, -30)], 120000),
    ("conflict", "Sandeep Naik", "Ramesh Naik", "Medak", [("conflict-a", 100000, 180), ("conflict-b", 400000, 180)], 100000),
    ("otherstate", "Vijay Pratap Singh", "Rajesh Singh", "Other State", [], None),
    ("clean", "Anitha Rao", "Srinivas Rao", "Medak", [("clean", 150000, 180)], 150000),
]
# key -> (uuid prefix, registry family id, parent sign-in ref, student sign-in ref)
REGISTRY_ROWS = {"expired": ("26020001", "a9000000-0000-0000-0000-000000002611", "XXXX-XXXX-2611", "XXXX-XXXX-2612"),
                 "conflict": ("26020002", "a9000000-0000-0000-0000-000000002621", "XXXX-XXXX-2621", "XXXX-XXXX-2622"),
                 "clean": ("26020004", "a9000000-0000-0000-0000-000000002641", "XXXX-XXXX-2641", "XXXX-XXXX-2642")}


# ------------------------------------------------------------------ small helpers
def _person(cur, name, dob, gender, district, rid, rtype="BIRTH"):
    cur.execute("SELECT nextval('mdm.person_id_seq') AS i")
    pid = cur.fetchone()["i"]
    cur.execute("""INSERT INTO mdm.person (id, mdm_id, name, dob, birth_year, gender, district, life_status)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,'ALIVE')""", (pid, f"MDM-{pid:08d}", name, dob, dob.year, gender, district))
    cur.execute("""INSERT INTO mdm.source_record (person_id, source, source_rid, rtype, name, gender, dob, district, link_status, score, as_of, payload)
                   VALUES (%s,'crs',%s,%s,%s,%s,%s,%s,'AUTO_LINKED',0.97,CURRENT_DATE,'{"synthetic": true}'::jsonb)""",
                (pid, rid, rtype, name, gender, dob, district))
    store.rebuild_person(cur, pid)
    return pid


def _by_rid(cur, rid):
    cur.execute("SELECT person_id FROM mdm.source_record WHERE source_rid=%s LIMIT 1", (rid,))
    r = cur.fetchone()
    return r["person_id"] if r else None


def _rel(cur, parent, child):
    cur.execute("""INSERT INTO mdm.relationship (person_a, person_b, kind, basis, source)
                   SELECT %s,%s,'PARENT_OF','demo uc4','demo' WHERE NOT EXISTS
                   (SELECT 1 FROM mdm.relationship WHERE kind='PARENT_OF' AND person_a=%s AND person_b=%s)""", (parent, child, parent, child))


def _cert(cur, pid, rid, name, annual, days, on):
    cur.execute("""INSERT INTO mdm.source_record (person_id, source, source_rid, rtype, name, link_status, score, as_of, payload)
                   VALUES (%s,'revenue_certificates',%s,'INCOME',%s,'AUTO_LINKED',0.95,CURRENT_DATE,%s::jsonb)""",
                (pid, rid, name, json.dumps({"annual_income": annual, "valid_until": (on + timedelta(days=days)).isoformat(), "status": "ACTIVE"})))


def _grant_by_parent(cur, student, parent):
    c = exchange.request_consent(cur, student, PURPOSE, ACTOR, student)
    cur.execute("""UPDATE mdm.consent SET status='GRANTED', given_by_person_id=%s, responded_at=now(), scope=%s::jsonb,
                          expires_at=now() + interval '90 days', channel='ASSISTED', operator=%s WHERE id=%s""",
                (parent, json.dumps({"elements": ["income_band", "category", "residence", "age"], "partial": False}), ACTOR, c["id"]))


def _try(cur, notes, what, fn):
    """Registry writes are best effort, inside a savepoint, so a missing table never breaks the story."""
    cur.execute("SAVEPOINT story_try")
    try:
        fn()
        cur.execute("RELEASE SAVEPOINT story_try")
        return True
    except Exception as e:  # noqa: BLE001
        cur.execute("ROLLBACK TO SAVEPOINT story_try")
        notes.append(f"{what}: not written ({type(e).__name__}: {str(e).splitlines()[0][:120]})")
        return False


# ------------------------------------------------------------------ registry layer
def _reg_person(cur, pid, name, dob, gender, ref, occupation, income, caste, mobile=None):
    cur.execute("""INSERT INTO family_registry.person (id, name, dob, gender, aadhaar_ref, occupation, annual_income, caste_category, is_alive, mobile)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,true,%s)""", (pid, name, dob, gender, ref, occupation, income, caste, mobile))


def _reg_family(cur, fid, head, members, address):
    cur.execute("INSERT INTO family_registry.family (id, address, village, taluka, district) VALUES (%s,%s,'Medak','Medak','Medak')", (fid, address))
    for pid, rel in [(head, "HEAD")] + members:
        cur.execute("INSERT INTO family_registry.family_member (family_id, person_id, relationship_to_head) VALUES (%s,%s,%s)", (fid, pid, rel))


def _registry(cur, notes, kavya_dob):
    def kavya_family():
        # Kavya's household was written by demo_uc4_invite; give it incomes and a category, and add Sai
        cur.execute("UPDATE family_registry.person SET annual_income=96000, caste_category='OBC' WHERE id=%s", (inv.MOTHER_ID,))
        cur.execute("UPDATE family_registry.person SET caste_category='OBC' WHERE id=%s", (inv.STUDENT_ID,))
        _reg_person(cur, SAI_REG, "Sai Muthyala", date(REF_DATE.year - 17, 3, 10), "M", "XXXX-XXXX-2603", "student", 0, "OBC")
        cur.execute("INSERT INTO family_registry.family_member (family_id, person_id, relationship_to_head) VALUES (%s,%s,'SON')", (inv.FAM_ID, SAI_REG))
    _try(cur, notes, "Kavya's registry household", kavya_family)
    dob = date(REF_DATE.year - 17, REF_DATE.month, min(REF_DATE.day, 28))
    for key, student, parent, district, certs, income in CASES:
        if key not in REGISTRY_ROWS:
            continue
        base, fid, pref, sref = REGISTRY_ROWS[key]
        ph, sh = f"{base}-0000-0000-0000-000000000001", f"{base}-0000-0000-0000-000000000002"
        def fam(ph=ph, sh=sh, fid=fid, student=student, parent=parent, income=income, pref=pref, sref=sref):
            _reg_person(cur, ph, parent, date(REF_DATE.year - 41, 1, 15), "F", pref, "daily wage", income, "OBC")
            _reg_person(cur, sh, student, dob, "F", sref, "student", 0, "OBC")
            _reg_family(cur, fid, ph, [(sh, "DAUGHTER")], "Medak town")
        _try(cur, notes, f"registry household for {student}", fam)


def _scheme(cur, notes):
    def row():
        cur.execute("""INSERT INTO scheme_engine.scheme (id, name, name_gujarati, description, department, benefit_type, benefit_value,
                         income_ceiling, eligible_castes, min_age, max_age, gender, district_scope, valid_from, valid_to, is_active, category, created_by, created_at)
                       VALUES (%s,%s,%s,%s,'Education','ANNUAL','25000',250000,'OBC,SC,ST,NT,GENERAL',17,18,'ANY',NULL,'2020-01-01','2035-12-31',true,'EDUCATION','dept.admin',NOW())
                       ON CONFLICT (id) DO NOTHING""",
                    (SCHEME_ID, SCHEME_NAME, "ఉన్నత విద్య స్కాలర్‌షిప్ (18 ఏళ్లు నిండుతున్నవారికి)",
                     "Scholarship for students about to turn 18 who start higher education. Eligibility is checked on age, family income, category and residence."))
    return _try(cur, notes, "base scheme", row)


# ------------------------------------------------------------------ beneficiary rows mirror the master state
def _cohort_rows(cur):
    """(master person id, name, registry family id, registry person id, kind) for everyone the beneficiary list should show."""
    out = []
    k = inv._student(cur)
    if k:
        out.append((k, inv.NAME, inv.FAM_ID, inv.STUDENT_ID))
    s = _by_rid(cur, SAI_RID)
    if s:
        out.append((s, "Sai Muthyala", inv.FAM_ID, SAI_REG))
    for key, student, *_ in CASES:
        if key in REGISTRY_ROWS:
            pid = _by_rid(cur, f"{PREFIX}{key}-S")
            base, fid, *_ = REGISTRY_ROWS[key]
            if pid:
                out.append((pid, student, fid, f"{base}-0000-0000-0000-000000000002"))
    return out


def _state_note(cur, pid):
    """(status, reason, removal_reason) for one student, read from the master data."""
    cur.execute("SELECT kind FROM mdm.proposal WHERE person_id=%s AND status='PROPOSED' AND kind IN ('RENEW_CERTIFICATE','SETTLE_SOURCE_CONFLICT','MANUAL_ROUTE') ORDER BY id DESC LIMIT 1", (pid,))
    p = cur.fetchone()
    cur.execute("SELECT status, given_by_person_id FROM mdm.consent WHERE person_id=%s AND purpose=%s ORDER BY id DESC LIMIT 1", (pid, PURPOSE))
    c = cur.fetchone()
    age = exchange.person_age(cur, pid)
    adult = age is not None and age >= int(exchange.current(cur).get("adult_age") or 18)
    if c and c["status"] == "REVOKED":
        return "REMOVED", "Consent withdrawn. Checks stopped.", "Withdrawn by the applicant. Checks stopped and temporary results removed. The audit trail is kept."
    if p and p["kind"] == "RENEW_CERTIFICATE":
        return "IDENTIFIED", "Income certificate expired. The student is asked to renew it with Revenue.", None
    if p and p["kind"] == "SETTLE_SOURCE_CONFLICT":
        return "IDENTIFIED", "Income certificates disagree. Revenue is asked to re-check. No figure was chosen.", None
    if not c:
        return "IDENTIFIED", "Eligible on age, income and residence. No permission asked yet.", None
    if c["status"] == "PENDING":
        who = "the student" if adult else "the parent"
        return "IDENTIFIED", f"Eligible on age, income and residence. Waiting for permission from {who}.", None
    if c["status"] == "ENDED":
        return "IDENTIFIED", "The parent's permission ended at 18. The student is asked for her own.", None
    if c["status"] == "GRANTED":
        return "CONFIRMED", "Permission given. Eligibility answered from the sources. Nothing is enrolled automatically.", None
    return "IDENTIFIED", "Waiting for permission.", None


def sync_beneficiaries(cur, notes=None) -> int:
    """Writes one beneficiary row per cohort student and keeps its status and note in step with the master data."""
    notes = notes if notes is not None else []
    n = 0
    for pid, name, fid, rpid in _cohort_rows(cur):
        status, reason, removal = _state_note(cur, pid)
        def go(pid=pid, name=name, fid=fid, rpid=rpid, status=status, reason=reason, removal=removal):
            cur.execute("SELECT id FROM scheme_engine.beneficiary WHERE scheme_id=%s AND person_id=%s", (SCHEME_ID, rpid))
            ex = cur.fetchone()
            if ex:
                cur.execute("""UPDATE scheme_engine.beneficiary SET status=%s, eligibility_reason=%s, removal_reason=%s,
                                      removed_at=CASE WHEN %s='REMOVED' THEN COALESCE(removed_at, now()) ELSE NULL END,
                                      confirmed_at=CASE WHEN %s='CONFIRMED' THEN COALESCE(confirmed_at, now()) ELSE NULL END,
                                      confirmed_by=CASE WHEN %s='CONFIRMED' THEN 'Eligibility check' ELSE NULL END WHERE id=%s""",
                            (status, reason, removal, status, status, status, ex["id"]))
            else:
                cur.execute("SELECT caste_category, gender FROM family_registry.person WHERE id=%s", (rpid,))
                rp = cur.fetchone() or {}
                cur.execute("""INSERT INTO scheme_engine.beneficiary (id, scheme_id, family_id, person_id, person_name, family_village, family_district, family_taluka,
                                  status, identified_at, eligibility_reason, removal_reason, caste_category, gender, amount)
                               VALUES (%s,%s,%s,%s,%s,'Medak','Medak','Medak',%s,now(),%s,%s,%s,%s,25000)""",
                            (str(uuid.uuid4()), SCHEME_ID, fid, rpid, name, status, reason, removal, rp.get("caste_category"), rp.get("gender")))
        if _try(cur, notes, f"beneficiary row for {name}", go):
            n += 1
    return n


def sync_for(cur, person_id: int) -> None:
    """Called after a consent answer, handover or withdrawal. Does nothing for anyone outside the cohort. Never raises."""
    try:
        cur.execute("SELECT 1 FROM mdm.source_record WHERE person_id=%s AND source_rid LIKE %s LIMIT 1", (person_id, PREFIX + "%"))
        if cur.fetchone():
            sync_beneficiaries(cur)
    except Exception:  # noqa: BLE001
        pass


# ------------------------------------------------------------------ the story
def plant(cur, actor: str = ACTOR) -> dict:
    """Plants the whole cohort. Safe to run again: it clears the earlier cohort first. Kavya has no consent yet; she applies in step 'applies'."""
    clear(cur)
    notes: list[str] = []
    on = REF_DATE
    kavya = inv.plant(cur, actor)["person_id"]                       # Kavya, her login, her registry household, no invitation yet
    cur.execute("SELECT dob FROM mdm.person WHERE id=%s", (kavya,))
    kdob = cur.fetchone()["dob"]
    lakshmi = _person(cur, inv.MOTHER, date(1980, 6, 12), "F", "Medak", MOTHER_RID)
    sai = _person(cur, "Sai Muthyala", date(on.year - 17, 3, 10), "M", "Medak", SAI_RID)
    citizen.link(cur, LOGIN_MOTHER, lakshmi, actor)
    _rel(cur, lakshmi, kavya)
    _rel(cur, lakshmi, sai)
    _cert(cur, kavya, PREFIX + "KAVYA-INCOME", inv.NAME, 96000, 180, on)
    _cert(cur, sai, PREFIX + "SAI-INCOME", "Sai Muthyala", 96000, 180, on)
    dob17 = date(on.year - 17, on.month, min(on.day, 28))
    raised = {}
    for key, student, parent, district, certs, _income in CASES:
        par = _person(cur, parent, date(on.year - 41, 1, 15), "F", "Medak", f"{PREFIX}{key}-P")
        stu = _person(cur, student, dob17, "F", district, f"{PREFIX}{key}-S")
        _rel(cur, par, stu)
        for rid, annual, days in certs:
            _cert(cur, stu, f"{PREFIX}{rid}", student, annual, days, on)
        _grant_by_parent(cur, stu, par)
        out = exchange.verify(cur, "education", PURPOSE, "INCOME_AT_MOST", {"limit": 200000}, actor, person_id=stu)   # raises the queue item where there is one
        raised[key] = out.get("outcome")
    _registry(cur, notes, kdob)
    _scheme(cur, notes)
    n = sync_beneficiaries(cur, notes)
    return {"kavya": kavya, "lakshmi": lakshmi, "sai": sai, "cases": raised, "beneficiary_rows": n, "notes": notes}


def applies(cur, actor: str = ACTOR) -> dict:
    """Kavya and Sai start an application: Education asks for consent. Both are minors, so their mother is asked. Nothing is granted."""
    out = {}
    for label, pid in (("kavya", inv._student(cur)), ("sai", _by_rid(cur, SAI_RID))):
        if not pid:
            continue
        c = exchange.request_consent(cur, pid, PURPOSE, actor, pid)
        out[label] = {"consent_id": c["id"], "existing": c.get("existing", False)}
    sync_beneficiaries(cur)
    return out


def turn_kavya_18(cur, actor: str = ACTOR) -> dict:
    """Demo only: the clock does not move, so Kavya's birth date moves back by a few weeks. She is now 18 as of the system date.
    The next daily check (Control Tower, Run daily checks now) ends her mother's permission and asks her for her own."""
    pid = inv._student(cur)
    if not pid:
        return {"changed": False}
    new = date(REF_DATE.year - 18, REF_DATE.month, REF_DATE.day) - timedelta(days=1)
    cur.execute("UPDATE mdm.source_record SET dob=%s WHERE person_id=%s AND source_rid=%s", (new, pid, inv.RID))
    store.rebuild_person(cur, pid)
    cur.execute("UPDATE mdm.person SET dob=%s, birth_year=%s WHERE id=%s", (new, new.year, pid))
    notes: list[str] = []
    _try(cur, notes, "registry date of birth", lambda: cur.execute("UPDATE family_registry.person SET dob=%s WHERE id=%s", (new, inv.STUDENT_ID)))
    sync_beneficiaries(cur, notes)
    return {"changed": True, "dob": new.isoformat(), "age": exchange.person_age(cur, pid), "notes": notes}


def clear(cur) -> dict:
    """Removes the whole cohort and its registry rows. The base scheme stays: it is a scheme, not demo data."""
    removed = {}
    notes: list[str] = []
    ids = [x["person_id"] for x in _all_rows(cur)]
    reg_ids = [inv.STUDENT_ID, SAI_REG] + [f"{v[0]}-0000-0000-0000-00000000000{i}" for v in REGISTRY_ROWS.values() for i in (1, 2)]
    _try(cur, notes, "beneficiary rows", lambda: cur.execute("DELETE FROM scheme_engine.beneficiary WHERE scheme_id=%s AND person_id = ANY(%s)", (SCHEME_ID, reg_ids)))
    for base, fid, *_ in REGISTRY_ROWS.values():
        def drop(base=base, fid=fid):
            cur.execute("DELETE FROM family_registry.family_member WHERE family_id=%s", (fid,))
            cur.execute("DELETE FROM family_registry.person WHERE id IN (%s,%s)", (f"{base}-0000-0000-0000-000000000001", f"{base}-0000-0000-0000-000000000002"))
            cur.execute("DELETE FROM family_registry.family WHERE id=%s", (fid,))
        _try(cur, notes, "registry household", drop)
    _try(cur, notes, "Sai", lambda: cur.execute("DELETE FROM family_registry.family_member WHERE person_id=%s", (SAI_REG,)))
    _try(cur, notes, "Sai", lambda: cur.execute("DELETE FROM family_registry.person WHERE id=%s", (SAI_REG,)))
    if ids:
        cur.execute("""UPDATE mdm.proposal SET status='WITHDRAWN', note='demo uc4 clear', decided_by=%s, decided_at=now()
                       WHERE person_id = ANY(%s) AND status='PROPOSED'""", (ACTOR, ids))
        cur.execute("DELETE FROM mdm.consent WHERE person_id = ANY(%s) OR subject_person_id = ANY(%s) OR given_by_person_id = ANY(%s)", (ids, ids, ids))
        cur.execute("DELETE FROM mdm.citizen_link WHERE person_id = ANY(%s)", (ids,))
        cur.execute("DELETE FROM mdm.invitation WHERE person_id = ANY(%s)", (ids,))
        cur.execute("DELETE FROM mdm.relationship WHERE person_a = ANY(%s) OR person_b = ANY(%s)", (ids, ids))
        cur.execute("DELETE FROM mdm.source_record WHERE person_id = ANY(%s) AND source_rid LIKE %s", (ids, PREFIX + "%"))
        for pid in ids:
            store.rebuild_person(cur, pid)
            cur.execute("SELECT 1 FROM mdm.person WHERE id=%s", (pid,))
            if cur.fetchone():
                cur.execute("DELETE FROM mdm.person WHERE id=%s", (pid,))
        removed["people"] = len(ids)
    removed["kavya"] = inv.clear(cur)["removed"]
    removed["notes"] = notes
    return removed


def _all_rows(cur):
    cur.execute("SELECT DISTINCT person_id FROM mdm.source_record WHERE source_rid LIKE %s AND source_rid <> %s", (PREFIX + "%", inv.RID))
    return cur.fetchall()
