"""UC5 household and housing assistance.

What this module does, and what it never does:
- It works out the household of an applicant itself (ration card, spouse, same-household and minor-child links), so that
  a family cannot collect several benefits because each member asks on their own.
- It judges household income on every member's valid certificate, taking the highest band.
- When a housing check shows a duplicate, a dead person still active on the ration card, a household the sources disagree
  about, or no household at all, it raises ONE open item per household and kind for a person. The automatic answer to the
  Housing department already stands: nothing waits for the person.
- It never edits a record, never chooses between two values and never enrols anybody.
- Nothing returned to an officer or a department carries a household member's income, category or personal value:
  only counts, references and states.
"""
from __future__ import annotations
import json
from datetime import timedelta

from . import audit, exchange, feed, notify, store
from .stewardship import Refused
from .survivorship import REF_DATE

PURPOSE = "HOUSEHOLD_BENEFIT"
UC5_KINDS = ("REVIEW_DUPLICATE_BENEFIT", "REVIEW_CARD_MEMBER", "SETTLE_HOUSEHOLD_CONFLICT", "HOUSEHOLD_NOT_FOUND")
OWNER = {"REVIEW_DUPLICATE_BENEFIT": "Housing", "SETTLE_HOUSEHOLD_CONFLICT": "Housing", "HOUSEHOLD_NOT_FOUND": "Housing",
         "REVIEW_CARD_MEMBER": "Civil supplies"}
DELIVER_TO = {"REVIEW_DUPLICATE_BENEFIT": "housing", "SETTLE_HOUSEHOLD_CONFLICT": "housing", "HOUSEHOLD_NOT_FOUND": "housing",
              "REVIEW_CARD_MEMBER": "pds"}
REASON_OF = {"REVIEW_DUPLICATE_BENEFIT": "DUPLICATE_BENEFIT", "REVIEW_CARD_MEMBER": "CARD_DEAD_ACTIVE",
             "SETTLE_HOUSEHOLD_CONFLICT": "HOUSEHOLD_CONFLICT", "HOUSEHOLD_NOT_FOUND": "NO_HOUSEHOLD"}
AWARDED = frozenset({"COMPLETED", "SANCTIONED", "DISBURSED", "APPROVED", "ALLOTTED", "IN_PROGRESS"})   # a benefit has been given or promised
HOUSEHOLD_CAP = 30

NOT_FOUND_TITLE = "మీ కుటుంబ వివరాలు కనబడలేదు / We could not find your household"
NOT_FOUND_BODY = ("గృహ సహాయం కోసం మీ కుటుంబ రికార్డు కనబడలేదు. దయచేసి పౌర సరఫరాల కార్యాలయాన్ని సంప్రదించండి. / "
                  "We could not find a household record for your housing application. Please contact the Civil supplies office.")


def _js(x) -> str:
    return json.dumps(x, default=str, ensure_ascii=False)


# ------------------------------------------------------------------ the household, worked out by the system
def household_members(cur, pid: int, recs: list[dict] | None = None) -> tuple[list[int], list[str]]:
    """The people who count as one household with this person, and the ration cards behind them.

    Ration card sharers, the spouse, SAME_HOUSEHOLD links and the minor children of any of them. One hop each, so a big shared
    card cannot pull in a whole village. A ration card is still only a proxy for a household."""
    adult = int(exchange.current(cur).get("adult_age") or 18)
    seen = {pid}
    cur.execute("""SELECT person_a, person_b, kind FROM mdm.relationship
                   WHERE kind IN ('SPOUSE','SAME_HOUSEHOLD','PARENT_OF') AND (person_a=%s OR person_b=%s)""", (pid, pid))
    for r in cur.fetchall():
        other = r["person_b"] if r["person_a"] == pid else r["person_a"]
        if r["kind"] == "PARENT_OF":
            age = exchange.person_age(cur, other)
            if age is None or age >= adult:
                continue                        # a parent or an adult child lives in their own household
        seen.add(other)
    seen = set(sorted(seen)[:HOUSEHOLD_CAP]) | {pid}
    allrecs = store.records_of(cur, sorted(seen))
    cards = sorted({r["ration_card"] for rs in allrecs.values() for r in rs if r["source"] == "pds_view" and r["ration_card"]})
    if cards:
        cur.execute("SELECT DISTINCT person_id FROM mdm.source_record WHERE source='pds_view' AND ration_card = ANY(%s) AND person_id IS NOT NULL", (cards,))
        seen |= {r["person_id"] for r in cur.fetchall()}
    ids = sorted(seen)
    if len(ids) > HOUSEHOLD_CAP:
        ids = sorted({pid, *[i for i in ids if i != pid][:HOUSEHOLD_CAP - 1]})
    return ids, cards


