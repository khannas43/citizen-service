"""Deterministic 12-month spread for expenditure integrity demo history timestamps."""
from __future__ import annotations

import calendar
from datetime import datetime, timedelta

from demo_loop_seed_helpers import (
    action_timestamp,
    decision_timestamp,
    lag_days,
    verification_timestamp,
    verify_lag_days,
)


def _add_months(dt: datetime, months: int) -> datetime:
    y, m = dt.year, dt.month + months
    while m <= 0:
        m += 12
        y -= 1
    while m > 12:
        m -= 12
        y += 1
    d = min(dt.day, calendar.monthrange(y, m)[1])
    return dt.replace(year=y, month=m, day=d)


def month_window_start(ref: datetime) -> datetime:
    """First day 00:00 of the month 11 months before ref's month (matches OverviewService)."""
    first = ref.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return _add_months(first, -11)


def weighted_month_slot(stable_id: str) -> int:
    """0 = oldest month in the 12-month window, 11 = ref month."""
    h = sum(ord(c) for c in stable_id)
    weights = list(range(1, 13))
    total = sum(weights)
    pick = h % total
    acc = 0
    for i, w in enumerate(weights):
        acc += w
        if pick < acc:
            return i
    return 11


def month_start_for_slot(slot: int, ref: datetime) -> datetime:
    base = month_window_start(ref)
    return _add_months(base, slot)


def day_in_month(stable_id: str, month_start: datetime) -> datetime:
    h = sum(ord(c) for c in stable_id)
    max_day = calendar.monthrange(month_start.year, month_start.month)[1]
    day = 1 + (h % max_day)
    hour = 9 + (h % 8)
    minute = (h * 7) % 60
    second = h % 59
    return month_start.replace(day=day, hour=hour, minute=minute, second=second, microsecond=0)


def spread_detected(
    stable_id: str,
    ref: datetime | None = None,
    min_after: datetime | None = None,
    ceiling: datetime | None = None,
) -> datetime:
    """Pick detected/created time in the 12-month window ending at ref, never after ceiling."""
    ref = ref or datetime.utcnow().replace(microsecond=0)
    cap = ceiling or (ref - timedelta(hours=1))
    slot = weighted_month_slot(stable_id)
    start = day_in_month(stable_id, month_start_for_slot(slot, ref))
    if min_after is not None and start <= min_after:
        h = sum(ord(c) for c in stable_id)
        start = min_after + timedelta(days=1 + h % 5)
        start = start.replace(hour=10 + h % 6, minute=(h * 11) % 60, second=0, microsecond=0)
    if start > cap:
        start = cap - timedelta(days=2 + (sum(ord(c) for c in stable_id) % 8))
        start = start.replace(hour=11, minute=30, second=0, microsecond=0)
    if start > cap:
        start = cap - timedelta(minutes=5 + sum(ord(c) for c in stable_id) % 120)
    return start


def case_timeline(
    case_id: str,
    detected: datetime,
    *,
    has_decision: bool,
    has_action: bool,
    verified: bool,
    force_action_in_last_two_months: bool,
    ref: datetime,
    ceiling: datetime,
) -> dict[str, datetime | None]:
    """Return created/detected, decision, action, verified, updated timestamps in order."""
    created = min(detected, ceiling)
    decision = None
    action = None
    verified_at = None
    updated = created

    if has_decision:
        decision = datetime.strptime(
            decision_timestamp(created.strftime("%Y-%m-%d %H:%M:%S"), case_id), "%Y-%m-%d %H:%M:%S"
        )
        if decision <= created:
            decision = created + timedelta(days=1)
        updated = decision
    if has_action:
        action = datetime.strptime(
            action_timestamp(created.strftime("%Y-%m-%d %H:%M:%S"), case_id), "%Y-%m-%d %H:%M:%S"
        )
        if force_action_in_last_two_months:
            anchor = _add_months(
                ref.replace(day=10, hour=15, minute=30, second=0, microsecond=0),
                -(1 + (sum(ord(c) for c in case_id) % 2)),
            )
            if action < anchor:
                action = anchor + timedelta(days=lag_days(case_id + "a", 0, 20))
            if decision and decision >= action:
                decision = action - timedelta(days=2)
        if action <= (decision or created):
            action = (decision or created) + timedelta(days=2)
        updated = action
    if verified and action is not None:
        verified_at = datetime.strptime(
            verification_timestamp(action.strftime("%Y-%m-%d %H:%M:%S"), case_id), "%Y-%m-%d %H:%M:%S"
        )
        if verified_at <= action:
            verified_at = action + timedelta(days=verify_lag_days(case_id))
        updated = verified_at
    elif has_decision and not has_action:
        updated = decision

    updated = max(t for t in (created, decision, action, verified_at, updated) if t is not None)
    if updated > ceiling:
        # Compress the chain backward, keeping order and month where possible.
        verified_at = min(verified_at, ceiling) if verified_at else None
        action = min(action, ceiling - timedelta(hours=2)) if action else None
        decision = min(decision, (action or ceiling) - timedelta(days=1)) if decision else None
        created = min(created, (decision or ceiling) - timedelta(days=1))
        if verified_at and action and verified_at <= action:
            verified_at = min(ceiling, action + timedelta(days=verify_lag_days(case_id)))
        updated = max(t for t in (created, decision, action, verified_at) if t is not None)
        updated = min(updated, ceiling)

    return {
        "created_at": created,
        "detected_at": created,
        "decision_at": decision,
        "action_at": action,
        "verified_at": verified_at,
        "updated_at": updated,
    }


