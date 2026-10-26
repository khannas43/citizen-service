"""Bearer-token check against Keycloak. Roles come from realm_access.roles. MDM_AUTH_DISABLED=true is for tests only."""
from __future__ import annotations
import os
from fastapi import Depends, HTTPException, Request

DISABLED = os.getenv("MDM_AUTH_DISABLED", "false").lower() == "true"
JWKS_URL = os.getenv("KEYCLOAK_JWKS_URL", "http://keycloak.citizen.svc.cluster.local:8080/realms/citizen/protocol/openid-connect/certs")
ISSUER = os.getenv("KEYCLOAK_ISSUER", "")
READ_ROLES = {r.strip() for r in os.getenv("MDM_READ_ROLES", "*").split(",") if r.strip()}
WRITE_ROLES = {r.strip() for r in os.getenv("MDM_WRITE_ROLES", "MDM_STEWARD,MDM_ADMIN,ADMIN").split(",") if r.strip()}
ADMIN_ROLES = {r.strip() for r in os.getenv("MDM_ADMIN_ROLES", "MDM_ADMIN,ADMIN").split(",") if r.strip()}
_jwks = None


def _decode(token: str) -> dict:
    global _jwks
    import jwt
    from jwt import PyJWKClient
    _jwks = _jwks or PyJWKClient(JWKS_URL, cache_keys=True)
    key = _jwks.get_signing_key_from_jwt(token).key
    opts = {"verify_aud": False}
    return jwt.decode(token, key, algorithms=["RS256"], options=opts, issuer=ISSUER or None)


def user(request: Request) -> dict:
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


def _need(allowed: set[str]):
    def dep(u: dict = Depends(user)) -> dict:
        if "*" in allowed or u["roles"] & allowed:
            return u
        raise HTTPException(403, "Your role does not allow this action")
    return dep


can_read = _need(READ_ROLES)
can_write = _need(WRITE_ROLES)
can_admin = _need(ADMIN_ROLES)
