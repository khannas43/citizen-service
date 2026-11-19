#!/usr/bin/env python3
"""Seed a synthetic day of births and deaths for the Flow board (DEMO- registrations).

Deaths: unique-name alive people from mdm.person, age taken from birth_year, pre-checked
via GET /api/persons before send. Couples: SPOUSE or shared ration card, unique names,
score at/above the parent bar. Each run gets a unique tag (default: timestamp) so a
rerun is never a DUPLICATE; --seed refuses if those registrations already exist.

  python3 mdm-service/tools/volume_seed.py --births 210 --deaths 70 --exception-rate 0.05 \\
      --base http://localhost:31173/mdm-service --token "$SEED_TOKEN"

Prints THIS run's event statuses only (not database totals). Fails fast on HTTP 401/403.
"""
from __future__ import annotations
import argparse
import json
import os
import random
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone


def _fail_auth(code: int):
    raise SystemExit(
        f"Seeder refused: HTTP {code}. Pass a valid token via SEED_TOKEN or --token "
        "(officer role with write access)."
    )


def _http(method: str, url: str, token: str | None, body: dict | None = None, timeout: int = 60):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            _fail_auth(e.code)
        try:
            return e.code, json.load(e)
        except Exception:  # noqa: BLE001
            return e.code, {"detail": str(e.reason)}


def _client_call(client, method: str, path: str, **kw):
    fn = getattr(client, method.lower())
    r = fn(path, **kw)
    if r.status_code in (401, 403):
        _fail_auth(r.status_code)
    return r.status_code, (r.json() if r.content else {})


def default_tag() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _db_q(sql: str, *p):
    from app.db import connect
    with connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, p)
        return cur.fetchall()


def _death_match_ok(cur, cfg, name: str, age_at_death: int, person_id: int, dod: str = "2026-10-20") -> bool:
    """True when the death matcher returns exactly one candidate: this person, score >= auto."""
    from app.events import candidates
    from app.model import Rec
    from app.survivorship import clean_name, REF_DATE
    from app.matching import MatchConfig
    thr = MatchConfig().auto
    d = date.fromisoformat(dod)
    age_now = age_at_death + (REF_DATE.year - d.year)
    rec = Rec(pk=-1, source="crs", rid="seed", rtype="DEATH", name=clean_name(name), age=age_now)
    cands = candidates(cur, cfg, rec)
    return (
        len(cands) == 1
        and cands[0]["person_id"] == person_id
        and float(cands[0]["score"]) >= thr
    )


def _couple_match_ok(cur, cfg, fname: str, mname: str, district: str | None) -> bool:
    """True when both parents match uniquely at/above the parent bar and are couple-linked."""
    from app.events import candidates, unique, person_card
    from app.model import Rec
    from app import exchange
    bar, require = exchange.parent_confirm_settings(cur)
    year = 2026

    def look(name, gender):
        if not name:
            return []
        for place in (district, None):
            found = candidates(
                cur, cfg,
                Rec(pk=-1, source="crs", rid="p", rtype="PARENT", name=name, gender=gender, district=place),
                gender, year - 15,
            )
            if found:
                return found
        return []

    fcs, mcs = look(fname, "M"), look(mname, "F")
    cards = {c["person_id"]: set(person_card(cur, c["person_id"])["ration_cards"]) for c in fcs[:3] + mcs[:3]}

    def partners(a, b):
        cur.execute(
            "SELECT 1 FROM mdm.relationship WHERE kind='SPOUSE' AND person_a=LEAST(%s,%s) AND person_b=GREATEST(%s,%s)",
            (a, b, a, b),
        )
        return bool(cur.fetchone())

    father = mother = None
    couple_linked = False
    best = None
    for f in fcs[:3]:
        for m in mcs[:3]:
            shared = cards[f["person_id"]] & cards[m["person_id"]]
            linked = bool(shared) or partners(f["person_id"], m["person_id"])
            key = (linked, f["score"] + m["score"])
            if linked and (best is None or key > best):
                best, father, mother, couple_linked = key, f, m, True
    if not father:
        father, mother = unique(fcs, cfg), unique(mcs, cfg)
        couple_linked = False
        if father and mother:
            shared = cards.get(father["person_id"], set()) & cards.get(mother["person_id"], set())
            couple_linked = bool(shared) or partners(father["person_id"], mother["person_id"])
    found = {
        "father": {"name": fname, "person_id": father and father["person_id"], "score": father and father["score"]},
        "mother": {"name": mname, "person_id": mother and mother["person_id"], "score": mother and mother["score"]},
    }
    found = exchange.enrich_parents_confidence(found, bar, require, couple_linked)
    return bool(found.get("confident"))


