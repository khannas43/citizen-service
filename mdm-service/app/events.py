"""Department events (births, deaths, marriages): resolve who they are about, then propose what should follow.
Civil registration is the authority for a birth, so a birth is recorded at once. A death or a marriage changes how other
departments treat a person, so it is only a proposal until a steward confirms who it is about. Nothing is sent to a
department from here: an approved action is recorded and audited as ready for that department."""
from __future__ import annotations
import json
from datetime import date, timedelta

from . import audit, exchange, store
from .matching import MatchConfig, prepare, score_cluster
from .model import Rec
from .names import tokens
from .stewardship import Refused
from .survivorship import REF_DATE, clean_name, DEFAULT_SURVIVORSHIP

SYS = {"pds": "Civil supplies (PDS)", "pension": "Social security / pension MIS", "land": "Revenue: land records",
       "elec": "Electricity distribution", "edu": "Education / scholarship", "idref": "Identity reference service",
       "mdm": "MDM steward"}



def _js(x):
    return json.dumps(x, default=str, ensure_ascii=False)


def _d(s):
    try:
        return date.fromisoformat(str(s)[:10])
    except (TypeError, ValueError):
        return None


def cfg_of(cur) -> MatchConfig:
    return MatchConfig(**store.active_rules(cur).get("match", {}))


def _new_event(cur, base: dict, status: str, note: str | None, person_id=None, record_id=None) -> int:
    cur.execute("INSERT INTO mdm.event (seq, event_key, event_type, uc, scenario, case_kind, payload, status, note, person_id, record_id) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s) RETURNING id",
                (base["seq"], base["event_key"], base["event_type"], base["uc"], base["scenario"], base["case_kind"], _js(base["payload"]),
                 status, note, person_id, record_id))
    return cur.fetchone()["id"]


def _propose(cur, event_id, uc, kind, system, person_id, summary, detail=None, options=None, parent_id=None) -> int:
    cur.execute("INSERT INTO mdm.proposal (event_id, parent_id, uc, kind, system, person_id, summary, detail, options) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb) RETURNING id",
                (event_id, parent_id, uc, kind, system, person_id, summary, _js(detail or {}), _js(options or [])))
    return cur.fetchone()["id"]


# ------------------------------------------------------------------ finding people
def candidates(cur, cfg: MatchConfig, rec: Rec, gender=None, max_birth_year=None, limit=4, min_birth_year=None) -> list[dict]:
    """People who could be this record, best first, with the same evidence the matcher gives."""
    toks = [t for t in tokens(rec.name) if len(t) >= 4]
    if not toks:
        return []
    pats = [f"%{t}%" for t in toks]
    cur.execute("SELECT p.id FROM mdm.person p WHERE p.life_status <> 'DECEASED' "
                "AND (p.name ILIKE ANY(%s) OR EXISTS (SELECT 1 FROM mdm.source_record r WHERE r.person_id=p.id AND r.name ILIKE ANY(%s))) "
                "AND (%s::text IS NULL OR p.gender IS NULL OR p.gender=%s) "
                "AND (%s::int IS NULL OR p.birth_year IS NULL OR p.birth_year <= %s) "
                "AND (%s::int IS NULL OR p.birth_year IS NULL OR p.birth_year >= %s) LIMIT 400",
                (pats, pats, gender, gender, max_birth_year, max_birth_year, min_birth_year, min_birth_year))
    ids = [r["id"] for r in cur.fetchall()]
    if not ids:
        return []
    recs = store.records_of(cur, ids)
    prepare(rec)
    out = []
    for pid, rows in recs.items():
        members = [prepare(store.rec_from_row(r, i)) for i, r in enumerate(rows)]
        score, ev = score_cluster(rec, members, cfg)
        if score >= cfg.review:
            out.append({"person_id": pid, "score": round(score, 3), "evidence": ev})
    out.sort(key=lambda c: -c["score"])
    return out[:limit]


