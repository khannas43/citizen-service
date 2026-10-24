#!/usr/bin/env python3
"""
Generate taluka-level pilot sample data for expenditure_integrity.

Target: at least 20 entitlement units and 20 employees per pilot taluka
(Banaskantha, Ahmedabad, Surat — aligned with docs/EXPENDITURE_INTEGRITY_ASSUMPTIONS.md).

Each taluka includes embedded UC1-style patterns so a full detection run produces a
realistic alert inbox (802, 801, 803, 804, 806), not only volume with no findings.

Rewrites the block between markers in seed_expenditure_integrity.sql and writes
seed_expenditure_integrity_taluka_bulk.sql (same content) for standalone load.
"""
from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from datetime import datetime

from demo_loop_seed_helpers import (
    DEPT_ADMIN_VERIFIED_BY,
    action_timestamp,
    decision_timestamp,
    verification_note,
    verification_timestamp,
)
from retime_demo_lib import spread_detected

SEED_LOAD_AT = datetime.now().replace(microsecond=0)

NS = uuid.UUID("8b2e1f4a-9c3d-4e5f-a6b7-c8d9e0f1a2b3")
RESOLVED_AWAITING_VERIFY = 5
PER_TALUKA = 20
BEGIN = "-- BEGIN GENERATED TALUKA BULK"
END = "-- END GENERATED TALUKA BULK"
RESOLVED_BEGIN = "-- BEGIN RESOLVED CASES SAMPLE"
RESOLVED_END = "-- END RESOLVED CASES SAMPLE"
RESOLVED_CASE_COUNT = 50

OAP = ("a1000001-0000-0000-0000-000000000001", "Old Age Pension", 12000, 72, 84000)
WIDOW = ("a1000001-0000-0000-0000-000000000004", "Widow Pension", 15000, 62, 48000)
MYSY = ("a1000001-0000-0000-0000-000000000006", "MYSY", 10000, 19, 96000)
OBC = ("a1000001-0000-0000-0000-000000000002", "Post-Matric OBC Scholarship", 8000, 20, 110000)
GIRL = ("a1000001-0000-0000-0000-000000000005", "CM Girl Child Education Grant", 6000, 14, 65000)

SCHEMES = [OAP, WIDOW, MYSY, OBC, GIRL]

# district, taluka, sample villages (family-registry geography + city areas)
PILOT_TALUKAS: list[tuple[str, str, list[str]]] = [
    ("Banaskantha", "Deesa", ["Deesa", "Dhanera", "Palanpur"]),
    ("Banaskantha", "Palanpur", ["Kankrej", "Palanpur", "Radhanpur"]),
    ("Ahmedabad", "Dholka", ["Bagodara", "Bavla", "Dholka"]),
    ("Ahmedabad", "Sanand", ["Bol", "Chandrala", "Sanand"]),
    ("Ahmedabad", "Viramgam", ["Charada", "Kanpur", "Viramgam"]),
    ("Ahmedabad", "Ahmedabad City", ["Navrangpura", "Maninagar", "Vastrapur"]),
    ("Ahmedabad", "Bavla", ["Sachana", "Rajoda", "Bavla"]),
    ("Ahmedabad", "Naroda", ["Nikol", "Kubernagar", "Naroda Gam"]),
    ("Surat", "Choryasi", ["Bhatha", "Sachin", "Utran"]),
    ("Surat", "Katargam", ["Katargam", "Kosad", "Sarthana"]),
    ("Surat", "Olpad", ["Hansot", "Limbachha", "Olpad"]),
    ("Surat", "Surat City", ["Adajan", "Vesu", "Varachha"]),
    ("Surat", "Bardoli", ["Mahuva", "Madhi", "Bardoli"]),
]

# When pilot taluka labels do not match family_registry.taluka, borrow members from a nearby taluka.
TALUKA_MEMBER_SOURCE: dict[tuple[str, str], tuple[str, str]] = {
    ("Ahmedabad", "Ahmedabad City"): ("Ahmedabad", "Dholka"),
    ("Ahmedabad", "Bavla"): ("Ahmedabad", "Dholka"),
    ("Ahmedabad", "Naroda"): ("Ahmedabad", "Dholka"),
    ("Surat", "Surat City"): ("Surat", "Katargam"),
    ("Surat", "Bardoli"): ("Surat", "Choryasi"),
}

