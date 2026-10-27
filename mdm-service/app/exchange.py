"""Data exchange core: consent, policy, per-department delivery, verification-only queries and the exchange ledger.

Rules this module keeps (from the POC brief):
- Nothing consequential happens without a person's approval and a recorded reason (see events.decide_proposal).
- Each use of a person's data needs that person's consent for that purpose, and the consent can be partial, expire, or be withdrawn.
- A verification query returns an outcome ("yes", "no", a band, a validity date), never the underlying record or document.
- "No record" is a different answer from "no" and from "alive". A conflict is shown, never silently resolved.
- Every exchange, answered or refused, is written to the ledger. Policy changes take effect for new requests; work already
  started keeps the policy version it began under.
No identity number is stored or handled here. A person is found by MDM id or by the identity reference token."""
from __future__ import annotations
import json, time
from datetime import date, datetime, timedelta, timezone

from . import audit, store
from .stewardship import Refused
from .survivorship import REF_DATE

SYSTEMS = {"pds": "Civil supplies (PDS)", "health": "Health", "welfare": "Women and child welfare", "citizen": "Citizen record",
           "education": "Education / scholarship", "housing": "Housing", "pension": "Social security / pension MIS",
           "revenue": "Revenue", "electricity": "Electricity distribution", "mdm": "Master data (steward)",
           "crs": "Civil registration", "marriage_register": "Marriage register", "identity": "Identity reference service"}

PURPOSES = {
    "BIRTH_PDS": {"name": "Add the child to the family's ration card", "system": "pds", "uc": "UC2", "consent": True,
                  "elements": ["child_name", "date_of_birth", "gender", "parents"]},
    "BIRTH_HEALTH": {"name": "Health and immunisation schedule for the child", "system": "health", "uc": "UC2", "consent": True,
                     "elements": ["child_name", "date_of_birth", "gender"]},
    "BIRTH_GIRL_SCHEME": {"name": "Girl-child welfare scheme", "system": "welfare", "uc": "UC2", "consent": True,
                          "elements": ["child_name", "date_of_birth", "parents"]},
    "BIRTH_CITIZEN_RECORD": {"name": "Add the child to the family's citizen record", "system": "citizen", "uc": "UC2", "consent": True,
                             "elements": ["child_name", "date_of_birth", "gender"]},
    "SCHOLARSHIP_ELIGIBILITY": {"name": "Check eligibility for an education scholarship", "system": "education", "uc": "UC4", "consent": True,
                                "elements": ["income_band", "category", "residence", "age"]},
    "HOUSEHOLD_BENEFIT": {"name": "Check household eligibility for housing assistance", "system": "housing", "uc": "UC5", "consent": True,
                          "elements": ["income_band", "residence", "household_benefit", "electricity_link", "land_holding", "duplicate_benefit"]},
    "MARRIAGE_UPDATE": {"name": "Update household and name records after a marriage", "system": "pds", "uc": "UC6", "consent": True,
                        "elements": ["marital_status", "name", "household"]},
    "PENSION_ELIGIBILITY": {"name": "Pension eligibility after a death (statutory, no consent needed)", "system": "pension", "uc": "UC3", "consent": False,
                            "elements": ["life_status", "age"]},
}

DEFAULTS = {
    "min_marriage_age": {"M": 21, "F": 18},
    "adult_age": 18,
    "consent_expiry_days": 365,
    "consent_response_days": 14,
    "max_reminders": 2,
    "late_event_days": 60,
    "income_band_edges": [100000, 200000, 300000, 500000],
    "rationale_min_chars": 10,
    "rationale_required_kinds": ["CONFIRM_DEATH", "MARK_DECEASED_PDS", "STOP_PENSION", "CLOSE_SCHOLARSHIP", "CONFIRM_MARRIAGE"],
    "temp_result_minutes": 15,
    "event_retention_days": 90,
    "consent_evidence_days": 365,
    "land_stale_days": 365,
    "max_delivery_attempts": 3,
    "query_max_population": 500,
    "max_lookups_per_hour": 10,
}
SENSITIVE_ALWAYS = {"REFER_UNDERAGE"}            # always needs a reason, whatever the policy list says
POLICY_TEXT = {
    "min_marriage_age": "Legal minimum age at marriage, by gender. A record below it goes to an authorised officer; nothing is reported elsewhere.",
    "adult_age": "Age at which a guardian's consent ends and the individual must give their own.",
    "consent_expiry_days": "How long a granted consent lasts before it expires.",
    "consent_response_days": "How long a parent or citizen has to answer a consent request before it lapses.",
    "max_reminders": "Most reminders ever sent for one consent request. After that, no more prompting.",
    "late_event_days": "A birth registered later than this many days after the birth is treated as a late registration.",
    "income_band_edges": "Upper limits (rupees a year) that separate income bands in verification answers.",
    "rationale_min_chars": "Shortest acceptable reason when an officer approves or rejects a sensitive action.",
    "rationale_required_kinds": "Actions where the approver must record a reason.",
    "temp_result_minutes": "How long the temporary result of a query is kept before it is deleted.",
    "event_retention_days": "How long an event keeps its full details. After that only a thin reference is kept.",
    "consent_evidence_days": "How long a consent record is kept after it ends, as evidence.",
    "land_stale_days": "A land record not updated for this many days is flagged as possibly out of date.",
    "max_delivery_attempts": "How many times delivery to a department is tried before it is set aside for review.",
    "query_max_population": "Largest group of people one query may match. Wider queries are refused.",
    "max_lookups_per_hour": "Most times one user may look up the same person in an hour. More is flagged as possible misuse.",
}

# an approval of these needs the named consent to be granted first
GATED = {"ADD_TO_RATION_CARD": "BIRTH_PDS"}

QUESTIONS = {
    "INCOME_AT_MOST": {"label": "Annual income is at most a stated limit", "element": "income_band", "param": "limit"},
    "CATEGORY_IS": {"label": "Belongs to a stated social category", "element": "category", "param": "category"},
    "AGE_AT_LEAST": {"label": "Is at least a stated age", "element": "age", "param": "years"},
    "RESIDENT": {"label": "Is known to Telangana records", "element": "residence", "param": None},
    "DEATH_REGISTERED": {"label": "Has a death been registered", "element": "life_status", "param": None},
    "HOUSEHOLD_HAS_BENEFIT": {"label": "Does the household already have a housing application", "element": "household_benefit", "param": None},
    "ELECTRICITY_LINKED": {"label": "Is an electricity connection linked to the household", "element": "electricity_link", "param": None},
    "LAND_HOLDING": {"label": "Does the household hold land", "element": "land_holding", "param": None},
    "DUPLICATE_BENEFIT": {"label": "Is another application filed for the same household", "element": "duplicate_benefit", "param": None},
    "MARRIAGE_RECORDED": {"label": "Is a marriage recorded", "element": "marital_status", "param": None},
}


def _js(x):
    return json.dumps(x, default=str, ensure_ascii=False)


def _now(as_of=None) -> datetime:
    if as_of is None:
        return datetime.now(timezone.utc)
    if isinstance(as_of, datetime):
        return as_of if as_of.tzinfo else as_of.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(as_of))
    except ValueError:
        raise Refused("as_of must be a date such as 2027-01-31")
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


# ------------------------------------------------------------------ policy
def _ensure(cur):
    cur.execute("SELECT key FROM mdm.policy WHERE active")
    have = {r["key"] for r in cur.fetchall()}
    for k, v in DEFAULTS.items():
        if k not in have:
            cur.execute("SELECT coalesce(max(version),0)+1 AS v FROM mdm.policy WHERE key=%s", (k,))
            ver = cur.fetchone()["v"]
            cur.execute("INSERT INTO mdm.policy (key, version, value, active, changed_by, note) VALUES (%s,%s,%s::jsonb,true,'system','Default')", (k, ver, _js(v)))


