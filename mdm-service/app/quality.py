"""Feed quality with Great Expectations.

Each department feed has a small contract: which fields it is expected to carry and how fully, what its record keys look
like, and which values are valid. Great Expectations (GX Core 1.x) runs that contract against what was loaded from the
feed and the result of every expectation is kept, so it can be shown on a screen and compared from one run to the next.

This is quality at the door: it looks at each feed on its own. The Data quality tab in Master Data looks across feeds
(for example two departments holding different dates of birth for one person); the two are complementary.

Severity: critical = a record key or a value that must not be wrong (stops being trustworthy); advisory = how complete or
current a feed is (worth chasing with the department, but the data is usable).
"""
from __future__ import annotations
import csv
import io
import json
import os
import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone

from . import audit
from .db import connect
from .sources import SOURCE_INFO, SOURCE_ORDER
from .survivorship import REF_DATE

# a closed network: Great Expectations must not try to send usage statistics anywhere
os.environ.setdefault("GX_ANALYTICS_ENABLED", "false")

CRITICAL, ADVISORY = "critical", "advisory"

# the short key each feed uses for its records
RID = {
    "crs": r"^(CRS-EVT-[0-9a-f]+(-DUP)?|[A-Z0-9]+-[A-Z]+(-\d+)?-[0-9a-f]+)$", "identity_reference": r"^IDR-[0-9A-Z]{6,}$", "pension_batch": r"^PN-\d+$",
    "revenue_certificates": r"^RV-(CC|IC)-\d+$", "revenue_land": r"^RV-LR-\d+$", "pds_view": r"^PDS-\d+$", "student_portal": r"^STU-\d+$",
    "marriage_register": r"^(MR-\d+|[A-Z0-9]+-[A-Z]+-[0-9a-f]+)(:\w+)?$", "electricity": r"^ELEC-[0-9A-Za-z]+$", "housing": r"^HSG-[0-9A-Za-z]+$", "water_board": r"^(WTR|BL)-[0-9A-Za-z-]+$",
}

# fields a feed is expected to carry, and the share of records that should have each
FIELDS = {
    "crs": {"gender": 0.9, "dob": 0.9, "district": 0.99},
    "identity_reference": {"gender": 0.99, "birth_year": 0.99, "district": 0.99},
    "marriage_register": {"gender": 0.99, "dob": 0.95, "district": 0.95},
    "pds_view": {"gender": 0.99, "age": 0.99, "address": 0.99, "district": 0.99, "ration_card": 0.99},
    "pension_batch": {"dob": 0.95, "district": 0.99},
    "electricity": {"address": 0.99, "district": 0.99},
    "water_board": {"address": 0.99, "district": 0.99},
    "housing": {"district": 0.99},
    "revenue_certificates": {"dob": 0.8, "address": 0.99, "district": 0.99},
    "revenue_land": {"district": 0.99},
    "student_portal": {"dob": 0.99},
}
# ---------------------------------------------------------------------------------------------------- rule settings
# One set of settings for every feed. Record keys and the key format belong to each department and are not here.
DEFAULTS = {
    "name_share": 0.99,            # share of records that must carry a usable name
    "name_min": 2, "name_max": 80,  # name length, in characters
    "min_birth_year": 1900,        # oldest birth year accepted
    "max_age": 120,                # highest age accepted
    "completeness_share": None,    # None = each feed keeps its own default; a number replaces it for every feed
    "freshness_days": None,        # None = each feed keeps its own refresh window; a number replaces it for every feed
    "advisory_off": [],            # advisory rule groups switched off: completeness | freshness | repeats
}
BOUNDS = {"name_share": (0.5, 1.0), "name_min": (1, 10), "name_max": (20, 200), "min_birth_year": (1850, 1990), "max_age": (90, 130),
          "completeness_share": (0.5, 1.0), "freshness_days": (1, 365)}
ADVISORY_GROUPS = {"completeness": "Fields are filled in", "freshness": "Latest record is recent", "repeats": "Repeated records"}


def with_defaults(raw: dict | None) -> dict:
    s = dict(DEFAULTS)
    s.update({k: v for k, v in (raw or {}).items() if k in DEFAULTS})
    return s


def validate(raw: dict) -> dict:
    """Check an officer's settings; returns the clean full set or raises ValueError with a sentence fit to show."""
    s = with_defaults(raw)
    for k, (lo, hi) in BOUNDS.items():
        v = s.get(k)
        if v is None and k in ("completeness_share", "freshness_days"):
            continue
        try:
            v = float(v)
        except (TypeError, ValueError):
            raise ValueError(f"{k.replace('_', ' ').capitalize()} must be a number")
        if not (lo <= v <= hi):
            raise ValueError(f"{k.replace('_', ' ').capitalize()} must be between {lo:g} and {hi:g}")
        s[k] = int(v) if k not in ("name_share", "completeness_share") else v
    if s["name_min"] >= s["name_max"]:
        raise ValueError("The shortest name length must be below the longest")
    bad = [g for g in (s["advisory_off"] or []) if g not in ADVISORY_GROUPS]
    if bad:
        raise ValueError(f"Unknown rule group: {bad[0]}")
    s["advisory_off"] = sorted(set(s["advisory_off"] or []))
    return s


LABEL = {"dob": "date of birth", "birth_year": "year of birth", "ration_card": "ration card number", "district": "district", "address": "address",
         "gender": "gender", "age": "age", "name": "name", "source_rid": "record key", "as_of": "as-of date"}


def _frame(rows):
    import pandas as pd
    df = pd.DataFrame(rows)
    df["dob_year"] = pd.to_datetime(df["dob"], errors="coerce").dt.year.astype("float64")
    as_of = pd.to_datetime(df["as_of"].str[:10], errors="coerce")
    df["as_of_day"] = (as_of - pd.Timestamp("1970-01-01")).dt.days.astype("float64")
    df["dob"] = df["dob"].astype("string")
    if "received_day" in df:
        df["received_day"] = df["received_day"].astype("string")
    return df


