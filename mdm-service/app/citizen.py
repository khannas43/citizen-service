"""Citizen's own view of consent requests and other approvals.

The citizen is identified by the sign-in reference on their portal profile,
never by a person id supplied by the caller, so a citizen can only ever see and answer their own requests.
"""
from __future__ import annotations
import hashlib
import json
import os
import secrets
import urllib.request
from datetime import date, timedelta

from . import audit, exchange, notify, ops, translate, uc5
from .matching import MatchConfig, addr_norm
from .names import name_key
from .stewardship import Refused

AUTH_VERIFY_URL = os.getenv("CITIZEN_AUTH_VERIFY_URL", "http://auth-service.citizen.svc.cluster.local:8080/auth-service/v1/verify")
DECLARATION_VERSION = "parent-v1"
ASKED_BY_BIRTH = "Registrar, civil registration"
REQUEST_KINDS = {"CONFIRM_DETAILS", "LINK_CHILD", "LINK_FAMILY_MEMBER"}


def verify_citizen_token(authorization: str) -> str:
    """Asks the citizen sign-in service whether the token is valid and returns the sign-in reference it belongs to."""
    if not (authorization or "").lower().startswith("bearer "):
        raise Refused("Sign in to continue", 401)
    req = urllib.request.Request(AUTH_VERIFY_URL, headers={"Authorization": authorization})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
    except Exception:
        raise Refused("Your session is not valid or has expired", 401)
    if not data.get("valid") or not data.get("aadhaarRef"):
        raise Refused("Your session is not valid or has expired", 401)
    return data["aadhaarRef"]


def person_of(cur, ref: str) -> int:
    cur.execute("SELECT person_id FROM mdm.citizen_link WHERE aadhaar_ref=%s", (ref,))
    r = cur.fetchone()
    if r:
        return r["person_id"]
    cur.execute("SELECT person_id FROM mdm.source_record WHERE source='identity_reference' AND source_rid=%s", (ref,))
    r = cur.fetchone()
    if r and r["person_id"]:
        return r["person_id"]
    raise Refused("No master record is linked to this sign-in yet", 404)


def link(cur, ref: str, person_id: int, actor: str) -> dict:
    ref = (ref or "").strip()
    if not ref:
        raise Refused("The sign-in reference is required")
    cur.execute("SELECT id FROM mdm.person WHERE id=%s", (person_id,))
    if not cur.fetchone():
        raise Refused("Person not found", 404)
    cur.execute("""INSERT INTO mdm.citizen_link (aadhaar_ref, person_id, created_by) VALUES (%s,%s,%s)
                   ON CONFLICT (aadhaar_ref) DO UPDATE SET person_id=EXCLUDED.person_id, created_by=EXCLUDED.created_by""", (ref, person_id, actor))
    audit.write(cur, actor, "CITIZEN_LINKED", f"person:{person_id}", {"note": "sign-in reference linked to master person"})
    return {"aadhaar_ref": ref, "person_id": person_id}


def _shape(c: dict) -> dict:
    pu = exchange.PURPOSES.get(c["purpose"], {})
    scope = c.get("scope") or {}
    return {"id": c["id"], "status": c["status"], "purpose": c["purpose"], "purpose_name": pu.get("name", c["purpose"]),
            "department": c["system"], "department_name": exchange.SYSTEMS.get(c["system"], c["system"]),
            "elements": pu.get("elements", []), "granted_elements": scope.get("elements"), "partial": scope.get("partial"),
            "about": c.get("subject_name"), "event_type": c.get("event_type"),
            "requested_at": c["requested_at"], "responded_at": c.get("responded_at"), "expires_at": c.get("expires_at"),
            "revoked_at": c.get("revoked_at")}


def inbox(cur, ref: str) -> dict:
    pid = person_of(cur, ref)
    cur.execute("""SELECT c.*, coalesce(su.name, ev.payload->>'child_name') AS subject_name, ev.event_type
                   FROM mdm.consent c LEFT JOIN mdm.person su ON su.id=c.subject_person_id LEFT JOIN mdm.event ev ON ev.id=c.event_id
                   WHERE c.person_id=%s ORDER BY (c.status='PENDING') DESC, c.id DESC LIMIT 100""", (pid,))
    rows = cur.fetchall()
    cur.execute("SELECT name FROM mdm.person WHERE id=%s", (pid,))
    me = cur.fetchone()
    pol = exchange.current(cur)
    items = []
    for r in rows:
        r = exchange._expire_if_due(cur, r | {}, exchange._now(None)) if r["status"] == "GRANTED" else r
        s = _shape(r)
        s["term_days"] = exchange.expiry_days_for(pol, r["purpose"])
        items.append(s)
    return {"person": me["name"] if me else None, "items": items, "pending": sum(1 for i in items if i["status"] == "PENDING")}


def _own(cur, ref: str, cid: int) -> int:
    pid = person_of(cur, ref)
    cur.execute("SELECT 1 FROM mdm.consent WHERE id=%s AND person_id=%s", (cid, pid))
    if not cur.fetchone():
        raise Refused("This consent request is not yours to answer", 403)
    return pid


def answer(cur, ref: str, cid: int, decision: str, elements: list[str] | None) -> dict:
    _own(cur, ref, cid)
    cur.execute("SELECT event_id, subject_person_id FROM mdm.consent WHERE id=%s", (cid,))
    row = cur.fetchone()
    if row and (row.get("event_id") or row.get("subject_person_id")):
        raise Refused("Answer this on the Approvals screen.", 409)
    return exchange.respond(cur, cid, decision, f"citizen:{ref}", "PORTAL", None, "Answered by the citizen on the citizen portal", None, elements, None, None)


REMAINS_AFTER_WITHDRAW = ["IDENTITY_LINK", "CLEARING_HOUSE_LOG", "AUDIT_TRAIL"]


def _purge_temp(cur, pid: int) -> int:
    """Remove what was held temporarily for this person (query results) when a consent is withdrawn."""
    cur.execute("SELECT mdm_id FROM mdm.person WHERE id=%s", (pid,))
    p = cur.fetchone()
    removed = 0
    if not p:
        return 0
    cur.execute("SELECT id, rows FROM mdm.temp_result WHERE %s = ANY(subjects) FOR UPDATE", (pid,))
    for t in cur.fetchall():
        keep = [r for r in (t["rows"] or []) if r.get("mdm_id") != p["mdm_id"]]
        removed += len(t["rows"] or []) - len(keep)
        cur.execute("UPDATE mdm.temp_result SET rows=%s::jsonb, subjects=array_remove(subjects,%s) WHERE id=%s",
                    (exchange._js(keep), pid, t["id"]))
    return removed


