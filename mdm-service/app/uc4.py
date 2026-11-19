"""UC4 turning 18 and scholarship eligibility.

What this module does, and what it never does:
- It turns a scholarship check that could not be answered (certificate expired, certificates disagree, applicant from
  another state) into ONE open item for a person, per person and kind. The item closes when the situation clears.
- It runs the daily job: consent expiry, majority handover for everybody at or over the adult age who still has a guardian's
  consent (catch-up included), invitations to apply, and income certificate expiry reminders. Safe to run twice.
- It never enrols anybody, never edits a certificate and never picks a value when certificates disagree.
- Nothing returned to an officer carries an income or category value: only counts, references and states.
"""
from __future__ import annotations
import json
from datetime import date, timedelta

from . import audit, exchange, feed, notify
from .stewardship import Refused
from .survivorship import REF_DATE

PURPOSE = "SCHOLARSHIP_ELIGIBILITY"
APPLY_KIND = "APPLY_SCHOLARSHIP"
UC4_KINDS = ("RENEW_CERTIFICATE", "SETTLE_SOURCE_CONFLICT", "MANUAL_ROUTE")
KIND_FOR_OUTCOME = {"EXPIRED_SOURCE": "RENEW_CERTIFICATE", "CONFLICT": "SETTLE_SOURCE_CONFLICT"}
OWNER = {"RENEW_CERTIFICATE": "Revenue", "SETTLE_SOURCE_CONFLICT": "Revenue", "MANUAL_ROUTE": "Education / scholarship"}
MAX_INVITE = 1000

# Notices to the citizen: Telugu first, then English, the same shape as the other notices.
INVITE_TITLE = "స్కాలర్‌షిప్‌కు దరఖాస్తు చేయడానికి ఆహ్వానం / An invitation to apply for a scholarship"
INVITE_BODY = ("మీకు త్వరలో 18 ఏళ్లు నిండుతాయి. మీరు స్కాలర్‌షిప్‌కు దరఖాస్తు చేసుకోవచ్చు. ఇది కేవలం ఆహ్వానం; ఏ అనుమతి కోరలేదు, ఇవ్వలేదు. / "
               "You are about to turn 18 and can apply for a scholarship. This is only an invitation; no permission has been asked or given.")
HANDOVER_TITLE = "మీకు ఇప్పుడు 18 ఏళ్లు / You are now 18"
HANDOVER_BODY = ("మీకు ఇప్పుడు 18 ఏళ్లు. మీ తల్లిదండ్రుల అనుమతి ముగిసింది. ఇంకా తనిఖీ కావాలంటే, దయచేసి మీరే నిర్ణయించండి. / "
                 "You are now 18. Your parent's permission has ended. If you still want the check, please decide for yourself.")
EXPIRY_TITLE = "మీ ఆదాయ ధ్రువపత్రం త్వరలో ముగుస్తుంది / Your income certificate ends soon"
EXPIRY_BODY = ("మీ ఆదాయ ధ్రువపత్రం 30 రోజుల్లో ముగుస్తుంది. స్కాలర్‌షిప్ కోసం ముందుగానే జారీ చేసిన కార్యాలయంలో పునరుద్ధరించండి. / "
               "Your income certificate ends within 30 days. Please renew it with the issuing office before you apply for a scholarship.")
RENEW_TITLE = "మీ ధ్రువపత్రం గడువు ముగిసింది / Your certificate has expired"
RENEW_BODY = {
    "INCOME_AT_MOST": ("మీ ఆదాయ ధ్రువపత్రం గడువు ముగిసింది. దయచేసి జారీ చేసిన కార్యాలయంలో దాన్ని పునరుద్ధరించండి. / "
                       "Your income certificate has expired. Please renew it with the issuing office."),
    "CATEGORY_IS": ("మీ కులం ధ్రువపత్రం గడువు ముగిసింది. దయచేసి జారీ చేసిన కార్యాలయంలో దాన్ని పునరుద్ధరించండి. / "
                    "Your category certificate has expired. Please renew it with the issuing office."),
}


def _js(x) -> str:
    return json.dumps(x, default=str, ensure_ascii=False)


def _on(as_of) -> date:
    """The calendar date the job runs for: as_of when given (the demo clock), else the registry date used for every age."""
    return exchange._now(as_of).date() if as_of else REF_DATE


