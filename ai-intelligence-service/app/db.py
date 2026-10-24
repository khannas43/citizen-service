import logging

import asyncpg
from pgvector.asyncpg import register_vector

from app.config import settings

log = logging.getLogger(__name__)

_pool = None


async def _init_connection(conn):
    try:
        await register_vector(conn)
    except Exception as exc:
        # Recommendations / SLA don't need vector; search does.
        # Keep the pool usable if the extension was wiped or unavailable.
        log.warning("pgvector register skipped: %s", exc)


async def get_pool():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            settings.DATABASE_URL,
            min_size=2,
            max_size=10,
            init=_init_connection,
        )
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