def _suite_for(source: str, gxe, n: int, has_asof: bool = True, cfg: dict | None = None):
    """The expectations for one feed, each tagged with a key, severity, scope and a plain-language description.

    scope 'record' = judged record by record, so it can be counted per day; 'feed' = one answer for the whole feed (pass or fail).
    tolerance = the share of records allowed to fail before the rule counts as failed."""
    c = with_defaults(cfg)
    off = set(c["advisory_off"])
    ex = []

    def add(exp, severity, text, key, scope="record", tolerance=0.0):
        exp.meta = {"severity": severity, "description": text, "key": key, "scope": scope, "tolerance": round(tolerance, 5)}
        ex.append(exp)

    ns = c["name_share"]
    add(gxe.ExpectTableRowCountToBeBetween(min_value=1), CRITICAL, "The feed delivered at least one record", "row_count", "feed")
    add(gxe.ExpectColumnValuesToNotBeNull(column="source_rid"), CRITICAL, "Every record carries its department's own key", "rid_present")
    add(gxe.ExpectColumnValuesToBeUnique(column="source_rid"), CRITICAL, "No record key appears twice", "rid_unique")
    add(gxe.ExpectColumnValuesToMatchRegex(column="source_rid", regex=RID[source]), CRITICAL, "Record keys follow the department's key format", "rid_format")
    add(gxe.ExpectColumnValuesToNotBeNull(column="name", mostly=ns), CRITICAL, f"{_pc(ns)} of records have a name", "name_present", tolerance=1 - ns)
    add(gxe.ExpectColumnValueLengthsToBeBetween(column="name", min_value=c["name_min"], max_value=c["name_max"], mostly=ns), CRITICAL,
        f"Names are between {c['name_min']} and {c['name_max']} characters", "name_length", tolerance=1 - ns)
    add(gxe.ExpectColumnValuesToBeInSet(column="gender", value_set=["M", "F", "T", "N"]), CRITICAL, "Gender, where given, is M, F, T (transgender) or N (not disclosed)", "gender_valid")
    add(gxe.ExpectColumnValuesToBeBetween(column="dob_year", min_value=c["min_birth_year"], max_value=REF_DATE.year, mostly=1.0), CRITICAL,
        f"Dates of birth fall between {c['min_birth_year']} and today", "dob_range")
    add(gxe.ExpectColumnValuesToBeBetween(column="age", min_value=0, max_value=c["max_age"]), CRITICAL, f"Ages are between 0 and {c['max_age']}", "age_range")
    add(gxe.ExpectColumnValuesToBeBetween(column="birth_year", min_value=c["min_birth_year"], max_value=REF_DATE.year), CRITICAL,
        f"Years of birth fall between {c['min_birth_year']} and today", "birth_year_range")
    add(gxe.ExpectColumnValuesToMatchRegex(column="as_of", regex=r"^\d{4}-\d{2}-\d{2}"), CRITICAL, "As-of dates, where given, are written as dates", "asof_format")
    if "completeness" not in off:
        for col, share in FIELDS.get(source, {}).items():
            share = c["completeness_share"] if c["completeness_share"] is not None else share
            add(gxe.ExpectColumnValuesToNotBeNull(column=col, mostly=share), ADVISORY, f"At least {round(share * 100)}% of records carry {LABEL.get(col, col)}",
                f"complete:{col}", tolerance=1 - share)
    hours = SOURCE_INFO.get(source, ("", "", 24))[2]
    window_days = c["freshness_days"] if c["freshness_days"] is not None else ((hours / 24) if hours else 30)    # event feed: nothing older than a month
    if has_asof and "freshness" not in off:
        add(gxe.ExpectColumnMaxToBeBetween(column="as_of_day", min_value=(REF_DATE - date(1970, 1, 1)).days - window_days, max_value=(REF_DATE - date(1970, 1, 1)).days + 1),
            ADVISORY, f"The latest record is no older than the feed's refresh window ({round(window_days)} day{'s' if round(window_days) != 1 else ''})", "freshness", "feed")
    if source not in ("student_portal", "housing", "revenue_land", "electricity", "revenue_certificates", "water_board") and "repeats" not in off:
        dup = gxe.ExpectCompoundColumnsToBeUnique(column_list=["name", "dob", "district"], mostly=0.99, row_condition="dob.notnull() and district.notnull()", condition_parser="pandas")
        add(dup, ADVISORY, "The same name, birth date and district is not repeated within the feed", "repeats", tolerance=0.01)
    return ex


def _pc(x: float) -> str:
    v = x * 100
    return f"{v:.0f}%" if abs(v - round(v)) < 1e-9 else f"{v:.1f}%"


# ---------------------------------------------------------------------------------------------------- why a check failed
PATTERN = {"crs": "CRS-EVT-<code> or <code>-<type>-<code>", "identity_reference": "IDR-<6 or more letters or digits>", "pension_batch": "PN-<number>",
           "revenue_certificates": "RV-CC-<number> or RV-IC-<number>", "revenue_land": "RV-LR-<number>", "pds_view": "PDS-<number>", "student_portal": "STU-<number>",
           "marriage_register": "MR-<number>", "electricity": "ELEC-<id>", "housing": "HSG-<id>", "water_board": "WTR-<id>, BL-<id> or WTR-<id>-S<n>"}
VALUE_OF = {"rid_present": "source_rid", "rid_unique": "source_rid", "rid_format": "source_rid", "name_present": "name", "name_length": "name", "gender_valid": "gender",
            "dob_range": "dob", "age_range": "age", "birth_year_range": "birth_year", "asof_format": "as_of"}
EXAMPLES, TOP = 50, 5


def _params(key: str, source: str, c: dict, col: str | None) -> dict:
    hours = SOURCE_INFO.get(source, ("", "", 24))[2]
    window = c["freshness_days"] if c["freshness_days"] is not None else ((hours / 24) if hours else 30)
    return {"min_year": c["min_birth_year"], "max_year": REF_DATE.year, "max_age": c["max_age"], "name_min": c["name_min"], "name_max": c["name_max"],
            "field": LABEL.get(col, col) if col else None, "pattern": PATTERN.get(source), "window": round(window)}


def _val(x):
    import pandas as pd
    try:
        if x is None or pd.isna(x):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(x, float) and x == int(x):
        return int(x)
    return str(x) if not isinstance(x, (int, float, bool)) else x