# ------------------------------------------------------------------ non-answers become work for a person
def _cert_refs(cur, pid: int, question: str, expired: bool) -> list[str]:
    """References (never values) of the certificates behind a non-answer, so the issuing office can find them."""
    rtype = "CASTE" if question == "CATEGORY_IS" else "INCOME"
    cur.execute("SELECT source_rid, payload FROM mdm.source_record WHERE person_id=%s AND source='revenue_certificates' AND rtype=%s ORDER BY id",
                (pid, rtype))
    refs = []
    for r in cur.fetchall():
        p = r["payload"] or {}
        ok = (p.get("status") or "ACTIVE") == "ACTIVE" and (not p.get("valid_until") or str(p["valid_until"])[:10] >= REF_DATE.isoformat())
        if ok != expired:
            refs.append(r["source_rid"])
    return refs[:5]


def raise_non_answer(cur, person_id: int, outcome: str, detail: dict | None, actor: str) -> dict | None:
    """One open proposal per person and kind. A second call for the same person and kind returns the open one."""
    detail = detail or {}
    kind = KIND_FOR_OUTCOME.get(outcome)
    if outcome == "NO_RECORD" and detail.get("other_state"):
        kind = "MANUAL_ROUTE"
    if not kind:
        return None
    cur.execute("SELECT id FROM mdm.proposal WHERE person_id=%s AND kind=%s AND status='PROPOSED' ORDER BY id LIMIT 1", (person_id, kind))
    ex = cur.fetchone()
    if ex:
        return {"id": ex["id"], "kind": kind, "existing": True}
    cur.execute("SELECT name FROM mdm.person WHERE id=%s", (person_id,))
    p = cur.fetchone()
    if not p:
        raise Refused("Person not found", 404)
    name = p["name"] or "this person"
    question = detail.get("question") or "INCOME_AT_MOST"
    label = "category" if question == "CATEGORY_IS" else "income"
    d = {"outcome": outcome, "question": question, "purpose": PURPOSE}
    if kind == "RENEW_CERTIFICATE":
        summary = f"The {label} certificate of {name} has expired: ask the citizen to renew it"
        d["certificate_refs"] = _cert_refs(cur, person_id, question, expired=True)
    elif kind == "SETTLE_SOURCE_CONFLICT":
        summary = f"The {label} certificates of {name} disagree: ask the issuing office to re-check"
        d["certificate_refs"] = _cert_refs(cur, person_id, question, expired=False)
    else:
        summary = f"{name} is an applicant from another state: route the check by hand"
        d["other_state"] = True
    from . import events
    pid = events._propose(cur, None, "UC4", kind, OWNER[kind], person_id, summary, d)
    audit.write(cur, actor, "UC4_ITEM_RAISED", f"proposal:{pid}", {"kind": kind, "person": person_id, "outcome": outcome})
    return {"id": pid, "kind": kind, "existing": False}


def close_non_answer(cur, person_id: int, kind: str | None = None, actor: str = "system", question: str | None = None) -> int:
    """Close the open UC4 items of a person when the situation clears (a later answer). Returns how many were closed."""
    where, p = ["person_id=%s", "status='PROPOSED'", "kind = ANY(%s)"], [person_id, [kind] if kind else list(UC4_KINDS)]
    if question:
        where.append("(detail->>'question' IS NULL OR detail->>'question'=%s)")
        p.append(question)
    cur.execute(f"SELECT id, kind FROM mdm.proposal WHERE {' AND '.join(where)} FOR UPDATE", p)
    rows = cur.fetchall()
    for r in rows:
        cur.execute("UPDATE mdm.proposal SET status='WITHDRAWN', note=%s, decided_by=%s, decided_at=now() WHERE id=%s AND status='PROPOSED'",
                    ("Closed: a later check was answered, so nothing more is needed", actor, r["id"]))
        audit.write(cur, actor, "UC4_ITEM_CLOSED", f"proposal:{r['id']}", {"kind": r["kind"], "person": person_id})
    return len(rows)


