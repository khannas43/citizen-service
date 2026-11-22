"""What a citizen sees of their own utility connections: connection and meter details, the bill-and-payment passbook, subsidies received, and the addresses
departments hold for them. Only the signed-in citizen's own master record is read."""
from __future__ import annotations
from . import citizen
from .exchange import SYSTEMS
from .ops import ELEMENTS
from .sources import SOURCE_INFO

ADDRESS_SOURCES = ("pds_view", "revenue_certificates", "electricity", "water_board", "pension_batch", "revenue_land", "housing")


def _f(x):
    return float(x) if x not in (None, "") else 0.0


def passbook(bills: list[dict]) -> dict:
    run, rows = 0.0, []
    for b in sorted(bills, key=lambda b: b["period"]):             # the balance carried after each month, oldest first
        run = round(run + _f(b["amount_payable"]) - _f(b["paid_amount"]), 2)
        rows.append({**b, "balance": run})
    rows.reverse()
    billed = round(sum(_f(b["amount_payable"]) for b in rows), 2)
    paid = round(sum(_f(b["paid_amount"]) for b in rows), 2)
    paid_dates = [b["paid_on"] for b in rows if b.get("paid_on")]
    return {"entries": rows, "summary": {"billed": billed, "paid": paid, "outstanding": round(max(billed - paid, 0), 2), "subsidy_waived": round(sum(_f(b["subsidy_waived"]) for b in rows), 2),
                                          "last_paid_on": max(paid_dates) if paid_dates else None, "unpaid_bills": sum(1 for b in rows if b["status"] in ("UNPAID", "PARTIAL"))}}


def _join(*parts) -> str:
    out = []
    for x in parts:
        if x and (not out or x.strip().lower() != out[-1].strip().lower()):
            out.append(x)
    return ", ".join(out)


def _el(key: str, source: str, as_of, fields: list) -> dict:
    """One catalogue element and the exact fields this department supplied for it, so the citizen sees where each detail comes from."""
    name, _sys, level = ELEMENTS[key]
    return {"element": key, "name": name, "sensitivity": level, "source": SOURCE_INFO[source][0], "as_of": as_of,
            "fields": [{"label": a, "value": b} for a, b in fields if b not in (None, "", "None")]}


def _water_elements(p: dict, pb: dict, subs: list, as_of) -> list[dict]:
    m, sm = (p.get("meter_status") == "METERED"), pb["summary"]
    return [
        _el("water_connection", "water_board", as_of, [
            ("Connection number", p.get("service_no")), ("In the name of", p.get("entity_name")), ("Account holder", p.get("consumer_name")),
            ("Connection type", p.get("connection_type")), ("Address", p.get("address_text")), ("Mandal", p.get("mandal")), ("District", p.get("district")),
            ("Pincode", p.get("pincode")), ("Pipe size", f"{p['pipe_size_mm']} mm" if p.get("pipe_size_mm") else None), ("Connected on", p.get("connected_on")),
            ("Connection status", p.get("connection_status")), ("Meter", "Metered" if m else "Unmetered (flat charge)"), ("Meter number", p.get("meter_no")),
            ("Meter make", p.get("meter_make")), ("Meter installed on", p.get("meter_installed_on"))]),
        _el("water_payment_status", "water_board", as_of, [
            ("Bills on record", len(pb["entries"])), ("Total billed", sm["billed"]), ("Total paid", sm["paid"]), ("Outstanding", sm["outstanding"]),
            ("Bills not fully paid", sm["unpaid_bills"]), ("Last payment on", sm["last_paid_on"])]),
        _el("water_subsidy", "water_board", as_of, [("Schemes", ", ".join(x["scheme_name"] for x in subs) or "None"), ("Claims", len(subs)),
                                                    ("Total subsidy received", round(sum(_f(x["amount_waived"]) for x in subs), 2))])]


def utilities(cur, ref: str) -> dict:
    pid = citizen.person_of(cur, ref)
    cur.execute("SELECT source, source_rid, rtype, address, payload, as_of FROM mdm.source_record WHERE person_id=%s AND source IN ('electricity','water_board') ORDER BY id", (pid,))
    recs = cur.fetchall()
    water = []
    for c in (r for r in recs if r["source"] == "water_board" and r["rtype"] == "CONNECTION"):
        sn = c["payload"]["service_no"]
        bills = [r["payload"] for r in recs if r["rtype"] == "BILL" and r["payload"].get("service_no") == sn]
        subs = [r["payload"] for r in recs if r["rtype"] == "SUBSIDY" and r["payload"].get("service_no") == sn]
        p = c["payload"]
        water.append({"service_no": sn, "entity_name": p.get("entity_name"), "entity_type": p.get("entity_type"), "connection_type": p.get("connection_type"),
                      "status": p.get("connection_status"), "connected_on": p.get("connected_on"), "pipe_size_mm": p.get("pipe_size_mm"),
                      "address": ", ".join(x for x in (p.get("address_text"), p.get("pincode")) if x),
                      "meter": {"status": p.get("meter_status"), "number": p.get("meter_no"), "make": p.get("meter_make"), "installed_on": p.get("meter_installed_on")},
                      "passbook": passbook(bills), "subsidies": sorted(subs, key=lambda s: s["from"], reverse=True)})
        water[-1]["elements"] = _water_elements(p, water[-1]["passbook"], subs, max([b["issued_on"] for b in bills], default=None))
    electricity = []
    for c in (r for r in recs if r["source"] == "electricity"):
        p = c["payload"]
        units = [int(x) for x in str(p.get("units_last_6_months") or "").split() if x.isdigit()]
        electricity.append({"service_no": p.get("service_no"), "consumer_name": p.get("consumer_name"), "category": p.get("category"), "load_kw": p.get("load_kw"),
                            "status": p.get("connection_status"), "address": p.get("address_text"), "units_last_6_months": units,
                            "elements": [_el("electricity_link", "electricity", None, [("Service number", p.get("service_no")), ("In the name of", p.get("consumer_name")),
                                                                                     ("Category", p.get("category")), ("Connected load", f"{p['load_kw']} kW" if p.get("load_kw") else None),
                                                                                     ("Connection status", p.get("connection_status")), ("Address", p.get("address_text")),
                                                                                     ("Mandal", p.get("mandal")), ("District", p.get("district")),
                                                                                     ("Units, last 6 months", " · ".join(map(str, units)))])]})
    cur.execute("SELECT address, village, mandal, district FROM mdm.person WHERE id=%s", (pid,))
    me = cur.fetchone() or {}
    cur.execute("SELECT source, address FROM mdm.source_record WHERE person_id=%s AND address IS NOT NULL AND address<>'' AND source = ANY(%s) ORDER BY id", (pid, list(ADDRESS_SOURCES)))
    seen, held = set(), []
    for r in cur.fetchall():
        key = (r["source"], " ".join(r["address"].lower().split()))
        if key not in seen:
            seen.add(key)
            held.append({"department": SOURCE_INFO.get(r["source"], (r["source"],))[0], "address": r["address"]})
    return {"address": {"master": _join(me.get("address"), me.get("village"), me.get("mandal"), me.get("district")) or None, "held_by": held},
            "electricity": electricity, "water": water, "note": "Sample data for demonstration. Schemes and tariffs are illustrative."}