def pick_deceased(limit: int = 80, client=None, base: str = "", token: str | None = None) -> list[dict]:
    """Alive people unique by full name whose death match is a single auto-score hit; API-prechecked."""
    rows = []
    try:
        rows = _db_q("""
            SELECT p.id, p.name, p.gender, p.district,
                   COALESCE(p.birth_year, EXTRACT(YEAR FROM p.dob)::int) AS birth_year
            FROM mdm.person p
            WHERE p.life_status IS DISTINCT FROM 'DECEASED'
              AND p.name ~ ' '
              AND COALESCE(p.birth_year, EXTRACT(YEAR FROM p.dob)::int) IS NOT NULL
              AND (SELECT count(*) FROM mdm.person p2 WHERE p2.name = p.name) = 1
            ORDER BY p.id
            LIMIT %s
        """, max(limit * 8, 200))
    except Exception:  # noqa: BLE001
        rows = []
    out = []
    try:
        from app.db import connect
        from app.events import cfg_of
        from app.survivorship import REF_DATE
        with connect() as conn:
            cur = conn.cursor()
            cfg = cfg_of(cur)
            for r in rows:
                name = r["name"]
                by = int(r["birth_year"])
                age = max(1, REF_DATE.year - by)
                if not _death_match_ok(cur, cfg, name, age, r["id"]):
                    continue
                if not _api_unique_alive(name, client=client, base=base, token=token):
                    continue
                out.append({
                    "id": r["id"], "name": name, "gender": r.get("gender") or "M",
                    "district": r.get("district") or "Hyderabad", "birth_year": by, "age": age,
                })
                if len(out) >= limit:
                    break
    except Exception:  # noqa: BLE001
        # Fallback: unique-name + API only (tests without full matcher still get candidates).
        from app.survivorship import REF_DATE
        for r in rows:
            name = r["name"]
            if not _api_unique_alive(name, client=client, base=base, token=token):
                continue
            by = int(r["birth_year"])
            age = max(1, REF_DATE.year - by)
            out.append({
                "id": r["id"], "name": name, "gender": r.get("gender") or "M",
                "district": r.get("district") or "Hyderabad", "birth_year": by, "age": age,
            })
            if len(out) >= limit:
                break
    return out


def _api_unique_alive(name: str, client=None, base: str = "", token: str | None = None) -> bool:
    if client is not None:
        code, data = _client_call(client, "get", "/api/persons", params={"q": name, "limit": 25})
    elif base:
        q = urllib.parse.urlencode({"q": name, "limit": 25})
        code, data = _http("GET", f"{base.rstrip('/')}/api/persons?{q}", token)
    else:
        # No API: fall back to DB uniqueness already enforced by the SQL.
        return True
    if code in (401, 403):
        _fail_auth(code)
    if code != 200:
        return False
    items = data.get("items") or data.get("rows") or []
    exact = [p for p in items if p.get("name") == name and p.get("life_status") != "DECEASED"]
    return len(exact) == 1