def _delivery_to_revenue(cur, pr: dict, purpose: str, message: str, extra: dict, actor: str) -> int:
    """Record one delivery to the issuing department (revenue) with the person and certificate reference, and open its notice."""
    detail = {"proposal": pr["id"], "person_id": pr["person_id"], "certificate_refs": (pr.get("detail") or {}).get("certificate_refs") or [],
              "message": message, **extra}
    cur.execute("INSERT INTO mdm.delivery (event_id, consent_id, person_id, purpose, system, kind, status, attempts, detail) "
                "VALUES (NULL,NULL,%s,%s,'revenue','EVENT','DELIVERED',1,%s::jsonb) RETURNING id", (pr["person_id"], purpose, _js(detail)))
    did = cur.fetchone()["id"]
    exchange.ledger(cur, "EVENT", "mdm", actor, purpose, pr["person_id"], None, "certificate follow-up delivered", "ANSWERED",
                    {"system": "revenue", "proposal": pr["id"], "attempt": 1})
    feed.open_for_delivery(cur, did)
    return did


def on_approve_renew_certificate(cur, pr: dict, actor: str) -> dict:
    """Approving CERT_EXPIRED: one notice to the citizen and one delivery to revenue. A certificate is never edited."""
    question = (pr.get("detail") or {}).get("question") or "INCOME_AT_MOST"
    sent = notify.send(cur, pr["person_id"], RENEW_TITLE, RENEW_BODY.get(question, RENEW_BODY["INCOME_AT_MOST"]), f"proposal-{pr['id']}")
    did = _delivery_to_revenue(cur, pr, "RENEW_CERTIFICATE",
                               "The citizen has been asked to renew an expired certificate with the issuing office. Nothing was changed.", {}, actor)
    audit.write(cur, actor, "UC4_RENEW_NOTICE", f"proposal:{pr['id']}", {"person": pr["person_id"], "citizen_notified": bool(sent), "delivery": did})
    return {"citizen_notified": bool(sent), "delivery_id": did}


def on_approve_settle_conflict(cur, pr: dict, actor: str, note: str | None) -> dict:
    """Approving CERT_CONFLICT: the officer's reason goes to revenue with the certificate references. No value is chosen."""
    did = _delivery_to_revenue(cur, pr, "SETTLE_SOURCE_CONFLICT",
                               "Certificates for this person disagree. Please re-check them. No value was chosen here.",
                               {"officer_reason": (note or "").strip()}, actor)
    audit.write(cur, actor, "UC4_CONFLICT_REFERRED", f"proposal:{pr['id']}", {"person": pr["person_id"], "delivery": did})
    return {"delivery_id": did}


# ------------------------------------------------------------------ invitations
def _on_portal(cur, pid: int) -> bool:
    cur.execute("SELECT 1 FROM mdm.source_record WHERE person_id=%s AND source='student_portal' LIMIT 1", (pid,))
    return bool(cur.fetchone())


def _invited(cur, pid: int, kind: str = APPLY_KIND) -> bool:
    cur.execute("SELECT 1 FROM mdm.invitation WHERE person_id=%s AND kind=%s", (pid, kind))
    return bool(cur.fetchone())


def turning_candidates(cur, on: date, within_days: int = 30, adult: int | None = None, linked_only: bool = False, limit: int = 1000) -> list[int]:
    """People who turn the adult age within the next N days, not on the scholarship portal and not yet invited."""
    adult = adult or int(exchange.current(cur).get("adult_age") or 18)
    cur.execute(f"""SELECT p.id FROM mdm.person p
                    WHERE p.dob IS NOT NULL
                      AND (p.dob + make_interval(years => %s))::date > %s AND (p.dob + make_interval(years => %s))::date <= %s
                      AND NOT EXISTS (SELECT 1 FROM mdm.source_record r WHERE r.person_id=p.id AND r.source='student_portal')
                      AND NOT EXISTS (SELECT 1 FROM mdm.invitation i WHERE i.person_id=p.id AND i.kind=%s)
                      {"AND EXISTS (SELECT 1 FROM mdm.citizen_link l WHERE l.person_id=p.id)" if linked_only else ""}
                    ORDER BY p.id LIMIT %s""", (adult, on, adult, on + timedelta(days=within_days), APPLY_KIND, limit))
    return [r["id"] for r in cur.fetchall()]


def _worklist_as_of(as_of=None) -> date:
    return _on(as_of) if as_of else REF_DATE


