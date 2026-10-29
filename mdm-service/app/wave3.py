"""Wave 3: connectors, partner API keys, blocked users, citizen view and assisted channel."""
from __future__ import annotations
import hashlib, hmac, secrets
from datetime import datetime, timedelta, timezone

from . import audit, exchange, ops, store
from .exchange import PURPOSES, QUESTIONS, SYSTEMS, REF_DATE, current, ledger, _js
from .sources import SOURCE_INFO
from .stewardship import Refused

AUTH_METHODS = {"MTLS_KEY": "Mutual TLS plus API key", "OAUTH_CLIENT": "OAuth client credentials", "SFTP_KEY": "SFTP with key pair", "DB_VIEW": "Read-only database view", "PORTAL_OPERATOR": "Operator-keyed (no technical interface)"}
STATUSES = ("DRAFT", "TESTING", "ACTIVE", "SUSPENDED")
REQUIRED_ELEMENTS = {"name"}                           # a feed must at least say whose record it is
STANDARD_ELEMENTS = ["name", "gender", "date_of_birth", "age", "address", "district", "ration_card", "income", "category", "life_status", "identity_reference"]


def _need_reason(cur, text: str | None):
    if len((text or "").strip()) < current(cur)["rationale_min_chars"]:
        raise Refused(f"Give a reason of at least {current(cur)['rationale_min_chars']} characters; it is recorded against your name")


# ------------------------------------------------------------------ connectors
def _log(cur, cid, actor, action, detail=None):
    cur.execute("INSERT INTO mdm.connector_log (connector_id, actor, action, detail) VALUES (%s,%s,%s,%s::jsonb)", (cid, actor, action, _js(detail or {})))


def seed_connectors(cur):
    """The feeds already loaded are shown as active connectors, so onboarding and the existing estate look the same."""
    cur.execute("SELECT count(*) AS n FROM mdm.connector")
    if cur.fetchone()["n"]:
        return
    for src, (nm, iface, _h) in SOURCE_INFO.items():
        auth = "SFTP_KEY" if "SFTP" in iface else "DB_VIEW" if "database" in iface else "PORTAL_OPERATOR" if "operator" in iface else "OAUTH_CLIENT" if "REST" in iface else "MTLS_KEY"
        cur.execute("INSERT INTO mdm.connector (source, name, system, interface, auth_method, schedule, status, created_by) VALUES (%s,%s,%s,%s,%s,%s,'ACTIVE','system') ON CONFLICT DO NOTHING RETURNING id",
                    (src, nm, ops.SOURCE_SYSTEM.get(src), iface, auth, "Per feed"))
        r = cur.fetchone()
        if r:
            _log(cur, r["id"], "system", "REGISTERED", {"note": "Existing feed registered at set-up"})


def _stats(cur, source):
    cur.execute("SELECT count(*) AS n, max(as_of) AS latest, count(*) FILTER (WHERE link_status='IN_REVIEW') AS in_review, count(*) FILTER (WHERE person_id IS NULL) AS unlinked FROM mdm.source_record WHERE source=%s", (source,))
    return cur.fetchone()


def list_connectors(cur) -> dict:
    seed_connectors(cur)
    cur.execute("SELECT * FROM mdm.connector ORDER BY id")
    items = cur.fetchall()
    for c in items:
        s = _stats(cur, c["source"])
        c["records"], c["latest_as_of"] = s["n"], s["latest"]
        c["system_name"] = SYSTEMS.get(c["system"], c["system"])
        c["auth_name"] = AUTH_METHODS.get(c["auth_method"], c["auth_method"])
    return {"items": items, "auth_methods": AUTH_METHODS, "elements": STANDARD_ELEMENTS, "systems": {k: v for k, v in SYSTEMS.items() if k not in ("mdm",)}}


