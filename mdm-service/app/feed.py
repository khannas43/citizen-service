"""Department feed: the notices a department must answer, how long it has, and what it answered.

A notice comes from one of two places:
- a delivery: data released to a department under a person's consent, or a notice that the consent was withdrawn;
- a proposal: an action a person approved for a department (stop a pension, add a child to a ration card).
Either way the department gets the notice by feed (pulled with its key) or by portal, and answers it: ACCEPTED, APPLIED
(with its own reference), REJECTED (with a reason, which always reopens the proposal) or, for statutory notices, ACKNOWLEDGED.
Whichever route the answer arrives by, it goes through respond(), so there is one rule and one audit entry."""
from __future__ import annotations
import csv
import io
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

from . import audit, exchange, store
from .sorting import order_by
from .stewardship import Refused

OUTCOMES = ("ACCEPTED", "APPLIED", "REJECTED", "ACKNOWLEDGED")
CHANNELS = ("FEED", "PORTAL", "BOTH")
ROUTES = ("FEED", "FILE", "PORTAL", "SIMULATED")
MAX_BATCH = 1000
DAY_KINDS = ("CALENDAR", "WORKING")
EVENT_TYPES = ("BIRTH_REGISTERED", "BIRTH_AMENDED", "BIRTH_WITHDRAWN", "DEATH_REGISTERED", "MARRIAGE_REGISTERED")
EVENT_LABEL = {"BIRTH_REGISTERED": "Birth registered", "BIRTH_AMENDED": "Birth amended", "BIRTH_WITHDRAWN": "Birth withdrawn (entered in error)",
               "DEATH_REGISTERED": "Death registered", "MARRIAGE_REGISTERED": "Marriage registered"}

# the departments a proposal can be addressed to, by the name the proposal carries
PROPOSAL_DEPT = {"Civil supplies (PDS)": "pds", "Social security / pension MIS": "pension", "Revenue: land records": "revenue",
                 "Electricity distribution": "electricity", "Education / scholarship": "education", "Identity reference service": "identity"}
# proposals that are for people at the platform, not for a department
INTERNAL_KINDS = {"CONFIRM_DEATH", "CONFIRM_MARRIAGE", "REVIEW_PARENTS", "REVIEW_NEXT_OF_KIN", "REFER_UNDERAGE", "REVIEW_DEPARTMENT_REJECTION", "NOTE_NEW_NAME"}
USE_KEYS = {"CONSENT_WITHDRAWN": "A withdrawn consent (the department is told to stop using the data)", "STOP_PENSION": "Stop a pension after a death",
            "MARK_DECEASED_PDS": "Mark a person deceased on a ration card", "NOTIFY_SPOUSE": "Tell a spouse about family pension",
            "NOTIFY_NOMINEE": "Tell a pension nominee", "CLOSE_SCHOLARSHIP": "Close a scholarship record",
            "FLAG_LAND_SUCCESSION": "Note a death against land records", "FLAG_CONNECTION": "Ask a household to transfer an electricity connection",
            "ADD_TO_RATION_CARD": "Add a person to a ration card", "REQUEST_IDENTITY_REFERENCE": "Issue an identity reference",
            "RENEW_CERTIFICATE": "Ask a citizen to renew an expired certificate", "SETTLE_SOURCE_CONFLICT": "Re-check certificates that disagree",
            "MANUAL_ROUTE": "Route an applicant from another state by hand",
            "REVIEW_DUPLICATE_BENEFIT": "Look into a household that may already have housing assistance", "REVIEW_CARD_MEMBER": "Review a ration card with a deceased person still active",
            "SETTLE_HOUSEHOLD_CONFLICT": "Re-check a household the ration card and housing record disagree about", "HOUSEHOLD_NOT_FOUND": "An applicant has no household on record"}


def _js(x) -> str:
    return json.dumps(x, default=str, ensure_ascii=False)


def _now(as_of=None) -> datetime:
    return exchange._now(as_of)


# ------------------------------------------------------------------ response-time rules
def add_days(start: datetime, n: int, kind: str) -> datetime:
    """n calendar days, or n working days (Monday to Friday; public holidays are not modelled)."""
    if kind != "WORKING":
        return start + timedelta(days=n)
    d, left = start, n
    while left > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            left -= 1
    return d


def rule_for(cur, event_type: str | None, use: str | None = None, kind: str = "EVENT") -> dict:
    """The rule that applies: a rule for the specific use wins, then the event type, then the default."""
    keys = []
    if kind == "REVOCATION":
        keys.append(("USE", "CONSENT_WITHDRAWN"))
    if use:
        keys.append(("USE", use))
    if event_type:
        keys.append(("EVENT", event_type))
    keys.append(("DEFAULT", "*"))
    for scope, key in keys:
        cur.execute("SELECT scope, key, days, day_kind, version FROM mdm.response_rule WHERE scope=%s AND key=%s AND active", (scope, key))
        r = cur.fetchone()
        if r:
            return dict(r)
    return {"scope": "DEFAULT", "key": "*", "days": 7, "day_kind": "CALENDAR", "version": 0}