def withdraw(cur, ref: str, cid: int) -> dict:
    pid = person_of(cur, ref)
    cur.execute("SELECT * FROM mdm.consent WHERE id=%s", (cid,))
    c = cur.fetchone()
    if not c or (c["person_id"] != pid and not (c["purpose"] in CARD_PURPOSES and not c.get("event_id")
                                                 and _card_view(cur, pid, c)["can_withdraw"])):
        raise Refused("This consent request is not yours to answer", 403)
    granted = list((c.get("scope") or {}).get("elements") or [])
    out = exchange.revoke(cur, cid, f"citizen:{ref}", "PORTAL", None, "Withdrawn by the citizen on the citizen portal")
    removed = _purge_temp(cur, c["subject_person_id"] or c["person_id"])
    # The receipt says what stopped and what remains (the evidence that a check happened is kept, not erased).
    return {**out, "stopped": granted, "remains": REMAINS_AFTER_WITHDRAW, "temp_rows_removed": removed}


# ------------------------------------------------------------------ approvals (D1–D6)


def _is_parent_of(cur, guardian_id: int, subject_id: int | None) -> bool:
    if not subject_id:
        return False
    return exchange._parent_of_ok(cur, guardian_id, subject_id)


CARD_PURPOSES = ("SCHOLARSHIP_ELIGIBILITY", "HOUSEHOLD_BENEFIT")          # consents with no event that show as a single-consent card (UC4)


def _card_view(cur, pid: int, c: dict) -> dict:
    """What this caller may do with a scholarship consent. Y1: under 18 only a recorded adult parent answers and the student
    sees it read-only; at 18 only the student answers. A household member or anyone else sees nothing."""
    adult = int(exchange.current(cur)["adult_age"])
    student = c.get("subject_person_id") or c["person_id"]
    s_age = exchange.person_age(cur, student)
    minor = s_age is not None and s_age < adult
    is_student, is_principal = pid == student, pid == c["person_id"]
    parent = False
    if not is_student and exchange._parent_of_ok(cur, pid, student):
        p_age = exchange.person_age(cur, pid)
        parent = p_age is not None and p_age >= adult
    visible = is_principal or is_student or (parent and minor)
    pending = c["status"] == "PENDING"
    if minor:
        can_answer = pending and parent and (is_principal or c["person_id"] == student)
        role = "parent" if parent else "student"
    else:
        can_answer = pending and is_student and c["person_id"] == student
        role = "student" if is_student else ("parent" if parent else "principal")
    can_withdraw = c["status"] == "GRANTED" and ((minor and parent) or (not minor and is_student))
    return {"visible": visible, "can_answer": can_answer, "can_withdraw": can_withdraw, "minor": minor, "role": role,
            "waiting_for_parent": bool(visible and minor and pending and not can_answer and is_student)}


def _can_see_consent(cur, pid: int, c: dict) -> bool:
    """A parent sees a birth consent when confident (Change 3), officer-confirmed, or PARENT_OF."""
    eid = c.get("event_id")
    if not eid and c.get("purpose") in CARD_PURPOSES:
        return _card_view(cur, pid, c)["visible"]
    if _is_parent_of(cur, pid, c.get("subject_person_id")):
        return True
    if exchange._named_parent_rejected_only(cur, pid, eid):
        return False
    if exchange._named_parent_approved(cur, pid, eid):
        return True
    if exchange.parent_is_confident_on_event(cur, pid, eid):
        return True
    # Consent principal: visible unless the parent match is held for an officer.
    if c["person_id"] == pid:
        return not exchange.parent_match_held(cur, pid, eid)
    return False


def _person_name(cur, pid: int | None) -> str | None:
    if not pid:
        return None
    cur.execute("SELECT name FROM mdm.person WHERE id=%s", (pid,))
    r = cur.fetchone()
    return r["name"] if r else None


def _consent_rows_for_me(cur, pid: int) -> list[dict]:
    """Consents the caller may see: assigned to them, named on a live birth match, or PARENT_OF the child.

    SAME_HOUSEHOLD alone is never enough. A PROPOSED parent match counts only while the proposal is
    still PROPOSED or APPROVED, and only because the consent was already addressed to that matched parent.
    """
    cur.execute("""SELECT c.*, coalesce(su.name, ev.payload->>'child_name') AS subject_name,
                          su.birth_year AS subject_birth_year, su.gender AS subject_gender,
                          ev.event_type, ev.payload AS event_payload, pe.name AS principal_name,
                          gb.name AS given_by_name
                   FROM mdm.consent c
                   LEFT JOIN mdm.person pe ON pe.id=c.person_id
                   LEFT JOIN mdm.person su ON su.id=c.subject_person_id
                   LEFT JOIN mdm.person gb ON gb.id=c.given_by_person_id
                   LEFT JOIN mdm.event ev ON ev.id=c.event_id
                   WHERE c.person_id=%s
                      OR EXISTS (
                            SELECT 1 FROM mdm.proposal p
                             WHERE p.event_id=c.event_id AND p.detail ? 'parents'
                               AND p.status IN ('PROPOSED','APPROVED')
                               AND ((p.detail->'parents'->'mother'->>'person_id') = %s
                                 OR (p.detail->'parents'->'father'->>'person_id') = %s))
                      OR (c.subject_person_id IS NOT NULL AND EXISTS (
                            SELECT 1 FROM mdm.relationship r
                             WHERE r.kind='PARENT_OF'
                               AND ((r.person_a=%s AND r.person_b=c.subject_person_id)
                                 OR (r.person_b=%s AND r.person_a=c.subject_person_id))))
                      OR (c.event_id IS NULL AND c.purpose = ANY(%s) AND c.subject_person_id = %s)
                   ORDER BY c.id""",
                (pid, str(pid), str(pid), pid, pid, list(CARD_PURPOSES), pid))
    rows = cur.fetchall()
    return [r for r in rows if _can_see_consent(cur, pid, r)]


def _group_status(rows: list[dict], now) -> str:
    statuses = {r["status"] for r in rows}
    if statuses <= {"PENDING", "EXPIRED"} and "PENDING" in statuses:
        # expire check already applied per row
        if all(r["status"] == "EXPIRED" for r in rows):
            return "EXPIRED"
        if any(r["status"] == "PENDING" for r in rows):
            return "PENDING"
    if "PENDING" in statuses:
        return "PENDING"
    if statuses <= {"EXPIRED"}:
        return "EXPIRED"
    if any(r.get("responded_at") for r in rows):
        return "ANSWERED"
    return next(iter(statuses))