def current(cur) -> dict:
    _ensure(cur)
    cur.execute("SELECT key, value FROM mdm.policy WHERE active")
    return {r["key"]: r["value"] for r in cur.fetchall()}


def versions(cur) -> dict:
    _ensure(cur)
    cur.execute("SELECT key, version FROM mdm.policy WHERE active")
    return {r["key"]: r["version"] for r in cur.fetchall()}


def policy_list(cur) -> list[dict]:
    _ensure(cur)
    cur.execute("SELECT p.key, p.value, p.version, p.changed_by, p.changed_at, p.note, "
                "(SELECT count(*) FROM mdm.policy h WHERE h.key=p.key) AS versions FROM mdm.policy p WHERE p.active ORDER BY p.key")
    return [{**r, "description": POLICY_TEXT.get(r["key"], ""), "default": DEFAULTS.get(r["key"])} for r in cur.fetchall()]


def policy_history(cur, key: str) -> list[dict]:
    cur.execute("SELECT version, value, active, changed_by, changed_at, note FROM mdm.policy WHERE key=%s ORDER BY version DESC", (key,))
    rows = cur.fetchall()
    if not rows:
        raise Refused("Unknown policy", 404)
    return rows


def _validate(key: str, v):
    if key not in DEFAULTS:
        raise Refused(f"Unknown policy '{key}'")
    d = DEFAULTS[key]
    if key == "min_marriage_age":
        if not isinstance(v, dict) or set(v) != {"M", "F"} or not all(isinstance(x, int) and 10 <= x <= 40 for x in v.values()):
            raise Refused("min_marriage_age needs whole ages between 10 and 40 for M and F")
    elif key == "income_band_edges":
        if not isinstance(v, list) or not v or v != sorted(v) or not all(isinstance(x, (int, float)) and x > 0 for x in v):
            raise Refused("income_band_edges must be an increasing list of positive amounts")
    elif key == "rationale_required_kinds":
        if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
            raise Refused("rationale_required_kinds must be a list of action names")
    else:
        if not isinstance(v, int) or isinstance(v, bool) or v < 0 or v > 36500:
            raise Refused(f"{key} must be a whole number of 0 or more")
        if key == "adult_age" and not 10 <= v <= 25:
            raise Refused("adult_age must be between 10 and 25")
        if key == "max_reminders" and v > 10:
            raise Refused("max_reminders cannot exceed 10")


def impact(cur, key: str, value) -> dict:
    """What a change would touch, before it is made."""
    _validate(key, value)
    pol = current(cur)
    old = pol.get(key)
    out = {"key": key, "old": old, "new": value, "lines": []}
    cur.execute("SELECT count(*) AS n FROM mdm.proposal WHERE status='PROPOSED'")
    open_props = cur.fetchone()["n"]
    out["lines"].append(f"{open_props} open proposal(s) keep the policy version they were created under. New requests use the new value at once.")
    if key == "adult_age":
        lo, hi = sorted((old, value))
        cur.execute("SELECT count(*) AS n FROM mdm.person WHERE %s - COALESCE(birth_year, EXTRACT(year FROM dob)::int) >= %s AND %s - COALESCE(birth_year, EXTRACT(year FROM dob)::int) < %s",
                    (REF_DATE.year, lo, REF_DATE.year, hi))
        out["lines"].append(f"About {cur.fetchone()['n']} people would change between minor and adult.")
        cur.execute("SELECT count(*) AS n FROM mdm.consent WHERE status='GRANTED' AND given_by_person_id IS NOT NULL AND given_by_person_id<>person_id")
        out["lines"].append(f"{cur.fetchone()['n']} guardian consent(s) are in force; each ends when its person reaches the adult age and needs their own.")
    elif key == "min_marriage_age":
        n = {}
        for label, new_v in (("now", old), ("after the change", value)):
            cur.execute("""SELECT count(*) AS n FROM mdm.source_record
                           WHERE source='marriage_register' AND dob IS NOT NULL AND as_of ~ '^\\d{4}-\\d{2}-\\d{2}'
                             AND EXTRACT(year FROM age(to_date(left(as_of,10),'YYYY-MM-DD'), dob)) < CASE WHEN rtype='MARRIAGE_GROOM' THEN %s ELSE %s END""",
                        (new_v["M"], new_v["F"]))
            n[label] = cur.fetchone()["n"]
        out["lines"].append(f"Marriage records below the minimum age: {n['now']} now, {n['after the change']} after the change.")
    elif key == "consent_expiry_days":
        cur.execute("SELECT count(*) AS n FROM mdm.consent WHERE status='GRANTED'")
        out["lines"].append(f"{cur.fetchone()['n']} granted consent(s) keep their existing expiry date. Only new grants use {value} days.")
    elif key == "rationale_required_kinds":
        out["lines"].append("Applies to the next decision on those actions.")
    return out


def set_policy(cur, key: str, value, actor: str, note: str | None) -> dict:
    out = impact(cur, key, value)                      # validates
    cur.execute("SELECT version FROM mdm.policy WHERE key=%s AND active FOR UPDATE", (key,))
    row = cur.fetchone()
    ver = (row["version"] if row else 0) + 1
    cur.execute("UPDATE mdm.policy SET active=false WHERE key=%s", (key,))
    cur.execute("INSERT INTO mdm.policy (key, version, value, active, changed_by, note) VALUES (%s,%s,%s::jsonb,true,%s,%s)", (key, ver, _js(value), actor, note))
    audit.write(cur, actor, "POLICY_CHANGED", f"policy:{key}", {"old": out["old"], "new": value, "version": ver, "note": note})
    return {**out, "version": ver}


# ------------------------------------------------------------------ people
def person_age(cur, pid: int, on: date | None = None) -> int | None:
    cur.execute("SELECT dob, birth_year FROM mdm.person WHERE id=%s", (pid,))
    r = cur.fetchone()
    if not r:
        return None
    on = on or REF_DATE
    if r["dob"]:
        d = r["dob"]
        return on.year - d.year - ((on.month, on.day) < (d.month, d.day))
    return on.year - r["birth_year"] if r["birth_year"] else None


def identity_of(cur, pid: int) -> dict:
    cur.execute("SELECT source_rid, payload, link_status, score, reason FROM mdm.source_record WHERE person_id=%s AND source='identity_reference' ORDER BY id", (pid,))
    toks = [{"token": r["source_rid"], "assurance": (r["payload"] or {}).get("assurance"), "link_status": r["link_status"],
             "score": float(r["score"]) if r["score"] is not None else None, "basis": r["reason"]} for r in cur.fetchall()]
    return {"person_id": pid, "linked": bool(toks), "tokens": toks,
            "note": "The identity reference token is the link key. No identity number is stored in this platform."
                    if toks else "No identity reference is linked. Linking falls back to name, date of birth and address, and anything uncertain goes to a person for review."}


def _person_ref(cur, pid):
    cur.execute("SELECT id, mdm_id, name FROM mdm.person WHERE id=%s", (pid,))
    return cur.fetchone()


# ------------------------------------------------------------------ ledger
def ledger(cur, kind, requester, actor, purpose, person_id, consent_id, question, outcome, answer=None, elapsed_ms=None) -> int:
    cur.execute("INSERT INTO mdm.exchange (kind, requester, requester_actor, purpose, person_id, consent_id, policy_versions, question, outcome, answer, elapsed_ms) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s::jsonb,%s) RETURNING id",
                (kind, requester, actor, purpose, person_id, consent_id, _js(versions(cur)), question, outcome, _js(answer or {}), elapsed_ms))
    return cur.fetchone()["id"]