def unique(cands: list[dict], cfg: MatchConfig, margin: float | None = None) -> dict | None:
    if not cands:
        return None
    if len(cands) == 1 or cands[0]["score"] - cands[1]["score"] >= (margin or cfg.margin):
        return cands[0]
    return None


def person_card(cur, pid: int) -> dict:
    cur.execute("SELECT id, mdm_id, name, gender, dob, birth_year, district, mandal, village, source_count, life_status FROM mdm.person WHERE id=%s", (pid,))
    p = cur.fetchone() or {}
    cur.execute("SELECT DISTINCT ration_card FROM mdm.source_record WHERE person_id=%s AND source='pds_view' AND ration_card IS NOT NULL "
                "AND coalesce(payload->>'tenant','N')<>'Y'", (pid,))
    p["ration_cards"] = [r["ration_card"] for r in cur.fetchall()]
    cur.execute("SELECT o.name FROM mdm.relationship r JOIN mdm.person o ON o.id = CASE WHEN r.person_a=%s THEN r.person_b ELSE r.person_a END "
                "WHERE r.kind='SPOUSE' AND (r.person_a=%s OR r.person_b=%s)", (pid, pid, pid))
    p["spouse"] = [r["name"] for r in cur.fetchall()]
    return p


def _opt(cur, c: dict) -> dict:
    card = person_card(cur, c["person_id"])
    return {"person_id": c["person_id"], "score": c["score"], "name": card.get("name"), "mdm_id": card.get("mdm_id"),
            "born": str(card["dob"]) if card.get("dob") else card.get("birth_year"), "place": ", ".join(x for x in (card.get("mandal"), card.get("district")) if x),
            "systems": card.get("source_count"), "ration_cards": card["ration_cards"], "spouse": card["spouse"],
            "why": {k: v["score"] for k, v in c["evidence"].get("components", {}).items() if v["score"] is not None}}


# ------------------------------------------------------------------ ingest
def ingest(cur, ev: dict, actor: str) -> dict:
    et, p = ev["event_type"], ev["payload"]
    key = p.get("registration_no") or ev.get("event_key") or f"{et}-{ev.get('order')}"
    base = {"seq": ev.get("order"), "event_key": key, "event_type": et, "uc": ev.get("use_case"), "scenario": ev.get("scenario"),
            "case_kind": ev.get("case_kind"), "payload": p}
    cfg = cfg_of(cur)
    if et in ("BIRTH_REGISTERED", "DEATH_REGISTERED", "MARRIAGE_REGISTERED"):
        cur.execute("SELECT id, status FROM mdm.event WHERE event_key=%s AND event_type=%s ORDER BY id LIMIT 1", (key, et))
        prior = cur.fetchone()
        if prior:
            eid = _new_event(cur, base, "DUPLICATE", f"Registration {key} was already received (event {prior['id']}). Ignored, so nothing is created twice.")
            return {"event_id": eid, "status": "DUPLICATE"}
    if et == "BIRTH_REGISTERED":
        if not p.get("child_name"):
            eid = _new_event(cur, base, "HELD", "The child's name is not registered yet. Nothing is created until the name arrives.")
            return {"event_id": eid, "status": "HELD"}
        eid = _new_event(cur, base, "PROCESSED", None)
        res = _process_birth(cur, cfg, eid, base)
        cur.execute("SELECT id, payload FROM mdm.event WHERE event_key=%s AND event_type='BIRTH_AMENDED' AND status='HELD' ORDER BY id", (key,))
        for held in cur.fetchall():                       # a correction that arrived first is applied now, in the order it was sent
            if held["payload"].get("child_name") and res.get("person_id"):
                _amend_birth(cur, cfg, {**base, "event_type": "BIRTH_AMENDED", "payload": held["payload"]})
                cur.execute("UPDATE mdm.event SET status='AMENDMENT', note=%s WHERE id=%s", ("Held until the registration arrived, then applied.", held["id"]))
        return {"event_id": eid, **res}
    if et == "BIRTH_AMENDED":
        return _amend_birth(cur, cfg, base)
    if et == "BIRTH_WITHDRAWN":
        return _withdraw_birth(cur, base, actor)
    if et == "DEATH_REGISTERED":
        return _death_event(cur, cfg, base)
    if et == "MARRIAGE_REGISTERED":
        return _marriage_event(cur, cfg, base)
    eid = _new_event(cur, base, "HELD", f"Event type {et} is not handled yet.")
    return {"event_id": eid, "status": "HELD"}


