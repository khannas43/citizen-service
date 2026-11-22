"""One person's records across departments, in a single shape that both portals render: details, ledgers (bills, ration drawn, payments, instalments),
benefits received, and the catalogue elements each department supplied. Read-only; the signed-in citizen's own person, or a person an officer opens."""
from __future__ import annotations
from .ops import ELEMENTS
from .sources import SOURCE_INFO

TONE = {"PAID": "ok", "ACTIVE": "ok", "GRANTED": "ok", "RELEASED": "ok", "ISSUED": "ok", "MUTATED": "ok", "DISBURSED": "ok", "COMPLETED": "ok", "SANCTIONED": "ok", "REGISTERED": "ok",
        "PARTIAL": "warn", "PART_ISSUED": "warn", "PENDING": "warn", "ON_HOLD": "warn", "EXPIRED": "warn",
        "UNPAID": "bad", "NOT_DRAWN": "bad", "STOPPED": "bad", "DISCONNECTED": "bad"}
LABEL = {"PARTIAL": "Part paid", "PART_ISSUED": "Part issued", "NOT_DRAWN": "Not drawn", "ON_HOLD": "On hold", "STOPPED_DECEASED": "Stopped", "PHH": "Priority household", "AAY": "Antyodaya",
         "WHITE": "White card", "FREE_ALLOWANCE": "Free monthly allowance", "REBATE": "Percentage rebate", "FEE_WAIVER": "One-time fee waiver", "FREE_UNITS": "Free units",
         "FOOD_SUBSIDY": "Food subsidy", "MONTHLY_PENSION": "Monthly pension", "SCHOLARSHIP": "Scholarship", "HOUSING_GRANT": "Housing grant", "CROP_SUPPORT": "Crop support",
         "MARRIAGE_GRANT": "Marriage grant", "HOUSEHOLD": "Household", "COMMERCIAL": "Commercial", "INSTITUTION": "Institution", "DOMESTIC": "Domestic"}
DEPT = {"water_board": ("Water", "💧"), "electricity": ("Electricity", "💡"), "pds_view": ("Ration (civil supplies)", "🌾"), "pension_batch": ("Pension", "🧓"),
        "student_portal": ("Education and scholarship", "🎓"), "housing": ("Housing", "🏠"), "revenue_certificates": ("Revenue certificates", "📜"), "revenue_land": ("Land records", "🌱"),
        "marriage_register": ("Marriage", "💍")}
ORDER = list(DEPT)


def _f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def _lab(x):
    return LABEL.get(x) or (str(x).replace("_", " ").capitalize() if x else x)


def st(status):
    return {"label": _lab(status), "tone": TONE.get(status, "info")}


def col(key, label, type="text", sub=None, align=None):
    c = {"key": key, "label": label, "type": type}
    if sub:
        c["sub"] = sub
    if align:
        c["align"] = align
    return c


def tile(label, value, type="money", tone=None):
    return {"label": label, "value": value, "type": type, "tone": tone}


def fact(label, value, type="text"):
    return None if value in (None, "", "None") else {"label": label, "value": value, "type": type}


def facts(*items):
    return [i for i in items if i]


def element(source: str, key: str, as_of, fields: list) -> dict:
    name, _sys, level = ELEMENTS[key]
    out = []
    for f in fields:
        label, value, kind = f[0], f[1], (f[2] if len(f) > 2 else "text")
        if value not in (None, "", "None"):
            out.append({"label": label, "value": value, "type": kind})
    return {"element": key, "name": name, "sensitivity": level, "source": SOURCE_INFO[source][0], "as_of": as_of, "fields": out}


def benefit(e: dict, extra_amount=None) -> dict:
    p = e["payload"]
    return {"scheme": p.get("scheme_name"), "kind": _lab(p.get("benefit_type")), "amount": float(e["amount"] or 0) if extra_amount is None else extra_amount,
            "from": p.get("from"), "to": p.get("to"), "status": st(p.get("status")), "note": p.get("note")}


def benefit_element(source: str, key: str, bens: list, as_of) -> dict | None:
    if not bens:
        return None
    return element(source, key, as_of, [("Schemes", ", ".join(b["scheme"] for b in bens)), ("Claims", len(bens)), ("Total received", round(sum(b["amount"] for b in bens), 2), "money")])


def account(source: str, ident: str, title: str, subtitle: str, status, fact_list, ledgers, bens, elements) -> dict:
    name, icon = DEPT[source]
    return {"source": source, "department": name, "icon": icon, "source_name": SOURCE_INFO[source][0], "id": ident, "title": title, "subtitle": subtitle, "status": status,
            "facts": fact_list, "ledgers": [x for x in ledgers if x], "benefits": bens, "elements": [e for e in elements if e]}


