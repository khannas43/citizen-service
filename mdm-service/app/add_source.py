"""Add the water board feed to a live registry without reloading it, and fill in addresses a department already holds.
   python -m app.add_source water_board [--count 1000] [--remove]
   python -m app.add_source addresses
The full loader rebuilds every person and discards steward decisions, so it must not be used to add a feed.
Every scheme, tariff and amount below is illustrative demonstration data."""
from __future__ import annotations
import argparse, json, random, zlib
from datetime import date, timedelta

from .db import connect, STATE
from .matching import prepare
from .model import Rec
from . import audit, store, events, workqueue
from .sources import SOURCE_INFO
from .survivorship import REF_DATE

SOURCE = "water_board"
SYSTEM = "water"
MAPPING = {"consumer_name": "name", "service_no": "identity_reference", "address_text": "address", "district": "district"}
NOTE = "Illustrative scheme for demonstration"
SCHEMES = {"ALLOWANCE": ("WSUB-01", "Free Household Water Allowance", "FREE_ALLOWANCE"),
           "SENIOR": ("WSUB-02", "Senior Citizen Water Rebate", "REBATE"),
           "WAIVER": ("WSUB-03", "Connection Fee Waiver for Low-income Households", "FEE_WAIVER")}
FREE_KL = 20
BUSINESSES = ["Sri Lakshmi Tiffins", "Balaji Provision Store", "New Style Tailors", "Hotel Annapurna", "Vijaya Medical Hall", "Sai Ram Fabrications",
              "Modern Kirana", "Ganesh Cycle Works", "Venkateswara Bakery", "Royal Function Hall"]
METER_MAKES = ["Aquameter", "Kranti Meters", "Hydro-Flow", "Jal-Mapan"]

NEW_PEOPLE = [("Lakshmi Bai Jadhav", "Adilabad", "Utnoor", "12 Tribal Colony, Utnoor"), ("Narsimha Chary Podeti", "Nalgonda", "Miryalaguda", "4-17 Station Road, Miryalaguda"),
              ("Shaik Imtiaz Pasha", "Hyderabad", "Charminar", "22 Moghalpura, Charminar"), ("Bhagya Rekha Nalla", "Warangal", "Hanamkonda", "9 Kakatiya Nagar, Hanamkonda"),
              ("Venkatamma Gaddam", "Mahabubnagar", "Jadcherla", "3-8 Bus Stand Road, Jadcherla"), ("Mohd Abdul Rahman Syed", "Nizamabad", "Bodhan", "15 Fort Road, Bodhan"),
              ("Padma Vemula", "Khammam", "Wyra", "6-2 Main Road, Wyra"), ("Yellaiah Gouni", "Medak", "Narsapur", "1-44 Temple Street, Narsapur")]

# sign-in people get a connection that tells a clear story; the rest are drawn at random
DEMO = {16946: dict(kind="HOUSEHOLD", metered=True, schemes=["ALLOWANCE"], pattern="late", status="ACTIVE", units=[14, 16, 18, 22, 19, 17]),
        16941: dict(kind="HOUSEHOLD", metered=True, schemes=["SENIOR"], pattern="arrears", status="ACTIVE", units=[10, 11, 9, 12, 10, 11]),
        16958: dict(kind="HOUSEHOLD", metered=False, schemes=["WAIVER", "ALLOWANCE"], pattern="good", status="ACTIVE", units=None)}


def _js(x):
    return json.dumps(x, default=str, ensure_ascii=False)


def _initialled(name: str) -> str:
    parts = name.split()
    return f"{parts[0][0]}. {' '.join(parts[1:])}" if len(parts) > 1 else name


def _misspelt(name: str, rnd: random.Random) -> str:
    for a, b in rnd.sample([("a", "aa"), ("ee", "i"), ("sh", "s"), ("v", "w"), ("th", "t")], 5):
        if a in name.lower():
            i = name.lower().index(a)
            return name[:i] + b + name[i + len(a):]
    return name