def list_ledger(cur, outcome=None, person_id=None, kind=None, limit=50, offset=0) -> dict:
    where, p = ["true"], []
    for col, v in (("e.outcome", outcome), ("e.person_id", person_id), ("e.kind", kind)):
        if v:
            where.append(f"{col}=%s")
            p.append(v)
    w = " AND ".join(where)
    cur.execute(f"SELECT count(*) AS n FROM mdm.exchange e WHERE {w}", p)
    total = cur.fetchone()["n"]
    cur.execute(f"SELECT e.*, pe.name AS person_name, pe.mdm_id FROM mdm.exchange e LEFT JOIN mdm.person pe ON pe.id=e.person_id WHERE {w} ORDER BY e.id DESC LIMIT %s OFFSET %s", p + [limit, offset])
    return {"total": total, "limit": limit, "offset": offset, "items": cur.fetchall()}


# ------------------------------------------------------------------ consent
def _log(cur, cid, action, actor, channel=None, note=None, detail=None):
    cur.execute("INSERT INTO mdm.consent_log (consent_id, action, actor, channel, note, detail) VALUES (%s,%s,%s,%s,%s,%s::jsonb)",
                (cid, action, actor, channel, note, _js(detail or {})))


def _consent(cur, cid, lock=False) -> dict:
    cur.execute(f"SELECT * FROM mdm.consent WHERE id=%s{' FOR UPDATE' if lock else ''}", (cid,))
    r = cur.fetchone()
    if not r:
        raise Refused("Consent not found", 404)
    return r


def request_consent(cur, person_id: int, purpose: str, actor: str, subject_id: int | None = None, event_id: int | None = None,
                    channel: str | None = None, as_of=None) -> dict:
    pu = PURPOSES.get(purpose)
    if not pu:
        raise Refused("Unknown purpose")
    if not _person_ref(cur, person_id):
        raise Refused("Person not found", 404)
    cur.execute("SELECT * FROM mdm.consent WHERE person_id=%s AND purpose=%s AND COALESCE(subject_person_id,0)=COALESCE(%s,0) AND status IN ('PENDING','GRANTED') "
                "AND (expires_at IS NULL OR expires_at > %s) ORDER BY id DESC LIMIT 1", (person_id, purpose, subject_id, _now(as_of)))
    ex = cur.fetchone()
    if ex:
        return {**ex, "existing": True}
    pol, now = current(cur), _now(as_of)
    cur.execute("INSERT INTO mdm.consent (person_id, subject_person_id, purpose, system, scope, requested_at, respond_by, event_id, policy_version) "
                "VALUES (%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s) RETURNING *",
                (person_id, subject_id, purpose, pu["system"], _js({"elements": pu["elements"], "partial": False}), now,
                 now + timedelta(days=pol["consent_response_days"]), event_id, versions(cur).get("consent_response_days")))
    row = cur.fetchone()
    _log(cur, row["id"], "REQUESTED", actor, channel, None, {"purpose": purpose})
    audit.write(cur, actor, "CONSENT_REQUESTED", f"consent:{row['id']}", {"person": person_id, "purpose": purpose, "event": event_id})
    return {**row, "existing": False}


def _guardian_ok(cur, guardian_id: int, principal_id: int) -> bool:
    cur.execute("SELECT 1 FROM mdm.relationship WHERE kind IN ('PARENT_OF','SAME_HOUSEHOLD') AND "
                "((person_a=%s AND person_b=%s) OR (person_a=%s AND person_b=%s)) LIMIT 1", (guardian_id, principal_id, principal_id, guardian_id))
    return bool(cur.fetchone())


def _expire_if_due(cur, c: dict, now, actor="system") -> dict:
    """Mark a lapsed consent as expired and stop what was waiting on it."""
    if c["status"] == "PENDING" and c["respond_by"] and c["respond_by"] <= now:
        cur.execute("UPDATE mdm.consent SET status='EXPIRED', ended_reason='NO_RESPONSE' WHERE id=%s", (c["id"],))
        _log(cur, c["id"], "EXPIRED", actor, note="No answer within the response window. No further prompts.")
        cur.execute("UPDATE mdm.delivery SET status='BLOCKED_EXPIRED', updated_at=now() WHERE consent_id=%s AND status='PENDING_CONSENT'", (c["id"],))
        return _consent(cur, c["id"])
    if c["status"] == "GRANTED" and c["expires_at"] and c["expires_at"] <= now:
        cur.execute("UPDATE mdm.consent SET status='EXPIRED', ended_reason='TERM_ENDED' WHERE id=%s", (c["id"],))
        _log(cur, c["id"], "EXPIRED", actor, note="The consent period ended.")
        return _consent(cur, c["id"])
    return c


def respond(cur, cid: int, decision: str, actor: str, channel: str = "PORTAL", operator: str | None = None, note: str | None = None,
            given_by: int | None = None, elements: list | None = None, expires_days: int | None = None, as_of=None) -> dict:
    c = _consent(cur, cid, lock=True)
    now = _now(as_of)
    c = _expire_if_due(cur, c, now)
    if c["status"] != "PENDING":
        raise Refused(f"This request is {c['status'].lower()}, so it cannot be answered. Ask again to start a new request.", 409)
    decision = decision.upper()
    if decision not in ("GRANT", "REFUSE"):
        raise Refused("decision must be GRANT or REFUSE")
    channel = (channel or "PORTAL").upper()
    if channel not in ("PORTAL", "ASSISTED", "API"):
        raise Refused("channel must be PORTAL, ASSISTED or API")
    if channel == "ASSISTED" and not (operator or "").strip():
        raise Refused("An assisted answer must name the operator who acted with the citizen present")
    pol = current(cur)
    age = person_age(cur, c["person_id"])
    if given_by and given_by != c["person_id"]:
        if age is not None and age >= pol["adult_age"]:
            raise Refused(f"This person is {age}, an adult under policy. Nobody else can answer for them.")
        if not _guardian_ok(cur, given_by, c["person_id"]):
            raise Refused("The person answering is not recorded as a parent or household member of this person")
    elif age is not None and age < pol["adult_age"]:
        raise Refused(f"This person is {age}, under {pol['adult_age']}. A parent or guardian must answer, and the form must say who.")
    pu = PURPOSES[c["purpose"]]
    status, scope, expires = "REFUSED", c["scope"], None
    if decision == "GRANT":
        els = elements or pu["elements"]
        bad = [e for e in els if e not in pu["elements"]]
        if bad or not els:
            raise Refused("Choose one or more of: " + ", ".join(pu["elements"]))
        scope = {"elements": els, "partial": set(els) != set(pu["elements"])}
        days = expires_days if expires_days is not None else pol["consent_expiry_days"]
        status, expires = "GRANTED", now + timedelta(days=days)
    cur.execute("UPDATE mdm.consent SET status=%s, scope=%s::jsonb, responded_at=%s, expires_at=%s, channel=%s, operator=%s, given_by_person_id=%s WHERE id=%s",
                (status, _js(scope), now, expires, channel, operator, given_by if given_by and given_by != c["person_id"] else None, cid))
    _log(cur, cid, status, actor, channel, note, {"operator": operator, "elements": scope.get("elements"), "partial": scope.get("partial"), "given_by": given_by})
    released = 0
    if status == "GRANTED":
        cur.execute("SELECT id FROM mdm.delivery WHERE consent_id=%s AND status='PENDING_CONSENT' ORDER BY id", (cid,))
        for d in cur.fetchall():
            attempt(cur, d["id"], actor, "consent granted")
            released += 1
    audit.write(cur, actor, f"CONSENT_{status}", f"consent:{cid}", {"purpose": c["purpose"], "channel": channel, "operator": operator, "partial": scope.get("partial"), "note": note})
    return {**_consent(cur, cid), "released_deliveries": released}