# ------------------------------------------------------------------ bills (water, electricity)
def bill_ledger(bills: list, units_label: str, charged_fn) -> dict:
    run, rows = 0.0, []
    for e in sorted(bills, key=lambda e: e["period"]):
        b = e["payload"]
        run = round(run + _f(b["amount_payable"]) - _f(b["paid_amount"]), 2)
        rows.append({"month": b["period"], "ref": b["bill_no"], "units": b.get("units") or b.get("units_kl"), "gross": charged_fn(b), "waived": _f(b["subsidy_waived"]),
                     "payable": _f(b["amount_payable"]), "paid": _f(b["paid_amount"]), "receipt": b.get("receipt_no"), "paid_on": b.get("paid_on"), "mode": b.get("payment_mode"),
                     "balance": run, "status": st(b["status"])})
    rows.reverse()
    billed, paid = round(sum(r["payable"] for r in rows), 2), round(sum(r["paid"] for r in rows), 2)
    out = round(max(billed - paid, 0), 2)
    saved = round(sum(r["waived"] for r in rows), 2)
    last = max([r["paid_on"] for r in rows if r["paid_on"]], default=None)
    return {"title": "Bill and payment passbook", "kind": "passbook", "bar": {"left": None, "right_date": last, "right_label": "Last payment"},
            "tiles": [tile("Billed", billed), tile("Paid", paid), tile("Outstanding", out, tone="due" if out > 0 else "clear"), tile("Saved through subsidy", saved, tone="saved")],
            "columns": [col("month", "Month", "month", sub="ref"), col("units", units_label, "num"), col("gross", "Charged", "money"), col("waived", "Subsidy", "waive"), col("payable", "To pay", "money"),
                        col("paid", "Paid", "money", sub="receipt"), col("paid_on", "Paid on", "date", sub="mode"), col("balance", "Balance", "balance"), col("status", "Status", "status")],
            "rows": rows, "totals": {"payable": billed, "paid": paid, "balance": out},
            "summary": {"billed": billed, "paid": paid, "outstanding": out, "saved": saved, "unpaid_bills": sum(1 for r in rows if r["status"]["tone"] != "ok"), "last_paid_on": last}}


def _bens(entries):
    return [benefit(e) for e in entries if e["kind"] == "BENEFIT"]


def water_accounts(base, entries):
    out = []
    for c in (b for b in base if b["rtype"] == "CONNECTION"):
        p, sn = c["payload"], c["source_rid"]
        mine = [e for e in entries if e["parent_rid"] == sn]
        led = bill_ledger([e for e in mine if e["kind"] == "BILL"], "Units (KL)", lambda b: b["gross_amount"])
        led["bar"]["left"] = f"Account {sn}"
        bens = _bens(mine)
        sm, metered = led["summary"], p.get("meter_status") == "METERED"
        as_of = max([e["payload"]["issued_on"] for e in mine if e["kind"] == "BILL"], default=None)
        details = [("Connection number", sn), ("In the name of", p.get("entity_name")), ("Account holder", p.get("consumer_name")), ("Connection type", _lab(p.get("connection_type"))),
                   ("Address", p.get("address_text")), ("Mandal", p.get("mandal")), ("District", p.get("district")), ("Pincode", p.get("pincode")),
                   ("Pipe size", f"{p['pipe_size_mm']} mm" if p.get("pipe_size_mm") else None), ("Connected on", p.get("connected_on"), "date"), ("Connection status", _lab(p.get("connection_status"))),
                   ("Meter", "Metered" if metered else "Unmetered (flat charge)"), ("Meter number", p.get("meter_no")), ("Meter make", p.get("meter_make")),
                   ("Meter installed on", p.get("meter_installed_on"), "date")]
        out.append(account("water_board", sn, f"Water connection {sn}", f"{p.get('entity_name')} · {_lab(p.get('entity_type'))} · {_lab(p.get('connection_type'))}", st(p.get("connection_status")),
                           facts(fact("Address", ", ".join(x for x in (p.get("address_text"), p.get("pincode")) if x)), fact("Connected on", p.get("connected_on"), "date"),
                                 fact("Pipe size", f"{p['pipe_size_mm']} mm" if p.get("pipe_size_mm") else None),
                                 fact("Meter", f"{p.get('meter_no')} · {p.get('meter_make')}" if metered else "No meter (flat monthly charge)")), [led], bens,
                           [element("water_board", "water_connection", as_of, details),
                            element("water_board", "water_payment_status", as_of, [("Bills on record", len(led["rows"])), ("Total billed", sm["billed"], "money"), ("Total paid", sm["paid"], "money"),
                                                                                    ("Outstanding", sm["outstanding"], "money"), ("Bills not fully paid", sm["unpaid_bills"]), ("Last payment on", sm["last_paid_on"], "date")]),
                            benefit_element("water_board", "water_subsidy", bens, as_of)]))
    return out


