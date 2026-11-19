"""The UC1 citizen demo: three demo sign-ins that each have two departments disagreeing about one of their details.

The sign-ins XXXX-XXXX-1001, 4001 and 5001 are tied to master people, and each person gets ONE synthetic department record (source_rid prefix
DEMO-UC1-) that disagrees with what they already hold, so the citizen portal shows a "Please confirm" card:
    1001 Padmavati Goud   (ration card TG-RC-00000001)  date of birth, from a pension record two years later
    4001 Ahmed Shaikh     (the one person of that name) address, from an electricity record at a different address
    5001 Yellavva Erukala (ration card TG-RC-00000005)  name, from a revenue certificate with a different family name
People are found by their ration card (or a unique name) and never guessed; a person who cannot be found is left out with a note.
plant_all starts the story fresh each time (it clears earlier cards and corrections for these three first); clear_all removes everything.
The two Pagidipalli sign-ins (2001, 3001) belong to the UC2 demo and are not touched.
"""
from __future__ import annotations
import json
from datetime import timedelta

from . import citizen, store

ACTOR = "demo-uc1-script"
PREFIX = "DEMO-UC1-"
# sign-in, name as the login shows it, how to find the master person, the detail that will disagree
CASES = (
    ("XXXX-XXXX-1001", "Padmavathi Goud", {"card": "TG-RC-00000001", "like": "padmavat%goud"}, "dob"),
    ("XXXX-XXXX-4001", "Ahmed Shaikh", {"name": "ahmed shaikh"}, "address"),
    ("XXXX-XXXX-5001", "Yellavva Erukala", {"card": "TG-RC-00000005", "like": "yellavva%erukala"}, "name"),
)


def find_person(cur, how: dict) -> tuple[int | None, str]:
    if "card" in how:
        cur.execute("""SELECT DISTINCT p.id FROM mdm.person p JOIN mdm.source_record r ON r.person_id=p.id
                       WHERE r.ration_card=%s AND lower(p.name) LIKE %s""", (how["card"], how["like"]))
    else:
        cur.execute("SELECT id FROM mdm.person WHERE lower(name)=%s", (how["name"],))
    ids = [r["id"] for r in cur.fetchall()]
    return (ids[0], "") if len(ids) == 1 else (None, f"{len(ids)} master people matched; needs exactly one")


def _insert(cur, pid, source, rid, rtype, name, dob=None, address=None) -> int:
    cur.execute("""INSERT INTO mdm.source_record (person_id, source, source_rid, rtype, name, dob, address, link_status, score, as_of, payload)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,'AUTO_LINKED',0.96,CURRENT_DATE,%s::jsonb)
                   ON CONFLICT (source, source_rid) DO NOTHING""", (pid, source, rid, rtype, name, dob, address, json.dumps({"synthetic": True})))
    return cur.rowcount


def plant(cur, pid: int, attr: str, ref: str) -> str:
    cur.execute("SELECT source, rtype, name, dob, address FROM mdm.source_record WHERE person_id=%s AND link_status IN ('ANCHOR','AUTO_LINKED','STEWARD_LINKED') ORDER BY id", (pid,))
    recs = cur.fetchall()
    tag = ref[-4:]
    if attr == "dob":
        base = next((r for r in recs if r["dob"] and r["source"] in ("crs", "revenue_certificates", "pension_batch")), None)
        if not base:
            return "no department date of birth to disagree with"
        src = "pension_batch" if base["source"] != "pension_batch" else "revenue_certificates"
        _insert(cur, pid, src, f"{PREFIX}{tag}-dob", "PENSION", base["name"], dob=base["dob"] + timedelta(days=730))
        return "a pension record with a different date of birth was added"
    if attr == "address":
        base = next((r for r in recs if r["address"] and r["source"] == "pds_view"), None)
        if not base:
            return "no ration card address to disagree with"
        _insert(cur, pid, "electricity", f"{PREFIX}{tag}-addr", "CONNECTION", base["name"], address="Plot 88, Lake View Colony, Another Town, Another District")
        return "an electricity record with a different address was added"
    base = next((r for r in recs if r["name"] and r["source"] in ("crs", "identity_reference", "pds_view")), None)
    if not base:
        return "no name record to disagree with"
    parts = base["name"].split()
    other = " ".join([parts[0], "Zaidi"]) if len(parts) > 1 else base["name"] + " Zaidi"
    _insert(cur, pid, "revenue_certificates", f"{PREFIX}{tag}-name", "CERTIFICATE", other)
    return "a revenue certificate with a different family name was added"


def clear_all(cur) -> dict:
    """Takes the synthetic records, the confirmation cards and the corrections the demo citizens sent away. The sign-in links stay."""
    cur.execute("SELECT DISTINCT person_id FROM mdm.source_record WHERE source_rid LIKE %s AND person_id IS NOT NULL", (PREFIX + "%",))
    pids = [r["person_id"] for r in cur.fetchall()]
    cur.execute("DELETE FROM mdm.source_record WHERE source_rid LIKE %s", (PREFIX + "%",))
    n = {"records": cur.rowcount}
    cur.execute("SELECT person_id FROM mdm.citizen_link WHERE aadhaar_ref = ANY(%s)", ([c[0] for c in CASES],))
    people = [r["person_id"] for r in cur.fetchall()]
    cur.execute("DELETE FROM mdm.discrepancy WHERE person_id = ANY(%s) AND kind='DISCREPANCY' AND raised_by LIKE 'citizen:%%'", (people,))
    n["corrections"] = cur.rowcount
    cur.execute("DELETE FROM mdm.citizen_request WHERE person_id = ANY(%s) AND kind='CONFIRM_DETAILS'", (people,))
    n["cards"] = cur.rowcount
    for pid in pids:
        store.rebuild_person(cur, pid)
    return n


def plant_all(cur, actor: str = ACTOR, dry: bool = False) -> dict:
    """Ties the three sign-ins to their people, plants one disagreement each and raises the cards. Returns notes per sign-in and the scan result."""
    notes, found = {}, []
    for ref, name, how, attr in CASES:
        pid, why = find_person(cur, how)
        if not pid:
            notes[ref] = f"{name}: left out ({why})"
            continue
        notes[ref] = f"{name}: person {pid}, a {attr.replace('dob', 'date of birth')} disagreement"
        found.append((ref, pid, attr))
    if dry:
        return {"notes": notes, "scan": None}
    clear_all(cur)
    for ref, pid, attr in found:
        citizen.link(cur, ref, pid, actor)
        notes[ref] += "; " + plant(cur, pid, attr, ref)
        store.rebuild_person(cur, pid)
    return {"notes": notes, "scan": citizen.auto_confirm_scan(cur, actor)}