def _found(key: str, df, listing: list, rr: dict, prm: dict, source: str, limit: int = EXAMPLES) -> dict:
    """What was actually found for a failed check: a breakdown of the reasons, the districts it concentrates in, and examples with their values."""
    import re
    import pandas as pd
    by = df.drop_duplicates("source_rid").set_index("source_rid").to_dict("index") if "source_rid" in df else {}
    rows = [u for u in listing if isinstance(u, dict)]
    rids = [u.get("source_rid") for u in rows]
    col = VALUE_OF.get(key)

    def value_of(rid):
        rec = by.get(rid) or {}
        if col == "source_rid":
            return rid
        if key == "repeats":
            return " | ".join(str(_val(rec.get(k)) or "—") for k in ("name", "dob", "district"))
        if key.startswith("complete:"):
            return "(blank)"
        return _val(rec.get(col)) if col else None
    day_of = {u.get("source_rid"): u.get("received_day") for u in rows}
    ex = [{"source_rid": r, "value": value_of(r), "received_day": day_of.get(r)} for r in rids[:limit]]
    if key.startswith("complete:"):
        ex = [{"source_rid": r, "value": "(blank)", "received_day": day_of.get(r)} for r in rids[:limit]]
    dist = Counter(str(_val((by.get(r) or {}).get("district")) or "(no district)") for r in rids)
    brk = Counter()
    if key == "gender_valid":
        brk.update("blank" if not v else str(v) for v in (value_of(r) for r in rids))
    elif key == "rid_format":
        rx = re.compile(RID[source])
        good = {str(k).split("-")[0] for k in by if rx.match(str(k))}
        for r in rids:
            r = "" if r is None else str(r)
            brk["blank" if not r else "contains spaces" if r != r.strip() or " " in r else "different prefix" if r.split("-")[0] not in good else "different number pattern"] += 1
    elif key == "name_length":
        for r in rids:
            n = len(str((by.get(r) or {}).get("name") or ""))
            brk[f"shorter than {prm['name_min']} characters" if n < prm["name_min"] else f"longer than {prm['name_max']} characters"] += 1
    elif key in ("dob_range", "birth_year_range"):
        for r in rids:
            rec = by.get(r) or {}
            y = rec.get("dob_year") if key == "dob_range" else rec.get("birth_year")
            y = _val(y)
            brk[f"before {prm['min_year']}" if y is not None and y < prm["min_year"] else "in the future"] += 1
    elif key == "age_range":
        for r in rids:
            a = _val((by.get(r) or {}).get("age"))
            brk[f"above {prm['max_age']}" if a is not None and a > 0 else "below 0"] += 1
    elif key == "asof_format":
        brk["not written as YYYY-MM-DD"] = len(rids)
    return {"params": prm, "breakdown": [{"label": k, "count": n} for k, n in brk.most_common(TOP)], "districts": [{"label": k, "count": n} for k, n in dist.most_common(TOP)] if rids else [],
            "examples": ex, "shown": len(ex), "affected": rr.get("unexpected_count")}


def _feed_found(key: str, df, rr: dict, prm: dict) -> dict:
    out = {"params": prm}
    if key == "row_count":
        out["records"] = int(len(df))
    elif key == "freshness":
        mx = df["as_of_day"].max() if "as_of_day" in df else None
        if mx is not None and mx == mx:
            latest = date(1970, 1, 1) + timedelta(days=int(mx))
            out.update(latest=latest.isoformat(), days_ago=(REF_DATE - latest).days)
    return out


def explain(r: dict) -> dict:
    """The reasons text for one failed check, written for an officer. r is a stored result row."""
    f = r.get("found") or {}
    p = f.get("params") or {}
    key = r.get("rule_key") or ""
    n = r.get("unexpected_count")
    n = 0 if n is None else n
    pct = r.get("unexpected_percent")
    pct = "" if pct is None else f"{pct:.1f}%"
    allowed = round(float(r.get("tolerance") or 0) * 100, 1)
    field = p.get("field") or "this field"
    dep = "the department"
    brk = ", ".join(f"{b['label']} ({b['count']})" for b in f.get("breakdown", []))
    rule_hint = " If this rule no longer suits the scheme, an officer can change it in Rule settings."
    T = {
        "row_count": ("The feed arrived empty. No records were received in this load.", f"Ask {dep} to confirm the extract ran and re-send it."),
        "rid_present": (f"{n} records arrived without the department's own record number, so they cannot be matched back to their source.", f"Ask {dep} to re-send these records with their record number filled in."),
        "rid_unique": (f"{n} record numbers appear more than once in this feed, so one number points to several records.", f"Ask {dep} which record is correct and to correct the numbering at source."),
        "rid_format": (f"{n} record numbers do not follow the department's numbering pattern ({p.get('pattern')})." + (f" The problems found are: {brk}." if brk else ""),
                       f"Ask {dep} whether the number format has changed. If yes, the expected pattern is updated here; if no, ask them to correct the records."),
        "name_present": (f"{n} records ({pct}) have no name. More than {allowed}% is not accepted.", f"Ask {dep} to fill in the missing names. A record without a name cannot be matched to a person."),
        "name_length": (f"{n} names are shorter than {p.get('name_min')} or longer than {p.get('name_max')} characters." + (f" Found: {brk}." if brk else ""),
                        f"These are usually typing errors or placeholder text. Ask {dep} to correct them." + rule_hint),
        "gender_valid": (f"{n} records carry a gender value that is not M, F, T or N." + (f" Found: {brk}." if brk else ""), f"Ask {dep} to map their gender codes to M, F, T or N in the feed."),
        "dob_range": (f"{n} birth dates are before {p.get('min_year')} or in the future." + (f" Found: {brk}." if brk else ""),
                      f"Ask {dep} to check the date entry. A future date is usually a day, month or year typed the wrong way."),
        "age_range": (f"{n} ages are above {p.get('max_age')} or below 0." + (f" Found: {brk}." if brk else ""), f"Ask {dep} to check these records." + rule_hint),
        "birth_year_range": (f"{n} years of birth are before {p.get('min_year')} or in the future." + (f" Found: {brk}." if brk else ""), f"Ask {dep} to check the year entry. A future year is usually a typing error."),
        "asof_format": (f"{n} as-of dates are not written as YYYY-MM-DD, so freshness cannot be judged for them.", f"Ask {dep} to send dates in YYYY-MM-DD form."),
        "freshness": (f"The newest record in this feed is dated {f.get('latest', 'unknown')}" + (f", which is {f['days_ago']} days before the reference date" if f.get("days_ago") is not None else "")
                      + f". This feed is expected to refresh every {p.get('window')} days.", f"Ask {dep} whether the feed is delayed or paused." + rule_hint),
        "repeats": (f"{n} records repeat another record's name, birth date and district within this feed. These may be real duplicates.",
                    f"Ask {dep} to confirm whether the repeats are genuine duplicates. They are also checked across feeds in the review queue."),
    }
    if key.startswith("complete:"):
        top = "" if key == "complete:district" else ", ".join(f"{d['label']} ({d['count']})" for d in f.get("districts", [])[:3])
        why = f"{n} records ({pct}) have no {field}. The feed is allowed to miss {allowed}%." + (f" Most are in: {top}." if top else "")
        return {"why": why, "action": f"Raise it with {dep} so the gap closes. Matching still works, but with less evidence." + rule_hint}
    why, action = T.get(key, (r.get("description") or "This check did not pass.", f"Raise it with {dep}."))
    return {"why": why, "action": action}