def turning_18_worklist(cur, q=None, district=None, identity=None, income_state=None, on_portal=None,
                        consent=None, invited=None, turns_from=None, turns_to=None,
                        sort=None, dir="asc", limit=25, offset=0, as_of=None,
                        inviteable_only=False) -> dict:
    """People in the turning-18 age band with search, filters, sort, paging and summary counts.

    Consent status is computed in SQL (latest SCHOLARSHIP_ELIGIBILITY consent) so it can be filtered and sorted
    with the other columns. Sortable: person, born, turns_18, income, consent, portal.
    """
    on = _worklist_as_of(as_of)
    lo, hi = on.replace(year=on.year - 19), on.replace(year=on.year - 17)
    limit = max(1, min(int(limit or 25), 200))
    offset = max(0, int(offset or 0))
    adult = int(exchange.current(cur).get("adult_age") or 18)
    on_lit = on.isoformat()

    identity_expr = "EXISTS (SELECT 1 FROM mdm.source_record r WHERE r.person_id=p.id AND r.source='identity_reference')"
    portal_expr = "EXISTS (SELECT 1 FROM mdm.source_record r WHERE r.person_id=p.id AND r.source='student_portal')"
    invited_expr = f"EXISTS (SELECT 1 FROM mdm.invitation i WHERE i.person_id=p.id AND i.kind='{APPLY_KIND}')"
    income_expr = f"""
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM mdm.source_record r WHERE r.person_id=p.id AND r.rtype='INCOME') THEN 'none'
        WHEN (SELECT r.payload->>'valid_until' FROM mdm.source_record r
              WHERE r.person_id=p.id AND r.rtype='INCOME' ORDER BY r.as_of DESC NULLS LAST LIMIT 1) < '{on_lit}' THEN 'expired'
        ELSE 'valid'
      END
    """
    consent_expr = f"""
      CASE
        WHEN cons.status IS NULL THEN 'none'
        WHEN cons.status = 'PENDING' AND (p.dob + make_interval(years => {adult}))::date <= DATE '{on_lit}' THEN 'handover_pending'
        WHEN cons.status = 'PENDING' THEN 'parent_asked'
        WHEN cons.status = 'GRANTED' AND (cons.c_person_id <> p.id
             OR (cons.given_by_person_id IS NOT NULL AND cons.given_by_person_id <> p.id)) THEN 'parent_allowed'
        WHEN cons.status = 'GRANTED' THEN 'student_allowed'
        WHEN cons.status = 'REFUSED' THEN 'refused'
        ELSE 'ended'
      END
    """

    fsql, fp = [], []
    if q and str(q).strip():
        needle = f"%{str(q).strip()}%"
        fsql.append("(p.name ILIKE %s OR p.mdm_id ILIKE %s OR COALESCE(p.district,'') ILIKE %s)")
        fp += [needle, needle, needle]
    if district and str(district).strip():
        fsql.append("p.district = %s"); fp.append(str(district).strip())
    if identity in ("yes", "no", True, False, "true", "false", "1", "0"):
        want = identity in ("yes", True, "true", "1")
        fsql.append(("" if want else "NOT ") + f"({identity_expr})")
    if income_state in ("valid", "expired", "none"):
        fsql.append(f"({income_expr}) = %s"); fp.append(income_state)
    if on_portal in ("yes", "no", "on", "not", True, False, "true", "false", "1", "0"):
        want = on_portal in ("yes", "on", True, "true", "1")
        fsql.append(("" if want else "NOT ") + f"({portal_expr})")
    if invited in ("yes", "no", True, False, "true", "false", "1", "0"):
        want = invited in ("yes", True, "true", "1")
        fsql.append(("" if want else "NOT ") + f"({invited_expr})")
    if turns_from:
        fsql.append("(p.dob + interval '18 years')::date >= %s"); fp.append(str(turns_from)[:10])
    if turns_to:
        fsql.append("(p.dob + interval '18 years')::date <= %s"); fp.append(str(turns_to)[:10])
    if inviteable_only:
        fsql.append(f"NOT ({portal_expr})")
        fsql.append(f"NOT ({invited_expr})")
    where_extra = (" AND " + " AND ".join(fsql)) if fsql else ""

    consent_filter = consent if consent in (
        "none", "parent_asked", "parent_allowed", "handover_pending", "student_allowed", "refused", "ended"
    ) else None
    outer_where, outer_p = ("", [])
    if consent_filter:
        outer_where, outer_p = " WHERE consent_status = %s", [consent_filter]

    sort_map = {
        "person": "name", "name": "name", "born": "dob", "dob": "dob",
        "turns_18": "turns_18", "income": "income_state", "income_state": "income_state",
        "consent": "consent_status", "consent_status": "consent_status",
        "portal": "on_scholarship_portal", "on_scholarship_portal": "on_scholarship_portal",
    }
    sort_col = sort_map.get((sort or "turns_18").lower(), "turns_18")
    sort_dir = "DESC" if str(dir or "asc").lower() == "desc" else "ASC"

    wrapped = f"""
      SELECT * FROM (
        SELECT p.id, p.mdm_id, p.name, p.dob, p.district,
               (p.dob + interval '18 years')::date AS turns_18,
               ({identity_expr}) AS has_identity,
               ({portal_expr}) AS on_scholarship_portal,
               (SELECT r.payload->>'course' FROM mdm.source_record r
                WHERE r.person_id=p.id AND r.source='student_portal' LIMIT 1) AS course,
               (SELECT r.payload->>'valid_until' FROM mdm.source_record r
                WHERE r.person_id=p.id AND r.rtype='INCOME' ORDER BY r.as_of DESC NULLS LAST LIMIT 1) AS income_valid_until,
               EXISTS (SELECT 1 FROM mdm.source_record r WHERE r.person_id=p.id AND r.rtype='INCOME') AS has_income,
               EXISTS (SELECT 1 FROM mdm.source_record r WHERE r.person_id=p.id AND r.rtype='CASTE') AS has_caste,
               (SELECT r.ration_card FROM mdm.source_record r WHERE r.person_id=p.id AND r.source='pds_view' LIMIT 1) AS ration_card,
               ({income_expr}) AS income_state,
               ({consent_expr}) AS consent_status,
               ({invited_expr}) AS invited
        FROM mdm.person p
        LEFT JOIN LATERAL (
          SELECT c.status, c.person_id AS c_person_id, c.given_by_person_id
          FROM mdm.consent c
          WHERE c.purpose=%s AND (c.person_id=p.id OR c.subject_person_id=p.id)
          ORDER BY c.id DESC LIMIT 1
        ) cons ON true
        WHERE p.dob > %s AND p.dob <= %s
        {where_extra}
      ) x
      {outer_where}
    """
    core_params = [PURPOSE, lo, hi] + fp

    cur.execute(f"SELECT count(*) AS n FROM ({wrapped}) c", core_params + outer_p)
    total = cur.fetchone()["n"]

    cur.execute(f"""
      SELECT
        count(*) FILTER (WHERE turns_18 > %s AND turns_18 <= %s) AS turning_30,
        count(*) FILTER (WHERE turns_18 <= %s) AS already_18,
        count(*) FILTER (WHERE NOT on_scholarship_portal) AS not_on_portal,
        count(*) FILTER (WHERE invited) AS invited_n,
        count(*) FILTER (WHERE income_state IN ('expired','none')) AS income_bad
      FROM ({wrapped}) c
    """, [on, on + timedelta(days=30), on] + core_params + outer_p)
    st = cur.fetchone()
    stats = {
        "turning_30": st["turning_30"],
        "already_18": st["already_18"],
        "not_on_portal": st["not_on_portal"],
        "invited": st["invited_n"],
        "income_expired_or_none": st["income_bad"],
    }

    cur.execute(f"""
      {wrapped}
      ORDER BY {"lower(name)" if sort_col == "name" else sort_col} {sort_dir} NULLS LAST, id ASC
      LIMIT %s OFFSET %s
    """, core_params + outer_p + [limit, offset])
    items = cur.fetchall()
    for r in items:
        r["already_adult"] = r["turns_18"] <= on
        todo = []
        if not r["has_identity"]:
            todo.append("Issue an identity reference")
        if r["income_state"] == "none":
            todo.append("Income certificate needed")
        elif r["income_state"] == "expired":
            todo.append("Renew the income certificate")
        if not r["on_scholarship_portal"]:
            todo.append("Not on the scholarship portal. Invite to apply")
        r["next_steps"] = todo or ["Nothing outstanding"]
        r["next_step"] = r["next_steps"][0]
    return {
        "total": total, "limit": limit, "offset": offset, "items": items,
        "as_of": on.isoformat(), "stats": stats,
        "sort": sort_col, "dir": sort_dir.lower(),
    }