def rules_list(cur) -> dict:
    cur.execute("SELECT id, scope, key, days, day_kind, version, changed_by, changed_at, note FROM mdm.response_rule WHERE active ORDER BY "
                "CASE scope WHEN 'DEFAULT' THEN 0 WHEN 'EVENT' THEN 1 ELSE 2 END, key")
    rows = cur.fetchall()
    for r in rows:
        r["label"] = ("Anything not listed" if r["scope"] == "DEFAULT" else EVENT_LABEL.get(r["key"]) if r["scope"] == "EVENT"
                      else USE_KEYS.get(r["key"]) or exchange.PURPOSES.get(r["key"], {}).get("name") or r["key"])
        r["text"] = f"{r['days']} {'working' if r['day_kind'] == 'WORKING' else 'calendar'} day{'s' if r['days'] != 1 else ''}"
    have = {(r["scope"], r["key"]) for r in rows}
    addable = [{"key": k, "label": v} for k, v in USE_KEYS.items() if ("USE", k) not in have]
    addable += [{"key": k, "label": p["name"]} for k, p in exchange.PURPOSES.items() if ("USE", k) not in have]
    return {"rules": rows, "addable_uses": addable, "event_types": [{"key": k, "label": EVENT_LABEL[k]} for k in EVENT_TYPES],
            "note": "A rule for a specific use wins over the rule for its event type, which wins over the default. Working days are Monday to Friday; public holidays are not modelled."}


def rule_history(cur, scope: str, key: str) -> list[dict]:
    cur.execute("SELECT version, days, day_kind, active, changed_by, changed_at, note FROM mdm.response_rule WHERE scope=%s AND key=%s ORDER BY version DESC", (scope, key))
    return cur.fetchall()


def _valid_key(scope: str, key: str):
    if scope == "DEFAULT" and key == "*":
        return
    if scope == "EVENT" and key in EVENT_TYPES:
        return
    if scope == "USE" and (key in USE_KEYS or key in exchange.PURPOSES):
        return
    raise Refused("Unknown event or use for a response time")


def rule_set(cur, scope: str, key: str, days: int, day_kind: str, actor: str, note: str | None) -> dict:
    """Change how long departments have. Applies to notices issued from now on; a notice already issued keeps its deadline."""
    scope, day_kind = (scope or "").upper(), (day_kind or "").upper()
    _valid_key(scope, key)
    if day_kind not in DAY_KINDS:
        raise Refused("Day type must be CALENDAR or WORKING")
    if not isinstance(days, int) or isinstance(days, bool) or not 1 <= days <= 90:
        raise Refused("Days must be a whole number from 1 to 90")
    if len((note or "").strip()) < 10:
        raise Refused("Give a reason of at least 10 characters. It is recorded against your name.")
    cur.execute("SELECT id, version, days, day_kind FROM mdm.response_rule WHERE scope=%s AND key=%s AND active FOR UPDATE", (scope, key))
    old = cur.fetchone()
    if old and old["days"] == days and old["day_kind"] == day_kind:
        raise Refused("That is already the current rule")
    cur.execute("SELECT coalesce(max(version),0)+1 AS v FROM mdm.response_rule WHERE scope=%s AND key=%s", (scope, key))
    ver = cur.fetchone()["v"]
    if old:
        cur.execute("UPDATE mdm.response_rule SET active=false WHERE id=%s", (old["id"],))
    cur.execute("INSERT INTO mdm.response_rule (scope, key, days, day_kind, version, changed_by, note) VALUES (%s,%s,%s,%s,%s,%s,%s)", (scope, key, days, day_kind, ver, actor, note))
    audit.write(cur, actor, "RESPONSE_RULE_CHANGED", f"response_rule:{scope}/{key}",
                {"old": old and {"days": old["days"], "day_kind": old["day_kind"]}, "new": {"days": days, "day_kind": day_kind}, "version": ver, "note": note})
    return {"scope": scope, "key": key, "days": days, "day_kind": day_kind, "version": ver}


def rule_remove(cur, scope: str, key: str, actor: str, note: str | None) -> dict:
    """Remove a rule for one use, so it follows its event type again. The event-type and default rules cannot be removed."""
    if (scope or "").upper() != "USE":
        raise Refused("Only a rule for a specific use can be removed; event types and the default always need one")
    if len((note or "").strip()) < 10:
        raise Refused("Give a reason of at least 10 characters. It is recorded against your name.")
    cur.execute("UPDATE mdm.response_rule SET active=false WHERE scope='USE' AND key=%s AND active RETURNING days, day_kind, version", (key,))
    old = cur.fetchone()
    if not old:
        raise Refused("There is no rule for that use", 404)
    audit.write(cur, actor, "RESPONSE_RULE_REMOVED", f"response_rule:USE/{key}", {"old": dict(old), "note": note})
    return {"scope": "USE", "key": key, "removed": True}


# ------------------------------------------------------------------ opening a notice
def _open(cur, source, ref_id, event_id, person_id, system, purpose, kind, statutory, event_type, now=None, quiet=False) -> dict | None:
    cur.execute("SELECT id, outcome, revision FROM mdm.dept_response WHERE source=%s AND ref_id=%s ORDER BY revision DESC LIMIT 1", (source, ref_id))
    last = cur.fetchone()
    if last and last["outcome"] != "REJECTED":
        return None                                                  # already open or answered: never a second notice for the same thing
    rev = (last["revision"] + 1) if last else 1
    now = _now(now)
    rule = rule_for(cur, event_type, purpose, kind)
    due = add_days(now, rule["days"], rule["day_kind"])
    cur.execute("INSERT INTO mdm.dept_response (source, ref_id, revision, event_id, person_id, system, purpose, kind, statutory, issued_at, respond_by, rule) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb) RETURNING id, feed_seq",
                (source, ref_id, rev, event_id, person_id, system, purpose, kind, statutory, now, due, _js(rule)))
    n = cur.fetchone()
    if not quiet:
        audit.write(cur, "system", "NOTICE_ISSUED", f"notice:{n['id']}",
                    {"department": system, "use": purpose, "source": source, "ref": ref_id, "revision": rev, "respond_by": due.isoformat(), "rule": rule})
    return n