def _shape_consent_group(cur, event_id: int, rows: list[dict], pid: int) -> dict:
    now = exchange._now(None)
    live = []
    for r in rows:
        if r["status"] in ("PENDING", "GRANTED"):
            r = exchange._expire_if_due(cur, dict(r), now)
        live.append(r)
    rows = live
    first = rows[0]
    pl = first.get("event_payload") or {}
    if isinstance(pl, str):
        pl = json.loads(pl)
    child_name = first.get("subject_name") or pl.get("child_name")
    dob = pl.get("date_of_birth")
    sex = first.get("subject_gender") or pl.get("gender")
    answered = [r for r in rows if r.get("responded_at")]
    answered_by = None
    answered_at = None
    if answered:
        a = max(answered, key=lambda r: r["responded_at"])
        answered_at = a["responded_at"]
        who = a.get("given_by_person_id") or a["person_id"]
        answered_by = a.get("given_by_name") or _person_name(cur, who) or a.get("principal_name")
    status = _group_status(rows, now)
    can_answer = status == "PENDING" and any(_can_see_consent(cur, pid, r) for r in rows)
    lines = []
    cur.execute("SELECT consent_id, status, attempts FROM mdm.delivery WHERE consent_id = ANY(%s) AND kind='EVENT'", ([r["id"] for r in rows],))
    sent = {d["consent_id"]: d for d in cur.fetchall()}                 # what really happened to each approved use, so "shared" is never claimed early
    for r in rows:
        pu = exchange.PURPOSES.get(r["purpose"], {})
        scope = r.get("scope") or {}
        lines.append({
            "consent_id": r["id"], "department": r["system"],
            "department_name": exchange.SYSTEMS.get(r["system"], r["system"]),
            "purpose": r["purpose"], "purpose_name": pu.get("name", r["purpose"]),
            "elements": pu.get("elements", []), "status": r["status"],
            "delivery": (sent.get(r["id"]) or {}).get("status"),
            "granted_elements": scope.get("elements"), "partial": scope.get("partial"),
            "seen_at": r.get("seen_at"), "responded_at": r.get("responded_at"),
            "answered_as": r.get("answered_as"), "declaration_version": r.get("declaration_version"),
        })
    return {
        "key": f"event-{event_id}", "kind": "CONSENT_GROUP", "status": status,
        "event_type": (first.get("event_type") or "").replace("_REGISTERED", "") or "BIRTH",
        "event_id": event_id,
        "child": {"name": child_name, "dob": dob, "sex": sex},
        "asked_by": ASKED_BY_BIRTH,
        "asked_at": min((r["requested_at"] for r in rows if r.get("requested_at")), default=None),
        "respond_by": min((r["respond_by"] for r in rows if r.get("respond_by")), default=None),
        "lines": lines, "can_answer": can_answer,
        "answered_by": answered_by, "answered_at": answered_at,
        "seen_at": min((r["seen_at"] for r in rows if r.get("seen_at")), default=None),
    }


def _shape_consent_card(cur, c: dict, pid: int) -> dict:
    """One scholarship consent as a single card (key consent-{id}). Receipt wording follows the answer: allowed, partly
    allowed or not allowed, never 'approved' after a refusal."""
    c = dict(c)
    if c["status"] in ("PENDING", "GRANTED"):
        c = {**c, **exchange._expire_if_due(cur, dict(c), exchange._now(None))}
    view = _card_view(cur, pid, c)
    pu = exchange.PURPOSES.get(c["purpose"], {})
    scope = c.get("scope") or {}
    pol = exchange.current(cur)
    term = exchange.expiry_days_for(pol, c["purpose"])
    student_id = c.get("subject_person_id") or c["person_id"]
    result = None
    if c["status"] == "GRANTED" or (c["status"] in ("EXPIRED", "REVOKED", "ENDED") and c.get("responded_at") and scope.get("elements")):
        result = "PARTLY_ALLOWED" if scope.get("partial") else "ALLOWED"
    elif c["status"] == "REFUSED":
        result = "NOT_ALLOWED"
    cur.execute("""SELECT 1 FROM mdm.consent WHERE person_id=%s AND purpose=%s AND status='ENDED' AND ended_reason='ATTAINED_MAJORITY' AND id<%s LIMIT 1""",
                (c["person_id"], c["purpose"], c["id"]))
    handover = bool(cur.fetchone())
    who = c.get("given_by_person_id") or (c["person_id"] if c.get("responded_at") else None)
    message = None
    if view["waiting_for_parent"]:
        message = "Waiting for your parent to decide. You can answer for yourself when you are 18."
    elif handover and c["status"] == "PENDING" and view["can_answer"]:
        message = "You are now 18. Your parent's permission has ended. If you still want the check, please decide for yourself."
    return {
        "key": f"consent-{c['id']}", "kind": "CONSENT_SINGLE", "consent_id": c["id"], "status": c["status"], "result": result,
        "purpose": c["purpose"], "purpose_name": pu.get("name", c["purpose"]),
        "department": c["system"], "department_name": exchange.SYSTEMS.get(c["system"], c["system"]),
        "elements": pu.get("elements", []), "granted_elements": scope.get("elements") if result else None, "partial": scope.get("partial") if result else None,
        "student": {"person_id": student_id, "name": _person_name(cur, student_id), "under_18": view["minor"]},
        "role": view["role"], "can_answer": view["can_answer"], "can_withdraw": view["can_withdraw"],
        "waiting_for_parent": view["waiting_for_parent"], "needs_declaration": bool(view["can_answer"] and view["minor"]),
        "handover": handover, "message": message,
        "asked_by": exchange.SYSTEMS.get(c["system"], c["system"]), "asked_at": c.get("requested_at"), "respond_by": c.get("respond_by"),
        "responded_at": c.get("responded_at"), "expires_at": c.get("expires_at"), "revoked_at": c.get("revoked_at"), "term_days": term,
        "answered_by": c.get("given_by_name") or (_person_name(cur, who) if who else None), "answered_as": c.get("answered_as"),
        "declaration_version": c.get("declaration_version"), "seen_at": c.get("seen_at"),
    }


def _shape_request(r: dict) -> dict:
    return {
        "key": f"req-{r['id']}", "kind": "REQUEST", "status": r["status"],
        "request_id": r["id"], "request_kind": r["kind"], "summary": r["summary"],
        "detail": r["detail"] or {}, "proposal_id": r.get("proposal_id"),
        "asked_at": r["created_at"], "respond_by": r.get("respond_by"),
        "responded_at": r.get("responded_at"), "seen_at": r.get("seen_at"),
        "note": r.get("note"), "can_answer": r["status"] == "PENDING",
        "subject_person_id": r.get("subject_person_id"), "attribute": r.get("attribute"),
    }


def _shape_invitation(r: dict) -> dict:
    """A scholarship invitation is only a notice: shown in Approvals so the citizen can find it, but nothing to answer."""
    return {"key": f"invite-{r['id']}", "kind": "INVITATION", "status": "INFO", "can_answer": False,
            "asked_at": r["created_at"], "respond_by": None, "invitation_id": r["id"]}


def _invitations(cur, pid: int) -> list[dict]:
    cur.execute("SELECT id, created_at FROM mdm.invitation WHERE person_id=%s AND kind='APPLY_SCHOLARSHIP' ORDER BY id DESC", (pid,))
    return [_shape_invitation(r) for r in cur.fetchall()]


def _shape_death_notice(cur, r: dict, pid: int) -> dict:
    """A notice to the surviving spouse once an officer has approved contacting her. Nothing to answer; nothing is changed until an officer approves."""
    cur.execute("SELECT o.id, o.name FROM mdm.relationship rl JOIN mdm.person o ON o.id = CASE WHEN rl.person_a=%s THEN rl.person_b ELSE rl.person_a END "
                "WHERE rl.kind='SPOUSE' AND (rl.person_a=%s OR rl.person_b=%s) AND o.life_status='DECEASED' ORDER BY o.id LIMIT 1", (pid, pid, pid))
    d = cur.fetchone() or {}
    stage = "CONTACTED"
    if d:
        cur.execute("SELECT 1 FROM mdm.proposal WHERE person_id=%s AND kind='STOP_PENSION' AND status='APPROVED' LIMIT 1", (d["id"],))
        if cur.fetchone():
            stage = "STOP_APPROVED"
    return {"key": f"death-{r['id']}", "kind": "DEATH_NOTICE", "status": "INFO", "can_answer": False, "asked_at": r["created_at"], "respond_by": None,
            "notice_id": r["id"], "stage": stage, "deceased_name": d.get("name")}


