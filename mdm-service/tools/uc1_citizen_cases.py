"""Which of the five demo citizen sign-ins has two departments disagreeing about a detail (the UC1 "Please confirm" card).

Read-only by default: lists, for each demo sign-in, the person it is linked to and any disagreement the citizen would be asked to confirm.
With --apply it raises those confirmations (the same scan the officer portal runs; safe to run again, once per person and attribute).

Run in the service pod:  cd /opt/app && PYTHONPATH=/opt/app python /tmp/uc1_citizen_cases.py [--apply]
"""
import sys

from app import citizen
from app.db import connect

LOGINS = ("XXXX-XXXX-1001", "XXXX-XXXX-2001", "XXXX-XXXX-3001", "XXXX-XXXX-4001", "XXXX-XXXX-5001")
ACTOR = "demo-uc1-script"


def main(apply: bool):
    with connect() as conn:
        cur = conn.cursor()
        for ref in LOGINS:
            cur.execute("SELECT l.person_id, p.name FROM mdm.citizen_link l JOIN mdm.person p ON p.id=l.person_id WHERE l.aadhaar_ref=%s", (ref,))
            row = cur.fetchone()
            if not row:
                print(f"{ref}: not linked to a master person")
                continue
            cur.execute("""SELECT id, person_id, source, rtype, name, dob, address, as_of, link_status, score FROM mdm.source_record
                           WHERE person_id=%s AND link_status = ANY(%s) ORDER BY id""", (row["person_id"], list(citizen.LINKED_WITH_CONFIDENCE)))
            recs = cur.fetchall()
            ds = citizen._disagreements(recs)
            cur.execute("SELECT count(*) AS n FROM mdm.citizen_request WHERE person_id=%s AND kind='CONFIRM_DETAILS' AND status='PENDING'", (row["person_id"],))
            pending = cur.fetchone()["n"]
            print(f"{ref}: {row['name']} (person {row['person_id']}), {len(recs)} linked records, "
                  f"{len(ds)} disagreement(s) {[d['attribute'] for d in ds]}, {pending} confirmation(s) already waiting")
        if apply:
            print(citizen.auto_confirm_scan(cur, ACTOR))
            conn.commit()
        else:
            print("Read only. Add --apply to raise the confirmations.")


if __name__ == "__main__":
    main("--apply" in sys.argv)