def _charge(units: int, commercial: bool) -> tuple[float, float]:
    volume = min(units, 10) * 8 + max(min(units, 20) - 10, 0) * 12 + max(units - 20, 0) * 18
    fixed = 50.0
    k = 2.5 if commercial else 1.0
    return round(volume * k, 2), round(fixed * k, 2)


def _month_end(y: int, m: int) -> date:
    return date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)


def _periods() -> list[tuple[str, date, date]]:
    """Six monthly bills, December 2025 to May 2026, each issued on the 5th of the next month and due 15 days later."""
    out = []
    for y, m in [(2025, 12), (2026, 1), (2026, 2), (2026, 3), (2026, 4), (2026, 5)]:
        issued = date(y + (m == 12), m % 12 + 1, 5)
        out.append((f"{y}-{m:02d}", issued, issued + timedelta(days=15)))
    return out


def _connection(rnd: random.Random, i: int, holder: str, address: str, district: str, mandal: str, age_hint: int | None, spec: dict | None) -> dict:
    """One connection with its meter, six bills and any subsidy claims."""
    spec = spec or {}
    r = rnd.random()
    kind = spec.get("kind") or ("HOUSEHOLD" if r < 0.86 else "COMMERCIAL" if r < 0.96 else "INSTITUTION")
    commercial = kind != "HOUSEHOLD"
    metered = spec["metered"] if "metered" in spec else rnd.random() < 0.8
    sn = f"WTR-{i:06d}"
    connected = date(rnd.randint(2008, 2024), rnd.randint(1, 12), rnd.randint(1, 28))
    pin = f"50{zlib.crc32(district.encode()) % 10}{rnd.randint(100, 999)}"
    entity = holder if kind == "HOUSEHOLD" else (rnd.choice(BUSINESSES) if kind == "COMMERCIAL" else f"{mandal} Government School")
    conn = {"service_no": sn, "consumer_name": holder, "entity_name": entity, "entity_type": kind, "connection_type": "COMMERCIAL" if commercial else "DOMESTIC",
            "pipe_size_mm": 25 if commercial else 15, "connected_on": connected.isoformat(), "address_text": address, "district": district, "mandal": mandal,
            "pincode": pin, "meter_status": "METERED" if metered else "UNMETERED", "connection_status": "ACTIVE", "tariff_note": "Illustrative tariff"}
    if metered:
        conn.update({"meter_no": f"WM-{rnd.randint(1000000, 9999999)}", "meter_make": rnd.choice(METER_MAKES), "meter_installed_on": (connected + timedelta(days=rnd.randint(0, 30))).isoformat()})
    schemes = list(spec.get("schemes") or [])
    if not spec and not commercial:
        if metered and rnd.random() < 0.55:
            schemes.append("ALLOWANCE")
        if (age_hint and age_hint >= 60 and rnd.random() < 0.7) or rnd.random() < 0.06:
            schemes.append("SENIOR")
        if rnd.random() < 0.12:
            schemes.append("WAIVER")
    pattern = spec.get("pattern") or rnd.choices(["good", "late", "arrears"], [75, 15, 10])[0]
    units_in = spec.get("units")
    bills, today = [], REF_DATE
    for n, (period, issued, due) in enumerate(_periods()):
        units = 15 if not metered else (units_in[n] if units_in else rnd.choice([6, 8, 10, 12, 14, 16, 18, 20, 24, 28]))
        volume, fixed = _charge(units, commercial)
        gross = volume + fixed
        waived = 0.0
        if "ALLOWANCE" in schemes:
            waived += min(_charge(min(units, FREE_KL), commercial)[0], volume)
        if "SENIOR" in schemes:
            waived += round((gross - waived) * 0.5, 2)
        payable = round(max(gross - waived, 0), 2)
        b = {"service_no": sn, "bill_no": f"BL-{sn[4:]}-{period.replace('-', '')}", "period": period, "issued_on": issued.isoformat(), "due_on": due.isoformat(),
             "units_kl": units, "volume_charge": volume, "fixed_charge": fixed, "gross_amount": gross, "subsidy_waived": round(waived, 2), "amount_payable": payable,
             "paid_amount": 0.0, "paid_on": None, "payment_mode": None, "receipt_no": None, "status": "UNPAID"}
        unpaid_from = 6 - (3 if pattern == "arrears" and spec.get("status") != "ACTIVE" else 1 if pattern == "arrears" else 0)
        if n < unpaid_from or payable == 0:
            late = pattern == "late" and n in (2, 4)
            paid_on = min(due + timedelta(days=rnd.randint(3, 20)) if late else issued + timedelta(days=rnd.randint(1, 14)), today - timedelta(days=1))
            partial = pattern == "late" and n == 4
            amt = round(payable * (0.5 if partial else 1), 2)
            b.update({"paid_amount": amt, "paid_on": paid_on.isoformat(), "payment_mode": rnd.choice(["UPI", "ONLINE", "COUNTER"]), "receipt_no": f"RCT-{sn[4:]}-{period.replace('-', '')}",
                      "status": "PARTIAL" if partial else "PAID"})
        bills.append(b)
    if pattern == "arrears" and not spec and rnd.random() < 0.3:
        conn["connection_status"] = "DISCONNECTED"
    subs = []
    for key in schemes:
        code, name, btype = SCHEMES[key]
        if key == "WAIVER":
            subs.append({"service_no": sn, "claim_id": f"{sn}-S{len(subs) + 1}", "scheme_code": code, "scheme_name": name, "benefit_type": btype, "from": connected.isoformat(), "to": connected.isoformat(),
                         "amount_waived": float(rnd.choice([1500, 2000, 2500, 3000])), "status": "GRANTED", "note": NOTE})
        else:
            waived = round(sum(b["subsidy_waived"] for b in bills), 2)
            subs.append({"service_no": sn, "claim_id": f"{sn}-S{len(subs) + 1}", "scheme_code": code, "scheme_name": name, "benefit_type": btype, "from": bills[0]["issued_on"],
                         "to": bills[-1]["issued_on"], "amount_waived": waived, "status": "ACTIVE", "note": NOTE})
    return {"conn": conn, "bills": bills, "subs": subs}


