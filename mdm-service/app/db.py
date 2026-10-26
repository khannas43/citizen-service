"""Database access. Every connection serves exactly one state (row-level security keys on app.state_code)."""
from __future__ import annotations
import os
from contextlib import contextmanager
import psycopg
from psycopg.rows import dict_row

STATE = os.getenv("MDM_STATE_CODE", "TG")


def dsn() -> str:
    if os.getenv("MDM_DB_DSN"):
        return os.environ["MDM_DB_DSN"]
    return (f"host={os.getenv('DB_HOST', 'postgres.citizen.svc.cluster.local')} port={os.getenv('DB_PORT', '5432')} "
            f"dbname={os.getenv('DB_NAME', 'citizen_db')} user={os.getenv('DB_USER', 'citizenuser')} "
            f"password={os.getenv('DB_PASSWORD', '')}")


@contextmanager
def connect(state: str | None = None):
    with psycopg.connect(dsn(), row_factory=dict_row, autocommit=False) as conn:
        conn.execute("SELECT set_config('app.state_code', %s, false)", (state or STATE,))
        yield conn