def invite_ids_for_filter(cur, filt: dict | None, as_of=None) -> list[int]:
    """Resolve a turning-18 invite filter to person ids (inviteable only), capped at MAX_INVITE."""
    filt = dict(filt or {})
    if set(filt.keys()) <= {"within_days"} and "within_days" in filt:
        days = int(filt.get("within_days") or 30)
        return turning_candidates(cur, _worklist_as_of(as_of), max(1, min(days, 365)))
    out = turning_18_worklist(
        cur,
        q=filt.get("q"), district=filt.get("district"), identity=filt.get("identity"),
        income_state=filt.get("income_state"), on_portal=filt.get("on_portal"),
        consent=filt.get("consent"), invited=filt.get("invited"),
        turns_from=filt.get("turns_from"), turns_to=filt.get("turns_to"),
        limit=MAX_INVITE, offset=0, as_of=as_of, inviteable_only=True,
    )
    return [r["id"] for r in out["items"]]


def invite(cur, person_ids: list[int] | None, actor: str, preview: bool = False, filter: dict | None = None,
           require_notice: bool = False, as_of=None) -> dict:
    """An invitation to apply is a notice, not a consent request. One per person, ever. With preview nothing is written."""
    ids = list(dict.fromkeys(int(i) for i in (person_ids or [])))
    if not ids and filter:
        ids = invite_ids_for_filter(cur, filter, as_of)
    if not ids:
        raise Refused("Choose at least one person to invite")
    if len(ids) > MAX_INVITE:
        raise Refused(f"Invite at most {MAX_INVITE} people at a time")
    would, skipped = [], []
    for pid in ids:
        cur.execute("SELECT 1 FROM mdm.person WHERE id=%s", (pid,))
        if not cur.fetchone():
            skipped.append({"person_id": pid, "reason": "NOT_FOUND"})
        elif _invited(cur, pid):
            skipped.append({"person_id": pid, "reason": "ALREADY_INVITED"})
        elif _on_portal(cur, pid):
            skipped.append({"person_id": pid, "reason": "ON_PORTAL"})
        else:
            would.append(pid)
    if preview:
        return {"preview": True, "count": len(would), "would_invite": len(would), "skipped": len(skipped), "skipped_detail": skipped[:50]}
    invited, notified, not_reached = 0, 0, 0
    for pid in would:
        sent = notify.send(cur, pid, INVITE_TITLE, INVITE_BODY, f"invite-{pid}")
        if require_notice and not sent:
            not_reached += 1                          # no notice went out (for example no citizen sign-in), so nothing is recorded and it is tried again later
            continue
        cur.execute("INSERT INTO mdm.invitation (person_id, kind, created_by) VALUES (%s,%s,%s) ON CONFLICT (person_id, kind) DO NOTHING RETURNING id",
                    (pid, APPLY_KIND, actor))
        if cur.fetchone():
            invited += 1
            notified += 1 if sent else 0
    if invited:
        audit.write(cur, actor, "UC4_INVITED", "turning-18", {"invited": invited, "notified": notified, "skipped": len(skipped)})
    return {"preview": False, "invited": invited, "notified": notified, "not_reached": not_reached, "skipped": len(skipped), "skipped_detail": skipped[:50]}


