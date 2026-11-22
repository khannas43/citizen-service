"""Richer department data for the demo: each department's own record gets fuller details, and the dated history under it (bills, ration drawn,
pension payments, instalments, benefits received) goes into mdm.dept_entry. Nothing here touches matching, quality checks or record counts.
   python -m app.dept_data load [--only electricity,pds_view]
   python -m app.dept_data remove
Every scheme, tariff, rate and amount is illustrative demonstration data."""
from __future__ import annotations
import argparse, json, random, zlib
from datetime import date, timedelta

from .db import connect, STATE
from . import audit
from .survivorship import REF_DATE

NOTE = "Illustrative scheme for demonstration"
BILL_MONTHS = [(2025, 12), (2026, 1), (2026, 2), (2026, 3), (2026, 4), (2026, 5)]
SOURCES = ("electricity", "pds_view", "pension_batch", "student_portal", "housing", "revenue_certificates", "revenue_land", "marriage_register")


def _js(x):
    return json.dumps(x, default=str, ensure_ascii=False)


def _rng(source: str, rid: str) -> random.Random:
    return random.Random(f"{source}:{rid}")


def _pin(district: str, rnd: random.Random) -> str:
    return f"50{zlib.crc32((district or '').encode()) % 10}{rnd.randint(100, 999)}"


def _d(s) -> date | None:
    try:
        return date.fromisoformat(str(s)[:10])
    except (TypeError, ValueError):
        return None


def issue_dates(y: int, m: int) -> tuple[date, date]:
    issued = date(y + (m == 12), m % 12 + 1, 5)
    return issued, issued + timedelta(days=15)


def settle(rnd: random.Random, pattern: str, n: int, total: int, issued: date, due: date, payable: float, tag: str, spec_active: bool = False) -> dict:
    """How one bill was paid: on time, late, part paid, or not yet. 'arrears' leaves the last bill (or three) unpaid."""
    out = {"paid_amount": 0.0, "paid_on": None, "payment_mode": None, "receipt_no": None, "status": "UNPAID"}
    unpaid_from = total - (1 if pattern == "arrears" and spec_active else 3 if pattern == "arrears" else 0)
    if n < unpaid_from or payable == 0:
        late = pattern == "late" and n in (2, 4)
        paid_on = min(due + timedelta(days=rnd.randint(3, 20)) if late else issued + timedelta(days=rnd.randint(1, 14)), REF_DATE - timedelta(days=1))
        partial = pattern == "late" and n == 4
        out.update({"paid_amount": round(payable * (0.5 if partial else 1), 2), "paid_on": paid_on.isoformat(), "payment_mode": rnd.choice(["UPI", "ONLINE", "COUNTER"]),
                    "receipt_no": f"RCT-{tag}", "status": "PARTIAL" if partial else "PAID"})
    return out


def pattern_of(rnd: random.Random) -> str:
    return rnd.choices(["good", "late", "arrears"], [78, 14, 8])[0]


class Writer:
    def __init__(self, cur):
        self.cur, self.entries, self.patches = cur, [], []

    def entry(self, person_id, source, parent, kind, period, when, amount, payload):
        self.entries.append((person_id, source, parent, kind, period, when, amount, _js(payload)))

    def patch(self, record_id, extra: dict):
        self.patches.append((_js(extra), record_id))

    def flush(self):
        self.cur.executemany("INSERT INTO mdm.dept_entry (person_id, source, parent_rid, kind, period, entry_date, amount, payload) VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb)", self.entries)
        self.cur.executemany("UPDATE mdm.source_record SET payload = payload || %s::jsonb WHERE id=%s", self.patches)
        n = (len(self.entries), len(self.patches))
        self.entries, self.patches = [], []
        return n