def household_applications(cur, ids: list[int]) -> list[dict]:
    cur.execute("SELECT id, person_id, source_rid, payload FROM mdm.source_record WHERE source='housing' AND person_id = ANY(%s) ORDER BY id", (ids,))
    return cur.fetchall()


def awarded(apps: list[dict]) -> list[dict]:
    return [a for a in apps if str((a["payload"] or {}).get("status") or "").upper() in AWARDED]


# ------------------------------------------------------------------ household income, judged for the family as a whole
def evaluate_household_income(cur, pid: int, params: dict, pol: dict) -> tuple[str, dict]:
    """YES or NO to 'household income is at most the limit', from every member's valid income certificate, highest band wins.
    A member whose own valid certificates disagree makes the whole answer a CONFLICT. Which member holds which figure is never said."""
    try:
        limit = float(params.get("limit"))
    except (TypeError, ValueError):
        raise Refused("Give the income limit as a number, for example 200000")
    ids, cards = household_members(cur, pid)
    allrecs = store.records_of(cur, ids)
    edges = pol["income_band_edges"]
    highest, counted, expired_only, conflict = None, 0, 0, False
    for m in ids:
        valid, expired = exchange._certs(allrecs.get(m, []), "INCOME")
        amounts = [float(p["annual_income"]) for p in valid if p.get("annual_income") not in (None, "")]
        if amounts:
            bands = {exchange._band(edges, a) for a in amounts}
            yes = {a <= limit for a in amounts}
            if len(bands) > 1 or len(yes) > 1:
                conflict = True
            counted += 1
            top = max(amounts)
            highest = top if highest is None else max(highest, top)
        elif expired:
            expired_only += 1
    if conflict:
        return "CONFLICT", {"message": "A household member's valid income certificates disagree. No answer is chosen; an officer should settle it with the issuing office.",
                            "household_members": len(ids)}
    if highest is None:
        if expired_only:
            return "EXPIRED_SOURCE", {"message": "The household's income certificates have expired. Route the applicant to the issuing revenue service to renew them.", "source": "Revenue"}
        return "NO_RECORD", {"message": "No income certificate is held for anyone in this household. That is not the same as a low or negative answer."}
    out = {"answer": "YES" if highest <= limit else "NO", "band": exchange._band_label(edges, exchange._band(edges, highest)),
           "basis": "The highest income band among the valid certificates of the household's members",
           "household_members": len(ids), "certificates_counted": counted, "source": "Revenue"}
    if expired_only:
        out["incomplete"] = True
        out["message"] = f"{expired_only} household member(s) have only an expired certificate, which was not counted. Treat this answer as incomplete."
    return "ANSWERED", out


# ------------------------------------------------------------------ non-answers become work for a person
def _open_for_household(cur, ids: list[int], kind: str) -> dict | None:
    cur.execute("SELECT id, person_id FROM mdm.proposal WHERE person_id = ANY(%s) AND kind=%s AND status='PROPOSED' ORDER BY id LIMIT 1", (ids, kind))
    return cur.fetchone()


def raise_item(cur, pid: int, ids: list[int], kind: str, summary: str, detail: dict, actor: str) -> dict:
    """One open proposal per household and kind. A second call for the same household returns the open one."""
    ex = _open_for_household(cur, ids, kind)
    if ex:
        return {"id": ex["id"], "kind": kind, "existing": True}
    from . import events
    prop = events._propose(cur, None, "UC5", kind, OWNER[kind], pid, summary, {**detail, "purpose": PURPOSE, "household_size": len(ids)})
    audit.write(cur, actor, "UC5_ITEM_RAISED", f"proposal:{prop}", {"kind": kind, "person": pid, "household_size": len(ids)})
    return {"id": prop, "kind": kind, "existing": False}