# ---------------------------------------------------------------------------------------------------- department contacts
def contacts(cur) -> list[dict]:
    cur.execute("SELECT source, name, role, email, phone, updated_by, updated_at FROM mdm.feed_contact")
    have = {r["source"]: r for r in cur.fetchall()}
    out = []
    for s in SOURCE_ORDER:
        feed = SOURCE_INFO.get(s, (s,))[0]
        r = have.get(s)
        out.append({"source": s, "feed": feed, **(r or {"name": "Data steward", "role": f"{feed} (placeholder)", "email": f"data.steward@{s.replace('_', '-')}.example", "phone": None,
                                                      "updated_by": None, "updated_at": None}), "placeholder": r is None})
    return out


def save_contact(cur, actor: str, source: str, data: dict) -> dict:
    if source not in SOURCE_ORDER:
        raise ValueError("Unknown feed")
    name = (data.get("name") or "").strip()
    if not name:
        raise ValueError("A contact needs a name")
    email = (data.get("email") or "").strip()
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ValueError("The email address does not look right")
    vals = (source, name[:120], (data.get("role") or "").strip()[:160] or None, email[:160] or None, (data.get("phone") or "").strip()[:40] or None, actor)
    cur.execute("""INSERT INTO mdm.feed_contact (source, name, role, email, phone, updated_by) VALUES (%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (source) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role, email=EXCLUDED.email, phone=EXCLUDED.phone, updated_by=EXCLUDED.updated_by, updated_at=now()""", vals)
    audit.write(cur, actor, "QUALITY_CONTACT_CHANGED", f"feed_contact:{source}", {"name": name, "role": vals[2], "email": vals[3]})
    return next(c for c in contacts(cur) if c["source"] == source)