def _sample(cur, count: int) -> list[dict]:
    """Water connections for people already in the registry, plus a few households it has never seen. Sign-in people and anyone with a consent or event are handled apart."""
    rnd = random.Random(2026)
    cur.execute("""SELECT p.id, p.name, p.birth_year, r.address, r.district, r.mandal FROM mdm.person p
                   JOIN LATERAL (SELECT address, district, mandal FROM mdm.source_record WHERE person_id=p.id AND address IS NOT NULL AND district IS NOT NULL
                                 AND source IN ('pds_view','electricity','revenue_certificates') ORDER BY id LIMIT 1) r ON true
                   WHERE p.life_status <> 'DECEASED' AND p.source_count >= 2 AND p.name ~ '^[A-Za-z .]+$' AND position(' ' in p.name) > 0
                     AND NOT EXISTS (SELECT 1 FROM mdm.citizen_link c WHERE c.person_id=p.id)
                     AND NOT EXISTS (SELECT 1 FROM mdm.consent c WHERE c.person_id=p.id OR c.subject_person_id=p.id)
                     AND NOT EXISTS (SELECT 1 FROM mdm.event e WHERE e.person_id=p.id)
                   ORDER BY md5(p.id::text) LIMIT %s""", (count - len(NEW_PEOPLE) - len(DEMO),))
    rows = []
    for p in cur.fetchall():
        roll = rnd.random()
        name = p["name"] if roll < 0.87 else _initialled(p["name"]) if roll < 0.95 else _misspelt(p["name"], rnd)
        age = (REF_DATE.year - p["birth_year"]) if p["birth_year"] else None
        rows.append({"name": name, "district": p["district"], "mandal": p["mandal"], "address": p["address"], "age": age, "person": None, "spec": None})
    for nm, dist, mand, addr in NEW_PEOPLE:
        rows.append({"name": nm, "district": dist, "mandal": mand, "address": addr, "age": None, "person": None, "spec": None})
    for pid, spec in DEMO.items():
        cur.execute("SELECT name, birth_year, address, district, mandal FROM mdm.person WHERE id=%s", (pid,))
        p = cur.fetchone()
        if p and p["address"]:
            rows.append({"name": p["name"], "district": p["district"], "mandal": p["mandal"], "address": p["address"], "age": (REF_DATE.year - p["birth_year"]) if p["birth_year"] else None,
                         "person": pid, "spec": spec})
    rnd.shuffle(rows)
    for i, r in enumerate(rows, start=1):
        r["bundle"] = _connection(rnd, i, r["name"], r["address"], r["district"], r["mandal"], r["age"], r["spec"])
    return rows