def _records(cur, source: str, rtypes: tuple | None = None):
    sql = "SELECT id, person_id, source_rid, rtype, name, address, district, mandal, village, as_of, ration_card, relation, payload FROM mdm.source_record WHERE source=%s"
    args: list = [source]
    if rtypes:
        sql += " AND rtype = ANY(%s)"
        args.append(list(rtypes))
    cur.execute(sql + " ORDER BY id", args)
    return cur.fetchall()


# ------------------------------------------------------------------ electricity
def electricity(cur, w: Writer):
    makes = ["Secure", "Genus", "HPL", "L&T"]
    for r in _records(cur, "electricity"):
        p, rnd, sn = r["payload"], _rng("electricity", r["source_rid"]), r["source_rid"]
        domestic = (p.get("category") or "DOMESTIC") == "DOMESTIC"
        kw = float(p.get("load_kw") or 1)
        connected = date(rnd.randint(2005, 2024), rnd.randint(1, 12), rnd.randint(1, 28))
        w.patch(r["id"], {"account_no": sn, "tariff_category": "LT-I Domestic" if domestic else "LT-II Commercial", "phase": "SINGLE" if kw <= 5 else "THREE", "meter_no": f"EM-{rnd.randint(1000000, 9999999)}",
                          "meter_make": rnd.choice(makes), "connected_on": connected.isoformat(), "pincode": _pin(r["district"], rnd), "security_deposit": round(kw * 300, 2),
                          "billing_cycle": "MONTHLY", "tariff_note": "Illustrative tariff"})
        units = [int(x) for x in str(p.get("units_last_6_months") or "").split() if x.isdigit()]
        units = (units + [rnd.randint(60, 180) for _ in range(6)])[:6]
        enrolled = domestic and sum(units) / 6 <= 200 and rnd.random() < 0.6
        pattern, bills = pattern_of(rnd), []
        for n, ((y, m), u) in enumerate(zip(BILL_MONTHS, units)):
            issued, due = issue_dates(y, m)
            energy = round((min(u, 100) * 2.5 + max(min(u, 200) - 100, 0) * 3.5 + max(u - 200, 0) * 5.5) if domestic else u * 7.5, 2)
            fixed = round(kw * (10 if domestic else 30), 2)
            gross = round(energy + fixed, 2)
            waived = round(min(u, 100) * 2.5, 2) if enrolled else 0.0
            payable = round(max(gross - waived, 0), 2)
            b = {"bill_no": f"EB-{sn[5:]}-{y}{m:02d}", "period": f"{y}-{m:02d}", "issued_on": issued.isoformat(), "due_on": due.isoformat(), "units": u, "energy_charge": energy,
                 "fixed_charge": fixed, "gross_amount": gross, "subsidy_waived": waived, "amount_payable": payable}
            b.update(settle(rnd, pattern, n, 6, issued, due, payable, f"{sn[5:]}-{y}{m:02d}"))
            bills.append(b)
            w.entry(r["person_id"], "electricity", sn, "BILL", b["period"], issued, payable, b)
        if enrolled:
            w.entry(r["person_id"], "electricity", sn, "BENEFIT", None, _d(bills[0]["issued_on"]), round(sum(b["subsidy_waived"] for b in bills), 2),
                    {"scheme_code": "ESUB-01", "scheme_name": "Free Units for Low-consumption Households", "benefit_type": "FREE_UNITS", "from": bills[0]["issued_on"], "to": bills[-1]["issued_on"],
                     "status": "ACTIVE", "note": NOTE})