def electricity_accounts(base, entries):
    out = []
    for c in base:
        p, sn = c["payload"], c["source_rid"]
        mine = [e for e in entries if e["parent_rid"] == sn]
        led = bill_ledger([e for e in mine if e["kind"] == "BILL"], "Units", lambda b: b["gross_amount"]) if any(e["kind"] == "BILL" for e in mine) else None
        if led:
            led["title"] = "Bill and payment passbook"
            led["bar"]["left"] = f"Account {sn}"
        bens = _bens(mine)
        sm = led["summary"] if led else {}
        as_of = max([e["payload"]["issued_on"] for e in mine if e["kind"] == "BILL"], default=None)
        details = [("Service number", sn), ("In the name of", p.get("consumer_name")), ("Tariff category", p.get("tariff_category") or _lab(p.get("category"))), ("Connected load", f"{p['load_kw']} kW" if p.get("load_kw") else None),
                   ("Phase", _lab(p.get("phase"))), ("Address", p.get("address_text")), ("Mandal", p.get("mandal")), ("District", p.get("district")), ("Pincode", p.get("pincode")),
                   ("Connected on", p.get("connected_on"), "date"), ("Connection status", _lab(p.get("connection_status"))), ("Meter number", p.get("meter_no")), ("Meter make", p.get("meter_make")),
                   ("Security deposit", _f(p["security_deposit"]) if p.get("security_deposit") else None, "money")]
        out.append(account("electricity", sn, f"Electricity connection {sn}", f"{p.get('consumer_name')} · {p.get('tariff_category') or _lab(p.get('category'))}", st(p.get("connection_status")),
                           facts(fact("Address", ", ".join(x for x in (p.get("address_text"), p.get("pincode")) if x)), fact("Connected load", f"{p['load_kw']} kW" if p.get("load_kw") else None),
                                 fact("Meter", f"{p.get('meter_no')} · {p.get('meter_make')}" if p.get("meter_no") else None), fact("Connected on", p.get("connected_on"), "date")), [led], bens,
                           [element("electricity", "electricity_link", as_of, details),
                            element("electricity", "electricity_payment_status", as_of, [("Bills on record", len(led["rows"])), ("Total billed", sm["billed"], "money"), ("Total paid", sm["paid"], "money"),
                                                                                          ("Outstanding", sm["outstanding"], "money"), ("Bills not fully paid", sm["unpaid_bills"]), ("Last payment on", sm["last_paid_on"], "date")]) if led else None,
                            benefit_element("electricity", "electricity_subsidy", bens, as_of)]))
    return out