def _death_notices(cur, pid: int) -> list[dict]:
    cur.execute("SELECT id, created_at FROM mdm.invitation WHERE person_id=%s AND kind='DEATH_NOTICE' ORDER BY id DESC", (pid,))
    return [_shape_death_notice(cur, r, pid) for r in cur.fetchall()]


def _expire_requests(cur, pid: int) -> None:
    now = exchange._now(None)
    cur.execute("""UPDATE mdm.citizen_request SET status='EXPIRED'
                   WHERE person_id=%s AND status='PENDING' AND respond_by IS NOT NULL AND respond_by <= %s""", (pid, now))


def list_approvals(cur, ref: str) -> dict:
    pid = person_of(cur, ref)
    _expire_requests(cur, pid)
    cur.execute("SELECT name FROM mdm.person WHERE id=%s", (pid,))
    me = cur.fetchone()
    rows = _consent_rows_for_me(cur, pid)
    by_event: dict[int, list] = {}
    for r in rows:
        if r.get("event_id"):
            by_event.setdefault(r["event_id"], []).append(r)
    items = [_shape_consent_group(cur, eid, rs, pid) for eid, rs in sorted(by_event.items(), reverse=True)]
    items += [_shape_consent_card(cur, r, pid) for r in rows if not r.get("event_id") and r["purpose"] in CARD_PURPOSES]
    cur.execute("SELECT * FROM mdm.citizen_request WHERE person_id=%s ORDER BY id DESC LIMIT 100", (pid,))
    for r in cur.fetchall():
        items.append(_shape_request(r))
    items += _invitations(cur, pid)
    items += _death_notices(cur, pid)
    items.sort(key=lambda i: (0 if i["status"] == "PENDING" else 1, -(i.get("asked_at").timestamp() if i.get("asked_at") else 0)))
    pending = sum(1 for i in items if i["status"] == "PENDING" and i.get("can_answer", True))     # a read-only card is not something to do
    return {"person": me["name"] if me else None, "pending": pending, "items": items}


def summary(cur, ref: str) -> dict:
    data = list_approvals(cur, ref)
    return {"pending": data["pending"]}


def _mark_seen_consents(cur, rows: list[dict]) -> None:
    now = exchange._now(None)
    for r in rows:
        if r["status"] == "PENDING" and not r.get("seen_at"):
            cur.execute("UPDATE mdm.consent SET seen_at=%s WHERE id=%s AND seen_at IS NULL", (now, r["id"]))


def get_approval(cur, ref: str, key: str) -> dict:
    pid = person_of(cur, ref)
    _expire_requests(cur, pid)
    if key.startswith("event-"):
        try:
            eid = int(key.split("-", 1)[1])
        except ValueError:
            raise Refused("Approval not found", 404)
        rows = [r for r in _consent_rows_for_me(cur, pid) if r.get("event_id") == eid]
        if not rows:
            raise Refused("Approval not found", 404)
        _mark_seen_consents(cur, rows)
        rows = [r for r in _consent_rows_for_me(cur, pid) if r.get("event_id") == eid]
        return _shape_consent_group(cur, eid, rows, pid)
    if key.startswith("consent-"):
        try:
            cid = int(key.split("-", 1)[1])
        except ValueError:
            raise Refused("Approval not found", 404)
        rows = [r for r in _consent_rows_for_me(cur, pid) if r["id"] == cid and not r.get("event_id") and r["purpose"] in CARD_PURPOSES]
        if not rows:
            raise Refused("Approval not found", 404)
        _mark_seen_consents(cur, rows)
        rows = [r for r in _consent_rows_for_me(cur, pid) if r["id"] == cid]
        return _shape_consent_card(cur, rows[0], pid)
    if key.startswith("invite-"):
        found = [i for i in _invitations(cur, pid) if i["key"] == key]
        if not found:
            raise Refused("Approval not found", 404)
        return found[0]
    if key.startswith("death-"):
        found = [i for i in _death_notices(cur, pid) if i["key"] == key]
        if not found:
            raise Refused("Approval not found", 404)
        return found[0]
    if key.startswith("req-"):
        try:
            rid = int(key.split("-", 1)[1])
        except ValueError:
            raise Refused("Approval not found", 404)
        cur.execute("SELECT * FROM mdm.citizen_request WHERE id=%s AND person_id=%s", (rid, pid))
        r = cur.fetchone()
        if not r:
            raise Refused("Approval not found", 404)
        if r["status"] == "PENDING" and not r.get("seen_at"):
            cur.execute("UPDATE mdm.citizen_request SET seen_at=now() WHERE id=%s AND seen_at IS NULL", (rid,))
            cur.execute("SELECT * FROM mdm.citizen_request WHERE id=%s", (rid,))
            r = cur.fetchone()
        return _shape_request(r)
    raise Refused("Approval not found", 404)


def _already_answered_msg(cur, rows: list[dict]) -> str:
    answered = [r for r in rows if r.get("responded_at")]
    if not answered:
        return "This approval has already been answered"
    a = max(answered, key=lambda r: r["responded_at"])
    who = a.get("given_by_person_id") or a["person_id"]
    name = a.get("given_by_name") or _person_name(cur, who) or "another parent"
    when = a["responded_at"].date().isoformat() if hasattr(a["responded_at"], "date") else str(a["responded_at"])
    return f"Already answered by {name} on {when}"