def revoke(cur, cid: int, actor: str, channel: str = "PORTAL", operator: str | None = None, note: str | None = None, as_of=None) -> dict:
    c = _consent(cur, cid, lock=True)
    if c["status"] != "GRANTED":
        raise Refused(f"Only a granted consent can be withdrawn; this one is {c['status'].lower()}", 409)
    if (channel or "").upper() == "ASSISTED" and not (operator or "").strip():
        raise Refused("An assisted withdrawal must name the operator")
    now = _now(as_of)
    cur.execute("UPDATE mdm.consent SET status='REVOKED', revoked_at=%s, ended_reason='WITHDRAWN' WHERE id=%s", (now, cid))
    cur.execute("SELECT DISTINCT system, event_id FROM mdm.delivery WHERE consent_id=%s AND kind='EVENT' AND status='DELIVERED'", (cid,))
    told = cur.fetchall()
    for t in told:
        cur.execute("INSERT INTO mdm.delivery (event_id, consent_id, person_id, purpose, system, kind, status, detail) VALUES (%s,%s,%s,%s,%s,'REVOCATION','DELIVERED',%s::jsonb)",
                    (t["event_id"], cid, c["person_id"], c["purpose"], t["system"], _js({"message": "Consent withdrawn. Stop using this data for this purpose."})))
    cur.execute("UPDATE mdm.delivery SET status='BLOCKED_REVOKED', updated_at=now() WHERE consent_id=%s AND status IN ('PENDING_CONSENT','RETRYING','DEAD_LETTER')", (cid,))
    _log(cur, cid, "REVOKED", actor, channel, note, {"operator": operator, "departments_told": [t["system"] for t in told]})
    audit.write(cur, actor, "CONSENT_REVOKED", f"consent:{cid}", {"purpose": c["purpose"], "departments_told": [t["system"] for t in told], "note": note})
    return {**_consent(cur, cid), "departments_told": [SYSTEMS.get(t["system"], t["system"]) for t in told]}


def remind(cur, cid: int, actor: str, as_of=None) -> dict:
    c = _consent(cur, cid, lock=True)
    now = _now(as_of)
    c = _expire_if_due(cur, c, now)
    if c["status"] != "PENDING":
        raise Refused(f"This request is {c['status'].lower()}. No reminder is sent.", 409)
    mx = current(cur)["max_reminders"]
    if c["reminders"] >= mx:
        raise Refused(f"Policy allows {mx} reminder(s) and they have been sent. No further prompting.", 409)
    cur.execute("UPDATE mdm.consent SET reminders=reminders+1, last_reminder_at=%s WHERE id=%s", (now, cid))
    _log(cur, cid, "REMINDED", actor, note=f"Reminder {c['reminders'] + 1} of {mx}")
    return _consent(cur, cid)


def sweep(cur, actor: str, as_of=None) -> dict:
    """Expire what has lapsed. as_of lets a demo move the clock forward."""
    now = _now(as_of)
    cur.execute("SELECT * FROM mdm.consent WHERE (status='PENDING' AND respond_by<=%s) OR (status='GRANTED' AND expires_at<=%s) FOR UPDATE", (now, now))
    n = {"no_response": 0, "term_ended": 0}
    for c in cur.fetchall():
        done = _expire_if_due(cur, c, now, actor)
        n["no_response" if done["ended_reason"] == "NO_RESPONSE" else "term_ended"] += 1
    if any(n.values()):
        audit.write(cur, actor, "CONSENT_SWEEP", "consent", {**n, "as_of": now.isoformat()})
    return {**n, "as_of": now.isoformat()}


def handover_at_majority(cur, pid: int, actor: str, as_of=None) -> dict:
    """At the adult age a guardian's consent ends. The individual is asked afresh. Nothing is enrolled for them."""
    pol = current(cur)
    on = _now(as_of).date() if as_of else None
    age = person_age(cur, pid, on)
    if age is None:
        raise Refused("This person's age is not known", 409)
    if age < pol["adult_age"]:
        raise Refused(f"This person is {age}; the adult age under policy is {pol['adult_age']}", 409)
    cur.execute("SELECT * FROM mdm.consent WHERE person_id=%s AND given_by_person_id IS NOT NULL AND given_by_person_id<>person_id AND status IN ('GRANTED','PENDING') FOR UPDATE", (pid,))
    ended, asked = [], []
    for c in cur.fetchall():
        cur.execute("UPDATE mdm.consent SET status='ENDED', ended_reason='ATTAINED_MAJORITY' WHERE id=%s", (c["id"],))
        _log(cur, c["id"], "ENDED", actor, note=f"Guardian consent ends at {pol['adult_age']}. The individual is asked for their own.")
        cur.execute("UPDATE mdm.delivery SET status='BLOCKED_REVOKED', updated_at=now() WHERE consent_id=%s AND status='PENDING_CONSENT'", (c["id"],))
        new = request_consent(cur, pid, c["purpose"], actor, c["subject_person_id"], c["event_id"], as_of=as_of)
        ended.append(c["id"])
        asked.append(new["id"])
    ledger(cur, "EVENT", "mdm", actor, None, pid, None, "consent handover at majority", "ANSWERED",
           {"ended": ended, "new_requests": asked, "enrolled": 0, "note": "Notify only. Nothing is enrolled automatically."})
    audit.write(cur, actor, "CONSENT_HANDOVER", f"person:{pid}", {"ended": ended, "new_requests": asked})
    return {"person_id": pid, "age": age, "ended": ended, "new_requests": asked, "enrolled": 0}


def list_consents(cur, status=None, purpose=None, person_id=None, q=None, limit=50, offset=0) -> dict:
    where, p = ["true"], []
    for col, v in (("c.status", status), ("c.purpose", purpose), ("c.person_id", person_id)):
        if v:
            where.append(f"{col}=%s")
            p.append(v)
    if q:
        where.append("(pe.name ILIKE %s OR pe.mdm_id ILIKE %s)")
        p += [f"%{q}%", f"%{q}%"]
    w = " AND ".join(where)
    cur.execute(f"SELECT count(*) AS n FROM mdm.consent c LEFT JOIN mdm.person pe ON pe.id=c.person_id WHERE {w}", p)
    total = cur.fetchone()["n"]
    cur.execute(f"""SELECT c.*, pe.name AS person_name, pe.mdm_id, su.name AS subject_name, gb.name AS given_by_name
                    FROM mdm.consent c LEFT JOIN mdm.person pe ON pe.id=c.person_id LEFT JOIN mdm.person su ON su.id=c.subject_person_id
                    LEFT JOIN mdm.person gb ON gb.id=c.given_by_person_id WHERE {w} ORDER BY c.id DESC LIMIT %s OFFSET %s""", p + [limit, offset])
    items = cur.fetchall()
    for i in items:
        i["purpose_name"] = PURPOSES.get(i["purpose"], {}).get("name", i["purpose"])
        i["system_name"] = SYSTEMS.get(i["system"], i["system"])
    cur.execute("SELECT status, count(*) AS n FROM mdm.consent GROUP BY status")
    return {"total": total, "limit": limit, "offset": offset, "items": items, "by_status": {r["status"]: r["n"] for r in cur.fetchall()}}


def consent_detail(cur, cid: int) -> dict:
    cur.execute("""SELECT c.*, pe.name AS person_name, pe.mdm_id, su.name AS subject_name, gb.name AS given_by_name
                   FROM mdm.consent c LEFT JOIN mdm.person pe ON pe.id=c.person_id LEFT JOIN mdm.person su ON su.id=c.subject_person_id
                   LEFT JOIN mdm.person gb ON gb.id=c.given_by_person_id WHERE c.id=%s""", (cid,))
    c = cur.fetchone()
    if not c:
        raise Refused("Consent not found", 404)
    c["purpose_name"] = PURPOSES.get(c["purpose"], {}).get("name", c["purpose"])
    c["system_name"] = SYSTEMS.get(c["system"], c["system"])
    cur.execute("SELECT * FROM mdm.consent_log WHERE consent_id=%s ORDER BY id", (cid,))
    log = cur.fetchall()
    cur.execute("SELECT * FROM mdm.delivery WHERE consent_id=%s ORDER BY id", (cid,))
    dl = cur.fetchall()
    return {"consent": c, "log": log, "deliveries": dl,
            "receipt": {"principal": c["person_name"], "purpose": c["purpose_name"], "department": c["system_name"],
                        "elements": (c["scope"] or {}).get("elements"), "partial": (c["scope"] or {}).get("partial"),
                        "status": c["status"], "channel": c["channel"], "operator": c["operator"],
                        "granted_on": c["responded_at"], "expires_on": c["expires_at"], "withdrawn_on": c["revoked_at"]}}