def pds_accounts(base, entries):
    out, seen = [], set()
    for c in (b for b in base if b["ration_card"]):
        card = c["ration_card"]
        if card in seen:
            continue
        seen.add(card)
        p = c["payload"]
        mine = [e for e in entries if e["parent_rid"] == card]
        draws = sorted((e for e in mine if e["kind"] == "RATION_DRAW"), key=lambda e: e["period"], reverse=True)
        bens = _bens(mine)
        rows = [{"month": e["period"], "entitled": _f(e["payload"]["entitled_rice_kg"]), "drawn": _f(e["payload"]["drawn_rice_kg"]), "sugar": _f(e["payload"]["sugar_kg"]), "paid": _f(e["payload"]["amount_paid"]),
                 "market": _f(e["payload"]["market_value"]), "subsidy": _f(e["payload"]["subsidy_value"]), "drawn_on": e["payload"].get("drawn_on"), "auth": e["payload"].get("authentication"),
                 "status": st(e["payload"]["status"])} for e in draws]
        months_drawn = sum(1 for r in rows if r["drawn"] > 0)
        total_rice, total_paid, total_sub = round(sum(r["drawn"] for r in rows), 1), round(sum(r["paid"] for r in rows), 2), round(sum(r["subsidy"] for r in rows), 2)
        led = {"title": "Monthly ration drawn", "kind": "ledger", "bar": {"left": f"Card {card}", "right_date": max([r["drawn_on"] for r in rows if r["drawn_on"]], default=None), "right_label": "Last drawn"},
               "tiles": [tile("Months drawn", f"{months_drawn} of {len(rows)}", "text"), tile("Rice drawn", f"{total_rice} kg", "text"), tile("Paid", total_paid), tile("Subsidy value", total_sub, tone="saved")],
               "columns": [col("month", "Month", "month"), col("entitled", "Rice entitled (kg)", "num"), col("drawn", "Rice drawn (kg)", "num"), col("sugar", "Sugar (kg)", "num"), col("paid", "Paid", "money"),
                           col("market", "Market value", "money"), col("subsidy", "Subsidy", "waive"), col("drawn_on", "Drawn on", "date", sub="auth"), col("status", "Status", "status")],
               "rows": rows, "totals": {"paid": total_paid, "market": round(sum(r["market"] for r in rows), 2), "subsidy": total_sub}} if rows else None
        as_of = max([r["drawn_on"] for r in rows if r["drawn_on"]], default=None)
        out.append(account("pds_view", card, f"Ration card {card}", f"{LABEL.get(p.get('card_type'), p.get('card_type') or 'Card')} · {p.get('members_on_card') or ''} members · {p.get('fps_name') or ''}".replace("  ", " "),
                           st(p.get("card_status") or "ACTIVE"),
                           facts(fact("Card holder", p.get("card_head")), fact("Your place on the card", c.get("relation")), fact("Address", c.get("address")), fact("Fair price shop", f"{p.get('fps_code')} · {p.get('fps_name')}" if p.get("fps_code") else None),
                                 fact("Rice entitlement", f"{p['rice_entitlement_kg']:g} kg a month" if p.get("rice_entitlement_kg") else None)), [led], bens,
                           [element("pds_view", "ration_card_details", as_of, [("Ration card number", card), ("Card type", LABEL.get(p.get("card_type"), p.get("card_type"))), ("Card holder", p.get("card_head")),
                                                                              ("Members on card", p.get("members_on_card")), ("Your place on the card", c.get("relation")), ("Address", c.get("address")),
                                                                              ("Fair price shop code", p.get("fps_code")), ("Fair price shop", p.get("fps_name")), ("Card issued on", p.get("card_issued_on"), "date"),
                                                                              ("Rice entitlement", f"{p['rice_entitlement_kg']:g} kg a month" if p.get("rice_entitlement_kg") else None)]),
                            element("pds_view", "ration_drawn", as_of, [("Months on record", len(rows)), ("Months drawn", months_drawn), ("Rice drawn", f"{total_rice} kg"), ("Amount paid", total_paid, "money")]) if rows else None,
                            benefit_element("pds_view", "ration_subsidy", bens, as_of)]))
    return out


def pension_accounts(base, entries):
    out = []
    for c in (b for b in base if b["rtype"] == "PENSIONER"):
        p, pid = c["payload"], c["source_rid"]
        mine = [e for e in entries if e["parent_rid"] == pid]
        pays = sorted((e for e in mine if e["kind"] == "PENSION_PAYMENT"), key=lambda e: e["period"], reverse=True)
        bens = _bens(mine)
        rows = [{"month": e["period"], "amount": _f(e["payload"]["amount"]), "paid_on": e["payload"].get("paid_on"), "ref": e["payload"].get("reference"), "mode": _lab(e["payload"].get("mode")),
                 "status": st(e["payload"]["status"]), "note": e["payload"].get("note")} for e in pays]
        got = round(sum(r["amount"] for r in rows if r["status"]["tone"] == "ok"), 2)
        led = {"title": "Pension payments", "kind": "ledger", "bar": {"left": f"Pension {pid}", "right_date": max([r["paid_on"] for r in rows if r["paid_on"]], default=None), "right_label": "Last paid"},
               "tiles": [tile("Monthly pension", _f(p.get("monthly_amount"))), tile("Received", got, tone="saved"), tile("Payments made", f"{sum(1 for r in rows if r['status']['tone'] == 'ok')} of {len(rows)}", "text"),
                         tile("Next payment", p.get("next_payment_on") or "—", "date")],
               "columns": [col("month", "Month", "month", sub="ref"), col("amount", "Amount", "money"), col("paid_on", "Paid on", "date", sub="mode"), col("status", "Status", "status", sub="note")],
               "rows": rows, "totals": {"amount": got}} if rows else None
        as_of = max([r["paid_on"] for r in rows if r["paid_on"]], default=None)
        stat = p.get("status") or "ACTIVE"
        masked = f"{p.get('bank_name')} · {p.get('account_masked')}" if p.get("bank_name") else None
        out.append(account("pension_batch", pid, f"Pension {pid}", f"{p.get('scheme_name') or _lab(p.get('scheme'))} · ₹{_f(p.get('monthly_amount')):,.0f} a month", st("STOPPED" if stat.startswith("STOPPED") else "ACTIVE"),
                           facts(fact("Scheme", p.get("scheme_name") or _lab(p.get("scheme"))), fact("Paid through", masked), fact("Sanctioned on", p.get("sanctioned_on"), "date"), fact("Nominee", p.get("nominee_name")),
                                 fact("Life certificate due", p.get("life_certificate_due"), "date")), [led], bens,
                           [element("pension_batch", "pension_details", as_of, [("Pension number", pid), ("Scheme", p.get("scheme_name") or _lab(p.get("scheme"))), ("Monthly amount", _f(p.get("monthly_amount")), "money"),
                                                                               ("Status", st("STOPPED" if stat.startswith("STOPPED") else "ACTIVE")["label"]), ("Payment mode", _lab(p.get("payment_mode"))), ("Bank", p.get("bank_name")),
                                                                               ("Account", p.get("account_masked")), ("Sanctioned on", p.get("sanctioned_on"), "date"), ("Nominee", p.get("nominee_name")),
                                                                               ("Life certificate due", p.get("life_certificate_due"), "date"), ("Next payment on", p.get("next_payment_on"), "date")]),
                            element("pension_batch", "pension_payments", as_of, [("Payments on record", len(rows)), ("Paid", sum(1 for r in rows if r["status"]["tone"] == "ok")), ("Received", got, "money"),
                                                                                ("Last paid on", as_of, "date")]) if rows else None]))
    return out


