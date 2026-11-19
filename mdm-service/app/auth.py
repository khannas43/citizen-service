"""Bearer-token check against Keycloak. Roles come from realm_access.roles. MDM_AUTH_DISABLED=true is for tests only."""
from __future__ import annotations
import os
import re
from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

DISABLED = os.getenv("MDM_AUTH_DISABLED", "false").lower() == "true"
JWKS_URL = os.getenv("KEYCLOAK_JWKS_URL", "http://keycloak.citizen.svc.cluster.local:8080/realms/citizen/protocol/openid-connect/certs")
ISSUER = os.getenv("KEYCLOAK_ISSUER", "")
READ_ROLES = {r.strip() for r in os.getenv("MDM_READ_ROLES", "*").split(",") if r.strip()}
WRITE_ROLES = {r.strip() for r in os.getenv(
    "MDM_WRITE_ROLES",
    "MDM_STEWARD,MDM_ADMIN,ADMIN,DEPT_ADMIN,PDS_OFFICER,HEALTH_OFFICER",
).split(",") if r.strip()}
ADMIN_ROLES = {r.strip() for r in os.getenv("MDM_ADMIN_ROLES", "MDM_ADMIN,ADMIN").split(",") if r.strip()}

# Role → department code. Used only when the user holds no elevated MDM/admin role.
DEPT_ROLES = {"PDS_OFFICER": "pds", "HEALTH_OFFICER": "health"}
DEPT_ELEVATED = {"MDM_STEWARD", "MDM_ADMIN", "ADMIN", "DEPT_ADMIN", "IT_ADMIN"}

DEPT_FORBIDDEN_MSG = "Your role is limited to your department."

# (method, path-regex). Paths are without the optional /mdm-service prefix.
_DEPT_ALLOW = [
    ("GET", re.compile(r"^/api/x/flow-board$")),
    ("GET", re.compile(r"^/api/x/work/groups$")),
    ("GET", re.compile(r"^/api/x/work/items$")),
    ("POST", re.compile(r"^/api/x/work/claim$")),
    ("POST", re.compile(r"^/api/x/work/unclaim$")),
    ("POST", re.compile(r"^/api/x/work/batch/preview$")),
    ("POST", re.compile(r"^/api/x/work/batch/approve$")),
    ("GET", re.compile(r"^/api/x/work/batches/\d+$")),
    ("GET", re.compile(r"^/api/x/approvals$")),
    ("POST", re.compile(r"^/api/proposals/\d+/decision$")),
    ("GET", re.compile(r"^/api/x/consents$")),
    ("GET", re.compile(r"^/api/x/consents/\d+$")),
    ("POST", re.compile(r"^/api/x/consents/\d+/remind$")),
    ("GET", re.compile(r"^/api/x/deliveries$")),
    ("POST", re.compile(r"^/api/x/deliveries/\d+/redeliver$")),
    ("POST", re.compile(r"^/api/x/deliveries/retry$")),
    # Notices screen (Decisions hub) — own department only; scoped in the handler.
    ("GET", re.compile(r"^/api/x/notices$")),
    ("GET", re.compile(r"^/api/x/channels$")),
]
DEPT_ALLOWLIST_PATTERNS = _DEPT_ALLOW

_jwks = None


def _decode(token: str) -> dict:
    global _jwks
    import jwt
    from jwt import PyJWKClient
    _jwks = _jwks or PyJWKClient(JWKS_URL, cache_keys=True)
    key = _jwks.get_signing_key_from_jwt(token).key
    opts = {"verify_aud": False}
    return jwt.decode(token, key, algorithms=["RS256"], options=opts, issuer=ISSUER or None)


def _roles_from_header(request: Request) -> set[str] | None:
    """Test-only: X-Test-Roles when MDM_AUTH_DISABLED. Ignored in production."""
    if not DISABLED:
        return None
    raw = request.headers.get("x-test-roles")
    if raw is None:
        return None
    return {r.strip() for r in raw.split(",") if r.strip()}


def user(request: Request) -> dict:
    test_roles = _roles_from_header(request)
    if DISABLED and test_roles is not None:
        actor = request.headers.get("x-test-actor") or "test-user"
        return {"actor": actor, "roles": test_roles}
    if DISABLED:
        return {"actor": "test-user", "roles": {"MDM_ADMIN", "ADMIN"}}
    h = request.headers.get("authorization", "")
    if not h.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in to continue")
    try:
        c = _decode(h[7:])
    except Exception:
        raise HTTPException(401, "Your session is not valid or has expired")
    roles = set((c.get("realm_access") or {}).get("roles", []))
    return {"actor": c.get("preferred_username") or c.get("sub"), "roles": roles}


def user_optional(request: Request) -> dict | None:
    """Like user(), but returns None when there is no credential (for middleware)."""
    test_roles = _roles_from_header(request)
    if DISABLED and test_roles is not None:
        actor = request.headers.get("x-test-actor") or "test-user"
        return {"actor": actor, "roles": test_roles}
    if DISABLED:
        return {"actor": "test-user", "roles": {"MDM_ADMIN", "ADMIN"}}
    h = request.headers.get("authorization", "")
    if not h.lower().startswith("bearer "):
        return None
    try:
        c = _decode(h[7:])
    except Exception:
        return None
    roles = set((c.get("realm_access") or {}).get("roles", []))
    return {"actor": c.get("preferred_username") or c.get("sub"), "roles": roles}


def scope(u: dict | None) -> str | None:
    """Department code when the user is department-scoped; otherwise None."""
    if not u:
        return None
    roles = u.get("roles") or set()
    if roles & DEPT_ELEVATED:
        return None
    for role, code in DEPT_ROLES.items():
        if role in roles:
            return code
    return None


def is_dept_scoped(u: dict | None) -> bool:
    return scope(u) is not None


def _strip_base(path: str) -> str:
    base = (os.getenv("MDM_BASE") or "").rstrip("/")
    if base and path.startswith(base):
        return path[len(base):] or "/"
    # Common mount when the service is behind nginx
    if path.startswith("/mdm-service"):
        return path[len("/mdm-service"):] or "/"
    return path


def path_allowed_for_dept(method: str, path: str) -> bool:
    path = _strip_base(path.split("?", 1)[0])
    method = method.upper()
    for m, rx in _DEPT_ALLOW:
        if m == method and rx.match(path):
            return True
    return False


def _need(allowed: set[str]):
    def dep(u: dict = Depends(user)) -> dict:
        if "*" in allowed or u["roles"] & allowed:
            return u
        raise HTTPException(403, "Your role does not allow this action")
    return dep


can_read = _need(READ_ROLES)
can_write = _need(WRITE_ROLES)
can_admin = _need(ADMIN_ROLES)


class DeptScopeMiddleware(BaseHTTPMiddleware):
    """Deny-by-default for department-scoped officers. Unknown routes → 403 (not 404)."""

    async def dispatch(self, request: Request, call_next):
        if request.method.upper() == "OPTIONS":
            return await call_next(request)
        u = user_optional(request)
        if u and is_dept_scoped(u):
            if not path_allowed_for_dept(request.method, request.url.path):
                return JSONResponse({"detail": DEPT_FORBIDDEN_MSG}, status_code=403)
            request.state.dept_scope = scope(u)
        else:
            request.state.dept_scope = None
        return await call_next(request)


def dept_or_param(request: Request, system: str | None) -> str | None:
    """Force a department user's own system; otherwise honour the query/body system."""
    forced = getattr(request.state, "dept_scope", None)
    if forced:
        return forced
    return system
