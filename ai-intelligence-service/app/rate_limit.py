"""Shared per-IP sliding-window rate limit for public voice routes."""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

RATE_LIMIT_REQUESTS = 10
RATE_LIMIT_WINDOW_SEC = 60
_request_log: dict[str, deque] = defaultdict(deque)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(request: Request) -> None:
    ip = client_ip(request)
    now = time.monotonic()
    hits = _request_log[ip]
    while hits and now - hits[0] > RATE_LIMIT_WINDOW_SEC:
        hits.popleft()
    if len(hits) >= RATE_LIMIT_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail="Too many voice requests — please wait a moment and try again",
        )
    hits.append(now)
