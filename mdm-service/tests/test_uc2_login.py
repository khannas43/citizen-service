"""UC2 demo sign-in alignment: registry household for Suma/Rajender.

Registry tables are usually absent in citizen_db_test; align/restore must still
return notes and never raise. When a minimal family_registry can be created,
assert the aadhaar swaps and restore cleanup.
"""
from __future__ import annotations
import os
import uuid

os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""

from app import demo_uc2_login as login
from app.db import connect

LOGIN_SUMA = "XXXX-XXXX-3001"
SPARE_SUMA = "XXXX-XXXX-3901"
LOGIN_RAJ = "XXXX-XXXX-2001"
SPARE_RAJ = "XXXX-XXXX-2901"


def _has_schema(cur, name: str) -> bool:
    cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name=%s", (name,))
    return bool(cur.fetchone())


def _ensure_registry(cur) -> bool:
    """Create a minimal family_registry if missing. Returns True when usable."""
    if _has_schema(cur, "family_registry"):
        cur.execute(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='family_registry' AND table_name='person'"
        )
        if cur.fetchone():
            return True
    try:
        cur.execute("SAVEPOINT uc2_login_fixture")
        cur.execute("CREATE SCHEMA IF NOT EXISTS family_registry")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS family_registry.family (
              id uuid PRIMARY KEY,
              address text, village text, taluka text, district text
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS family_registry.person (
              id uuid PRIMARY KEY,
              name text, dob date, gender text, aadhaar_ref text,
              occupation text, annual_income numeric, caste_category text,
              is_alive boolean, mobile text
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS family_registry.family_member (
              family_id uuid, person_id uuid, relationship_to_head text
            )
        """)
        cur.execute("RELEASE SAVEPOINT uc2_login_fixture")
        return True
    except Exception:  # noqa: BLE001
        cur.execute("ROLLBACK TO SAVEPOINT uc2_login_fixture")
        return False


def test_align_and_restore_never_raise_and_note_when_registry_missing():
    with connect() as conn:
        cur = conn.cursor()
        notes = login.align(cur, -1, -2)
        assert isinstance(notes, list)
        if not _has_schema(cur, "family_registry"):
            assert notes, "expected notes when family_registry is missing"
        restore_notes: list[str] = []
        login.restore(cur, restore_notes)
        assert isinstance(restore_notes, list)
        if not _has_schema(cur, "family_registry"):
            assert restore_notes, "expected restore notes when family_registry is missing"
        conn.rollback()


def test_align_swaps_seed_aadhaar_and_restore_puts_them_back():
    with connect() as conn:
        cur = conn.cursor()
        if not _ensure_registry(cur):
            notes = login.align(cur, -1, -2)
            assert notes
            restore_notes: list[str] = []
            login.restore(cur, restore_notes)
            assert restore_notes
            conn.rollback()
            return

        cur.execute(
            "INSERT INTO mdm.person (mdm_id, name, dob, gender, state_code) "
            "VALUES (%s,'Suma Pagidipalli','1982-03-15','F','TG') RETURNING id",
            (f"TEST-UC2-{uuid.uuid4().hex[:10]}",),
        )
        suma_id = cur.fetchone()["id"]
        cur.execute(
            "INSERT INTO mdm.person (mdm_id, name, dob, gender, state_code) "
            "VALUES (%s,'Rajender Pagidipalli','1978-09-12','M','TG') RETURNING id",
            (f"TEST-UC2-{uuid.uuid4().hex[:10]}",),
        )
        raj_id = cur.fetchone()["id"]

        seed_suma = uuid.UUID("a9000000-0000-0000-0000-000000003901")
        seed_raj = uuid.UUID("a9000000-0000-0000-0000-000000002901")
        cur.execute(
            "DELETE FROM family_registry.family_member WHERE family_id=%s", (login.FAM,)
        )
        cur.execute("DELETE FROM family_registry.family WHERE id=%s", (login.FAM,))
        cur.execute(
            "DELETE FROM family_registry.person WHERE aadhaar_ref = ANY(%s) OR id = ANY(%s) "
            "OR id::text LIKE '2801%%'",
            ([LOGIN_SUMA, SPARE_SUMA, LOGIN_RAJ, SPARE_RAJ], [seed_suma, seed_raj]),
        )
        cur.execute(
            "INSERT INTO family_registry.person "
            "(id, name, dob, gender, aadhaar_ref, occupation, annual_income, caste_category, is_alive, mobile) "
            "VALUES (%s,'Seed Suma','1980-01-01','F',%s,'—',0,'OC',true,'9000000001'),"
            "(%s,'Seed Raj','1975-01-01','M',%s,'—',0,'OC',true,'9000000002')",
            (seed_suma, LOGIN_SUMA, seed_raj, LOGIN_RAJ),
        )

        login.align(cur, suma_id, raj_id)

        cur.execute("SELECT name FROM family_registry.person WHERE aadhaar_ref=%s", (LOGIN_SUMA,))
        row = cur.fetchone()
        assert row, "sign-in 3001 should map to a registry person after align"
        assert "Suma" in row["name"] and "Pagidipalli" in row["name"]

        cur.execute("SELECT id FROM family_registry.person WHERE aadhaar_ref=%s", (SPARE_SUMA,))
        seed = cur.fetchone()
        assert seed and seed["id"] == seed_suma

        restore_notes: list[str] = []
        login.restore(cur, restore_notes)

        cur.execute("SELECT aadhaar_ref FROM family_registry.person WHERE id=%s", (seed_suma,))
        back = cur.fetchone()
        assert back and back["aadhaar_ref"] == LOGIN_SUMA

        cur.execute(
            "SELECT count(*) AS n FROM family_registry.person WHERE id::text LIKE '2801%%'"
        )
        assert cur.fetchone()["n"] == 0

        cur.execute("DELETE FROM mdm.person WHERE id = ANY(%s)", ([suma_id, raj_id],))
        cur.execute("DELETE FROM family_registry.person WHERE id = ANY(%s)", ([seed_suma, seed_raj],))
        conn.commit()
