"""Golden record: choose each attribute from the department records by explicit, visible rules, and keep the alternatives.
Also derives data-quality issues. Pure functions over plain dicts so the same code serves the loader and steward actions."""
from __future__ import annotations
import re
from datetime import date

from .names import has_telugu, name_key

REF_DATE = date(2026, 6, 21)      # the date of the synthetic registry

DEFAULT_SURVIVORSHIP = {
    "name": ["identity_reference", "crs", "revenue_certificates", "pension_batch", "student_portal", "marriage_register",
             "pds_view", "electricity", "revenue_land", "housing", "water_board"],
    "dob": ["crs", "revenue_certificates", "pension_batch", "student_portal", "marriage_register"],
    "gender": ["crs", "identity_reference", "marriage_register", "pds_view"],
    "address": ["pds_view", "revenue_certificates", "electricity", "housing", "pension_batch", "revenue_land", "water_board"],
}
RULE_TEXT = {
    "name": "Latin-script name from the most trusted source (identity reference first)",
    "dob": "Exact date of birth from the most trusted source; conflicts are flagged, never silently resolved",
    "gender": "Most trusted source that states it",
    "address": "Most recently reported address among address-bearing sources",
}
_TITLE = re.compile(r"^(mr|mrs|ms|smt|sri|shri|late|dr)\.?\s+", re.I)


def clean_name(n: str | None) -> str:
    return _TITLE.sub("", (n or "").strip())


def _rank(order: list[str], src: str) -> int:
    return order.index(src) if src in order else len(order)


def _alts(cands):
    seen, out = set(), []
    for v, src in cands:
        if (v, src) not in seen:
            seen.add((v, src))
            out.append({"value": v, "source": src})
    return out


def build_golden(recs: list[dict], surv: dict | None = None) -> dict:
    surv = surv or DEFAULT_SURVIVORSHIP
    attrs, out = [], {}

    # name
    cands = [(clean_name(r["name"]), r["source"]) for r in recs if r.get("name")]
    cands += [(clean_name(r["payload"]["bride_name_after"]), r["source"]) for r in recs
              if r.get("rtype") == "MARRIAGE_BRIDE" and (r.get("payload") or {}).get("bride_name_after")]
    latin = sorted([c for c in cands if not has_telugu(c[0])], key=lambda c: (_rank(surv["name"], c[1]), -len(c[0])))
    tel = sorted([c for c in cands if has_telugu(c[0])], key=lambda c: _rank(surv["name"], c[1]))
    best = latin[0] if latin else (tel[0] if tel else ("", ""))
    out["name"], out["name_local"] = best[0], (tel[0][0] if tel else None)
    distinct = {re.sub(r"[^a-z]", "", c[0].lower()) for c in latin}
    attrs.append(dict(attribute="name", value=best[0], chosen_source=best[1], rule=RULE_TEXT["name"], alternatives=_alts(cands),
                      conflict=len(distinct) > 3))

    # date of birth
    cands = sorted([(r["dob"].isoformat(), r["source"]) for r in recs if r.get("dob")], key=lambda c: _rank(surv["dob"], c[1]))
    years = [r["birth_year"] for r in recs if r.get("birth_year")]
    if cands:
        out["dob"], src = date.fromisoformat(cands[0][0]), cands[0][1]
        out["birth_year"] = out["dob"].year
        attrs.append(dict(attribute="dob", value=cands[0][0], chosen_source=src, rule=RULE_TEXT["dob"], alternatives=_alts(cands),
                          conflict=len({c[0] for c in cands}) > 1))
    else:
        out["dob"], out["birth_year"] = None, (years[0] if years else None)
        if out["birth_year"]:
            attrs.append(dict(attribute="birth_year", value=str(out["birth_year"]), chosen_source="identity_reference",
                              rule="Only a birth year is reported; no exact date of birth is available", alternatives=[], conflict=False))

    # gender
    cands = sorted([(r["gender"], r["source"]) for r in recs if r.get("gender")], key=lambda c: _rank(surv["gender"], c[1]))
    out["gender"] = cands[0][0] if cands else None
    if cands:
        attrs.append(dict(attribute="gender", value=cands[0][0], chosen_source=cands[0][1], rule=RULE_TEXT["gender"],
                          alternatives=_alts(cands), conflict=len({c[0] for c in cands}) > 1))

    # address (most recent)
    addr = [r for r in recs if r["source"] in surv["address"] and (r.get("address") or r.get("village") or r.get("mandal"))]
    addr.sort(key=lambda r: (not r.get("address"), str(r.get("as_of") or "")[:10] == "", _neg(str(r.get("as_of") or "")[:10]), _rank(surv["address"], r["source"])))
    for k in ("district", "mandal", "village", "address"):
        out[k] = None
    if addr:
        a = addr[0]
        for k in ("district", "mandal", "village", "address"):
            out[k] = a.get(k)
        shown = ", ".join(x for x in (a.get("address"), a.get("village"), a.get("mandal"), a.get("district")) if x)
        attrs.append(dict(attribute="address", value=shown, chosen_source=a["source"], rule=RULE_TEXT["address"],
                          alternatives=_alts([(", ".join(x for x in (r.get("address"), r.get("village"), r.get("mandal")) if x), r["source"])
                                              for r in addr]), conflict=False))
    if not out["district"]:
        for r in recs:
            if r.get("district"):
                out["district"] = r["district"]
                break

    died = [r for r in recs if r["source"] == "crs" and r.get("rtype") == "DEATH"]
    out["life_status"] = "DECEASED" if died else "NO_DEATH_RECORD"
    if died:
        p = (died[0].get("payload") or {}).get("payload", {})
        attrs.append(dict(attribute="date_of_death", value=p.get("date_of_death"), chosen_source="crs",
                          rule="Civil registration is the only authority for a death", alternatives=[], conflict=False))
    out["source_count"] = len({r["source"] for r in recs})
    out["record_count"] = len(recs)
    scores = [float(r["score"]) for r in recs if r.get("link_status") == "AUTO_LINKED" and r.get("score") is not None]
    out["confidence"] = round(min(scores), 3) if scores else 1.0
    out["attributes"] = attrs
    return out