def education_accounts(base, entries):
    out = []
    for c in (b for b in base if b["rtype"] == "STUDENT"):
        p, sid = c["payload"], c["source_rid"]
        mine = [e for e in entries if e["parent_rid"] == sid]
        inst = sorted((e for e in mine if e["kind"] == "INSTALMENT"), key=lambda e: e["period"])
        bens = _bens(mine)
        rows = [{"term": e["payload"]["term"], "amount": _f(e["payload"]["amount"]), "released_on": e["payload"].get("released_on"), "to": e["payload"].get("credited_to"), "ref": e["payload"].get("reference"),
                 "status": st(e["payload"]["status"])} for e in inst]
        sanc = _f(p.get("sanctioned_amount"))
        rel = round(sum(r["amount"] for r in rows if r["status"]["tone"] == "ok"), 2)
        led = {"title": "Scholarship instalments", "kind": "ledger", "bar": {"left": f"Student {sid}", "right_date": max([r["released_on"] for r in rows if r["released_on"]], default=None), "right_label": "Last released"},
               "tiles": [tile("Sanctioned", sanc), tile("Released", rel, tone="saved"), tile("Pending", round(sanc - rel, 2), tone="due" if sanc - rel > 0 else "clear")],
               "columns": [col("term", "Instalment", "text", sub="ref"), col("amount", "Amount", "money"), col("released_on", "Released on", "date", sub="to"), col("status", "Status", "status")],
               "rows": rows, "totals": {"amount": round(sum(r["amount"] for r in rows), 2)}} if rows else None
        as_of = max([r["released_on"] for r in rows if r["released_on"]], default=None)
        out.append(account("student_portal", sid, f"Student record {sid}", f"{p.get('course')} · {p.get('institution') or ''}".strip(" ·"), st("ACTIVE"),
                           facts(fact("Course", p.get("course")), fact("Institution", p.get("institution")), fact("Year of study", p.get("year")), fact("Academic year", p.get("academic_year")), fact("Course fee", _f(p.get("course_fee")) or None, "money"),
                                 fact("Scholarship", p.get("scholarship_scheme") or "Not applied"), fact("Sanctioned", sanc or None, "money")), [led], bens,
                           [element("student_portal", "scholarship_details", as_of, [("Student ID", sid), ("Course", p.get("course")), ("Institution", p.get("institution")), ("Institution type", p.get("institution_type")),
                                                                                    ("Year of study", p.get("year")), ("Academic year", p.get("academic_year")), ("Roll number", p.get("roll_no")), ("Course fee", _f(p.get("course_fee")), "money"),
                                                                                    ("Scholarship scheme", p.get("scholarship_scheme")), ("Sanctioned amount", sanc or None, "money")]),
                            element("student_portal", "scholarship_disbursed", as_of, [("Instalments", len(rows)), ("Released", sum(1 for r in rows if r["status"]["tone"] == "ok")), ("Amount released", rel, "money")]) if rows else None]))
    return out


