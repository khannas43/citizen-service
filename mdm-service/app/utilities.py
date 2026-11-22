"""What a citizen sees of their own utility connections: connection and meter details, the bill-and-payment passbook, subsidies received, and the addresses
departments hold for them. Only the signed-in citizen's own master record is read."""
from __future__ import annotations
from . import citizen
from .exchange import SYSTEMS
from .sources import SOURCE_INFO

ADDRESS_SOURCES = ("pds_view", "revenue_certificates", "electricity", "water_board", "pension_batch", "revenue_land", "housing")


def _f(x):
    return float(x) if x not in (None, "") else 0.0


def passbook(bills: list[dict]) -> dict:
    rows = sorted(bills, key=lambda b: b["period"], reverse=True)
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
    electricity = []
    for c in (r for r in recs if r["source"] == "electricity"):
        p = c["payload"]
        units = [int(x) for x in str(p.get("units_last_6_months") or "").split() if x.isdigit()]
        electricity.append({"service_no": p.get("service_no"), "consumer_name": p.get("consumer_name"), "category": p.get("category"), "load_kw": p.get("load_kw"),
                            "status": p.get("connection_status"), "address": p.get("address_text"), "units_last_6_months": units})
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
