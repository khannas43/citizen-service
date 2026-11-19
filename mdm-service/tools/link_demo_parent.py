#!/usr/bin/env python3
"""Demo only: let one of the few demo citizen sign-ins answer the consent for a given birth event.

A citizen signs in with a reference that mdm.citizen_link ties to one master person. There are only a handful of demo
sign-ins, so for any other birth this tool re-points one of them at the parent who is asked to answer. It uses the normal
link path (audited). The sign-in loses its previous person, which is printed. Dry run unless --apply. No identity number
is shown or needed.

  python3 mdm-service/tools/link_demo_parent.py --event 3993 --ref <sign-in reference you log in with>            # dry run
  python3 mdm-service/tools/link_demo_parent.py --event 3993 --ref <sign-in reference you log in with> --apply
  python3 mdm-service/tools/link_demo_parent.py --list                       # which references are linked to whom

  # On the cluster pod:
  #   POD=$(kubectl -n citizen get pod -l app=mdm-service -o name | head -1 | cut -d/ -f2)
  #   kubectl -n citizen cp mdm-service/tools/link_demo_parent.py $POD:/tmp/link_demo_parent.py
  #   kubectl -n citizen exec $POD -- sh -c 'cd /opt/app && PYTHONPATH=/opt/app python /tmp/link_demo_parent.py --list'
"""
from __future__ import annotations
import argparse, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
ACTOR = "demo-link-parent"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--event", type=int)
    ap.add_argument("--ref")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args(argv)
    from app.db import connect
    from app import citizen
    with connect() as conn:
        cur = conn.cursor()
        if a.list:
            cur.execute("""SELECT l.aadhaar_ref, l.person_id, p.name FROM mdm.citizen_link l LEFT JOIN mdm.person p ON p.id=l.person_id ORDER BY l.created_at DESC LIMIT 50""")
            for r in cur.fetchall():
                print(f"  ref={r['aadhaar_ref']}  person={r['person_id']}  name={r['name']}")
            return 0
        if not a.event or not a.ref:
            raise SystemExit("Give --event and --ref (or --list)")
        cur.execute("""SELECT DISTINCT c.person_id, p.name FROM mdm.consent c JOIN mdm.person p ON p.id=c.person_id
                       WHERE c.event_id=%s AND c.status='PENDING' ORDER BY c.person_id""", (a.event,))
        who = cur.fetchall()
        if not who:
            raise SystemExit(f"Event {a.event} has no pending consent to answer (already answered, or not a birth).")
        target = who[0]
        cur.execute("SELECT l.person_id, p.name FROM mdm.citizen_link l LEFT JOIN mdm.person p ON p.id=l.person_id WHERE l.aadhaar_ref=%s", (a.ref,))
        prev = cur.fetchone()
        print(f"Event {a.event}: the parent asked to answer is person {target['person_id']} ({target['name']})")
        print(f"Sign-in {a.ref}: currently {'person ' + str(prev['person_id']) + ' (' + str(prev['name']) + ')' if prev else 'not linked'}")
        if not a.apply:
            print("dry run: add --apply to link it")
            return 0
        citizen.link(cur, a.ref, target["person_id"], ACTOR)
        conn.commit()
        print(f"linked: sign in with {a.ref} to answer for event {a.event}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