# ------------------------------------------------------------------ births
def _process_birth(cur, cfg, eid: int, base: dict) -> dict:
    p = base["payload"]
    dob = _d(p.get("date_of_birth"))
    parents = [x for x in (p.get("father_name"), p.get("mother_name")) if x]
    cur.execute("SELECT nextval('mdm.person_id_seq') AS i")
    pid = cur.fetchone()["i"]
    cur.execute("INSERT INTO mdm.person (id, mdm_id) VALUES (%s,%s)", (pid, f"MDM-{pid:08d}"))
    cur.execute("INSERT INTO mdm.source_record (source, source_rid, rtype, name, gender, dob, district, as_of, payload, parents, person_id, link_status, score, reason) "
                "VALUES ('crs',%s,'BIRTH',%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,'ANCHOR',1,'Registered birth: civil registration is the authority') RETURNING id",
                (base["event_key"], p["child_name"], p.get("gender"), dob, p.get("place"), p.get("registration_date"),
                 _js({"event_id": base["event_key"], "event_type": "BIRTH_REGISTERED", "payload": p, "live": True}), _js(parents), pid))
    rid = cur.fetchone()["id"]
    store.rebuild_person(cur, pid)
    late_days = exchange.current(cur)["late_event_days"]
    late = dob and _d(p.get("registration_date")) and (_d(p["registration_date"]) - dob).days > late_days
    year = dob.year if dob else REF_DATE.year
    def look(name, gender):
        if not name:
            return []
        for place in (p.get("place"), None):         # parents usually live where the child was born; fall back to anywhere
            found = candidates(cur, cfg, Rec(pk=-1, source="crs", rid="p", rtype="PARENT", name=name, gender=gender, district=place), gender, year - 15)
            if found:
                return found
        return []

    fcs, mcs = look(p.get("father_name"), "M"), look(p.get("mother_name"), "F")
    cards = {c["person_id"]: set(person_card(cur, c["person_id"])["ration_cards"]) for c in fcs[:3] + mcs[:3]}

    def partners(a, b):
        cur.execute("SELECT 1 FROM mdm.relationship WHERE kind='SPOUSE' AND person_a=LEAST(%s,%s) AND person_b=GREATEST(%s,%s)", (a, b, a, b))
        return bool(cur.fetchone())

    father = mother = card = None
    best = None
    for f in fcs[:3]:
        for m in mcs[:3]:
            shared = cards[f["person_id"]] & cards[m["person_id"]]
            linked = bool(shared) or partners(f["person_id"], m["person_id"])
            key = (linked, f["score"] + m["score"])
            if linked and (best is None or key > best):
                best, father, mother, card = key, f, m, (sorted(shared)[0] if shared else None)
    if not father:
        father, mother = unique(fcs, cfg), unique(mcs, cfg)
    if not card:
        for par in (father, mother):
            if par and cards.get(par["person_id"]):
                card = sorted(cards[par["person_id"]])[0]
                break
    child = p["child_name"]
    found = {"father": {"name": p.get("father_name"), "person_id": father and father["person_id"], "score": father and father["score"]},
             "mother": {"name": p.get("mother_name"), "person_id": mother and mother["person_id"], "score": mother and mother["score"]}}
    names = " and ".join(x["name"] for x in (found["father"], found["mother"]) if x["person_id"])
    if card:
        _propose(cur, eid, "UC2", "ADD_TO_RATION_CARD", SYS["pds"], pid, f"Add {child} to ration card {card} (household of {names})",
                 {"ration_card": card, "parents": found, "late_registration": bool(late)})
    missing = [k for k, v in found.items() if v["name"] and not v["person_id"]]
    if missing or not card:
        who = " and ".join(found[k]["name"] for k in missing) if missing else "either parent"
        _propose(cur, eid, "UC2", "REVIEW_PARENTS", SYS["mdm"], pid,
                 f"Could not identify {who} among known people. Check the registration before attaching {child} to a household",
                 {"parents": found, "candidates": {"father": [_opt(cur, c) for c in fcs[:3]], "mother": [_opt(cur, c) for c in mcs[:3]]}})
    _propose(cur, eid, "UC2", "REQUEST_IDENTITY_REFERENCE", SYS["idref"], pid, f"Issue an identity reference for {child}", {"born": str(dob)})
    note = f"New person {child} created from the birth registration."
    if late:
        note += f" Registered {(_d(p['registration_date']) - dob).days} days after birth."
    cur.execute("UPDATE mdm.event SET person_id=%s, record_id=%s, note=%s WHERE id=%s", (pid, rid, note, eid))
    exchange.birth_consents(cur, eid, pid, father and father["person_id"], mother and mother["person_id"], p.get("gender"), "system")
    return {"status": "PROCESSED", "person_id": pid}


