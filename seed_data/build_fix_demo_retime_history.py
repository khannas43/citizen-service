#!/usr/bin/env python3
"""Build idempotent SQL to spread expenditure_integrity demo history across the last 12 months."""
from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from retime_demo_lib import (  # noqa: E402
    _add_months,
    case_timeline,
    month_window_start,
    repair_lifecycle,
    spread_detected,
    ts_sql,
)

BACKUP_DIR = ROOT / "backups"
CONFIRMED = "CONFIRMED_OVERPAYMENT"


def _db_creds() -> tuple[str, str]:
    user_b64 = subprocess.check_output(
        ["kubectl", "-n", "citizen", "get", "secret", "db", "-o", "jsonpath={.data.username}"], text=True
    )
    pass_b64 = subprocess.check_output(
        ["kubectl", "-n", "citizen", "get", "secret", "db", "-o", "jsonpath={.data.password}"], text=True
    )
    user = subprocess.check_output(["bash", "-c", f"echo {user_b64} | base64 -d"], text=True).strip()
    password = subprocess.check_output(["bash", "-c", f"echo {pass_b64} | base64 -d"], text=True).strip()
    return user, password


def kubectl_psql(sql: str, tuples_only: bool = True) -> str:
    user, password = _db_creds()
    fmt = ["-t", "-A"] if tuples_only else []
    cmd = [
        "kubectl", "-n", "citizen", "exec", "deploy/postgres", "--",
        "env", f"PGPASSWORD={password}", "psql", "-U", user, "-d", "citizen_db", *fmt, "-c", sql,
    ]
    return subprocess.check_output(cmd, text=True)


def kubectl_psql_file(path: Path) -> None:
    user, password = _db_creds()
    cmd = [
        "kubectl", "-n", "citizen", "exec", "-i", "deploy/postgres", "--",
        "env", f"PGPASSWORD={password}", "psql", "-U", user, "-d", "citizen_db", "-v", "ON_ERROR_STOP=1",
    ]
    subprocess.run(cmd, input=path.read_text(), text=True, check=True)


def fetch_db_now_utc() -> datetime:
    raw = kubectl_psql("SELECT (now() AT TIME ZONE 'UTC')::timestamp(0);").strip()
    return datetime.strptime(raw, "%Y-%m-%d %H:%M:%S")


def fetch_rows() -> dict:
    def q(table: str, cols: str) -> list[dict]:
        raw = kubectl_psql(
            f"COPY (SELECT {cols} FROM expenditure_integrity.{table}) TO STDOUT WITH CSV HEADER;"
        )
        return list(csv.DictReader(raw.strip().splitlines()))

    return {
        "alerts": q(
            "integrity_alert",
            "id, status, rule_code, person_id, scheme_id, amount_delta, detected_at, case_id",
        ),
        "cases": q("integrity_case", "id, status, classification, created_at, updated_at, verified_at"),
        "actions": q("integrity_action", "id, case_id, action_type, created_at"),
        "audits": q("integrity_audit_log", "id, case_id, action, created_at"),
    }


def parse_ts(s: str | None) -> datetime | None:
    if not s or s.upper() == "NULL":
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def fmt_ts(dt: datetime | None) -> str:
    return "" if dt is None else dt.strftime("%Y-%m-%d %H:%M:%S")


def needs_retime(ts: datetime | None, ref: datetime, window_start: datetime) -> bool:
    if ts is None:
        return False
    month_start = ref.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return ts < window_start or ts >= month_start


