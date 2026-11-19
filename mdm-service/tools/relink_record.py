#!/usr/bin/env python3
"""Put one source record back on the person it belongs to (undoes a wrong unlink). Dry run unless --apply.

The record moves to the target person with link_status STEWARD_LINKED and the reason written, both golden records are rebuilt,
relationships re-derived and an audit row RELINK is written. If the person the record leaves is then empty (no source records,
no consents, proposals or sign-in link) it is deleted; otherwise it is left and reported. Only references are printed.

  python3 mdm-service/tools/relink_record.py --record 57673 --to 21710            # dry run
  python3 mdm-service/tools/relink_record.py --record 57673 --to 21710 --apply

  # On the cluster pod:
  #   POD=$(kubectl -n citizen get pod -l app=mdm-service -o name | head -1 | cut -d/ -f2)
  #   kubectl -n citizen cp mdm-service/tools/relink_record.py $POD:/tmp/relink_record.py
  #   kubectl -n citizen exec $POD -- sh -c 'cd /opt/app && PYTHONPATH=/opt/app python /tmp/relink_record.py --record 57673 --to 21710'
"""
from __future__ import annotations
import argparse, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
ACTOR = "relink-tool"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--record", type=int, required=True)
    ap.add_argument("--to", type=int, required=True, help="person id the record belongs to")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args(argv)
    from app.db import connect
    from app import audit, store
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, person_id, source, source_rid, rtype FROM mdm.source_record WHERE id=%s FOR UPDATE", (a.record,))
        r = cur.fetchone()
        cur.execute("SELECT id FROM mdm.person WHERE id=%s", (a.to,))
        if not r or not cur.fetchone():
            raise SystemExit("Record or target person not found")
        old = r["person_id"]
        print(f"Record {r['source']}/{r['source_rid']} ({r['rtype']}) is on person {old}; it will move to person {a.to}")
        if old == a.to:
            print("Already there: nothing to do")
            return 0
        if not a.apply:
            print("dry run: add --apply")
            return 0
        cur.execute("SELECT set_config('mdm.actor', %s, true), set_config('mdm.note', %s, true)", (ACTOR, "relinked after a wrong unlink"))
        cur.execute("UPDATE mdm.source_record SET person_id=%s, link_status='STEWARD_LINKED', reason=%s WHERE id=%s", (a.to, f"relinked by {ACTOR}", a.record))
        deleted = False
        if old:
            cur.execute("""SELECT (SELECT count(*) FROM mdm.source_record WHERE person_id=%(p)s) AS recs,
                                  (SELECT count(*) FROM mdm.consent WHERE person_id=%(p)s OR subject_person_id=%(p)s OR given_by_person_id=%(p)s) AS cons,
                                  (SELECT count(*) FROM mdm.proposal WHERE person_id=%(p)s) AS props,
                                  (SELECT count(*) FROM mdm.citizen_link WHERE person_id=%(p)s) AS links""", {"p": old})
            u = cur.fetchone()
            if not any(u.values()):
                cur.execute("DELETE FROM mdm.person WHERE id=%s", (old,))
                deleted = True
            else:
                print(f"person {old} kept because it still has: {u}")
        store.rebuild_person(cur, a.to)
        store.derive_relationships(cur, [a.to])
        audit.write(cur, ACTOR, "RELINK", f"record:{r['source']}/{r['source_rid']}", {"from_person": old, "to_person": a.to, "from_person_deleted": deleted})
        conn.commit()
        print(f"done: record moved to person {a.to}; person {old} {'deleted (it was empty)' if deleted else 'left as it was'}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