def _clean(x):
    """Plain JSON: pandas gives NaN / numpy numbers, which Postgres JSON does not accept."""
    if isinstance(x, dict):
        return {str(k): _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    if x is None or isinstance(x, (bool, str)):
        return x
    try:
        import math
        f = float(x)
        if math.isnan(f) or math.isinf(f):
            return None
        return int(f) if f == int(f) and not isinstance(x, float) else f
    except (TypeError, ValueError):
        return str(x)


def _json(x):
    return _clean(x)


def _run_source(context, gx, gxe, source: str, rows: list[dict], cfg: dict | None = None, only_key: str | None = None, example_limit: int = EXAMPLES,
                always_found: bool = False) -> list[dict]:
    import great_expectations as _gx
    df = _frame(rows)
    ds = context.data_sources.add_or_update_pandas(name="department_feeds")
    try:
        asset = ds.get_asset(source)
    except Exception:
        asset = ds.add_dataframe_asset(name=source)
    bd = asset.add_batch_definition_whole_dataframe(f"{source}_load") if not asset.batch_definitions else asset.batch_definitions[0]
    suite = _gx.ExpectationSuite(name=f"{source}_feed_contract")
    for e in _suite_for(source, gxe, len(df), bool(df['as_of_day'].notna().any()), cfg):
        if only_key is None or (e.meta or {}).get('key') == only_key:
            suite.add_expectation(e)
    suite = context.suites.add_or_update(suite)
    vd = context.validation_definitions.add_or_update(_gx.ValidationDefinition(name=f"{source}_validation", data=bd, suite=suite))
    by_day = Counter(df["received_day"].fillna("").tolist()) if "received_day" in df else Counter()
    idx_cols = ["source_rid"] + (["received_day"] if "received_day" in df else [])
    res = vd.run(batch_parameters={"dataframe": df}, result_format={"result_format": "COMPLETE", "partial_unexpected_count": 5, "unexpected_index_column_names": idx_cols})
    out = []
    for r in res.results:
        cfgx = r.expectation_config
        meta = cfgx.meta or {}
        rr = r.result or {}
        listing = rr.get("unexpected_index_list") or rr.get("partial_unexpected_index_list") or []
        samples = [_json({"source_rid": u.get("source_rid")}) if isinstance(u, dict) else _json(u) for u in listing[:5]]
        if not samples:
            samples = [{"value": _json(v)} for v in (rr.get("partial_unexpected_list") or [])[:5]]
        days = None
        if meta.get("scope", "record") == "record" and by_day:
            failed = Counter(str(u.get("received_day")) for u in listing if isinstance(u, dict))
            days = {d: [n, failed.get(d, 0)] for d, n in by_day.items() if d}
        found = {}
        if not r.success or (always_found and rr.get("unexpected_count")):
            key = meta.get("key") or ""
            prm = _params(key, source, with_defaults(cfg), cfgx.kwargs.get("column"))
            found = _found(key, df, listing, rr, prm, source, example_limit) if meta.get("scope", "record") == "record" else _feed_found(key, df, rr, prm)
        out.append({"source": source, "found": found, "expectation": cfgx.type, "column_name": cfgx.kwargs.get("column") or ", ".join(cfgx.kwargs.get("column_list", []) or []) or None,
                    "severity": meta.get("severity", ADVISORY), "description": meta.get("description"), "success": bool(r.success),
                    "rule_key": meta.get("key"), "scope": meta.get("scope", "record"), "tolerance": meta.get("tolerance", 0.0), "days": days,
                    "element_count": rr.get("element_count"), "unexpected_count": rr.get("unexpected_count"), "unexpected_percent": rr.get("unexpected_percent"),
                    "observed": _json({"observed_value": rr.get("observed_value")}) if rr.get("observed_value") is not None else None, "samples": samples})
    return out


def source_status(results: list[dict]) -> str:
    if any(not r["success"] and r["severity"] == CRITICAL for r in results):
        return "FAIL"
    if any(not r["success"] for r in results):
        return "WARN"
    return "PASS"


def _context():
    import great_expectations as gx
    context = gx.get_context(mode="ephemeral")
    try:
        context.variables.progress_bars = {"globals": False, "metric_calculations": False, "profilers": False}
    except Exception:
        pass
    return gx, context


_FEED_ROWS = ("SELECT source_rid, name, gender, dob::text AS dob, age, birth_year, district, address, ration_card, as_of, "
              "received_at::date::text AS received_day FROM mdm.source_record WHERE source=%s")


def _evaluate(cur, cfg: dict, only: list[str] | None = None) -> dict:
    """Run every feed's contract under the given settings. Nothing is stored here."""
    import great_expectations.expectations as gxe
    gx, context = _context()
    cur.execute("SELECT DISTINCT source FROM mdm.source_record")
    present = {r["source"] for r in cur.fetchall()}
    out = {}
    for s in [x for x in SOURCE_ORDER if x in present and (not only or x in only)]:
        cur.execute(_FEED_ROWS, (s,))
        rows = cur.fetchall()
        out[s] = {"records": len(rows), "results": _run_source(context, gx, gxe, s, rows, cfg)}
    return out


def run(actor: str = "quality-job", trigger: str = "MANUAL") -> dict:
    """Run every feed's contract once under the active rule settings and keep the results, including the counts for each day."""
    import great_expectations as gx
    with connect() as conn:
        cur = conn.cursor()
        rs = active_rules(cur)
        cur.execute("INSERT INTO mdm.quality_run (actor, gx_version, trigger, rule_version) VALUES (%s,%s,%s,%s) RETURNING id, started_at", (actor, gx.__version__, trigger, rs["version"]))
        head = cur.fetchone()
        evaluated = _evaluate(cur, rs["settings"])
        summary = {}
        total_fail = total_warn = 0
        for s, ev in evaluated.items():
            results = ev["results"]
            for r in results:
                cur.execute("""INSERT INTO mdm.quality_result (run_id, source, expectation, column_name, severity, description, success, element_count,
                               unexpected_count, unexpected_percent, observed, samples, rule_key, scope, tolerance, found)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s::jsonb)""",
                            (head["id"], s, r["expectation"], r["column_name"], r["severity"], r["description"], r["success"], r["element_count"],
                             r["unexpected_count"], r["unexpected_percent"], json.dumps(r["observed"]) if r["observed"] else None, json.dumps(r["samples"]),
                             r["rule_key"], r["scope"], r["tolerance"], json.dumps(_clean(r["found"]))))
                if r["days"]:
                    cur.executemany("INSERT INTO mdm.quality_daily (run_id, source, rule_key, day, checked, failed) VALUES (%s,%s,%s,%s,%s,%s)",
                                    [(head["id"], s, r["rule_key"], d, n, f) for d, (n, f) in r["days"].items()])
            st = source_status(results)
            summary[s] = {"status": st, "records": ev["records"], "expectations": len(results), "passed": sum(1 for r in results if r["success"]),
                          "critical_failed": sum(1 for r in results if not r["success"] and r["severity"] == CRITICAL),
                          "advisory_failed": sum(1 for r in results if not r["success"] and r["severity"] == ADVISORY)}
            total_fail += st == "FAIL"
            total_warn += st == "WARN"
        totals = {"feeds": len(summary), "pass": sum(1 for v in summary.values() if v["status"] == "PASS"), "warn": total_warn, "fail": total_fail}
        cur.execute("UPDATE mdm.quality_run SET finished_at=now(), summary=%s::jsonb WHERE id=%s", (json.dumps({"feeds": summary, "totals": totals}), head["id"]))
        # daily counts are kept for the ten most recent runs; the run results themselves are kept for good
        cur.execute("DELETE FROM mdm.quality_daily WHERE run_id NOT IN (SELECT id FROM mdm.quality_run ORDER BY id DESC LIMIT 10)")
        audit.write(cur, actor, "QUALITY_RUN", f"quality:{head['id']}", {"gx": gx.__version__, "rule_version": rs["version"], **totals})
        conn.commit()
    return {"id": head["id"], "gx_version": gx.__version__, "rule_version": rs["version"], "totals": totals, "feeds": summary}


# ---------------------------------------------------------------------------------------------------- rule settings: read, preview, save
def active_rules(cur) -> dict:
    cur.execute("SELECT version, created_at, actor, reason, settings FROM mdm.quality_rule_set ORDER BY version DESC LIMIT 1")
    r = cur.fetchone()
    if not r:
        return {"version": 0, "created_at": None, "actor": "system", "reason": "Built-in defaults", "settings": with_defaults(None)}
    return {**r, "settings": with_defaults(r["settings"])}


def rules_overview(cur) -> dict:
    cur.execute("SELECT version, created_at, actor, reason, settings FROM mdm.quality_rule_set ORDER BY version DESC LIMIT 25")
    hist = cur.fetchall()
    for h in hist:
        h["settings"] = with_defaults(h["settings"])
    return {"active": active_rules(cur), "history": hist, "defaults": DEFAULTS, "bounds": BOUNDS, "advisory_groups": ADVISORY_GROUPS,
            "feed_completeness": FIELDS}


def _changes(old: dict, new: dict) -> dict:
    return {k: {"from": old.get(k), "to": new.get(k)} for k in DEFAULTS if old.get(k) != new.get(k)}


def preview_rules(cur, raw: dict) -> dict:
    """What the latest data would show under the proposed settings, against what the active settings show. Nothing is stored."""
    new = validate(raw)
    cur_rs = active_rules(cur)
    mine = _evaluate(cur, new)
    base = _evaluate(cur, cur_rs["settings"])
    feeds, changed = {}, []
    for s, ev in mine.items():
        a = {r["rule_key"]: r for r in base.get(s, {}).get("results", [])}
        b = {r["rule_key"]: r for r in ev["results"]}
        feeds[s] = {"name": SOURCE_INFO.get(s, (s,))[0], "before": source_status(list(a.values())) if a else None, "after": source_status(ev["results"])}
        for k in sorted(set(a) | set(b)):
            x, y = a.get(k), b.get(k)
            if (x and x["success"]) != (y and y["success"]) or (x is None) != (y is None):
                changed.append({"source": s, "feed": feeds[s]["name"], "rule_key": k, "description": (y or x)["description"],
                                "before": None if x is None else ("passed" if x["success"] else "failed"), "after": None if y is None else ("passed" if y["success"] else "failed")})
    return {"settings": new, "changes": _changes(cur_rs["settings"], new), "feeds": feeds, "rules_changed": changed,
            "feeds_changed": sum(1 for f in feeds.values() if f["before"] != f["after"])}


def save_rules(cur, actor: str, raw: dict, reason: str) -> dict:
    reason = (reason or "").strip()
    if len(reason) < 8:
        raise ValueError("Say why the rules are being changed (at least a short sentence); it is kept with the new version")
    new = validate(raw)
    old = active_rules(cur)
    ch = _changes(old["settings"], new)
    if not ch:
        raise ValueError("Nothing has changed from the current settings")
    cur.execute("INSERT INTO mdm.quality_rule_set (actor, reason, settings) VALUES (%s,%s,%s::jsonb) RETURNING version, created_at", (actor, reason, json.dumps(new)))
    v = cur.fetchone()
    audit.write(cur, actor, "QUALITY_RULES_CHANGED", f"quality_rules:{v['version']}", {"reason": reason, "changes": ch, "previous_version": old["version"]})
    return {"version": v["version"], "created_at": v["created_at"], "actor": actor, "reason": reason, "settings": new, "changes": ch}


# ---------------------------------------------------------------------------------------------------- records received in a date range
def _latest_run_id(cur):
    cur.execute("SELECT id, finished_at, rule_version FROM mdm.quality_run WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1")
    return cur.fetchone()


def _parse_day(v, default):
    if not v:
        return default
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        raise ValueError("Dates must be written as YYYY-MM-DD")


def range_report(cur, date_from=None, date_to=None, source: str | None = None, rule: str | None = None) -> dict:
    """Counts for records received between two days, from the latest run: per feed and rule, and per day."""
    run_ = _latest_run_id(cur)
    cur.execute("SELECT current_date AS d")
    today = cur.fetchone()["d"]
    d_to = _parse_day(date_to, today)
    d_from = _parse_day(date_from, d_to - timedelta(days=29))
    if d_from > d_to:
        raise ValueError("The start date is after the end date")
    out = {"run": None, "from": d_from.isoformat(), "to": d_to.isoformat(), "available": None, "has_daily": False, "rules": [], "days": [], "tiles": {}, "feeds": []}
    if not run_:
        return out
    out["run"] = {"id": run_["id"], "finished_at": run_["finished_at"], "rule_version": run_["rule_version"]}
    cur.execute("SELECT min(day) AS a, max(day) AS b, count(*) AS n FROM mdm.quality_daily WHERE run_id=%s", (run_["id"],))
    av = cur.fetchone()
    out["has_daily"] = bool(av["n"])
    out["available"] = {"from": av["a"].isoformat(), "to": av["b"].isoformat()} if av["n"] else None
    cur.execute("SELECT source, rule_key, scope, severity, description, success, tolerance, unexpected_count FROM mdm.quality_result WHERE run_id=%s ORDER BY source, id", (run_["id"],))
    meta = cur.fetchall()
    cur.execute("""SELECT source, rule_key, sum(checked)::int AS checked, sum(failed)::int AS failed, count(*)::int AS days FROM mdm.quality_daily
                   WHERE run_id=%s AND day BETWEEN %s AND %s GROUP BY 1,2""", (run_["id"], d_from, d_to))
    agg = {(r["source"], r["rule_key"]): r for r in cur.fetchall()}
    rules = []
    for m in meta:
        if source and m["source"] != source:
            continue
        if rule and m["rule_key"] != rule:
            continue
        name = SOURCE_INFO.get(m["source"], (m["source"],))[0]
        row = {"source": m["source"], "feed": name, "rule_key": m["rule_key"], "scope": m["scope"], "severity": m["severity"], "description": m["description"]}
        if m["scope"] == "feed":
            row.update(checked=None, failed=None, passed=None, percent_failed=None, tolerance=None, outcome="passed" if m["success"] else "failed")
        else:
            a = agg.get((m["source"], m["rule_key"]), {"checked": 0, "failed": 0})
            tol = float(m["tolerance"] or 0)
            chk, fl = a["checked"], a["failed"]
            row.update(checked=chk, failed=fl, passed=chk - fl, percent_failed=round(100.0 * fl / chk, 2) if chk else None, tolerance=round(tol * 100, 2),
                       outcome=None if not chk else ("failed" if fl > tol * chk + 1e-9 else "passed"))
        row["status"] = "PASS" if row["outcome"] in (None, "passed") else ("FAIL" if m["severity"] == CRITICAL else "WARN")
        rules.append(row)
    out["rules"] = rules
    keys = {(r["source"], r["rule_key"]) for r in rules if r["scope"] == "record"}
    cur.execute("SELECT source, rule_key, day, checked, failed FROM mdm.quality_daily WHERE run_id=%s AND day BETWEEN %s AND %s ORDER BY day", (run_["id"], d_from, d_to))
    per_day, feed_day = {}, {}
    for r in cur.fetchall():
        if (r["source"], r["rule_key"]) not in keys:
            continue
        d = per_day.setdefault(r["day"], {"day": r["day"].isoformat(), "checks": 0, "failed": 0})
        d["checks"] += r["checked"]
        d["failed"] += r["failed"]
        fd = feed_day.setdefault((r["day"], r["source"]), 0)
        feed_day[(r["day"], r["source"])] = max(fd, r["checked"])
    for (day, _s), n in feed_day.items():
        per_day[day]["records"] = per_day[day].get("records", 0) + n
    out["days"] = [{**v, "records": v.get("records", 0), "percent_failed": round(100.0 * v["failed"] / v["checks"], 2) if v["checks"] else None} for _, v in sorted(per_day.items())]
    feed_records = {}
    for (day, s), n in feed_day.items():
        feed_records[s] = feed_records.get(s, 0) + n
    out["feeds"] = [{"source": s, "feed": SOURCE_INFO.get(s, (s,))[0], "records": n} for s, n in sorted(feed_records.items(), key=lambda x: -x[1])]
    out["feed_summary"] = _feed_summary(cur, run_["id"], d_from, d_to, source, rules, av["a"], today)
    rec = [r for r in rules if r["scope"] == "record" and r["checked"]]
    tot = sum(r["checked"] for r in rec)
    out["allowed_percent"] = round(sum((r["tolerance"] or 0) * r["checked"] for r in rec) / tot, 2) if tot else None      # what the rules allow, weighted by records checked
    out["tiles"] = {"records": sum(feed_records.values()), "feeds": len(feed_records), "rules_failed": sum(1 for r in rules if r["outcome"] == "failed"),
                    "rules_checked": len(rules), "failed_checks": sum(r["failed"] for r in rec), "checks": sum(r["checked"] for r in rec)}
    return out


# ---------------------------------------------------------------------------------------------------- a feed's own view of what was received
MAX_VALUE_DAYS = 7          # real values are shown, and the chase list produced, only for a window this short


def _per_feed_days(cur, run_id, d_from, d_to, source=None):
    cur.execute("SELECT source, day, max(checked)::int AS n FROM mdm.quality_daily WHERE run_id=%s AND day BETWEEN %s AND %s " + ("AND source=%s " if source else "") + "GROUP BY 1,2",
                (run_id, d_from, d_to) + ((source,) if source else ()))
    out = {}
    for r in cur.fetchall():
        out.setdefault(r["source"], {})[r["day"]] = r["n"]
    return out


def silent_days(source: str, have: dict, d_from: date, d_to: date, first_known: date | None, today: date) -> list[str]:
    """Days a feed that is expected to send regularly sent nothing. Daily feeds: a weekday without records (weekends are not expected).
    Weekly feeds: a run of days without records longer than a week. Slower feeds are not judged."""
    hours = SOURCE_INFO.get(source, ("", "", 24))[2]
    if hours > 24 * 7:
        return []
    start = max(d_from, first_known) if first_known else d_from
    end = min(d_to, today - timedelta(days=1))              # today is not over yet
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)] if end >= start else []
    if hours <= 24:
        return [d.isoformat() for d in days if d.weekday() < 5 and d not in have]
    out, run = [], []
    for d in days + [None]:
        if d is not None and d not in have:
            run.append(d)
            continue
        if len(run) > hours / 24:
            out += [x.isoformat() for x in run]
        run = []
    return out