def apply_lifecycle_repairs(data: dict, plan: dict, ceiling: datetime) -> None:
    cases = {r["id"]: r for r in data["cases"]}
    alerts_by_case: dict[str, list[tuple[str, datetime]]] = defaultdict(list)
    for al in data["alerts"]:
        cid = al.get("case_id")
        if not cid:
            continue
        ts = plan["alert_new"].get(al["id"]) or parse_ts(al["detected_at"])
        if ts:
            alerts_by_case[cid].append((al["id"], ts))
    actions_by_case: dict[str, list[tuple[str, datetime]]] = defaultdict(list)
    for act in data["actions"]:
        ts = plan["action_new"].get(act["id"]) or parse_ts(act["created_at"])
        if ts:
            actions_by_case[act["case_id"]].append((act["id"], ts))
    audits_by_case: dict[str, list[tuple[str, datetime]]] = defaultdict(list)
    for au in data["audits"]:
        cid = au.get("case_id")
        if not cid:
            continue
        ts = plan["audit_new"].get(au["id"]) or parse_ts(au["created_at"])
        if ts:
            audits_by_case[cid].append((au["id"], ts))

    case_ids = set(cases) | set(plan["case_new"])
    for cid in case_ids:
        c = cases.get(cid, {})
        tl = plan["case_new"].get(cid, {})
        created = tl.get("created_at") or parse_ts(c.get("created_at"))
        if not created:
            continue
        updated = tl.get("updated_at") or parse_ts(c.get("updated_at"))
        verified = tl.get("verified_at")
        if verified is None and (c.get("verified_at") or "").strip():
            verified = parse_ts(c["verified_at"])

        repaired = repair_lifecycle(
            cid,
            created=created,
            updated=updated,
            verified_at=verified,
            action_times=actions_by_case.get(cid, []),
            alert_times=alerts_by_case.get(cid, []),
            audit_times=audits_by_case.get(cid, []),
            ceiling=ceiling,
        )
        plan["case_new"][cid] = {
            "created_at": repaired["created_at"],
            "updated_at": repaired["updated_at"],
            "verified_at": repaired["verified_at"],
        }
        plan["alert_new"].update(repaired["alerts"])
        plan["action_new"].update(repaired["actions"])
        plan["audit_new"].update(repaired["audits"])

    for al in data["alerts"]:
        ts = plan["alert_new"].get(al["id"])
        if ts and ts > ceiling:
            plan["alert_new"][al["id"]] = ceiling


def build_order_fix_plan(data: dict, ref: datetime, ceiling: datetime) -> dict:
    plan: dict = {
        "ref": ref,
        "ceiling": ceiling,
        "window_start": month_window_start(ref),
        "alert_new": {},
        "case_new": {},
        "action_new": {},
        "audit_new": {},
    }
    for al in data["alerts"]:
        plan["alert_new"][al["id"]] = parse_ts(al["detected_at"])
    for c in data["cases"]:
        plan["case_new"][c["id"]] = {
            "created_at": parse_ts(c["created_at"]),
            "updated_at": parse_ts(c["updated_at"]),
            "verified_at": parse_ts(c["verified_at"]) if (c.get("verified_at") or "").strip() else None,
        }
    for act in data["actions"]:
        plan["action_new"][act["id"]] = parse_ts(act["created_at"])
    for au in data["audits"]:
        plan["audit_new"][au["id"]] = parse_ts(au["created_at"])
    apply_lifecycle_repairs(data, plan, ceiling)
    return plan