def _event_type(cur, event_id):
    cur.execute("SELECT event_type FROM mdm.event WHERE id=%s", (event_id,))
    r = cur.fetchone()
    return r and r["event_type"]


def open_for_delivery(cur, did: int, quiet: bool = False) -> dict | None:
    """Called when a delivery has been handed over (or a withdrawal notice created): the department now has something to answer."""
    cur.execute("SELECT * FROM mdm.delivery WHERE id=%s", (did,))
    d = cur.fetchone()
    if not d or d["status"] != "DELIVERED" or not d["system"]:
        return None
    revocation = d["kind"] == "REVOCATION"
    statutory = revocation or not exchange.PURPOSES.get(d["purpose"], {}).get("consent", True)
    return _open(cur, "DELIVERY", did, d["event_id"], d["person_id"], d["system"], d["purpose"], d["kind"], statutory, _event_type(cur, d["event_id"]), quiet=quiet)


def open_for_proposal(cur, prop_id: int, quiet: bool = False) -> dict | None:
    """Called when a person approves a proposal addressed to a department."""
    cur.execute("SELECT * FROM mdm.proposal WHERE id=%s", (prop_id,))
    pr = cur.fetchone()
    if not pr or pr["status"] != "APPROVED" or pr["kind"] in INTERNAL_KINDS:
        return None
    system = PROPOSAL_DEPT.get(pr["system"])
    if not system:
        return None
    if pr["uc"] == "UC2" and pr["kind"] in exchange.GATED:          # the consent-based delivery already tells the department
        return None
    return _open(cur, "PROPOSAL", prop_id, pr["event_id"], pr["person_id"], system, pr["kind"], "EVENT", pr["uc"] == "UC3", _event_type(cur, pr["event_id"]), quiet=quiet)


def backfill(cur) -> dict:
    """Notices for deliveries and approvals made before the feed existed. They are issued now, so none starts out overdue."""
    nd = npr = 0
    cur.execute("SELECT d.id FROM mdm.delivery d WHERE d.status='DELIVERED' AND NOT EXISTS (SELECT 1 FROM mdm.dept_response r WHERE r.source='DELIVERY' AND r.ref_id=d.id) ORDER BY d.id")
    for r in cur.fetchall():
        nd += 1 if open_for_delivery(cur, r["id"], quiet=True) else 0
    cur.execute("SELECT p.id FROM mdm.proposal p WHERE p.status='APPROVED' AND NOT EXISTS (SELECT 1 FROM mdm.dept_response r WHERE r.source='PROPOSAL' AND r.ref_id=p.id) ORDER BY p.id")
    for r in cur.fetchall():
        npr += 1 if open_for_proposal(cur, r["id"], quiet=True) else 0
    if nd or npr:
        audit.write(cur, "system", "NOTICES_BACKFILLED", "feed", {"deliveries": nd, "proposals": npr, "note": "Made before the feed existed; issued now with the current rules"})
    return {"deliveries": nd, "proposals": npr}


# ------------------------------------------------------------------ channels
def channels(cur, system: str | None = None) -> list[dict]:
    cur.execute("SELECT system, channel, changed_by, changed_at, note FROM mdm.subscriber")
    have = {r["system"]: r for r in cur.fetchall()}
    out = []
    for k, name in exchange.SYSTEMS.items():
        if k in ("mdm", "crs", "marriage_register", "water"):
            continue
        if system and k != system:
            continue
        r = have.get(k)
        out.append({"system": k, "name": name, "channel": r["channel"] if r else "BOTH", "changed_by": r and r["changed_by"], "changed_at": r and r["changed_at"]})
    return out


def channel_of(cur, system: str) -> str:
    cur.execute("SELECT channel FROM mdm.subscriber WHERE system=%s", (system,))
    r = cur.fetchone()
    return r["channel"] if r else "BOTH"


def set_channel(cur, system: str, channel: str, actor: str, note: str | None) -> dict:
    channel = (channel or "").upper()
    if channel not in CHANNELS:
        raise Refused("Channel must be FEED, PORTAL or BOTH")
    if system not in exchange.SYSTEMS or system in ("mdm", "crs", "marriage_register"):
        raise Refused("Unknown department", 404)
    if len((note or "").strip()) < 10:
        raise Refused("Give a reason of at least 10 characters. It is recorded against your name.")
    old = channel_of(cur, system)
    cur.execute("INSERT INTO mdm.subscriber (system, channel, changed_by, note) VALUES (%s,%s,%s,%s) "
                "ON CONFLICT (system) DO UPDATE SET channel=EXCLUDED.channel, changed_by=EXCLUDED.changed_by, changed_at=now(), note=EXCLUDED.note",
                (system, channel, actor, note))
    audit.write(cur, actor, "DEPARTMENT_CHANNEL_CHANGED", f"department:{system}", {"old": old, "new": channel, "note": note})
    return {"system": system, "channel": channel}