def _find_birth(cur, key):
    cur.execute("SELECT * FROM mdm.event WHERE event_key=%s AND event_type='BIRTH_REGISTERED' AND status IN ('PROCESSED','HELD') ORDER BY id LIMIT 1", (key,))
    return cur.fetchone()


def _amend_birth(cur, cfg, base):
    key, p = base["event_key"], base["payload"]
    orig = _find_birth(cur, key)
    if not orig:
        eid = _new_event(cur, base, "HELD", f"An amendment arrived for registration {key}, which has not been received. Held until the registration arrives.")
        return {"event_id": orig and orig["id"] or eid, "status": "HELD"}
    if orig["status"] == "HELD":
        merged = {**orig["payload"], **{k: v for k, v in p.items() if v}}
        cur.execute("UPDATE mdm.event SET payload=%s::jsonb, status='PROCESSED' WHERE id=%s", (_js(merged), orig["id"]))
        res = _process_birth(cur, cfg, orig["id"], {**base, "payload": merged, "event_key": key})
        _new_event(cur, base, "AMENDMENT", f"Name added ({p.get('child_name')}). The held birth is now processed.", res.get("person_id"))
        return {"event_id": orig["id"], **res}
    if p.get("child_name") and orig["person_id"]:
        cur.execute("UPDATE mdm.source_record SET name=%s WHERE id=%s", (p["child_name"], orig["record_id"]))
        store.rebuild_person(cur, orig["person_id"])
    _new_event(cur, base, "AMENDMENT", "Name corrected on the existing birth record.", orig["person_id"])
    return {"event_id": orig["id"], "status": "AMENDMENT"}


def _withdraw_birth(cur, base, actor):
    key = base["event_key"]
    orig = _find_birth(cur, key)
    if not orig:
        eid = _new_event(cur, base, "NO_MATCH", f"Withdrawal received for registration {key}, which was never received. Nothing to undo.")
        return {"event_id": eid, "status": "NO_MATCH"}
    cur.execute("UPDATE mdm.proposal SET status='WITHDRAWN', note='The registration was withdrawn', decided_at=now() WHERE event_id=%s AND status='PROPOSED'", (orig["id"],))
    cur.execute("SELECT count(*) AS n FROM mdm.proposal WHERE event_id=%s AND status='APPROVED'", (orig["id"],))
    approved = cur.fetchone()["n"]
    pid, rid = orig["person_id"], orig["record_id"]
    if rid:
        cur.execute("DELETE FROM mdm.source_record WHERE id=%s", (rid,))
    if pid:
        store.rebuild_person(cur, pid)           # a person left with no records is removed
    note = f"Registration withdrawn ({base['payload'].get('reason', 'no reason given')}). The person created from it was removed and open proposals were cancelled."
    if approved:
        note += f" {approved} action(s) were already approved and need to be reversed with the department."
    cur.execute("UPDATE mdm.event SET status='WITHDRAWN', note=%s, person_id=NULL, record_id=NULL WHERE id=%s", (note, orig["id"]))
    _new_event(cur, base, "AMENDMENT", "Withdrawal applied.")
    audit.write(cur, actor, "BIRTH_WITHDRAWN", f"event:{orig['id']}", {"registration": key, "reason": base["payload"].get("reason")})
    return {"event_id": orig["id"], "status": "WITHDRAWN"}