def close_item(cur, ids: list[int], kind: str, actor: str) -> int:
    cur.execute("SELECT id FROM mdm.proposal WHERE person_id = ANY(%s) AND kind=%s AND status='PROPOSED' FOR UPDATE", (ids, kind))
    rows = cur.fetchall()
    for r in rows:
        cur.execute("UPDATE mdm.proposal SET status='WITHDRAWN', note=%s, decided_by=%s, decided_at=now() WHERE id=%s AND status='PROPOSED'",
                    ("Closed: a later housing check no longer shows this, so nothing more is needed", actor, r["id"]))
        audit.write(cur, actor, "UC5_ITEM_CLOSED", f"proposal:{r['id']}", {"kind": kind})
    return len(rows)


def _name(cur, pid: int) -> str:
    cur.execute("SELECT name FROM mdm.person WHERE id=%s", (pid,))
    r = cur.fetchone()
    return (r and r["name"]) or "this person"


def follow_up(cur, pid: int, outcome: str, question: str, ans: dict | None, actor: str) -> list[dict]:
    """After a housing check was answered: raise or close the household items. The answer already returned is not changed."""
    if outcome != "ANSWERED":
        return []
    ans = ans or {}
    ids, cards = household_members(cur, pid)
    apps = household_applications(cur, ids)
    name = _name(cur, pid)
    raised: list[dict] = []

    # A. a duplicate: only the questions about applications can say so
    if question in ("DUPLICATE_BENEFIT", "HOUSEHOLD_HAS_BENEFIT"):
        dup = ans.get("answer") in ("POSSIBLE_DUPLICATE", "ALREADY_RECEIVING") or bool(ans.get("already_received"))
        if dup:
            raised.append(raise_item(cur, pid, ids, "REVIEW_DUPLICATE_BENEFIT",
                                     f"The household of {name} already has housing assistance or another application: check before any benefit is granted",
                                     {"application_refs": [a["source_rid"] for a in apps][:8], "ration_cards": cards[:5]}, actor))
        else:
            close_item(cur, ids, "REVIEW_DUPLICATE_BENEFIT", actor)

    # B. a dead person still active on the household's ration card
    cur.execute("""SELECT 1 FROM mdm.dq_issue WHERE person_id = ANY(%s) AND code='DEAD_ACTIVE_ON_RATION_CARD'
                   AND status IN ('OPEN','CORRECTION_REQUESTED') LIMIT 1""", (ids,))
    if cur.fetchone():
        raised.append(raise_item(cur, pid, ids, "REVIEW_CARD_MEMBER",
                                 f"A person recorded as deceased is still active on the ration card of the household of {name}",
                                 {"ration_cards": cards[:5]}, actor))
    else:
        close_item(cur, ids, "REVIEW_CARD_MEMBER", actor)

    # C. the housing record names a household reference that is not the applicant's ration card
    mine = [a for a in apps if a["person_id"] == pid]
    refs = {str((a["payload"] or {}).get("household_ref") or "").strip().upper() for a in mine} - {""}
    own_cards = {c.upper() for c in cards}
    if refs and own_cards and not (refs & own_cards):
        raised.append(raise_item(cur, pid, ids, "SETTLE_HOUSEHOLD_CONFLICT",
                                 f"The ration card and the housing record disagree on the household of {name}: ask the departments to re-check",
                                 {"application_refs": [a["source_rid"] for a in mine][:5], "ration_cards": cards[:5]}, actor))
    else:
        close_item(cur, ids, "SETTLE_HOUSEHOLD_CONFLICT", actor)

    # D. no household on record at all: no ration card and nobody linked
    if not cards and len(ids) == 1:
        raised.append(raise_item(cur, pid, ids, "HOUSEHOLD_NOT_FOUND",
                                 f"No household is on record for {name}: tell the applicant and route the application", {}, actor))
    else:
        close_item(cur, ids, "HOUSEHOLD_NOT_FOUND", actor)
    return raised


# ------------------------------------------------------------------ approving them: one delivery, never an edit
def _delivery(cur, pr: dict, purpose: str, message: str, extra: dict, actor: str) -> int:
    d = pr.get("detail") or {}
    detail = {"proposal": pr["id"], "person_id": pr["person_id"], "household_refs": (d.get("application_refs") or []) + (d.get("ration_cards") or []),
              "message": message, **extra}
    system = DELIVER_TO[pr["kind"]]
    cur.execute("INSERT INTO mdm.delivery (event_id, consent_id, person_id, purpose, system, kind, status, attempts, detail) "
                "VALUES (NULL,NULL,%s,%s,%s,'EVENT','DELIVERED',1,%s::jsonb) RETURNING id", (pr["person_id"], purpose, system, _js(detail)))
    did = cur.fetchone()["id"]
    exchange.ledger(cur, "EVENT", "mdm", actor, purpose, pr["person_id"], None, "household follow-up delivered", "ANSWERED",
                    {"system": system, "proposal": pr["id"], "attempt": 1})
    feed.open_for_delivery(cur, did)
    return did