# ------------------------------------------------------------------ the feed (what a department pulls)
def _data(cur, n: dict) -> dict:
    """Only what the use allows. Withdrawals carry no data; actions carry what the department needs to act."""
    if n["kind"] == "REVOCATION":
        return {"message": "Consent withdrawn. Stop using this data for this purpose."}
    if n["source"] == "PROPOSAL":
        cur.execute("SELECT summary, detail FROM mdm.proposal WHERE id=%s", (n["ref_id"],))
        p = cur.fetchone() or {}
        return {"action": n["purpose"], "summary": p.get("summary"), "detail": p.get("detail") or {}}
    if n["event_id"] is None and n["kind"] == "EVENT" and n["purpose"] in ("RENEW_CERTIFICATE", "SETTLE_SOURCE_CONFLICT", "REVIEW_DUPLICATE_BENEFIT", "REVIEW_CARD_MEMBER", "SETTLE_HOUSEHOLD_CONFLICT", "HOUSEHOLD_NOT_FOUND"):
        cur.execute("SELECT detail FROM mdm.delivery WHERE id=%s", (n["ref_id"],))      # UC4 and UC5: references and a message only, never a value
        d = (cur.fetchone() or {}).get("detail") or {}
        return {k: d[k] for k in ("message", "certificate_refs", "household_refs", "officer_reason") if d.get(k)}
    cur.execute("SELECT payload FROM mdm.event WHERE id=%s", (n["event_id"],))
    ev = cur.fetchone()
    pl = (ev or {}).get("payload") or {}
    out = {}
    for el in exchange.PURPOSES.get(n["purpose"], {}).get("elements", []):
        if el == "parents":
            par = {k: pl.get(k) for k in ("father_name", "mother_name") if pl.get(k)}
            if par:
                out["parents"] = par
        elif pl.get(el) is not None:
            out[el] = pl[el]
    return out


def _token(cur, person_id):
    if not person_id:
        return None
    cur.execute("SELECT source_rid FROM mdm.source_record WHERE person_id=%s AND source='identity_reference' ORDER BY id LIMIT 1", (person_id,))
    r = cur.fetchone()
    return r and r["source_rid"]


def state_of(n: dict, now=None) -> str:
    if n.get("outcome"):
        return n["outcome"]
    return "OVERDUE" if n["respond_by"] < _now(now) else "WAITING"


def _item(cur, n: dict) -> dict:
    return {"notice_id": n["id"], "cursor": n["feed_seq"], "revision": n["revision"], "kind": n["kind"],
            "use": n["purpose"], "use_name": exchange.PURPOSES.get(n["purpose"], {}).get("name") or USE_KEYS.get(n["purpose"]) or n["purpose"],
            "event_type": _event_type(cur, n["event_id"]), "event_ref": n["event_id"], "issued_at": n["issued_at"], "respond_by": n["respond_by"],
            "statutory": n["statutory"], "allowed_outcomes": allowed(n), "person_ref": _token(cur, n["person_id"]), "data": _data(cur, n),
            "state": state_of(n), "answered": n["outcome"] is not None}


def allowed(n: dict) -> list[str]:
    if n["statutory"]:
        return ["ACKNOWLEDGED", "APPLIED"]
    return ["ACCEPTED", "APPLIED", "REJECTED"]


def feed(cur, key: dict, after: int = 0, limit: int = 50, answered: bool = False) -> dict:
    """What one department sees: its own notices, oldest first, from a cursor. Unanswered ones stay in the feed until answered."""
    system = key["system"]
    if channel_of(cur, system) == "PORTAL":
        raise Refused("The feed is not enabled for this department; it uses the portal", 403)
    limit = max(1, min(int(limit or 50), 200))
    scopes = set(key.get("scopes") or [])
    cur.execute("SELECT * FROM mdm.dept_response WHERE system=%s AND feed_seq>%s AND (%s OR outcome IS NULL) ORDER BY feed_seq LIMIT %s", (system, int(after or 0), answered, limit * 3))
    rows = [n for n in cur.fetchall() if n["source"] == "PROPOSAL" or n["kind"] == "REVOCATION" or n["purpose"] in scopes][:limit]
    items = [_item(cur, n) for n in rows]
    if rows:
        cur.execute("UPDATE mdm.dept_response SET fetch_count=fetch_count+1, first_fetched_at=coalesce(first_fetched_at, now()), last_fetched_at=now() WHERE id = ANY(%s)", ([n["id"] for n in rows],))
        exchange.ledger(cur, "EVENT", system, f"partner:{key['key_id']}", None, None, None, "feed pulled", "ANSWERED",
                        {"notices": len(rows), "from_cursor": rows[0]["feed_seq"], "to_cursor": rows[-1]["feed_seq"]})
    return {"department": exchange.SYSTEMS.get(system, system), "items": items, "next_cursor": rows[-1]["feed_seq"] if rows else int(after or 0),
            "count": len(items), "more": len(rows) == limit}