# ------------------------------------------------------------------ deaths
def _death_event(cur, cfg, base):
    p = base["payload"]
    dod = _d(p.get("date_of_death")) or REF_DATE
    age_now = (p.get("age_at_death") or 0) + (REF_DATE.year - dod.year)
    rec = Rec(pk=-1, source="crs", rid=base["event_key"], rtype="DEATH", name=clean_name(p.get("name")), age=age_now)
    cands = candidates(cur, cfg, rec)
    outside = (p.get("place_of_death") or "Telangana") != "Telangana"
    if not cands:
        eid = _new_event(cur, base, "NO_MATCH", f"No known person fits {p.get('name')}, age {p.get('age_at_death')}. Nobody is marked as deceased. "
                         "A missing match does not mean the person is alive; the registry may simply not hold them.")
        return {"event_id": eid, "status": "NO_MATCH"}
    eid = _new_event(cur, base, "PROCESSED", f"Death registered in {p.get('place_of_death')}" + (" (outside the state)" if outside else "") +
                     f". {len(cands)} possible person(s). A steward confirms who it is before any department is told.")
    opts = [_opt(cur, c) for c in cands]
    sure = unique(cands, cfg, margin=0.15)       # a death is serious: only pre-select when no one else comes close
    _propose(cur, eid, "UC3", "CONFIRM_DEATH", SYS["mdm"], sure["person_id"] if sure else None,
             f"Confirm that {p.get('name')} (age {p.get('age_at_death')}, died {p.get('date_of_death')}) is the person below",
             {"date_of_death": p.get("date_of_death"), "place_of_death": p.get("place_of_death"), "outside_state": outside,
              "age_at_death": p.get("age_at_death"), "registration_no": base["event_key"], "name": p.get("name"),
              "suggested": sure["person_id"] if sure else None, "ambiguous": sure is None}, opts)
    return {"event_id": eid, "status": "PROCESSED"}


