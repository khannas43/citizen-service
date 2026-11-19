#!/usr/bin/env python3
"""Withdraw open demo/test proposals by registration prefix. Deletes nothing.

Default is a dry run. With --apply: set matching open proposals to WITHDRAWN
(note 'demo cleanup'), expire their pending consents, and close their waiting
deliveries (PENDING_CONSENT / RETRYING → BLOCKED_EXPIRED). Never touches the
ledger, audit, persons, source records, delivered rows, or proposals with no
event (CITIZEN_CONFIRM, MARRIAGE_CONFIRM). Idempotent.

  python3 mdm-service/tools/demo_cleanup.py
  python3 mdm-service/tools/demo_cleanup.py --apply
  python3 mdm-service/tools/demo_cleanup.py --prefix DEMO-VOL- --created-before 2026-11-05T12:00:00Z
"""
from __future__ import annotations
import argparse
import os
import sys
from collections import Counter
from datetime import datetime, timezone

# Test-fixture registration prefixes that pollute the live demo.
# DEMO-VOL-, CRS- and CZ- are available via --prefix but not defaults
# (volume seed and CRS/citizen fixtures stay until explicitly cleaned).
DEFAULT_PREFIXES = [
    "AP-", "FD-", "T-", "W2-", "DEMO-WQ-", "DEMO-DBG-",
]

# Waiting delivery statuses that cleanup closes (never DELIVERED).
_CLOSE_DELIVERY_STATUSES = ("PENDING_CONSENT", "RETRYING")


def _connect(dsn: str | None = None):
    import psycopg
    from psycopg.rows import dict_row
    target = dsn or os.environ.get("MDM_DB_DSN")
    if not target:
        raise SystemExit("Set MDM_DB_DSN or pass dsn=")
    return psycopg.connect(target, row_factory=dict_row)


def _parse_created_before(value: str | None) -> datetime | None:
    if not value:
        return None
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError as e:
        raise SystemExit(f"Invalid --created-before timestamp {value!r}: {e}") from e
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _event_filter(prefixes: list[str], created_before: datetime | None):
    """SQL fragment and params selecting events by registration prefix (and optional received_at)."""
    parts, params = [], []
    for p in prefixes:
        parts.append("e.payload->>'registration_no' LIKE %s")
        params.append(p + "%")
    clause = "(" + " OR ".join(parts) + ")"
    if created_before is not None:
        clause = f"({clause} AND e.received_at < %s)"
        params.append(created_before)
    return clause, params


def _delivery_status_counts(cur, like: str, created_before: datetime | None) -> dict:
    sql = """SELECT d.status, count(*) AS n FROM mdm.delivery d
             JOIN mdm.event e ON e.id = d.event_id
             WHERE d.status = ANY(%s)
               AND e.payload->>'registration_no' LIKE %s"""
    params: list = [list(_CLOSE_DELIVERY_STATUSES), like]
    if created_before is not None:
        sql += " AND e.received_at < %s"
        params.append(created_before)
    sql += " GROUP BY d.status"
    cur.execute(sql, params)
    return {r["status"]: r["n"] for r in cur.fetchall()}


def _counts(cur, prefixes: list[str], created_before: datetime | None = None) -> list[dict]:
    out = []
    for pfx in prefixes:
        like = pfx + "%"
        time_sql = ""
        time_params: list = []
        if created_before is not None:
            time_sql = " AND e.received_at < %s"
            time_params = [created_before]
        cur.execute(
            f"""SELECT count(*) AS n FROM mdm.event e
                WHERE e.payload->>'registration_no' LIKE %s{time_sql}""",
            [like, *time_params],
        )
        events = cur.fetchone()["n"]
        cur.execute(
            f"""SELECT count(*) AS n FROM mdm.proposal pr
                JOIN mdm.event e ON e.id = pr.event_id
                WHERE pr.status='PROPOSED' AND e.payload->>'registration_no' LIKE %s{time_sql}""",
            [like, *time_params],
        )
        open_props = cur.fetchone()["n"]
        cur.execute(
            f"""SELECT pr.reason_code, count(*) AS n FROM mdm.proposal pr
                JOIN mdm.event e ON e.id = pr.event_id
                WHERE pr.status='PROPOSED' AND e.payload->>'registration_no' LIKE %s{time_sql}
                GROUP BY pr.reason_code""",
            [like, *time_params],
        )
        by_reason = {r["reason_code"]: r["n"] for r in cur.fetchall()}
        cur.execute(
            f"""SELECT count(*) AS n FROM mdm.consent c
                JOIN mdm.event e ON e.id = c.event_id
                WHERE c.status='PENDING' AND e.payload->>'registration_no' LIKE %s{time_sql}""",
            [like, *time_params],
        )
        pending_consents = cur.fetchone()["n"]
        by_del_status = _delivery_status_counts(cur, like, created_before)
        pending_deliveries = sum(by_del_status.values())
        out.append({
            "prefix": pfx,
            "events": events,
            "open_proposals": open_props,
            "by_reason": by_reason,
            "pending_consents": pending_consents,
            "pending_deliveries": pending_deliveries,
            "deliveries_by_status": by_del_status,
        })
    return out


