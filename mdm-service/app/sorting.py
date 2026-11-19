"""Shared by every list endpoint: a safe ORDER BY from a column the screen asked for, and a whole-day date range."""
from __future__ import annotations


def order_by(allowed: dict, sort, direction, default: str, tiebreak: str) -> str:
    """`allowed` maps what the screen sends to the SQL expression behind it; anything else falls back to `default`."""
    if sort in allowed:
        return f"{allowed[sort]} {'DESC' if str(direction).lower() == 'desc' else 'ASC'} NULLS LAST, {tiebreak}"
    return default


def date_range(where: list, params: list, col: str, date_from, date_to) -> None:
    """Adds 'from the first day to the end of the last day' on a timestamp or date column."""
    if date_from:
        where.append(f"{col} >= %s::date"); params.append(str(date_from))
    if date_to:
        where.append(f"{col} < (%s::date + 1)"); params.append(str(date_to))
