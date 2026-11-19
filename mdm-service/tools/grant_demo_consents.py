#!/usr/bin/env python3
"""Demo only: play the parents answering YES on synthetic births, so batch approval can be tried.

Grants the pending birth-to-ration-card consents for events whose registration_no starts with
the given prefix (default DEMO-VOL-), through the normal consent path (channel ASSISTED, operator
'demo-script'), so the ledger and audit record each answer. Dry run unless --apply. Never touches
real citizens: only the prefix you give.

  MDM_DB_DSN="host=... dbname=citizen_db ..." python3 mdm-service/tools/grant_demo_consents.py
  ... --apply [--limit 100] [--prefix DEMO-VOL-]
"""
from __future__ import annotations
import argparse, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--prefix", default="DEMO-VOL-")
    ap.add_argument("--limit", type=int, default=0, help="stop after this many (0 = all)")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args(argv)
    import psycopg
    from psycopg.rows import dict_row
    from app import exchange
    dsn = os.environ.get("MDM_DB_DSN")
    if not dsn:
        raise SystemExit("Set MDM_DB_DSN")
    granted = failed = 0
    reasons: dict[str, int] = {}
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        cur = conn.cursor()
        cur.execute("""SELECT c.id FROM mdm.consent c JOIN mdm.event e ON e.id=c.event_id
                       WHERE c.status='PENDING' AND c.purpose='BIRTH_PDS'
                         AND e.payload->>'registration_no' LIKE %s ORDER BY c.id""", (a.prefix + "%",))
        ids = [r["id"] for r in cur.fetchall()]
        if a.limit:
            ids = ids[:a.limit]
        print(f"{len(ids)} pending birth consents match {a.prefix}*  ({'APPLY' if a.apply else 'dry run'})")
        if not a.apply:
            return 0
        for cid in ids:
            cur.execute("SAVEPOINT g")
            try:
                exchange.respond(cur, cid, "GRANT", "demo-script", channel="ASSISTED", operator="demo-script",
                                 note="demo: synthetic parent answered yes")
                cur.execute("RELEASE SAVEPOINT g"); granted += 1
            except Exception as e:  # noqa: BLE001
                cur.execute("ROLLBACK TO SAVEPOINT g"); failed += 1
                reasons[str(e)[:90]] = reasons.get(str(e)[:90], 0) + 1
        conn.commit()
    print(f"granted {granted}, could not grant {failed}")
    for r, n in reasons.items():
        print(f"  {n} x {r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