# ------------------------------------------------------------------ the department's answer
def respond(cur, notice_id: int, outcome: str, reason: str | None, department_ref: str | None, route: str, actor: str, system: str | None = None, batch_ref: str | None = None) -> dict:
    """The one place an answer is recorded, whichever route it came by."""
    outcome = (outcome or "").upper()
    cur.execute("SELECT * FROM mdm.dept_response WHERE id=%s FOR UPDATE", (notice_id,))
    n = cur.fetchone()
    if not n or (system and n["system"] != system):
        raise Refused("Notice not found", 404)                     # another department's notice is never revealed
    if route != "SIMULATED":
        ch, via = channel_of(cur, n["system"]), ("FEED" if route == "FILE" else route)      # a file upload is a feed answer
        if ch != "BOTH" and ch != via:
            raise Refused(f"This department answers by {ch.lower()}; the {route.lower()} route is not enabled for it", 403)
    if outcome not in OUTCOMES:
        raise Refused("Outcome must be ACCEPTED, APPLIED, REJECTED or ACKNOWLEDGED")
    if outcome not in allowed(n):
        raise Refused("A statutory notice can only be acknowledged or applied, not rejected" if n["statutory"] else "Only a statutory notice is acknowledged; answer ACCEPTED, APPLIED or REJECTED")
    reason, ref = (reason or "").strip() or None, (department_ref or "").strip() or None
    if outcome == "REJECTED" and len(reason or "") < 5:
        raise Refused("A rejection needs a reason")
    if outcome == "APPLIED" and not ref:
        raise Refused("An applied notice needs the department's own reference")
    if n["outcome"]:
        if n["outcome"] == outcome and (n["department_ref"], n["reason"]) == (ref, reason):
            return {**_brief(n), "repeat": True}                   # the same answer again: nothing changes, nothing is written
        if not (n["outcome"] in ("ACCEPTED", "ACKNOWLEDGED") and outcome == "APPLIED"):
            raise Refused(f"This notice was already answered ({n['outcome'].lower()}) and cannot be changed", 409)
    cur.execute("UPDATE mdm.dept_response SET outcome=%s, reason=%s, department_ref=%s, route=%s, actor=%s, responded_at=now(), batch_ref=%s WHERE id=%s",
                (outcome, reason, ref, route, actor, batch_ref, notice_id))
    reopened = None
    if outcome == "REJECTED":
        reopened = _reopen(cur, n, reason, actor)
        cur.execute("UPDATE mdm.dept_response SET reopened_proposal=%s WHERE id=%s", (reopened, notice_id))
    if outcome == "APPLIED":
        _simulate_pds_load(cur, n, actor)
    exchange.ledger(cur, "EVENT", n["system"], actor, n["purpose"], n["person_id"], None, f"department response: {outcome.lower()}", "ANSWERED",
                    {"notice": notice_id, "outcome": outcome, "route": route, "department_ref": ref})
    audit.write(cur, actor, "DEPARTMENT_RESPONSE", f"notice:{notice_id}",
                {"department": n["system"], "use": n["purpose"], "outcome": outcome, "route": route, "reason": reason, "department_ref": ref,
                 "reopened_proposal": reopened, "batch": batch_ref, "within_time": datetime.now(timezone.utc) <= n["respond_by"]})
    cur.execute("SELECT * FROM mdm.dept_response WHERE id=%s", (notice_id,))
    return {**_brief(cur.fetchone()), "reopened_proposal": reopened}


def _simulate_pds_load(cur, n: dict, actor: str):
    """Demonstration only (SIMULATE_DEPT_LOAD, on by default in this proof of concept; set it to 'false' to turn it off).
    When the ration card department says it has ADDED a child, its next data load would bring the child's record on the family's card. The
    demo writes that one synthetic record at once, so the portals show the child "on the ration card" only after the department applied it."""
    if os.environ.get("SIMULATE_DEPT_LOAD", "true").lower() == "false" or n["system"] != "pds" or n["purpose"] != "BIRTH_PDS" or not n["person_id"]:
        return
    child = n["person_id"]
    cur.execute("SELECT 1 FROM mdm.source_record WHERE person_id=%s AND source='pds_view'", (child,))
    if cur.fetchone():
        return
    cur.execute("""SELECT r.ration_card FROM mdm.relationship rel JOIN mdm.source_record r ON r.person_id=rel.person_a AND r.source='pds_view' AND r.ration_card IS NOT NULL
                   WHERE rel.kind='PARENT_OF' AND rel.person_b=%s ORDER BY r.id LIMIT 1""", (child,))
    card = cur.fetchone()
    if not card:
        return                                                      # no parent on a card: nothing to add the child to
    cur.execute("SELECT name FROM mdm.person WHERE id=%s", (child,))
    name = (cur.fetchone() or {}).get("name")
    cur.execute("""INSERT INTO mdm.source_record (person_id, source, source_rid, rtype, name, link_status, score, as_of, ration_card, payload)
                   VALUES (%s,'pds_view',%s,'RATION',%s,'AUTO_LINKED',0.95,CURRENT_DATE,%s,%s::jsonb)""",
                (child, f"PDS-{900000000 + n['id']}", name, card["ration_card"],
                 json.dumps({"member_status": "ACTIVE", "simulated_load": True, "note": "synthetic: the department's next data load after it applied the notice"})))
    store.rebuild_person(cur, child)
    audit.write(cur, actor, "DEMO_DEPT_LOAD", f"person:{child}", {"department": "pds", "notice": n["id"], "note": "synthetic ration card record written after APPLIED"})