def answer_event(cur, ref: str, event_id: int, relationship: str | None, declared: bool,
                 answers: list[dict]) -> dict:
    pid = person_of(cur, ref)
    cur.execute("SELECT 1 FROM mdm.consent WHERE event_id=%s LIMIT 1", (event_id,))
    exists = bool(cur.fetchone())
    rows = [r for r in _consent_rows_for_me(cur, pid) if r.get("event_id") == event_id]
    if not rows:
        raise Refused("This consent request is not yours to answer" if exists else "Approval not found",
                      403 if exists else 404)
    now = exchange._now(None)
    rows = [exchange._expire_if_due(cur, dict(r), now) if r["status"] == "PENDING" else r for r in rows]
    if any(r["status"] != "PENDING" for r in rows if r["id"] in {a.get("consent_id") for a in answers}):
        # any non-pending in the group means first answer won
        if any(r.get("responded_at") for r in rows):
            raise Refused(_already_answered_msg(cur, rows), 409)
    if any(r["status"] == "EXPIRED" for r in rows):
        raise Refused("This approval has expired and cannot be answered", 409)
    if not answers:
        raise Refused("Choose at least one department to answer", 422)
    by_id = {r["id"]: r for r in rows}
    # Validate every line before writing anything, so a bad id cannot leave a half-answered group.
    for a in answers:
        cid = a.get("consent_id")
        if cid not in by_id:
            raise Refused("One of the consent lines is not part of this approval", 422)
        if by_id[cid]["status"] != "PENDING":
            raise Refused(_already_answered_msg(cur, rows), 409)
        if not _can_see_consent(cur, pid, by_id[cid]):
            raise Refused("This consent request is not yours to answer", 403)
        if (a.get("decision") or "").upper() not in ("GRANT", "REFUSE"):
            raise Refused("Each answer must be GRANT or REFUSE", 422)
    grants = [a for a in answers if (a.get("decision") or "").upper() == "GRANT"]
    if grants and not declared:
        raise Refused("Tick the declaration that you are the parent or guardian before approving", 422)
    if grants and (relationship or "").lower() not in ("mother", "father", "guardian"):
        raise Refused("Say whether you are the mother, the father or the guardian", 422)
    rel = (relationship or "").lower() or None
    decl = DECLARATION_VERSION if grants and declared else None
    results = []
    for a in answers:
        cid = a["consent_id"]
        decision = (a.get("decision") or "").upper()
        out = exchange.respond(
            cur, cid, decision, f"citizen:{ref}", "PORTAL", None,
            "Answered by the citizen on the citizen portal", None, a.get("elements"), None, None,
            answered_as=rel, declaration_version=decl if decision == "GRANT" else None,
            answerer_id=pid,
        )
        results.append(out)
    return get_approval(cur, ref, f"event-{event_id}") | {"answered": len(results)}


def answer_consent(cur, ref: str, cid: int, decision: str, elements: list[str] | None,
                   relationship: str | None = None, declared: bool = False) -> dict:
    """Answer a single scholarship consent. Under 18 only a recorded adult parent answers, with the same declaration as a
    birth consent. At 18 only the student answers. Anyone else gets 404 (not visible) or 403 (visible but not theirs to answer)."""
    pid = person_of(cur, ref)
    rows = [r for r in _consent_rows_for_me(cur, pid) if r["id"] == cid and not r.get("event_id") and r["purpose"] in CARD_PURPOSES]
    if not rows:
        raise Refused("Approval not found", 404)
    c = rows[0]
    decision = (decision or "").upper()
    if decision not in ("GRANT", "REFUSE"):
        raise Refused("Each answer must be GRANT or REFUSE", 422)
    if c["status"] != "PENDING":
        raise Refused(_already_answered_msg(cur, rows) if c.get("responded_at") else "This approval has expired and cannot be answered", 409)
    view = _card_view(cur, pid, c)
    if not view["can_answer"]:
        raise Refused("Your parent decides this until you are 18" if view["waiting_for_parent"]
                      else "This consent request is not yours to answer", 403)
    rel, decl = None, None
    if view["minor"] and decision == "GRANT":
        if not declared:
            raise Refused("Tick the declaration that you are the parent or guardian before approving", 422)
        rel = (relationship or "").lower()
        if rel not in ("mother", "father", "guardian"):
            raise Refused("Say whether you are the mother, the father or the guardian", 422)
        decl = DECLARATION_VERSION
    exchange.respond(cur, cid, decision, f"citizen:{ref}", "PORTAL", None, "Answered by the citizen on the citizen portal", None,
                     elements if decision == "GRANT" else None, None, None, answered_as=rel, declaration_version=decl, answerer_id=pid)
    return get_approval(cur, ref, f"consent-{cid}") | {"answered": 1}


def _attr_of(attribute: str | None, detail: dict | None) -> str | None:
    """The detail a request is about: given directly, or named in its detail. Empty means no attribute (older requests)."""
    a = (attribute or (detail or {}).get("attribute") or "").strip().lower()
    return a or None


def raise_request(cur, person_id: int, kind: str, summary: str, detail: dict | None,
                  actor: str, subject_person_id: int | None = None, proposal_id: int | None = None,
                  respond_by=None, attribute: str | None = None) -> dict:
    kind = (kind or "").upper()
    if kind not in REQUEST_KINDS:
        raise Refused("kind must be CONFIRM_DETAILS, LINK_CHILD or LINK_FAMILY_MEMBER")
    if not (summary or "").strip():
        raise Refused("A short summary is required")
    cur.execute("SELECT id FROM mdm.person WHERE id=%s", (person_id,))
    if not cur.fetchone():
        raise Refused("Person not found", 404)
    if subject_person_id:
        cur.execute("SELECT id FROM mdm.person WHERE id=%s", (subject_person_id,))
        if not cur.fetchone():
            raise Refused("Subject person not found", 404)
    detail = detail or {}
    attribute = _attr_of(attribute, detail)
    if attribute:
        # At most one open request per person, detail and kind (also enforced by citizen_request_open_attr_ux).
        cur.execute("SELECT id FROM mdm.citizen_request WHERE person_id=%s AND attribute=%s AND kind=%s AND status='PENDING' LIMIT 1",
                    (person_id, attribute, kind))
        if cur.fetchone():
            raise Refused("There is already an open request to this person about this detail", 409)
    # D4: do not create a steward proposal at raise time for CONFIRM_DETAILS — wait for the citizen to confirm.
    cur.execute("""INSERT INTO mdm.citizen_request
                   (person_id, subject_person_id, kind, summary, detail, proposal_id, respond_by, attribute)
                   VALUES (%s,%s,%s,%s,%s::jsonb,%s,%s,%s) RETURNING *""",
                (person_id, subject_person_id, kind, summary, exchange._js(detail), proposal_id, respond_by, attribute))
    row = cur.fetchone()
    audit.write(cur, actor, "CITIZEN_REQUEST_RAISED", f"citizen_request:{row['id']}",
                {"kind": kind, "person": person_id, "proposal": proposal_id, "attribute": attribute})
    return _shape_request(row)


def _chosen_value(detail: dict, choice: str) -> dict:
    side = detail.get("value_a" if choice == "A" else "value_b")
    if not isinstance(side, dict):
        raise Refused("This request has no first and second value to choose from", 422)
    return side