def housing_accounts(base, entries):
    out = []
    for c in (b for b in base if b["rtype"] == "APPLICATION"):
        p, aid = c["payload"], c["source_rid"]
        mine = [e for e in entries if e["parent_rid"] == aid]
        inst = sorted((e for e in mine if e["kind"] == "INSTALMENT"), key=lambda e: ["Foundation", "Lintel", "Roof", "Completion"].index(e["period"]) if e["period"] in ["Foundation", "Lintel", "Roof", "Completion"] else 9)
        bens = _bens(mine)
        rows = [{"stage": e["payload"]["stage"], "amount": _f(e["payload"]["amount"]), "released_on": e["payload"].get("released_on"), "inspection": e["payload"].get("inspection"), "status": st(e["payload"]["status"])} for e in inst]
        sanc = _f(p.get("sanctioned_amount"))
        rel = round(sum(r["amount"] for r in rows if r["status"]["tone"] == "ok"), 2)
        led = {"title": "Instalments by construction stage", "kind": "ledger", "bar": {"left": f"Application {aid}", "right_date": max([r["released_on"] for r in rows if r["released_on"]], default=None), "right_label": "Last released"},
               "tiles": [tile("Sanctioned", sanc), tile("Released", rel, tone="saved"), tile("Remaining", round(sanc - rel, 2), tone="due" if sanc - rel > 0 else "clear")],
               "columns": [col("stage", "Stage", "text", sub="inspection"), col("amount", "Amount", "money"), col("released_on", "Released on", "date"), col("status", "Status", "status")],
               "rows": rows, "totals": {"amount": round(sum(r["amount"] for r in rows), 2)}} if rows else None
        as_of = max([r["released_on"] for r in rows if r["released_on"]], default=p.get("date"))
        out.append(account("housing", aid, f"Housing application {aid}", f"{_lab(p.get('scheme'))} · {_lab(p.get('status'))}", st(p.get("status")),
                           facts(fact("Applied on", p.get("date"), "date"), fact("Place", ", ".join(x for x in (p.get("village"), p.get("mandal"), p.get("district")) if x)), fact("Construction stage", p.get("construction_stage")),
                                 fact("Sanctioned", sanc or None, "money"), fact("Your contribution", _f(p.get("beneficiary_contribution")) or None, "money")), [led], bens,
                           [element("housing", "housing_sanction", as_of, [("Application number", aid), ("Scheme", _lab(p.get("scheme"))), ("Status", _lab(p.get("status"))), ("Applied on", p.get("date"), "date"),
                                                                          ("Village", p.get("village")), ("Mandal", p.get("mandal")), ("District", p.get("district")), ("Household reference", p.get("household_ref")),
                                                                          ("Sanctioned amount", sanc or None, "money"), ("Your contribution", _f(p.get("beneficiary_contribution")) or None, "money"),
                                                                          ("Site verified", "Yes" if p.get("site_verified") == "Y" else "No"), ("Construction stage", p.get("construction_stage"))]),
                            element("housing", "housing_instalments", as_of, [("Instalments", len(rows)), ("Released", sum(1 for r in rows if r["status"]["tone"] == "ok")), ("Amount released", rel, "money")]) if rows else None]))
    return out


def certificate_accounts(base, entries):
    out = []
    for c in (b for b in base if b["rtype"] in ("INCOME", "CASTE")):
        p = c["payload"]
        kind = "Income" if c["rtype"] == "INCOME" else "Caste"
        details = [("Certificate number", c["source_rid"]), ("Type", f"{kind} certificate"), ("Holder", p.get("holder_name")), ("Father or husband", p.get("father_or_husband")), ("Issued on", p.get("issued_on"), "date"),
                   ("Valid until", p.get("valid_until"), "date"), ("Status", _lab(p.get("status"))), ("Annual income", _f(p["annual_income"]) if p.get("annual_income") else None, "money"),
                   ("Social category", p.get("category") if c["rtype"] == "CASTE" else None), ("Issued by", p.get("issuing_authority")), ("Application number", p.get("application_no")),
                   ("Fee paid", _f(p.get("fee_paid")) or None, "money"), ("Verified by", p.get("verified_by")), ("Digitally signed", "Yes" if p.get("digitally_signed") == "Y" else None)]
        out.append(account("revenue_certificates", c["source_rid"], f"{kind} certificate {c['source_rid']}", f"Issued {p.get('issued_on') or ''} · valid until {p.get('valid_until') or '—'}".strip(), st(p.get("status") or "ACTIVE"),
                           facts(fact("Issued on", p.get("issued_on"), "date"), fact("Valid until", p.get("valid_until"), "date"), fact("Annual income", _f(p["annual_income"]) if p.get("annual_income") else None, "money") if c["rtype"] == "INCOME" else None,
                                 fact("Social category", p.get("category")) if c["rtype"] == "CASTE" else None, fact("Issued by", p.get("issuing_authority"))), [], [], [element("revenue_certificates", "certificate_details", p.get("issued_on"), details)]))
    return out


