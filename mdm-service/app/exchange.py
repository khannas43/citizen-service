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

from .sorting import order_by, date_range
from . import audit, store
from .stewardship import Refused
from .survivorship import REF_DATE

SYSTEMS = {"pds": "Civil supplies (PDS)", "health": "Health", "welfare": "Women and child welfare", "citizen": "Citizen record",
           "education": "Education / scholarship", "housing": "Housing", "pension": "Social security / pension MIS",
           "revenue": "Revenue", "electricity": "Electricity distribution", "mdm": "Master data (steward)",
           "crs": "Civil registration", "marriage_register": "Marriage register", "identity": "Identity reference service",
           "water": "Water supply board"}

# Display name → department code. Kept in one place for proposal.system_code and filter params.
# Non-department actors ("MDM steward", policy officers, …) map to mdm.
SYSTEM_CODE_BY_NAME = {
    **{name: code for code, name in SYSTEMS.items()},
    "MDM steward": "mdm",
    "Authorised officer (policy)": "mdm",
    "Departments holding her record": "mdm",
    "Revenue: land records": "revenue",
    "Identity reference service": "identity",
}


def system_code(name_or_code: str | None) -> str | None:
    """Accept a department code or display name; return the code. Unknown names become mdm."""
    if not name_or_code:
        return None
    if name_or_code in SYSTEMS:
        return name_or_code
    return SYSTEM_CODE_BY_NAME.get(name_or_code, "mdm")

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
    # UC4 (Y3): a use can have its own consent length. A scholarship check needs weeks, not a year.
    "consent_expiry_days_by_purpose": {"SCHOLARSHIP_ELIGIBILITY": 90, "HOUSEHOLD_BENEFIT": 90},
    "consent_response_days": 14,
    "max_reminders": 2,
    "late_event_days": 60,
    "income_band_edges": [100000, 200000, 300000, 500000],
    "rationale_min_chars": 10,
    "department_response_days": 30,
    "rationale_required_kinds": ["CONFIRM_DEATH", "MARK_DECEASED_PDS", "STOP_PENSION", "CLOSE_SCHOLARSHIP",
                                 "CONFIRM_MARRIAGE", "REVIEW_PARENTS", "LINK_AMBIGUOUS", "SOURCE_CONFLICT",
                                 "SETTLE_SOURCE_CONFLICT"],
    "temp_result_minutes": 15,
    "event_retention_days": 90,
    "consent_evidence_days": 365,
    "land_stale_days": 365,
    "max_delivery_attempts": 3,
    "query_max_population": 500,
    "max_lookups_per_hour": 10,
    # Birth parent confidence (Change 3). Separate from matching.Config.auto (record linking).
    "parent_confirm_score": 0.70,
    "parent_confirm_requires_couple": True,
    # UC1: a single candidate this far below the automatic score (or closer) is "probably the same person" (LINK_NEAR).
    "link_near_margin": 0.06,
}
SENSITIVE_ALWAYS = {"REFER_UNDERAGE", "SETTLE_SOURCE_CONFLICT", "REVIEW_DUPLICATE_BENEFIT", "SETTLE_HOUSEHOLD_CONFLICT"}            # always needs a reason, whatever the policy list says
POLICY_TEXT = {
    "min_marriage_age": "Legal minimum age at marriage, by gender. A record below it goes to an authorised officer; nothing is reported elsewhere.",
    "adult_age": "Age at which a guardian's consent ends and the individual must give their own.",
    "consent_expiry_days": "How long a granted consent lasts before it expires.",
    "consent_expiry_days_by_purpose": "A different consent length, in days, for a particular use (for example the scholarship check). Uses not listed here follow the general consent length.",
    "consent_response_days": "How long a parent or citizen has to answer a consent request before it lapses.",
    "max_reminders": "Most reminders ever sent for one consent request. After that, no more prompting.",
    "late_event_days": "A birth registered later than this many days after the birth is treated as a late registration.",
    "income_band_edges": "Upper limits (rupees a year) that separate income bands in verification answers.",
    "rationale_min_chars": "Shortest acceptable reason when an officer approves or rejects a sensitive action.",
    "department_response_days": "Default days before an open work item is overdue. Per-use response times in Policy stay as overrides.",
    "rationale_required_kinds": "Actions where the approver must record a reason.",
    "temp_result_minutes": "How long the temporary result of a query is kept before it is deleted.",
    "event_retention_days": "How long an event keeps its full details. After that only a thin reference is kept.",
    "consent_evidence_days": "How long a consent record is kept after it ends, as evidence.",
    "land_stale_days": "A land record not updated for this many days is flagged as possibly out of date.",
    "max_delivery_attempts": "How many times delivery to a department is tried before it is set aside for review.",
    "query_max_population": "Largest group of people one query may match. Wider queries are refused.",
    "max_lookups_per_hour": "Most times one user may look up the same person in an hour. More is flagged as possible misuse.",
    "parent_confirm_score": "Lowest match score at which a parent named on a birth is treated as confident (0.5–0.95). Below this, an officer must confirm the parent before they see the child's approval.",
    "link_near_margin": "How far below the automatic link score a single candidate can be and still count as probably the same person (0.01–0.20). Lower scores are shown as unlikely to be the same person.",
    "parent_confirm_requires_couple": "When both parents are named and matched, they must also be linked as a couple (spouse or shared ration card) to be confident. If not linked, both are held for an officer.",
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
    "HOUSEHOLD_INCOME_AT_MOST": {"label": "Household income (highest band among its members) is at most a stated limit", "element": "income_band", "param": "limit"},
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
    # A use added later (UC5) gets its default length, but never over something an officer set: only while the stored value is still the system default.
    cur.execute("SELECT version, value, changed_by FROM mdm.policy WHERE key='consent_expiry_days_by_purpose' AND active")
    row = cur.fetchone()
    if row and row["changed_by"] == "system" and isinstance(row["value"], dict):
        missing = {k: v for k, v in DEFAULTS["consent_expiry_days_by_purpose"].items() if k not in row["value"]}
        if missing:
            cur.execute("UPDATE mdm.policy SET active=false WHERE key='consent_expiry_days_by_purpose' AND active")
            cur.execute("INSERT INTO mdm.policy (key, version, value, active, changed_by, note) VALUES (%s,%s,%s::jsonb,true,'system','Default extended for a new use')",
                        ("consent_expiry_days_by_purpose", row["version"] + 1, _js({**row["value"], **missing})))


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
    elif key == "parent_confirm_score":
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not (0.5 <= float(v) <= 0.95):
            raise Refused("parent_confirm_score must be a number between 0.5 and 0.95")
    elif key == "consent_expiry_days_by_purpose":
        if (not isinstance(v, dict) or not all(isinstance(k, str) and k in PURPOSES for k in v)
                or not all(isinstance(x, int) and not isinstance(x, bool) and 1 <= x <= 36500 for x in v.values())):
            raise Refused("consent_expiry_days_by_purpose needs a whole number of days (1 to 36500) for each listed use")
    elif key == "parent_confirm_requires_couple":
        if not isinstance(v, bool):
            raise Refused("parent_confirm_requires_couple must be true or false")
    elif key == "link_near_margin":
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not (0.01 <= float(v) <= 0.20):
            raise Refused("link_near_margin must be a number between 0.01 and 0.20")
    else:
        if not isinstance(v, int) or isinstance(v, bool) or v < 0 or v > 36500:
            raise Refused(f"{key} must be a whole number of 0 or more")
        if key == "adult_age" and not 10 <= v <= 25:
            raise Refused("adult_age must be between 10 and 25")
        if key == "max_reminders" and v > 10:
            raise Refused("max_reminders cannot exceed 10")


def expiry_days_for(pol: dict, purpose: str | None) -> int:
    """How long a grant for this use lasts: the per-use override when there is one, else the general length."""
    by = pol.get("consent_expiry_days_by_purpose")
    if isinstance(by, dict) and purpose in by:
        try:
            return int(by[purpose])
        except (TypeError, ValueError):
            pass
    return int(pol["consent_expiry_days"])


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
    elif key == "consent_expiry_days_by_purpose":
        cur.execute("SELECT count(*) AS n FROM mdm.consent WHERE status='GRANTED' AND purpose = ANY(%s)", (list((value or {}).keys()) or [""],))
        out["lines"].append(f"{cur.fetchone()['n']} granted consent(s) for those uses keep their existing expiry date. Only new grants use the new number of days.")
    elif key == "rationale_required_kinds":
        out["lines"].append("Applies to the next decision on those actions.")
    elif key == "parent_confirm_score":
        # How many open birth ration-card items would change group under the new bar.
        cur.execute("""
            SELECT count(*) AS n FROM mdm.proposal
            WHERE status='PROPOSED' AND kind='ADD_TO_RATION_CARD' AND uc='UC2' AND detail ? 'parents'
        """)
        open_birth = cur.fetchone()["n"]
        would = 0
        cur.execute("""
            SELECT id, detail, reason_code FROM mdm.proposal
            WHERE status='PROPOSED' AND kind='ADD_TO_RATION_CARD' AND uc='UC2' AND detail ? 'parents'
        """)
        require_couple = bool(pol.get("parent_confirm_requires_couple", DEFAULTS["parent_confirm_requires_couple"]))
        for row in cur.fetchall():
            parents = (row.get("detail") or {}).get("parents") or {}
            new_conf = parents_block_confident(parents, float(value), require_couple)
            old_code = row.get("reason_code")
            new_code = "BIRTH_CLEAN" if new_conf else "BIRTH_PARENT_UNSURE"
            if (old_code in ("BIRTH_CLEAN", "BIRTH_LATE") and not new_conf) or (
                    old_code == "BIRTH_PARENT_UNSURE" and new_conf):
                would += 1
        out["lines"].append(
            f"{open_birth} open birth ration-card item(s); {would} would change group under the new bar {value}.")
    elif key == "parent_confirm_requires_couple":
        out["lines"].append("Applies at once when judging open birth parent matches that lack a stored confident flag.")
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


LEDGER_SORT = {"ts": "e.ts", "kind": "e.kind", "requester": "lower(e.requester)", "person_name": "lower(pe.name)", "question": "e.question", "outcome": "e.outcome"}


def list_ledger(cur, outcome=None, person_id=None, kind=None, limit=50, offset=0, q=None, date_from=None, date_to=None, sort=None, direction='desc') -> dict:
    where, p = ["true"], []
    for col, v in (("e.outcome", outcome), ("e.person_id", person_id), ("e.kind", kind)):
        if v:
            where.append(f"{col}=%s")
            p.append(v)
    if q and q.strip():
        where.append("(coalesce(e.requester,'') ILIKE %s OR coalesce(e.purpose,'') ILIKE %s OR coalesce(e.question,'') ILIKE %s OR coalesce(pe.name,'') ILIKE %s OR coalesce(e.requester_actor,'') ILIKE %s)")
        p += [f"%{q.strip()}%"] * 5
    date_range(where, p, "e.ts", date_from, date_to)
    w = " AND ".join(where)
    cur.execute(f"SELECT count(*) AS n FROM mdm.exchange e LEFT JOIN mdm.person pe ON pe.id=e.person_id WHERE {w}", p)
    total = cur.fetchone()["n"]
    cur.execute(f"SELECT e.*, pe.name AS person_name, pe.mdm_id FROM mdm.exchange e LEFT JOIN mdm.person pe ON pe.id=e.person_id WHERE {w} ORDER BY {order_by(LEDGER_SORT, sort, direction, 'e.id DESC', 'e.id DESC')} LIMIT %s OFFSET %s", p + [limit, offset])
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
    if purpose == "HOUSEHOLD_BENEFIT":
        # UC5 Z1: only an adult can be the applicant; nobody else in the household is asked
        age = person_age(cur, person_id)
        if age is not None and age < int(current(cur).get("adult_age") or 18):
            raise Refused("A housing check can only be asked of an adult applicant", 409)
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
    """Parent or household member — used by the assisted / officer-present given_by path only."""
    cur.execute("SELECT 1 FROM mdm.relationship WHERE kind IN ('PARENT_OF','SAME_HOUSEHOLD') AND "
                "((person_a=%s AND person_b=%s) OR (person_a=%s AND person_b=%s)) LIMIT 1", (guardian_id, principal_id, principal_id, guardian_id))
    return bool(cur.fetchone())


def _parent_of_ok(cur, parent_id: int, child_id: int) -> bool:
    """Recorded PARENT_OF only. Citizen approvals must not treat SAME_HOUSEHOLD as enough (D3)."""
    cur.execute("SELECT 1 FROM mdm.relationship WHERE kind='PARENT_OF' AND "
                "((person_a=%s AND person_b=%s) OR (person_a=%s AND person_b=%s)) LIMIT 1",
                (parent_id, child_id, child_id, parent_id))
    return bool(cur.fetchone())


def parent_confirm_settings(cur=None, pol: dict | None = None) -> tuple[float, bool]:
    """Return (parent_confirm_score, parent_confirm_requires_couple) from policy or defaults."""
    if pol is None and cur is not None:
        pol = current(cur)
    pol = pol or {}
    bar = float(pol.get("parent_confirm_score", DEFAULTS["parent_confirm_score"]))
    require = bool(pol.get("parent_confirm_requires_couple", DEFAULTS["parent_confirm_requires_couple"]))
    return bar, require


def _side_named(parents: dict, side: str) -> bool:
    p = (parents or {}).get(side) or {}
    return bool(p.get("name") or p.get("person_id") is not None)


def parent_side_confident(parents: dict, side: str, bar: float, require_couple: bool) -> bool:
    """One named parent is confident under Change 3 (score bar + couple check when both matched)."""
    p = (parents or {}).get(side) or {}
    if not _side_named(parents, side):
        return True  # not named → not held as this side
    if p.get("person_id") is None or p.get("score") is None:
        return False
    try:
        if float(p["score"]) < bar:
            return False
    except (TypeError, ValueError):
        return False
    other = "father" if side == "mother" else "mother"
    o = (parents or {}).get(other) or {}
    if require_couple and _side_named(parents, other) and o.get("person_id") is not None and p.get("person_id") is not None:
        linked = parents.get("couple_linked")
        if linked is None:
            # Old proposals: cannot prove a couple from scores alone → treat as not linked.
            linked = False
        if not linked:
            return False
    return True


def parents_block_confident(parents: dict, bar: float | None = None, require_couple: bool | None = None) -> bool:
    """Overall confident flag: every named parent is confident. Uses stored flag when present."""
    parents = parents or {}
    if "confident" in parents and parents["confident"] is not None:
        return bool(parents["confident"])
    if bar is None:
        bar = float(DEFAULTS["parent_confirm_score"])
    if require_couple is None:
        require_couple = bool(DEFAULTS["parent_confirm_requires_couple"])
    named = [s for s in ("mother", "father") if _side_named(parents, s)]
    if not named:
        return False
    return all(parent_side_confident(parents, s, bar, require_couple) for s in named)


def parent_hold_reasons(parents: dict, bar: float, require_couple: bool) -> list[str]:
    """Human reasons a parent block is held (for REVIEW_PARENTS summary)."""
    reasons = []
    parents = parents or {}
    for side in ("mother", "father"):
        if not _side_named(parents, side):
            continue
        p = parents.get(side) or {}
        label = "mother" if side == "mother" else "father"
        if p.get("person_id") is None:
            reasons.append(f"{label} not found")
            continue
        try:
            score = float(p["score"]) if p.get("score") is not None else None
        except (TypeError, ValueError):
            score = None
        if score is None or score < bar:
            reasons.append(f"{label} (score {score if score is not None else '?'} is below the bar {bar})")
    if require_couple:
        m, f = (parents.get("mother") or {}), (parents.get("father") or {})
        if m.get("person_id") and f.get("person_id") and not parents.get("couple_linked"):
            reasons.append("the two parents are not linked as a couple")
    seen, out = set(), []
    for r in reasons:
        if r and r not in seen:
            seen.add(r)
            out.append(r)
    return out


def enrich_parents_confidence(parents: dict, bar: float, require_couple: bool, couple_linked: bool | None = None) -> dict:
    """Attach confident / couple_linked / bar onto a parents detail dict (mutates and returns it)."""
    parents = dict(parents or {})
    if couple_linked is not None:
        parents["couple_linked"] = bool(couple_linked)
    elif "couple_linked" not in parents:
        parents["couple_linked"] = False
    parents["bar"] = bar
    # Compute without using a stale confident flag
    probe = {k: v for k, v in parents.items() if k != "confident"}
    parents["confident"] = parents_block_confident(probe, bar, require_couple)
    return parents


def parents_detail_for_event(cur, event_id: int | None) -> dict | None:
    if not event_id:
        return None
    cur.execute("""SELECT detail->'parents' AS parents FROM mdm.proposal
                   WHERE event_id=%s AND detail ? 'parents'
                   ORDER BY CASE kind WHEN 'REVIEW_PARENTS' THEN 0 WHEN 'ADD_TO_RATION_CARD' THEN 1 ELSE 2 END, id
                   LIMIT 1""", (event_id,))
    r = cur.fetchone()
    return (r and r["parents"]) or None


def open_parent_review(cur, event_id: int | None) -> dict | None:
    if not event_id:
        return None
    cur.execute("""SELECT id, summary FROM mdm.proposal
                   WHERE event_id=%s AND kind='REVIEW_PARENTS' AND status='PROPOSED' ORDER BY id LIMIT 1""",
                (event_id,))
    return cur.fetchone()


def _named_parent_on_event(cur, person_id: int, event_id: int | None, min_score: float = 0.0) -> bool:
    """True when a live birth match named this person as mother or father (any live proposal).

    min_score is kept for callers but Change 3 no longer gates visibility on MatchConfig.auto;
    use parent_side_confident / parents_block_confident instead.
    """
    if not event_id or not person_id:
        return False
    cur.execute("""SELECT 1 FROM mdm.proposal
                   WHERE event_id=%s AND detail ? 'parents'
                     AND status IN ('PROPOSED','APPROVED')
                     AND (
                       ((detail->'parents'->'mother'->>'person_id') = %s
                        AND COALESCE((detail->'parents'->'mother'->>'score')::float, 1.0) >= %s)
                       OR
                       ((detail->'parents'->'father'->>'person_id') = %s
                        AND COALESCE((detail->'parents'->'father'->>'score')::float, 1.0) >= %s)
                     )
                   LIMIT 1""", (event_id, str(person_id), min_score, str(person_id), min_score))
    return bool(cur.fetchone())


def _named_on_parents(parents: dict | None, person_id: int) -> str | None:
    if not parents:
        return None
    for side in ("mother", "father"):
        p = parents.get(side) or {}
        if p.get("person_id") is not None and int(p["person_id"]) == int(person_id):
            return side
    return None


def _named_parent_approved(cur, person_id: int, event_id: int | None) -> bool:
    """Officer confirmed this parent: APPROVED REVIEW_PARENTS (preferred) or ADD_TO_RATION_CARD."""
    if not event_id or not person_id:
        return False
    cur.execute("""SELECT 1 FROM mdm.proposal
                   WHERE event_id=%s AND detail ? 'parents' AND status='APPROVED'
                     AND kind IN ('REVIEW_PARENTS', 'ADD_TO_RATION_CARD')
                     AND ((detail->'parents'->'mother'->>'person_id') = %s
                       OR (detail->'parents'->'father'->>'person_id') = %s)
                   LIMIT 1""", (event_id, str(person_id), str(person_id)))
    return bool(cur.fetchone())


def parent_is_confident_on_event(cur, person_id: int, event_id: int | None) -> bool:
    """This named parent is confident under current policy (or stored flag)."""
    parents = parents_detail_for_event(cur, event_id)
    side = _named_on_parents(parents, person_id)
    if not side:
        return False
    bar, require = parent_confirm_settings(cur)
    # Prefer stored overall flag when present and true; still check per-side for mixed cases.
    return parent_side_confident(parents or {}, side, bar, require)


def parent_match_held(cur, person_id: int, event_id: int | None) -> bool:
    """True when this person is named on a birth and not yet confident or officer-confirmed."""
    if not event_id or not person_id:
        return False
    if _named_parent_approved(cur, person_id, event_id):
        return False
    if _named_parent_rejected_only(cur, person_id, event_id):
        return False
    parents = parents_detail_for_event(cur, event_id)
    if not _named_on_parents(parents, person_id):
        return False
    return not parent_is_confident_on_event(cur, person_id, event_id)


def _named_parent_rejected_only(cur, person_id: int, event_id: int | None) -> bool:
    """Named on a REJECTED REVIEW_PARENTS and not individually confident — stays locked out.

    A strong (confident) co-parent named on the same rejected review still proceeds (Change 2).
    """
    if not event_id or not person_id:
        return False
    if _named_parent_approved(cur, person_id, event_id):
        return False
    cur.execute("""SELECT detail->'parents' AS parents FROM mdm.proposal
                   WHERE event_id=%s AND kind='REVIEW_PARENTS' AND status='REJECTED'
                     AND ((detail->'parents'->'mother'->>'person_id') = %s
                       OR (detail->'parents'->'father'->>'person_id') = %s)
                   LIMIT 1""", (event_id, str(person_id), str(person_id)))
    row = cur.fetchone()
    if not row:
        return False
    parents = row["parents"] or {}
    side = _named_on_parents(parents, person_id)
    if not side:
        return False
    bar, require = parent_confirm_settings(cur)
    if parent_side_confident(parents, side, bar, require):
        return False
    return True


def notify_parents_confirmed(cur, event_id: int, parents: dict) -> None:
    """After an officer confirms held parents, send the birth approval notice once to those who were held."""
    from . import notify
    bar, require = parent_confirm_settings(cur)
    title = "మీ కోసం అనుమతి వేచి ఉంది / An approval is waiting for you"
    message = ("బిడ్డ రికార్డు గురించి ఒక శాఖ మీ అనుమతిని కోరింది. పౌర పోర్టల్‌లో అనుమతులు తెరవండి. / "
               "A department has asked for your permission about a child's record. Open Approvals in the citizen portal.")
    tracking = f"event-{event_id}"
    for side in ("mother", "father"):
        p = (parents or {}).get(side) or {}
        pid = p.get("person_id")
        if not pid:
            continue
        # Skip parents who were already confident at raise (they were notified then).
        if parent_side_confident(parents or {}, side, bar, require):
            continue
        if notify.send(cur, int(pid), title, message, tracking):
            cur.execute("""UPDATE mdm.consent SET notified_at=now()
                           WHERE event_id=%s AND person_id=%s AND notified_at IS NULL""", (event_id, int(pid)))


def _block_waiting_deliveries(cur, consent_id: int, blocked_status: str) -> int:
    """Close PENDING_CONSENT / RETRYING deliveries for a terminal consent. Never touches DELIVERED."""
    cur.execute(
        """UPDATE mdm.delivery SET status=%s, updated_at=now()
           WHERE consent_id=%s AND status IN ('PENDING_CONSENT','RETRYING')
           RETURNING id""",
        (blocked_status, consent_id),
    )
    return len(cur.fetchall())


def _expire_if_due(cur, c: dict, now, actor="system") -> dict:
    """Mark a lapsed consent as expired and stop what was waiting on it."""
    if c["status"] == "PENDING" and c["respond_by"] and c["respond_by"] <= now:
        cur.execute("UPDATE mdm.consent SET status='EXPIRED', ended_reason='NO_RESPONSE' WHERE id=%s", (c["id"],))
        _log(cur, c["id"], "EXPIRED", actor, note="No answer within the response window. No further prompts.")
        _block_waiting_deliveries(cur, c["id"], "BLOCKED_EXPIRED")
        return _consent(cur, c["id"])
    if c["status"] == "GRANTED" and c["expires_at"] and c["expires_at"] <= now:
        cur.execute("UPDATE mdm.consent SET status='EXPIRED', ended_reason='TERM_ENDED' WHERE id=%s", (c["id"],))
        _log(cur, c["id"], "EXPIRED", actor, note="The consent period ended.")
        _block_waiting_deliveries(cur, c["id"], "BLOCKED_EXPIRED")
        return _consent(cur, c["id"])
    return c


def preview_backfill_closed_consent_deliveries(cur) -> dict:
    """Count waiting deliveries that backfill would close, by current delivery status. No writes."""
    cur.execute(
        """SELECT d.status, count(*) AS n
           FROM mdm.delivery d
           JOIN mdm.consent c ON c.id = d.consent_id
           WHERE d.status IN ('PENDING_CONSENT','RETRYING')
             AND c.status IN ('EXPIRED','REFUSED','REVOKED','ENDED')
           GROUP BY d.status
           ORDER BY d.status"""
    )
    by_status = {r["status"]: r["n"] for r in cur.fetchall()}
    return {"by_status": by_status, "total": sum(by_status.values())}


def backfill_closed_consent_deliveries(cur) -> int:
    """Close waiting deliveries whose consent is already terminal (idempotent).

    Covers the case where a consent was marked EXPIRED/REFUSED/REVOKED/ENDED without
    updating its PENDING_CONSENT or RETRYING deliveries (e.g. an older cleanup).
    """
    closed = 0
    for consent_statuses, blocked in (
        (("EXPIRED",), "BLOCKED_EXPIRED"),
        (("REFUSED",), "BLOCKED_REFUSED"),
        (("REVOKED", "ENDED"), "BLOCKED_REVOKED"),
    ):
        cur.execute(
            """UPDATE mdm.delivery d
               SET status=%s, updated_at=now()
               FROM mdm.consent c
               WHERE d.consent_id = c.id
                 AND d.status IN ('PENDING_CONSENT','RETRYING')
                 AND c.status = ANY(%s)
               RETURNING d.id""",
            (blocked, list(consent_statuses)),
        )
        closed += len(cur.fetchall())
    return closed


def respond(cur, cid: int, decision: str, actor: str, channel: str = "PORTAL", operator: str | None = None, note: str | None = None,
            given_by: int | None = None, elements: list | None = None, expires_days: int | None = None, as_of=None,
            answered_as: str | None = None, declaration_version: str | None = None, answerer_id: int | None = None) -> dict:
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
    recorded_given_by = None
    # D3: another named or recorded parent of the subject (the child) may answer the birth consent.
    # SAME_HOUSEHOLD is not enough here; the answerer must be an adult under policy.
    if answerer_id and answerer_id != c["person_id"]:
        ans_age = person_age(cur, answerer_id)
        if ans_age is None or ans_age < pol["adult_age"]:
            raise Refused("Only an adult parent may answer for a child", 403)
        eid = c.get("event_id")
        ok = (c.get("subject_person_id") and _parent_of_ok(cur, answerer_id, c["subject_person_id"])) \
            or parent_is_confident_on_event(cur, answerer_id, eid) \
            or _named_parent_approved(cur, answerer_id, eid)
        if not ok or parent_match_held(cur, answerer_id, eid):
            raise Refused("Only a recorded parent of this person may answer", 403)
        recorded_given_by = answerer_id
    elif given_by and given_by != c["person_id"]:
        if age is not None and age >= pol["adult_age"]:
            raise Refused(f"This person is {age}, an adult under policy. Nobody else can answer for them.")
        if not _guardian_ok(cur, given_by, c["person_id"]):
            raise Refused("The person answering is not recorded as a parent or household member of this person")
        recorded_given_by = given_by
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
        days = expires_days if expires_days is not None else expiry_days_for(pol, c["purpose"])
        status, expires = "GRANTED", now + timedelta(days=days)
    cur.execute("UPDATE mdm.consent SET status=%s, scope=%s::jsonb, responded_at=%s, expires_at=%s, channel=%s, operator=%s, "
                "given_by_person_id=%s, answered_as=%s, declaration_version=%s WHERE id=%s",
                (status, _js(scope), now, expires, channel, operator, recorded_given_by, answered_as, declaration_version, cid))
    _log(cur, cid, status, actor, channel, note, {
        "operator": operator, "elements": scope.get("elements"), "partial": scope.get("partial"),
        "given_by": recorded_given_by, "answered_as": answered_as, "declaration_version": declaration_version,
        "answered_by_person_id": answerer_id or recorded_given_by or c["person_id"],
    })
    released = 0
    if status == "REFUSED":
        _block_waiting_deliveries(cur, cid, "BLOCKED_REFUSED")
    if status == "GRANTED":
        cur.execute("SELECT id FROM mdm.delivery WHERE consent_id=%s AND status='PENDING_CONSENT' ORDER BY id", (cid,))
        for d in cur.fetchall():
            attempt(cur, d["id"], actor, "consent granted")
            released += 1
    audit.write(cur, actor, f"CONSENT_{status}", f"consent:{cid}", {"purpose": c["purpose"], "channel": channel, "operator": operator, "partial": scope.get("partial"), "note": note})
    _story_sync(cur, c["person_id"])
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
        cur.execute("INSERT INTO mdm.delivery (event_id, consent_id, person_id, purpose, system, kind, status, detail) VALUES (%s,%s,%s,%s,%s,'REVOCATION','DELIVERED',%s::jsonb) RETURNING id",
                    (t["event_id"], cid, c["person_id"], c["purpose"], t["system"], _js({"message": "Consent withdrawn. Stop using this data for this purpose."})))
        from . import feed
        feed.open_for_delivery(cur, cur.fetchone()["id"])
    cur.execute("UPDATE mdm.delivery SET status='BLOCKED_REVOKED', updated_at=now() WHERE consent_id=%s AND status IN ('PENDING_CONSENT','RETRYING','DEAD_LETTER')", (cid,))
    _log(cur, cid, "REVOKED", actor, channel, note, {"operator": operator, "departments_told": [t["system"] for t in told]})
    audit.write(cur, actor, "CONSENT_REVOKED", f"consent:{cid}", {"purpose": c["purpose"], "departments_told": [t["system"] for t in told], "note": note})
    _story_sync(cur, c["person_id"])
    return {**_consent(cur, cid), "departments_told": [SYSTEMS.get(t["system"], t["system"]) for t in told]}


def remind(cur, cid: int, actor: str, as_of=None) -> dict:
    from . import notify
    c = _consent(cur, cid, lock=True)
    now = _now(as_of)
    c = _expire_if_due(cur, c, now)
    if c["status"] != "PENDING":
        raise Refused(f"This request is {c['status'].lower()}. No reminder is sent.", 409)
    if parent_match_held(cur, c["person_id"], c.get("event_id")):
        raise Refused("Waiting for an officer to confirm the parent. No reminder is sent.", 409)
    mx = current(cur)["max_reminders"]
    if c["reminders"] >= mx:
        raise Refused(f"Policy allows {mx} reminder(s) and they have been sent. No further prompting.", 409)
    n = c["reminders"] + 1
    cur.execute("UPDATE mdm.consent SET reminders=reminders+1, last_reminder_at=%s WHERE id=%s", (now, cid))
    _log(cur, cid, "REMINDED", actor, note=f"Reminder {n} of {mx}")
    tracking = f"event-{c['event_id']}" if c.get("event_id") else f"consent-{cid}"
    # Bilingual body (Telugu first). A language field can replace this later.
    title = "మీ కోసం అనుమతి గురించి గుర్తు చేయడం / A reminder about an approval waiting for you"
    message = ("ఒక శాఖ ఇంకా మీ అనుమతి కోసం వేచి ఉంది. పౌర పోర్టల్‌లో అనుమతులు తెరవండి. / "
               "A department is still waiting for your approval. Please open Approvals in the citizen portal.")
    if notify.send(cur, c["person_id"], title, message, tracking):
        notify.mark_consent_notified(cur, cid)
    row = _consent(cur, cid)
    row["reminder_n"] = n
    row["reminder_max"] = mx
    row["notify_enabled"] = notify.enabled()
    return row


def sweep(cur, actor: str, as_of=None) -> dict:
    """Expire what has lapsed. as_of lets a demo move the clock forward."""
    now = _now(as_of)
    cur.execute("SELECT * FROM mdm.consent WHERE (status='PENDING' AND respond_by<=%s) OR (status='GRANTED' AND expires_at<=%s) FOR UPDATE", (now, now))
    n = {"no_response": 0, "term_ended": 0}
    for c in cur.fetchall():
        done = _expire_if_due(cur, c, now, actor)
        n["no_response" if done["ended_reason"] == "NO_RESPONSE" else "term_ended"] += 1
    # Also close waiting deliveries left on consents already terminal (back-fill).
    n["deliveries_closed"] = backfill_closed_consent_deliveries(cur)
    if any(v for k, v in n.items() if k != "as_of"):
        audit.write(cur, actor, "CONSENT_SWEEP", "consent", {**n, "as_of": now.isoformat()})
    return {**n, "as_of": now.isoformat()}


def _story_sync(cur, person_id) -> None:
    """The UC4 demo cohort keeps its beneficiary rows in step with consent changes. A no-op for everyone else; never raises."""
    try:
        from . import demo_uc4_story
        demo_uc4_story.sync_for(cur, person_id)
    except Exception:  # noqa: BLE001
        pass


def handover_at_majority(cur, pid: int, actor: str, as_of=None) -> dict:
    """At the adult age a guardian's consent about THIS person ends. They are asked afresh. Nothing is enrolled.

    Only consents about the person themselves (subject null or equal to the principal) are ended.
    A parent's consent about a child (subject is someone else) never ends because the parent is an adult.
    """
    pol = current(cur)
    on = _now(as_of).date() if as_of else None
    age = person_age(cur, pid, on)
    if age is None:
        raise Refused("This person's age is not known", 409)
    if age < pol["adult_age"]:
        raise Refused(f"This person is {age}; the adult age under policy is {pol['adult_age']}", 409)
    cur.execute("SELECT * FROM mdm.consent WHERE person_id=%s AND given_by_person_id IS NOT NULL AND given_by_person_id<>person_id "
                "AND (subject_person_id IS NULL OR subject_person_id=person_id) AND status IN ('GRANTED','PENDING') FOR UPDATE", (pid,))
    ended, asked = [], []
    for c in cur.fetchall():
        cur.execute("UPDATE mdm.consent SET status='ENDED', ended_reason='ATTAINED_MAJORITY' WHERE id=%s", (c["id"],))
        _log(cur, c["id"], "ENDED", actor, note=f"Guardian consent ends at {pol['adult_age']}. The individual is asked for their own.")
        _block_waiting_deliveries(cur, c["id"], "BLOCKED_REVOKED")
        new = request_consent(cur, pid, c["purpose"], actor, c["subject_person_id"], c["event_id"], as_of=as_of)
        ended.append(c["id"])
        asked.append(new["id"])
    ledger(cur, "EVENT", "mdm", actor, None, pid, None, "consent handover at majority", "ANSWERED",
           {"ended": ended, "new_requests": asked, "enrolled": 0, "note": "Notify only. Nothing is enrolled automatically."})
    audit.write(cur, actor, "CONSENT_HANDOVER", f"person:{pid}", {"ended": ended, "new_requests": asked})
    _story_sync(cur, pid)
    return {"person_id": pid, "age": age, "ended": ended, "new_requests": asked, "enrolled": 0}


CONSENT_SORT = {"person_name": "lower(pe.name)", "purpose_name": "c.purpose", "system_name": "c.system", "status": "c.status",
                "expires_at": "COALESCE(c.expires_at, c.respond_by)", "requested_at": "c.requested_at"}


def list_consents(cur, status=None, purpose=None, person_id=None, q=None, limit=50, offset=0, date_from=None, date_to=None, sort=None, direction='desc',
                  system=None) -> dict:
    where, p = ["true"], []
    for col, v in (("c.status", status), ("c.purpose", purpose), ("c.person_id", person_id), ("c.system", system)):
        if v:
            where.append(f"{col}=%s")
            p.append(v)
    if q:
        where.append("(pe.name ILIKE %s OR pe.mdm_id ILIKE %s OR su.name ILIKE %s OR ev.event_key ILIKE %s OR ev.payload->>'child_name' ILIKE %s "
                     "OR ev.payload->>'father_name' ILIKE %s OR ev.payload->>'mother_name' ILIKE %s OR ev.payload->>'registration_no' ILIKE %s)")
        p += [f"%{q}%"] * 8
    date_range(where, p, "c.requested_at", date_from, date_to)
    w = " AND ".join(where)
    cur.execute(f"SELECT count(*) AS n FROM mdm.consent c LEFT JOIN mdm.person pe ON pe.id=c.person_id LEFT JOIN mdm.person su ON su.id=c.subject_person_id LEFT JOIN mdm.event ev ON ev.id=c.event_id WHERE {w}", p)
    total = cur.fetchone()["n"]
    cur.execute(f"""SELECT c.*, pe.name AS person_name, pe.mdm_id, coalesce(su.name, ev.payload->>'child_name') AS subject_name, gb.name AS given_by_name,
                           ev.event_type, ev.event_key
                    FROM mdm.consent c LEFT JOIN mdm.person pe ON pe.id=c.person_id LEFT JOIN mdm.person su ON su.id=c.subject_person_id
                    LEFT JOIN mdm.event ev ON ev.id=c.event_id
                    LEFT JOIN mdm.person gb ON gb.id=c.given_by_person_id WHERE {w} ORDER BY {order_by(CONSENT_SORT, sort, direction, 'c.id DESC', 'c.id DESC')} LIMIT %s OFFSET %s""", p + [limit, offset])
    items = cur.fetchall()
    for i in items:
        i["purpose_name"] = PURPOSES.get(i["purpose"], {}).get("name", i["purpose"])
        i["system_name"] = SYSTEMS.get(i["system"], i["system"])
        held = bool(i.get("event_id") and parent_match_held(cur, i["person_id"], i["event_id"]))
        i["parent_held"] = held
        rev = open_parent_review(cur, i.get("event_id")) if held else None
        i["parent_review_id"] = rev["id"] if rev else None
        i["parent_review_reason"] = "PARENT_REVIEW" if rev else None
    cur.execute("SELECT status, count(*) AS n FROM mdm.consent GROUP BY status")
    return {"total": total, "limit": limit, "offset": offset, "items": items, "by_status": {r["status"]: r["n"] for r in cur.fetchall()}}


def consent_detail(cur, cid: int, system: str | None = None) -> dict:
    cur.execute("""SELECT c.*, pe.name AS person_name, pe.mdm_id, su.name AS subject_name, gb.name AS given_by_name
                   FROM mdm.consent c LEFT JOIN mdm.person pe ON pe.id=c.person_id LEFT JOIN mdm.person su ON su.id=c.subject_person_id
                   LEFT JOIN mdm.person gb ON gb.id=c.given_by_person_id WHERE c.id=%s""", (cid,))
    c = cur.fetchone()
    if not c or (system and c.get("system") != system):
        raise Refused("Consent not found", 404)
    c["purpose_name"] = PURPOSES.get(c["purpose"], {}).get("name", c["purpose"])
    c["system_name"] = SYSTEMS.get(c["system"], c["system"])
    held = bool(c.get("event_id") and parent_match_held(cur, c["person_id"], c["event_id"]))
    c["parent_held"] = held
    rev = open_parent_review(cur, c.get("event_id")) if held else None
    c["parent_review_id"] = rev["id"] if rev else None
    c["parent_review_reason"] = "PARENT_REVIEW" if rev else None
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
    from . import notify
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
    if principal:
        tracking = f"event-{event_id}"
        # Bilingual body (Telugu first). A language field can replace this later.
        title = "మీ కోసం అనుమతి వేచి ఉంది / An approval is waiting for you"
        message = ("బిడ్డ రికార్డు గురించి ఒక శాఖ మీ అనుమతిని కోరింది. పౌర పోర్టల్‌లో అనుమతులు తెరవండి. / "
                   "A department has asked for your permission about a child's record. Open Approvals in the citizen portal.")
        # Change 1: no notice while a parent match is held below the automatic threshold.
        if not parent_match_held(cur, principal, event_id):
            notify.send(cur, principal, title, message, tracking)
        other = father_id if principal == mother_id else mother_id
        if other and other != principal and not parent_match_held(cur, other, event_id):
            cur.execute("SELECT 1 FROM mdm.citizen_link WHERE person_id=%s LIMIT 1", (other,))
            if cur.fetchone():
                notify.send(cur, other, title, message, tracking)
    return out


def is_blocked(cur, actor: str) -> bool:
    cur.execute("SELECT 1 FROM mdm.access_block WHERE actor=%s AND lifted_at IS NULL LIMIT 1", (actor,))
    return cur.fetchone() is not None


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
        from . import feed
        feed.open_for_delivery(cur, did)                       # the department now has a notice to answer
        return {"id": did, "status": "DELIVERED", "attempts": n}
    status = "DEAD_LETTER" if n >= mx else "RETRYING"
    cur.execute("UPDATE mdm.delivery SET status=%s, attempts=%s, updated_at=now(), detail = detail || %s::jsonb WHERE id=%s",
                (status, n, _js({"last_error": f"{SYSTEMS.get(d['system'], d['system'])} is not available", "released_by": why}), did))
    if status == "DEAD_LETTER":
        audit.write(cur, actor, "DELIVERY_DEAD_LETTER", f"delivery:{did}", {"system": d["system"], "attempts": n})
    return {"id": did, "status": status, "attempts": n}


def retry_due(cur, actor: str, system: str | None = None) -> dict:
    """Retry waiting deliveries; a department user passes their own department so no other department's delivery is touched."""
    if system:
        cur.execute("SELECT id FROM mdm.delivery WHERE status='RETRYING' AND kind='EVENT' AND system=%s ORDER BY id FOR UPDATE",
                    (system_code(system),))
    else:
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


def list_deliveries(cur, status=None, limit=50, offset=0, system=None) -> dict:
    where, p = ["true"], []
    if status:
        where.append("d.status=%s")
        p.append(status)
    if system:
        where.append("d.system=%s")
        p.append(system)
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
    cur.execute("SELECT id, status, person_id FROM mdm.consent WHERE event_id=%s AND purpose=%s ORDER BY (status='GRANTED') DESC, id DESC LIMIT 1", (pr["event_id"], purpose))
    c = cur.fetchone()                       # a granted consent for this event counts, even if a later request for the same use is still open
    g = {"purpose": purpose, "purpose_name": PURPOSES[purpose]["name"], "consent_id": c and c["id"], "status": c["status"] if c else "NOT_REQUESTED", "who": "the parent"}
    # the department has refused the notice and a person has not yet decided what to do about that: the action cannot be approved over it
    cur.execute("""SELECT r.system, r.reason, rv.id AS review FROM mdm.dept_response r
                   JOIN mdm.proposal rv ON rv.event_id=r.event_id AND rv.kind='REVIEW_DEPARTMENT_REJECTION' AND rv.status='PROPOSED' AND (rv.detail->>'delivery')::bigint=r.ref_id
                   WHERE r.source='DELIVERY' AND r.event_id=%s AND r.purpose=%s AND r.outcome='REJECTED'
                     AND r.revision=(SELECT max(revision) FROM mdm.dept_response x WHERE x.source=r.source AND x.ref_id=r.ref_id) LIMIT 1""", (pr["event_id"], purpose))
    h = cur.fetchone()
    if h:
        g["held"] = f"{SYSTEMS.get(h['system'], h['system'])} rejected the notice for this ({h['reason'] or 'no reason given'}). Decide on the review item first; approving here is unavailable until then."
        g["held_review"] = h["review"]
    return g


def require_gate(cur, pr: dict):
    g = gate_for(cur, pr)
    if g and g.get("held"):
        raise Refused(g["held"], 409)
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


def approvals(cur, system=None, status="PROPOSED", limit=50, offset=0, q=None, uc=None) -> dict:
    pol = current(cur)
    where, p = ["pr.status=%s"], [status]
    if system:
        code = system_code(system)
        where.append("(pr.system_code=%s OR pr.system=%s OR pr.system=%s)")
        p += [code, system, code]
    if uc:
        where.append("pr.uc=%s")
        p.append(uc)
    if q and q.strip():
        where.append("(pr.summary ILIKE %s OR pr.kind ILIKE %s OR coalesce(pe.name,'') ILIKE %s OR coalesce(pe.mdm_id,'') ILIKE %s)")
        p += [f"%{q.strip()}%"] * 4
    w = " AND ".join(where)
    cur.execute(f"SELECT count(*) AS n FROM mdm.proposal pr LEFT JOIN mdm.person pe ON pe.id=pr.person_id WHERE {w}", p)
    total = cur.fetchone()["n"]
    cur.execute(f"""SELECT pr.*, pe.name AS person_name, pe.mdm_id FROM mdm.proposal pr LEFT JOIN mdm.person pe ON pe.id=pr.person_id
                    WHERE {w} ORDER BY pr.id DESC LIMIT %s OFFSET %s""", p + [limit, offset])
    items = cur.fetchall()
    from . import feed
    for i in items:
        i["gate"] = gate_for(cur, i)
        i["needs_rationale"] = needs_reason(pol, i["kind"])
        i["dept"] = feed.proposal_info(cur, i)
    # The tally follows the same department filter, so a department user never sees other departments' counts.
    tally_where, tally_p = "status=%s", [status]
    if system:
        tally_where += " AND (system_code=%s OR system=%s OR system=%s)"
        tally_p += [system_code(system), system, system_code(system)]
    cur.execute(f"SELECT system, count(*) AS n FROM mdm.proposal WHERE {tally_where} GROUP BY system ORDER BY n DESC", tally_p)
    return {"total": total, "items": items, "by_system": cur.fetchall(), "rationale_min_chars": pol["rationale_min_chars"]}


def event_flow(cur, eid: int) -> dict:
    cur.execute("SELECT * FROM mdm.event WHERE id=%s", (eid,))
    ev = cur.fetchone()
    if not ev:
        raise Refused("Event not found", 404)
    cur.execute("SELECT * FROM mdm.proposal WHERE event_id=%s ORDER BY id", (eid,))
    props = cur.fetchall()
    pol = current(cur)
    from . import feed
    for pr in props:
        pr["gate"] = gate_for(cur, pr)
        pr["needs_rationale"] = needs_reason(pol, pr["kind"])
        pr["dept"] = feed.proposal_info(cur, pr)
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
    ev["parents"] = event_parents(cur, ev)
    ev["people"] = event_people(cur, ev)
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
    from . import uc5
    ids, cards = uc5.household_members(cur, pid, recs)          # UC5: the system works out the whole household, not only the ration card
    allrecs = store.records_of(cur, ids)
    flat = [r for rs in allrecs.values() for r in rs]
    how = f"through ration card {', '.join(cards)}" if cards else "for this person only, as no ration card links them to a household"
    tenants = sum(1 for r in flat if r["source"] == "pds_view" and (r["payload"] or {}).get("tenant") == "Y")
    caution = " A ration card can be shared by tenants and owners, so this is a proxy for a household, not proof of one." if tenants else ""
    if q in ("HOUSEHOLD_HAS_BENEFIT", "DUPLICATE_BENEFIT"):
        apps = [r for r in flat if r["source"] == "housing"]
        given = uc5.awarded(apps)
        if q == "DUPLICATE_BENEFIT":
            if given:
                return "ANSWERED", {"answer": "ALREADY_RECEIVING", "message": "This household has already received or been promised housing assistance. Its details, and which department holds it, are not shared." + caution, "source": "Master data"}
            if len(apps) >= 2:
                return "ANSWERED", {"answer": "POSSIBLE_DUPLICATE", "message": "Another application exists for this household. Its details, and which department holds it, are not shared." + caution, "source": "Master data"}
            return "ANSWERED", {"answer": "NONE_FOUND", "message": f"No second application was found {how}.", "source": "Master data"}
        mine = any(r["person_id"] == pid for r in apps)
        return "ANSWERED", {"answer": "YES" if apps else "NO", "quality": "DIRECT" if mine else ("HOUSEHOLD" if apps else None),
                            "already_received": bool(given),
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
    if q == "HOUSEHOLD_INCOME_AT_MOST":
        from . import uc5
        return uc5.evaluate_household_income(cur, pid, params, pol)
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
    if question == "HOUSEHOLD_INCOME_AT_MOST" and purpose != "HOUSEHOLD_BENEFIT":
        # a household answer draws on other members' certificates, which only a household consent covers
        return finish("DENIED_POLICY", {"message": "Policy: a household income answer is only given for a household housing check."})
    if is_blocked(cur, actor):
        return finish("DENIED_POLICY", {"message": "This user's access is stopped pending review. Nothing was looked up.", "alert": "BLOCKED"})
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
    cur.execute("SELECT 1 FROM mdm.source_record WHERE person_id=%s AND source='identity_reference' LIMIT 1", (pid,))
    ans["identity_basis"] = "Identity reference" if (reference_token or cur.fetchone()) else "Matched on name, date of birth and address: lower assurance"
    res = finish(outcome, ans, pid, cid)
    if purpose == "SCHOLARSHIP_ELIGIBILITY":
        _uc4_follow_up(cur, pid, outcome, question, params, actor)
    elif purpose == "HOUSEHOLD_BENEFIT":
        from . import uc5
        uc5.follow_up(cur, pid, outcome, question, ans, actor)
    return res


def _uc4_follow_up(cur, pid: int, outcome: str, question: str, params: dict, actor: str) -> None:
    """UC4: a non-answer for the scholarship check becomes one open item for a person; an answer closes what was open.
    The answer returned to the asking department is not changed. Nothing here edits a certificate."""
    from . import uc4
    if outcome == "ANSWERED":
        if question in ("INCOME_AT_MOST", "CATEGORY_IS"):          # only the certificate questions can clear a certificate item
            uc4.close_non_answer(cur, pid, None, actor, question)
        return
    if outcome in ("EXPIRED_SOURCE", "CONFLICT"):
        uc4.raise_non_answer(cur, pid, outcome, {"question": question}, actor)
    elif outcome == "NO_RECORD":
        cur.execute("SELECT district FROM mdm.person WHERE id=%s", (pid,))
        r = cur.fetchone()
        other = bool(params.get("other_state")) or str((r or {}).get("district") or "").startswith("Other State")
        if other:
            uc4.raise_non_answer(cur, pid, outcome, {"question": question, "other_state": True}, actor)


def person_exchange_summary(cur, pid: int) -> dict:
    cur.execute("SELECT id, purpose, status, system, expires_at, responded_at, channel FROM mdm.consent WHERE person_id=%s OR subject_person_id=%s ORDER BY id DESC LIMIT 50", (pid, pid))
    cons = cur.fetchall()
    for c in cons:
        c["purpose_name"] = PURPOSES.get(c["purpose"], {}).get("name", c["purpose"])
        c["system_name"] = SYSTEMS.get(c["system"], c["system"])
    ident = identity_of(cur, pid)                   # runs its own query, so it must come before the one whose rows are fetched below
    cur.execute("SELECT id, ts, kind, requester, purpose, question, outcome FROM mdm.exchange WHERE person_id=%s ORDER BY id DESC LIMIT 25", (pid,))
    return {"identity": ident, "consents": cons, "exchanges": cur.fetchall()}


# who an event is about: the matched master person, else the name carried in the event itself
CITIZEN_SQL = """coalesce(pp.name, nullif(e.payload->>'child_name',''), nullif(e.payload->>'name',''),
                 CASE WHEN e.payload ? 'bride_name' THEN concat_ws(' & ', nullif(e.payload->>'bride_name',''), nullif(e.payload->>'groom_name','')) END)"""
def _original(cur, e: dict):
    """A repeat delivery (DUPLICATE) carries no person of its own: it is about whoever the first delivery of the same registration was matched to."""
    cur.execute("SELECT id, person_id, payload FROM mdm.event x WHERE x.event_key=%s AND x.event_type=%s AND x.id<%s ORDER BY (x.person_id IS NULL), x.id LIMIT 1",
                (e["event_key"], e["event_type"], e["id"]))
    return cur.fetchone()


PARENT_STATE = {"LINKED": "linked", "AWAITING": "matched, awaiting an officer's approval", "DECLINED": "matched, not approved", "NOT_MATCHED": "not matched"}


def event_parents(cur, e: dict) -> list:
    """For a birth: the mother and the father as registered, each with the known person they were matched to (if any) and where that stands.
    LINKED: a person approved it and master data records the parent. AWAITING: matched, and the proposal is waiting for a person.
    DECLINED: matched, but the proposal was rejected. NOT_MATCHED: no known person was found, so only the registered name is shown."""
    if not str(e.get("event_type") or "").startswith("BIRTH"):
        return []
    cur.execute("SELECT id, person_id, payload FROM mdm.event WHERE event_key=%s AND event_type='BIRTH_REGISTERED' ORDER BY id LIMIT 1", (e["event_key"],))
    reg = cur.fetchone() or e
    pl = (reg.get("payload") or e.get("payload") or {})
    child = reg.get("person_id") or e.get("person_id")
    if not (pl.get("father_name") or pl.get("mother_name")):
        return []
    cur.execute("SELECT status, detail FROM mdm.proposal WHERE event_id=%s AND detail ? 'parents' ORDER BY id", (reg["id"],))
    props = cur.fetchall()
    out = []
    for role, key in (("Mother", "mother"), ("Father", "father")):
        nm = pl.get(f"{key}_name")
        if not nm:
            continue
        pid, st = None, []
        for pr in props:
            f = (pr["detail"].get("parents") or {}).get(key) or {}
            if f.get("person_id") and not pid:
                pid = f["person_id"]
            if f.get("person_id") == pid:
                st.append(pr["status"])
        linked = False
        if pid and child:
            cur.execute("SELECT 1 FROM mdm.relationship WHERE kind='PARENT_OF' AND person_a=%s AND person_b=%s", (pid, child))
            linked = bool(cur.fetchone())
        mdm = None
        if pid:
            cur.execute("SELECT mdm_id FROM mdm.person WHERE id=%s", (pid,))
            r = cur.fetchone()
            mdm = r and r["mdm_id"]
            pid = pid if r else None
        state = ("LINKED" if linked else "AWAITING" if "PROPOSED" in st else "DECLINED" if st else "NOT_MATCHED") if pid else "NOT_MATCHED"
        why = None if pid else "No single known person matches this name; the review task lists the possible people"
        out.append({"role": role, "name": nm, "person_id": pid, "mdm_id": mdm, "state": state, "state_text": PARENT_STATE[state], "why": why})
    return out


def event_people(cur, e: dict, _depth=0) -> list:
    """The citizens an event is about, each with the master person it was matched to (when it was): one for most events,
    bride and groom separately for a marriage. A person is linked only when the data says who it is: the event's own match, the
    first delivery of the same registration, the couple recorded for the marriage, or an exact name-and-date match on the marriage register."""
    pl = e.get("payload") or {}
    if "bride_name" not in pl and "groom_name" not in pl:
        pid, mdm = e["person_id"], e.get("person_mdm_id")
        if not pid and e.get("citizen"):
            o = _original(cur, e)
            for ev_id, direct in ((e["id"], None), (o and o["id"], o and o["person_id"])):
                if direct:
                    pid = direct
                elif ev_id:                                                         # no person on the event: the one its proposals are about
                    cur.execute("SELECT person_id FROM mdm.proposal WHERE event_id=%s AND person_id IS NOT NULL ORDER BY id LIMIT 1", (ev_id,))
                    r = cur.fetchone()
                    pid = r and r["person_id"]
                if pid:
                    break
            if pid:
                cur.execute("SELECT id, mdm_id FROM mdm.person WHERE id=%s", (pid,))
                r = cur.fetchone()
                pid, mdm = (r["id"], r["mdm_id"]) if r else (None, None)
        return [{"role": None, "name": e["citizen"], "person_id": pid, "mdm_id": mdm}] if e.get("citizen") else []
    ids = {"Bride": None, "Groom": None}
    suggested = set()                                                             # parties linked only by a suggestion a person has yet to confirm
    for reg in {pl.get("registration_no"), e.get("event_key")} - {None}:
        cur.execute("SELECT rtype, person_id FROM mdm.source_record WHERE source='marriage_register' AND source_rid IN (%s, %s)", (reg, f"{reg}:bride"))
        for r in cur.fetchall():
            role = "Bride" if r["rtype"] == "MARRIAGE_BRIDE" else "Groom"
            ids[role] = ids[role] or r["person_id"]
    if not all(ids.values()):
        cur.execute("SELECT detail FROM mdm.proposal WHERE event_id=%s AND detail ? 'suggested' ORDER BY id LIMIT 1", (e["id"],))
        r = cur.fetchone()
        sg = (r or {}).get("detail", {}).get("suggested") or {}
        for role, key in (("Bride", "bride"), ("Groom", "groom")):
            if not ids[role] and sg.get(key):
                ids[role] = sg[key]
                suggested.add(role)
    for role, key in (("Bride", "bride_person"), ("Groom", "groom_person")):
        v = pl.get(key)
        if not ids[role] and isinstance(v, int):
            ids[role] = v
    if not all(ids.values()) and _depth == 0:                                    # a repeat delivery: take the answer from the first one
        o = _original(cur, e)
        if o:
            for q in event_people(cur, {**e, "id": o["id"], "payload": o["payload"] or pl}, 1):
                if q["person_id"] and not ids[q["role"]]:
                    ids[q["role"]] = q["person_id"]
    md = pl.get("marriage_date")
    for role, nm, rtype in (("Bride", pl.get("bride_name"), "MARRIAGE_BRIDE"), ("Groom", pl.get("groom_name"), "MARRIAGE_GROOM")):
        if nm and md and not ids[role]:                                           # exactly one register entry with this name, role and date
            cur.execute("SELECT person_id FROM mdm.source_record WHERE source='marriage_register' AND rtype=%s AND name=%s AND payload->>'marriage_date'=%s", (rtype, nm, str(md)))
            rows = cur.fetchall()
            if len(rows) == 1:
                ids[role] = rows[0]["person_id"]
    found = {}
    want = [i for i in ids.values() if i]
    if want:
        cur.execute("SELECT id, mdm_id FROM mdm.person WHERE id = ANY(%s)", (want,))
        found = {r["id"]: r["mdm_id"] for r in cur.fetchall()}
    cur.execute("SELECT status, options FROM mdm.proposal WHERE event_id=%s AND kind='CONFIRM_MARRIAGE' ORDER BY id LIMIT 1", (e["id"],))
    cm = cur.fetchone()
    out = []
    for role, nm in (("Bride", pl.get("bride_name")), ("Groom", pl.get("groom_name"))):
        if nm:
            pid = ids[role] if ids[role] in found else None
            state = "NOT_MATCHED" if not pid else ("AWAITING" if role in suggested and cm and cm["status"] == "PROPOSED" else "LINKED")
            why = None
            if not pid:
                n = len(((cm or {}).get("options") or {}).get(role.lower(), [])) if cm and isinstance(cm.get("options"), dict) else 0
                why = (f"{n} possible {'person' if n == 1 else 'people'} with this name; a person has to choose" if n
                       else "No known person in master data matches this name, date and district")
            out.append({"role": role, "name": nm, "person_id": pid, "mdm_id": found.get(pid), "state": state, "why": why})
    return out


EVENT_SORT = {"citizen": "citizen", "received_at": "e.received_at", "event": "e.event_type", "event_type": "e.event_type", "uc": "e.uc", "event_key": "e.event_key", "status": "e.status",
              "depts": "delivered", "open_proposals": "open_proposals", "scenario": "e.scenario"}
EVENT_ORDER = lambda sort, direction: order_by(EVENT_SORT, sort, direction, "e.id DESC", "e.id DESC")


def event_stream(cur, uc=None, status=None, limit=50, offset=0, q=None, date_from=None, date_to=None, sort=None, direction='desc') -> dict:
    """The event feed with what happened for each subscribing department, one line per event."""
    where, p = ["true"], []
    for col, v in (("e.uc", uc), ("e.status", status)):
        if v:
            where.append(f"{col}=%s")
            p.append(v)
    if q and q.strip():
        where.append(f"(e.event_key ILIKE %s OR e.event_type ILIKE %s OR coalesce(e.note,'') ILIKE %s OR e.payload::text ILIKE %s OR coalesce({CITIZEN_SQL},'') ILIKE %s OR coalesce(e.scenario,'') ILIKE %s)")
        p += [f"%{q.strip()}%"] * 6
    date_range(where, p, "e.received_at", date_from, date_to)      # the whole of the first and last day
    w = " AND ".join(where)
    cur.execute(f"SELECT count(*) AS n FROM mdm.event e LEFT JOIN mdm.person pp ON pp.id=e.person_id WHERE {w}", p)
    total = cur.fetchone()["n"]
    cur.execute("SELECT status, count(*) AS n FROM mdm.event GROUP BY status")
    by_status = {r["status"]: r["n"] for r in cur.fetchall()}
    cur.execute(f"""SELECT e.id, e.event_key, e.event_type, e.uc, e.scenario, e.status, e.note, e.payload, e.received_at, e.person_id,
                      {CITIZEN_SQL} AS citizen, pp.mdm_id AS person_mdm_id,
                      (SELECT count(*) FROM mdm.delivery d WHERE d.event_id=e.id AND d.kind='EVENT' AND d.status='DELIVERED') AS delivered,
                      (SELECT count(*) FROM mdm.delivery d WHERE d.event_id=e.id AND d.kind='EVENT' AND d.status='PENDING_CONSENT') AS waiting,
                      (SELECT count(*) FROM mdm.delivery d WHERE d.event_id=e.id AND d.kind='EVENT' AND d.status LIKE 'BLOCKED%%') AS blocked,
                      (SELECT count(*) FROM mdm.proposal x WHERE x.event_id=e.id AND x.status='PROPOSED') AS open_proposals
                    FROM mdm.event e LEFT JOIN mdm.person pp ON pp.id=e.person_id WHERE {w} ORDER BY {EVENT_ORDER(sort, direction)} LIMIT %s OFFSET %s""", p + [limit, offset])
    items = cur.fetchall()
    from .demo_catalogue import title_of
    for e in items:
        e["people"] = event_people(cur, e)
        e["scenario_title"] = title_of(e["scenario"]) if e.get("scenario") else None
    return {"total": total, "limit": limit, "offset": offset, "items": items, "by_status": by_status}
