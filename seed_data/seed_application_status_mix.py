#!/usr/bin/env python3
"""Create a mixed PENDING / APPROVED / ESCALATED sample of 20 workflow cases.

Keeps the existing 8 demo queue applications pending (officer login scenes)
and adds 12 more: 7 approved + 5 escalated.
"""
from __future__ import annotations

import json
import subprocess
import time
import urllib.error
import urllib.request

BASE = "http://localhost:30073"
PSQL = [
    "kubectl", "exec", "-n", "egov",
    "deployment/postgres", "--",
    "psql", "-U", "egovuser", "-d", "egov_db", "-At", "-c",
]


def http_json(method: str, path: str, body: dict | None = None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def pid(engine_ref: str) -> str:
    return engine_ref.removeprefix("FLW-").removeprefix("DGT-")


def create(path: str, body: dict) -> str:
    app = http_json("POST", path, body)
    ref = app["engineRef"]
    print(f"  created {ref}  {app.get('status')}  {app.get('currentTask') or app.get('applicantName') or ''}")
    return ref


def approve_until_done(svc: str, ref: str, max_steps: int = 6) -> str:
    status = "PENDING"
    for _ in range(max_steps):
        app = http_json("POST", f"/{svc}/v1/applications/{ref}/approve")
        status = app.get("status") or "PENDING"
        if status != "PENDING":
            break
    print(f"  {ref} -> {status}")
    return status


def escalate(schema: str, engine_ref: str, timeout_s: int = 25) -> bool:
    process_id = pid(engine_ref)
    sql = (
        f"UPDATE {schema}.act_ru_timer_job "
        f"SET duedate_ = NOW() - INTERVAL '10 minutes' "
        f"WHERE process_instance_id_ = '{process_id}';"
    )
    subprocess.check_call(PSQL + [sql], stdout=subprocess.DEVNULL)
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        remaining = subprocess.check_output(
            PSQL + [
                f"SELECT COUNT(*) FROM {schema}.act_ru_execution "
                f"WHERE proc_inst_id_ = '{process_id}' AND parent_id_ IS NULL;"
            ],
            text=True,
        ).strip()
        if remaining == "0":
            print(f"  {engine_ref} -> ESCALATED")
            return True
        time.sleep(1)
    print(f"  WARN {engine_ref} still running after timer bump")
    return False


def insert_marriage(engine_ref: str, app_no: str, applicant: str, spouse: str, status: str) -> None:
    task = "NULL" if status != "PENDING" else "'Pending Approval'"
    sql = f"""
INSERT INTO marriage_cert.applications (
  engine_ref, application_no, business_id, workflow_id,
  applicant_name, spouse_name, tenant_id, status, current_task,
  assignee, candidate_groups, created_at
) VALUES (
  '{engine_ref}', '{app_no}', 'MC-{app_no}', '{engine_ref}',
  '{applicant}', '{spouse}', 'pg', '{status}', {task},
  NULL, 'MARRIAGE_APPROVER', NOW() - INTERVAL '4 hours'
)
ON CONFLICT (engine_ref) DO UPDATE SET
  status = EXCLUDED.status,
  current_task = EXCLUDED.current_task;
"""
    subprocess.check_call(PSQL + [sql], stdout=subprocess.DEVNULL)
    print(f"  marriage {engine_ref} -> {status}")


def stats() -> dict:
    out = {}
    for svc in [
        "caste-certificate-service",
        "marriage-certificate-service",
        "pension-service",
        "family-member-service",
        "scheme-application-service",
    ]:
        data = http_json("GET", f"/{svc}/v1/applications/stats")
        out[svc] = data.get("statusCounts", {})
    return out


def main() -> None:
    print("==> Caste: 2 approved + 1 escalated")
    r1 = create("/caste-certificate-service/v1/applications", {
        "applicantName": "Meena Solanki", "casteCode": "SC", "tenantId": "pg",
        "aadhaarRef": "XXXX-XXXX-2101",
    })
    approve_until_done("caste-certificate-service", r1)
    r2 = create("/caste-certificate-service/v1/applications", {
        "applicantName": "Jignesh Vaghela", "casteCode": "ST", "tenantId": "pg",
        "aadhaarRef": "XXXX-XXXX-2102",
    })
    approve_until_done("caste-certificate-service", r2)
    r3 = create("/caste-certificate-service/v1/applications", {
        "applicantName": "Kiran Makwana", "casteCode": "OBC", "tenantId": "pg",
        "aadhaarRef": "XXXX-XXXX-2103",
    })
    escalate("caste_cert", r3)

    print("==> Pension: 1 approved + 1 escalated")
    p1 = create("/pension-service/v1/applications", {
        "applicantName": "Dhirubhai Desai", "pensionType": "Old Age Pension",
        "aadhaarRef": "XXXX-XXXX-2104", "familyId": "a1000000-0000-0000-0000-000000000001",
        "tenantId": "pg",
    })
    approve_until_done("pension-service", p1)
    p2 = create("/pension-service/v1/applications", {
        "applicantName": "Hansaben Chauhan", "pensionType": "Widow Pension",
        "aadhaarRef": "XXXX-XXXX-2105", "familyId": "a1000000-0000-0000-0000-000000000001",
        "tenantId": "pg",
    })
    escalate("pension", p2)

    print("==> Family member: 1 approved + 1 escalated")
    f1 = create("/family-member-service/v1/applications", {
        "familyId": "a1000000-0000-0000-0000-000000000001",
        "changeType": "ADD", "personName": "Anjali Patel", "personId": "",
        "dob": "2018-04-12", "gender": "F", "relationshipToHead": "DAUGHTER",
        "occupation": "Student", "annualIncome": "0", "casteCategory": "OBC",
        "mobile": "9876541201", "reason": "School admission", "tenantId": "pg",
    })
    approve_until_done("family-member-service", f1)
    f2 = create("/family-member-service/v1/applications", {
        "familyId": "a1000000-0000-0000-0000-000000000001",
        "changeType": "ADD", "personName": "Rohit Patel", "personId": "",
        "dob": "2015-09-03", "gender": "M", "relationshipToHead": "SON",
        "occupation": "Student", "annualIncome": "0", "casteCategory": "OBC",
        "mobile": "9876541202", "reason": "Aadhaar enrolment", "tenantId": "pg",
    })
    escalate("family_member_svc", f2)

    print("==> Scheme application: 1 approved + 1 escalated")
    s1 = create("/scheme-application-service/v1/applications", {
        "schemeId": "a1000001-0000-0000-0000-000000000005",
        "schemeName": "CM Girl Child Education Grant",
        "familyId": "a1000000-0000-0000-0000-000000000001",
        "aadhaarRef": "XXXX-XXXX-2106", "declaredIncome": 98000, "tenantId": "pg",
    })
    approve_until_done("scheme-application-service", s1)
    s2 = create("/scheme-application-service/v1/applications", {
        "schemeId": "b1000001-0000-0000-0000-000000000003",
        "schemeName": "Senior Citizen Health Card",
        "familyId": "a1000000-0000-0000-0000-000000000001",
        "aadhaarRef": "XXXX-XXXX-2107", "declaredIncome": 64000, "tenantId": "pg",
    })
    escalate("scheme_application", s2)

    print("==> Marriage certificates via SQL")
    insert_marriage("DGT-status-mix-approved-0001", "MAR-2608-000101", "Amit Shah", "Nita Shah", "APPROVED")
    insert_marriage("DGT-status-mix-approved-0002", "MAR-2608-000102", "Vijay Joshi", "Leela Joshi", "APPROVED")
    insert_marriage("DGT-status-mix-escalated-0001", "MAR-2608-000103", "Farhan Qureshi", "Ayesha Qureshi", "ESCALATED")

    print("\n==> Status counts")
    totals = {"PENDING": 0, "APPROVED": 0, "ESCALATED": 0}
    for svc, counts in stats().items():
        print(f"  {svc}: {counts}")
        for k, v in counts.items():
            totals[k] = totals.get(k, 0) + int(v)
    print(f"  TOTAL {totals}  cases={sum(totals.values())}")


if __name__ == "__main__":
    main()
