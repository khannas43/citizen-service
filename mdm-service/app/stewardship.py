"""Steward actions. Every action rebuilds the affected golden records and writes an audit entry."""
from __future__ import annotations
from . import audit, store


class Refused(Exception):
    def __init__(self, msg: str, code: int = 400):
        super().__init__(msg)
        self.code = code


def _who(cur, actor, note):
    """Tell the link-history trigger who is making this change and why (transaction-local)."""
    cur.execute("SELECT set_config('mdm.actor', %s, true), set_config('mdm.note', %s, true)", (actor or "", note or ""))


def decide(cur, task_id: int, decision: str, person_id: int | None, actor: str, note: str | None,
           batch_id: int | None = None) -> dict:
    cur.execute("SELECT t.*, r.person_id AS own_person, r.source, r.source_rid FROM mdm.review_task t JOIN mdm.source_record r ON r.id=t.record_id "
                "WHERE t.id=%s FOR UPDATE OF t", (task_id,))
    t = cur.fetchone()
    if not t:
        raise Refused("Review task not found", 404)
    if t["status"] != "OPEN":
        raise Refused("This task has already been decided", 409)
    decision = decision.upper()
    _who(cur, actor, note)
    old = t["own_person"]
    touched = [old]
    if decision == "LINK":
        allowed = {c["person_id"] for c in t["candidates"]} | ({old} if old else set())   # confirming the provisional grouping is a valid choice
        if person_id not in allowed:
            raise Refused("Choose one of the candidate persons shown for this record")
        cur.execute("UPDATE mdm.source_record SET person_id=%s, link_status='STEWARD_LINKED', reason=%s WHERE id=%s",
                    (person_id, f"linked by {actor}", t["record_id"]))
        touched.append(person_id)
    elif decision == "SEPARATE":
        # "Keep separate" must really separate: a record still attached to the person it was provisionally grouped with
        # would keep counting toward that person's golden record and conflicts. Give it a person of its own, as unlink does.
        new_pid = old
        if old:
            cur.execute("SELECT count(*) AS n FROM mdm.source_record WHERE person_id=%s", (old,))
            if cur.fetchone()["n"] > 1:
                cur.execute("SELECT nextval('mdm.person_id_seq') AS i")
                new_pid = cur.fetchone()["i"]
                cur.execute("INSERT INTO mdm.person (id, mdm_id) VALUES (%s, %s)", (new_pid, f"MDM-{new_pid:08d}"))
        cur.execute("UPDATE mdm.source_record SET person_id=%s, link_status='STEWARD_SEPARATE', reason=%s WHERE id=%s",
                    (new_pid, f"kept as a separate person by {actor}", t["record_id"]))
        if new_pid != old:
            touched.append(new_pid)
        person_id = None
    else:
        raise Refused("decision must be LINK or SEPARATE")
    cur.execute("UPDATE mdm.review_task SET status='RESOLVED', decision=%s, chosen_person_id=%s, note=%s, decided_by=%s, decided_at=now(), "
                "batch_id=COALESCE(%s, batch_id) WHERE id=%s",
                (decision, person_id, note, actor, batch_id, task_id))
    for p in dict.fromkeys(touched):
        store.rebuild_person(cur, p)
    store.derive_relationships(cur, [p for p in touched if p])
    detail = {"task": task_id, "from_person": old, "to_person": person_id, "note": note}
    if batch_id:
        detail["batch_id"] = batch_id
    audit.write(cur, actor, f"REVIEW_{decision}", f"record:{t['source']}/{t['source_rid']}", detail)
    return {"task": task_id, "decision": decision, "person_id": person_id or (new_pid if decision == "SEPARATE" else old)}


def unlink(cur, record_id: int, actor: str, note: str | None) -> dict:
    cur.execute("SELECT id, person_id, source, source_rid FROM mdm.source_record WHERE id=%s FOR UPDATE", (record_id,))
    r = cur.fetchone()
    if not r:
        raise Refused("Record not found", 404)
    cur.execute("SELECT count(*) AS n FROM mdm.source_record WHERE person_id=%s", (r["person_id"],))
    if cur.fetchone()["n"] < 2:
        raise Refused("This record is already the only one for its person")
    cur.execute("SELECT nextval('mdm.person_id_seq') AS i")
    new = cur.fetchone()["i"]
    _who(cur, actor, note)
    cur.execute("INSERT INTO mdm.person (id, mdm_id) VALUES (%s, %s)", (new, f"MDM-{new:08d}"))
    cur.execute("UPDATE mdm.source_record SET person_id=%s, link_status='STEWARD_SEPARATE', reason=%s WHERE id=%s",
                (new, f"unlinked by {actor}", record_id))
    cur.execute("UPDATE mdm.review_task SET status='RESOLVED', decision='SEPARATE', decided_by=%s, decided_at=now(), note=%s "
                "WHERE record_id=%s AND status='OPEN'", (actor, note, record_id))
    store.rebuild_person(cur, r["person_id"])
    store.rebuild_person(cur, new)
    store.derive_relationships(cur, [r["person_id"], new])
    audit.write(cur, actor, "UNLINK", f"record:{r['source']}/{r['source_rid']}", {"from_person": r["person_id"], "to_person": new, "note": note})
    return {"record_id": record_id, "old_person_id": r["person_id"], "new_person_id": new}


def request_correction(cur, issue_id: int, note: str, actor: str) -> dict:
    cur.execute("SELECT i.id, i.code, i.status, r.source, r.source_rid FROM mdm.dq_issue i LEFT JOIN mdm.source_record r ON r.id=i.record_id "
                "WHERE i.id=%s FOR UPDATE OF i", (issue_id,))
    i = cur.fetchone()
    if not i:
        raise Refused("Issue not found", 404)
    cur.execute("UPDATE mdm.dq_issue SET status='CORRECTION_REQUESTED', correction_note=%s, requested_by=%s WHERE id=%s", (note, actor, issue_id))
    audit.write(cur, actor, "CORRECTION_REQUESTED", f"issue:{issue_id}",
                {"code": i["code"], "source": i["source"], "record": i["source_rid"], "note": note,
                 "meaning": "Asks the owning department to correct its record; MDM never edits department data"})
    return {"issue": issue_id, "status": "CORRECTION_REQUESTED"}