# ------------------------------------------------------------------ answering many at once
OUTCOME_WORDS = {"ACCEPT": "ACCEPTED", "ACCEPTED": "ACCEPTED", "APPLY": "APPLIED", "APPLIED": "APPLIED", "REJECT": "REJECTED", "REJECTED": "REJECTED",
                 "ACKNOWLEDGE": "ACKNOWLEDGED", "ACKNOWLEDGED": "ACKNOWLEDGED", "ACK": "ACKNOWLEDGED"}


def respond_batch(cur, answers: list[dict], route: str, actor: str, system: str | None = None, shared_reason: str | None = None,
                  check_only: bool = False, source: str | None = None) -> dict:
    """Many answers in one go. Each is judged on its own by the same rules as a single answer; the good ones are recorded and the rest
    are reported with the reason, so one bad line never blocks the others. check_only judges every line and records nothing."""
    if not isinstance(answers, list) or not answers:
        raise Refused("There are no answers to record")
    if len(answers) > MAX_BATCH:
        raise Refused(f"A batch holds at most {MAX_BATCH} answers; this one has {len(answers)}")
    shared = (shared_reason or "").strip() or None
    batch = f"BATCH-{uuid.uuid4().hex[:8].upper()}"
    results, counts = [], {"recorded": 0, "unchanged": 0, "refused": 0, "skipped": 0}
    seen = set()
    for i, a in enumerate(answers, 1):
        row = {"line": a.get("line") or i, "notice_id": a.get("notice_id")}
        try:
            nid = int(str(a.get("notice_id")).strip())
        except (TypeError, ValueError):
            row.update(result="REFUSED", message="The notice number is missing or not a number")
            counts["refused"] += 1
            results.append(row)
            continue
        row["notice_id"] = nid
        word = (a.get("outcome") or "").strip().upper()
        if not word:
            row.update(result="SKIPPED", message="No outcome given, so nothing was recorded")
            counts["skipped"] += 1
            results.append(row)
            continue
        if nid in seen:
            row.update(result="REFUSED", message="This notice appears twice in the file; only its first line was used")
            counts["refused"] += 1
            results.append(row)
            continue
        seen.add(nid)
        outcome = OUTCOME_WORDS.get(word, word)
        reason = (a.get("reason") or "").strip() or (shared if outcome == "REJECTED" else None)
        cur.execute("SAVEPOINT batch_item")
        try:
            r = respond(cur, nid, outcome, reason, a.get("department_ref"), route, actor, system, None if check_only else batch)
            if check_only or r.get("repeat"):
                cur.execute("ROLLBACK TO SAVEPOINT batch_item")
            cur.execute("RELEASE SAVEPOINT batch_item")
            if r.get("repeat"):
                row.update(result="UNCHANGED", outcome=outcome, message="Already recorded with this answer; nothing changed")
                counts["unchanged"] += 1
            else:
                row.update(result="WOULD_RECORD" if check_only else "RECORDED", outcome=outcome, reopened_proposal=r.get("reopened_proposal"),
                           message="Would be recorded" if check_only else ("Recorded; it went back to a person for review" if r.get("reopened_proposal") else "Recorded"))
                counts["recorded"] += 1
        except Refused as e:
            cur.execute("ROLLBACK TO SAVEPOINT batch_item")
            cur.execute("RELEASE SAVEPOINT batch_item")
            row.update(result="REFUSED", message=str(e))
            counts["refused"] += 1
        results.append(row)
    counts["total"] = len(results)
    if not check_only and (counts["recorded"] or counts["refused"]):
        audit.write(cur, actor, "DEPARTMENT_BATCH", f"batch:{batch}", {"department": system, "route": route, "source": source, **counts, "shared_reason": bool(shared)})
    return {"batch_ref": batch if not check_only else None, "check_only": check_only, "route": route, "counts": counts, "results": results}


CSV_ANSWER_COLUMNS = ("outcome", "reason", "department_ref")


def parse_answers_csv(text: str) -> list[dict]:
    """A department's answer file: one line per notice, with columns notice_id, outcome, reason, department_ref (extra columns are ignored,
    so the file downloaded from the feed can be filled in and sent back)."""
    text = (text or "").lstrip("\ufeff")
    if len(text) > 2_000_000:
        raise Refused("The file is too large (2 MB at most)")
    rows = list(csv.reader(io.StringIO(text)))
    rows = [r for r in rows if any(c.strip() for c in r)]
    if not rows:
        raise Refused("The file is empty")
    head = [h.strip().lower().replace(" ", "_") for h in rows[0]]
    if "notice_id" not in head or "outcome" not in head:
        raise Refused("The first line must name the columns, and must include notice_id and outcome")
    ix = {c: head.index(c) for c in ("notice_id", "outcome", "reason", "department_ref") if c in head}
    out = []
    for n, r in enumerate(rows[1:], 2):
        get = lambda c: r[ix[c]].strip() if c in ix and ix[c] < len(r) else ""
        out.append({"line": n, "notice_id": get("notice_id"), "outcome": get("outcome"), "reason": get("reason"), "department_ref": get("department_ref")})
    if not out:
        raise Refused("The file has a header line but no answers")
    return out