# ------------------------------------------------------------------ the daily job
def _handover_catch_up(cur, actor: str, as_of, on: date, adult: int) -> dict:
    """End a guardian's consent for everybody at or over the adult age, whenever they turned it, and ask them afresh. Enrols nobody.

    persons counts only people for whom at least one consent was ended or one fresh request raised.
    A visit that changes nothing (already handed over) is not counted, so a second run the same day is all zeros.
    The fresh request from request_consent has given_by_person_id NULL, so it does not match the guardian query again.
    Only self-about consents (subject null or equal to the principal) are candidates; a parent's consent about a child is not.
    """
    ended, asked, notified = [], [], 0
    touched: set[int] = set()
    cur.execute("""SELECT DISTINCT person_id FROM mdm.consent
                   WHERE given_by_person_id IS NOT NULL AND given_by_person_id<>person_id
                     AND (subject_person_id IS NULL OR subject_person_id=person_id) AND status IN ('GRANTED','PENDING')
                   ORDER BY person_id""")
    for r in cur.fetchall():
        pid = r["person_id"]
        age = exchange.person_age(cur, pid, on)
        if age is None or age < adult:
            continue
        cur.execute("SAVEPOINT uc4_handover")
        try:
            out = exchange.handover_at_majority(cur, pid, actor, as_of)
        except Refused:
            cur.execute("ROLLBACK TO SAVEPOINT uc4_handover")
            continue
        cur.execute("RELEASE SAVEPOINT uc4_handover")
        if not out["ended"] and not out["new_requests"]:
            continue
        touched.add(pid)
        ended += out["ended"]
        asked += out["new_requests"]
        for nid in out["new_requests"]:
            notified += 1 if notify.send(cur, pid, HANDOVER_TITLE, HANDOVER_BODY, f"consent-{nid}") else 0
    # A scholarship consent addressed to a parent about a student who is now an adult ends the same way.
    cur.execute("""SELECT * FROM mdm.consent WHERE purpose=%s AND subject_person_id IS NOT NULL AND person_id<>subject_person_id
                   AND status IN ('PENDING','GRANTED') ORDER BY id FOR UPDATE""", (PURPOSE,))
    for c in cur.fetchall():
        sid = c["subject_person_id"]
        age = exchange.person_age(cur, sid, on)
        if age is None or age < adult:
            continue
        cur.execute("UPDATE mdm.consent SET status='ENDED', ended_reason='ATTAINED_MAJORITY' WHERE id=%s", (c["id"],))
        exchange._log(cur, c["id"], "ENDED", actor, note=f"Guardian consent ends at {adult}. The individual is asked for their own.")
        exchange._block_waiting_deliveries(cur, c["id"], "BLOCKED_REVOKED")
        new = exchange.request_consent(cur, sid, c["purpose"], actor, sid, None, as_of=as_of)
        audit.write(cur, actor, "CONSENT_HANDOVER", f"person:{sid}", {"ended": [c["id"]], "new_requests": [new["id"]]})
        touched.add(sid)
        ended.append(c["id"])
        asked.append(new["id"])
        # Only notify when a fresh request was raised (not when an open one already stood).
        if not new.get("existing"):
            notified += 1 if notify.send(cur, sid, HANDOVER_TITLE, HANDOVER_BODY, f"consent-{new['id']}") else 0
    return {"persons": len(touched), "ended": len(ended), "asked": len(asked), "notified": notified, "enrolled": 0}