# ------------------------------------------------------------------ civil supplies
def pds(cur, w: Writer):
    cards: dict[str, list] = {}
    for r in _records(cur, "pds_view", ("CARD_MEMBER",)):
        if r["ration_card"]:
            cards.setdefault(r["ration_card"], []).append(r)
    for card, members in cards.items():
        rnd = _rng("pds_view", card)
        head = next((m for m in members if (m["relation"] or "").lower() == "head"), members[0])
        ctype = head["payload"].get("card_type") or "WHITE"
        n = len(members)
        fps = f"FPS-{(head['district'] or 'XXX')[:3].upper()}-{rnd.randint(1000, 9999)}"
        fps_name = f"Fair Price Shop {rnd.randint(1, 60)}, {head['mandal'] or head['district']}"
        issued = date(rnd.randint(2012, 2024), rnd.randint(1, 12), rnd.randint(1, 28))
        entitled = 35.0 if ctype == "AAY" else 5.0 * n
        for m in members:
            w.patch(m["id"], {"fps_code": fps, "fps_name": fps_name, "card_issued_on": issued.isoformat(), "members_on_card": n, "rice_entitlement_kg": entitled,
                              "card_head": head["name"], "card_status": "ACTIVE", "rate_note": "Illustrative rates"})
        total_sub = 0.0
        for k, (y, mth) in enumerate(BILL_MONTHS):
            roll = rnd.random()
            drawn = entitled if roll < 0.82 else round(entitled * 0.6, 1) if roll < 0.94 else 0.0
            sugar = 1.0 if ctype == "AAY" and drawn else 0.0
            paid = round(drawn * 1.0, 2)
            market = round(drawn * 38 + sugar * 42, 2)
            sub = round(market - paid, 2)
            total_sub += sub
            when = date(y + (mth == 12), mth % 12 + 1, rnd.randint(2, 14)) if drawn else None
            w.entry(head["person_id"], "pds_view", card, "RATION_DRAW", f"{y}-{mth:02d}", when, paid,
                    {"card_no": card, "period": f"{y}-{mth:02d}", "entitled_rice_kg": entitled, "drawn_rice_kg": drawn, "sugar_kg": sugar, "amount_paid": paid, "market_value": market,
                     "subsidy_value": sub, "fps_code": fps, "authentication": rnd.choice(["BIOMETRIC", "BIOMETRIC", "OTP"]) if drawn else None, "drawn_on": when.isoformat() if when else None,
                     "status": "ISSUED" if drawn == entitled else "PART_ISSUED" if drawn else "NOT_DRAWN"})
        scheme = {"AAY": "Antyodaya Anna Ration Subsidy", "PHH": "Priority Household Ration Subsidy"}.get(ctype, "State Ration Subsidy")
        w.entry(head["person_id"], "pds_view", card, "BENEFIT", None, _d("2025-12-05"), round(total_sub, 2),
                {"scheme_code": "PSUB-" + ctype, "scheme_name": scheme, "benefit_type": "FOOD_SUBSIDY", "from": "2025-12-05", "to": "2026-06-05", "status": "ACTIVE", "note": NOTE})


# ------------------------------------------------------------------ pension
BANKS = ["State Bank of India", "Andhra Pragathi Grameena Bank", "Telangana Grameena Bank", "India Post Payments Bank"]


