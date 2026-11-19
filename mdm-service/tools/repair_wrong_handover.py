#!/usr/bin/env python3
"""Repair consents wrongly ended by the first majority-handover catch-up.

The first live daily job ended a parent's birth consents about newborns because the
query matched on given_by_person_id <> person_id only. Those consents are about a
child (subject_person_id different from the principal) and must stay GRANTED.

Dry run by default. --apply writes. Prints counts and ids only — no names or values.

  python3 mdm-service/tools/repair_wrong_handover.py
  python3 mdm-service/tools/repair_wrong_handover.py --apply

  # On the cluster pod:
  #   kubectl -n citizen cp mdm-service/tools/repair_wrong_handover.py deploy/mdm-service:/tmp/repair_wrong_handover.py
  #   kubectl -n citizen exec deploy/mdm-service -- sh -c 'cd /opt/app && PYTHONPATH=/opt/app python /tmp/repair_wrong_handover.py --apply'
"""
from __future__ import annotations
import argparse, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

ACTOR = "repair-wrong-handover"
WRONG_SQL = """
    SELECT c.id, c.person_id, c.subject_person_id, c.purpose, c.event_id, c.status,
           c.responded_at, c.ended_reason
    FROM mdm.consent c
    WHERE c.ended_reason = 'ATTAINED_MAJORITY'
      AND c.subject_person_id IS NOT NULL
      AND c.subject_person_id <> c.person_id
    ORDER BY c.id
"""


def _connect():
    from app.db import connect
    return connect()


def _prior_status(cur, cid: int, responded_at) -> tuple[str, str]:
    """Return (status, how) from the consent log before ENDED; fall back to responded_at."""
    cur.execute("""SELECT action FROM mdm.consent_log
                   WHERE consent_id=%s AND action IN ('GRANTED','REFUSED','REQUESTED','EXPIRED','REVOKED')
                   ORDER BY id DESC LIMIT 1""", (cid,))
    # Prefer the last decisive action before ENDED.
    cur.execute("""SELECT action FROM mdm.consent_log
                   WHERE consent_id=%s AND id < COALESCE(
                     (SELECT id FROM mdm.consent_log WHERE consent_id=%s AND action='ENDED' ORDER BY id DESC LIMIT 1),
                     9223372036854775807)
                   AND action IN ('GRANTED','REFUSED','REQUESTED','EXPIRED','REVOKED')
                   ORDER BY id DESC LIMIT 1""", (cid, cid))
    row = cur.fetchone()
    if row and row["action"] == "GRANTED":
        return "GRANTED", "log:GRANTED"
    if row and row["action"] == "REQUESTED":
        return "PENDING", "log:REQUESTED"
    if row and row["action"] in ("REFUSED", "EXPIRED", "REVOKED"):
        return row["action"], f"log:{row['action']}"
    if responded_at is not None:
        return "GRANTED", "responded_at"
    return "PENDING", "fallback:no_log"


def _dup_requests(cur, c: dict) -> list[dict]:
    cur.execute("""SELECT id FROM mdm.consent
                   WHERE person_id=%s AND purpose=%s
                     AND COALESCE(subject_person_id,0)=COALESCE(%s,0)
                     AND COALESCE(event_id,0)=COALESCE(%s,0)
                     AND id > %s AND status='PENDING'
                     AND given_by_person_id IS NULL AND responded_at IS NULL
                   ORDER BY id""",
                (c["person_id"], c["purpose"], c["subject_person_id"], c["event_id"], c["id"]))
    return cur.fetchall()


def _diagnose(cur) -> dict:
    from app.survivorship import REF_DATE
    cur.execute("""SELECT purpose, count(*) AS n FROM mdm.consent
                   WHERE ended_reason='ATTAINED_MAJORITY'
                     AND subject_person_id IS NOT NULL AND subject_person_id<>person_id
                   GROUP BY 1 ORDER BY 1""")
    by_purpose = {r["purpose"]: r["n"] for r in cur.fetchall()}
    cur.execute("""SELECT
                     count(*) AS n,
                     count(*) FILTER (WHERE s.dob IS NOT NULL AND EXTRACT(YEAR FROM age(%s::date, s.dob)) < 1) AS under_1,
                     count(*) FILTER (WHERE s.dob IS NOT NULL AND EXTRACT(YEAR FROM age(%s::date, s.dob)) < 18) AS under_18,
                     min(EXTRACT(YEAR FROM age(%s::date, s.dob)))::int AS min_age,
                     max(EXTRACT(YEAR FROM age(%s::date, s.dob)))::int AS max_age
                   FROM mdm.consent c JOIN mdm.person s ON s.id=c.subject_person_id
                   WHERE c.ended_reason='ATTAINED_MAJORITY'
                     AND c.subject_person_id IS NOT NULL AND c.subject_person_id<>c.person_id""",
                (REF_DATE, REF_DATE, REF_DATE, REF_DATE))
    ages = cur.fetchone()
    return {"by_purpose": by_purpose, "ages": ages}


