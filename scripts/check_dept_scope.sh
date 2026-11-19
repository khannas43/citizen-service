#!/usr/bin/env bash
# Read-only probes of the department users (pds.officer, health.officer). Changes nothing:
# the decide probe sends an invalid decision value on purpose.
# Usage: bash scripts/check_dept_scope.sh
set -uo pipefail
KC="${KEYCLOAK_URL:-http://localhost:31173}"
BASE="${MDM_BASE_URL:-http://localhost:31173/mdm-service}"
export KC BASE
python3 - <<'PY'
import json, os, urllib.request, urllib.parse, urllib.error, base64
KC, BASE = os.environ["KC"], os.environ["BASE"]

def token(user, pw="officer123"):
    d = urllib.parse.urlencode({"grant_type":"password","client_id":"officer-portal","username":user,"password":pw}).encode()
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request(f"{KC}/realms/citizen/protocol/openid-connect/token", d), timeout=20))
        return r["access_token"]
    except Exception as e:
        return None

def roles(t):
    p = t.split(".")[1]; p += "=" * (-len(p) % 4)
    return json.loads(base64.urlsafe_b64decode(p)).get("realm_access", {}).get("roles", [])

def call(t, method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, headers={"Authorization": f"Bearer {t}", "Content-Type": "application/json"},
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        r = urllib.request.urlopen(req, timeout=30); raw = r.read().decode()
        try: return r.status, json.loads(raw)
        except Exception: return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw

def rows(j):
    if isinstance(j, dict):
        for k in ("rows", "departments", "items", "data"):
            if isinstance(j.get(k), list): return j[k]
    return j if isinstance(j, list) else []

def show(label, ok, extra=""):
    print(f"[{'OK ' if ok else 'BAD'}] {label} {extra}")

adm = token("dept.admin"); pds = token("pds.officer"); hlt = token("health.officer"); tal = token("talati")
for n, t in (("dept.admin", adm), ("pds.officer", pds), ("health.officer", hlt), ("talati (existing user)", tal)):
    show(f"sign-in {n}", bool(t), ("roles=" + ",".join(r for r in roles(t) if r.isupper())) if t else "NO TOKEN")
if not (adm and pds and hlt):
    raise SystemExit("Cannot continue without admin, pds.officer and health.officer tokens.")

def board(t, q=""):
    s, j = call(t, "GET", "/api/x/flow-board" + q); return s, j
for name, t in (("pds.officer", pds), ("health.officer", hlt)):
    s, j = board(t); r = rows(j)
    names = [x.get("system") or x.get("name") or x.get("department") for x in r]
    print(f"     {name} flow board: HTTP {s}, rows={names}")
    show(f"{name}: one row only", s == 200 and len(r) == 1)
s, j = board(pds, "?system=health"); r = rows(j)
show("pds.officer with system=health still sees only its own row", s == 200 and len(r) == 1,
     str([x.get("system") or x.get("name") for x in r]))
s, ja = board(adm); show("dept.admin sees all departments", s == 200 and len(rows(ja)) > 3, f"rows={len(rows(ja))}")

for name, t in (("pds.officer", pds), ("health.officer", hlt)):
    s, j = call(t, "GET", "/api/x/work/groups")
    g = j.get("groups", j) if isinstance(j, dict) else j
    tot = sum(x.get("count", x.get("n", 0)) for x in g) if isinstance(g, list) else "?"
    print(f"     {name} work groups: HTTP {s}, open items={tot}")
    show(f"{name}: work groups allowed", s == 200)

for name, t in (("pds.officer", pds), ("health.officer", hlt)):
    for p in ("/api/x/control", "/api/persons", "/api/x/ledger", "/api/x/policy", "/api/x/definitely-not-a-route", "/api/events"):
        s, _ = call(t, "GET", p); show(f"{name} GET {p} is refused (403)", s == 403, f"got {s}")
for name, t in (("pds.officer", pds), ("health.officer", hlt)):
    for p in ("/api/x/consents", "/api/x/deliveries", "/api/x/approvals"):
        s, _ = call(t, "GET", p); show(f"{name} GET {p} allowed", s == 200, f"got {s}")

# a proposal that is not PDS's
s, j = call(adm, "GET", "/api/proposals?limit=200")
props = rows(j)
other = next((p for p in props if "pds" not in (p.get("system") or "").lower() and "civil supplies" not in (p.get("system") or "").lower()), None)
mine = next((p for p in props if "civil supplies" in (p.get("system") or "").lower() or "pds" in (p.get("system") or "").lower()), None)
if other:
    s, _ = call(pds, "POST", f"/api/proposals/{other['id']}/decision", {"decision": "PROBE_INVALID"})
    show(f"pds.officer deciding another department's proposal ({other.get('system')}) gets 404", s == 404, f"got {s}")
else:
    print("     (no non-PDS open proposal found to probe)")
if mine:
    s, _ = call(pds, "POST", f"/api/proposals/{mine['id']}/decision", {"decision": "PROBE_INVALID"})
    print(f"     pds.officer on its own proposal with an invalid decision: HTTP {s} (400/422 expected, not 404)")
# Contents of the allowed lists: which departments appear?
def systems(j):
    out = set()
    def walk(x):
        if isinstance(x, dict):
            for k in ("system", "to_system", "department", "dept", "system_code"):
                v = x.get(k)
                if isinstance(v, str): out.add(v)
            for v in x.values(): walk(v)
        elif isinstance(x, list):
            for v in x: walk(v)
    walk(j); return out
for name, t, ok_words in (("pds.officer", pds, ("pds", "civil supplies")), ("health.officer", hlt, ("health",))):
    for p in ("/api/x/consents?limit=200", "/api/x/deliveries?limit=200", "/api/x/approvals"):
        s, j = call(t, "GET", p); sy = systems(j)
        bad = [v for v in sy if not any(w in v.lower() for w in ok_words)]
        show(f"{name} GET {p.split('?')[0]} contains only its own department", s == 200 and not bad, f"departments seen={sorted(sy)}")
for p in ("/api/x/consents?limit=200", "/api/x/deliveries?limit=200"):
    s, j = call(adm, "GET", p); print(f"     dept.admin {p.split('?')[0]} departments seen={sorted(systems(j))}")
print("Done. Nothing was changed.")
PY
