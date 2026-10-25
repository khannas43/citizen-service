#!/usr/bin/env python3
"""Create (or update) a Keycloak user in realm `citizen` for a given state and realm role.

    python3 scripts/create_state_user.py --url http://localhost:8190 --username tn.revenue --state TN --role REVENUE_OFFICER
The password is read from the environment variable CS_USER_PASSWORD (never from the command line).
Keycloak admin login: KC_ADMIN / KC_ADMIN_PASSWORD (defaults to the dev admin of this local setup).
"""
import argparse, json, os, sys, urllib.parse, urllib.request, urllib.error

ap = argparse.ArgumentParser()
ap.add_argument("--url", default="http://localhost:8190")
ap.add_argument("--username", required=True)
ap.add_argument("--state", required=True)
ap.add_argument("--role", required=True)
a = ap.parse_args()
pw = os.environ.get("CS_USER_PASSWORD")
if not pw:
    sys.exit("Set CS_USER_PASSWORD first")

def call(method, path, body=None, token=None, form=None):
    data = urllib.parse.urlencode(form).encode() if form else (None if body is None else json.dumps(body).encode())
    h = {"Content-Type": "application/x-www-form-urlencoded" if form else "application/json"}
    if token: h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(a.url + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read(); return r.status, (json.loads(raw) if raw and raw[:1] in b"[{" else None)
    except urllib.error.HTTPError as e:
        return e.code, None

_, t = call("POST", "/realms/master/protocol/openid-connect/token", form={
    "grant_type": "password", "client_id": "admin-cli",
    "username": os.environ.get("KC_ADMIN", "admin"), "password": os.environ.get("KC_ADMIN_PASSWORD", "admin")})
tok = t["access_token"]
R = "/admin/realms/citizen"
code, _ = call("POST", f"{R}/users", {"username": a.username, "enabled": True, "emailVerified": True,
               "attributes": {"state_code": [a.state]}}, tok)
print("create user:", code, "(409 = already exists)")
_, users = call("GET", f"{R}/users?username={urllib.parse.quote(a.username)}&exact=true", token=tok)
uid = users[0]["id"]
call("PUT", f"{R}/users/{uid}", {"username": a.username, "enabled": True, "emailVerified": True,
     "attributes": {"state_code": [a.state]}}, tok)
print("set password:", call("PUT", f"{R}/users/{uid}/reset-password", {"type": "password", "value": pw, "temporary": False}, tok)[0])
_, role = call("GET", f"{R}/roles/{a.role}", token=tok)
print("assign role:", call("POST", f"{R}/users/{uid}/role-mappings/realm", [role], tok)[0])
