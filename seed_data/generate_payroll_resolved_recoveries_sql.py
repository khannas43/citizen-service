#!/usr/bin/env python3
"""
Generate seed_payroll_resolved_recoveries.sql — closed payroll cases for the officer portal
Expenditure Integrity payroll tab (Resolved + Recoveries KPIs).

Targets (PAYROLL domain only):
  - 44 mixed closed cases (no recovery) + 78 recovery cases → 122 RESOLVED alerts total
  - 78 RECOVERY_RECORD actions (Recoveries tab + KPI)

Uses employee_identity rows from seed_expenditure_integrity_taluka_bulk.sql when present.
"""
from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from datetime import datetime

from demo_loop_seed_helpers import (
    AWAITING_VERIFICATION_COUNT,
    DEPT_ADMIN_VERIFIED_BY,
    action_timestamp,
    decision_timestamp,
    verification_note,
    verification_timestamp,
)
from retime_demo_lib import spread_detected

SEED_LOAD_AT = datetime.now().replace(microsecond=0)

NS = uuid.UUID("8b2e1f4a-9c3d-4e5f-a6b7-c8d9e0f1a2b3")
PAYROLL_AWAITING_VERIFY = AWAITING_VERIFICATION_COUNT - 5
RESOLVED_MIXED = 44  # closed cases (dismissed, adjustment, etc.) — Resolved tab variety
RECOVERY_CASES = 78  # confirmed overpayment + recovery — Recoveries tab rows
RECOVERY_ACTION_COUNT = 78  # one treasury record per recovery case (KPI)
RESOLVED_COUNT = RESOLVED_MIXED + RECOVERY_CASES

RULES = [
    ("S01", "HIGH", 42000, {"overlapDays": 31, "overlapStart": "2024-08-01", "overlapEnd": "2024-08-31", "ddoA": "DDO-A", "ddoB": "DDO-B"}),
    ("S05", "HIGH", 4000, {"authorizedRate": 28000, "settledAmount": 32000}),
    ("S02", "MEDIUM", 8500, {"statusSince": "2024-07-01", "lastPayDate": "2024-08-31"}),
    ("S04", "HIGH", 12000, {"duplicateRefs": ["PAY-DUP-1", "PAY-DUP-2"]}),
    ("S06", "MEDIUM", 0, {"daysSinceLifeCert": 400, "lastCertDate": "2023-06-15"}),
    ("S03", "MEDIUM", 6500, {"pensionRate": 18000, "paidAmount": 24500}),
]

OUTCOMES = [
    ("DISMISSED", "CLOSED", None, "Checked payroll and service book; no duplicate payment."),
    ("CONFIRMED_OVERPAYMENT", "ACTION_RECORDED", "RECOVERY_RECORD", "Overpayment confirmed; recovery recorded with treasury."),
    ("DATA_ERROR", "ACTION_RECORDED", "MASTER_CORRECTION", "HR master corrected (DDO / post mapping)."),
    ("SUSPECTED_OVERPAYMENT", "ACTION_RECORDED", "PAYMENT_ADJUSTMENT", "Next salary cycle adjusted after audit."),
    ("LEGITIMATE_EXCEPTION", "ACTION_RECORDED", "DISMISS", "Transfer overlap documented; case closed."),
]


@dataclass(frozen=True)
class Employee:
    employee_code: str
    person_name: str
    ddo_code: str
    district: str
    taluka: str
    post_title: str


def uid(kind: str, *parts: str) -> str:
    return str(uuid.uuid5(NS, f"payroll-history:{kind}:" + ":".join(parts)))