def create_connector(cur, body: dict, actor: str) -> dict:
    seed_connectors(cur)
    src = (body.get("source") or "").strip().lower().replace(" ", "_")
    if not src or not src.replace("_", "").isalnum():
        raise Refused("Give the feed a short name using letters, numbers and underscores")
    if body.get("auth_method") not in AUTH_METHODS:
        raise Refused("Choose how the department connects")
    if body.get("system") not in SYSTEMS:
        raise Refused("Choose the department that owns this feed")
    cur.execute("SELECT 1 FROM mdm.connector WHERE source=%s", (src,))
    if cur.fetchone():
        raise Refused("A connector with this name already exists", 409)
    mapping = {k: v for k, v in (body.get("mapping") or {}).items() if k and v}
    cur.execute("INSERT INTO mdm.connector (source, name, system, interface, auth_method, schedule, mapping, status, created_by) VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,'DRAFT',%s) RETURNING *",
                (src, (body.get("name") or src).strip(), body["system"], body.get("interface"), body["auth_method"], body.get("schedule"), _js(mapping), actor))
    c = cur.fetchone()
    _log(cur, c["id"], actor, "CREATED", {"mapping_fields": len(mapping)})
    audit.write(cur, actor, "CONNECTOR_CREATED", f"connector:{c['id']}", {"source": src, "system": body["system"]})
    return c


def get_connector(cur, cid: int) -> dict:
    cur.execute("SELECT * FROM mdm.connector WHERE id=%s", (cid,))
    c = cur.fetchone()
    if not c:
        raise Refused("Connector not found", 404)
    cur.execute("SELECT ts, actor, action, detail FROM mdm.connector_log WHERE connector_id=%s ORDER BY id DESC LIMIT 50", (cid,))
    c["log"] = cur.fetchall()
    s = _stats(cur, c["source"])
    c["stats"] = {"records": s["n"], "latest_as_of": s["latest"], "waiting_for_steward": s["in_review"], "unlinked": s["unlinked"]}
    fresh = SOURCE_INFO.get(c["source"], (None, None, None))[2]
    c["freshness_hours"] = fresh
    cur.execute("SELECT status, count(*) AS n FROM mdm.delivery WHERE system=%s AND kind='EVENT' GROUP BY 1", (c["system"],))
    c["deliveries"] = {r["status"]: r["n"] for r in cur.fetchall()}
    cur.execute("SELECT count(*) AS n FROM mdm.dq_issue d JOIN mdm.source_record s ON s.id=d.record_id WHERE s.source=%s AND d.status='OPEN'", (c["source"],))
    c["stats"]["open_quality_issues"] = cur.fetchone()["n"]
    c["system_name"] = SYSTEMS.get(c["system"], c["system"])
    c["auth_name"] = AUTH_METHODS.get(c["auth_method"], c["auth_method"])
    c["available"] = exchange.is_available(cur, c["system"]) if c["system"] in SYSTEMS else True
    return c


def update_mapping(cur, cid: int, mapping: dict, actor: str) -> dict:
    c = get_connector(cur, cid)
    if c["status"] == "ACTIVE":
        raise Refused("Suspend the connector before changing its mapping", 409)
    mapping = {k: v for k, v in (mapping or {}).items() if k and v}
    bad = [v for v in mapping.values() if v not in STANDARD_ELEMENTS]
    if bad:
        raise Refused("Map fields only to standard elements: " + ", ".join(STANDARD_ELEMENTS))
    cur.execute("UPDATE mdm.connector SET mapping=%s::jsonb, status='DRAFT', last_test=NULL, updated_at=now() WHERE id=%s", (_js(mapping), cid))
    _log(cur, cid, actor, "MAPPING_CHANGED", {"fields": len(mapping)})
    audit.write(cur, actor, "CONNECTOR_MAPPING", f"connector:{cid}", {"fields": len(mapping)})
    return get_connector(cur, cid)


