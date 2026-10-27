#!/usr/bin/env python3
"""Seed Telangana activity data (applications, approvals, grievances) through the live APIs.

Run (portal on 31173 must be up):
    python3 seed_data/telangana/seed_activity_tg.py --apps 300 --grievances 80
Goes through the officer-portal proxy so tenancy/RLS apply (rows land in TG).
Re-running adds more rows; use small counts when testing.
"""
import argparse, json, random, urllib.request, urllib.parse, urllib.error

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:31173")
ap.add_argument("--user", default="scheme.dept")
ap.add_argument("--password", default="officer123")
ap.add_argument("--apps", type=int, default=300)
ap.add_argument("--grievances", type=int, default=80)
ap.add_argument("--finish", type=float, default=0.0, help="fraction of PENDING applications to push through all stages to APPROVED")
ap.add_argument("--only-finish", action="store_true")
ap.add_argument("--enrich", action="store_true", help="add grievance comments and officer information requests to EXISTING data (no new applications/grievances)")
ap.add_argument("--seed", type=int, default=7)
a = ap.parse_args()
random.seed(a.seed)


def call(method, path, body=None, token=None, form=None):
    h, data = {}, None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        h["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(a.base + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read().decode()
            return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]


s, t = call("POST", "/realms/citizen/protocol/openid-connect/token", form={
    "grant_type": "password", "client_id": "officer-portal",
    "username": a.user, "password": a.password})
assert s == 200, f"login failed {s} {t}"
tok = t["access_token"]

s, schemes = call("GET", "/scheme-engine-service/v1/schemes", token=tok)
assert s == 200 and schemes, f"schemes {s} {schemes}"

pool = []
for sc in schemes:
    s, bens = call("GET", f"/scheme-engine-service/v1/schemes/{sc['id']}/beneficiaries", token=tok)
    if s == 200:
        pool += [(sc, b) for b in bens[:40]]
random.shuffle(pool)
print(f"{len(schemes)} schemes, {len(pool)} candidate beneficiaries")

fam_cache = {}


def aadhaar_for(fid, pid):
    if fid not in fam_cache:
        s, f = call("GET", f"/family-registry-service/v1/families/{fid}", token=tok)
        fam_cache[fid] = f if s == 200 and isinstance(f, dict) else {}
    for m in fam_cache[fid].get("members", []) or []:
        if str(m.get("id") or m.get("personId")) == str(pid):
            for k, v in m.items():
                if "aadhaar" in k.lower() and v:
                    return v, m.get("name")
    return None, None


made = approved = 0
for sc, b in ([] if (a.only_finish or a.enrich) else pool[: a.apps]):
    ref, name = aadhaar_for(b["familyId"], b["personId"])
    if not ref:
        continue
    s, app = call("POST", "/scheme-application-service/v1/applications", token=tok, body={
        "schemeId": sc["id"], "schemeName": sc.get("name"), "familyId": b["familyId"],
        "aadhaarRef": ref, "declaredIncome": random.choice([60000, 90000, 120000, 150000]),
        "tenantId": "TG"})
    if s not in (200, 201) or not isinstance(app, dict):
        continue
    made += 1
    if random.random() < 0.55:
        s2, _ = call("POST", f"/scheme-application-service/v1/applications/{app.get('engineRef') or app.get('applicationNo')}/approve", token=tok)
        approved += s2 == 200
print(f"applications created={made} approved={approved}")

if a.finish > 0:
    s, apps = call("GET", "/scheme-application-service/v1/applications", token=tok)
    done = 0
    for app in (apps if s == 200 else []):
        if app.get("status") == "APPROVED" or random.random() > a.finish:
            continue
        ref = app.get("engineRef") or app.get("applicationNo")
        for _ in range(6):
            s2, r = call("POST", f"/scheme-application-service/v1/applications/{ref}/approve", token=tok)
            if s2 != 200 or not isinstance(r, dict) or r.get("status") == "APPROVED":
                break
        done += isinstance(r, dict) and r.get("status") == "APPROVED"
    print(f"fully approved={done}")