def _feed_summary(cur, run_id, d_from, d_to, source, rules, first_known, today) -> list[dict]:
    cur_days = _per_feed_days(cur, run_id, d_from, d_to, source)
    length = (d_to - d_from).days + 1
    p_to = d_from - timedelta(days=1)
    p_from = p_to - timedelta(days=length - 1)
    prev_days = _per_feed_days(cur, run_id, p_from, p_to, source)
    comparable = bool(first_known) and p_from >= first_known
    out = []
    for s in [x for x in SOURCE_ORDER if (not source or x == source)]:
        have = cur_days.get(s, {})
        total = sum(have.values())
        prev = sum(prev_days.get(s, {}).values())
        busiest = max(have.items(), key=lambda kv: kv[1]) if have else None
        mine = [r for r in rules if r["source"] == s]
        out.append({"source": s, "feed": SOURCE_INFO.get(s, (s,))[0], "records": total, "active_days": len(have), "window_days": length,
                    "average_per_day": round(total / length, 1), "busiest_day": {"day": busiest[0].isoformat(), "records": busiest[1]} if busiest else None,
                    "previous_records": prev if comparable else None, "previous_from": p_from.isoformat(), "previous_to": p_to.isoformat(),
                    "change_percent": round(100.0 * (total - prev) / prev, 1) if comparable and prev else None,
                    "silent_days": silent_days(s, have, d_from, d_to, first_known, today)[:62], "failed_checks": sum(1 for r in mine if r["outcome"] == "failed")})
    return out