def land_accounts(base, entries):
    out = []
    for c in (b for b in base if b["rtype"] == "LAND"):
        p, rid = c["payload"], c["source_rid"]
        mine = [e for e in entries if e["parent_rid"] == rid]
        muts = sorted((e for e in mine if e["kind"] == "MUTATION"), key=lambda e: e["payload"]["registered_on"], reverse=True)
        pays = sorted((e for e in mine if e["kind"] == "SUPPORT_PAYMENT"), key=lambda e: e["payload"]["paid_on"], reverse=True)
        bens = _bens(mine)
        mrows = [{"when": e["payload"]["registered_on"], "kind": e["payload"]["mutation_type"], "from": e["payload"]["from_holder"], "to": e["payload"]["to_holder"], "status": st(e["payload"]["status"])} for e in muts]
        prows = [{"season": e["payload"]["season"], "acres": _f(e["payload"]["acres"]), "rate": _f(e["payload"]["rate_per_acre"]), "amount": _f(e["payload"]["amount"]), "paid_on": e["payload"]["paid_on"], "ref": e["payload"]["reference"],
                  "status": st(e["payload"]["status"])} for e in pays]
        total = round(sum(r["amount"] for r in prows), 2)
        mled = {"title": "Mutation history", "kind": "ledger", "bar": None, "tiles": [], "columns": [col("when", "Registered on", "date"), col("kind", "Type"), col("from", "From"), col("to", "To"), col("status", "Status", "status")], "rows": mrows, "totals": {}} if mrows else None
        pled = {"title": "Crop-support payments", "kind": "ledger", "bar": {"left": f"Record {rid}", "right_date": prows[0]["paid_on"] if prows else None, "right_label": "Last paid"},
                "tiles": [tile("Received", total, tone="saved"), tile("Seasons paid", len(prows), "text")],
                "columns": [col("season", "Season", "text", sub="ref"), col("acres", "Acres", "num"), col("rate", "Rate per acre", "money"), col("amount", "Amount", "money"), col("paid_on", "Paid on", "date"), col("status", "Status", "status")],
                "rows": prows, "totals": {"amount": total}} if prows else None
        details = [("Record number", rid), ("Survey number", p.get("survey_no")), ("Owner", p.get("owner_name")), ("Extent", f"{p.get('extent_acres')} acres" if p.get("extent_acres") else None), ("Village", p.get("village")),
                   ("Mandal", p.get("mandal")), ("District", p.get("district")), ("Land type", p.get("land_type")), ("Pattadar passbook number", p.get("pattadar_passbook_no")), ("Tax paid up to", p.get("tax_paid_upto"), "date"),
                   ("Encumbrance", p.get("encumbrance")), ("Last updated", p.get("last_updated"), "date")]
        out.append(account("revenue_land", rid, f"Land record {rid}", f"Survey {p.get('survey_no')} · {p.get('extent_acres')} acres · {p.get('village')}", st("ACTIVE"),
                           facts(fact("Survey number", p.get("survey_no")), fact("Extent", f"{p.get('extent_acres')} acres" if p.get("extent_acres") else None), fact("Village", ", ".join(x for x in (p.get("village"), p.get("mandal"), p.get("district")) if x)),
                                 fact("Land type", p.get("land_type")), fact("Passbook number", p.get("pattadar_passbook_no")), fact("Tax paid up to", p.get("tax_paid_upto"), "date")), [mled, pled], bens,
                           [element("revenue_land", "land_holding", p.get("last_updated"), details),
                            element("revenue_land", "land_mutations", p.get("last_updated"), [("Mutations on record", len(mrows)), ("Latest", mrows[0]["kind"] if mrows else None), ("Latest registered on", mrows[0]["when"] if mrows else None, "date")]) if mrows else None,
                            element("revenue_land", "farm_support", prows[0]["paid_on"] if prows else None, [("Seasons paid", len(prows)), ("Total received", total, "money"), ("Last paid on", prows[0]["paid_on"], "date")]) if prows else None]))
    return out