def q(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def json_sql(obj: object) -> str:
    return q(json.dumps(obj, separators=(",", ":")))


def load_employees(seed_dir: Path) -> list[Employee]:
    bulk = seed_dir / "seed_expenditure_integrity_taluka_bulk.sql"
    text = bulk.read_text(encoding="utf-8") if bulk.is_file() else ""
    if not text:
        raise SystemExit(f"Missing {bulk}; run generate_expenditure_integrity_sql.py first.")

    pattern = re.compile(
        r"\('([^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)', '[^']+', '[^']+', '[^']+', "
        r"'([^']+)', '([^']+)'\)"
    )
    out: list[Employee] = []
    for block in text.split("INSERT INTO employee_identity")[1:]:
        if "VALUES" not in block:
            continue
        chunk = block.split("ON CONFLICT", 1)[0]
        for m in pattern.finditer(chunk):
            out.append(
                Employee(
                    employee_code=m.group(2),
                    person_name=m.group(3),
                    ddo_code=m.group(4),
                    post_title=m.group(5),
                    district=m.group(6),
                    taluka=m.group(7),
                )
            )
        if out:
            break
    if len(out) < RESOLVED_COUNT:
        raise SystemExit(f"Need at least {RESOLVED_COUNT} employees in bulk seed, found {len(out)}")
    # Spread across districts/talukas for filter demos
    out.sort(key=lambda e: (e.district, e.taluka, e.employee_code))
    return out


def generate() -> str:
    employees = load_employees(Path(__file__).resolve().parent)
    case_rows: list[str] = []
    alert_rows: list[str] = []
    action_rows: list[str] = []
    audit_rows: list[str] = []
    recovery_case_ids: list[str] = []

    def append_case(
        i: int,
        emp: Employee,
        classification: str,
        case_status: str,
        action_type: str | None,
        decision: str,
        rule_idx: int,
        force_recovery: bool = False,
    ) -> None:
        case_id = uid("case", str(i))
        alert_id = uid("alert", str(i))
        rule, severity, delta, ev_extra = RULES[rule_idx % len(RULES)]
        detected = spread_detected(case_id, ref=SEED_LOAD_AT).strftime("%Y-%m-%d %H:%M:%S")
        action_type_for_verify = "RECOVERY_RECORD" if force_recovery else action_type
        evidence = {
            "employeeCode": emp.employee_code,
            "post": emp.post_title,
            "ddoCode": emp.ddo_code,
            **ev_extra,
        }
        if rule == "S01":
            evidence["ddoA"] = emp.ddo_code
            evidence["ddoB"] = f"{emp.ddo_code}-ALT"
        title = f"Rule {rule} — {emp.person_name}"
        notice = "true" if classification == "CONFIRMED_OVERPAYMENT" and i % 4 == 0 else "false"

        verified_at_sql = "NULL"
        verified_by_sql = "NULL"
        verification_note_sql = "NULL"
        final_status = case_status
        closed = detected
        verify_this = (
            case_status == "ACTION_RECORDED"
            and i <= RESOLVED_COUNT - PAYROLL_AWAITING_VERIFY
        )
        if verify_this:
            action_ts = action_timestamp(detected, case_id)
            verified_at_sql = q(verification_timestamp(action_ts, case_id))
            verified_by_sql = q(DEPT_ADMIN_VERIFIED_BY)
            verification_note_sql = q(verification_note(case_id, action_type_for_verify))
            final_status = "CLOSED"
            closed = verification_timestamp(action_ts, case_id)
        elif case_status == "ACTION_RECORDED":
            closed = action_timestamp(detected, case_id)
        elif case_status == "CLOSED":
            closed = decision_timestamp(detected, case_id)

        case_rows.append(
            f"({q(case_id)}, 'PAYROLL', {q(title)}, {q(final_status)}, NULL, {q(classification)}, "
            f"{q(decision[:250])}, {notice}, {q(detected)}, {q(closed)}, "
            f"{verified_at_sql}, {verified_by_sql}, {verification_note_sql})"
        )
        alert_rows.append(
            f"({q(alert_id)}, 'PAYROLL', {q(rule)}, {q(severity)}, 'RESOLVED', {json_sql(evidence)}, "
            f"{q(emp.employee_code)}, {q(emp.person_name)}, {q(emp.district)}, {q(emp.taluka)}, "
            f"NULL, NULL, {delta if delta else 'NULL'}, {q(detected)}, {q(case_id)})"
        )
        decision_ts = decision_timestamp(detected, case_id)
        audit_rows.append(
            f"({q(uid('audit-dec', str(i)))}, {q(case_id)}, 'payroll_reviewer', 'PAYROLL_REVIEWER', 'DECISION', "
            f"{json_sql({'classification': classification})}, {q(decision_ts)})"
        )
        if force_recovery or (action_type and action_type != "RECOVERY_RECORD"):
            if not force_recovery and action_type:
                ref = f"GOV-PAY-RES{i:04d}"
                action_ts = action_timestamp(detected, uid("action", str(i)))
                action_rows.append(
                    f"({q(uid('action', str(i)))}, {q(case_id)}, {q(action_type)}, 'dept_admin', "
                    f"{json_sql({'note': decision[:120]})}, {q(ref)}, {q(action_ts)})"
                )
                audit_rows.append(
                    f"({q(uid('audit-act', str(i)))}, {q(case_id)}, 'dept_admin', 'DEPT_ADMIN', "
                    f"{q('ACTION_' + action_type)}, {json_sql({'externalRef': ref})}, {q(action_ts)})"
                )
                if verify_this:
                    audit_rows.append(
                        f"({q(uid('audit-verify', str(i)))}, {q(case_id)}, 'dept_admin', 'DEPT_ADMIN', "
                        f"'VERIFIED_CLOSED', {json_sql({'note': verification_note(case_id, action_type)})}, {verified_at_sql})"
                    )
        if force_recovery:
            recovery_case_ids.append((case_id, detected, i, verify_this))

    for i in range(1, RESOLVED_MIXED + 1):
        emp = employees[(i * 7) % len(employees)]
        classification, case_status, action_type, decision = OUTCOMES[(i - 1) % len(OUTCOMES)]
        if classification == "CONFIRMED_OVERPAYMENT":
            classification, case_status, action_type, decision = OUTCOMES[0]
        append_case(i, emp, classification, case_status, action_type, decision, i - 1)

    for j in range(1, RECOVERY_CASES + 1):
        i = RESOLVED_MIXED + j
        emp = employees[(i * 11) % len(employees)]
        decision = "Overpayment confirmed; recovery recorded with treasury."
        append_case(
            i,
            emp,
            "CONFIRMED_OVERPAYMENT",
            "ACTION_RECORDED",
            "RECOVERY_RECORD",
            decision,
            j - 1,
            force_recovery=True,
        )

    for j, (case_id, detected, i, verify_this) in enumerate(recovery_case_ids, start=1):
        action_ts = action_timestamp(detected, uid("recovery", str(j)))
        ref = f"GOV-PAY-REC{j:04d}"
        action_rows.append(
            f"({q(uid('recovery', str(j)))}, {q(case_id)}, 'RECOVERY_RECORD', 'dept_admin', "
            f"{json_sql({'installment': j, 'note': 'Treasury recovery challan recorded.'})}, {q(ref)}, {q(action_ts)})"
        )
        audit_rows.append(
            f"({q(uid('audit-rec', str(j)))}, {q(case_id)}, 'dept_admin', 'DEPT_ADMIN', "
            f"'ACTION_RECOVERY_RECORD', {json_sql({'externalRef': ref})}, {q(action_ts)})"
        )
        if verify_this:
            audit_rows.append(
                f"({q(uid('audit-verify-rec', str(j)))}, {q(case_id)}, 'dept_admin', 'DEPT_ADMIN', "
                f"'VERIFIED_CLOSED', {json_sql({'note': verification_note(case_id, 'RECOVERY_RECORD')})}, "
                f"{q(verification_timestamp(action_ts, case_id))})"
            )

    lines = [
        "-- Payroll tab demo: resolved cases and recovery actions (PAYROLL domain only).",
        f"-- {RESOLVED_MIXED} mixed + {RECOVERY_CASES} recovery RESOLVED alerts; {RECOVERY_ACTION_COUNT} RECOVERY_RECORD actions.",
        "SET search_path TO expenditure_integrity, public;",
        "",
        "INSERT INTO integrity_case (id, domain, title, status, assignee, classification, decision_text, notice_required,"
        " created_at, updated_at, verified_at, verified_by, verification_note)",
        "VALUES",
        "  " + ",\n  ".join(case_rows),
        "ON CONFLICT (id) DO UPDATE SET domain = EXCLUDED.domain, status = EXCLUDED.status, "
        "classification = EXCLUDED.classification, decision_text = EXCLUDED.decision_text, updated_at = EXCLUDED.updated_at,"
        " verified_at = EXCLUDED.verified_at, verified_by = EXCLUDED.verified_by, verification_note = EXCLUDED.verification_note;",
        "",
        "INSERT INTO integrity_alert (id, domain, rule_code, severity, status, evidence, person_id, person_name, district, taluka,",
        " scheme_id, scheme_name, amount_delta, detected_at, case_id)",
        "VALUES",
        "  " + ",\n  ".join(alert_rows),
        "ON CONFLICT (id) DO UPDATE SET domain = EXCLUDED.domain, status = EXCLUDED.status, "
        "person_name = EXCLUDED.person_name, person_id = EXCLUDED.person_id, case_id = EXCLUDED.case_id, "
        "district = EXCLUDED.district, taluka = EXCLUDED.taluka;",
        "",
    ]
    if action_rows:
        lines.extend(
            [
                "INSERT INTO integrity_action (id, case_id, action_type, authoriser, payload, external_ref, created_at)",
                "VALUES",
                "  " + ",\n  ".join(action_rows),
                "ON CONFLICT (id) DO NOTHING;",
                "",
            ]
        )
    lines.extend(
        [
            "INSERT INTO integrity_audit_log (id, case_id, actor, actor_role, action, details, created_at)",
            "VALUES",
            "  " + ",\n  ".join(audit_rows),
            "ON CONFLICT (id) DO NOTHING;",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    out = Path(__file__).resolve().parent / "seed_payroll_resolved_recoveries.sql"
    out.write_text(generate(), encoding="utf-8")
    print(
        f"Wrote {out.name} ({RESOLVED_MIXED}+{RECOVERY_CASES} resolved alerts, "
        f"{RECOVERY_ACTION_COUNT} recoveries)"
    )


if __name__ == "__main__":
    main()