def answer_request(cur, ref: str, rid: int, decision: str, note: str | None = None,
                   choice: str | None = None, reported_value: str | None = None) -> dict:
    """Answer a request. For CONFIRM_DETAILS about a detail two departments hold differently, choice is A or B
    (the value that is right) or OTHER (neither: reported_value is what it should be).
    A or B creates a CITIZEN_CONFIRM proposal; OTHER or DISPUTE sends a discrepancy to the owning department.
    The person record is never edited here."""
    pid = person_of(cur, ref)
    cur.execute("SELECT * FROM mdm.citizen_request WHERE id=%s FOR UPDATE", (rid,))
    r = cur.fetchone()
    if not r or r["person_id"] != pid:
        raise Refused("Approval not found", 404)
    if r["status"] != "PENDING":
        raise Refused(f"This request is {r['status'].lower()} and cannot be answered", 409)
    decision = (decision or "").upper()
    if decision not in ("CONFIRM", "DISPUTE"):
        raise Refused("decision must be CONFIRM or DISPUTE", 422)
    choice = (choice or "").upper() or None
    if choice and choice not in ("A", "B", "OTHER"):
        raise Refused("choice must be A, B or OTHER", 422)
    detail = r["detail"] or {}
    two_values = r["kind"] == "CONFIRM_DETAILS" and isinstance(detail.get("value_a"), dict) and isinstance(detail.get("value_b"), dict)
    if two_values and choice == "OTHER":
        decision = "DISPUTE"                       # "neither" is a dispute with a typed value
    if decision == "CONFIRM" and two_values and choice not in ("A", "B"):
        raise Refused("Say which value is right: the first or the second", 422)
    status = "CONFIRMED" if decision == "CONFIRM" else "DISPUTED"
    proposal_id = r.get("proposal_id")
    discrepancy = None
    # Confirming creates a steward proposal (CITIZEN_CONFIRM). Never edits the person row.
    if decision == "CONFIRM" and not proposal_id:
        from . import events
        pdetail = dict(detail)
        if two_values:
            pdetail["chosen"] = {"choice": choice, **_chosen_value(detail, choice)}
        proposal_id = events._propose(
            cur, None, None, "CITIZEN_CONFIRM", "MDM steward", pid, r["summary"], pdetail,
        )
    if decision == "DISPUTE" and proposal_id:
        cur.execute("""UPDATE mdm.proposal SET status='WITHDRAWN', note=%s, decided_at=now()
                       WHERE id=%s AND status='PROPOSED'""",
                    (note or "Disputed by the citizen", proposal_id))
    if decision == "DISPUTE" and two_values and r.get("attribute"):
        # A dispute goes to the department that owns the value, with the typed value. Status ROUTED, channel PORTAL.
        typed = (reported_value or "").strip()
        if not typed:
            raise Refused("Type the correct value", 422)
        a, b = detail["value_a"], detail["value_b"]
        owner = ops.ATTR_AUTH.get(r["attribute"]) or (a.get("department") if a.get("department") in exchange.SYSTEMS else None)
        shown = f"{a.get('value')} ({a.get('department_name') or a.get('department')}) / {b.get('value')} ({b.get('department_name') or b.get('department')})"
        discrepancy = ops.raise_discrepancy(cur, pid, r["attribute"], shown, typed, note, f"citizen:{ref}",
                                            channel="PORTAL", authoritative_system=owner)
    cur.execute("""UPDATE mdm.citizen_request
                   SET status=%s, responded_at=now(), note=%s, proposal_id=COALESCE(proposal_id, %s)
                   WHERE id=%s RETURNING *""", (status, note, proposal_id, rid))
    row = cur.fetchone()
    # Snapshot the person so a test can prove the name did not change.
    cur.execute("SELECT name, birth_year, gender FROM mdm.person WHERE id=%s", (pid,))
    person_snap = cur.fetchone()
    audit.write(cur, f"citizen:{ref}", f"CITIZEN_REQUEST_{status}", f"citizen_request:{rid}",
                {"note": note, "proposal": row.get("proposal_id"), "choice": choice,
                 "discrepancy": discrepancy["id"] if discrepancy else None})
    out = _shape_request(row)
    out["person_snapshot"] = person_snap
    if discrepancy:
        out["discrepancy_id"] = discrepancy["id"]
        out["sent_to"] = discrepancy["routed_to_name"]
        out["receipt"] = (f"We have sent your correction to {discrepancy['routed_to_name']}. Your record changes when they correct "
                          "their own. You will be told.")
    return out


# ------------------------------------------------------------------ report a wrong detail (citizen starts it)
ATTR_LABELS = {"name": "Name", "date_of_birth": "Date of birth", "gender": "Gender", "life_status": "Death recorded",
               "address": "Address", "ration_card": "Ration card", "income": "Income", "category": "Social category", "land": "Land",
               "marital_status": "Marital status", "electricity": "Electricity connection", "pension": "Pension",
               "scholarship": "Scholarship", "housing": "Housing"}
REPORT_STATUS_LABELS = {"ROUTED": "Sent to the department", "CORRECTED_AT_SOURCE": "Corrected at the source",
                        "CONFIRMED_AS_IS": "Kept as it was", "REJECTED": "Not accepted"}


def _current_value(cur, pid: int, attribute: str) -> str | None:
    """What the master record shows now, from the person's own golden record only."""
    cur.execute("SELECT name, dob, birth_year, gender, address, village, mandal, district, life_status FROM mdm.person WHERE id=%s", (pid,))
    p = cur.fetchone()
    if not p:
        return None
    if attribute == "name":
        return p["name"]
    if attribute == "date_of_birth":
        return p["dob"].isoformat() if p["dob"] else (f"Year {p['birth_year']}" if p["birth_year"] else None)
    if attribute == "gender":
        return p["gender"]
    if attribute == "address":
        return ", ".join(x for x in (p["address"], p["village"], p["mandal"], p["district"]) if x) or None
    if attribute == "life_status":
        return p["life_status"]
    if attribute == "ration_card":
        cur.execute("SELECT ration_card FROM mdm.source_record WHERE person_id=%s AND ration_card IS NOT NULL ORDER BY id LIMIT 1", (pid,))
        r = cur.fetchone()
        return r["ration_card"] if r else None
    return None


def report_options(cur, ref: str) -> dict:
    """The details a citizen may report, each with what the master record shows now for them."""
    pid = person_of(cur, ref)
    return {"items": [{"attribute": a, "label": ATTR_LABELS.get(a, a), "current_value": _current_value(cur, pid, a),
                       "department": ops.ATTR_AUTH[a], "department_name": exchange.SYSTEMS.get(ops.ATTR_AUTH[a])}
                      for a in ops.ATTR_AUTH]}


def _shape_report(d: dict) -> dict:
    trail = [{"status": "ROUTED", "label": REPORT_STATUS_LABELS["ROUTED"], "at": d["raised_at"]}]
    if d["status"] != "ROUTED":
        trail.append({"status": d["status"], "label": REPORT_STATUS_LABELS.get(d["status"], d["status"]), "at": d.get("resolved_at")})
    return {"id": d["id"], "discrepancy_id": d["id"], "key": f"rep-{d['id']}", "attribute": d["attribute"],
            "attribute_label": ATTR_LABELS.get(d["attribute"], d["attribute"]), "current_value": d.get("current_value"),
            "reported_value": d["reported_value"], "reason": d.get("reason"), "department": d["authoritative_system"],
            "department_name": exchange.SYSTEMS.get(d["authoritative_system"], d["authoritative_system"]),
            "status": d["status"], "status_label": REPORT_STATUS_LABELS.get(d["status"], d["status"]),
            "department_note": d.get("resolution_note"), "raised_at": d["raised_at"], "resolved_at": d.get("resolved_at"),
            "trail": trail, "channel": d.get("channel")}


