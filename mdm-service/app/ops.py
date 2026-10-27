"""Operations: discrepancies and declarations, query builder, catalogue and registry, data standards, retention and purge,
audit explorer, household view, control-tower summary and load-test evidence."""
from __future__ import annotations
import json
from datetime import date, datetime, timedelta, timezone

from rapidfuzz import fuzz

from . import audit, exchange, store
from .exchange import PURPOSES, SYSTEMS, REF_DATE, current, ledger, _js, _band, _band_label, _certs, household_ids
from .matching import addr_norm
from .names import name_key, skeleton, tokens, has_telugu, telugu_to_latin
from .sources import SOURCE_INFO
from .stewardship import Refused

# which department system owns each source feed
SOURCE_SYSTEM = {"crs": "crs", "pds_view": "pds", "pension_batch": "pension", "revenue_certificates": "revenue", "revenue_land": "revenue",
                 "electricity": "electricity", "student_portal": "education", "housing": "housing", "marriage_register": "marriage_register",
                 "identity_reference": "identity"}

# where a wrong value must be corrected: the department that owns it, never the master record
ATTR_AUTH = {"name": "crs", "date_of_birth": "crs", "gender": "crs", "life_status": "crs", "address": "pds", "ration_card": "pds",
             "income": "revenue", "category": "revenue", "land": "revenue", "marital_status": "marriage_register",
             "electricity": "electricity", "pension": "pension", "scholarship": "education", "housing": "housing"}

ELEMENTS = {
    "age": ("Age", "crs", "LOW"), "residence": ("District of residence", "pds", "LOW"), "life_status": ("Death registered", "crs", "MEDIUM"),
    "income_band": ("Income band", "revenue", "HIGH"), "category": ("Social category", "revenue", "HIGH"),
    "household_benefit": ("Housing application in household", "housing", "MEDIUM"), "marital_status": ("Marriage recorded", "marriage_register", "MEDIUM"),
    "electricity_link": ("Electricity connection linked", "electricity", "LOW"), "land_holding": ("Land held", "revenue", "HIGH"),
    "duplicate_benefit": ("Duplicate application flag", "housing", "MEDIUM"),
}
QUERYABLE = ["age", "residence", "income_band", "category", "life_status", "household_benefit", "marital_status", "electricity_link", "land_holding"]


# ------------------------------------------------------------------ data standards
STANDARDS = [
    {"id": "S1", "element": "Name", "standard": "Compared by a phonetic skeleton of each word, in any order; Telugu is transliterated first.", "example": "Venkata Ramana Reddy = Reddy V. Ramana"},
    {"id": "S2", "element": "Address", "standard": "House number separated; common abbreviations expanded; filler words dropped; compared by text similarity.", "example": "H.No 4-12, Gandhi Ngr Col. = 4 gandhi nagar colony"},
    {"id": "S3", "element": "Date of birth", "standard": "ISO 8601 (YYYY-MM-DD). Where only an age or a year is reported, the year is approximate and is never shown as a date.", "example": "1984-03-09"},
    {"id": "S4", "element": "Gender", "standard": "M, F or unknown.", "example": "F"},
    {"id": "S5", "element": "Income", "standard": "Annual rupees. Only a band is shared, edges come from policy.", "example": "1 lakh to 2 lakh"},
    {"id": "S6", "element": "Identity reference", "standard": "Opaque token only. No identity number is held in this system.", "example": "TGREF-000123"},
    {"id": "S7", "element": "Dates in answers", "standard": "Evaluated against the reference date of the demonstration.", "example": REF_DATE.isoformat()},
]


def standards() -> dict:
    return {"standards": STANDARDS, "reference_date": REF_DATE.isoformat()}


