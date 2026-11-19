"""Pytest isolation: tests use citizen_db_test, never the live citizen_db unless ALLOW_LIVE_DB=1.

citizen_db_test is created and migrated (or cloned) if missing. Documented also in
tests/test_demo_cleanup.py.
"""
from __future__ import annotations
import os
import re
import subprocess
import sys


def _dbname(dsn: str) -> str | None:
    m = re.search(r"dbname=([^\s]+)", dsn or "")
    return m.group(1) if m else None


def assert_db_allowed(dbname: str | None, allow_live: bool) -> None:
    """Refuse citizen_db unless ALLOW_LIVE_DB=1."""
    if dbname == "citizen_db" and not allow_live:
        raise SystemExit(
            "Refusing to run mdm-service tests against live citizen_db. "
            "Point MDM_DB_DSN at citizen_db_test, or set ALLOW_LIVE_DB=1 to override."
        )


def _rewrite_dsn(dsn: str, new_db: str) -> str:
    if "dbname=" in dsn:
        return re.sub(r"dbname=[^\s]+", f"dbname={new_db}", dsn)
    return dsn + f" dbname={new_db}"


def _ensure_citizen_db_test(admin_hint: str = "") -> None:
    """Create citizen_db_test if missing (via kubectl postgres in this demo cluster)."""
    try:
        import psycopg
        dsn = os.environ.get("MDM_DB_DSN", "")
        with psycopg.connect(dsn, connect_timeout=5) as conn:
            conn.execute("SELECT 1")
            return
    except Exception:
        pass
    # Try kubectl create + clone when the DSN points at a missing DB.
    try:
        check = subprocess.run(
            ["kubectl", "-n", "citizen", "exec", "deploy/postgres", "--",
             "psql", "-U", "postgres", "-d", "postgres", "-tc",
             "SELECT 1 FROM pg_database WHERE datname='citizen_db_test'"],
            capture_output=True, text=True, timeout=60,
        )
        if "1" not in (check.stdout or ""):
            subprocess.check_call(
                ["kubectl", "-n", "citizen", "exec", "deploy/postgres", "--",
                 "psql", "-U", "postgres", "-d", "postgres", "-c",
                 "CREATE DATABASE citizen_db_test OWNER citizenuser;"],
                timeout=60,
            )
            subprocess.check_call(
                ["kubectl", "-n", "citizen", "exec", "deploy/postgres", "--",
                 "bash", "-c",
                 "pg_dump -U postgres -d citizen_db --no-owner --no-acl | psql -U postgres -d citizen_db_test -q"],
                timeout=600,
            )
            subprocess.check_call(
                ["kubectl", "-n", "citizen", "exec", "deploy/postgres", "--",
                 "psql", "-U", "postgres", "-d", "citizen_db_test", "-c",
                 "GRANT USAGE ON SCHEMA platform TO citizenuser; "
                 "GRANT SELECT ON ALL TABLES IN SCHEMA platform TO citizenuser; "
                 "GRANT USAGE ON SCHEMA mdm TO citizenuser; "
                 "GRANT ALL ON ALL TABLES IN SCHEMA mdm TO citizenuser; "
                 "GRANT ALL ON ALL SEQUENCES IN SCHEMA mdm TO citizenuser;"],
                timeout=60,
            )
        # Apply any newer migrations.
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        mig = os.path.join(root, "db", "mdm")
        if os.path.isdir(mig):
            for name in sorted(os.listdir(mig)):
                if not name.endswith(".sql"):
                    continue
                path = os.path.join(mig, name)
                pod = subprocess.check_output(
                    ["kubectl", "get", "pod", "-n", "citizen", "-l", "app=postgres",
                     "-o", "jsonpath={.items[0].metadata.name}"],
                    text=True, timeout=30,
                ).strip()
                subprocess.check_call(
                    ["kubectl", "cp", path, f"citizen/{pod}:/tmp/{name}"], timeout=60)
                subprocess.run(
                    ["kubectl", "-n", "citizen", "exec", pod, "--",
                     "psql", "-U", "postgres", "-d", "citizen_db_test", "-v", "ON_ERROR_STOP=1",
                     "-q", "-f", f"/tmp/{name}"],
                    capture_output=True, text=True, timeout=120,
                )
    except Exception as e:  # noqa: BLE001
        print(f"warning: could not ensure citizen_db_test ({e}){admin_hint}", file=sys.stderr)


def pytest_configure(config):
    os.environ.setdefault("MDM_AUTH_DISABLED", "true")
    os.environ.setdefault("MDM_BASE", "")
    os.environ.setdefault("MDM_STATE_CODE", "TG")
    allow = os.environ.get("ALLOW_LIVE_DB") == "1"
    dsn = os.environ.get("MDM_DB_DSN", "")
    name = _dbname(dsn)
    if name == "citizen_db" and not allow:
        # Prefer auto-switch to the isolated DB over hard fail for everyday pytest.
        # The guard test still exercises assert_db_allowed(..., allow_live=False).
        new_dsn = _rewrite_dsn(dsn, "citizen_db_test")
        os.environ["MDM_DB_DSN"] = new_dsn
        print("conftest: redirected MDM_DB_DSN citizen_db → citizen_db_test "
              "(set ALLOW_LIVE_DB=1 to use the live demo database)", file=sys.stderr)
        _ensure_citizen_db_test()
    elif name == "citizen_db_test":
        _ensure_citizen_db_test()
    elif name is None and not allow:
        # Default cluster DSN without MDM_DB_DSN would hit citizen_db — force test DB name in env.
        if not dsn:
            # Leave missing; callers usually set a full DSN. Still record the policy.
            pass
    # Final refuse if still on live without override (e.g. ensure failed to rewrite).
    final = _dbname(os.environ.get("MDM_DB_DSN", ""))
    if final == "citizen_db" and not allow:
        assert_db_allowed(final, allow_live=False)