def report_wrong_detail(cur, ref: str, attribute: str, reported_value: str, reason: str | None = None) -> dict:
    """A citizen says a detail of their own record is wrong. Routed to the department that owns it (channel PORTAL);
    the master record is not changed. One open report per detail."""
    pid = person_of(cur, ref)
    attribute = (attribute or "").strip().lower()
    if attribute not in ops.ATTR_AUTH:
        raise Refused("Choose one of the details in the list", 422)
    if not (reported_value or "").strip():
        raise Refused("Type what it should be", 422)
    out = ops.raise_discrepancy(cur, pid, attribute, _current_value(cur, pid, attribute), reported_value, (reason or "").strip() or None,
                                f"citizen:{ref}", channel="PORTAL")
    cur.execute("SELECT * FROM mdm.discrepancy WHERE id=%s", (out["id"],))
    shaped = _shape_report(cur.fetchone())
    shaped["receipt"] = (f"We have sent your correction to {shaped['department_name']}. Your record changes when they correct "
                         "their own. You will be told.")
    return shaped


def list_reports(cur, ref: str) -> dict:
    """The caller's own reports with the status trail. Never anyone else's."""
    pid = person_of(cur, ref)
    cur.execute("""SELECT * FROM mdm.discrepancy WHERE person_id=%s AND kind='DISCREPANCY' AND channel='PORTAL'
                   ORDER BY id DESC LIMIT 100""", (pid,))
    return {"items": [_shape_report(d) for d in cur.fetchall()]}


# ------------------------------------------------------------------ confirm a detail departments disagree on (X2)
CONFIRM_SUMMARY = {"name": "Your name is recorded differently by two departments",
                   "date_of_birth": "Your date of birth is recorded differently by two departments",
                   "address": "Your address is recorded differently by two departments"}
CONFIRM_NOTICE_TITLE = "దయచేసి మీ వివరాలను నిర్ధారించండి / Please confirm a detail"
CONFIRM_NOTICE_BODY = ("రెండు శాఖలు మీ వివరాలను వేరుగా నమోదు చేశాయి. పౌర పోర్టల్‌లో అనుమతులు తెరిచి సరైనది ఎంచుకోండి. / "
                       "Two departments record one of your details differently. Open Approvals in the citizen portal and choose the right one.")
LINKED_WITH_CONFIDENCE = ("ANCHOR", "AUTO_LINKED", "STEWARD_LINKED")


def _dept(source: str) -> tuple[str | None, str | None]:
    code = ops.SOURCE_SYSTEM.get(source)
    return code, exchange.SYSTEMS.get(code, code) if code else None


def _addr_disagree(a: str, b: str) -> bool:
    from rapidfuzz import fuzz
    h1, r1 = addr_norm(a)
    h2, r2 = addr_norm(b)
    sim = fuzz.token_set_ratio(r1, r2) / 100
    return sim < 0.5 or bool(h1 and h2 and h1 != h2 and sim < 0.85)


def _disagreements(recs: list[dict]) -> list[dict]:
    """Attributes where two linked department records disagree, each with the value and department on both sides."""
    from .survivorship import DEFAULT_SURVIVORSHIP, NAME_CONFLICT_SIMILARITY, clean_name
    from rapidfuzz import fuzz
    out = []

    def side(v, src):
        dept, dept_name = _dept(src)
        return {"value": v, "department": dept or src, "department_name": dept_name or src, "source": src}

    # name
    named = [(clean_name(r["name"]), r["source"]) for r in recs if r.get("name") and r.get("rtype") != "MARRIAGE_BRIDE"]
    named.sort(key=lambda c: DEFAULT_SURVIVORSHIP["name"].index(c[1]) if c[1] in DEFAULT_SURVIVORSHIP["name"] else 99)
    a = named[0] if named else None
    for b in named[1:]:
        if b[1] == a[1]:
            continue
        ka, kb = name_key(a[0]), name_key(b[0])
        if ka and kb and not (ka == kb or ka in kb or kb in ka or fuzz.ratio(ka, kb) >= NAME_CONFLICT_SIMILARITY):
            out.append({"attribute": "name", "a": side(*a), "b": side(*b)})
            break
    # date of birth
    dobs = [(r["dob"].isoformat(), r["source"]) for r in recs if r.get("dob")]
    dobs.sort(key=lambda c: DEFAULT_SURVIVORSHIP["dob"].index(c[1]) if c[1] in DEFAULT_SURVIVORSHIP["dob"] else 99)
    for b in dobs[1:]:
        if b[0] != dobs[0][0] and b[1] != dobs[0][1]:
            out.append({"attribute": "date_of_birth", "a": side(*dobs[0]), "b": side(*b)})
            break
    # address
    addrs = [(r["address"], r["source"]) for r in recs if r.get("address") and r["source"] in DEFAULT_SURVIVORSHIP["address"]]
    addrs.sort(key=lambda c: DEFAULT_SURVIVORSHIP["address"].index(c[1]))
    for b in addrs[1:]:
        if b[1] != addrs[0][1] and _addr_disagree(addrs[0][0], b[0]):
            out.append({"attribute": "address", "a": side(*addrs[0]), "b": side(*b)})
            break
    return out


def auto_confirm_scan(cur, actor: str) -> dict:
    """Raise CONFIRM_DETAILS for a signed-in person whose records, linked at or above the automatic threshold, disagree on
    name, date of birth or address. Never about a doubtful candidate (X2). Once per person and attribute; safe to run again."""
    auto = MatchConfig().auto
    cur.execute("SELECT DISTINCT person_id FROM mdm.citizen_link")
    persons = [r["person_id"] for r in cur.fetchall()]
    respond_by = exchange._now(None) + timedelta(days=int(exchange.current(cur).get("consent_response_days") or 14))
    raised, skipped, ids = 0, 0, []
    if persons:
        cur.execute("""SELECT id, person_id, source, rtype, name, dob, address, as_of, link_status, score FROM mdm.source_record
                       WHERE person_id = ANY(%s) AND (link_status = ANY(%s) OR (score >= %s AND link_status NOT IN ('IN_REVIEW','NEW','STEWARD_SEPARATE')))
                       ORDER BY id""", (persons, list(LINKED_WITH_CONFIDENCE), auto))
        by_person: dict[int, list] = {}
        for r in cur.fetchall():
            by_person.setdefault(r["person_id"], []).append(r)
    else:
        by_person = {}
    for pid in persons:
        for d in _disagreements(by_person.get(pid, [])):
            attr = d["attribute"]
            fp = hashlib.sha1(json.dumps([attr, d["a"]["value"], d["b"]["value"]], sort_keys=True).encode()).hexdigest()[:12]
            cur.execute("""SELECT 1 FROM mdm.citizen_request WHERE person_id=%s AND kind='CONFIRM_DETAILS' AND attribute=%s
                             AND (status='PENDING' OR detail->>'fingerprint'=%s) LIMIT 1""", (pid, attr, fp))
            if cur.fetchone():
                skipped += 1
                continue
            detail = {"attribute": attr, "value_a": d["a"], "value_b": d["b"], "fingerprint": fp}
            req = raise_request(cur, pid, "CONFIRM_DETAILS", CONFIRM_SUMMARY[attr], detail, actor, respond_by=respond_by, attribute=attr)
            notify.send(cur, pid, CONFIRM_NOTICE_TITLE, CONFIRM_NOTICE_BODY, f"req-{req['request_id']}")
            raised += 1
            ids.append(req["request_id"])
    return {"scanned": len(persons), "raised": raised, "skipped": skipped, "request_ids": ids}