def marriage_accounts(base, entries):
    out = []
    for c in base:
        p = c["payload"]
        reg = p.get("registration_no") or c["source_rid"].split(":")[0]
        mine = [e for e in entries if e["parent_rid"] == reg]
        bens = _bens(mine)
        details = [("Registration number", reg), ("Certificate number", p.get("certificate_no")), ("Husband", p.get("groom_name")), ("Wife (name at marriage)", p.get("bride_name_at_marriage")),
                   ("Marriage date", p.get("marriage_date"), "date"), ("Registered on", p.get("registered_on"), "date"), ("Registrar office", p.get("registrar_office")), ("Registrar", p.get("registrar_designation")),
                   ("Marriage type", p.get("marriage_type")), ("Witnesses", ", ".join(x for x in (p.get("witness_1"), p.get("witness_2")) if x)), ("Status", _lab(p.get("status")))]
        out.append(account("marriage_register", reg, f"Marriage registration {reg}", f"{p.get('groom_name')} and {p.get('bride_name_at_marriage')}", st(p.get("status") or "REGISTERED"),
                           facts(fact("Marriage date", p.get("marriage_date"), "date"), fact("Registered on", p.get("registered_on"), "date"), fact("Certificate number", p.get("certificate_no")),
                                 fact("Registrar", ", ".join(x for x in (p.get("registrar_designation"), p.get("registrar_office")) if x)), fact("Witnesses", ", ".join(x for x in (p.get("witness_1"), p.get("witness_2")) if x))), [], bens,
                           [element("marriage_register", "marital_status", p.get("registered_on") or p.get("marriage_date"), details), benefit_element("marriage_register", "marriage_assistance", bens, p.get("marriage_date"))]))
    return out


BUILDERS = {"water_board": water_accounts, "electricity": electricity_accounts, "pds_view": pds_accounts, "pension_batch": pension_accounts, "student_portal": education_accounts,
            "housing": housing_accounts, "revenue_certificates": certificate_accounts, "revenue_land": land_accounts, "marriage_register": marriage_accounts}


def addresses(cur, pid: int) -> dict:
    cur.execute("SELECT address, village, mandal, district FROM mdm.person WHERE id=%s", (pid,))
    me = cur.fetchone() or {}
    cur.execute("SELECT source, address FROM mdm.source_record WHERE person_id=%s AND address IS NOT NULL AND address<>'' ORDER BY id", (pid,))
    seen, held, parts = set(), [], []
    for x in (me.get("address"), me.get("village"), me.get("mandal"), me.get("district")):
        if x and (not parts or x.strip().lower() != parts[-1].strip().lower()):
            parts.append(x)
    for r in cur.fetchall():
        key = (r["source"], " ".join(r["address"].lower().split()))
        if key not in seen:
            seen.add(key)
            held.append({"department": SOURCE_INFO.get(r["source"], (r["source"],))[0], "address": r["address"]})
    return {"master": ", ".join(parts) or None, "held_by": held}


def master_address(cur, pid: int) -> dict:
    """The master record's address in parts, so the citizen portal can show the same address the departments agree on."""
    cur.execute("SELECT address, village, mandal, district FROM mdm.person WHERE id=%s", (pid,))
    p = cur.fetchone() or {}
    return {"address": p.get("address"), "village": p.get("village"), "mandal": p.get("mandal"), "district": p.get("district")}


def profile(cur, pid: int) -> dict:
    cur.execute("SELECT id, source, source_rid, rtype, name, address, ration_card, relation, payload FROM mdm.source_record WHERE person_id=%s AND source = ANY(%s) ORDER BY id", (pid, ORDER))
    base = cur.fetchall()
    cards = sorted({b["ration_card"] for b in base if b["source"] == "pds_view" and b["ration_card"]})
    cur.execute("SELECT person_id, source, parent_rid, kind, period, entry_date, amount, payload FROM mdm.dept_entry WHERE person_id=%s OR (source='pds_view' AND parent_rid = ANY(%s)) ORDER BY id", (pid, cards))
    entries = cur.fetchall()
    out = []
    for src in ORDER:
        rows = [b for b in base if b["source"] == src]
        if rows:
            accounts = BUILDERS[src](rows, [e for e in entries if e["source"] == src])
            if accounts:
                out.append({"source": src, "department": DEPT[src][0], "icon": DEPT[src][1], "accounts": accounts})
    return {"address": addresses(cur, pid), "departments": out, "note": "Sample data for demonstration. Schemes, tariffs and amounts are illustrative."}