def add(cur, count: int = 1000, actor: str = "loader") -> dict:
    cur.execute("SELECT count(*) AS n FROM mdm.source_record WHERE source=%s", (SOURCE,))
    if cur.fetchone()["n"]:
        raise SystemExit("The water board feed is already loaded. Run with --remove first to load it again.")
    rows = _sample(cur, count)
    cfg = events.cfg_of(cur)
    cur.execute("INSERT INTO mdm.load_run (rule_version) VALUES ((SELECT max(version) FROM mdm.rule_set WHERE active)) RETURNING id")
    load_id = cur.fetchone()["id"]
    touched, tally, reviews, n_bills, n_subs = set(), {"AUTO_LINKED": 0, "IN_REVIEW": 0, "NEW": 0}, [], 0, 0
    sql = """INSERT INTO mdm.source_record (source, source_rid, rtype, name, district, mandal, address, as_of, payload, parents, person_id, link_status, score,
             reason, evidence, load_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,'[]'::jsonb,%s,%s,%s,%s,%s::jsonb,%s)"""
    for r in rows:
        c, bills, subs = r["bundle"]["conn"], r["bundle"]["bills"], r["bundle"]["subs"]
        status, pid, score, ev, why = "AUTO_LINKED", r["person"], 1.0, {}, "Linked by the department's own reference token" if r["person"] else None
        if pid is None:
            rec = Rec(pk=0, source=SOURCE, rid=c["service_no"], rtype="CONNECTION", name=c["consumer_name"], district=c["district"], mandal=c["mandal"], address=c["address_text"], raw=c)
            prepare(rec)
            cands = events.candidates(cur, cfg, rec, limit=3)
            top = events.unique(cands, cfg) if cands and cands[0]["score"] >= cfg.auto else None
            if top:
                pid, score, ev, why = top["person_id"], top["score"], top["evidence"], None
            elif cands and cands[0]["score"] >= cfg.review:
                status, score, ev, why = "IN_REVIEW", cands[0]["score"], cands[0]["evidence"], "a close match, but not certain enough to link without a steward"
            else:
                status, score = "NEW", 0.0
        if pid is None:
            cur.execute("SELECT nextval('mdm.person_id_seq') AS i")
            pid = cur.fetchone()["i"]
            cur.execute("INSERT INTO mdm.person (id, mdm_id) VALUES (%s,%s)", (pid, f"MDM-{pid:08d}"))
        cur.execute(sql + " RETURNING id", (SOURCE, c["service_no"], "CONNECTION", c["consumer_name"], c["district"], c["mandal"], c["address_text"], None, _js(c), pid, status,
                                             round(score, 4), why, _js(ev), load_id))
        rid = cur.fetchone()["id"]
        tally[status] += 1
        touched.add(pid)
        if status == "IN_REVIEW":                          # bills follow the connection once a steward decides who it belongs to
            reviews.append((rid, _js([{"person_id": x["person_id"], "score": x["score"], "evidence": x["evidence"]} for x in cands])))
            continue
        kids = [(SOURCE, b["bill_no"], "BILL", c["consumer_name"], None, None, None, b["issued_on"], _js(b), pid, "AUTO_LINKED", 1.0,
                 f"Bill for connection {c['service_no']}", "{}", load_id) for b in bills]
        kids += [(SOURCE, s["claim_id"], "SUBSIDY", c["consumer_name"], None, None, None, s["from"], _js(s), pid, "AUTO_LINKED", 1.0,
                  f"Subsidy claim on connection {c['service_no']}", "{}", load_id) for s in subs]
        cur.executemany(sql, kids)
        n_bills += len(bills)
        n_subs += len(subs)
    cur.executemany("INSERT INTO mdm.review_task (record_id, candidates) VALUES (%s, %s::jsonb)", reviews)
    workqueue.apply_review_classification(cur)
    for pid in touched:
        store.rebuild_person(cur, pid)
    store.derive_relationships(cur, sorted(touched))
    nm, iface, _h = SOURCE_INFO[SOURCE]
    cur.execute("INSERT INTO mdm.connector (source, name, system, interface, auth_method, schedule, mapping, status, created_by) "
                "VALUES (%s,%s,%s,%s,'OAUTH_CLIENT','Daily',%s::jsonb,'ACTIVE','system') ON CONFLICT DO NOTHING RETURNING id", (SOURCE, nm, SYSTEM, iface, _js(MAPPING)))
    cn = cur.fetchone()
    if cn:
        cur.execute("INSERT INTO mdm.connector_log (connector_id, actor, action, detail) VALUES (%s,'system','REGISTERED',%s::jsonb)", (cn["id"], _js({"note": "Feed registered at load"})))
    stats = {"source": SOURCE, "connections": len(rows), "bills": n_bills, "subsidy_claims": n_subs, "links": tally, "review_tasks": len(reviews), "people_touched": len(touched)}
    cur.execute("UPDATE mdm.load_run SET finished_at=now(), stats=%s::jsonb WHERE id=%s", (_js(stats), load_id))
    audit.write(cur, actor, "ADD_SOURCE", f"load_run:{load_id}", stats)
    return stats