def active_consent(cur, pid: int, purpose: str, now=None) -> dict | None:
    cur.execute("SELECT * FROM mdm.consent WHERE person_id=%s AND purpose=%s ORDER BY id DESC", (pid, purpose))
    now = _now(now)
    latest = None
    for c in cur.fetchall():
        c = _expire_if_due(cur, c, now)
        if c["status"] == "GRANTED":
            return c
        latest = latest or c
    return latest


# ------------------------------------------------------------------ deliveries (what each subscribing department received)
def birth_consents(cur, event_id: int, child_id: int, father_id: int | None, mother_id: int | None, gender: str | None, actor: str) -> list[dict]:
    """A birth reaches a department only with a parent's consent for that use. Without an identified parent nothing can be asked."""
    principal = mother_id or father_id
    purposes = ["BIRTH_PDS", "BIRTH_HEALTH", "BIRTH_CITIZEN_RECORD"] + (["BIRTH_GIRL_SCHEME"] if (gender or "").upper() == "F" else [])
    out = []
    for pu in purposes:
        system = PURPOSES[pu]["system"]
        if not principal:
            cur.execute("INSERT INTO mdm.delivery (event_id, person_id, purpose, system, status, detail) VALUES (%s,%s,%s,%s,'BLOCKED_NO_PARENT',%s::jsonb) RETURNING id",
                        (event_id, child_id, pu, system, _js({"reason": "Neither parent could be identified, so nobody can consent."})))
            did = cur.fetchone()["id"]
            ledger(cur, "EVENT", "mdm", actor, pu, child_id, None, "birth event", "DENIED_NO_CONSENT", {"reason": "parent not identified"})
        else:
            c = request_consent(cur, principal, pu, actor, subject_id=child_id, event_id=event_id)
            cur.execute("INSERT INTO mdm.delivery (event_id, consent_id, person_id, purpose, system, status, attempts, detail) VALUES (%s,%s,%s,%s,%s,'PENDING_CONSENT',0,%s::jsonb) RETURNING id",
                        (event_id, c["id"], child_id, pu, system, _js({"waiting_for": "parent's consent"})))
            did = cur.fetchone()["id"]
            ledger(cur, "EVENT", "mdm", actor, pu, child_id, c["id"], "birth event", "DENIED_NO_CONSENT", {"reason": "waiting for the parent's consent"})
        out.append({"delivery_id": did, "purpose": pu})
    return out


def is_available(cur, system: str) -> bool:
    cur.execute("SELECT available FROM mdm.subscriber WHERE system=%s", (system,))
    r = cur.fetchone()
    return True if r is None else r["available"]


def attempt(cur, did: int, actor: str, why: str = "") -> dict:
    """Try to hand an event to a department. If its system is down the event is kept and retried; it is only ever marked sent when it was."""
    cur.execute("SELECT * FROM mdm.delivery WHERE id=%s FOR UPDATE", (did,))
    d = cur.fetchone()
    if not d:
        raise Refused("Delivery not found", 404)
    mx = current(cur)["max_delivery_attempts"]
    n = d["attempts"] + 1
    if is_available(cur, d["system"]):
        cur.execute("UPDATE mdm.delivery SET status='DELIVERED', attempts=%s, updated_at=now(), detail = detail || %s::jsonb WHERE id=%s",
                    (n, _js({"released_by": why or "delivered", "last_error": None}), did))
        ledger(cur, "EVENT", "mdm", actor, d["purpose"], d["person_id"], d["consent_id"], "event delivered", "ANSWERED", {"system": d["system"], "attempt": n})
        return {"id": did, "status": "DELIVERED", "attempts": n}
    status = "DEAD_LETTER" if n >= mx else "RETRYING"
    cur.execute("UPDATE mdm.delivery SET status=%s, attempts=%s, updated_at=now(), detail = detail || %s::jsonb WHERE id=%s",
                (status, n, _js({"last_error": f"{SYSTEMS.get(d['system'], d['system'])} is not available", "released_by": why}), did))
    if status == "DEAD_LETTER":
        audit.write(cur, actor, "DELIVERY_DEAD_LETTER", f"delivery:{did}", {"system": d["system"], "attempts": n})
    return {"id": did, "status": status, "attempts": n}


def retry_due(cur, actor: str) -> dict:
    cur.execute("SELECT id FROM mdm.delivery WHERE status='RETRYING' AND kind='EVENT' ORDER BY id FOR UPDATE")
    out = {"delivered": 0, "still_retrying": 0, "dead_letter": 0}
    for r in cur.fetchall():
        k = attempt(cur, r["id"], actor, "retry")["status"]
        out["delivered" if k == "DELIVERED" else "dead_letter" if k == "DEAD_LETTER" else "still_retrying"] += 1
    return out


def redeliver(cur, did: int, actor: str) -> dict:
    cur.execute("SELECT status, consent_id FROM mdm.delivery WHERE id=%s FOR UPDATE", (did,))
    d = cur.fetchone()
    if not d:
        raise Refused("Delivery not found", 404)
    if d["status"] != "DEAD_LETTER":
        raise Refused("Only a delivery that was set aside can be redelivered", 409)
    if d["consent_id"]:
        c = _consent(cur, d["consent_id"])
        if c["status"] != "GRANTED":
            raise Refused(f"The consent is now {c['status'].lower()}, so nothing is sent", 409)
    cur.execute("UPDATE mdm.delivery SET attempts=0 WHERE id=%s", (did,))
    audit.write(cur, actor, "DELIVERY_REDELIVER", f"delivery:{did}", {})
    return attempt(cur, did, actor, "redelivered")


def list_subscribers(cur) -> list[dict]:
    cur.execute("SELECT system, available, note, changed_by, changed_at FROM mdm.subscriber")
    have = {r["system"]: r for r in cur.fetchall()}
    out = []
    for k in ("pds", "health", "welfare", "citizen", "education", "housing", "pension", "revenue", "electricity"):
        r = have.get(k)
        cur.execute("SELECT status, count(*) AS n FROM mdm.delivery WHERE system=%s AND kind='EVENT' GROUP BY status", (k,))
        out.append({"system": k, "name": SYSTEMS[k], "available": r["available"] if r else True, "note": r and r["note"], "changed_by": r and r["changed_by"],
                    "changed_at": r and r["changed_at"], "deliveries": {x["status"]: x["n"] for x in cur.fetchall()}})
    return out


def set_subscriber(cur, system: str, available: bool, actor: str, note: str | None = None) -> dict:
    if system not in SYSTEMS or system in ("mdm", "crs", "marriage_register", "identity"):
        raise Refused("Unknown department")
    cur.execute("INSERT INTO mdm.subscriber (system, available, note, changed_by) VALUES (%s,%s,%s,%s) "
                "ON CONFLICT (system) DO UPDATE SET available=EXCLUDED.available, note=EXCLUDED.note, changed_by=EXCLUDED.changed_by, changed_at=now()",
                (system, available, note, actor))
    audit.write(cur, actor, "SUBSCRIBER_AVAILABILITY", f"system:{system}", {"available": available, "note": note})
    return {"system": system, "available": available}