def pension(cur, w: Writer):
    default_amt = {"OLD_AGE": 2016, "WIDOW": 2016, "DISABLED": 4016}
    names = {"OLD_AGE": "Old Age Pension", "WIDOW": "Widow Pension", "DISABLED": "Disability Pension"}
    for r in _records(cur, "pension_batch", ("PENSIONER",)):
        p, rnd, pid = r["payload"], _rng("pension_batch", r["source_rid"]), r["source_rid"]
        scheme = p.get("scheme") or "OLD_AGE"
        scheme = scheme if scheme in names else "OLD_AGE"
        amt = float(p.get("monthly_amount") or default_amt[scheme])
        mode = rnd.choice(["BANK", "BANK", "POST"])
        sanctioned = date(rnd.randint(2015, 2024), rnd.randint(1, 12), 1)
        stopped = (p.get("status") or "").startswith("STOPPED")
        w.patch(r["id"], {"pension_no": pid, "scheme_name": names[scheme], "payment_mode": mode, "bank_name": BANKS[3] if mode == "POST" else rnd.choice(BANKS[:3]),
                          "account_masked": f"XXXXXX{rnd.randint(1000, 9999)}", "sanctioned_on": sanctioned.isoformat(), "life_certificate_due": date(2026, rnd.choice([9, 10, 11, 12]), 30).isoformat(),
                          "aadhaar_seeded": "Y"})
        for k in range(6):
            y, mth = (2026, k + 1)
            when = date(y, mth, 1)
            status, paid_on = "PAID", when
            if stopped and k >= 3:
                status, paid_on = "STOPPED", None
            elif rnd.random() < 0.04:
                status, paid_on = "ON_HOLD", None
            w.entry(r["person_id"], "pension_batch", pid, "PENSION_PAYMENT", f"{y}-{mth:02d}", when, amt if status == "PAID" else 0,
                    {"pension_no": pid, "period": f"{y}-{mth:02d}", "amount": amt, "paid_on": paid_on.isoformat() if paid_on else None, "mode": mode, "reference": f"PMT-{pid[3:]}-{y}{mth:02d}",
                     "status": status, "note": {"ON_HOLD": "Life certificate pending", "STOPPED": "Stopped after death was registered"}.get(status)})
        w.entry(r["person_id"], "pension_batch", pid, "BENEFIT", None, sanctioned, amt,
                {"scheme_code": f"PEN-{scheme}", "scheme_name": names[scheme], "benefit_type": "MONTHLY_PENSION", "from": sanctioned.isoformat(), "to": None,
                 "status": "STOPPED" if stopped else "ACTIVE", "note": NOTE})


# ------------------------------------------------------------------ education
FEES = {"Intermediate": 12000, "B.Com": 25000, "B.Sc": 28000, "B.A": 20000, "B.Tech": 60000, "Diploma": 30000}


def education(cur, w: Writer):
    for r in _records(cur, "student_portal", ("STUDENT",)):
        p, rnd, sid = r["payload"], _rng("student_portal", r["source_rid"]), r["source_rid"]
        fee = float(FEES.get(p.get("course"), 25000))
        applied = p.get("scholarship_applied") == "Y"
        scheme = "Post-matric Scholarship" if fee < 40000 else "Fee Reimbursement for Professional Courses"
        extra = {"academic_year": "2025-26", "course_fee": fee, "institution_type": rnd.choice(["Government", "Aided", "Private"]), "roll_no": f"RN-{rnd.randint(100000, 999999)}"}
        if applied:
            sanctioned = round(fee * 0.8, 2)
            extra.update({"scholarship_scheme": scheme, "sanctioned_amount": sanctioned, "scholarship_status": "SANCTIONED"})
            w.patch(r["id"], extra)
            shares = [("Term 1", date(2025, 9, 15)), ("Term 2", date(2026, 2, 10))]
            released = 0.0
            for k, (term, due) in enumerate(shares):
                done = k == 0 or rnd.random() < 0.8
                amt = round(sanctioned / 2, 2)
                released += amt if done else 0
                w.entry(r["person_id"], "student_portal", sid, "INSTALMENT", f"2025-26 {term}", due if done else None, amt if done else 0,
                        {"student_id": sid, "term": term, "amount": amt, "released_on": (due + timedelta(days=rnd.randint(0, 20))).isoformat() if done else None,
                         "credited_to": "Student bank account", "reference": f"SCH-{sid[4:]}-T{k + 1}", "status": "RELEASED" if done else "PENDING"})
            w.entry(r["person_id"], "student_portal", sid, "BENEFIT", None, date(2025, 9, 15), released,
                    {"scheme_code": "EDU-01", "scheme_name": scheme, "benefit_type": "SCHOLARSHIP", "from": "2025-09-15", "to": "2026-03-31", "status": "ACTIVE", "note": NOTE})
        else:
            w.patch(r["id"], extra)