def compute_plan(data: dict, ref: datetime, ceiling: datetime) -> dict:
    cases = {r["id"]: r for r in data["cases"]}
    actions_by_case: dict[str, list[dict]] = defaultdict(list)
    for a in data["actions"]:
        actions_by_case[a["case_id"]].append(a)

    awaiting_ids = {
        cid
        for cid, c in cases.items()
        if c["status"] == "ACTION_RECORDED" and not (c.get("verified_at") or "").strip()
    }

    groups: dict[str, list[dict]] = defaultdict(list)
    for al in data["alerts"]:
        key = f"{al['rule_code']}|{al['person_id']}|{al['scheme_id']}"
        groups[key].append(al)
    for g in groups.values():
        g.sort(key=lambda x: parse_ts(x["detected_at"]) or datetime.min)

    alert_new: dict[str, datetime] = {}
    case_new: dict[str, dict] = {}

    for _key, alerts in groups.items():
        prev_fixed_at = None
        for al in alerts:
            cid = al["case_id"]
            c = cases.get(cid, {})
            detected = spread_detected(al["id"], ref=ref, min_after=prev_fixed_at, ceiling=ceiling)
            is_open = c.get("status") == "OPEN"
            has_decision = not is_open and bool(c.get("classification"))
            has_action = c.get("status") in ("ACTION_RECORDED", "CLOSED")
            verified = bool((c.get("verified_at") or "").strip())
            timeline = case_timeline(
                cid,
                detected,
                has_decision=has_decision,
                has_action=has_action,
                verified=verified,
                force_action_in_last_two_months=cid in awaiting_ids,
                ref=ref,
                ceiling=ceiling,
            )
            alert_new[al["id"]] = timeline["detected_at"]
            case_new.setdefault(cid, timeline)
            if al["status"] == "RESOLVED" and c.get("classification") == CONFIRMED and timeline["updated_at"]:
                prev_fixed_at = timeline["updated_at"]

    action_new: dict[str, datetime] = {}
    audit_new: dict[str, datetime] = {}
    for cid, timeline in case_new.items():
        old_created = parse_ts(cases[cid]["created_at"])
        if not old_created:
            continue
        delta = timeline["created_at"] - old_created
        for act in actions_by_case.get(cid, []):
            old = parse_ts(act["created_at"])
            if old:
                action_new[act["id"]] = old + delta
        audits = sorted(
            [a for a in data["audits"] if a["case_id"] == cid],
            key=lambda x: parse_ts(x["created_at"]) or datetime.min,
        )
        for au in audits:
            old = parse_ts(au["created_at"])
            if old:
                audit_new[au["id"]] = old + delta

    preserve_recurrence(data, alert_new, case_new, ceiling)

    plan = {
        "ref": ref,
        "ceiling": ceiling,
        "window_start": month_window_start(ref),
        "alert_new": alert_new,
        "case_new": case_new,
        "action_new": action_new,
        "audit_new": audit_new,
    }
    apply_lifecycle_repairs(data, plan, ceiling)
    return plan


def preserve_recurrence(
    data: dict,
    alert_new: dict[str, datetime],
    case_new: dict[str, dict],
    ceiling: datetime,
) -> None:
    """Keep the same recurrence count as before retime (OverviewService.loopMetrics)."""
    cases = {r["id"]: r for r in data["cases"]}
    groups: dict[str, list[dict]] = defaultdict(list)
    for al in data["alerts"]:
        if al["person_id"]:
            groups[f"{al['rule_code']}|{al['person_id']}|{al['scheme_id']}"].append(al)

    def group_recurrence_count(use_new: bool) -> int:
        recurred = 0
        for group in groups.values():
            fixed_at = None
            for al in group:
                c = cases.get(al["case_id"], {})
                if al["status"] != "RESOLVED" or c.get("classification") != CONFIRMED:
                    continue
                cid = al["case_id"]
                if use_new:
                    upd = case_new.get(cid, {}).get("updated_at")
                else:
                    upd = parse_ts(c.get("updated_at"))
                if upd and (fixed_at is None or upd < fixed_at):
                    fixed_at = upd
            if fixed_at is None:
                continue
            if any(
                (alert_new.get(a["id"]) if use_new else parse_ts(a["detected_at"])) > fixed_at
                for a in group
            ):
                recurred += 1
        return recurred

    target = group_recurrence_count(False)
    for _ in range(24):
        if group_recurrence_count(True) <= target:
            break
        for group in groups.values():
            fixed_at = None
            for al in group:
                c = cases.get(al["case_id"], {})
                if al["status"] != "RESOLVED" or c.get("classification") != CONFIRMED:
                    continue
                upd = case_new.get(al["case_id"], {}).get("updated_at")
                if upd and (fixed_at is None or upd < fixed_at):
                    fixed_at = upd
            if fixed_at is None:
                continue
            for al in group:
                orig_d = parse_ts(al["detected_at"])
                orig_f = None
                for al2 in group:
                    c2 = cases.get(al2["case_id"], {})
                    if al2["status"] == "RESOLVED" and c2.get("classification") == CONFIRMED:
                        u2 = parse_ts(c2.get("updated_at"))
                        if u2 and (orig_f is None or u2 < orig_f):
                            orig_f = u2
                was_recurrence = orig_d and orig_f and orig_d > orig_f
                new_d = alert_new.get(al["id"])
                if not new_d:
                    continue
                if was_recurrence:
                    if new_d <= fixed_at:
                        h = sum(ord(c) for c in al["id"])
                        bumped = fixed_at + timedelta(days=1 + h % 4, hours=h % 6)
                        alert_new[al["id"]] = min(bumped, ceiling)
                elif new_d > fixed_at:
                    alert_new[al["id"]] = fixed_at - timedelta(days=2 + sum(ord(c) for c in al["id"]) % 5)