def deliveries_for_event(cur, event_id: int) -> list[dict]:
    cur.execute("""SELECT d.*, c.status AS consent_status, c.reminders FROM mdm.delivery d LEFT JOIN mdm.consent c ON c.id=d.consent_id
                   WHERE d.event_id=%s ORDER BY d.id""", (event_id,))
    rows = cur.fetchall()
    for r in rows:
        r["purpose_name"] = PURPOSES.get(r["purpose"], {}).get("name", r["purpose"])
        r["system_name"] = SYSTEMS.get(r["system"], r["system"])
    return rows


def list_deliveries(cur, status=None, limit=50, offset=0) -> dict:
    where, p = ["true"], []
    if status:
        where.append("d.status=%s")
        p.append(status)
    w = " AND ".join(where)
    cur.execute(f"SELECT count(*) AS n FROM mdm.delivery d WHERE {w}", p)
    total = cur.fetchone()["n"]
    cur.execute(f"""SELECT d.*, pe.name AS person_name, ev.event_type, ev.event_key FROM mdm.delivery d
                    LEFT JOIN mdm.person pe ON pe.id=d.person_id LEFT JOIN mdm.event ev ON ev.id=d.event_id
                    WHERE {w} ORDER BY d.id DESC LIMIT %s OFFSET %s""", p + [limit, offset])
    rows = cur.fetchall()
    for r in rows:
        r["purpose_name"] = PURPOSES.get(r["purpose"], {}).get("name", r["purpose"])
        r["system_name"] = SYSTEMS.get(r["system"], r["system"])
    cur.execute("SELECT status, count(*) AS n FROM mdm.delivery GROUP BY status")
    return {"total": total, "items": rows, "by_status": {r["status"]: r["n"] for r in cur.fetchall()}}


# ------------------------------------------------------------------ approvals
MARRIAGE_GATED = {"ADD_TO_RATION_CARD", "NOTE_NEW_NAME"}


def gate_for(cur, pr: dict) -> dict | None:
    if pr.get("uc") == "UC6" and pr["kind"] in MARRIAGE_GATED:
        cur.execute("""SELECT c.id, c.status, c.person_id, pe.name FROM mdm.consent c LEFT JOIN mdm.person pe ON pe.id=c.person_id
                       WHERE c.event_id=%s AND c.purpose='MARRIAGE_UPDATE' ORDER BY c.id""", (pr["event_id"],))
        rows = cur.fetchall()
        if not rows:
            return {"purpose": "MARRIAGE_UPDATE", "purpose_name": PURPOSES["MARRIAGE_UPDATE"]["name"], "consent_id": None, "status": "NOT_REQUESTED", "who": "both people", "parties": []}
        sts = [r["status"] for r in rows]
        bad = next((x for x in sts if x in ("REFUSED", "REVOKED", "EXPIRED", "ENDED")), None)
        status = "GRANTED" if all(x == "GRANTED" for x in sts) and len(rows) >= 2 else bad or "PENDING"
        return {"purpose": "MARRIAGE_UPDATE", "purpose_name": PURPOSES["MARRIAGE_UPDATE"]["name"], "consent_id": rows[0]["id"], "status": status, "who": "both people",
                "parties": [{"name": r["name"], "status": r["status"], "consent_id": r["id"]} for r in rows]}
    purpose = GATED.get(pr["kind"])
    if not purpose:
        return None
    cur.execute("SELECT id, status, person_id FROM mdm.consent WHERE event_id=%s AND purpose=%s ORDER BY id DESC LIMIT 1", (pr["event_id"], purpose))
    c = cur.fetchone()
    return {"purpose": purpose, "purpose_name": PURPOSES[purpose]["name"], "consent_id": c and c["id"], "status": c["status"] if c else "NOT_REQUESTED", "who": "the parent"}


def require_gate(cur, pr: dict):
    g = gate_for(cur, pr)
    if g and g["status"] not in ("GRANTED", "NOT_REQUESTED"):          # events received before consent existed have no request
        who = g.get("who", "the parent")
        raise Refused(f"Waiting for consent from {who}: '{g['purpose_name']}' is {g['status'].lower()}. Nothing about the other person is used until every consent is granted.", 409)


def marriage_consents(cur, event_id: int, groom_id: int, bride_id: int, actor: str) -> list[dict]:
    """A marriage touches two people's records, so each is asked separately and nothing is shared until both agree."""
    return [request_consent(cur, pid, "MARRIAGE_UPDATE", actor, subject_id=pid, event_id=event_id) for pid in (groom_id, bride_id)]


def needs_reason(pol: dict, kind: str) -> bool:
    return kind in pol["rationale_required_kinds"] or kind in SENSITIVE_ALWAYS


def require_rationale(cur, pr: dict, note: str | None):
    pol = current(cur)
    if needs_reason(pol, pr["kind"]):
        if len((note or "").strip()) < pol["rationale_min_chars"]:
            raise Refused(f"This action needs a reason of at least {pol['rationale_min_chars']} characters, recorded against your name.")


def approvals(cur, system=None, status="PROPOSED", limit=50, offset=0) -> dict:
    pol = current(cur)
    where, p = ["pr.status=%s"], [status]
    if system:
        where.append("pr.system=%s")
        p.append(system)
    w = " AND ".join(where)
    cur.execute(f"SELECT count(*) AS n FROM mdm.proposal pr WHERE {w}", p)
    total = cur.fetchone()["n"]
    cur.execute(f"""SELECT pr.*, pe.name AS person_name, pe.mdm_id FROM mdm.proposal pr LEFT JOIN mdm.person pe ON pe.id=pr.person_id
                    WHERE {w} ORDER BY pr.id DESC LIMIT %s OFFSET %s""", p + [limit, offset])
    items = cur.fetchall()
    for i in items:
        i["gate"] = gate_for(cur, i)
        i["needs_rationale"] = needs_reason(pol, i["kind"])
    cur.execute("SELECT system, count(*) AS n FROM mdm.proposal WHERE status=%s GROUP BY system ORDER BY n DESC", (status,))
    return {"total": total, "items": items, "by_system": cur.fetchall(), "rationale_min_chars": pol["rationale_min_chars"]}


def event_flow(cur, eid: int) -> dict:
    cur.execute("SELECT * FROM mdm.event WHERE id=%s", (eid,))
    ev = cur.fetchone()
    if not ev:
        raise Refused("Event not found", 404)
    cur.execute("SELECT * FROM mdm.proposal WHERE event_id=%s ORDER BY id", (eid,))
    props = cur.fetchall()
    pol = current(cur)
    for pr in props:
        pr["gate"] = gate_for(cur, pr)
        pr["needs_rationale"] = needs_reason(pol, pr["kind"])
    cur.execute("SELECT c.*, pe.name AS person_name FROM mdm.consent c LEFT JOIN mdm.person pe ON pe.id=c.person_id WHERE c.event_id=%s ORDER BY c.id", (eid,))
    cons = cur.fetchall()
    for c in cons:
        c["purpose_name"] = PURPOSES.get(c["purpose"], {}).get("name", c["purpose"])
    person = _person_ref(cur, ev["person_id"]) if ev["person_id"] else None
    timeline = [{"ts": ev["received_at"], "what": f"Event received: {ev['event_type']}", "detail": ev["note"]}]
    for c in cons:
        timeline.append({"ts": c["requested_at"], "what": f"Consent requested: {c['purpose_name']}", "detail": f"From {c['person_name']}"})
        if c["responded_at"]:
            timeline.append({"ts": c["responded_at"], "what": f"Consent {c['status'].lower()}: {c['purpose_name']}", "detail": c["channel"]})
    for pr in props:
        timeline.append({"ts": pr["created_at"], "what": f"Proposed: {pr['summary']}", "detail": pr["system"]})
        if pr["decided_at"]:
            timeline.append({"ts": pr["decided_at"], "what": f"{pr['status'].title()} by {pr['decided_by'] or 'system'}", "detail": pr.get("rationale") or pr.get("note")})
    timeline.sort(key=lambda t: t["ts"])
    return {"event": ev, "person": person, "proposals": props, "rationale_min_chars": pol["rationale_min_chars"], "consents": cons, "deliveries": deliveries_for_event(cur, eid), "timeline": timeline}