def export_csv(cur, key: dict | None = None, system: str | None = None, answered: bool = False, scopes: set | None = None) -> str:
    """The department's notices as a file it can fill in: what to answer, by when, what it may answer, and empty answer columns."""
    system = system or (key or {})["system"]
    if key and channel_of(cur, system) == "PORTAL":
        raise Refused("The feed is not enabled for this department; it uses the portal", 403)
    scopes = scopes if scopes is not None else set((key or {}).get("scopes") or [])
    cur.execute("SELECT * FROM mdm.dept_response WHERE system=%s AND (%s OR outcome IS NULL) ORDER BY feed_seq LIMIT 5000", (system, answered))
    rows = [n for n in cur.fetchall() if n["source"] == "PROPOSAL" or n["kind"] == "REVOCATION" or (n["purpose"] in scopes if key else True)]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["notice_id", "citizen_ref", "event", "what_to_do", "statutory", "respond_by", "allowed_outcomes", "data", "outcome", "reason", "department_ref"])
    for n in rows:
        it = _item(cur, n)
        data = "; ".join(f"{k}: {json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v}" for k, v in (it["data"] or {}).items() if k != "detail")
        w.writerow([n["id"], it["person_ref"] or "", it["event_type"] or "", it["use_name"], "yes" if n["statutory"] else "no", it["respond_by"].isoformat() if it["respond_by"] else "",
                    " / ".join(it["allowed_outcomes"]), data, n["outcome"] or "", n["reason"] or "", n["department_ref"] or ""])
    return buf.getvalue()


def answer_all_waiting(cur, system: str, outcome: str, reason: str | None, department_ref_prefix: str | None, actor: str, check_only: bool = False,
                       route: str = "FILE", only_kind: str | None = None) -> dict:
    """Answer every notice a department still has waiting with one outcome (the simulator's 'answer all')."""
    if system not in exchange.SYSTEMS:
        raise Refused("Unknown department", 404)
    cur.execute("SELECT id, statutory, kind FROM mdm.dept_response WHERE system=%s AND outcome IS NULL ORDER BY feed_seq LIMIT %s", (system, MAX_BATCH))
    rows = cur.fetchall()
    if not rows:
        raise Refused("This department has nothing waiting")
    items = [{"notice_id": r["id"], "outcome": outcome,
              "department_ref": f"SIM-{system.upper()}-{r['id']}" if (outcome or "").upper() == "APPLIED" else None} for r in rows]
    return respond_batch(cur, items, route, actor, system, shared_reason=reason, check_only=check_only, source="answer all waiting")


def results_csv(res: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["line", "notice_id", "result", "outcome", "message"])
    for r in res["results"]:
        w.writerow([r.get("line"), r.get("notice_id"), r.get("result"), r.get("outcome") or "", r.get("message") or ""])
    return buf.getvalue()


def _brief(n: dict) -> dict:
    return {"notice_id": n["id"], "outcome": n["outcome"], "route": n["route"], "department_ref": n["department_ref"], "reason": n["reason"],
            "responded_at": n["responded_at"], "reopened_proposal": n.get("reopened_proposal"), "batch_ref": n.get("batch_ref")}


def _reopen(cur, n: dict, reason: str, actor: str) -> int | None:
    """A department's rejection always goes back to a person. The decision it overturns stays on record beside its reason."""
    name = exchange.SYSTEMS.get(n["system"], n["system"])
    ret = {"notice": n["id"], "department": name, "reason": reason, "at": datetime.now(timezone.utc).isoformat(), "by": actor}
    if n["source"] == "PROPOSAL":
        cur.execute("SELECT status, decided_by, note FROM mdm.proposal WHERE id=%s FOR UPDATE", (n["ref_id"],))
        pr = cur.fetchone()
        if not pr:
            return None
        ret["overturned"] = {"decided_by": pr["decided_by"], "note": pr["note"]}
        cur.execute("UPDATE mdm.proposal SET status='PROPOSED', decided_by=NULL, decided_at=NULL, dept_return=%s::jsonb WHERE id=%s", (_js(ret), n["ref_id"]))
        return n["ref_id"]
    cur.execute("INSERT INTO mdm.proposal (event_id, uc, kind, system, person_id, summary, detail, dept_return) VALUES (%s,%s,'REVIEW_DEPARTMENT_REJECTION','MDM steward',%s,%s,%s::jsonb,%s::jsonb) RETURNING id",
                (n["event_id"], exchange.PURPOSES.get(n["purpose"], {}).get("uc"), n["person_id"],
                 f"{name} rejected the notice: {exchange.PURPOSES.get(n['purpose'], {}).get('name', n['purpose'])}",
                 _js({"notice": n["id"], "department": name, "reason": reason, "delivery": n["ref_id"]}), _js(ret)))
    return cur.fetchone()["id"]


def simulate(cur, notice_id: int, outcome: str, reason: str | None, department_ref: str | None, actor: str) -> dict:
    """A demo stand-in for a department that is not connected. Same rules, same audit; the route says SIMULATED."""
    cur.execute("SELECT system FROM mdm.dept_response WHERE id=%s", (notice_id,))
    n = cur.fetchone()
    if not n:
        raise Refused("Notice not found", 404)
    if (outcome or "").upper() == "APPLIED" and not department_ref:
        department_ref = f"SIM-{n['system'].upper()}-{notice_id}"
    return respond(cur, notice_id, outcome, reason, department_ref, "SIMULATED", f"{actor} (simulating {exchange.SYSTEMS.get(n['system'], n['system'])})")