def _certificate_reminders(cur, actor: str, on: date) -> dict:
    """A notice to the citizen only, once per certificate, for an income certificate ending within 30 days."""
    cur.execute("""SELECT r.id, r.person_id FROM mdm.source_record r
                   WHERE r.source='revenue_certificates' AND r.rtype='INCOME' AND r.person_id IS NOT NULL
                     AND r.payload->>'valid_until' ~ '^\\d{4}-\\d{2}-\\d{2}'
                     AND left(r.payload->>'valid_until', 10) BETWEEN %s AND %s
                     AND coalesce(r.payload->>'status', 'ACTIVE') = 'ACTIVE'
                     AND EXISTS (SELECT 1 FROM mdm.citizen_link l WHERE l.person_id=r.person_id)
                     AND NOT EXISTS (SELECT 1 FROM mdm.invitation i WHERE i.person_id=r.person_id AND i.kind = 'CERT_EXPIRY:' || r.id)
                   ORDER BY r.id LIMIT 1000""", (on.isoformat(), (on + timedelta(days=30)).isoformat()))
    rows = cur.fetchall()
    sent = 0
    for r in rows:
        if notify.send(cur, r["person_id"], EXPIRY_TITLE, EXPIRY_BODY, f"cert-{r['id']}"):
            cur.execute("INSERT INTO mdm.invitation (person_id, kind, created_by) VALUES (%s,%s,%s) ON CONFLICT (person_id, kind) DO NOTHING",
                        (r["person_id"], f"CERT_EXPIRY:{r['id']}", actor))
            sent += 1
    return {"due": len(rows), "sent": sent}