# ------------------------------------------------------------------ verification-only queries
def _band(edges: list, amount: float) -> int:
    for i, e in enumerate(edges):
        if amount <= e:
            return i
    return len(edges)


def _band_label(edges: list, i: int) -> str:
    f = lambda x: f"{x / 100000:g} lakh"
    if i == 0:
        return f"up to {f(edges[0])}"
    if i >= len(edges):
        return f"above {f(edges[-1])}"
    return f"{f(edges[i - 1])} to {f(edges[i])}"


def _certs(recs: list[dict], rtype: str):
    valid, expired = [], []
    for r in recs:
        if r["source"] == "revenue_certificates" and r["rtype"] == rtype:
            p = r["payload"] or {}
            ok = (p.get("status") or "ACTIVE") == "ACTIVE" and (not p.get("valid_until") or str(p["valid_until"])[:10] >= REF_DATE.isoformat())
            (valid if ok else expired).append(p)
    return valid, expired


def household_ids(cur, pid: int, recs: list[dict]) -> tuple[list[int], list[str]]:
    """People who share a ration card with this person, and the cards used. A card is only a proxy for a household."""
    cards = sorted({r["ration_card"] for r in recs if r["source"] == "pds_view" and r["ration_card"]})
    if not cards:
        return [pid], []
    cur.execute("SELECT DISTINCT person_id FROM mdm.source_record WHERE source='pds_view' AND ration_card = ANY(%s) AND person_id IS NOT NULL", (cards,))
    ids = {r["person_id"] for r in cur.fetchall()} | {pid}
    return sorted(ids), cards


def _evaluate_household(cur, pid: int, q: str, recs: list[dict], pol: dict):
    ids, cards = household_ids(cur, pid, recs)
    allrecs = store.records_of(cur, ids)
    flat = [r for rs in allrecs.values() for r in rs]
    how = f"through ration card {', '.join(cards)}" if cards else "for this person only, as no ration card links them to a household"
    tenants = sum(1 for r in flat if r["source"] == "pds_view" and (r["payload"] or {}).get("tenant") == "Y")
    caution = " A ration card can be shared by tenants and owners, so this is a proxy for a household, not proof of one." if tenants else ""
    if q in ("HOUSEHOLD_HAS_BENEFIT", "DUPLICATE_BENEFIT"):
        apps = [r for r in flat if r["source"] == "housing"]
        if q == "DUPLICATE_BENEFIT":
            if len(apps) >= 2:
                return "ANSWERED", {"answer": "POSSIBLE_DUPLICATE", "message": "Another application exists for this household. Its details, and which department holds it, are not shared." + caution, "source": "Master data"}
            return "ANSWERED", {"answer": "NONE_FOUND", "message": f"No second application was found {how}.", "source": "Master data"}
        mine = any(r["person_id"] == pid for r in apps)
        return "ANSWERED", {"answer": "YES" if apps else "NO", "quality": "DIRECT" if mine else ("HOUSEHOLD" if apps else None),
                            "message": (f"Found {how}." if apps else f"None found {how}.") + caution, "source": "Housing"}
    if q == "ELECTRICITY_LINKED":
        el = [r for r in flat if r["source"] == "electricity"]
        if not el:
            return "ANSWERED", {"answer": "NO", "message": f"No electricity connection is linked {how}. Electricity has no household field, so a connection in another name or address may exist.", "source": "Electricity distribution"}
        mine = any(r["person_id"] == pid for r in el)
        weakest = min((float(r["score"]) for r in el if r["score"] is not None), default=None)
        return "ANSWERED", {"answer": "YES", "quality": "DIRECT" if mine else "INDIRECT",
                            "message": ("The connection is in this person's own name." if mine else "The connection is in another household member's name, so the link is indirect.")
                                       + (f" Match strength {round(weakest * 100)}%." if weakest is not None else "") + caution, "source": "Electricity distribution"}
    if q == "LAND_HOLDING":
        land = [r for r in flat if r["source"] == "revenue_land"]
        if not land:
            return "ANSWERED", {"answer": "NO", "message": f"No land record is linked {how}.", "source": "Revenue"}
        newest = max(str((r["payload"] or {}).get("last_updated") or "")[:10] for r in land)
        stale = bool(newest) and (REF_DATE - date.fromisoformat(newest)).days > pol["land_stale_days"]
        return "ANSWERED", {"answer": "YES", "last_updated": newest or None, "stale": stale,
                            "message": ("The newest land record was last updated " + newest + ", longer ago than policy allows, so it may not show recent sales or succession." if stale else f"Linked {how}.") + caution, "source": "Revenue"}
    raise Refused("Unknown question")


def _evaluate(cur, pid: int, q: str, params: dict, pol: dict):
    recs = store.records_of(cur, [pid]).get(pid, [])
    if q in ("HOUSEHOLD_HAS_BENEFIT", "DUPLICATE_BENEFIT", "ELECTRICITY_LINKED", "LAND_HOLDING"):
        return _evaluate_household(cur, pid, q, recs, pol)
    if q == "MARRIAGE_RECORDED":
        if any(r["rtype"] in ("MARRIAGE_GROOM", "MARRIAGE_BRIDE") for r in recs):
            return "ANSWERED", {"answer": "MARRIAGE_RECORDED", "source": "Marriage register"}
        cur.execute("SELECT raised_at FROM mdm.discrepancy WHERE person_id=%s AND kind='DECLARATION' AND attribute='marital_status' AND status='DECLARED' ORDER BY id DESC LIMIT 1", (pid,))
        d = cur.fetchone()
        if d:
            return "ANSWERED", {"answer": "CITIZEN_DECLARED", "message": "No register entry, but the citizen has declared a marriage. This is not verified.", "source": "Citizen declaration"}
        return "NO_RECORD", {"message": "No marriage is recorded. The register covers only part of the state, so this never means the person is unmarried."}
    edges = pol["income_band_edges"]
    if q in ("INCOME_AT_MOST", "CATEGORY_IS"):
        rtype = "INCOME" if q == "INCOME_AT_MOST" else "CASTE"
        label = "income" if rtype == "INCOME" else "category"
        valid, expired = _certs(recs, rtype)
        if not valid and not expired:
            return "NO_RECORD", {"message": f"No {label} certificate is held for this person in Telangana. That is not the same as a low or negative answer. Ask the applicant for the certificate."}
        if not valid:
            return "EXPIRED_SOURCE", {"message": f"The {label} certificate has expired. Route the applicant to the issuing revenue service to renew it.", "source": "Revenue"}
        until = min(str(p["valid_until"])[:10] for p in valid if p.get("valid_until")) if any(p.get("valid_until") for p in valid) else None
        if rtype == "INCOME":
            try:
                limit = float(params.get("limit"))
            except (TypeError, ValueError):
                raise Refused("Give the income limit as a number, for example 200000")
            bands = {_band(edges, float(p["annual_income"])) for p in valid if p.get("annual_income") not in (None, "")}
            yes = {float(p["annual_income"]) <= limit for p in valid if p.get("annual_income") not in (None, "")}
            if len(bands) > 1 or len(yes) > 1:
                return "CONFLICT", {"message": "Valid certificates disagree about income. No answer is chosen; an officer should settle it with the issuing office.", "sources": len(valid)}
            b = next(iter(bands))
            return "ANSWERED", {"answer": "YES" if yes == {True} else "NO", "band": _band_label(edges, b), "valid_until": until, "source": "Revenue"}
        want = str(params.get("category") or "").strip().upper()
        if not want:
            raise Refused("Give the category to check, for example OBC")
        cats = {(p.get("category") or "").upper() for p in valid if p.get("category")}
        if len(cats) > 1:
            return "CONFLICT", {"message": "Valid certificates give different categories. No answer is chosen; an officer should settle it with the issuing office.", "sources": len(valid)}
        if not cats:
            return "NO_RECORD", {"message": "A certificate exists but states no category."}
        return "ANSWERED", {"answer": "YES" if want in cats else "NO", "valid_until": until, "source": "Revenue"}
    if q == "AGE_AT_LEAST":
        try:
            yrs = int(params.get("years"))
        except (TypeError, ValueError):
            raise Refused("Give the age as a whole number")
        age = person_age(cur, pid)
        if age is None:
            return "NO_RECORD", {"message": "No date of birth or birth year is known."}
        cur.execute("SELECT dob FROM mdm.person WHERE id=%s", (pid,))
        if cur.fetchone()["dob"] is None and abs(age - yrs) <= 1:
            return "ANSWERED", {"answer": "UNDETERMINED", "message": "Only a birth year is known, which is too coarse to answer at this age.", "source": "Master data"}
        return "ANSWERED", {"answer": "YES" if age >= yrs else "NO", "source": "Master data"}
    if q == "RESIDENT":
        return "ANSWERED", {"answer": "YES", "message": "Known to Telangana records.", "source": "Master data"}
    if q == "DEATH_REGISTERED":
        dead = any(r["rtype"] == "DEATH" for r in recs)
        return "ANSWERED", {"answer": "DEATH_REGISTERED" if dead else "NO_DEATH_RECORD",
                            "message": None if dead else "No death record exists. That is not proof the person is alive.", "source": "Civil registration"}
    raise Refused("Unknown question")