MEERA_RATHOD = (
    "50000005-0000-0000-0000-000000000001",
    "Meera Rathod",
    "a5000000-0000-0000-0000-000000000005",
)
KAVITA_RATHOD = (
    "50000001-0000-0000-0000-000000000001",
    "Kavita Rathod",
    "a5000000-0000-0000-0000-000000000005",
)


@dataclass(frozen=True)
class RegistryMember:
    person_id: str
    person_name: str
    family_id: str
    district: str
    taluka: str
    village: str
    income: int
    age: int


def load_family_registry(seed_dir: Path) -> dict[tuple[str, str], list[RegistryMember]]:
    """Parse seed_families.sql (+ MYSY student) for person ids and names used in the officer portal profile modal."""
    text = (seed_dir / "seed_families.sql").read_text(encoding="utf-8")
    text += (seed_dir / "seed_mysy_student.sql").read_text(encoding="utf-8")

    families: dict[str, tuple[str, str, str]] = {}
    for m in re.finditer(
        r"INSERT INTO family \(id, address, village, taluka, district, state\) VALUES "
        r"\('([^']+)', '[^']*', '([^']*)', '([^']*)', '([^']*)', 'Gujarat'\)",
        text,
    ):
        families[m.group(1)] = (m.group(4), m.group(3), m.group(2))

    persons: dict[str, tuple[str, int, int]] = {}
    for m in re.finditer(
        r"INSERT INTO person \(id, name, dob, gender, aadhaar_ref, occupation, annual_income, caste_category, is_alive, mobile\) "
        r"VALUES \('([^']+)', '([^']+)', '([^']+)'",
        text,
    ):
        pid, name, dob = m.group(1), m.group(2), m.group(3)
        tail = m.group(0).split(dob, 1)[1]
        inc_m = re.search(r", (\d+), '", tail)
        income = int(inc_m.group(1)) if inc_m else 0
        age = max(1, 2025 - int(dob[:4]))
        persons[pid] = (name, income, age)

    by_dt: dict[tuple[str, str], list[RegistryMember]] = {}
    for m in re.finditer(
        r"INSERT INTO family_member \(family_id, person_id, relationship_to_head\) VALUES "
        r"\('([^']+)', '([^']+)', '([^']+)'\)",
        text,
    ):
        fid, pid, _rel = m.group(1), m.group(2), m.group(3)
        if fid not in families or pid not in persons:
            continue
        district, taluka, village = families[fid]
        name, income, age = persons[pid]
        by_dt.setdefault((district, taluka), []).append(
            RegistryMember(pid, name, fid, district, taluka, village, income, age)
        )

    for key in list(by_dt.keys()):
        by_dt[key].sort(key=lambda m: m.person_id)
    return by_dt


def member_pool(by_dt: dict[tuple[str, str], list[RegistryMember]], district: str, taluka: str) -> list[RegistryMember]:
    key = (district, taluka)
    if not by_dt.get(key):
        key = TALUKA_MEMBER_SOURCE.get(key, key)
    pool = by_dt.get(key) or []
    if not pool:
        # last resort: any member in the same district
        pool = sorted(
            (m for (d, _t), ms in by_dt.items() if d == district for m in ms),
            key=lambda m: m.person_id,
        )
    return pool


def pick_member(pool: list[RegistryMember], index: int) -> RegistryMember:
    if not pool:
        raise RuntimeError("No family_registry members for taluka; run generate_families.py first.")
    return pool[index % len(pool)]


def distinct_family_members(pool: list[RegistryMember], start: int, count: int) -> list[RegistryMember]:
    seen: set[str] = set()
    out: list[RegistryMember] = []
    idx = start
    while len(out) < count and idx < start + len(pool) * 2:
        m = pick_member(pool, idx)
        idx += 1
        if m.family_id in seen:
            continue
        seen.add(m.family_id)
        out.append(m)
    while len(out) < count:
        out.append(pick_member(pool, len(out)))
    return out


def elder_female(pool: list[RegistryMember]) -> RegistryMember | None:
    for m in sorted(pool, key=lambda x: -x.age):
        if m.age >= 60:
            return m
    return None


# age limits in the scheme engine's own rules; the age recorded on an entitlement is kept inside them so that
# rule 806 only fires on the rows that are meant to demonstrate it
AGE_BAND = {
    "a1000001-0000-0000-0000-000000000001": (60, 99),   # Old Age Pension
    "a1000001-0000-0000-0000-000000000004": (18, 99),   # Widow Pension
    "a1000001-0000-0000-0000-000000000005": (18, 25),   # CM Girl Child Education Grant
    "a1000001-0000-0000-0000-000000000002": (15, 25),   # Post-Matric OBC Scholarship
}