def write_order_backups(data: dict) -> None:
    """Snapshot before a lifecycle order fix (undo via --undo-order)."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    specs = [
        ("retime_alert_order_before.csv", data["alerts"], ["id", "detected_at"]),
        ("retime_case_order_before.csv", data["cases"], ["id", "created_at", "updated_at", "verified_at"]),
        ("retime_action_order_before.csv", data["actions"], ["id", "created_at"]),
        ("retime_audit_order_before.csv", data["audits"], ["id", "created_at"]),
    ]
    for name, rows, cols in specs:
        with (BACKUP_DIR / name).open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            for r in rows:
                w.writerow({c: r.get(c, "") for c in cols})


def write_undo_order_from_backups() -> str:
    lines = [
        "-- Restore timestamps captured before lifecycle order fix.",
        "SET search_path TO expenditure_integrity, public;",
        "BEGIN;",
    ]
    mapping = [
        ("retime_alert_order_before.csv", "integrity_alert", "detected_at", "id"),
        ("retime_case_order_before.csv", "integrity_case", None, "id"),
        ("retime_action_order_before.csv", "integrity_action", "created_at", "id"),
        ("retime_audit_order_before.csv", "integrity_audit_log", "created_at", "id"),
    ]
    for fname, table, col, idcol in mapping:
        path = BACKUP_DIR / fname
        if not path.exists():
            continue
        with path.open() as f:
            for row in csv.DictReader(f):
                if table == "integrity_case":
                    for ccol in ("created_at", "updated_at", "verified_at"):
                        val = (row.get(ccol) or "").strip()
                        if val:
                            lines.append(f"UPDATE integrity_case SET {ccol} = '{val}' WHERE id = '{row[idcol]}';")
                        else:
                            lines.append(f"UPDATE integrity_case SET {ccol} = NULL WHERE id = '{row[idcol]}';")
                else:
                    lines.append(
                        f"UPDATE {table} SET {col} = '{row[col]}' WHERE {idcol} = '{row[idcol]}';"
                    )
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def write_backups(data: dict) -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    specs = [
        ("retime_alert_before.csv", data["alerts"], ["id", "detected_at"]),
        ("retime_case_before.csv", data["cases"], ["id", "created_at", "updated_at", "verified_at"]),
        ("retime_action_before.csv", data["actions"], ["id", "created_at"]),
        ("retime_audit_before.csv", data["audits"], ["id", "created_at"]),
    ]
    for name, rows, cols in specs:
        with (BACKUP_DIR / name).open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            for r in rows:
                w.writerow({c: r.get(c, "") for c in cols})


def write_undo_from_backups() -> str:
    lines = [
        "-- Restore timestamps captured before retime (seed_data/backups/retime_*_before.csv).",
        "SET search_path TO expenditure_integrity, public;",
        "BEGIN;",
    ]
    alert_path = BACKUP_DIR / "retime_alert_before.csv"
    if alert_path.exists():
        with alert_path.open() as f:
            for row in csv.DictReader(f):
                lines.append(
                    f"UPDATE integrity_alert SET detected_at = '{row['detected_at']}' WHERE id = '{row['id']}';"
                )
    case_path = BACKUP_DIR / "retime_case_before.csv"
    if case_path.exists():
        with case_path.open() as f:
            for row in csv.DictReader(f):
                for col in ("created_at", "updated_at", "verified_at"):
                    val = (row.get(col) or "").strip()
                    if val:
                        lines.append(f"UPDATE integrity_case SET {col} = '{val}' WHERE id = '{row['id']}';")
                    else:
                        lines.append(f"UPDATE integrity_case SET {col} = NULL WHERE id = '{row['id']}';")
    for path, table in [
        (BACKUP_DIR / "retime_action_before.csv", "integrity_action"),
        (BACKUP_DIR / "retime_audit_before.csv", "integrity_audit_log"),
    ]:
        if not path.exists():
            continue
        with path.open() as f:
            for row in csv.DictReader(f):
                lines.append(
                    f"UPDATE {table} SET created_at = '{row['created_at']}' WHERE id = '{row['id']}';"
                )
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def metrics(data: dict, alert_new: dict, case_new: dict, action_new: dict) -> dict:
    cases = {r["id"]: r for r in data["cases"]}
    alerts = data["alerts"]

    flagged = sum(Decimal(a["amount_delta"]) for a in alerts if a["status"] == "OPEN" and a.get("amount_delta"))
    confirmed = sum(
        Decimal(a["amount_delta"])
        for a in alerts
        if cases.get(a["case_id"], {}).get("classification") == CONFIRMED and a.get("amount_delta")
    )

    by_key: dict[str, list] = defaultdict(list)
    for al in alerts:
        if al["person_id"]:
            by_key[f"{al['rule_code']}|{al['person_id']}|{al['scheme_id']}"].append(al)

    fixed = recurred = 0
    for group in by_key.values():
        fixed_at = None
        for al in group:
            c = cases.get(al["case_id"], {})
            if al["status"] != "RESOLVED" or c.get("classification") != CONFIRMED:
                continue
            cid = al["case_id"]
            upd = case_new.get(cid, {}).get("updated_at") if case_new else parse_ts(c["updated_at"])
            if upd and (fixed_at is None or upd < fixed_at):
                fixed_at = upd
        if fixed_at is None:
            continue
        fixed += 1
        if any((alert_new.get(a["id"]) if alert_new else parse_ts(a["detected_at"])) > fixed_at for a in group):
            recurred += 1

    to_corr = []
    seen = set()
    for act in data["actions"]:
        if act["action_type"] != "MASTER_CORRECTION":
            continue
        cid = act["case_id"]
        if cid in seen:
            continue
        seen.add(cid)
        c0 = case_new.get(cid, {}).get("created_at") if case_new else parse_ts(cases[cid]["created_at"])
        c1 = action_new.get(act["id"]) if action_new else parse_ts(act["created_at"])
        if c0 and c1:
            to_corr.append((c1 - c0).total_seconds() / 86400.0)

    return {
        "openAlerts": sum(1 for a in alerts if a["status"] == "OPEN"),
        "flaggedAmount": float(flagged),
        "confirmedAmount": float(confirmed),
        "recoveredAmount": float(confirmed),
        "fixedFindings": fixed,
        "recurredFindings": recurred,
        "recurrenceRate": (round(recurred * 1000.0 / fixed) / 10.0) if fixed else None,
        "avgDaysToMasterCorrection": round(sum(to_corr) / len(to_corr), 1) if to_corr else None,
        "verifiedClosedCases": sum(1 for c in cases.values() if (c.get("verified_at") or "").strip()),
        "awaitingVerification": sum(1 for c in cases.values() if c["status"] == "ACTION_RECORDED"),
    }


def month_tally(data: dict, plan: dict, ref: datetime) -> list[dict]:
    window_start = month_window_start(ref)
    keys = []
    y, m = window_start.year, window_start.month
    for _ in range(12):
        keys.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m, y = 1, y + 1
    buckets = {k: {"flagged": 0.0, "confirmed": 0.0, "recovered": 0.0} for k in keys}
    cases = {r["id"]: r for r in data["cases"]}
    case_amount: dict[str, float] = defaultdict(float)
    for al in data["alerts"]:
        if al.get("amount_delta"):
            case_amount[al["case_id"]] += float(al["amount_delta"])
    for al in data["alerts"]:
        det = plan["alert_new"].get(al["id"]) or parse_ts(al["detected_at"])
        if det and det >= window_start and al.get("amount_delta"):
            mk = f"{det.year:04d}-{det.month:02d}"
            if mk in buckets:
                buckets[mk]["flagged"] += float(al["amount_delta"])
        c = cases.get(al["case_id"], {})
        if c.get("classification") != CONFIRMED:
            continue
        upd = plan["case_new"].get(al["case_id"], {}).get("updated_at") or parse_ts(c["updated_at"])
        if upd and upd >= window_start and al.get("amount_delta"):
            mk = f"{upd.year:04d}-{upd.month:02d}"
            if mk in buckets:
                buckets[mk]["confirmed"] += float(al["amount_delta"])
    for act in data["actions"]:
        if act["action_type"] != "RECOVERY_RECORD":
            continue
        ts = plan["action_new"].get(act["id"]) or parse_ts(act["created_at"])
        if ts and ts >= window_start:
            mk = f"{ts.year:04d}-{ts.month:02d}"
            if mk in buckets:
                buckets[mk]["recovered"] += case_amount.get(act["case_id"], 0.0)
    return [{"month": k, **buckets[k]} for k in keys]


def emit_sql(data: dict, plan: dict) -> str:
    ref, window_start = plan["ref"], plan["window_start"]
    lines = [
        "-- Spread demo integrity history across the 12-month overview window.",
        "-- Idempotent: each UPDATE matches the row's pre-retime timestamp.",
        "SET search_path TO expenditure_integrity, public;",
        "BEGIN;",
    ]
    alerts = {r["id"]: r for r in data["alerts"]}
    cases = {r["id"]: r for r in data["cases"]}

    for aid, new_dt in sorted(plan["alert_new"].items()):
        old = alerts[aid]["detected_at"]
        if not needs_retime(parse_ts(old), ref, window_start):
            continue
        lines.append(
            f"UPDATE integrity_alert SET detected_at = {ts_sql(new_dt)} "
            f"WHERE id = '{aid}' AND detected_at = '{old}';"
        )

    for cid, tl in sorted(plan["case_new"].items()):
        c = cases[cid]
        for col, new_dt in (
            ("created_at", tl["created_at"]),
            ("updated_at", tl["updated_at"]),
            ("verified_at", tl["verified_at"]),
        ):
            old = (c.get(col) or "").strip()
            if new_dt is None and not old:
                continue
            if new_dt is None:
                lines.append(f"UPDATE integrity_case SET {col} = NULL WHERE id = '{cid}';")
                continue
            if old and not needs_retime(parse_ts(old), ref, window_start):
                continue
            if old:
                lines.append(
                    f"UPDATE integrity_case SET {col} = {ts_sql(new_dt)} WHERE id = '{cid}' AND {col} = '{old}';"
                )
            else:
                lines.append(f"UPDATE integrity_case SET {col} = {ts_sql(new_dt)} WHERE id = '{cid}';")

    actions = {r["id"]: r for r in data["actions"]}
    for aid, new_dt in sorted(plan["action_new"].items()):
        old = actions[aid]["created_at"]
        if not needs_retime(parse_ts(old), ref, window_start):
            continue
        lines.append(
            f"UPDATE integrity_action SET created_at = {ts_sql(new_dt)} "
            f"WHERE id = '{aid}' AND created_at = '{old}';"
        )

    audits = {r["id"]: r for r in data["audits"]}
    for aid, new_dt in sorted(plan["audit_new"].items()):
        old = audits[aid]["created_at"]
        if not needs_retime(parse_ts(old), ref, window_start):
            continue
        lines.append(
            f"UPDATE integrity_audit_log SET created_at = {ts_sql(new_dt)} "
            f"WHERE id = '{aid}' AND created_at = '{old}';"
        )

    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def emit_order_sql(data: dict, plan: dict) -> str:
    """Updates every timestamp that changed (idempotent on pre-fix values)."""
    lines = [
        "-- Fix lifecycle ordering and remove future timestamps.",
        "SET search_path TO expenditure_integrity, public;",
        "BEGIN;",
    ]
    alerts = {r["id"]: r for r in data["alerts"]}
    for aid, new_dt in sorted(plan["alert_new"].items()):
        if new_dt is None:
            continue
        old = alerts[aid]["detected_at"]
        if fmt_ts(parse_ts(old)) == fmt_ts(new_dt):
            continue
        lines.append(
            f"UPDATE integrity_alert SET detected_at = {ts_sql(new_dt)} "
            f"WHERE id = '{aid}' AND detected_at = '{old}';"
        )
    cases = {r["id"]: r for r in data["cases"]}
    for cid, tl in sorted(plan["case_new"].items()):
        c = cases.get(cid)
        if not c:
            continue
        for col in ("created_at", "updated_at", "verified_at"):
            new_dt = tl.get(col)
            old = (c.get(col) or "").strip()
            if new_dt is None and not old:
                continue
            if new_dt is None:
                if old:
                    lines.append(f"UPDATE integrity_case SET {col} = NULL WHERE id = '{cid}' AND {col} = '{old}';")
                continue
            if fmt_ts(parse_ts(old) if old else None) == fmt_ts(new_dt):
                continue
            if old:
                lines.append(
                    f"UPDATE integrity_case SET {col} = {ts_sql(new_dt)} WHERE id = '{cid}' AND {col} = '{old}';"
                )
            else:
                lines.append(f"UPDATE integrity_case SET {col} = {ts_sql(new_dt)} WHERE id = '{cid}' AND {col} IS NULL;")
    actions = {r["id"]: r for r in data["actions"]}
    for aid, new_dt in sorted(plan["action_new"].items()):
        if new_dt is None:
            continue
        old = actions[aid]["created_at"]
        if fmt_ts(parse_ts(old)) == fmt_ts(new_dt):
            continue
        lines.append(
            f"UPDATE integrity_action SET created_at = {ts_sql(new_dt)} "
            f"WHERE id = '{aid}' AND created_at = '{old}';"
        )
    audits = {r["id"]: r for r in data["audits"]}
    for aid, new_dt in sorted(plan["audit_new"].items()):
        if new_dt is None:
            continue
        old = audits[aid]["created_at"]
        if fmt_ts(parse_ts(old)) == fmt_ts(new_dt):
            continue
        lines.append(
            f"UPDATE integrity_audit_log SET created_at = {ts_sql(new_dt)} "
            f"WHERE id = '{aid}' AND created_at = '{old}';"
        )
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def emit_gate_sql(ref: datetime) -> str:
    hold_per = [2, 3, 2, 3]
    unit_id = kubectl_psql(
        "SELECT id::text FROM expenditure_integrity.entitlement_unit WHERE status='ACTIVE' LIMIT 8;"
    ).strip().split("\n")
    if len(unit_id) < 4:
        return "-- skipped: not enough units\n"

    lines = [
        "-- Demo pre-payment gate history (idempotent).",
        "SET search_path TO expenditure_integrity, public;",
        "DO $$ BEGIN",
        "  IF EXISTS (SELECT 1 FROM payment_batch WHERE name LIKE 'Demo payment file %') THEN RETURN; END IF;",
        "END $$;",
        "",
    ]
    total_stopped = 0
    base = ref.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for i in range(4):
        mstart = _add_months(base, -(3 - i))
        label = mstart.strftime("%Y-%m")
        name = f"Demo payment file {label}"
        uploaded = mstart.replace(day=5, hour=9, minute=30)
        batch_id = f"b0000000-0000-4000-8000-{i + 10:012d}"
        lines.append(
            f"INSERT INTO payment_batch (id, name, uploaded_by, uploaded_at, line_count, total_amount) "
            f"VALUES ('{batch_id}', '{name}', 'dept.admin', '{fmt_ts(uploaded)}', 5, 25000) "
            f"ON CONFLICT (id) DO NOTHING;"
        )
        line_rows = []
        for ln in range(1, 6):
            uid = unit_id[(i + ln) % len(unit_id)]
            amt = 5000 + ln * 1000
            ref_line = f"DEMO-{label}-{ln}"
            if ln <= hold_per[i]:
                decided = mstart.replace(day=12 + ln, hour=14, minute=0)
                total_stopped += amt
                line_rows.append(
                    f"(gen_random_uuid(), '{batch_id}'::uuid, {ln}, '{ref_line}', '{uid}'::uuid, "
                    f"'2026-01-01', '2026-03-31', {amt}, 'tok-demo', 'HOLD', "
                    f"'[{{\"code\":\"ALREADY_PAID_FOR_PERIOD\"}}]'::jsonb, 'HOLD_CONFIRMED', "
                    f"'Demo hold confirmed', 'dept.admin', '{fmt_ts(decided)}')"
                )
            else:
                verdict = "CLEAR" if ln % 2 == 0 else "HOLD"
                decision = "RELEASED" if verdict == "HOLD" else "NONE"
                by = "NULL" if decision == "NONE" else "'dept.admin'"
                dec_at = f"'{fmt_ts(mstart.replace(day=14, hour=11))}'" if decision != "NONE" else "NULL"
                line_rows.append(
                    f"(gen_random_uuid(), '{batch_id}'::uuid, {ln}, '{ref_line}', '{uid}'::uuid, "
                    f"'2026-04-01', '2026-06-30', {amt}, 'tok-demo', '{verdict}', '[]'::jsonb, "
                    f"'{decision}', NULL, {by}, {dec_at})"
                )
        lines.append(
            "INSERT INTO payment_batch_line (id, batch_id, line_no, payment_ref, unit_id, period_start, period_end, "
            "amount, bank_token, verdict, reasons, decision, decision_reason, decided_by, decided_at) VALUES\n  "
            + ",\n  ".join(line_rows)
            + ";"
        )
    lines.insert(4, f"-- approx HOLD_CONFIRMED total {total_stopped}")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--undo", action="store_true")
    parser.add_argument("--order-only", action="store_true", help="Fix lifecycle order on current DB (no respread)")
    parser.add_argument("--undo-order", action="store_true", help="Restore timestamps from retime_*_order_before.csv")
    args = parser.parse_args()
    ref = fetch_db_now_utc()
    ceiling = ref - timedelta(hours=1)

    if args.undo_order:
        text = write_undo_order_from_backups()
        (ROOT / "fix_demo_retime_order_undo.sql").write_text(text)
        if args.apply:
            kubectl_psql_file(ROOT / "fix_demo_retime_order_undo.sql")
        print("Order-fix undo SQL written.")
        return

    if args.undo:
        text = write_undo_from_backups()
        (ROOT / "fix_demo_retime_history_undo.sql").write_text(text)
        if args.apply:
            kubectl_psql_file(ROOT / "fix_demo_retime_history_undo.sql")
        print("Undo SQL written.")
        return

    print("Fetching live rows…")
    data = fetch_rows()

    if args.order_only:
        write_order_backups(data)
        plan = build_order_fix_plan(data, ref, ceiling)
        order_path = ROOT / "fix_demo_retime_order.sql"
        order_path.write_text(emit_order_sql(data, plan))
        (ROOT / "fix_demo_retime_order_undo.sql").write_text(write_undo_order_from_backups())
        print(f"Wrote {order_path} ({sum(1 for _ in order_path.open())} lines)")
        if args.apply:
            print("Applying order fix…")
            kubectl_psql_file(order_path)
        return

    write_backups(data)
    plan = compute_plan(data, ref, ceiling)
    before_m = metrics(data, {}, {}, {})
    after_m = metrics(data, plan["alert_new"], plan["case_new"], plan["action_new"])
    months = month_tally(data, plan, ref)

    spread_sql = emit_sql(data, plan)
    order_sql = emit_order_sql(data, plan)
    (ROOT / "fix_demo_retime_history.sql").write_text(spread_sql + "\n" + order_sql)
    (ROOT / "fix_demo_retime_order.sql").write_text(order_sql)
    (ROOT / "fix_demo_retime_history_undo.sql").write_text(write_undo_from_backups())
    (ROOT / "seed_demo_gate_history.sql").write_text(emit_gate_sql(ref))
    (ROOT / "retime_plan_summary.json").write_text(
        json.dumps({"before": before_m, "after_plan": after_m, "byMonth": months}, indent=2)
    )

    print(json.dumps({"before": before_m, "after_plan": after_m}, indent=2))
    print(
        "byMonth non-zero:",
        sum(1 for m in months if m["flagged"] > 0),
        "flagged,",
        sum(1 for m in months if m["confirmed"] > 0),
        "confirmed",
    )

    if args.apply:
        print("Applying retime + order SQL…")
        kubectl_psql_file(ROOT / "fix_demo_retime_history.sql")
        print("Applying gate demo SQL…")
        kubectl_psql_file(ROOT / "seed_demo_gate_history.sql")


if __name__ == "__main__":
    main()