# ------------------------------------------------------------------ housing
def housing(cur, w: Writer):
    stages = [("Foundation", 0.30), ("Lintel", 0.30), ("Roof", 0.30), ("Completion", 0.10)]
    for r in _records(cur, "housing", ("APPLICATION",)):
        p, rnd, aid = r["payload"], _rng("housing", r["source_rid"]), r["source_rid"]
        status = p.get("status") or "PENDING"
        sanctioned = 150000.0 if status in ("SANCTIONED", "COMPLETED") else 0.0
        done = 4 if status == "COMPLETED" else rnd.randint(1, 3) if status == "SANCTIONED" else 0
        w.patch(r["id"], {"sanctioned_amount": sanctioned, "beneficiary_contribution": 10000.0 if sanctioned else 0.0, "construction_stage": stages[done - 1][0] if done else "Not started",
                          "site_verified": "Y" if sanctioned else "N", "sanctioned_on": (_d(p.get("date")) + timedelta(days=45)).isoformat() if sanctioned and _d(p.get("date")) else None})
        if not sanctioned:
            continue
        start, released = _d(p.get("date")) or date(2024, 1, 1), 0.0
        for k, (stage, share) in enumerate(stages):
            ok = k < done
            amt = round(sanctioned * share, 2)
            when = start + timedelta(days=60 + 70 * k) if ok else None
            released += amt if ok else 0
            w.entry(r["person_id"], "housing", aid, "INSTALMENT", stage, when, amt if ok else 0,
                    {"application_id": aid, "stage": stage, "amount": amt, "released_on": when.isoformat() if when else None, "inspection": "Verified by Housing Inspector" if ok else "Awaiting inspection",
                     "status": "RELEASED" if ok else "PENDING"})
        w.entry(r["person_id"], "housing", aid, "BENEFIT", None, start, released,
                {"scheme_code": "HSG-01", "scheme_name": "Housing Assistance", "benefit_type": "HOUSING_GRANT", "from": start.isoformat(), "to": None,
                 "status": "COMPLETED" if status == "COMPLETED" else "ACTIVE", "sanctioned": sanctioned, "note": NOTE})


# ------------------------------------------------------------------ revenue: certificates and land
def certificates(cur, w: Writer):
    for r in _records(cur, "revenue_certificates", ("INCOME", "CASTE")):
        rnd = _rng("revenue_certificates", r["source_rid"])
        w.patch(r["id"], {"application_no": f"APP-{rnd.randint(10000000, 99999999)}", "issuing_authority": f"Tahsildar, {r['mandal'] or r['district']}", "fee_paid": 45.0,
                          "verified_by": "Revenue Inspector", "digitally_signed": "Y"})


def land(cur, w: Writer):
    for r in _records(cur, "revenue_land", ("LAND",)):
        p, rnd, rid = r["payload"], _rng("revenue_land", r["source_rid"]), r["source_rid"]
        acres = float(p.get("extent_acres") or 1)
        w.patch(r["id"], {"land_type": rnd.choice(["Wet", "Dry", "Wet", "Garden"]), "pattadar_passbook_no": f"PPB-{rnd.randint(100000, 999999)}", "tax_paid_upto": "2026-03-31", "encumbrance": "None"})
        last = _d(p.get("last_mutation_on")) or date(2014, 1, 1)
        for k, kind in enumerate(["Sale deed", "Succession"][: 1 + (rnd.random() < 0.4)]):
            when = last - timedelta(days=900 * k)
            w.entry(r["person_id"], "revenue_land", rid, "MUTATION", str(when.year), when, None,
                    {"record_no": rid, "mutation_type": kind, "registered_on": when.isoformat(), "from_holder": "Previous holder" if kind == "Sale deed" else "Deceased parent", "to_holder": r["name"],
                     "survey_no": p.get("survey_no"), "status": "MUTATED"})
        total = 0.0
        for season, when in [("Vanakalam 2025", date(2025, 6, 20)), ("Yasangi 2026", date(2026, 1, 15))]:
            amt = round(min(acres, 10) * 5000, 2)
            total += amt
            w.entry(r["person_id"], "revenue_land", rid, "SUPPORT_PAYMENT", season, when, amt,
                    {"record_no": rid, "season": season, "acres": acres, "rate_per_acre": 5000, "amount": amt, "paid_on": when.isoformat(), "reference": f"FIS-{rid[-7:]}-{when.year}", "status": "PAID"})
        w.entry(r["person_id"], "revenue_land", rid, "BENEFIT", None, date(2025, 6, 20), total,
                {"scheme_code": "FIS-01", "scheme_name": "Farmer Investment Support", "benefit_type": "CROP_SUPPORT", "from": "2025-06-20", "to": "2026-01-15", "status": "ACTIVE", "note": NOTE})