def verify(cur, requester: str, purpose: str, question: str, params: dict | None, actor: str, person_id: int | None = None,
           reference_token: str | None = None) -> dict:
    t0 = time.perf_counter()
    params = params or {}
    qd, pu = QUESTIONS.get(question), PURPOSES.get(purpose)
    if not qd:
        raise Refused("Unknown question. See /api/x/questions")
    if not pu:
        raise Refused("Unknown purpose. See /api/x/purposes")
    ms = lambda: int((time.perf_counter() - t0) * 1000)

    def finish(outcome, answer, pid=None, cid=None, code=200):
        lid = ledger(cur, "VERIFY", requester, actor, purpose, pid, cid, question, outcome, answer, ms())
        return {"outcome": outcome, **answer, "ledger_id": lid, "policy_versions": versions(cur), "consent_id": cid}

    if requester != pu["system"]:
        return finish("DENIED_POLICY", {"message": f"Policy: only {SYSTEMS.get(pu['system'])} may ask for the purpose '{pu['name']}'."})
    if qd["element"] not in pu["elements"]:
        return finish("DENIED_POLICY", {"message": f"Policy: '{pu['name']}' does not allow questions about {qd['element'].replace('_', ' ')}."})
    pid = person_id
    if reference_token:
        cur.execute("SELECT person_id FROM mdm.source_record WHERE source='identity_reference' AND source_rid=%s", (reference_token,))
        r = cur.fetchone()
        pid = r["person_id"] if r else None
        if not pid:
            return finish("NO_RECORD", {"message": "This identity reference is not known to Telangana records. That does not mean the person does not exist elsewhere."})
    if not pid or not _person_ref(cur, pid):
        return finish("NO_RECORD", {"message": "No such person is known to Telangana records."})
    cid = None
    if pu["consent"]:
        c = active_consent(cur, pid, purpose)
        if not c or c["status"] != "GRANTED":
            why = "no consent has been given for this purpose" if not c else f"the consent is {c['status'].lower()}"
            return finish("DENIED_NO_CONSENT", {"message": f"Not answered: {why}. The person must consent first; nothing was looked up."}, pid, c and c["id"])
        cid = c["id"]
        if qd["element"] not in (c["scope"] or {}).get("elements", []):
            return finish("DENIED_POLICY", {"message": f"Not answered: the person's consent does not cover {qd['element'].replace('_', ' ')}."}, pid, cid)
    pol = current(cur)
    cur.execute("SELECT count(*) AS n FROM mdm.exchange WHERE kind='VERIFY' AND requester_actor=%s AND person_id=%s AND ts > now() - interval '1 hour' "
                "AND outcome IN ('ANSWERED','NO_RECORD','CONFLICT','EXPIRED_SOURCE')", (actor, pid))
    if cur.fetchone()["n"] >= pol["max_lookups_per_hour"]:
        audit.write(cur, actor, "MISUSE_ALERT", f"person:{pid}", {"reason": "REPEATED_LOOKUP", "requester": requester, "purpose": purpose, "limit_per_hour": pol["max_lookups_per_hour"]})
        return finish("DENIED_POLICY", {"message": f"Not answered: this person has already been looked up {pol['max_lookups_per_hour']} times in the last hour by the same user. This is flagged for review.", "alert": "REPEATED_LOOKUP"}, pid, cid)
    outcome, ans = _evaluate(cur, pid, question, params, pol)
    return finish(outcome, ans, pid, cid)


def person_exchange_summary(cur, pid: int) -> dict:
    cur.execute("SELECT id, purpose, status, system, expires_at, responded_at, channel FROM mdm.consent WHERE person_id=%s OR subject_person_id=%s ORDER BY id DESC LIMIT 50", (pid, pid))
    cons = cur.fetchall()
    for c in cons:
        c["purpose_name"] = PURPOSES.get(c["purpose"], {}).get("name", c["purpose"])
        c["system_name"] = SYSTEMS.get(c["system"], c["system"])
    cur.execute("SELECT id, ts, kind, requester, purpose, question, outcome FROM mdm.exchange WHERE person_id=%s ORDER BY id DESC LIMIT 25", (pid,))
    return {"identity": identity_of(cur, pid), "consents": cons, "exchanges": cur.fetchall()}


def event_stream(cur, uc=None, status=None, limit=50, offset=0) -> dict:
    """The event feed with what happened for each subscribing department, one line per event."""
    where, p = ["true"], []
    for col, v in (("e.uc", uc), ("e.status", status)):
        if v:
            where.append(f"{col}=%s")
            p.append(v)
    w = " AND ".join(where)
    cur.execute(f"SELECT count(*) AS n FROM mdm.event e WHERE {w}", p)
    total = cur.fetchone()["n"]
    cur.execute("SELECT status, count(*) AS n FROM mdm.event GROUP BY status")
    by_status = {r["status"]: r["n"] for r in cur.fetchall()}
    cur.execute(f"""SELECT e.id, e.event_key, e.event_type, e.uc, e.scenario, e.status, e.note, e.payload, e.received_at, e.person_id,
                      (SELECT count(*) FROM mdm.delivery d WHERE d.event_id=e.id AND d.kind='EVENT' AND d.status='DELIVERED') AS delivered,
                      (SELECT count(*) FROM mdm.delivery d WHERE d.event_id=e.id AND d.kind='EVENT' AND d.status='PENDING_CONSENT') AS waiting,
                      (SELECT count(*) FROM mdm.delivery d WHERE d.event_id=e.id AND d.kind='EVENT' AND d.status LIKE 'BLOCKED%%') AS blocked,
                      (SELECT count(*) FROM mdm.proposal x WHERE x.event_id=e.id AND x.status='PROPOSED') AS open_proposals
                    FROM mdm.event e WHERE {w} ORDER BY e.id DESC LIMIT %s OFFSET %s""", p + [limit, offset])
    return {"total": total, "limit": limit, "offset": offset, "items": cur.fetchall(), "by_status": by_status}