def normalise(kind: str, text: str, other: str | None = None) -> dict:
    text = (text or "").strip()
    if not text:
        raise Refused("Type something to test")
    if kind == "address":
        house, rest = addr_norm(text)
        out = {"kind": kind, "input": text, "house_number": house or None, "normalised": rest, "steps": ["Abbreviations expanded", "Filler words removed", "House number separated"]}
        if other:
            h2, r2 = addr_norm(other)
            t = fuzz.token_set_ratio(rest, r2) / 100
            out["compared_with"] = {"input": other, "house_number": h2 or None, "normalised": r2, "text_similarity": round(t, 2),
                                    "house_match": (h2 == house) if house and h2 else None,
                                    "verdict": "Likely the same place" if t >= 0.85 and (not house or not h2 or house == h2) else "Different or uncertain"}
        return out
    if kind == "name":
        translit = telugu_to_latin(text) if has_telugu(text) else None
        toks = tokens(translit or text)
        out = {"kind": kind, "input": text, "transliterated": translit, "words": toks, "skeletons": [skeleton(t) for t in toks], "key": name_key(translit or text),
               "steps": ["Telugu transliterated" if translit else "Latin script", "Initials and titles handled", "Phonetic skeleton per word, order ignored"]}
        if other:
            k2 = name_key(telugu_to_latin(other) if has_telugu(other) else other)
            out["compared_with"] = {"input": other, "key": k2, "similarity": round(fuzz.ratio(out["key"], k2) / 100, 2), "same_key": out["key"] == k2}
        return out
    raise Refused("kind must be address or name")


# ------------------------------------------------------------------ catalogue and registry
def catalogue(cur) -> dict:
    cur.execute("SELECT source, count(*) AS n, max(as_of) AS latest FROM mdm.source_record GROUP BY 1")
    stats = {r["source"]: r for r in cur.fetchall()}
    sources = []
    for src, (nm, iface, fresh_h) in SOURCE_INFO.items():
        s = stats.get(src, {})
        sys_ = SOURCE_SYSTEM.get(src)
        subs = sorted({k for k, v in PURPOSES.items() if v["system"] == sys_})
        sources.append({"source": src, "name": nm, "interface": iface, "freshness_hours": fresh_h, "records": s.get("n", 0), "latest_as_of": s.get("latest"),
                        "system": sys_, "owner": SYSTEMS.get(sys_, sys_), "purposes": subs})
    els = [{"element": k, "name": v[0], "authoritative": SYSTEMS.get(v[1], v[1]), "sensitivity": v[2], "queryable": k in QUERYABLE,
            "purposes": sorted(p for p, pu in PURPOSES.items() if k in pu["elements"])} for k, v in ELEMENTS.items()]
    return {"elements": els, "sources": sources, "attribute_owners": {k: SYSTEMS.get(v, v) for k, v in ATTR_AUTH.items()}}


def registry(cur) -> dict:
    """Which department holds what, who may ask, and how fresh it is."""
    cat = catalogue(cur)
    rows = []
    for k, pu in PURPOSES.items():
        cur.execute("SELECT status, count(*) AS n FROM mdm.consent WHERE purpose=%s GROUP BY 1", (k,))
        rows.append({"purpose": k, "name": pu["name"], "use_case": pu["uc"], "requester": SYSTEMS[pu["system"]], "consent_required": pu["consent"],
                     "elements": pu["elements"], "consents": {r["status"]: r["n"] for r in cur.fetchall()}})
    return {"purposes": rows, "sources": cat["sources"]}


# ------------------------------------------------------------------ discrepancies and declarations
def _person(cur, pid):
    cur.execute("SELECT id, mdm_id, name FROM mdm.person WHERE id=%s", (pid,))
    p = cur.fetchone()
    if not p:
        raise Refused("Person not found", 404)
    return p


