"""The UC2 demo couple signs in as themselves.

Sign-ins XXXX-XXXX-2001 and XXXX-XXXX-3001 are linked to Rajender and Suma Pagidipalli in the master data, but the older family registry (which the
citizen portal uses for the name in the header, the profile and the family tables) still holds two unrelated seed people on those numbers.
So Suma saw another woman's name and household. This module gives the couple their own registry household and moves the two seed people to
spare numbers (XXXX-XXXX-2901 and XXXX-XXXX-3901). Nothing is deleted. `restore` puts everything back.

All writes are best effort inside savepoints: if a registry table or column is missing, the demo still runs and a note says what was skipped.
"""
from __future__ import annotations

SWAPS = (("XXXX-XXXX-3001", "XXXX-XXXX-3901"), ("XXXX-XXXX-2001", "XXXX-XXXX-2901"))     # (sign-in number, spare number for the seed person who held it)
FAM = "a9000000-0000-0000-0000-000000002801"
SUMA_REG = "28010001-0000-0000-0000-000000000001"
RAJ_REG = "28010002-0000-0000-0000-000000000001"
KID_REG = "28010010-0000-0000-0000-0000000000{:02d}"
OWN = (SUMA_REG, RAJ_REG)


def _try(cur, notes, what, fn):
    cur.execute("SAVEPOINT uc2_login")
    try:
        fn()
        cur.execute("RELEASE SAVEPOINT uc2_login")
        return True
    except Exception as e:  # noqa: BLE001
        cur.execute("ROLLBACK TO SAVEPOINT uc2_login")
        notes.append(f"{what}: not written ({type(e).__name__}: {str(e).splitlines()[0][:120]})")
        return False


def _drop_household(cur):
    cur.execute("DELETE FROM family_registry.family_member WHERE family_id=%s", (FAM,))
    cur.execute("DELETE FROM family_registry.person WHERE id = ANY(%s) OR id::text LIKE '28010010-%%'", (list(OWN),))
    cur.execute("DELETE FROM family_registry.family WHERE id=%s", (FAM,))


def restore(cur, notes=None) -> None:
    """The household goes; the seed people get their numbers back."""
    notes = notes if notes is not None else []

    def go():
        _drop_household(cur)
        for login, spare in SWAPS:
            cur.execute("UPDATE family_registry.person SET aadhaar_ref=%s WHERE aadhaar_ref=%s", (login, spare))
    _try(cur, notes, "UC2 sign-in household removed", go)


def align(cur, suma_id: int, rajender_id: int) -> list[str]:
    """Gives Suma (3001) and Rajender (2001) a household of their own in the registry, with the same people the master record shows.
    Their children are the ones already on their ration card in the master data; demo births are not copied, because they show on the page
    through the master record, as 'Added after birth registration'."""
    notes: list[str] = []

    def go():
        cur.execute("SELECT id, name, dob, gender FROM mdm.person WHERE id = ANY(%s)", ([suma_id, rajender_id],))
        by = {r["id"]: r for r in cur.fetchall()}
        _drop_household(cur)
        for login, spare in SWAPS:                                   # the seed people keep their records and move to a spare number
            cur.execute("UPDATE family_registry.person SET aadhaar_ref=%s WHERE aadhaar_ref=%s", (spare, login))
        cur.execute("INSERT INTO family_registry.family (id, address, village, taluka, district) VALUES (%s,'Utnoor road','Utnoor','Utnoor','Adilabad')", (FAM,))
        cols = "(id, name, dob, gender, aadhaar_ref, occupation, annual_income, caste_category, is_alive, mobile)"
        s, r = by[suma_id], by[rajender_id]
        cur.execute(f"INSERT INTO family_registry.person {cols} VALUES (%s,%s,%s,'F','XXXX-XXXX-3001','homemaker',0,'OBC',true,'9876543031')", (SUMA_REG, s["name"], s["dob"]))
        cur.execute(f"INSERT INTO family_registry.person {cols} VALUES (%s,%s,%s,'M','XXXX-XXXX-2001','farmer',180000,'OBC',true,'9876542031')", (RAJ_REG, r["name"], r["dob"]))
        cur.execute("INSERT INTO family_registry.family_member (family_id, person_id, relationship_to_head) VALUES (%s,%s,'HEAD')", (FAM, SUMA_REG))
        cur.execute("INSERT INTO family_registry.family_member (family_id, person_id, relationship_to_head) VALUES (%s,%s,'SPOUSE')", (FAM, RAJ_REG))
        cur.execute("""SELECT DISTINCT p.id, p.name, p.dob, p.gender FROM mdm.relationship rl JOIN mdm.person p ON p.id=rl.person_b
                       WHERE rl.kind='PARENT_OF' AND rl.person_a = ANY(%s)
                         AND NOT EXISTS (SELECT 1 FROM mdm.source_record x WHERE x.person_id=p.id AND x.source_rid LIKE 'DEMO-%%')
                       ORDER BY p.dob LIMIT 6""", ([suma_id, rajender_id],))
        for i, c in enumerate(cur.fetchall(), 1):
            kid = KID_REG.format(i)
            cur.execute(f"INSERT INTO family_registry.person {cols} VALUES (%s,%s,%s,%s,%s,'student',0,'OBC',true,%s)",
                        (kid, c["name"], c["dob"], c["gender"] or "M", f"XXXX-XXXX-28{i:02d}", f"98765430{40 + i}"))
            cur.execute("INSERT INTO family_registry.family_member (family_id, person_id, relationship_to_head) VALUES (%s,%s,%s)",
                        (FAM, kid, "DAUGHTER" if (c["gender"] or "") == "F" else "SON"))
    _try(cur, notes, "UC2 sign-in household (Suma and Rajender)", go)
    return notes