def _short_window(d_from: str | None, d_to: str | None, today: date) -> tuple[date, date]:
    d_to_ = _parse_day(d_to, today)
    d_from_ = _parse_day(d_from, d_to_ - timedelta(days=MAX_VALUE_DAYS - 1))
    if d_from_ > d_to_:
        raise ValueError("The start date is after the end date")
    if (d_to_ - d_from_).days + 1 > MAX_VALUE_DAYS:
        raise ValueError(f"To see the records themselves, choose {MAX_VALUE_DAYS} days or fewer. Select a single day on the chart, or Last 7 days.")
    return d_from_, d_to_


_WINDOW_ROWS = _FEED_ROWS + " AND received_at::date BETWEEN %s AND %s"


def range_detail(cur, date_from, date_to, source: str, rule: str, district: str | None = None) -> dict:
    """The failing records of one check among those received in a short window: why, what was found, with values."""
    import great_expectations.expectations as gxe
    cur.execute("SELECT current_date AS d")
    d_from, d_to = _short_window(date_from, date_to, cur.fetchone()["d"])
    run_ = _latest_run_id(cur)
    cur.execute("SELECT scope, description, severity FROM mdm.quality_result WHERE run_id=%s AND source=%s AND rule_key=%s", (run_["id"] if run_ else 0, source, rule))
    m = cur.fetchone()
    if not m:
        raise ValueError("No such check for this feed")
    if m["scope"] != "record":
        raise ValueError("This check judges the whole feed, not individual records")
    q, par = _WINDOW_ROWS, [source, d_from, d_to]
    if district:
        q += " AND coalesce(district, '(no district)') = %s"
        par.append(district)
    cur.execute(q, par)
    rows = cur.fetchall()
    rs = active_rules(cur)
    out = {"from": d_from.isoformat(), "to": d_to.isoformat(), "source": source, "feed": SOURCE_INFO.get(source, (source,))[0], "rule_key": rule, "description": m["description"],
           "severity": m["severity"], "checked": len(rows), "failed": 0, "district": district, "found": {}, "explain": None, "contact": None, "rule_version": rs["version"]}
    if rows:
        gx, context = _context()
        r = _run_source(context, gx, gxe, source, rows, rs["settings"], only_key=rule, example_limit=500, always_found=True)[0]
        out["failed"] = r["unexpected_count"] or 0
        out["found"] = r["found"]
        out["description"] = r["description"]
        if out["failed"]:
            out["explain"] = explain({**r, "unexpected_percent": r["unexpected_percent"], "tolerance": r["tolerance"]})
    out["contact"] = next((c for c in contacts(cur) if c["source"] == source), None)
    return out


def chase_csv(cur, date_from, date_to, source: str | None = None, rule: str | None = None) -> tuple[str, str, int]:
    """One row per failing record received in a short window, with the value found and who to contact. Returns (file name, text, rows)."""
    cur.execute("SELECT current_date AS d")
    d_from, d_to = _short_window(date_from, date_to, cur.fetchone()["d"])
    import great_expectations.expectations as gxe
    rs = active_rules(cur)
    ct = {c["source"]: c for c in contacts(cur)}
    gx, context = _context()
    imp = {"critical": "Must hold", "advisory": "Worth chasing"}
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(["window_from", "window_to", "feed", "record_key", "received_date", "check", "importance", "value_found", "why_it_failed", "contact_name", "contact_role", "contact_email", "rule_settings_version"])
    n = 0
    cur.execute("SELECT DISTINCT source FROM mdm.source_record")
    present = {r["source"] for r in cur.fetchall()}
    for s in [x for x in SOURCE_ORDER if x in present and (not source or x == source)]:
        cur.execute(_WINDOW_ROWS, (s, d_from, d_to))
        rows = cur.fetchall()
        if not rows:
            continue
        for r in _run_source(context, gx, gxe, s, rows, rs["settings"], only_key=rule, example_limit=100000):
            if r["success"] or r["scope"] != "record" or not r["found"].get("examples"):
                continue
            why = explain({**r, "unexpected_percent": r["unexpected_percent"]})["why"]
            c = ct.get(s) or {}
            for e in r["found"]["examples"]:
                v = e.get("value")
                w.writerow([d_from.isoformat(), d_to.isoformat(), SOURCE_INFO.get(s, (s,))[0], e.get("source_rid") or "", e.get("received_day") or "", r["description"], imp.get(r["severity"], r["severity"]),
                            "(blank)" if v in (None, "") else v, why, c.get("name") or "", c.get("role") or "", c.get("email") or "", rs["version"]])
                n += 1
    return f"records-to-chase_{d_from.isoformat()}_to_{d_to.isoformat()}.csv", "\ufeff" + buf.getvalue(), n