def test_connector(cur, cid: int, actor: str) -> dict:
    """Checks the set-up, not the department's live system: mapping covers what is needed, secure access is chosen, and any data already loaded is fresh enough."""
    c = get_connector(cur, cid)
    checks = []
    mapped = set((c["mapping"] or {}).values())
    existing = c["stats"]["records"] > 0
    checks.append({"check": "Says whose record it is (name)", "ok": "name" in mapped or existing, "note": "" if ("name" in mapped or existing) else "Map a department field to 'name'"})
    checks.append({"check": "Secure access method chosen", "ok": c["auth_method"] in AUTH_METHODS,
                   "note": AUTH_METHODS.get(c["auth_method"], "") + (". Operator-keyed data is the least reliable; it is flagged in quality checks." if c["auth_method"] == "PORTAL_OPERATOR" else "")})
    checks.append({"check": "Linkable to a person", "ok": bool(mapped & {"identity_reference", "date_of_birth", "age", "address", "ration_card"}) or existing,
                   "note": "Needs the identity reference token, or enough to match by name, birth date and address" if not (mapped & {"identity_reference", "date_of_birth", "age", "address", "ration_card"} or existing) else ""})
    if existing and c["freshness_hours"]:
        latest = str(c["stats"]["latest_as_of"] or "")[:10]
        if latest:
            from datetime import date
            age_h = (REF_DATE - date.fromisoformat(latest)).days * 24
            ok = age_h <= max(c["freshness_hours"], 24 * 400)
            checks.append({"check": "Data already loaded is fresh enough", "ok": ok, "note": f"Latest record is as of {latest}"})
    checks.append({"check": "Department system reachable", "ok": c["available"], "note": "" if c["available"] else "Marked offline in the control tower"})
    ok = all(x["ok"] for x in checks)
    result = {"ok": ok, "checks": checks, "tested_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    new_status = c["status"] if c["status"] in ("ACTIVE", "SUSPENDED") else "TESTING"
    cur.execute("UPDATE mdm.connector SET last_test=%s::jsonb, status=%s, updated_at=now() WHERE id=%s", (_js(result), new_status, cid))
    _log(cur, cid, actor, "TESTED", {"ok": ok})
    return result


def set_state(cur, cid: int, action: str, actor: str, reason: str | None) -> dict:
    c = get_connector(cur, cid)
    _need_reason(cur, reason)
    action = action.upper()
    if action == "ACTIVATE":
        if c["status"] not in ("TESTING", "SUSPENDED"):
            raise Refused("Test the connector first", 409)
        if not (c["last_test"] or {}).get("ok"):
            raise Refused("The last test did not pass, so it cannot be activated", 409)
        new = "ACTIVE"
    elif action == "SUSPEND":
        if c["status"] != "ACTIVE":
            raise Refused("Only an active connector can be suspended", 409)
        new = "SUSPENDED"
    else:
        raise Refused("action must be ACTIVATE or SUSPEND")
    cur.execute("UPDATE mdm.connector SET status=%s, updated_at=now() WHERE id=%s", (new, cid))
    _log(cur, cid, actor, action + "D" if action == "ACTIVATE" else "SUSPENDED", {"reason": reason})
    audit.write(cur, actor, f"CONNECTOR_{new}", f"connector:{cid}", {"source": c["source"], "reason": reason})
    return get_connector(cur, cid)


# ------------------------------------------------------------------ partner API keys
def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _new_secret() -> str:
    return secrets.token_urlsafe(24)


def list_keys(cur) -> list[dict]:
    cur.execute("SELECT id, key_id, system, label, prefix, scopes, status, created_by, created_at, expires_at, rotated_at, revoked_at, revoked_by, last_used_at, use_count FROM mdm.api_key ORDER BY id DESC")
    rows = cur.fetchall()
    now = datetime.now(timezone.utc)
    for r in rows:
        r["system_name"] = SYSTEMS.get(r["system"], r["system"])
        r["expired"] = bool(r["expires_at"] and r["expires_at"] <= now)
    return rows


def issue_key(cur, system: str, label: str, scopes: list[str], days: int, actor: str) -> dict:
    if system not in SYSTEMS or system in ("mdm", "crs", "marriage_register", "identity"):
        raise Refused("Choose a department that asks questions")
    allowed = {k for k, v in PURPOSES.items() if v["system"] == system}
    scopes = [s for s in (scopes or []) if s]
    if not scopes or not set(scopes) <= allowed:
        raise Refused("Choose at least one use that belongs to this department")
    if not 1 <= days <= 730:
        raise Refused("A key lasts between 1 and 730 days")
    key_id, secret = "k" + secrets.token_hex(4), _new_secret()
    cur.execute("INSERT INTO mdm.api_key (key_id, system, label, prefix, secret_hash, scopes, created_by, expires_at) VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s,now()+make_interval(days=>%s)) RETURNING id",
                (key_id, system, label, secret[:4], _hash(secret), _js(scopes), actor, days))
    audit.write(cur, actor, "KEY_ISSUED", f"key:{key_id}", {"system": system, "scopes": scopes, "days": days})
    return {"key_id": key_id, "key": f"{key_id}.{secret}", "system": system, "scopes": scopes, "note": "Copy this key now. It is shown once and only a fingerprint is kept."}


def rotate_key(cur, key_id: str, actor: str) -> dict:
    cur.execute("SELECT * FROM mdm.api_key WHERE key_id=%s FOR UPDATE", (key_id,))
    k = cur.fetchone()
    if not k:
        raise Refused("Key not found", 404)
    if k["status"] != "ACTIVE":
        raise Refused("A revoked key cannot be rotated. Issue a new one.", 409)
    secret = _new_secret()
    cur.execute("UPDATE mdm.api_key SET secret_hash=%s, prefix=%s, rotated_at=now() WHERE key_id=%s", (_hash(secret), secret[:4], key_id))
    audit.write(cur, actor, "KEY_ROTATED", f"key:{key_id}", {})
    return {"key_id": key_id, "key": f"{key_id}.{secret}", "note": "The old secret stopped working immediately. Copy the new key now; it is shown once."}


def revoke_key(cur, key_id: str, actor: str, reason: str | None) -> dict:
    _need_reason(cur, reason)
    cur.execute("UPDATE mdm.api_key SET status='REVOKED', revoked_at=now(), revoked_by=%s WHERE key_id=%s AND status='ACTIVE' RETURNING key_id", (actor, key_id))
    if not cur.fetchone():
        raise Refused("No active key with this id", 404)
    audit.write(cur, actor, "KEY_REVOKED", f"key:{key_id}", {"reason": reason})
    return {"key_id": key_id, "status": "REVOKED"}


def key_from_header(cur, header: str | None) -> dict:
    """Checks a presented key. Always the same message on failure, so it does not hint at which part was wrong."""
    bad = Refused("The key is missing, wrong, expired or revoked", 401)
    if not header or "." not in header:
        raise bad
    key_id, secret = header.split(".", 1)
    cur.execute("SELECT * FROM mdm.api_key WHERE key_id=%s", (key_id,))
    k = cur.fetchone()
    if not k or k["status"] != "ACTIVE" or (k["expires_at"] and k["expires_at"] <= datetime.now(timezone.utc)) or not hmac.compare_digest(k["secret_hash"], _hash(secret)):
        raise bad
    cur.execute("UPDATE mdm.api_key SET last_used_at=now(), use_count=use_count+1 WHERE key_id=%s", (key_id,))
    return k


def partner_verify(cur, key: dict, purpose: str, question: str, params: dict, reference_token: str) -> dict:
    actor = f"partner:{key['key_id']}"
    if purpose not in (key["scopes"] or []):
        lid = ledger(cur, "VERIFY", key["system"], actor, purpose, None, None, question, "DENIED_POLICY", {"reason": "outside the scopes of this key"})
        return {"outcome": "DENIED_POLICY", "message": "This key is not allowed to ask under that use.", "ledger_id": lid}
    return exchange.verify(cur, key["system"], purpose, question, params, actor, None, reference_token)


def partner_catalogue(key: dict) -> dict:
    uses = [{"purpose": p, "name": PURPOSES[p]["name"], "consent_required": PURPOSES[p]["consent"],
             "questions": [{"question": q, "label": d["label"], "needs": d["param"]} for q, d in QUESTIONS.items() if d["element"] in PURPOSES[p]["elements"]]} for p in key["scopes"] if p in PURPOSES]
    return {"department": SYSTEMS.get(key["system"]), "uses": uses}


# ------------------------------------------------------------------ blocked users and misuse
def access_overview(cur) -> dict:
    cur.execute("SELECT * FROM mdm.access_block ORDER BY id DESC LIMIT 100")
    blocks = cur.fetchall()
    cur.execute("SELECT seq, ts, actor, subject, detail FROM mdm.audit WHERE action='MISUSE_ALERT' ORDER BY seq DESC LIMIT 25")
    alerts = cur.fetchall()
    cur.execute("""SELECT requester_actor AS actor, count(*) AS lookups, count(DISTINCT person_id) AS people,
                          count(*) FILTER (WHERE outcome IN ('DENIED_NO_CONSENT','DENIED_POLICY')) AS refused
                   FROM mdm.exchange WHERE ts > now() - interval '24 hours' AND kind IN ('VERIFY','QUERY') AND requester_actor IS NOT NULL
                   GROUP BY 1 ORDER BY 2 DESC LIMIT 15""")
    top = cur.fetchall()
    for t in top:
        t["blocked"] = exchange.is_blocked(cur, t["actor"])
    from . import auth
    pol = current(cur)
    return {"blocks": blocks, "alerts": alerts, "activity": top, "limit_per_hour": pol["max_lookups_per_hour"],
            "roles": [{"role": "Read", "who": sorted(auth.READ_ROLES), "can": "See every screen and all records"},
                      {"role": "Write", "who": sorted(auth.WRITE_ROLES), "can": "Decide proposals, record consent answers, raise corrections, run queries"},
                      {"role": "Admin", "who": sorted(auth.ADMIN_ROLES), "can": "Change policy, rotate and revoke keys, block users, purge, run the tamper test"}]}


def block_actor(cur, actor_name: str, reason: str, by: str) -> dict:
    actor_name = (actor_name or "").strip()
    if not actor_name:
        raise Refused("Say whose access to stop")
    _need_reason(cur, reason)
    if actor_name == by:
        raise Refused("You cannot block yourself")
    if exchange.is_blocked(cur, actor_name):
        raise Refused("This user is already blocked", 409)
    cur.execute("INSERT INTO mdm.access_block (actor, reason, blocked_by) VALUES (%s,%s,%s) RETURNING *", (actor_name, reason.strip(), by))
    row = cur.fetchone()
    audit.write(cur, by, "ACCESS_BLOCKED", f"user:{actor_name}", {"reason": reason})
    return row


def unblock_actor(cur, block_id: int, by: str, note: str | None) -> dict:
    _need_reason(cur, note)
    cur.execute("UPDATE mdm.access_block SET lifted_at=now(), lifted_by=%s, lift_note=%s WHERE id=%s AND lifted_at IS NULL RETURNING *", (by, note, block_id))
    row = cur.fetchone()
    if not row:
        raise Refused("No active block with this id", 404)
    audit.write(cur, by, "ACCESS_RESTORED", f"user:{row['actor']}", {"note": note})
    return row


# ------------------------------------------------------------------ citizen view (identity reference token is the key)
def person_by_token(cur, token: str) -> int:
    cur.execute("SELECT person_id FROM mdm.source_record WHERE source='identity_reference' AND source_rid=%s", ((token or "").strip(),))
    r = cur.fetchone()
    if not r or not r["person_id"]:
        raise Refused("This identity reference is not known", 404)
    return r["person_id"]


_HIDE = {"live", "raw", "evidence"}


def my_data(cur, token: str) -> dict:
    pid = person_by_token(cur, token)
    cur.execute("SELECT id, mdm_id, name, name_local, gender, dob, birth_year, district, mandal, village, address, life_status FROM mdm.person WHERE id=%s", (pid,))
    p = cur.fetchone()
    recs = store.records_of(cur, [pid]).get(pid, [])
    held = []
    for r in recs:
        if r["source"] == "identity_reference":
            continue
        pay = {k: v for k, v in (r["payload"] or {}).items() if k not in _HIDE and isinstance(v, (str, int, float, bool)) and v not in ("", None)}
        held.append({"source": r["source"], "source_name": SOURCE_INFO.get(r["source"], (r["source"],))[0], "kind": r["rtype"], "as_of": r["as_of"],
                     "name_on_record": r["name"], "address": r["address"], "ration_card": r["ration_card"], "details": pay})
    cur.execute("SELECT id, attribute, current_value, reported_value, status, raised_at, authoritative_system, kind FROM mdm.discrepancy WHERE person_id=%s ORDER BY id DESC LIMIT 20", (pid,))
    reports = cur.fetchall()
    for x in reports:
        x["owner"] = SYSTEMS.get(x["authoritative_system"], x["authoritative_system"])
    summary = exchange.person_exchange_summary(cur, pid)
    return {"person": p, "held": held, "reports": reports, "consents": summary["consents"], "asked": summary["exchanges"],
            "note": "This is everything the master record holds about you, and which department each part came from. To change a value, report it; the department that owns it makes the correction."}


def _own_consent(cur, token: str, cid: int) -> int:
    pid = person_by_token(cur, token)
    cur.execute("SELECT 1 FROM mdm.consent WHERE id=%s AND person_id=%s", (cid, pid))
    if not cur.fetchone():
        raise Refused("This consent request is not yours to answer", 403)
    return pid


def my_consent_answer(cur, token: str, cid: int, decision: str, channel: str, operator: str | None, elements: list[str] | None, actor: str) -> dict:
    _own_consent(cur, token, cid)
    return exchange.respond(cur, cid, decision, actor, channel, operator, "Answered in the citizen view", None, elements, None, None)


def my_consent_withdraw(cur, token: str, cid: int, channel: str, operator: str | None, actor: str) -> dict:
    _own_consent(cur, token, cid)
    return exchange.revoke(cur, cid, actor, channel, operator, "Withdrawn in the citizen view")


def my_report(cur, token: str, attribute: str, current_value: str | None, reported_value: str, reason: str | None, channel: str, operator: str | None, actor: str) -> dict:
    pid = person_by_token(cur, token)
    return ops.raise_discrepancy(cur, pid, attribute, current_value, reported_value, reason, actor, channel, operator)


def my_declaration(cur, token: str, spouse_name: str, channel: str, operator: str | None, actor: str) -> dict:
    return ops.declare_marriage(cur, person_by_token(cur, token), spouse_name, actor, channel, operator)


# ------------------------------------------------------------------ assisted channel
def start_session(cur, operator: str, token: str, visit_reason: str | None, actor: str) -> dict:
    if not (operator or "").strip():
        raise Refused("The operator's name is required")
    pid = person_by_token(cur, token)
    cur.execute("INSERT INTO mdm.assisted_session (operator, person_id, visit_reason, started_by) VALUES (%s,%s,%s,%s) RETURNING *", (operator.strip(), pid, visit_reason, actor))
    s = cur.fetchone()
    audit.write(cur, actor, "ASSISTED_SESSION_STARTED", f"session:{s['id']}", {"operator": operator, "person": pid})
    return s


def end_session(cur, sid: int, actor: str) -> dict:
    cur.execute("SELECT * FROM mdm.assisted_session WHERE id=%s FOR UPDATE", (sid,))
    s = cur.fetchone()
    if not s:
        raise Refused("Session not found", 404)
    if s["ended_at"]:
        raise Refused("This session has already ended", 409)
    cur.execute("SELECT action, count(*) AS n FROM mdm.consent_log l WHERE l.channel='ASSISTED' AND l.actor=%s AND l.ts >= %s GROUP BY 1", (s["started_by"], s["started_at"]))
    consents = {r["action"]: r["n"] for r in cur.fetchall()}
    cur.execute("SELECT count(*) AS n FROM mdm.discrepancy WHERE operator=%s AND person_id=%s AND raised_at >= %s", (s["operator"], s["person_id"], s["started_at"]))
    reports = cur.fetchone()["n"]
    summary = {"consent_actions": consents, "reports_raised": reports}
    cur.execute("UPDATE mdm.assisted_session SET ended_at=now(), summary=%s::jsonb WHERE id=%s RETURNING *", (_js(summary), sid))
    row = cur.fetchone()
    audit.write(cur, actor, "ASSISTED_SESSION_ENDED", f"session:{sid}", summary)
    return row


def list_sessions(cur, limit=30) -> list[dict]:
    cur.execute("SELECT s.*, p.name AS person_name FROM mdm.assisted_session s LEFT JOIN mdm.person p ON p.id=s.person_id ORDER BY s.id DESC LIMIT %s", (limit,))
    return cur.fetchall()
