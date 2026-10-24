"""Shared timestamps and verification mix for expenditure integrity demo seeds."""
from __future__ import annotations

from datetime import datetime, timedelta

# When generating seeds, case and alert timestamps are spread across the 12 months before this moment
# (same weighting as seed_data/retime_demo_lib.py and fix_demo_retime_history.sql).

# Keycloak `sub` for username dept.admin (egov realm); same as JWT subject in demo.
DEPT_ADMIN_VERIFIED_BY = "7817b01b-fb92-4113-b6bc-629db405f659"

VERIFICATION_NOTES = [
    "Register shows the corrected record.",
    "Recovery reached the treasury account.",
    "Next cycle register matches the adjustment.",
    "Checked against payroll source; fix holds.",
    "Treasury challan matches the recovery entry.",
]

AWAITING_VERIFICATION_COUNT = 15


def lag_days(key: str, lo: int = 2, hi: int = 12) -> int:
    return lo + (sum(ord(c) for c in key) % (hi - lo + 1))


def verify_lag_days(key: str) -> int:
    return 1 + (sum(ord(c) for c in key) % 10)


def add_days(ts: str, days: int, hour: int = 15, minute: int = 0) -> str:
    dt = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S") + timedelta(days=days)
    dt = dt.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def action_timestamp(case_created: str, stable_id: str) -> str:
    return add_days(case_created, lag_days(stable_id), hour=15, minute=30)


def decision_timestamp(case_created: str, stable_id: str) -> str:
    return add_days(case_created, max(1, lag_days(stable_id) - 1), hour=11, minute=0)


def verification_timestamp(action_ts: str, case_id: str) -> str:
    return add_days(action_ts, verify_lag_days(case_id), hour=14, minute=0)


def verification_note(case_id: str, action_type: str | None) -> str:
    if action_type == "MASTER_CORRECTION":
        return VERIFICATION_NOTES[0]
    if action_type == "RECOVERY_RECORD":
        return VERIFICATION_NOTES[1]
    if action_type == "PAYMENT_ADJUSTMENT":
        return VERIFICATION_NOTES[2]
    idx = sum(ord(c) for c in case_id) % len(VERIFICATION_NOTES)
    return VERIFICATION_NOTES[idx]


def should_leave_awaiting_verification(case_index: int, total_action_recorded: int) -> bool:
    """Keep the last N ACTION_RECORDED rows (by index) awaiting verification."""
    return case_index > total_action_recorded - AWAITING_VERIFICATION_COUNT