def repair_lifecycle(
    case_id: str,
    *,
    created: datetime,
    updated: datetime | None,
    verified_at: datetime | None,
    action_times: list[tuple[str, datetime]],
    alert_times: list[tuple[str, datetime]],
    audit_times: list[tuple[str, datetime]],
    ceiling: datetime,
) -> dict:
    """Minimal moves so lifecycle order holds and nothing is after ceiling."""
    created = min(created, ceiling)
    actions = sorted(action_times, key=lambda x: x[1])
    new_actions: list[tuple[str, datetime]] = []
    prev = created
    for aid, ts in actions:
        t = min(max(ts, prev + timedelta(seconds=30)), ceiling)
        new_actions.append((aid, t))
        prev = t
    last_action = new_actions[-1][1] if new_actions else created

    new_verified = verified_at
    if new_verified is not None:
        lag = verify_lag_days(case_id)
        new_verified = max(new_verified, last_action + timedelta(days=lag))
        if new_verified <= last_action:
            new_verified = last_action + timedelta(days=max(1, lag))

    new_updated = updated or created
    new_updated = max(new_updated, created, last_action, new_verified or created)
    if new_updated < created:
        new_updated = max(created, last_action, new_verified or created)

    if new_verified and new_verified > new_updated:
        new_updated = new_verified
    if new_updated > ceiling:
        new_updated = ceiling
    if new_verified and new_verified > ceiling:
        new_verified = ceiling - timedelta(minutes=1)
        if new_verified <= last_action:
            new_verified = min(ceiling, last_action + timedelta(hours=1))
    if new_updated > ceiling:
        new_updated = ceiling
    # Re-check actions under new verified/updated
    if new_actions and new_actions[-1][1] > new_updated:
        scale = (new_updated - created).total_seconds() / max(
            1, (new_actions[-1][1] - created).total_seconds()
        )
        rescaled = []
        for aid, ts in new_actions:
            rescaled.append((aid, created + timedelta(seconds=(ts - created).total_seconds() * scale)))
        new_actions = rescaled
        last_action = new_actions[-1][1]

    new_alerts = []
    for aid, ts in alert_times:
        t = min(max(ts, created), ceiling)
        new_alerts.append((aid, t))

    new_audits = []
    prev_a = created
    for lid, ts in sorted(audit_times, key=lambda x: x[1]):
        t = max(min(ts, new_updated), prev_a + timedelta(seconds=15))
        t = min(t, new_updated)
        new_audits.append((lid, t))
        prev_a = t

    return {
        "created_at": created,
        "updated_at": new_updated,
        "verified_at": new_verified,
        "actions": dict(new_actions),
        "alerts": dict(new_alerts),
        "audits": dict(new_audits),
    }


def ts_sql(dt: datetime | None) -> str:
    if dt is None:
        return "NULL"
    return f"'{dt.strftime('%Y-%m-%d %H:%M:%S')}'"