def range_csv(cur, kind: str, date_from=None, date_to=None, source: str | None = None, rule: str | None = None) -> tuple[str, str]:
    """The same numbers as the screen, as a CSV file: counts only. Returns (file name, text)."""
    rep = range_report(cur, date_from, date_to, source, rule)
    when = rep["run"]["finished_at"].isoformat(timespec="seconds") if rep["run"] and rep["run"]["finished_at"] else ""
    ver = rep["run"]["rule_version"] if rep["run"] else ""
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    base = ["window_from", "window_to", "feed", "rule", "rule_type", "importance"]
    tail = ["rule_settings_version", "checks_run_at"]
    imp = {"critical": "Must hold", "advisory": "Worth chasing"}
    if kind == "daily":
        w.writerow(["date", "feed", "rule", "importance", "records_checked", "records_passed", "records_failed", "percent_failed"] + tail)
        run_id = _latest_run_id(cur)
        names = {(r["source"], r["rule_key"]): r for r in rep["rules"] if r["scope"] == "record"}
        if run_id:
            cur.execute("SELECT source, rule_key, day, checked, failed FROM mdm.quality_daily WHERE run_id=%s AND day BETWEEN %s AND %s ORDER BY day, source, rule_key",
                        (run_id["id"], rep["from"], rep["to"]))
            for r in cur.fetchall():
                m = names.get((r["source"], r["rule_key"]))
                if not m:
                    continue
                w.writerow([r["day"].isoformat(), m["feed"], m["description"], imp.get(m["severity"], m["severity"]), r["checked"], r["checked"] - r["failed"], r["failed"],
                            round(100.0 * r["failed"] / r["checked"], 2) if r["checked"] else "", ver, when])
        name = f"feed-quality-daily_{rep['from']}_to_{rep['to']}.csv"
    else:
        w.writerow(base + ["records_checked", "records_passed", "records_failed", "percent_failed", "allowed_percent_failed", "result"] + tail)
        for r in rep["rules"]:
            w.writerow([rep["from"], rep["to"], r["feed"], r["description"], "Record by record" if r["scope"] == "record" else "Whole feed", imp.get(r["severity"], r["severity"]),
                        "" if r["checked"] is None else r["checked"], "" if r["passed"] is None else r["passed"], "" if r["failed"] is None else r["failed"],
                        "" if r["percent_failed"] is None else r["percent_failed"], "" if r["tolerance"] is None else r["tolerance"],
                        {"passed": "Passed", "failed": "Failed", None: "No records in window"}[r["outcome"]], ver, when])
        name = f"feed-quality-summary_{rep['from']}_to_{rep['to']}.csv"
    return name, "\ufeff" + buf.getvalue()


# ---------------------------------------------------------------------------------------------------- demo helper
INCIDENTS = {"pension_batch": (9, 10), "marriage_register": (3,), "revenue_certificates": (20, 21)}      # days ago: where a feed sent many incomplete records


def spread_demo_received(cur, actor: str, days: int = 60) -> dict:
    """DEMO ONLY. The synthetic data arrived in one load, so every record shares one received date. This spreads received dates over the last
    N days so a date range and a trend can be shown: fewer records at weekends, and a few 'incident days' on which some feeds sent mostly
    incomplete records. A fixed pattern from the record number, so it repeats exactly. It changes nothing else."""
    days = max(14, min(int(days), 365))
    cur.execute("SELECT current_date AS d")
    today = cur.fetchone()["d"]
    slots = []                                                  # one slot per unit of weight, so busy days get more records
    for off in range(days):
        slots += [off] * (1 if (today - timedelta(days=off)).weekday() >= 5 else 4)
    cur.execute("""SELECT id, source, (dob IS NULL OR district IS NULL OR address IS NULL OR gender NOT IN ('M','F','T','N')) AS bad FROM mdm.source_record""")
    ids, offs = [], []
    for r in cur.fetchall():
        inc = INCIDENTS.get(r["source"])
        if inc and r["bad"] and (r["id"] * 13) % 10 < 7:
            off = inc[r["id"] % len(inc)]
        else:
            off = slots[(r["id"] * 7919) % len(slots)]
        ids.append(r["id"]); offs.append(off)
    cur.execute("""UPDATE mdm.source_record s SET received_at = date_trunc('day', now()) - make_interval(days => v.off) + make_interval(mins => (s.id * 31 %% 1000)::int)
                   FROM unnest(%s::bigint[], %s::int[]) AS v(id, off) WHERE s.id = v.id""", (ids, offs))
    n = cur.rowcount
    audit.write(cur, actor, "DEMO_RECEIVED_HISTORY", "mdm.source_record", {"records": n, "days": days, "note": "Synthetic demo data only"})
    return {"records": n, "days": days}


# ---------------------------------------------------------------------------------------------------- reading
def list_runs(cur, limit: int = 20) -> list[dict]:
    cur.execute("SELECT id, actor, started_at, finished_at, gx_version, trigger, summary FROM mdm.quality_run ORDER BY id DESC LIMIT %s", (limit,))
    return cur.fetchall()


def get_run(cur, run_id: int | None = None) -> dict | None:
    if run_id is None:
        cur.execute("SELECT * FROM mdm.quality_run WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1")
    else:
        cur.execute("SELECT * FROM mdm.quality_run WHERE id=%s", (run_id,))
    r = cur.fetchone()
    if not r:
        return None
    cur.execute("SELECT * FROM mdm.quality_result WHERE run_id=%s ORDER BY source, (CASE severity WHEN 'critical' THEN 0 ELSE 1 END), id", (r["id"],))
    res = cur.fetchall()
    for x in res:
        x["unexpected_percent"] = float(x["unexpected_percent"]) if x["unexpected_percent"] is not None else None
        x["tolerance"] = float(x["tolerance"]) if x.get("tolerance") is not None else 0.0
        x["explain"] = None if x["success"] else explain(x)
    cur.execute("SELECT summary FROM mdm.quality_run WHERE id < %s AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1", (r["id"],))
    prev = cur.fetchone()
    feeds = (r["summary"] or {}).get("feeds", {})
    for s, v in feeds.items():
        v["name"] = SOURCE_INFO.get(s, (s,))[0]
        v["previous_status"] = ((prev or {}).get("summary") or {}).get("feeds", {}).get(s, {}).get("status")
    cur.execute("SELECT id, summary FROM mdm.quality_run WHERE finished_at IS NOT NULL AND id <= %s ORDER BY id DESC LIMIT 10", (r["id"],))
    trend = {}
    for h in reversed(cur.fetchall()):
        for s_, v in ((h["summary"] or {}).get("feeds") or {}).items():
            if v.get("expectations"):
                trend.setdefault(s_, []).append(round(100.0 * v["passed"] / v["expectations"], 1))
    return {"run": {k: r[k] for k in ("id", "actor", "started_at", "finished_at", "gx_version", "trigger")}, "summary": r["summary"], "results": res, "trend": trend,
            "contacts": {c["source"]: c for c in contacts(cur)}}


if __name__ == "__main__":      # python -m app.quality   (run as a scheduled job)
    print(json.dumps(run("quality-job", "JOB"), indent=2, default=str))
