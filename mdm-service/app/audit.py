"""Append-only audit log. Each row carries the hash of the previous row, so editing or deleting history is detectable."""
from __future__ import annotations
import hashlib, json
from datetime import datetime, timezone

GENESIS = "0" * 64


def _digest(prev: str, ts: str, actor: str, action: str, subject: str, detail: dict) -> str:
    body = json.dumps([prev, ts, actor, action, subject, detail], sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(body.encode()).hexdigest()


def write(cur, actor: str, action: str, subject: str = "", detail: dict | None = None) -> int:
    detail = detail or {}
    cur.execute("SELECT pg_advisory_xact_lock(770102)")
    cur.execute("SELECT hash FROM mdm.audit ORDER BY seq DESC LIMIT 1")
    row = cur.fetchone()
    prev = row["hash"] if row else GENESIS
    ts = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    h = _digest(prev, ts, actor, action, subject, json.loads(json.dumps(detail, default=str)))
    cur.execute("INSERT INTO mdm.audit (ts, actor, action, subject, detail, prev_hash, hash) VALUES (%s,%s,%s,%s,%s::jsonb,%s,%s) RETURNING seq",
                (ts, actor, action, subject, json.dumps(detail, default=str), prev, h))
    return cur.fetchone()["seq"]


def verify(cur) -> dict:
    cur.execute("SELECT seq, ts, actor, action, subject, detail, prev_hash, hash FROM mdm.audit ORDER BY seq")
    prev, n = GENESIS, 0
    for r in cur.fetchall():
        ts = r["ts"].astimezone(timezone.utc).isoformat(timespec="microseconds")
        if r["prev_hash"] != prev or _digest(prev, ts, r["actor"], r["action"], r["subject"] or "", r["detail"]) != r["hash"]:
            return {"ok": False, "checked": n, "broken_at": r["seq"]}
        prev, n = r["hash"], n + 1
    return {"ok": True, "checked": n, "head": prev}