# ------------------------------------------------------------------ household from master data (My Family)

_REL_RANK = {"SELF": 0, "SPOUSE": 1, "CHILD": 2, "PARENT": 3, "SAME_CARD": 4}
_AGE_BANDS = ((1, "0 to 1"), (17, "2 to 17"), (59, "18 to 59"), (None, "60 and over"))


def _age_band(age: int | None) -> str | None:
    if age is None:
        return None
    for top, label in _AGE_BANDS:
        if top is None or age <= top:
            return label
    return "60 and over"


def _mask_card(card: str) -> str:
    card = (card or "").strip()
    return card[-4:] if card else ""


def _name_te(cur, name: str | None) -> str | None:
    """Telugu from translation memory or cache only; never call the machine translator for a name."""
    source = translate.norm(name or "")
    if not source:
        return None
    cur.execute("SELECT translated FROM mdm.translation_memory WHERE src_lang='en' AND tgt_lang='te' AND text_sha=%s",
                (translate.sha(source),))
    r = cur.fetchone()
    if r and r["translated"]:
        return r["translated"]
    days = int(os.getenv("MT_CACHE_DAYS", "30"))
    cur.execute("""SELECT translated FROM mdm.translation_cache
                   WHERE src_lang='en' AND tgt_lang='te' AND text_sha=%s
                     AND created_at > now() - make_interval(days => %s)""",
                (translate.sha(source), days))
    r = cur.fetchone()
    return r["translated"] if r and r["translated"] else None


def _birth_registration(cur, pid: int) -> tuple[str | None, str | None]:
    """(registered_via, added_on) when the person's master record came from a recent crs BIRTH event."""
    cur.execute("""SELECT e.received_at, e.payload->>'registration_date' AS reg_date
                   FROM mdm.event e
                   JOIN mdm.source_record r ON r.source='crs' AND r.rtype='BIRTH' AND r.source_rid=e.event_key
                   WHERE r.person_id=%s AND e.event_type='BIRTH_REGISTERED'
                     AND e.received_at > now() - interval '90 days'
                   ORDER BY e.id DESC LIMIT 1""", (pid,))
    r = cur.fetchone()
    if not r:
        return None, None
    added = r["reg_date"]
    if not added and r["received_at"]:
        added = r["received_at"].date().isoformat() if hasattr(r["received_at"], "date") else str(r["received_at"])[:10]
    return "BIRTH_REGISTRATION", added


def _classify(cur, me: int, other: int) -> str:
    if other == me:
        return "SELF"
    cur.execute("""SELECT kind, person_a, person_b FROM mdm.relationship
                   WHERE kind IN ('SPOUSE','PARENT_OF') AND
                         ((person_a=%s AND person_b=%s) OR (person_a=%s AND person_b=%s))""",
                (me, other, other, me))
    rows = cur.fetchall()
    if any(r["kind"] == "SPOUSE" for r in rows):
        return "SPOUSE"
    for r in rows:
        if r["kind"] != "PARENT_OF":
            continue
        if r["person_a"] == me and r["person_b"] == other:
            return "CHILD"
        if r["person_a"] == other and r["person_b"] == me:
            return "PARENT"
    return "SAME_CARD"


def _household_ids(cur, pid: int) -> tuple[list[int], list[str]]:
    """Wrap uc5.household_members and also keep parents and children of any age for the citizen view."""
    ids, cards = uc5.household_members(cur, pid)
    seen = set(ids)
    cur.execute("""SELECT CASE WHEN person_a=%s THEN person_b ELSE person_a END AS other
                   FROM mdm.relationship
                   WHERE kind IN ('SPOUSE','PARENT_OF') AND (person_a=%s OR person_b=%s)""",
                (pid, pid, pid))
    for r in cur.fetchall():
        seen.add(r["other"])
    ordered = [pid] + sorted(i for i in seen if i != pid)
    if len(ordered) > uc5.HOUSEHOLD_CAP:
        ordered = [pid] + [i for i in ordered if i != pid][:uc5.HOUSEHOLD_CAP - 1]
    return ordered, cards


def _detail(rel: str, gender: str | None) -> str | None:
    """The relationship in family words (SON, DAUGHTER, FATHER, MOTHER) when the person's recorded gender allows it, otherwise None."""
    pair = {"CHILD": ("SON", "DAUGHTER"), "PARENT": ("FATHER", "MOTHER")}.get(rel)
    return (pair[0] if gender == "M" else pair[1]) if pair and gender in ("M", "F") else None


def household(cur, ref: str) -> dict:
    """The caller's household from master data: spouse, children, parents, and ration-card sharers.

    Returns only opaque refs, display names, relationship to the caller, age band and birth-registration flags.
    Never returns income, identity, phone, address, date of birth or a master person id.
    """
    pid = person_of(cur, ref)
    ids, cards = _household_ids(cur, pid)
    adult = int(exchange.current(cur).get("adult_age") or 18)
    on_card: set[int] = set()
    if cards:
        cur.execute("""SELECT DISTINCT person_id FROM mdm.source_record
                       WHERE source='pds_view' AND ration_card = ANY(%s) AND person_id = ANY(%s)""",
                    (cards, ids))
        on_card = {r["person_id"] for r in cur.fetchall()}
    cur.execute("SELECT id, name, gender FROM mdm.person WHERE id = ANY(%s)", (ids,))
    rows = cur.fetchall()
    names = {r["id"]: r["name"] for r in rows}
    genders = {r["id"]: (r["gender"] or "").upper()[:1] for r in rows}      # used only to word the relationship; never returned
    refs = {i: secrets.token_urlsafe(12) for i in ids}
    items = []
    for other in ids:
        rel = _classify(cur, pid, other)
        age = exchange.person_age(cur, other)
        via, added = _birth_registration(cur, other) if rel == "CHILD" else (None, None)
        raw_name = names.get(other) or "Member"
        show_name = raw_name
        if rel == "SAME_CARD" and age is not None and age < adult:
            show_name = "Member"
        item = {
            "person_ref": refs[other],
            "name": show_name,
            "relationship_to_me": rel,
            "relationship_detail": _detail(rel, genders.get(other)),
            "age": age,                                     # a whole number of years; the date of birth is never returned
            "age_band": _age_band(age),
            "registered_via": via,
            "on_ration_card": other in on_card,
            "added_on": added,
        }
        te = _name_te(cur, raw_name) if show_name != "Member" else None
        if te:
            item["name_te"] = te
        items.append({"_age": age if age is not None else 999, **item})
    items.sort(key=lambda x: (_REL_RANK.get(x["relationship_to_me"], 9),
                              x["_age"] if x["relationship_to_me"] == "CHILD" else 0,
                              x["name"] or "", x["person_ref"]))
    clean = [{k: v for k, v in it.items() if k != "_age"} for it in items]
    return {"items": clean, "ration_cards": [_mask_card(c) for c in cards if c], "count": len(clean)}