# ------------------------------------------------------------------ marriage
WITNESSES = ["K. Ramesh", "P. Sunitha", "M. Venkat Rao", "S. Lakshmi", "B. Narsaiah", "T. Padma", "G. Srinivas", "R. Kavitha"]


def marriage(cur, w: Writer):
    for r in _records(cur, "marriage_register"):
        p, rnd = r["payload"], _rng("marriage_register", r["source_rid"])
        reg = p.get("registration_no") or r["source_rid"].split(":")[0]
        when = _d(p.get("marriage_date")) or date(2015, 1, 1)
        w.patch(r["id"], {"certificate_no": f"MC-{reg[3:]}", "registered_on": (when + timedelta(days=rnd.randint(1, 20))).isoformat(), "registrar_designation": "Sub-Registrar",
                          "witness_1": rnd.choice(WITNESSES), "witness_2": rnd.choice(WITNESSES), "marriage_type": rnd.choice(["Hindu Marriage Act", "Special Marriage Act", "Muslim Personal Law"])})
        if r["rtype"] == "MARRIAGE_BRIDE" and when.year >= 2018 and rnd.random() < 0.3:
            paid = rnd.random() < 0.8
            w.entry(r["person_id"], "marriage_register", reg, "BENEFIT", None, when + timedelta(days=90) if paid else None, 75000.0 if paid else 0,
                    {"scheme_code": "MAR-01", "scheme_name": "Marriage Assistance for Women", "benefit_type": "MARRIAGE_GRANT", "from": when.isoformat(), "to": None,
                     "amount_sanctioned": 75000.0, "status": "DISBURSED" if paid else "PENDING", "note": NOTE})


RUNNERS = {"electricity": electricity, "pds_view": pds, "pension_batch": pension, "student_portal": education, "housing": housing, "revenue_certificates": certificates,
           "revenue_land": land, "marriage_register": marriage}


def load(cur, only: list[str] | None = None, actor: str = "loader") -> dict:
    out = {}
    for src in only or list(RUNNERS):
        cur.execute("SELECT count(*) AS n FROM mdm.dept_entry WHERE source=%s", (src,))
        if cur.fetchone()["n"]:
            out[src] = "already loaded"
            continue
        w = Writer(cur)
        RUNNERS[src](cur, w)
        e, p = w.flush()
        out[src] = {"entries": e, "records_enriched": p}
    audit.write(cur, actor, "DEPT_DATA_LOAD", "dept_entry", out)
    return out


def remove(cur, actor: str = "loader") -> dict:
    cur.execute("DELETE FROM mdm.dept_entry WHERE source = ANY(%s)", (list(SOURCES),))
    n = cur.rowcount
    audit.write(cur, actor, "DEPT_DATA_REMOVE", "dept_entry", {"entries": n})
    return {"entries_removed": n, "note": "Fields added to department records stay; they are harmless and a reload overwrites them."}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["load", "remove"])
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    with connect(STATE) as conn:
        cur = conn.cursor()
        res = remove(cur) if a.what == "remove" else load(cur, [s for s in a.only.split(",") if s] or None)
        conn.commit()
    print(json.dumps(res, indent=2))