def daily_job(cur, actor: str, as_of=None) -> dict:
    """The daily checks, in order: consent sweep, majority handover (with catch-up), invitations, certificate reminders.
    Idempotent: a second run finds nothing new to do. Writes one mdm.job_run row per run."""
    now = exchange._now(as_of)
    on = _on(as_of)
    pol = exchange.current(cur)
    adult = int(pol.get("adult_age") or 18)
    sweep = exchange.sweep(cur, actor, as_of)
    handover = _handover_catch_up(cur, actor, as_of, on, adult)
    cands = turning_candidates(cur, on, 30, adult, linked_only=True)
    inv = invite(cur, cands, actor, require_notice=True, as_of=as_of) if cands else {"invited": 0, "notified": 0, "skipped": 0}
    reminders = _certificate_reminders(cur, actor, on)
    result = {"job": "daily", "as_of": now.isoformat() if as_of else None, "on": on.isoformat(), "sweep": sweep, "handover": handover,
              "invitations": {"candidates": len(cands), "invited": inv["invited"], "skipped": inv["skipped"]},
              "certificate_reminders": reminders, "enrolled": 0}
    cur.execute("INSERT INTO mdm.job_run (job, actor, as_of, result) VALUES ('daily',%s,%s,%s::jsonb) RETURNING id, ran_at",
                (actor, now if as_of else None, _js(result)))
    row = cur.fetchone()
    audit.write(cur, actor, "JOB_DAILY", "job:daily", {"run": row["id"], **{k: v for k, v in result.items() if k in ("handover", "invitations", "certificate_reminders")}})
    return {**result, "run_id": row["id"], "ran_at": row["ran_at"]}


def last_run(cur, job: str = "daily") -> dict:
    cur.execute("SELECT id, job, actor, as_of, result, ran_at FROM mdm.job_run WHERE job=%s ORDER BY id DESC LIMIT 1", (job,))
    r = cur.fetchone()
    if not r:
        return {"job": job, "ran": False, "result": None, "ran_at": None, "actor": None}
    return {"job": r["job"], "ran": True, "run_id": r["id"], "actor": r["actor"], "as_of": r["as_of"], "ran_at": r["ran_at"], "result": r["result"]}


# ------------------------------------------------------------------ what the officer sees
OUTCOME_KEY = {"ANSWERED": "answered", "DENIED_NO_CONSENT": "no_consent", "DENIED_POLICY": "denied_policy",
               "EXPIRED_SOURCE": "expired", "CONFLICT": "conflict", "NO_RECORD": "no_record"}


def eligibility_outcomes(cur, days: int = 7) -> dict:
    """Counts of scholarship checks by outcome, from the ledger. Counts only: no person, income or category value."""
    days = max(1, min(int(days or 7), 90))
    cur.execute("""SELECT outcome, count(*) AS n FROM mdm.exchange
                   WHERE kind='VERIFY' AND purpose=%s AND ts > now() - make_interval(days => %s) GROUP BY 1""", (PURPOSE, days))
    raw = {r["outcome"]: r["n"] for r in cur.fetchall()}
    by = {k: raw.get(o, 0) for o, k in OUTCOME_KEY.items()}
    cur.execute("""SELECT reason_code, count(*) AS n FROM mdm.proposal
                   WHERE status='PROPOSED' AND kind = ANY(%s) GROUP BY 1""", (list(UC4_KINDS),))
    open_items = {r["reason_code"]: r["n"] for r in cur.fetchall()}
    for code in ("CERT_EXPIRED", "CERT_CONFLICT", "OTHER_STATE"):
        open_items.setdefault(code, 0)
    return {"days": days, "purpose": PURPOSE, **by, "total": sum(raw.values()), "by_outcome": by, "ledger_outcomes": raw,
            "open_items": open_items,
            "ledger_filters": {k: {"kind": "VERIFY", "outcome": o, "q": PURPOSE} for o, k in OUTCOME_KEY.items()}}


def consent_status(cur, pid: int, on: date | None = None) -> str:
    """none | parent_asked | parent_allowed | handover_pending | student_allowed | refused | ended, for the Turning 18 list."""
    cur.execute("""SELECT id, person_id, subject_person_id, given_by_person_id, status FROM mdm.consent
                   WHERE purpose=%s AND (person_id=%s OR subject_person_id=%s) ORDER BY id DESC LIMIT 1""", (PURPOSE, pid, pid))
    c = cur.fetchone()
    if not c:
        return "none"
    st = c["status"]
    adult = int(exchange.current(cur).get("adult_age") or 18)
    age = exchange.person_age(cur, pid, on)
    adult_now = age is not None and age >= adult
    by_parent = c["person_id"] != pid or (c["given_by_person_id"] not in (None, pid))
    if st == "PENDING":
        return "handover_pending" if adult_now else "parent_asked"
    if st == "GRANTED":
        return "parent_allowed" if by_parent else "student_allowed"
    if st == "REFUSED":
        return "refused"
    return "ended"