def run(prefixes: list[str] | None = None, apply: bool = False, dsn: str | None = None,
        created_before: str | datetime | None = None) -> dict:
    prefixes = list(prefixes or DEFAULT_PREFIXES)
    if not prefixes:
        raise SystemExit("No prefixes given")
    cutoff = created_before if isinstance(created_before, datetime) else _parse_created_before(created_before)
    with _connect(dsn) as conn:
        cur = conn.cursor()
        before = _counts(cur, prefixes, cutoff)
        withdrawn = 0
        expired = 0
        closed_deliveries = 0
        closed_by_status = Counter()
        reason_withdrawn = Counter()
        if apply:
            clause, params = _event_filter(prefixes, cutoff)
            cur.execute(
                f"""UPDATE mdm.proposal pr
                   SET status='WITHDRAWN', note='demo cleanup', decided_at=now()
                   FROM mdm.event e
                   WHERE pr.event_id = e.id
                     AND pr.status='PROPOSED'
                     AND pr.event_id IS NOT NULL
                     AND {clause}
                   RETURNING pr.id, pr.reason_code""",
                params,
            )
            rows = cur.fetchall()
            withdrawn = len(rows)
            reason_withdrawn = Counter(r["reason_code"] for r in rows)
            cur.execute(
                f"""UPDATE mdm.consent c
                   SET status='EXPIRED', expires_at=COALESCE(expires_at, now()),
                       ended_reason=COALESCE(ended_reason, 'demo cleanup')
                   FROM mdm.event e
                   WHERE c.event_id = e.id
                     AND c.status='PENDING'
                     AND {clause}
                   RETURNING c.id""",
                params,
            )
            expired = len(cur.fetchall())
            for pfx_row in before:
                for st, n in (pfx_row.get("deliveries_by_status") or {}).items():
                    closed_by_status[st] += n
            cur.execute(
                f"""UPDATE mdm.delivery d
                   SET status='BLOCKED_EXPIRED', updated_at=now()
                   FROM mdm.event e
                   WHERE d.event_id = e.id
                     AND d.status IN ('PENDING_CONSENT','RETRYING')
                     AND {clause}
                   RETURNING d.id""",
                params,
            )
            closed_deliveries = len(cur.fetchall())
            if closed_deliveries == 0:
                closed_by_status = Counter()
            conn.commit()
        else:
            conn.rollback()
        after = _counts(cur, prefixes, cutoff)
    report = {
        "dry_run": not apply,
        "prefixes": prefixes,
        "created_before": cutoff.isoformat() if cutoff else None,
        "by_prefix": before if not apply else after,
        "before": before,
        "after": after,
        "withdrawn": withdrawn,
        "expired_consents": expired,
        "closed_deliveries": closed_deliveries,
        "closed_deliveries_by_status": dict(closed_by_status),
        "withdrawn_by_reason": dict(reason_withdrawn),
    }
    return report


def _print(report: dict) -> None:
    mode = "DRY RUN (no changes)" if report["dry_run"] else "APPLY"
    print(f"demo_cleanup: {mode}")
    print(f"prefixes: {', '.join(report['prefixes'])}")
    if report.get("created_before"):
        print(f"created_before: {report['created_before']} (only events received before this time)")
    else:
        print("created_before: (none — all matching events)")
    print("before:")
    for row in report["before"]:
        print(f"  {row['prefix']}: events={row['events']} open_proposals={row['open_proposals']} "
              f"pending_consents={row['pending_consents']} pending_deliveries={row['pending_deliveries']}")
        for code, n in sorted(row["by_reason"].items(), key=lambda kv: -kv[1]):
            print(f"    proposal {code}: {n}")
        for st, n in sorted((row.get("deliveries_by_status") or {}).items(), key=lambda kv: -kv[1]):
            print(f"    delivery {st}: {n}")
    if not report["dry_run"]:
        print(f"withdrawn: {report['withdrawn']}  expired_consents: {report['expired_consents']}  "
              f"closed_deliveries: {report['closed_deliveries']}")
        for code, n in sorted(report["withdrawn_by_reason"].items(), key=lambda kv: -kv[1]):
            print(f"  withdrawn {code}: {n}")
        for st, n in sorted(report["closed_deliveries_by_status"].items(), key=lambda kv: -kv[1]):
            print(f"  closed delivery {st}: {n}")
        print("after:")
        for row in report["after"]:
            print(f"  {row['prefix']}: events={row['events']} open_proposals={row['open_proposals']} "
                  f"pending_consents={row['pending_consents']} pending_deliveries={row['pending_deliveries']}")
            for code, n in sorted(row["by_reason"].items(), key=lambda kv: -kv[1]):
                print(f"    proposal {code}: {n}")
            for st, n in sorted((row.get("deliveries_by_status") or {}).items(), key=lambda kv: -kv[1]):
                print(f"    delivery {st}: {n}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="Withdraw, expire, and close deliveries (default: dry run)")
    ap.add_argument("--prefix", action="append", default=None,
                    help="Registration prefix (repeatable). Default: built-in test fixture list.")
    ap.add_argument("--created-before", default=None,
                    help="ISO timestamp: only events with received_at before this time are affected.")
    ap.add_argument("--dsn", default=None, help="Postgres DSN (default: MDM_DB_DSN)")
    a = ap.parse_args(argv)
    report = run(prefixes=a.prefix or DEFAULT_PREFIXES, apply=a.apply, dsn=a.dsn,
                 created_before=a.created_before)
    _print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