def remove(cur, actor: str = "loader") -> dict:
    cur.execute("SELECT DISTINCT person_id FROM mdm.source_record WHERE source=%s", (SOURCE,))
    pids = [r["person_id"] for r in cur.fetchall()]
    cur.execute("DELETE FROM mdm.source_record WHERE source=%s", (SOURCE,))
    cur.execute("DELETE FROM mdm.connector WHERE source=%s AND created_by='system'", (SOURCE,))
    gone = 0
    for pid in pids:
        cur.execute("SELECT 1 FROM mdm.source_record WHERE person_id=%s LIMIT 1", (pid,))
        if cur.fetchone():
            store.rebuild_person(cur, pid)
        else:
            cur.execute("DELETE FROM mdm.person WHERE id=%s", (pid,))
            gone += 1
    audit.write(cur, actor, "REMOVE_SOURCE", f"source:{SOURCE}", {"people_removed": gone, "people_refreshed": len(pids) - gone})
    return {"people_removed": gone, "people_refreshed": len(pids) - gone}


def enrich_addresses(cur, actor: str = "loader") -> dict:
    """Rebuild the master record of anyone who has no street address although a department holds one."""
    cur.execute("SELECT p.id FROM mdm.person p WHERE (p.address IS NULL OR p.address='') AND EXISTS "
                "(SELECT 1 FROM mdm.source_record r WHERE r.person_id=p.id AND r.address IS NOT NULL AND r.address<>'')")
    ids = [r["id"] for r in cur.fetchall()]
    for pid in ids:
        store.rebuild_person(cur, pid)
    cur.execute("SELECT count(*) AS n FROM mdm.person WHERE address IS NULL OR address=''")
    left = cur.fetchone()["n"]
    audit.write(cur, actor, "ENRICH_ADDRESSES", "person:addresses", {"rebuilt": len(ids), "still_without_address": left})
    return {"rebuilt": len(ids), "still_without_address": left}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=[SOURCE, "addresses"])
    ap.add_argument("--count", type=int, default=1000)
    ap.add_argument("--remove", action="store_true")
    a = ap.parse_args()
    with connect(STATE) as conn:
        cur = conn.cursor()
        out = enrich_addresses(cur) if a.what == "addresses" else remove(cur) if a.remove else add(cur, a.count)
        conn.commit()
    print(json.dumps(out, indent=2))