def _death_followups(cur, person_id: int, event_id: int, parent_id: int, d: dict):
    rows = store.records_of(cur, [person_id]).get(person_id, [])
    me = person_card(cur, person_id)
    name = me.get("name")
    dod = _d(d.get("date_of_death"))
    made = 0

    def add(kind, system, summary, detail):
        nonlocal made
        _propose(cur, event_id, "UC3", kind, system, person_id, summary, detail, parent_id=parent_id)
        made += 1

    nominee = None
    for r in rows:
        pl = r.get("payload") or {}
        if r["source"] == "pds_view" and pl.get("member_status") == "ACTIVE":
            add("MARK_DECEASED_PDS", SYS["pds"], f"Mark {name} as deceased on ration card {r['ration_card']}", {"record_id": r["id"], "ration_card": r["ration_card"]})
        elif r["source"] == "pension_batch" and pl.get("status") == "ACTIVE":
            nominee = pl.get("nominee_name") or nominee
            due = _d(pl.get("next_payment_on"))
            urgent = bool(due and dod and due >= dod)
            add("STOP_PENSION", SYS["pension"], f"Stop the {pl.get('scheme') or 'pension'} for {name}" +
                (f" from the next payment cycle ({due}). A payment already in flight is left as it is; an officer decides whether to hold or recover it" if urgent else ""),
                {"record_id": r["id"], "next_payment_on": str(due) if due else None, "urgent": urgent, "effective_from": str(due) if urgent else None,
                 "in_flight_payment": "left untouched" if urgent else None})
        elif r["source"] == "pension_batch":
            nominee = (pl.get("nominee_name") or nominee)
        elif r["source"] == "revenue_land":
            add("FLAG_LAND_SUCCESSION", SYS["land"], f"Note the death against land record {r['source_rid']} so succession can start", {"record_id": r["id"]})
        elif r["source"] == "electricity":
            add("FLAG_CONNECTION", SYS["elec"], f"Connection {r['source_rid']} is in the name of a person who has died. Ask the household to transfer it", {"record_id": r["id"]})
        elif r["source"] == "student_portal":
            add("CLOSE_SCHOLARSHIP", SYS["edu"], f"Close the scholarship record {r['source_rid']}", {"record_id": r["id"]})
    cur.execute("SELECT o.id, o.name, o.life_status FROM mdm.relationship r JOIN mdm.person o ON o.id = CASE WHEN r.person_a=%s THEN r.person_b ELSE r.person_a END "
                "WHERE r.kind='SPOUSE' AND (r.person_a=%s OR r.person_b=%s)", (person_id, person_id, person_id))
    spouses = [s for s in cur.fetchall() if s["life_status"] != "DECEASED"]
    for s in spouses:
        add("NOTIFY_SPOUSE", SYS["pension"], f"Contact {s['name']} (spouse) about eligibility for family pension or widow assistance", {"spouse_id": s["id"]})
    if not spouses:
        if nominee:
            add("NOTIFY_NOMINEE", SYS["pension"], f"No spouse on record. Contact the nominee on the pension file: {nominee}", {"nominee": nominee})
        else:
            add("REVIEW_NEXT_OF_KIN", SYS["mdm"], f"No spouse or nominee is on record for {name}. A steward should find the next of kin", {})
    return made


# ------------------------------------------------------------------ marriages
def _marriage_event(cur, cfg, base):
    p = base["payload"]
    md = _d(p.get("marriage_date")) or REF_DATE
    g = candidates(cur, cfg, Rec(pk=-1, source="marriage_register", rid="g", rtype="MARRIAGE_GROOM", name=p.get("groom_name") or "", gender="M"), "M", md.year - 21, min_birth_year=md.year - 55)
    b = candidates(cur, cfg, Rec(pk=-1, source="marriage_register", rid="b", rtype="MARRIAGE_BRIDE", name=p.get("bride_name") or "", gender="F"), "F", md.year - 18, min_birth_year=md.year - 55)
    # a person already married to someone else is a less likely match for a first marriage
    def free(c):
        return not person_card(cur, c["person_id"])["spouse"]
    g = sorted(g, key=lambda c: (not free(c), -c["score"]))
    b = sorted(b, key=lambda c: (not free(c), -c["score"]))
    if not g or not b:
        side = "groom" if not g else "bride"
        eid = _new_event(cur, base, "NO_MATCH", f"The {side} could not be matched to a known person. The register covers only part of the state, so this does not mean the marriage is invalid or the person is unmarried.")
        return {"event_id": eid, "status": "NO_MATCH"}
    eid = _new_event(cur, base, "PROCESSED", "Marriage registered. A steward confirms both people before they are linked as spouses.")
    gs, bs = unique(g, cfg), unique(b, cfg)
    _propose(cur, eid, "UC6", "CONFIRM_MARRIAGE", SYS["mdm"], gs["person_id"] if gs else None,
             f"Confirm the couple: {p.get('groom_name')} and {p.get('bride_name')} (married {p.get('marriage_date')})",
             {"marriage_date": p.get("marriage_date"), "bride_name_after": p.get("bride_name_after"), "groom_name": p.get("groom_name"),
              "bride_name": p.get("bride_name"), "suggested": {"groom": gs and gs["person_id"], "bride": bs and bs["person_id"]},
              "ambiguous": not (gs and bs), "registration_no": base["event_key"]},
             {"groom": [_opt(cur, c) for c in g[:3]], "bride": [_opt(cur, c) for c in b[:3]]})
    return {"event_id": eid, "status": "PROCESSED"}