def repair(cur, apply: bool) -> dict:
    from app import audit
    cur.execute(WRONG_SQL)
    rows = cur.fetchall()
    stats = {
        "found": len(rows),
        "restored_granted": 0,
        "restored_pending": 0,
        "restored_other": 0,
        "unknown_prior": 0,
        "duplicate_requests_removed": 0,
        "deliveries_released": 0,
        "purposes": {},
    }
    for c in rows:
        stats["purposes"][c["purpose"]] = stats["purposes"].get(c["purpose"], 0) + 1
        prior, how = _prior_status(cur, c["id"], c["responded_at"])
        if how.startswith("fallback") or how == "responded_at" and not how.startswith("log"):
            if how == "responded_at":
                pass  # clear: answered → GRANTED
            else:
                stats["unknown_prior"] += 1
                print(f"  consent {c['id']}: prior status unknown from log; using {prior} ({how})")
        dups = _dup_requests(cur, c)
        cur.execute("""SELECT id FROM mdm.delivery
                       WHERE consent_id=%s AND status='BLOCKED_REVOKED'""", (c["id"],))
        blocked = [r["id"] for r in cur.fetchall()]
        if not apply:
            print(f"  would restore consent {c['id']} → {prior} ({how}); "
                  f"remove {len(dups)} duplicate request(s); release {len(blocked)} delivery(ies)")
            if prior == "GRANTED":
                stats["restored_granted"] += 1
            elif prior == "PENDING":
                stats["restored_pending"] += 1
            else:
                stats["restored_other"] += 1
            stats["duplicate_requests_removed"] += len(dups)
            stats["deliveries_released"] += len(blocked)
            continue

        cur.execute("UPDATE mdm.consent SET status=%s, ended_reason=NULL WHERE id=%s", (prior, c["id"]))
        if prior == "GRANTED":
            stats["restored_granted"] += 1
        elif prior == "PENDING":
            stats["restored_pending"] += 1
        else:
            stats["restored_other"] += 1

        for d in dups:
            # Drop the spurious PENDING request handover raised (and its empty log/deliveries).
            cur.execute("DELETE FROM mdm.delivery WHERE consent_id=%s AND status IN ('PENDING_CONSENT','BLOCKED_REVOKED')",
                        (d["id"],))
            cur.execute("DELETE FROM mdm.consent WHERE id=%s AND status='PENDING'", (d["id"],))
            if cur.rowcount:
                stats["duplicate_requests_removed"] += 1

        if blocked:
            # Waiting-for-consent state in this schema is PENDING_CONSENT (not WAITING).
            cur.execute("""UPDATE mdm.delivery SET status='PENDING_CONSENT', updated_at=now()
                           WHERE id = ANY(%s) AND status='BLOCKED_REVOKED'""", (blocked,))
            stats["deliveries_released"] += cur.rowcount

        audit.write(cur, ACTOR, "CONSENT_HANDOVER_REPAIRED", f"consent:{c['id']}", {
            "consent_id": c["id"], "person_id": c["person_id"], "subject_person_id": c["subject_person_id"],
            "purpose": c["purpose"], "event_id": c["event_id"], "restored_to": prior, "prior_from": how,
            "duplicates_removed": [d["id"] for d in dups], "deliveries_released": blocked,
        })
        cur.execute("""INSERT INTO mdm.consent_log (consent_id, action, actor, note, detail)
                       VALUES (%s,'REPAIRED',%s,%s,%s::jsonb)""",
                    (c["id"], ACTOR, "Restored after mistaken majority handover of a parent-about-child consent",
                     __import__("json").dumps({"restored_to": prior, "prior_from": how})))
    return stats


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args(argv)
    with _connect() as conn:
        cur = conn.cursor()
        diag = _diagnose(cur)
        ages = diag["ages"] or {}
        print(f"diagnostic: wrongly-ended={ages.get('n', 0)}  "
              f"subjects under_1={ages.get('under_1')} under_18={ages.get('under_18')} "
              f"age_range={ages.get('min_age')}–{ages.get('max_age')}")
        print(f"  by_purpose: {diag['by_purpose']}")
        print(f"{'APPLY' if a.apply else 'dry run'}")
        stats = repair(cur, a.apply)
        if a.apply:
            conn.commit()
        else:
            conn.rollback()
    print(f"found={stats['found']}  restored_granted={stats['restored_granted']}  "
          f"restored_pending={stats['restored_pending']}  restored_other={stats['restored_other']}  "
          f"unknown_prior={stats['unknown_prior']}  "
          f"duplicate_requests_removed={stats['duplicate_requests_removed']}  "
          f"deliveries_released={stats['deliveries_released']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