# ------------------------------------------------------------------ lists for the officer screens
def notice_row(cur, n: dict, now=None) -> dict:
    n = dict(n)
    n["state"] = state_of(n, now)
    n["system_name"] = exchange.SYSTEMS.get(n["system"], n["system"])
    n["use_name"] = exchange.PURPOSES.get(n["purpose"], {}).get("name") or USE_KEYS.get(n["purpose"]) or n["purpose"]
    n["allowed_outcomes"] = allowed(n)
    n["rule_text"] = f"{n['rule'].get('days')} {'working' if n['rule'].get('day_kind') == 'WORKING' else 'calendar'} days"
    return n


def proposal_info(cur, pr: dict) -> dict:
    """Which department acts on an approved proposal, how long it has, and what it has answered so far (for the approval card)."""
    system = PROPOSAL_DEPT.get(pr["system"])
    if not system or pr["kind"] in INTERNAL_KINDS:
        return {"department": None}
    if pr.get("uc") == "UC2" and pr["kind"] in exchange.GATED:
        # the department is told through the parent's consent, so its answer is on that notice, not on one for this proposal
        cur.execute("SELECT * FROM mdm.dept_response WHERE source='DELIVERY' AND event_id=%s AND purpose=%s AND system=%s ORDER BY revision DESC LIMIT 1",
                    (pr["event_id"], exchange.GATED[pr["kind"]], system))
        n = cur.fetchone()
        if not n:
            return {"department": None}
        return {"department": None, "consent_notice": {"id": n["id"], "department": exchange.SYSTEMS.get(system, system), "state": state_of(n), "outcome": n["outcome"],
                                                       "reason": n["reason"], "department_ref": n["department_ref"], "revision": n["revision"]}}
    rule = rule_for(cur, _event_type(cur, pr["event_id"]), pr["kind"])
    out = {"department": exchange.SYSTEMS.get(system, system), "department_key": system, "statutory": pr.get("uc") == "UC3", "channel": channel_of(cur, system),
           "respond_within": f"{rule['days']} {'working' if rule['day_kind'] == 'WORKING' else 'calendar'} day{'s' if rule['days'] != 1 else ''}"}
    cur.execute("SELECT * FROM mdm.dept_response WHERE source='PROPOSAL' AND ref_id=%s ORDER BY revision DESC LIMIT 1", (pr["id"],))
    n = cur.fetchone()
    if n:
        out["notice"] = {"id": n["id"], "state": state_of(n), "outcome": n["outcome"], "respond_by": n["respond_by"], "route": n["route"], "department_ref": n["department_ref"], "reason": n["reason"]}
    return out


def notices_for_event(cur, event_id: int) -> list[dict]:
    cur.execute("SELECT * FROM mdm.dept_response WHERE event_id=%s ORDER BY feed_seq", (event_id,))
    return [notice_row(cur, n) for n in cur.fetchall()]


NOTICE_SORT = {"citizen": "lower(pe.name)", "department": "r.system", "use": "r.purpose", "due": "r.respond_by", "issued": "r.issued_at",
               "state": "coalesce(r.outcome, CASE WHEN r.respond_by < now() THEN 'OVERDUE' ELSE 'WAITING' END)", "event": "e.event_type"}


def list_notices(cur, system=None, state=None, q=None, limit=25, offset=0, sort=None, direction=None) -> dict:
    where, p = ["true"], []
    if system:
        where.append("r.system=%s")
        p.append(system)
    if q:
        where.append("(coalesce(pe.name,'') ILIKE %s OR r.purpose ILIKE %s OR coalesce(r.department_ref,'') ILIKE %s)")
        p += [f"%{q}%"] * 3
    stc = {"WAITING": "r.outcome IS NULL AND r.respond_by >= now()", "OVERDUE": "r.outcome IS NULL AND r.respond_by < now()"}
    if state:
        where.append(stc.get(state.upper()) or "r.outcome = %s")
        if state.upper() not in stc:
            p.append(state.upper())
    w = " AND ".join(where)
    cur.execute(f"SELECT count(*) AS n FROM mdm.dept_response r LEFT JOIN mdm.person pe ON pe.id=r.person_id WHERE {w}", p)
    total = cur.fetchone()["n"]
    cur.execute(f"SELECT r.*, pe.name AS person_name, e.event_type FROM mdm.dept_response r LEFT JOIN mdm.person pe ON pe.id=r.person_id LEFT JOIN mdm.event e ON e.id=r.event_id "
                f"WHERE {w} ORDER BY {order_by(NOTICE_SORT, sort, direction, 'r.respond_by, r.id', 'r.id')} LIMIT %s OFFSET %s", p + [limit, offset])
    items = [notice_row(cur, r) | {"person_name": r["person_name"], "event_type": r["event_type"]} for r in cur.fetchall()]
    cur.execute("SELECT count(*) FILTER (WHERE outcome IS NULL AND respond_by >= now()) AS waiting, count(*) FILTER (WHERE outcome IS NULL AND respond_by < now()) AS overdue, "
                "count(*) FILTER (WHERE outcome IN ('ACCEPTED','APPLIED','ACKNOWLEDGED')) AS answered, count(*) FILTER (WHERE outcome='REJECTED') AS rejected, count(*) AS total "
                "FROM mdm.dept_response" + (" WHERE system=%s" if system else ""), [system] if system else [])
    return {"total": total, "items": items, "counts": cur.fetchone(), "limit": limit, "offset": offset}