def _marriage_followups(cur, g_id: int, b_id: int, event_id: int, parent_id: int, d: dict):
    g, b = person_card(cur, g_id), person_card(cur, b_id)
    new_name = d.get("bride_name_after")
    if g["ration_cards"] and set(g["ration_cards"]) != set(b["ration_cards"]):
        _propose(cur, event_id, "UC6", "ADD_TO_RATION_CARD", SYS["pds"], b_id, f"Add {b['name']} to ration card {g['ration_cards'][0]} (her husband's household)",
                 {"ration_card": g["ration_cards"][0], "currently_on": b["ration_cards"]}, parent_id=parent_id)
    if new_name and new_name != b["name"]:
        recs = [r for r in store.records_of(cur, [b_id]).get(b_id, []) if r["rtype"] != "MARRIAGE_BRIDE"]
        systems = sorted({r["source"] for r in recs})
        _propose(cur, event_id, "UC6", "NOTE_NEW_NAME", "Departments holding her record", b_id,
                 f"Tell {len(systems)} department(s) that {b['name']} now uses the name {new_name}", {"new_name": new_name, "systems": systems}, parent_id=parent_id)
    return True


# ------------------------------------------------------------------ steward decisions on proposals
def decide_proposal(cur, prop_id: int, decision: str, chosen: dict, actor: str, note: str | None) -> dict:
    cur.execute("SELECT * FROM mdm.proposal WHERE id=%s FOR UPDATE", (prop_id,))
    pr = cur.fetchone()
    if not pr:
        raise Refused("Proposal not found", 404)
    if pr["status"] != "PROPOSED":
        raise Refused("This proposal has already been decided", 409)
    decision = decision.upper()
    if decision not in ("APPROVE", "REJECT"):
        raise Refused("decision must be APPROVE or REJECT")
    exchange.require_rationale(cur, pr, note)
    if decision == "APPROVE":
        exchange.require_gate(cur, pr)
    chosen = chosen or {}
    out = {"proposal": prop_id, "decision": decision}
    if decision == "APPROVE":
        if pr["kind"] == "CONFIRM_DEATH":
            pid = chosen.get("person_id") or pr["detail"].get("suggested")
            if pid not in [o["person_id"] for o in pr["options"]]:
                raise Refused("Choose one of the people listed")
            d = pr["detail"]
            raw = {"event_id": d.get("registration_no"), "event_type": "DEATH_REGISTERED",
                   "payload": {"registration_no": d.get("registration_no"), "name": d.get("name"), "age_at_death": d.get("age_at_death"),
                               "date_of_death": d.get("date_of_death"), "place_of_death": d.get("place_of_death")}, "live": True}
            cur.execute("INSERT INTO mdm.source_record (source, source_rid, rtype, name, age, as_of, payload, person_id, link_status, score, reason) "
                        "VALUES ('crs',%s,'DEATH',%s,%s,%s,%s::jsonb,%s,'STEWARD_LINKED',1,%s)",
                        (d.get("registration_no"), d.get("name"), d.get("age_at_death"), d.get("date_of_death"), _js(raw), pid, f"confirmed by {actor}"))
            store.rebuild_person(cur, pid)
            cur.execute("UPDATE mdm.event SET person_id=%s WHERE id=%s", (pid, pr["event_id"]))
            cur.execute("UPDATE mdm.proposal SET person_id=%s WHERE id=%s", (pid, prop_id))
            out["follow_ups"] = _death_followups(cur, pid, pr["event_id"], prop_id, d)
            out["person_id"] = pid
            chosen = {"person_id": pid}
        elif pr["kind"] == "CONFIRM_MARRIAGE":
            gid, bid = chosen.get("groom_id") or pr["detail"]["suggested"].get("groom"), chosen.get("bride_id") or pr["detail"]["suggested"].get("bride")
            if gid not in [o["person_id"] for o in pr["options"]["groom"]] or bid not in [o["person_id"] for o in pr["options"]["bride"]] or gid == bid:
                raise Refused("Choose one groom and one bride from the people listed")
            d = pr["detail"]
            reg = d.get("registration_no")
            for rid_, rtype, nm, gen, pid in ((reg, "MARRIAGE_GROOM", d.get("groom_name"), "M", gid), (f"{reg}:bride", "MARRIAGE_BRIDE", d.get("bride_name"), "F", bid)):
                raw = {"registration_no": reg, "marriage_date": d.get("marriage_date"), "bride_name_after": d.get("bride_name_after"), "live": True}
                cur.execute("INSERT INTO mdm.source_record (source, source_rid, rtype, name, gender, as_of, payload, person_id, link_status, score, reason) "
                            "VALUES ('marriage_register',%s,%s,%s,%s,%s,%s::jsonb,%s,'STEWARD_LINKED',1,%s)",
                            (rid_, rtype, nm, gen, d.get("marriage_date"), _js(raw), pid, f"confirmed by {actor}"))
            for pid in (gid, bid):
                store.rebuild_person(cur, pid)
            store.derive_relationships(cur, [gid, bid])
            cur.execute("UPDATE mdm.event SET person_id=%s WHERE id=%s", (gid, pr["event_id"]))
            md = _d(d.get("marriage_date")) or REF_DATE
            mins = exchange.current(cur)["min_marriage_age"]
            ages = {"groom": (exchange.person_age(cur, gid, md), mins["M"]), "bride": (exchange.person_age(cur, bid, md), mins["F"])}
            under = {k: v for k, v in ages.items() if v[0] is not None and v[0] < v[1]}
            if under:
                # the law, not this system, decides what follows: an authorised officer is told, nothing else is done
                _propose(cur, pr["event_id"], "UC6", "REFER_UNDERAGE", "Authorised officer (policy)", gid,
                         "Refer to an authorised officer: a party was below the legal minimum age at marriage",
                         {"parties": {k: {"age": v[0], "minimum": v[1]} for k, v in under.items()}, "marriage_date": d.get("marriage_date"),
                          "policy": "min_marriage_age", "note": "No ration card change and no name change is proposed."}, parent_id=prop_id)
                out["underage_referred"] = True
            else:
                _marriage_followups(cur, gid, bid, pr["event_id"], prop_id, d)
                out["consents"] = [c["id"] for c in exchange.marriage_consents(cur, pr["event_id"], gid, bid, actor)]
            chosen = {"groom_id": gid, "bride_id": bid}
            out["person_id"] = gid
    status = "APPROVED" if decision == "APPROVE" else "REJECTED"
    cur.execute("UPDATE mdm.proposal SET status=%s, chosen=%s::jsonb, note=%s, rationale=%s, decided_by=%s, decided_at=now() WHERE id=%s",
                (status, _js(chosen), note, note, actor, prop_id))
    exchange.ledger(cur, "PROPOSAL", pr["system"], actor, None, pr["person_id"], None, pr["kind"], "ANSWERED",
                    {"decision": status, "rationale": note, "policy_versions": pr.get("policy_version")})
    meaning = ""
    if decision == "APPROVE" and pr["kind"] not in ("CONFIRM_DEATH", "CONFIRM_MARRIAGE"):
        meaning = f"Ready for {pr['system']}. This build does not send it; the department acts on it."
    audit.write(cur, actor, f"PROPOSAL_{status}", f"proposal:{prop_id}", {"kind": pr["kind"], "event": pr["event_id"], "person": pr["person_id"], "note": note, "meaning": meaning})
    out["status"] = status
    return out


def replay(cur, path: str, actor: str) -> dict:
    n, res = 0, {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                r = ingest(cur, json.loads(line), actor)
                res[r["status"]] = res.get(r["status"], 0) + 1
                n += 1
    audit.write(cur, actor, "EVENTS_REPLAYED", path, {"events": n, "outcomes": res})
    return {"events": n, "outcomes": res}