CATS = ["DELAYED_PROCESSING", "SCHEME_ELIGIBILITY", "BENEFIT_NOT_RECEIVED", "OTHER"]
TEXT = {
    "DELAYED_PROCESSING": "My application has been pending for several weeks without any update.",
    "SCHEME_ELIGIBILITY": "I meet the criteria but the portal says I am not eligible. Please review.",
    "BENEFIT_NOT_RECEIVED": "Scheme was approved but the benefit has not been credited to my account.",
    "OTHER": "Details in my family record are incorrect; please correct them.",
}
gcount = resolved = 0
random.shuffle(pool)
for sc, b in ([] if (a.only_finish or a.enrich) else pool[: a.grievances]):
    ref, name = aadhaar_for(b["familyId"], b["personId"])
    if not ref:
        continue
    cat = random.choice(CATS)
    s, g = call("POST", "/grievance-service/v1/grievances", token=tok, body={
        "aadhaarRef": ref, "citizenName": name or "Citizen", "complaintText": TEXT[cat],
        "category": cat, "priority": random.choice(["LOW", "MEDIUM", "HIGH"])})
    if s not in (200, 201) or not isinstance(g, dict):
        continue
    gcount += 1
    if random.random() < 0.45:
        s2, _ = call("PATCH", f"/grievance-service/v1/grievances/{g.get('id') or g.get('grievanceId')}", token=tok,
                     body={"status": "RESOLVED", "officerNotes": "Reviewed and resolved by the department."})
        resolved += s2 == 200
print(f"grievances created={gcount} resolved={resolved}")

if a.enrich:
    OFFICER_NOTES = ["We have received your complaint and assigned it to the concerned section.",
                     "The application has been forwarded to the Mandal Revenue Officer for verification.",
                     "Please keep your Aadhaar and ration card ready if the field officer contacts you."]
    CITIZEN_REPLIES = ["Thank you. Please let me know if any other document is needed.",
                       "I have visited the Mee Seva centre but the status has not changed yet."]
    s, gl = call("GET", "/grievance-service/v1/grievances/all", token=tok)
    nc = 0
    for g in (gl if s == 200 and isinstance(gl, list) else [])[:60]:
        gid = g.get("id")
        if not gid or random.random() > 0.6:
            continue
        s1, _ = call("POST", f"/grievance-service/v1/grievances/{gid}/comments", token=tok,
                     body={"authorName": "Scheme Department Officer", "authorType": "OFFICER", "commentText": random.choice(OFFICER_NOTES)})
        if random.random() < 0.5:
            call("POST", f"/grievance-service/v1/grievances/{gid}/comments", token=tok,
                 body={"authorName": g.get("citizenName") or "Citizen", "authorType": "CITIZEN", "commentText": random.choice(CITIZEN_REPLIES)})
        nc += s1 == 200
    print(f"grievances with comments={nc}")
    s, al = call("GET", "/scheme-application-service/v1/applications", token=tok)
    ni = 0
    for app in (al if s == 200 and isinstance(al, list) else []):
        if app.get("status") == "APPROVED" or ni >= 12 or random.random() > 0.15:
            continue
        s2, _ = call("POST", "/grievance-service/v1/clarifications/info-request", token=tok, body={
            "applicationRef": app.get("engineRef"), "displayRef": app.get("applicationNo"), "aadhaarRef": app.get("aadhaarRef"),
            "serviceName": app.get("schemeName") or "Scheme Application",
            "query": "Please upload a recent income certificate issued by the Tahsildar (MRO) so we can complete verification.",
            "officerName": "Scheme Department Officer"})
        ni += s2 == 200
    print(f"information requests={ni}")

for label, path in [("applications", "/scheme-application-service/v1/applications/stats"),
                    ("grievances", "/grievance-service/v1/grievances/stats")]:
    print(label, call("GET", path, token=tok))