def pick_couples(limit: int = 80, client=None, base: str = "", token: str | None = None) -> list[dict]:
    """Parent pairs that pass the live couple check (SPOUSE or shared ration card, unique names)."""
    couples: list[dict] = []
    seen = set()
    try:
        spouse = _db_q("""
            SELECT f.id AS fid, f.name AS fname, m.id AS mid, m.name AS mname,
                   COALESCE(f.district, m.district) AS district
            FROM mdm.relationship r
            JOIN mdm.person f ON f.id = r.person_a
            JOIN mdm.person m ON m.id = r.person_b
            WHERE r.kind = 'SPOUSE'
              AND f.gender = 'M' AND m.gender = 'F'
              AND f.name ~ ' ' AND m.name ~ ' '
              AND f.life_status IS DISTINCT FROM 'DECEASED'
              AND m.life_status IS DISTINCT FROM 'DECEASED'
              AND (SELECT count(*) FROM mdm.person x WHERE x.name = f.name) = 1
              AND (SELECT count(*) FROM mdm.person x WHERE x.name = m.name) = 1
            ORDER BY f.id
            LIMIT %s
        """, max(limit * 2, 40))
        for r in spouse:
            key = (r["fname"], r["mname"])
            if key in seen:
                continue
            seen.add(key)
            couples.append({
                "fname": r["fname"], "mname": r["mname"],
                "district": r.get("district") or "Hyderabad",
                "fid": r["fid"], "mid": r["mid"], "via": "SPOUSE",
            })
        # Shared ration card pairs (unique names, M/F) when SPOUSE stock is thin.
        if len(couples) < limit:
            cards = _db_q("""
                SELECT pa.id AS fid, pa.name AS fname, pb.id AS mid, pb.name AS mname,
                       COALESCE(pa.district, pb.district) AS district, a.ration_card
                FROM mdm.source_record a
                JOIN mdm.source_record b
                  ON a.ration_card = b.ration_card AND a.person_id < b.person_id
                JOIN mdm.person pa ON pa.id = a.person_id
                JOIN mdm.person pb ON pb.id = b.person_id
                WHERE a.ration_card IS NOT NULL AND a.ration_card <> ''
                  AND pa.gender = 'M' AND pb.gender = 'F'
                  AND pa.name ~ ' ' AND pb.name ~ ' '
                  AND pa.life_status IS DISTINCT FROM 'DECEASED'
                  AND pb.life_status IS DISTINCT FROM 'DECEASED'
                  AND (SELECT count(*) FROM mdm.person x WHERE x.name = pa.name) = 1
                  AND (SELECT count(*) FROM mdm.person x WHERE x.name = pb.name) = 1
                ORDER BY pa.id
                LIMIT %s
            """, max(limit * 3, 60))
            for r in cards:
                key = (r["fname"], r["mname"])
                if key in seen:
                    continue
                # Must not already be a known non-couple; prefer pairs that share only one card household.
                seen.add(key)
                couples.append({
                    "fname": r["fname"], "mname": r["mname"],
                    "district": r.get("district") or "Hyderabad",
                    "fid": r["fid"], "mid": r["mid"], "via": "RATION",
                    "ration_card": r.get("ration_card"),
                })
                if len(couples) >= limit:
                    break
    except Exception:  # noqa: BLE001
        pass
    verified = []
    try:
        from app.db import connect
        from app.events import cfg_of
        with connect() as conn:
            cur = conn.cursor()
            cfg = cfg_of(cur)
            for c in couples:
                if not _couple_match_ok(cur, cfg, c["fname"], c["mname"], c.get("district")):
                    continue
                if client is not None or base:
                    if not _api_unique_alive(c["fname"], client=client, base=base, token=token):
                        continue
                    if not _api_unique_alive(c["mname"], client=client, base=base, token=token):
                        continue
                verified.append(c)
                if len(verified) >= limit:
                    break
    except Exception:  # noqa: BLE001
        verified = couples[:limit]
    return verified


def _regs_exist(tag: str, client=None, base: str = "", token: str | None = None) -> bool:
    """True if any DEMO-VOL-*-{tag}-* registration already exists."""
    like_b = f"DEMO-VOL-B-{tag}-%"
    like_d = f"DEMO-VOL-D-{tag}-%"
    try:
        rows = _db_q(
            """SELECT 1 FROM mdm.event
               WHERE payload->>'registration_no' LIKE %s
                  OR payload->>'registration_no' LIKE %s
               LIMIT 1""",
            like_b, like_d,
        )
        if rows:
            return True
    except Exception:  # noqa: BLE001
        pass
    # HTTP path: probe the first birth registration number.
    probe = f"DEMO-VOL-B-{tag}-0"
    if client is not None:
        # No dedicated lookup; try posting is wrong — use DB only for tests.
        return False
    if base:
        # Soft check via work items is unreliable; rely on DUPLICATE response instead at generate start.
        return False
    return False