def scheme_for_member(base: tuple[str, str, int, int, int], member: RegistryMember, income: int | None = None) -> tuple[str, str, int, int, int]:
    inc = member.income if income is None else income
    low, high = AGE_BAND.get(base[0], (0, 120))
    age = min(max(member.age, low), high)
    return (base[0], base[1], base[2], age, inc)


def uid(kind: str, *parts: str) -> str:
    return str(uuid.uuid5(NS, f"{kind}:" + ":".join(parts)))


def slug(s: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in s).strip("-").upper()[:12]


def q(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def json_sql(obj: object) -> str:
    return q(json.dumps(obj, separators=(",", ":")))


def unit_row(
    unit_id: str,
    scheme: tuple[str, str, int, int, int],
    person_id: str,
    person_name: str,
    family_id: str,
    district: str,
    taluka: str,
    village: str,
    period_start: str = "2024-04-01",
    period_end: str = "2025-03-31",
    status: str = "ACTIVE",
) -> str:
    scheme_id, scheme_name, amount, age, income = scheme
    return (
        f"({q(unit_id)}, {q(scheme_id)}, {q(scheme_name)}, {q(person_id)}, {q(person_name)}, "
        f"{q(family_id)}, {q(district)}, {q(taluka)}, {q(village)}, "
        f"{q(period_start)}, {q(period_end)}, {amount}, {income}, {age}, {q(status)})"
    )


def pay_row(
    pay_id: str,
    unit_id: str,
    amount: int,
    bank_token: str,
    txn: str,
    period_start: str = "2024-04-01",
    period_end: str = "2025-03-31",
) -> str:
    return (
        f"({q(pay_id)}, {q(unit_id)}, {q(period_start)}, {q(period_end)}, {amount}, 'SETTLED', "
        f"{q(bank_token)}, {q(txn)})"
    )


def generate_bulk(by_dt: dict[tuple[str, str], list[RegistryMember]]) -> str:
    lines: list[str] = [
        BEGIN,
        "-- Auto-generated: >=20 entitlement units and >=20 employees per pilot taluka.",
        f"-- Talukas: {len(PILOT_TALUKAS)}, rows per taluka: {PER_TALUKA}.",
        "-- Person id / name / family_id match family_registry (seed_families.sql).",
        "-- Rows 1–11 per taluka embed UC1 detection patterns (802/801/803/804/806).",
        "",
    ]
    unit_rows: list[str] = []
    pay_rows: list[str] = []
    verif_rows: list[str] = []
    emp_rows: list[str] = []
    payroll_rows: list[str] = []

    for district, taluka, villages in PILOT_TALUKAS:
        dslug, tslug = slug(district), slug(taluka)
        shared_bank = f"SHARED-BANK-{tslug}"
        pool = member_pool(by_dt, district, taluka)
        mutual = elder_female(pool) or pick_member(pool, 2)
        dup = pick_member(pool, 4)
        bank_members = distinct_family_members(pool, 6, 4)
        death = pick_member(pool, 10)

        for i in range(1, PER_TALUKA + 1):
            village = villages[(i - 1) % len(villages)]
            unit_id = uid("unit", district, taluka, str(i))
            pay_id = uid("pay", district, taluka, str(i))
            txn = f"TXN-{dslug}-{tslug}-{i:02d}"
            row_member = pick_member(pool, i - 1)

            if i == 1:
                # 802 OVER_SETTLEMENT — duplicate settlement on one unit
                if district == "Banaskantha" and taluka == "Deesa":
                    pid, pname, fid = MEERA_RATHOD
                    m = RegistryMember(pid, pname, fid, district, taluka, "Deesa", 0, 17)
                else:
                    m = row_member
                scheme = scheme_for_member(MYSY, m, income=96000)
                amount = scheme[2]
                unit_rows.append(
                    unit_row(unit_id, scheme, m.person_id, m.person_name, m.family_id, district, taluka, m.village or village)
                )
                bank = f"bank-{dslug}-{tslug}-{i:02d}"
                pay_rows.append(pay_row(pay_id, unit_id, amount, bank, txn))
                pay_rows.append(
                    pay_row(
                        uid("pay", district, taluka, f"{i}-dup"),
                        unit_id,
                        amount,
                        bank,
                        f"{txn}-B",
                    )
                )
            elif i == 2:
                # 806 — income above MYSY ceiling
                m = row_member
                scheme = scheme_for_member(MYSY, m, income=650_000)
                unit_rows.append(
                    unit_row(unit_id, scheme, m.person_id, m.person_name, m.family_id, district, taluka, m.village or village)
                )
                pay_rows.append(
                    pay_row(pay_id, unit_id, scheme[2], f"bank-{dslug}-{tslug}-{i:02d}", txn)
                )
            elif i == 3:
                unit_rows.append(
                    unit_row(
                        unit_id,
                        scheme_for_member(WIDOW, mutual),
                        mutual.person_id,
                        mutual.person_name,
                        mutual.family_id,
                        district,
                        taluka,
                        mutual.village or village,
                    )
                )
                pay_rows.append(
                    pay_row(pay_id, unit_id, WIDOW[2], f"bank-{dslug}-{tslug}-{i:02d}", txn)
                )
            elif i == 4:
                # 802 MUTUAL_EXCLUSION — widow + OAP overlap
                unit_rows.append(
                    unit_row(
                        unit_id,
                        scheme_for_member(OAP, mutual),
                        mutual.person_id,
                        mutual.person_name,
                        mutual.family_id,
                        district,
                        taluka,
                        mutual.village or village,
                        period_start="2024-09-01",
                        period_end="2025-08-31",
                    )
                )
                pay_rows.append(
                    pay_row(
                        pay_id,
                        unit_id,
                        3500,
                        f"bank-{dslug}-{tslug}-{i:02d}",
                        txn,
                        period_start="2024-09-01",
                        period_end="2025-03-31",
                    )
                )
            elif i == 5:
                unit_rows.append(
                    unit_row(
                        unit_id,
                        scheme_for_member(GIRL, dup),
                        dup.person_id,
                        dup.person_name,
                        dup.family_id,
                        district,
                        taluka,
                        dup.village or village,
                    )
                )
                pay_rows.append(
                    pay_row(pay_id, unit_id, GIRL[2], f"bank-{dslug}-{tslug}-{i:02d}", txn)
                )
            elif i == 6:
                # 801 — two active enrollments, same person and scheme
                unit_rows.append(
                    unit_row(
                        unit_id,
                        scheme_for_member(GIRL, dup),
                        dup.person_id,
                        dup.person_name,
                        dup.family_id,
                        district,
                        taluka,
                        dup.village or village,
                    )
                )
                pay_rows.append(
                    pay_row(pay_id, unit_id, GIRL[2], f"bank-{dslug}-{tslug}-{i:02d}", txn)
                )
            elif 7 <= i <= 10:
                # 804 — four unrelated families, one shared bank destination
                bm = bank_members[i - 7]
                scheme = SCHEMES[(i - 1) % len(SCHEMES)]
                unit_rows.append(
                    unit_row(
                        unit_id,
                        scheme_for_member(scheme, bm),
                        bm.person_id,
                        bm.person_name,
                        bm.family_id,
                        district,
                        taluka,
                        bm.village or village,
                    )
                )
                pay_rows.append(pay_row(pay_id, unit_id, scheme[2], shared_bank, txn))
            elif i == 11:
                # 803 — payment after verified death (MYSY grace 90 days)
                if district == "Banaskantha" and taluka == "Deesa":
                    pid, pname, fid = KAVITA_RATHOD
                    death_m = RegistryMember(pid, pname, fid, district, taluka, "Deesa", 72000, 44)
                else:
                    death_m = death
                unit_rows.append(
                    unit_row(
                        unit_id,
                        scheme_for_member(MYSY, death_m),
                        death_m.person_id,
                        death_m.person_name,
                        death_m.family_id,
                        district,
                        taluka,
                        death_m.village or village,
                    )
                )
                pay_rows.append(
                    pay_row(pay_id, unit_id, MYSY[2], f"bank-{dslug}-{tslug}-{i:02d}", txn)
                )
                verif_rows.append(
                    f"({q(uid('verif', district, taluka, 'death'))}, {q(death_m.person_id)}, {q(death_m.family_id)}, "
                    f"'DEATH', '2024-06-01', 'CIVIL_REGISTRATION', 'HIGH')"
                )
            else:
                m = row_member
                scheme = SCHEMES[(i - 1) % len(SCHEMES)]
                unit_rows.append(
                    unit_row(
                        unit_id,
                        scheme_for_member(scheme, m),
                        m.person_id,
                        m.person_name,
                        m.family_id,
                        district,
                        taluka,
                        m.village or village,
                    )
                )
                pay_rows.append(
                    pay_row(pay_id, unit_id, scheme[2], f"bank-{dslug}-{tslug}-{i:02d}", txn)
                )

            emp_code = f"GJ-{dslug[:3]}-{tslug[:6]}-{i:02d}"
            emp_id = uid("emp", district, taluka, str(i))
            ddo = f"DDO-{tslug[:8]}-{i:02d}"
            emp_rows.append(
                f"({q(emp_id)}, {q(emp_code)}, {q(row_member.person_name)}, {q(ddo)}, 'Clerk', 'L5', 'ACTIVE', "
                f"'2024-04-01', {q(district)}, {q(taluka)})"
            )
            pr_id = uid("pr", district, taluka, str(i))
            gross = 35000 + (i * 137) % 8000
            net = gross - 2500
            payroll_rows.append(
                f"({q(pr_id)}, {q(emp_code)}, 'BASIC', '2024-08-01', '2024-08-31', {gross}, {net}, {q(ddo)}, {q(f'PAY-{emp_code}-202408')})"
            )

    lines.append(
        "INSERT INTO entitlement_unit (id, scheme_id, scheme_name, person_id, person_name, family_id, district, taluka, village,"
        " period_start, period_end, authorized_amount, income_snapshot, age_snapshot, status)"
    )
    lines.append("VALUES\n  " + ",\n  ".join(unit_rows))
    lines.append(
        "ON CONFLICT (id) DO UPDATE SET scheme_id = EXCLUDED.scheme_id, scheme_name = EXCLUDED.scheme_name,"
        " person_id = EXCLUDED.person_id, person_name = EXCLUDED.person_name, family_id = EXCLUDED.family_id,"
        " district = EXCLUDED.district, taluka = EXCLUDED.taluka, village = EXCLUDED.village,"
        " period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end,"
        " authorized_amount = EXCLUDED.authorized_amount, income_snapshot = EXCLUDED.income_snapshot,"
        " age_snapshot = EXCLUDED.age_snapshot, status = EXCLUDED.status;\n"
    )

    lines.append(
        "INSERT INTO payment_settlement (id, unit_id, period_start, period_end, amount, status, bank_token, transaction_ref)"
    )
    lines.append("VALUES\n  " + ",\n  ".join(pay_rows))
    lines.append("ON CONFLICT (id) DO NOTHING;\n")

    if verif_rows:
        lines.append(
            "INSERT INTO verification_event (id, person_id, family_id, event_type, event_date, source, confidence)"
        )
        lines.append("VALUES\n  " + ",\n  ".join(verif_rows))
        lines.append("ON CONFLICT (id) DO NOTHING;\n")

    lines.append(
        "INSERT INTO employee_identity (id, employee_code, person_name, ddo_code, post_title, pay_level, status, status_since, district, taluka)"
    )
    lines.append("VALUES\n  " + ",\n  ".join(emp_rows))
    lines.append(
        "ON CONFLICT (id) DO UPDATE SET person_name = EXCLUDED.person_name, ddo_code = EXCLUDED.ddo_code,"
        " district = EXCLUDED.district, taluka = EXCLUDED.taluka;\n"
    )

    lines.append(
        "INSERT INTO payroll_settlement (id, employee_code, component, period_start, period_end, gross_amount, net_amount, ddo_code, transaction_ref)"
    )
    lines.append("VALUES\n  " + ",\n  ".join(payroll_rows))
    lines.append("ON CONFLICT (id) DO NOTHING;\n")

    lines.append(END)
    return "\n".join(lines) + "\n"


def generate_resolved_cases(by_dt: dict[tuple[str, str], list[RegistryMember]], count: int = RESOLVED_CASE_COUNT) -> str:
    """Historical closed cases for the Resolved tab (alerts status RESOLVED, with decision and optional outcome)."""
    lines: list[str] = [
        RESOLVED_BEGIN,
        f"-- {count} resolved integrity cases (beneficiary + payroll) for demo Resolved inbox.",
        "",
    ]
    unit_rows: list[str] = []
    case_rows: list[str] = []
    alert_rows: list[str] = []
    action_rows: list[str] = []
    audit_rows: list[str] = []
    rules_ben = [
        ("802", MYSY, "HIGH", 5000, {"variant": "OVER_SETTLEMENT", "authorizedAmount": 10000, "netSettled": 15000}),
        ("801", GIRL, "HIGH", 0, {"activeEnrollments": 2}),
        ("806", MYSY, "MEDIUM", 0, {"incomeSnapshot": 650000, "ageSnapshot": 44}),
        ("804", OAP, "MEDIUM", 0, {"bankToken": "****4821", "distinctPeople": 5, "distinctUnits": 5}),
        ("803", WIDOW, "HIGH", 3000, {"eventType": "DEATH", "eventDate": "2024-06-01", "graceDays": 30}),
        ("805", MYSY, "MEDIUM", 0, {"operatorId": "OP-RESOLVED", "bankChanges30d": 6}),
    ]
    rules_pay = [
        ("S01", "HIGH", 42000, {"overlapDays": 31, "ddoA": "DDO-A", "ddoB": "DDO-B"}),
        ("S05", "HIGH", 4000, {"authorizedRate": 28000, "settledAmount": 32000}),
        ("S06", "MEDIUM", 0, {"reasons": ["MISSING_SERVICE_ORDER"]}),
    ]
    outcomes = [
        ("DISMISSED", "CLOSED", None, "Checked against source records; no overpayment."),
        ("CONFIRMED_OVERPAYMENT", "ACTION_RECORDED", "RECOVERY_RECORD", "Duplicate settled; recovery recorded in treasury."),
        ("DATA_ERROR", "ACTION_RECORDED", "MASTER_CORRECTION", "Master bank account corrected at taluka office."),
        ("SUSPECTED_OVERPAYMENT", "ACTION_RECORDED", "PAYMENT_ADJUSTMENT", "Next cycle adjusted after field verification."),
        ("LEGITIMATE_EXCEPTION", "ACTION_RECORDED", "DISMISS", "Approved exception documented; case closed."),
    ]

    all_members: list[RegistryMember] = []
    for district, taluka, _v in PILOT_TALUKAS:
        all_members.extend(member_pool(by_dt, district, taluka))
    if not all_members:
        raise RuntimeError("No family_registry members for resolved-case seed.")

    for i in range(1, count + 1):
        case_id = uid("resolved-case", str(i))
        alert_id = uid("resolved-alert", str(i))
        unit_id = uid("resolved-unit", str(i))
        domain = "BENEFICIARY"
        is_payroll = False
        classification, case_status, action_type, decision = outcomes[(i - 1) % len(outcomes)]
        detected = spread_detected(case_id, ref=SEED_LOAD_AT).strftime("%Y-%m-%d %H:%M:%S")
        if is_payroll:
            rule, severity, delta, ev_extra = rules_pay[(i // 10) % len(rules_pay)]
            emp_code = f"GJ-RESOLVED-{i:03d}"
            person_name = f"Resolved Demo Employee {i}"
            person_id = emp_code
            district, taluka, village = "Ahmedabad", "Dholka", "Dholka"
            scheme_id, scheme_name = "NULL", "NULL"
            evidence = {"employeeCode": emp_code, "post": "Clerk", "ddoCode": f"DDO-RES-{i:03d}", **ev_extra}
            evidence["unitIds"] = [unit_id]
            title = f"Rule {rule} — {person_name}"
            unit_rows.append(
                f"({q(unit_id)}, NULL, NULL, {q(person_id)}, {q(person_name)}, NULL, "
                f"{q(district)}, {q(taluka)}, {q(village)}, '2024-04-01', '2025-03-31', 0, 0, 30, 'ACTIVE')"
            )
        else:
            rule, scheme, severity, delta, ev_extra = rules_ben[(i - 1) % len(rules_ben)]
            scheme_id, scheme_name, auth_amt, age, income = scheme
            m = all_members[(50 + i) % len(all_members)]
            district, taluka, village = m.district, m.taluka, m.village
            person_id, person_name, family_id = m.person_id, m.person_name, m.family_id
            evidence = dict(ev_extra)
            evidence["unitIds"] = [unit_id]
            title = f"Rule {rule} — {person_name}"
            unit_rows.append(
                unit_row(
                    unit_id,
                    scheme_for_member(scheme, m),
                    person_id,
                    person_name,
                    family_id,
                    district,
                    taluka,
                    village,
                )
            )

        notice = "true" if classification == "CONFIRMED_OVERPAYMENT" and i % 3 == 0 else "false"
        closed = detected
        verified_at_sql = "NULL"
        verified_by_sql = "NULL"
        verification_note_sql = "NULL"
        final_status = case_status
        if case_status == "ACTION_RECORDED" and i <= count - RESOLVED_AWAITING_VERIFY:
            action_ts = action_timestamp(detected, case_id)
            verified_at_sql = q(verification_timestamp(action_ts, case_id))
            verified_by_sql = q(DEPT_ADMIN_VERIFIED_BY)
            verification_note_sql = q(verification_note(case_id, action_type))
            final_status = "CLOSED"
            closed = verification_timestamp(action_ts, case_id)
        elif case_status == "ACTION_RECORDED":
            closed = action_timestamp(detected, case_id)
        elif case_status == "CLOSED":
            closed = decision_timestamp(detected, case_id)
        case_rows.append(
            f"({q(case_id)}, {q(domain)}, {q(title)}, {q(final_status)}, NULL, {q(classification)}, "
            f"{q(decision[:250])}, {notice}, {q(detected)}, {q(closed)}, "
            f"{verified_at_sql}, {verified_by_sql}, {verification_note_sql})"
        )
        alert_rows.append(
            f"({q(alert_id)}, {q(domain)}, {q(rule)}, {q(severity)}, 'RESOLVED', {json_sql(evidence)}, "
            f"{q(person_id)}, {q(person_name)}, {q(district)}, {q(taluka)}, "
            f"{q(scheme_id) if scheme_id != 'NULL' else 'NULL'}, "
            f"{q(scheme_name) if scheme_name != 'NULL' else 'NULL'}, "
            f"{delta if delta else 'NULL'}, {q(detected)}, {q(case_id)})"
        )
        decision_ts = decision_timestamp(detected, case_id)
        audit_rows.append(
            f"({q(uid('resolved-audit-dec', str(i)))}, {q(case_id)}, 'dept_admin', 'DEPT_ADMIN', 'DECISION', "
            f"{json_sql({'classification': classification})}, {q(decision_ts)})"
        )
        if action_type:
            ref = f"GOV-INT-RES{i:04d}"
            action_ts = action_timestamp(detected, uid("resolved-action", str(i)))
            action_rows.append(
                f"({q(uid('resolved-action', str(i)))}, {q(case_id)}, {q(action_type)}, 'dept_admin', "
                f"{json_sql({'note': decision[:120]})}, {q(ref)}, {q(action_ts)})"
            )
            audit_rows.append(
                f"({q(uid('resolved-audit-act', str(i)))}, {q(case_id)}, 'dept_admin', 'DEPT_ADMIN', "
                f"{q('ACTION_' + action_type)}, {json_sql({'externalRef': ref})}, {q(action_ts)})"
            )
            if final_status == "CLOSED" and verified_at_sql != "NULL":
                audit_rows.append(
                    f"({q(uid('resolved-audit-verify', str(i)))}, {q(case_id)}, 'dept_admin', 'DEPT_ADMIN', "
                    f"'VERIFIED_CLOSED', {json_sql({'note': verification_note(case_id, action_type)})}, {verified_at_sql})"
                )

    lines.append(
        "INSERT INTO entitlement_unit (id, scheme_id, scheme_name, person_id, person_name, family_id, district, taluka, village,"
        " period_start, period_end, authorized_amount, income_snapshot, age_snapshot, status)"
    )
    lines.append("VALUES\n  " + ",\n  ".join(unit_rows))
    lines.append("ON CONFLICT (id) DO UPDATE SET person_id = EXCLUDED.person_id, person_name = EXCLUDED.person_name, family_id = EXCLUDED.family_id;\n")

    lines.append(
        "INSERT INTO integrity_case (id, domain, title, status, assignee, classification, decision_text, notice_required,"
        " created_at, updated_at, verified_at, verified_by, verification_note)"
    )
    lines.append("VALUES\n  " + ",\n  ".join(case_rows))
    lines.append(
        "ON CONFLICT (id) DO UPDATE SET domain = EXCLUDED.domain, status = EXCLUDED.status, classification = EXCLUDED.classification,"
        " decision_text = EXCLUDED.decision_text, updated_at = EXCLUDED.updated_at,"
        " verified_at = EXCLUDED.verified_at, verified_by = EXCLUDED.verified_by, verification_note = EXCLUDED.verification_note;\n"
    )

    lines.append(
        "INSERT INTO integrity_alert (id, domain, rule_code, severity, status, evidence, person_id, person_name, district, taluka,"
        " scheme_id, scheme_name, amount_delta, detected_at, case_id)"
    )
    lines.append("VALUES\n  " + ",\n  ".join(alert_rows))
    lines.append(
        "ON CONFLICT (id) DO UPDATE SET domain = EXCLUDED.domain, status = EXCLUDED.status,"
        " person_name = EXCLUDED.person_name, person_id = EXCLUDED.person_id, case_id = EXCLUDED.case_id;\n"
    )

    if action_rows:
        lines.append(
            "INSERT INTO integrity_action (id, case_id, action_type, authoriser, payload, external_ref, created_at)"
        )
        lines.append("VALUES\n  " + ",\n  ".join(action_rows))
        lines.append("ON CONFLICT (id) DO NOTHING;\n")

    lines.append(
        "INSERT INTO integrity_audit_log (id, case_id, actor, actor_role, action, details, created_at)"
    )
    lines.append("VALUES\n  " + ",\n  ".join(audit_rows))
    lines.append("ON CONFLICT (id) DO NOTHING;\n")

    lines.append(RESOLVED_END)
    return "\n".join(lines) + "\n"


def generate_person_name_sync(by_dt: dict[tuple[str, str], list[RegistryMember]]) -> str:
    """One-off SQL to replace legacy demo placeholders on open rows (Pilot *, etc.) with family registry names."""
    seen: dict[str, str] = {}
    for members in by_dt.values():
        for m in members:
            seen.setdefault(m.person_id, m.person_name)
    lines = [
        "-- Sync person_name on expenditure_integrity rows from family registry (run after seed if inbox shows Pilot * names).",
        "SET search_path TO expenditure_integrity, public;",
    ]
    for pid, name in sorted(seen.items()):
        lines.append(
            f"UPDATE entitlement_unit SET person_name = {q(name)} WHERE person_id = {q(pid)} "
            f"AND (person_name IS NULL OR person_name LIKE 'Pilot %' OR person_name LIKE 'Resolved Demo %');"
        )
        lines.append(
            f"UPDATE integrity_alert SET person_name = {q(name)} WHERE person_id = {q(pid)} "
            f"AND (person_name IS NULL OR person_name LIKE 'Pilot %' OR person_name LIKE 'Resolved Demo %');"
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    root = Path(__file__).resolve().parent
    seed = root / "seed_expenditure_integrity.sql"
    bulk = root / "seed_expenditure_integrity_taluka_bulk.sql"
    by_dt = load_family_registry(root)
    block = generate_bulk(by_dt)
    bulk.write_text(block, encoding="utf-8")

    text = seed.read_text(encoding="utf-8")
    if BEGIN in text and END in text:
        pre = text.split(BEGIN)[0].rstrip() + "\n\n"
        post = text.split(END)[1].lstrip()
        if RESOLVED_BEGIN in post:
            post = post.split(RESOLVED_BEGIN)[0].rstrip()
        text = pre + block + ("\n\n" + post if post else "")
    else:
        text = text.rstrip() + "\n\n" + block

    resolved_block = generate_resolved_cases(by_dt)
    if RESOLVED_BEGIN in text:
        pre = text.split(RESOLVED_BEGIN)[0].rstrip() + "\n\n"
        post = text.split(RESOLVED_END)[1].lstrip() if RESOLVED_END in text else ""
        text = pre + resolved_block + ("\n" + post if post else "")
    else:
        text = text.rstrip() + "\n\n" + resolved_block
    seed.write_text(text, encoding="utf-8")
    sync_path = root / "sync_expenditure_integrity_person_names.sql"
    sync_path.write_text(generate_person_name_sync(by_dt), encoding="utf-8")

    taluka_count = len(PILOT_TALUKAS)
    rows = taluka_count * PER_TALUKA
    print(f"Wrote {bulk.name}, {sync_path.name}, and updated {seed.name}")
    print(f"Pilot talukas: {taluka_count}; entitlement units: {rows}; employees: {rows}")
    print(f"Resolved sample cases: {RESOLVED_CASE_COUNT} (Resolved tab).")
    print("After loading seed, run detection once (all districts) to populate the open alert inbox.")


if __name__ == "__main__":
    main()