def on_approve(cur, pr: dict, actor: str, note: str | None) -> dict:
    kind = pr["kind"]
    if kind == "REVIEW_DUPLICATE_BENEFIT":
        did = _delivery(cur, pr, kind, "Another application or an earlier benefit exists for this household. Please review before any benefit is granted. Nothing was decided or changed here.",
                        {"officer_reason": (note or "").strip()}, actor)
        out = {"delivery_id": did}
    elif kind == "SETTLE_HOUSEHOLD_CONFLICT":
        did = _delivery(cur, pr, kind, "The ration card and the housing record disagree about this household. Please re-check them. No value was chosen here.",
                        {"officer_reason": (note or "").strip()}, actor)
        out = {"delivery_id": did}
    elif kind == "REVIEW_CARD_MEMBER":
        did = _delivery(cur, pr, kind, "A person recorded as deceased is still active on this ration card. Please review the card. Nothing was changed here.",
                        {"officer_reason": (note or "").strip()}, actor)
        out = {"delivery_id": did}
    elif kind == "HOUSEHOLD_NOT_FOUND":
        sent = notify.send(cur, pr["person_id"], NOT_FOUND_TITLE, NOT_FOUND_BODY, f"proposal-{pr['id']}")
        did = _delivery(cur, pr, kind, "The applicant has no household on record, and has been told to contact the Civil supplies office. Nothing was changed here.", {}, actor)
        out = {"citizen_notified": bool(sent), "delivery_id": did}
    else:
        raise Refused("Not a household item")
    audit.write(cur, actor, "UC5_APPROVED", f"proposal:{pr['id']}", {"kind": kind, "person": pr["person_id"], **{k: v for k, v in out.items() if k != "citizen_notified"}})
    return out


# ------------------------------------------------------------------ what the officer sees
OUTCOME_KEY = {"ANSWERED": "answered", "DENIED_NO_CONSENT": "no_consent", "DENIED_POLICY": "denied_policy",
               "EXPIRED_SOURCE": "expired", "CONFLICT": "conflict", "NO_RECORD": "no_record"}


def housing_outcomes(cur, days: int = 7) -> dict:
    """Counts of housing checks by outcome, from the ledger, and the open items by reason. Counts only."""
    days = max(1, min(int(days or 7), 90))
    cur.execute("""SELECT outcome, count(*) AS n FROM mdm.exchange
                   WHERE kind='VERIFY' AND purpose=%s AND ts > now() - make_interval(days => %s) GROUP BY 1""", (PURPOSE, days))
    raw = {r["outcome"]: r["n"] for r in cur.fetchall()}
    by = {k: raw.get(o, 0) for o, k in OUTCOME_KEY.items()}
    cur.execute("""SELECT count(*) AS n FROM mdm.exchange WHERE kind='VERIFY' AND purpose=%s AND ts > now() - make_interval(days => %s)
                   AND (answer->>'answer' IN ('POSSIBLE_DUPLICATE','ALREADY_RECEIVING') OR answer->>'already_received' = 'true')""", (PURPOSE, days))
    dup = cur.fetchone()["n"]
    cur.execute("SELECT reason_code, count(*) AS n FROM mdm.proposal WHERE status='PROPOSED' AND kind = ANY(%s) GROUP BY 1", (list(UC5_KINDS),))
    open_items = {r["reason_code"]: r["n"] for r in cur.fetchall()}
    for code in REASON_OF.values():
        open_items.setdefault(code, 0)
    return {"days": days, "purpose": PURPOSE, **by, "duplicates_found": dup, "total": sum(raw.values()), "by_outcome": by,
            "ledger_outcomes": raw, "open_items": open_items,
            "ledger_filters": {k: {"kind": "VERIFY", "outcome": o, "q": PURPOSE} for o, k in OUTCOME_KEY.items()}}