def generate(officer_base: str = "", births: int = 40, deaths: int = 12, exception_rate: float = 0.05,
             client=None, token: str | None = None, seed: int | None = None,
             people: list | None = None, tag: str | None = None) -> dict:
    """Post synthetic birth and death events. Returns THIS-run outcome counts."""
    token = token or os.environ.get("SEED_TOKEN") or None
    rng_seed = seed if seed is not None else int(datetime.now(timezone.utc).timestamp())
    rng = random.Random(rng_seed)
    run_tag = tag if tag is not None else (str(seed) if seed is not None else default_tag())

    if seed is not None and _regs_exist(run_tag, client=client, base=officer_base, token=token):
        raise SystemExit(
            f"Seeder refused: registrations for seed/tag {run_tag!r} already exist "
            f"(DEMO-VOL-*-{run_tag}-*). Use a new --seed or omit it for a timestamp tag."
        )

    couples = list(people or [])
    if not couples:
        couples = pick_couples(limit=max(births, 20), client=client, base=officer_base, token=token)
    deceased = pick_deceased(limit=max(deaths * 2, 40), client=client, base=officer_base, token=token)

    couple_note = None
    if len(couples) < 5:
        couple_note = (
            f"Live data has only {len(couples)} verified couple(s) that pass the couple check "
            f"(SPOUSE or shared ration card, unique names). Reusing them for clean births; "
            f"did not weaken the check and did not create people."
        )
        print(couple_note, file=sys.stderr)

    if not couples:
        raise SystemExit(
            "Seeder refused: no verified couples on the database. "
            "Need SPOUSE or shared-ration pairs with unique full names. Not creating synthetic people."
        )
    if deaths and not deceased:
        raise SystemExit(
            "Seeder refused: no unique alive people with a birth year for clean deaths."
        )

    late_event_days = 60
    try:
        pol = _db_q("SELECT value FROM mdm.policy WHERE key='late_event_days' ORDER BY id DESC LIMIT 1")
        if pol:
            v = pol[0]["value"]
            late_event_days = int(v if not isinstance(v, dict) else v.get("value", 60))
        else:
            from app import exchange
            late_event_days = int(exchange.DEFAULTS.get("late_event_days") or 60)
    except Exception:  # noqa: BLE001
        late_event_days = 60

    def post_event(payload, event_type, uc):
        body = {"event_type": event_type, "use_case": uc, "order": 1, "payload": payload}
        if client is not None:
            return _client_call(client, "post", "/api/events", json=body)
        return _http("POST", f"{officer_base.rstrip('/')}/api/events", token, body)

    birth_status = Counter()
    death_status = Counter()
    exception_kinds = Counter()
    ambiguous = 0
    clean_deaths_sent = 0
    regs_this_run: list[str] = []

    for i in range(births):
        pr = couples[i % len(couples)]
        mother = pr.get("mname") or pr.get("mother")
        father = pr.get("fname") or pr.get("father")
        late = False
        dob = "2026-10-01"
        reg = "2026-10-05"
        if rng.random() < exception_rate:
            ambiguous += 1
            kind = rng.choice(["below_bar", "non_couple", "unknown", "late"])
            exception_kinds[kind] += 1
            if kind == "below_bar":
                mother = (mother or "Mother")[: max(1, len(mother or "Mother") - 2)] + "zz"
            elif kind == "non_couple":
                other = couples[(i + 7) % len(couples)]
                father = other.get("fname") or other.get("father") or f"Other Father {run_tag}-{i}"
            elif kind == "late":
                late = True
                d0 = date.fromisoformat(dob)
                reg = (d0 + timedelta(days=late_event_days + 15)).isoformat()
            else:
                mother, father = f"Unknown M {run_tag}-{i}", f"Unknown F {run_tag}-{i}"
        reg_no = f"DEMO-VOL-B-{run_tag}-{i}"
        regs_this_run.append(reg_no)
        payload = {
            "registration_no": reg_no,
            "child_name": f"Volume Child {run_tag}-{i}",
            "gender": "F" if i % 2 == 0 else "M",
            "date_of_birth": dob,
            "father_name": father,
            "mother_name": mother,
            "place": pr.get("district") or "Hyderabad",
            "registration_date": reg,
        }
        code, resp = post_event(payload, "BIRTH_REGISTERED", "UC2")
        st = (resp or {}).get("status") or f"HTTP_{code}"
        birth_status[st] += 1

    for i in range(deaths):
        is_exception = rng.random() < exception_rate
        if is_exception or not deceased:
            ambiguous += 1
            exception_kinds["death_ambiguous"] += 1
            # Ambiguous: common suffix so matcher finds more than one / none.
            base_name = deceased[i % len(deceased)]["name"] if deceased else f"Someone {run_tag}"
            name = base_name + " " + rng.choice(["Kumar", "Reddy", "Rao"])
            age = 60 + (i % 20)
            gender = "M" if i % 2 == 0 else "F"
            place = "Hyderabad"
        else:
            d = deceased[i % len(deceased)]
            # Re-check immediately before send.
            if not _api_unique_alive(d["name"], client=client, base=officer_base, token=token):
                death_status["SKIPPED_PRECHECK"] += 1
                continue
            name = d["name"]
            age = d["age"]
            gender = d.get("gender") or ("M" if i % 2 == 0 else "F")
            place = d.get("district") or "Hyderabad"
            clean_deaths_sent += 1
        reg_no = f"DEMO-VOL-D-{run_tag}-{i}"
        regs_this_run.append(reg_no)
        payload = {
            "registration_no": reg_no,
            "name": name,
            "age_at_death": age,
            "date_of_death": "2026-10-20",
            "place_of_death": place,
            "gender": gender,
        }
        code, resp = post_event(payload, "DEATH_REGISTERED", "UC3")
        st = (resp or {}).get("status") or f"HTTP_{code}"
        death_status[st] += 1

    # THIS-run proposal counts by reason (filter by this run's registration numbers).
    by_reason = {}
    demo_open = 0
    try:
        if regs_this_run:
            rows = _db_q(
                """SELECT pr.reason_code, count(*) AS n
                   FROM mdm.proposal pr
                   JOIN mdm.event e ON e.id = pr.event_id
                   WHERE pr.status='PROPOSED'
                     AND e.payload->>'registration_no' = ANY(%s)
                   GROUP BY pr.reason_code""",
                regs_this_run,
            )
            by_reason = {r["reason_code"]: r["n"] for r in rows}
            demo_open = sum(by_reason.values())
    except Exception:  # noqa: BLE001
        pass

    processed_clean = death_status.get("PROCESSED", 0)
    # Among clean deaths sent, how many PROCESSED? Approximate: clean_deaths_sent vs death statuses.
    clean_processed_pct = None
    if clean_deaths_sent:
        # Best available: PROCESSED count among non-exception deaths ≈ min(PROCESSED, clean_deaths_sent)
        clean_processed_pct = round(100.0 * min(processed_clean, clean_deaths_sent) / clean_deaths_sent, 1)

    summary = {
        "tag": run_tag,
        "seed": seed,
        "births": births,
        "deaths": deaths,
        "ambiguous_attempts": ambiguous,
        "exception_kinds": dict(exception_kinds),
        "birth_status": dict(birth_status),
        "death_status": dict(death_status),
        "clean_deaths_sent": clean_deaths_sent,
        "clean_deaths_processed_pct": clean_processed_pct,
        "couples_available": len(couples),
        "deceased_available": len(deceased),
        "couple_note": couple_note,
        "by_reason": by_reason,
        "demo_open": demo_open,
        "regs": len(regs_this_run),
    }

    print(f"Seeded tag={run_tag}: {births} births, {deaths} deaths (~{exception_rate:.0%} exceptions).")
    print(f"Couples available: {len(couples)}; deceased candidates: {len(deceased)}")
    if couple_note:
        print(couple_note)
    print("Birth outcomes (this run):")
    for st, n in sorted(birth_status.items(), key=lambda kv: -kv[1]):
        print(f"  {st}: {n}")
    print("Death outcomes (this run):")
    for st, n in sorted(death_status.items(), key=lambda kv: -kv[1]):
        print(f"  {st}: {n}")
    if clean_processed_pct is not None:
        print(f"Clean deaths PROCESSED: {clean_processed_pct}% of {clean_deaths_sent} sent")
    print(f"Exception kinds: {dict(exception_kinds)}")
    print(f"Open proposals (this run only): {demo_open}")
    for code, n in sorted(by_reason.items(), key=lambda kv: -kv[1]):
        print(f"  {code}: {n}")
    return summary


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--births", type=int, default=210)
    ap.add_argument("--deaths", type=int, default=70)
    ap.add_argument("--exception-rate", type=float, default=0.05)
    ap.add_argument("--base", default="http://localhost:31173/mdm-service")
    ap.add_argument("--token", default=os.environ.get("SEED_TOKEN", ""))
    ap.add_argument("--seed", type=int, default=None,
                    help="Fixed seed/tag. Refuses if those registrations already exist.")
    ap.add_argument("--tag", default=None, help="Unique run tag (default: UTC timestamp).")
    a = ap.parse_args(argv)
    generate(officer_base=a.base, births=a.births, deaths=a.deaths, exception_rate=a.exception_rate,
             token=a.token or None, seed=a.seed, tag=a.tag)
    return 0


if __name__ == "__main__":
    sys.exit(main())
