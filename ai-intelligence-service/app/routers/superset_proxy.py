import os

import httpx
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/v1/superset", tags=["Superset Proxy"])

_SUPERSET = os.getenv("SUPERSET_INTERNAL_URL", "http://superset.citizen.svc.cluster.local:8088")
_USER = os.getenv("SUPERSET_ADMIN_USER", "admin")
_PASS = os.getenv("SUPERSET_ADMIN_PASS", "admin123")


async def _jwt() -> str:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"{_SUPERSET}/api/v1/security/login",
            json={
                "username": _USER,
                "password": _PASS,
                "provider": "db",
                "refresh": True,
            },
        )
        r.raise_for_status()
        return r.json()["access_token"]


async def _csrf(token: str) -> str:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{_SUPERSET}/api/v1/security/csrf_token/",
            headers={"Authorization": f"Bearer {token}"},
        )
        r.raise_for_status()
        return r.json()["result"]


@router.get("/guest-token")
async def guest_token(slug: str):
    """
    Return { embed_uuid, guest_token } for a dashboard slug.
    Creates the embedded-dashboard record if it doesn't exist yet.
    Called by the officer portal Reports screen on every page load.
    """
    try:
        jwt = await _jwt()
        csrf = await _csrf(jwt)
        auth = {"Authorization": f"Bearer {jwt}"}
        rw = {**auth, "X-CSRFToken": csrf, "Referer": _SUPERSET}

        async with httpx.AsyncClient(timeout=15) as c:
            dr = await c.get(f"{_SUPERSET}/api/v1/dashboard/{slug}", headers=auth)
            if dr.status_code == 404:
                raise HTTPException(404, f"Dashboard not found: {slug}")
            dr.raise_for_status()
            dash_id = dr.json()["result"]["id"]

            er = await c.get(f"{_SUPERSET}/api/v1/dashboard/{dash_id}/embedded", headers=auth)
            if er.status_code == 200 and er.json().get("result"):
                embed_uuid = er.json()["result"]["uuid"]
            else:
                cr = await c.post(
                    f"{_SUPERSET}/api/v1/dashboard/{dash_id}/embedded",
                    headers={**rw, "Content-Type": "application/json"},
                    json={"allowed_domains": []},
                )
                cr.raise_for_status()
                embed_uuid = cr.json()["result"]["uuid"]

            tr = await c.post(
                f"{_SUPERSET}/api/v1/security/guest_token/",
                headers={**rw, "Content-Type": "application/json"},
                json={
                    "user": {
                        "username": "dg20_embed",
                        "first_name": "Officer",
                        "last_name": "Portal",
                    },
                    "resources": [{"type": "dashboard", "id": str(embed_uuid)}],
                    "rls": [],
                },
            )
            tr.raise_for_status()
            return {"embed_uuid": str(embed_uuid), "guest_token": tr.json()["token"]}

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Superset unreachable: {exc}") from exc
