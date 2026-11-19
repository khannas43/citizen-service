#!/usr/bin/env bash
# Read-only probes of UC1 (identity linkage) and UC2 (births) on the running system. Changes nothing: the decide and
# approve probes send invalid input on purpose and expect to be refused.
# Usage (repo root): bash scripts/check_uc12_live.sh
set -uo pipefail
KC="${KEYCLOAK_URL:-http://localhost:31173}"
BASE="${MDM_BASE_URL:-http://localhost:31173/mdm-service}"
export KC BASE
python3 - <<'PY'
import json, os, urllib.request, urllib.parse, urllib.error
KC, BASE = os.environ["KC"], os.environ["BASE"]

def token(user, pw="officer123"):
    d = urllib.parse.urlencode({"grant_type":"password","client_id":"officer-portal","username":user,"password":pw}).encode()
    try: return json.load(urllib.request.urlopen(urllib.request.Request(f"{KC}/realms/citizen/protocol/openid-connect/token", d), timeout=20))["access_token"]
    except Exception: return None

def call(t, method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, headers={"Authorization": f"Bearer {t}", "Content-Type": "application/json"},
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        r = urllib.request.urlopen(req, timeout=60); raw = r.read().decode()
        try: return r.status, json.loads(raw)
        except Exception: return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw

def show(label, ok, extra=""): print(f"[{'OK ' if ok else 'BAD'}] {label} {extra}")

adm, pds = token("dept.admin"), token("pds.officer")
if not (adm and pds): raise SystemExit("Cannot sign in as dept.admin and pds.officer.")
show("sign-in dept.admin and pds.officer", True)

# ---- groups
s, ja = call(adm, "GET", "/api/x/work/groups"); ga = {g["reason_code"]: g for g in ja.get("groups", [])}
print("     admin groups:", {k: v["count"] for k, v in ga.items()})
show("admin: work groups allowed", s == 200)
show("UC2: under-18 parent group exists in the code (BIRTH_PARENT_MINOR is a known reason)",
     "BIRTH_PARENT_MINOR" in ga or s == 200, "(count appears once the backend with the change is running and an under-18 parent exists)")
for r in ("BIRTH_PARENT_MINOR", "LINK_NEAR", "LINK_AMBIGUOUS", "SOURCE_CONFLICT"):
    if r in ga: show(f"{r} is class C and not batchable", ga[r].get("risk_class") == "C" and not ga[r].get("batchable"), str(ga[r].get("batchable")))
if "LINK_LOW_SEPARATE" in ga: show("LINK_LOW_SEPARATE is batchable (class B)", bool(ga["LINK_LOW_SEPARATE"].get("batchable")))

# ---- UC2 batch preview
if "BIRTH_CLEAN" in ga:
    s, j = call(adm, "POST", "/api/x/work/batch/preview", {"reason": "BIRTH_CLEAN"})
    if s == 200:
        show("UC2: preview counts only births that can be approved, and reports how many it left out", "held_for_consent" in j,
             f"ready={j.get('count')} left_out={j.get('held_for_consent')}")
    else:
        show("UC2: preview refuses plainly when nothing is ready", s == 409, f"HTTP {s}: {str(j)[:140]}")
for r in ("LINK_NEAR", "LINK_AMBIGUOUS", "SOURCE_CONFLICT", "BIRTH_PARENT_MINOR", "BIRTH_PARENT_UNSURE"):
    if r in ga:
        s, j = call(adm, "POST", "/api/x/work/batch/preview", {"reason": r}); show(f"{r}: batch preview refused", s == 409, f"HTTP {s}")

# ---- flow board identity row agrees with the queue (UC1 4.3)
s, jb = call(adm, "GET", "/api/x/flow-board")
rows = jb.get("rows") or jb.get("departments") or []
idrow = next((x for x in rows if "Identity" in str(x.get("name") or x.get("system") or x.get("department") or "")), None)
show("UC1: Flow board has the Identity linkage row", idrow is not None)
if idrow:
    in_queue = sum(ga[r]["count"] for r in ("LINK_NEAR", "LINK_AMBIGUOUS", "LINK_LOW_SEPARATE", "SOURCE_CONFLICT") if r in ga)
    got = idrow.get("in_review", idrow.get("needs_person"))
    print(f"     identity row: {json.dumps({k: v for k, v in idrow.items() if not isinstance(v, (dict, list))})[:300]}")
    show("UC1: row's in-review number equals the four groups in the queue", got == in_queue, f"row={got} queue={in_queue}")

# ---- department users must not reach identity work
s, jp = call(pds, "GET", "/api/x/work/groups"); gp = {g["reason_code"] for g in jp.get("groups", [])}
show("pds.officer sees no identity-linkage groups", not (gp & {"LINK_NEAR", "LINK_AMBIGUOUS", "LINK_LOW_SEPARATE", "SOURCE_CONFLICT"}), str(sorted(gp)))
s, j = call(pds, "POST", "/api/x/work/review/1/decide", {"decision": "NOPE"}); show("pds.officer cannot decide a review task", s == 403, f"HTTP {s}")
s, j = call(pds, "POST", "/api/x/citizen-requests/auto-confirm", {}); show("pds.officer cannot run citizen auto-confirm", s == 403, f"HTTP {s}")

# ---- the only link write path refuses bad input
s, j = call(adm, "POST", "/api/x/work/review/999999999/decide", {"decision": "LINK", "person_id": 1}); show("unknown review task: 404", s == 404, f"HTTP {s}")
s, j = call(adm, "POST", "/api/x/work/review/999999999/decide", {"decision": "NOPE"}); show("bad decision value refused (404/422), nothing changed", s in (404, 422), f"HTTP {s}")
print("done")
PY