def _neg(s: str) -> str:
    """sort key so that later dates come first"""
    return "".join(chr(0x7e - (ord(c) - 0x20)) if 0x20 <= ord(c) <= 0x7e else c for c in s)


def _age(dob: date, on: date) -> int:
    return on.year - dob.year - ((on.month, on.day) < (dob.month, dob.day))


NAME_CONFLICT_SIMILARITY = 70      # rapidfuzz ratio (0-100) of two name keys below which they disagree


def _names_disagree(named: dict[str, set[str]]) -> bool:
    """True when some pair of sources has no pair of name keys that is close (equal, one inside the other, or similar)."""
    from rapidfuzz import fuzz
    srcs = list(named)
    for i, a in enumerate(srcs):
        for b in srcs[i + 1:]:
            close = False
            for ka in named[a]:
                for kb in named[b]:
                    if ka == kb or ka in kb or kb in ka or fuzz.ratio(ka, kb) >= NAME_CONFLICT_SIMILARITY:
                        close = True
                        break
                if close:
                    break
            if not close:
                return True
    return False


def derive_dq(person: dict, recs: list[dict]) -> list[dict]:
    """Issues are facts about the department records, each with the record it concerns (record_id may be None)."""
    out = []

    def add(code, sev, detail, rec=None):
        out.append(dict(code=code, severity=sev, detail=detail, record_id=rec["id"] if rec else None))

    by_src = {}
    for r in recs:
        by_src.setdefault(r["source"], []).append(r)
    dead = [r for r in recs if r["source"] == "crs" and r.get("rtype") == "DEATH"]
    if dead:
        dod = ((dead[0].get("payload") or {}).get("payload") or {}).get("date_of_death")
        for r in by_src.get("pds_view", []):
            if (r.get("payload") or {}).get("member_status") == "ACTIVE":
                add("DEAD_ACTIVE_ON_RATION_CARD", "HIGH", f"Death registered (on {dod}) but the member is still ACTIVE on ration card {r.get('ration_card')}", r)
        for r in by_src.get("pension_batch", []):
            if (r.get("payload") or {}).get("status") == "ACTIVE":
                add("DEAD_PENSION_STILL_ACTIVE", "HIGH", f"Death registered (on {dod}) but the pension is still ACTIVE", r)
    dobs = {r["dob"] for r in recs if r.get("dob")}
    if len(dobs) > 1:
        add("DOB_CONFLICT", "HIGH", "Departments report different dates of birth: " + ", ".join(sorted(d.isoformat() for d in dobs)))
    gs = {r["gender"] for r in recs if r.get("gender")}
    if len(gs) > 1:
        add("GENDER_CONFLICT", "MEDIUM", "Departments report different genders: " + ", ".join(sorted(gs)))
    # NAME_CONFLICT: two different sources spell the name so differently that the phonetic keys are not close.
    # Spelling variants, word order, initials and honorifics share a key (or nearly) and are not a conflict.
    named = {}
    for r in recs:
        if r.get("name") and r.get("rtype") != "MARRIAGE_BRIDE":     # a bride's name may change after marriage
            k = name_key(r["name"])
            if k:
                named.setdefault(r["source"], set()).add(k)
    if len(named) > 1 and _names_disagree(named):
        shown = sorted({clean_name(r["name"]) for r in recs if r.get("name") and r.get("rtype") != "MARRIAGE_BRIDE"})
        add("NAME_CONFLICT", "MEDIUM", "Departments record the name differently: " + ", ".join(shown[:4]))
    for r in by_src.get("revenue_certificates", []):
        p = r.get("payload") or {}
        if p.get("valid_until") and str(p["valid_until"])[:10] < REF_DATE.isoformat():
            add("CERTIFICATE_EXPIRED", "LOW", f"{r['rtype'].title()} certificate {r['source_rid']} expired on {str(p['valid_until'])[:10]}", r)
    inc = [(r, float(r["payload"]["annual_income"])) for r in by_src.get("revenue_certificates", [])
           if r["rtype"] == "INCOME" and (r.get("payload") or {}).get("annual_income") not in (None, "")]
    if len(inc) > 1 and max(v for _, v in inc) > 1.25 * min(v for _, v in inc):
        add("INCOME_CONFLICT", "MEDIUM", "Income certificates disagree: " + ", ".join(f"{int(v):,}" for _, v in inc))
    cats = {(r.get("payload") or {}).get("category") for r in by_src.get("revenue_certificates", []) if r["rtype"] == "CASTE"}
    cats.discard(None)
    if len(cats) > 1:
        add("CATEGORY_CONFLICT", "MEDIUM", "Caste certificates show different categories: " + ", ".join(sorted(cats)))
    if recs and "identity_reference" not in by_src and len(recs) >= 2:
        add("NO_IDENTITY_REFERENCE", "MEDIUM", "Person appears in department systems but has no identity reference token")
    cards = {r["ration_card"] for r in by_src.get("pds_view", []) if r.get("ration_card")}
    if len(cards) > 1:
        add("ON_MULTIPLE_RATION_CARDS", "MEDIUM", "Listed on several ration cards: " + ", ".join(sorted(cards)))
    best = person.get("dob")
    if best:
        for r in by_src.get("pds_view", []):
            if r.get("age") is not None and abs(r["age"] - _age(best, REF_DATE)) >= 2:
                add("AGE_MISMATCH", "LOW", f"Ration card shows age {r['age']}, date of birth gives {_age(best, REF_DATE)}", r)
        for r in by_src.get("marriage_register", []):
            md = (r.get("payload") or {}).get("marriage_date")
            if md:
                try:
                    a = _age(best, date.fromisoformat(md[:10]))
                except ValueError:
                    continue
                limit = 18 if r.get("gender") == "F" else 21
                if a < limit:
                    add("UNDERAGE_MARRIAGE", "HIGH", f"Registered marriage on {md[:10]} at age {a} (minimum {limit})", r)
    return out