def raise_discrepancy(cur, person_id: int, attribute: str, current_value: str | None, reported_value: str, reason: str | None, actor: str,
                      channel: str = "OFFICER", operator: str | None = None, authoritative_system: str | None = None) -> dict:
    _person(cur, person_id)
    attribute = (attribute or "").strip().lower()
    if not attribute or not (reported_value or "").strip():
        raise Refused("Say which value is wrong and what it should be")
    if (channel or "").upper() == "ASSISTED" and not (operator or "").strip():
        raise Refused("An assisted report must name the operator")
    auth = authoritative_system or ATTR_AUTH.get(attribute)
    if auth not in SYSTEMS:
        raise Refused("Choose the department that owns this value")
    cur.execute("INSERT INTO mdm.discrepancy (kind, person_id, attribute, current_value, reported_value, reason, authoritative_system, raised_by, channel, operator) "
                "VALUES ('DISCREPANCY',%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                (person_id, attribute, current_value, reported_value.strip(), reason, auth, actor, channel, operator))
    row = cur.fetchone()
    audit.write(cur, actor, "DISCREPANCY_RAISED", f"discrepancy:{row['id']}", {"person": person_id, "attribute": attribute, "routed_to": auth})
    ledger(cur, "EVENT", "mdm", actor, None, person_id, None, f"discrepancy routed to {SYSTEMS[auth]}", "ANSWERED", {"attribute": attribute})
    return {**row, "routed_to_name": SYSTEMS[auth], "note": f"Sent to {SYSTEMS[auth]}. The master record is not changed here; it updates when the department corrects its own record."}


def declare_marriage(cur, person_id: int, spouse_name: str, actor: str, channel: str = "PORTAL", operator: str | None = None, note: str | None = None) -> dict:
    """A citizen says they are married but no register entry exists. Recorded as a declaration; never as a verified marriage."""
    _person(cur, person_id)
    if (channel or "").upper() == "ASSISTED" and not (operator or "").strip():
        raise Refused("An assisted declaration must name the operator")
    cur.execute("SELECT 1 FROM mdm.source_record WHERE person_id=%s AND source='marriage_register' LIMIT 1", (person_id,))
    if cur.fetchone():
        raise Refused("A marriage is already recorded for this person, so no declaration is needed", 409)
    cur.execute("INSERT INTO mdm.discrepancy (kind, person_id, attribute, current_value, reported_value, reason, authoritative_system, status, raised_by, channel, operator) "
                "VALUES ('DECLARATION',%s,'marital_status','No marriage recorded',%s,%s,'marriage_register','DECLARED',%s,%s,%s) RETURNING *",
                (person_id, f"Married to {spouse_name}", note, actor, channel, operator))
    row = cur.fetchone()
    audit.write(cur, actor, "DECLARATION_RECORDED", f"discrepancy:{row['id']}", {"person": person_id, "attribute": "marital_status"})
    return {**row, "note": "Recorded as the citizen's own declaration. It is shown as unverified and is not a marriage record."}


def list_discrepancies(cur, status=None, kind=None, person_id=None, limit=50, offset=0) -> dict:
    where, p = ["true"], []
    for col, v in (("d.status", status), ("d.kind", kind), ("d.person_id", person_id)):
        if v:
            where.append(f"{col}=%s")
            p.append(v)
    w = " AND ".join(where)
    cur.execute(f"SELECT count(*) AS n FROM mdm.discrepancy d WHERE {w}", p)
    total = cur.fetchone()["n"]
    cur.execute(f"SELECT d.*, pe.name AS person_name, pe.mdm_id FROM mdm.discrepancy d LEFT JOIN mdm.person pe ON pe.id=d.person_id WHERE {w} ORDER BY d.id DESC LIMIT %s OFFSET %s", p + [limit, offset])
    items = cur.fetchall()
    for i in items:
        i["authoritative_name"] = SYSTEMS.get(i["authoritative_system"], i["authoritative_system"])
        i["age_days"] = (datetime.now(timezone.utc) - i["raised_at"]).days
    cur.execute("SELECT status, count(*) AS n FROM mdm.discrepancy GROUP BY 1")
    return {"total": total, "limit": limit, "offset": offset, "items": items, "by_status": {r["status"]: r["n"] for r in cur.fetchall()}}


def resolve_discrepancy(cur, did: int, outcome: str, actor: str, note: str | None) -> dict:
    cur.execute("SELECT * FROM mdm.discrepancy WHERE id=%s FOR UPDATE", (did,))
    d = cur.fetchone()
    if not d:
        raise Refused("Not found", 404)
    if d["kind"] != "DISCREPANCY" or d["status"] != "ROUTED":
        raise Refused("This item is already closed or is not a discrepancy", 409)
    outcome = (outcome or "").upper()
    if outcome not in ("CORRECTED_AT_SOURCE", "CONFIRMED_AS_IS", "REJECTED"):
        raise Refused("outcome must be CORRECTED_AT_SOURCE, CONFIRMED_AS_IS or REJECTED")
    if len((note or "").strip()) < current(cur)["rationale_min_chars"]:
        raise Refused("Say what the department decided (a short note is required)")
    informed = []
    if outcome == "CORRECTED_AT_SOURCE" and d["person_id"]:
        recs = store.records_of(cur, [d["person_id"]]).get(d["person_id"], [])
        systems = sorted({SOURCE_SYSTEM[r["source"]] for r in recs if r["source"] in SOURCE_SYSTEM} - {d["authoritative_system"], "identity"})
        for s in systems:
            ledger(cur, "EVENT", "mdm", actor, None, d["person_id"], None, f"correction notice to {SYSTEMS.get(s, s)}", "ANSWERED",
                   {"attribute": d["attribute"], "source_of_truth": d["authoritative_system"]})
            informed.append(s)
    cur.execute("UPDATE mdm.discrepancy SET status=%s, resolved_by=%s, resolved_at=now(), resolution_note=%s, informed=%s::jsonb WHERE id=%s RETURNING *",
                (outcome, actor, note, _js(informed), did))
    row = cur.fetchone()
    audit.write(cur, actor, f"DISCREPANCY_{outcome}", f"discrepancy:{did}", {"informed": informed, "note": note})
    return {**row, "informed_names": [SYSTEMS.get(s, s) for s in informed],
            "note": "The master record was not edited here. It shows the corrected value after the next refresh from the source." if outcome == "CORRECTED_AT_SOURCE" else ""}


# ------------------------------------------------------------------ query builder
def _element_value(el: str, pid: int, person: dict, recs: list[dict], pol: dict, hh_cards: dict):
    if el == "age":
        by = person.get("dob").year if person.get("dob") else person.get("birth_year")
        if not by:
            return "No record"
        a = REF_DATE.year - by
        lo = (a // 10) * 10
        return f"{lo} to {lo + 9}"
    if el == "residence":
        return person.get("district") or "No record"
    if el == "life_status":
        return "Death registered" if person.get("life_status") == "DECEASED" else "No death record"
    if el == "income_band":
        valid, expired = _certs(recs, "INCOME")
        vals = [float(p["annual_income"]) for p in valid if p.get("annual_income") not in (None, "")]
        if not vals:
            return "Expired" if expired else "No record"
        bands = {_band(pol["income_band_edges"], v) for v in vals}
        return _band_label(pol["income_band_edges"], next(iter(bands))) if len(bands) == 1 else "Conflicting"
    if el == "category":
        valid, expired = _certs(recs, "CASTE")
        cats = {(p.get("category") or "").upper() for p in valid if p.get("category")}
        return next(iter(cats)) if len(cats) == 1 else ("Conflicting" if cats else ("Expired" if expired else "No record"))
    if el == "household_benefit":
        return "Yes" if any(r["source"] == "housing" for r in recs) else "None found"
    if el == "marital_status":
        return "Marriage recorded" if any(r["rtype"] in ("MARRIAGE_GROOM", "MARRIAGE_BRIDE") for r in recs) else "No record"
    if el == "electricity_link":
        return "Yes" if any(r["source"] == "electricity" for r in recs) else "None found"
    if el == "land_holding":
        return "Yes" if any(r["source"] == "revenue_land" for r in recs) else "None found"
    return "—"


def run_query(cur, requester: str, purpose: str, elements: list[str], filters: dict, actor: str) -> dict:
    pol = current(cur)
    pu = PURPOSES.get(purpose)
    if not pu:
        raise Refused("Unknown purpose")
    if requester != pu["system"]:
        out = ledger(cur, "QUERY", requester, actor, purpose, None, None, "population query", "DENIED_POLICY", {"reason": "requester not allowed for this purpose"})
        return {"outcome": "DENIED_POLICY", "message": f"Policy: only {SYSTEMS[pu['system']]} may use '{pu['name']}'.", "ledger_id": out}
    bad = [e for e in elements if e not in QUERYABLE or e not in pu["elements"]]
    if not elements or bad:
        raise Refused("Choose elements this purpose allows: " + ", ".join(e for e in QUERYABLE if e in pu["elements"]))
    where, p = ["true"], []
    f = filters or {}
    if f.get("district"):
        where.append("district ILIKE %s")
        p.append(f["district"])
    if f.get("life_status") in ("DECEASED", "NO_DEATH_RECORD"):
        where.append("life_status=%s")
        p.append(f["life_status"])
    age_sql = "(%s - COALESCE(EXTRACT(YEAR FROM dob)::int, birth_year))"
    if f.get("min_age") not in (None, ""):
        where.append(f"{age_sql} >= %s")
        p += [REF_DATE.year, int(f["min_age"])]
    if f.get("max_age") not in (None, ""):
        where.append(f"{age_sql} <= %s")
        p += [REF_DATE.year, int(f["max_age"])]
    cur.execute(f"SELECT count(*) AS n FROM mdm.person WHERE {' AND '.join(where)}", p)
    n = cur.fetchone()["n"]
    desc = {"purpose": purpose, "elements": elements, "filters": f}
    if n > pol["query_max_population"]:
        lid = ledger(cur, "QUERY", requester, actor, purpose, None, None, "population query", "DENIED_POLICY", {**desc, "matched": n, "limit": pol["query_max_population"]})
        return {"outcome": "DENIED_POLICY", "matched": n, "limit": pol["query_max_population"], "ledger_id": lid,
                "message": f"Too broad: {n} people match and policy allows at most {pol['query_max_population']} in one query. Narrow it by district or age."}
    cur.execute(f"SELECT id, mdm_id, dob, birth_year, district, life_status FROM mdm.person WHERE {' AND '.join(where)} ORDER BY id", p)
    people = cur.fetchall()
    recs = store.records_of(cur, [x["id"] for x in people]) if people else {}
    rows, withheld = [], 0
    for x in people:
        if pu["consent"]:
            c = exchange.active_consent(cur, x["id"], purpose)
            scope = set(((c or {}).get("scope") or {}).get("elements") or [])
            if not c or c["status"] != "GRANTED" or not set(elements) <= scope:
                withheld += 1
                continue
        rows.append({"mdm_id": x["mdm_id"], **{e: _element_value(e, x["id"], x, recs.get(x["id"], []), pol, {}) for e in elements}, "_pid": x["id"]})
    exp = datetime.now(timezone.utc) + timedelta(minutes=pol["temp_result_minutes"])
    cur.execute("INSERT INTO mdm.temp_result (expires_at, requester, actor, purpose, subjects, rows) VALUES (%s,%s,%s,%s,%s,%s::jsonb) RETURNING id",
                (exp, requester, actor, purpose, [r["_pid"] for r in rows], _js([{k: v for k, v in r.items() if k != "_pid"} for r in rows])))
    tid = cur.fetchone()["id"]
    lid = ledger(cur, "QUERY", requester, actor, purpose, None, None, "population query", "ANSWERED", {**desc, "matched": n, "shared": len(rows), "withheld": withheld, "temp_result": tid})
    return {"outcome": "ANSWERED", "matched": n, "shared": len(rows), "withheld_no_consent": withheld, "elements": elements,
            "rows": [{k: v for k, v in r.items() if k != "_pid"} for r in rows[:200]], "truncated": len(rows) > 200,
            "temp_result_id": tid, "expires_at": exp, "ledger_id": lid,
            "message": (f"{withheld} people matched but have not given consent for these elements, so they are not included." if withheld else "")}


# ------------------------------------------------------------------ retention and purge
def retention_statement(cur) -> dict:
    pol = current(cur)
    q = lambda sql: (cur.execute(sql), cur.fetchone()["n"])[1]
    return {"classes": [
        {"data": "Identity links", "kept": "While the person is active in any source", "count": q("SELECT count(*) AS n FROM mdm.source_record WHERE source='identity_reference'"), "purge": "Never by a withdrawal"},
        {"data": "Consolidated attributes", "kept": "Until the next refresh; flagged stale if older than the source allows", "count": q("SELECT count(*) AS n FROM mdm.golden_attribute"), "purge": "Rebuilt at refresh"},
        {"data": "Verification answers", "kept": "Not stored. A line in the clearing-house log only", "count": q("SELECT count(*) AS n FROM mdm.exchange WHERE kind='VERIFY'"), "purge": "Log line kept as evidence"},
        {"data": "Temporary query results", "kept": f"{pol['temp_result_minutes']} minutes", "count": q("SELECT count(*) AS n FROM mdm.temp_result"), "purge": "Automatic, or on withdrawal"},
        {"data": "Event references", "kept": f"{pol['event_retention_days']} days", "count": q("SELECT count(*) AS n FROM mdm.event"), "purge": "Optional thinning of old payloads"},
        {"data": "Consent records", "kept": f"The grant period plus {pol['consent_evidence_days']} days as evidence", "count": q("SELECT count(*) AS n FROM mdm.consent"), "purge": "After the evidence period"},
        {"data": "Audit log", "kept": "Longest. Never removed by a withdrawal", "count": q("SELECT count(*) AS n FROM mdm.audit"), "purge": "Never"},
    ], "policy": {k: pol[k] for k in ("temp_result_minutes", "event_retention_days", "consent_evidence_days")}}


def purge(cur, actor: str, what: str = "expired_results", thin_events: bool = False) -> dict:
    pol = current(cur)
    before = {"temp_results": _n(cur, "mdm.temp_result"), "event_payloads": _n(cur, "mdm.event")}
    removed = {"temp_results": 0, "event_payloads_thinned": 0}
    if what == "all_results":
        cur.execute("DELETE FROM mdm.temp_result")
    elif what == "expired_results":
        cur.execute("DELETE FROM mdm.temp_result WHERE expires_at <= now()")
    else:
        raise Refused("what must be expired_results or all_results")
    removed["temp_results"] = cur.rowcount
    if thin_events:
        cur.execute("UPDATE mdm.event SET payload = jsonb_build_object('thinned', true, 'event_key', event_key) "
                    "WHERE received_at < now() - make_interval(days => %s) AND NOT (payload ? 'thinned')", (pol["event_retention_days"],))
        removed["event_payloads_thinned"] = cur.rowcount
    seq = audit.write(cur, actor, "PURGE", "retention", {"what": what, "thin_events": thin_events, **removed})
    return {"before": before, "after": {"temp_results": _n(cur, "mdm.temp_result"), "event_payloads": before["event_payloads"]}, "removed": removed, "audit_seq": seq}


def _n(cur, table):
    cur.execute(f"SELECT count(*) AS n FROM {table}")
    return cur.fetchone()["n"]


def withdraw_and_purge(cur, person_id: int, purpose: str, actor: str, channel: str = "PORTAL", operator: str | None = None) -> dict:
    """Withdrawal stops sharing, removes what was held temporarily for that person, tells departments, and keeps the audit trail."""
    p = _person(cur, person_id)
    cur.execute("SELECT id FROM mdm.consent WHERE person_id=%s AND purpose=%s AND status='GRANTED' ORDER BY id DESC LIMIT 1", (person_id, purpose))
    c = cur.fetchone()
    told = []
    if c:
        told = exchange.revoke(cur, c["id"], actor, channel, operator, "Withdrawn with purge").get("departments_told", [])
    removed_rows = 0
    cur.execute("SELECT id, subjects, rows FROM mdm.temp_result WHERE %s = ANY(subjects) FOR UPDATE", (person_id,))
    for t in cur.fetchall():
        keep = [r for r in t["rows"] if r.get("mdm_id") != p["mdm_id"]]
        removed_rows += len(t["rows"]) - len(keep)
        cur.execute("UPDATE mdm.temp_result SET rows=%s::jsonb, subjects=array_remove(subjects,%s) WHERE id=%s", (_js(keep), person_id, t["id"]))
    seq = audit.write(cur, actor, "WITHDRAW_AND_PURGE", f"person:{person_id}", {"purpose": purpose, "temp_rows_removed": removed_rows, "departments_told": told})
    return {"person": p["name"], "mdm_id": p["mdm_id"], "consent_withdrawn": bool(c), "departments_told": told, "temp_rows_removed": removed_rows, "audit_seq": seq,
            "stops": "Sharing for this use, from now on.", "remains": "The identity link, the clearing-house log lines and the audit trail. These are evidence and are not removed by a withdrawal."}


# ------------------------------------------------------------------ audit explorer
def list_audit(cur, actor=None, subject=None, action=None, q=None, limit=50, offset=0) -> dict:
    where, p = ["true"], []
    for col, v in (("actor", actor), ("subject", subject), ("action", action)):
        if v:
            where.append(f"{col} ILIKE %s")
            p.append(f"%{v}%")
    if q:
        where.append("(detail::text ILIKE %s OR subject ILIKE %s OR action ILIKE %s)")
        p += [f"%{q}%"] * 3
    w = " AND ".join(where)
    cur.execute(f"SELECT count(*) AS n FROM mdm.audit WHERE {w}", p)
    total = cur.fetchone()["n"]
    cur.execute(f"SELECT seq, ts, actor, action, subject, detail, left(hash,12) AS hash FROM mdm.audit WHERE {w} ORDER BY seq DESC LIMIT %s OFFSET %s", p + [limit, offset])
    return {"total": total, "limit": limit, "offset": offset, "items": cur.fetchall()}


def tamper_demo(cur, actor: str) -> dict:
    """Edit one old audit row inside a transaction, show that verification catches it, then roll the edit back."""
    cur.execute("SELECT seq FROM mdm.audit ORDER BY seq")
    seqs = [r["seq"] for r in cur.fetchall()]
    if len(seqs) < 3:
        raise Refused("Not enough audit history to demonstrate")
    target = seqs[len(seqs) // 2]
    before = audit.verify(cur)
    cur.execute("SAVEPOINT tamper")
    cur.execute("UPDATE mdm.audit SET detail = detail || '{\"edited\": true}'::jsonb WHERE seq=%s", (target,))
    during = audit.verify(cur)
    cur.execute("ROLLBACK TO SAVEPOINT tamper")
    after = audit.verify(cur)
    audit.write(cur, actor, "TAMPER_DEMO", f"audit:{target}", {"detected": not during["ok"], "restored": after["ok"]})
    return {"edited_seq": target, "before": before, "while_edited": during, "after_rollback": after,
            "message": f"Row {target} was changed for a moment. The chain check failed at row {during.get('broken_at')}. The change was then undone and the chain is intact again."}


# ------------------------------------------------------------------ load-test evidence
def record_loadtest(cur, body: dict, actor: str) -> dict:
    cur.execute("INSERT INTO mdm.loadtest_run (requests, seconds, ok, errors, p50_ms, p95_ms, rps, note, actor) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                (int(body["requests"]), body["seconds"], int(body["ok"]), int(body["errors"]), body.get("p50_ms"), body.get("p95_ms"), body.get("rps"), body.get("note"), actor))
    return cur.fetchone()


def list_loadtests(cur, limit=10) -> list[dict]:
    cur.execute("SELECT * FROM mdm.loadtest_run ORDER BY id DESC LIMIT %s", (limit,))
    return cur.fetchall()


# ------------------------------------------------------------------ household
def household(cur, person_id: int) -> dict:
    p = _person(cur, person_id)
    recs = store.records_of(cur, [person_id]).get(person_id, [])
    ids, cards = household_ids(cur, person_id, recs)
    allrecs = store.records_of(cur, ids)
    cur.execute("SELECT id, mdm_id, name, gender, dob, birth_year, life_status FROM mdm.person WHERE id = ANY(%s) ORDER BY id", (ids,))
    members = []
    for m in cur.fetchall():
        rs = allrecs.get(m["id"], [])
        pds = [r for r in rs if r["source"] == "pds_view"]
        tenant = any((r["payload"] or {}).get("tenant") == "Y" for r in pds)
        members.append({"id": m["id"], "mdm_id": m["mdm_id"], "name": m["name"], "gender": m["gender"], "life_status": m["life_status"],
                        "age": REF_DATE.year - (m["dob"].year if m["dob"] else m["birth_year"]) if (m["dob"] or m["birth_year"]) else None,
                        "relation": next((r["relation"] for r in pds if r["relation"]), None), "tenant": tenant, "is_selected": m["id"] == person_id,
                        "electricity": any(r["source"] == "electricity" for r in rs), "housing": any(r["source"] == "housing" for r in rs),
                        "land": any(r["source"] == "revenue_land" for r in rs)})
    caveats = ["A ration card is a proxy for a household. It is not a legal definition of one."]
    if not cards:
        caveats.append("This person is on no ration card, so no household can be formed.")
    if any(m["tenant"] for m in members):
        caveats.append("At least one card holder is marked as a tenant. Tenants and owners can share a card, so land and electricity may belong to someone outside the family.")
    if any(m["electricity"] for m in members if not m["is_selected"]) and not any(m["electricity"] for m in members if m["is_selected"]):
        caveats.append("Electricity is linked through another member's name: indirect, not direct.")
    caveats.append("Electricity has no household field. A connection in a different name or address cannot be linked.")
    return {"person": {"id": p["id"], "name": p["name"], "mdm_id": p["mdm_id"]}, "cards": cards, "members": members, "caveats": caveats}


# ------------------------------------------------------------------ control tower
def control_tower(cur) -> dict:
    one = lambda sql, *a: (cur.execute(sql, a), cur.fetchone())[1]
    many = lambda sql, *a: (cur.execute(sql, a), cur.fetchall())[1]
    events = one("SELECT count(*) AS n, count(*) FILTER (WHERE received_at > now() - interval '24 hours') AS day FROM mdm.event")
    deliv = {r["status"]: r["n"] for r in many("SELECT status, count(*) AS n FROM mdm.delivery WHERE kind='EVENT' GROUP BY 1")}
    cons = {r["status"]: r["n"] for r in many("SELECT status, count(*) AS n FROM mdm.consent GROUP BY 1")}
    open_by = many("SELECT COALESCE(system,'—') AS system, count(*) AS n, min(created_at) AS oldest FROM mdm.proposal WHERE status='PROPOSED' GROUP BY 1 ORDER BY 2 DESC")
    now = datetime.now(timezone.utc)
    for r in open_by:
        r["oldest_hours"] = int((now - r["oldest"]).total_seconds() // 3600)
    ledger_out = {r["outcome"]: r["n"] for r in many("SELECT outcome, count(*) AS n FROM mdm.exchange GROUP BY 1")}
    elapsed = one("SELECT round(avg(elapsed_ms))::int AS avg_ms, max(elapsed_ms) AS max_ms FROM mdm.exchange WHERE elapsed_ms IS NOT NULL")
    chain = audit.verify(cur)
    return {"events": events, "deliveries": deliv, "dead_letters": deliv.get("DEAD_LETTER", 0), "consents": cons, "open_approvals": open_by,
            "exchanges": ledger_out, "timing": elapsed, "subscribers": exchange.list_subscribers(cur),
            "audit_chain": {"ok": chain["ok"], "checked": chain["checked"], "broken_at": chain.get("broken_at")},
            "open_discrepancies": one("SELECT count(*) AS n FROM mdm.discrepancy WHERE status='ROUTED'")["n"],
            "open_review_tasks": one("SELECT count(*) AS n FROM mdm.review_task WHERE status='OPEN'")["n"],
            "dq_high": one("SELECT count(*) AS n FROM mdm.dq_issue WHERE status='OPEN' AND severity='HIGH'")["n"],
            "misuse_alerts": one("SELECT count(*) AS n FROM mdm.audit WHERE action='MISUSE_ALERT' AND ts > now() - interval '24 hours'")["n"],
            "loadtests": list_loadtests(cur, 5)}
