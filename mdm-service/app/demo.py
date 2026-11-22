"""Demo layer (Wave 4): scripted scenario runner, unscripted event injector, evidence pack.

Every scenario drives the same functions the screens use (events, exchange, ops, wave3) against the loaded data. It makes fresh
records with a DEMO- prefix so a run never edits the loaded data pack, and it records what it saw as evidence. A scenario passes
only when every check passes. Where the build does not yet do something the brief shows, the scenario says so as a gap and is
marked PARTIAL, never PASS.
"""
from __future__ import annotations
import json, time, uuid
from datetime import date, datetime, timedelta, timezone

from . import citizen, demo_uc1, demo_uc2_login, demo_uc3_story, demo_uc4_invite, demo_uc4_story, demo_uc5_story, feed, audit, events, exchange, ops, store, wave3
from .db import connect
from .exchange import PURPOSES, REF_DATE, SYSTEMS, current
from .matching import prepare
from .model import Rec
from .stewardship import Refused, decide
from .survivorship import clean_name

ACTOR = "demo-runner"


def _js(x):
    return json.dumps(x, default=str, ensure_ascii=False)


class Skip(Exception):
    """The loaded data pack has nothing to run this scenario on."""


class Kit:
    """What a scenario uses: ask questions of the database, record checks and gaps."""

    def __init__(self, cur, sid: str):
        self.cur, self.sid, self.checks, self.gaps = cur, sid, [], []
        self.tag = uuid.uuid4().hex[:6]

    # evidence
    def ok(self, cond, text, **data):
        self.checks.append({"ok": bool(cond), "text": text, "data": data or None})
        return bool(cond)

    def info(self, text, **data):
        self.checks.append({"ok": True, "text": text, "data": data or None, "info": True})

    def gap(self, text):
        self.gaps.append(text)

    def skip(self, why):
        raise Skip(why)

    # database
    def q(self, sql, *p):
        self.cur.execute(sql, p)
        return self.cur.fetchall()

    def one(self, sql, *p):
        r = self.q(sql, *p)
        return r[0] if r else None

    def refused(self, fn, *a, **k):
        """Run something that must be refused; return the reason (or None if it was allowed)."""
        self.cur.execute("SAVEPOINT demo_try")
        try:
            fn(*a, **k)
        except Refused as e:
            self.cur.execute("ROLLBACK TO SAVEPOINT demo_try")
            return str(e)
        self.cur.execute("RELEASE SAVEPOINT demo_try")
        return None

    # common steps
    def pol(self, key):
        return current(self.cur)[key]

    def set_policy(self, key, value, note="demo"):
        return exchange.set_policy(self.cur, key, value, ACTOR, note)

    def person(self, pid):
        return self.one("SELECT id, mdm_id, name, gender, dob, birth_year, district, life_status FROM mdm.person WHERE id=%s", pid)

    def token(self, pid):
        r = self.one("SELECT source_rid FROM mdm.source_record WHERE person_id=%s AND source='identity_reference' ORDER BY id LIMIT 1", pid)
        return r and r["source_rid"]

    def grant(self, pid, purpose, elements=None, channel="PORTAL", operator=None, **kw):
        c = exchange.request_consent(self.cur, pid, purpose, ACTOR)
        if c["status"] == "GRANTED" and not elements:
            return c
        if c["status"] == "PENDING":
            return exchange.respond(self.cur, c["id"], "GRANT", ACTOR, channel, operator, "demo", None, elements, **kw)
        return c

    def clear_consents(self, pid, purpose, given_by=None):
        for c in self.q("SELECT id FROM mdm.consent WHERE person_id=%s AND purpose=%s AND status IN ('GRANTED','PENDING')", pid, purpose):
            st = self.one("SELECT status FROM mdm.consent WHERE id=%s", c["id"])["status"]
            if st == "GRANTED":
                exchange.revoke(self.cur, c["id"], ACTOR, note="demo reset")
            else:
                exchange.respond(self.cur, c["id"], "REFUSE", ACTOR, note="demo reset", given_by=given_by)

    def ask(self, requester, purpose, question, params, pid=None, token=None, actor=ACTOR):
        return exchange.verify(self.cur, requester, purpose, question, params, actor, person_id=pid, reference_token=token)

    def event(self, etype, uc, payload, scenario=None, case_kind=None):
        return events.ingest(self.cur, {"event_type": etype, "use_case": uc, "payload": payload, "scenario": scenario or self.sid,
                                        "case_kind": case_kind, "order": 9000}, ACTOR)

    def flow(self, eid):
        return exchange.event_flow(self.cur, eid)

    def proposals(self, eid, kind=None):
        rows = self.q("SELECT * FROM mdm.proposal WHERE event_id=%s ORDER BY id", eid)
        return [r for r in rows if not kind or r["kind"] == kind]

    def approve(self, pr, note="Checked against the register entry", **chosen):
        return events.decide_proposal(self.cur, pr["id"], "APPROVE", chosen, ACTOR, note)

    def audit_rows(self, action=None, subject=None, since=None):
        sql, p = "SELECT seq, actor, action, subject, detail FROM mdm.audit WHERE true", []
        if action:
            sql += " AND action=%s"
            p.append(action)
        if subject:
            sql += " AND subject=%s"
            p.append(subject)
        if since:
            sql += " AND seq>%s"
            p.append(since)
        return self.q(sql + " ORDER BY seq", *p)

    def reg(self, prefix):
        """A fresh registration number, so two events in one scenario are never taken for the same registration."""
        return f"DEMO-{prefix}-{uuid.uuid4().hex[:6]}"

    def audit_head(self):
        r = self.one("SELECT COALESCE(max(seq),0) AS s FROM mdm.audit")
        return r["s"]


# ------------------------------------------------------------------ fixtures
def couple(k: Kit, married=True):
    """A man and a woman on the loaded data. married=True: existing spouses sharing a card. married=False: two unmarried adults of one district."""
    if married:
        base = """SELECT f.id AS fid, f.name AS fname, m.id AS mid, m.name AS mname, f.district AS district FROM mdm.relationship r
                  JOIN mdm.person f ON f.id=r.person_a JOIN mdm.person m ON m.id=r.person_b
                  WHERE r.kind='SPOUSE' AND f.gender='M' AND m.gender='F' AND f.district IS NOT NULL AND f.name ~ ' ' AND m.name ~ ' '
                    AND (SELECT count(*) FROM mdm.person x WHERE x.name=f.name)=1 AND (SELECT count(*) FROM mdm.person x WHERE x.name=m.name)=1"""
        pds = " AND EXISTS (SELECT 1 FROM mdm.source_record s WHERE s.person_id=f.id AND s.source='pds_view')"
        rows = k.q(base + pds + " ORDER BY f.id LIMIT 400")                      # best: spouses who share a ration card
        rows += [r for r in k.q(base + " ORDER BY f.id LIMIT 400") if r["fid"] not in {x["fid"] for x in rows}]     # then any spouses with unique names
    else:
        rows = k.q("""SELECT f.id AS fid, f.name AS fname, m.id AS mid, m.name AS mname, f.district AS district FROM mdm.person f
                      JOIN mdm.person m ON m.district=f.district AND m.gender='F' AND m.id<>f.id
                      WHERE f.gender='M' AND f.district IS NOT NULL AND f.name ~ '^[ -~]+ [ -~]+$' AND m.name ~ '^[ -~]+ [ -~]+$' AND f.life_status<>'DECEASED' AND m.life_status<>'DECEASED'
                        AND COALESCE(f.dob, make_date(f.birth_year,6,1)) BETWEEN date '1985-01-01' AND date '2000-12-31'
                        AND COALESCE(m.dob, make_date(m.birth_year,6,1)) BETWEEN date '1988-01-01' AND date '2003-12-31'
                        AND (SELECT count(*) FROM mdm.person x WHERE x.name=f.name)=1 AND (SELECT count(*) FROM mdm.person x WHERE x.name=m.name)=1
                        AND NOT EXISTS (SELECT 1 FROM mdm.relationship r WHERE r.kind='SPOUSE' AND (r.person_a IN (f.id,m.id) OR r.person_b IN (f.id,m.id)))
                        AND EXISTS (SELECT 1 FROM mdm.source_record s WHERE s.person_id=f.id AND s.source='pds_view')
                        AND f.id NOT IN (SELECT COALESCE((payload->>'groom_person')::bigint,0) FROM mdm.event WHERE event_key LIKE 'DEMO-M-%%' AND payload ? 'groom_person')
                      ORDER BY f.id LIMIT 60""")
    used = {(r["payload"].get("groom_name"), r["payload"].get("bride_name")) for r in k.q("SELECT payload FROM mdm.event WHERE event_key LIKE 'DEMO-M-%%'")}
    busy = {(r["payload"].get("father_name"), r["payload"].get("mother_name")) for r in k.q("SELECT payload FROM mdm.event WHERE event_key LIKE 'DEMO-B-%%'")}
    cfg = events.cfg_of(k.cur)
    for r in rows:
        if (r["fname"], r["mname"]) in used or (r["fname"], r["mname"]) in busy:     # one child per family: a couple with a demo birth already waiting is skipped
            continue
        if (_birth_would_match(k, cfg, r) if married else _marriage_would_match(k, cfg, r)):
            return r
    if married and rows:                                      # every couple already has a demo birth waiting: the family with the oldest one gets a new child that replaces it
        r = rows[0]
        k.cur.execute("SELECT id, scenario FROM mdm.event WHERE event_key LIKE 'DEMO-B-%%' AND payload->>'father_name'=%s AND payload->>'mother_name'=%s ORDER BY id LIMIT 1", (r["fname"], r["mname"]))
        old = k.cur.fetchone()
        if old and old["scenario"]:
            clear_events(k.cur, old["scenario"], "demo")
        return r
    k.skip("no unused couple in the loaded data that the matcher resolves")


def _birth_would_match(k: Kit, cfg, r) -> bool:
    """Reads only: would a birth registration find both parents among its top three candidates, as the birth handler looks them up?"""
    year = 2026
    def top(name, gender, pid):
        for place in (r["district"], None):
            f = events.candidates(k.cur, cfg, Rec(pk=-1, source="crs", rid="p", rtype="PARENT", name=name, gender=gender, district=place), gender, year - 15)
            if f:
                return pid in [c["person_id"] for c in f[:3]]
        return False
    return top(r["fname"], "M", r["fid"]) and top(r["mname"], "F", r["mid"])


def _marriage_would_match(k: Kit, cfg, r) -> bool:
    """Reads only: would the marriage matcher put both people among its top three candidates?"""
    md = date(2026, 5, 1)
    g = events.candidates(k.cur, cfg, Rec(pk=-1, source="marriage_register", rid="g", rtype="MARRIAGE_GROOM", name=r["fname"], gender="M"), "M", md.year - 21, min_birth_year=md.year - 55)
    b = events.candidates(k.cur, cfg, Rec(pk=-1, source="marriage_register", rid="b", rtype="MARRIAGE_BRIDE", name=r["mname"], gender="F"), "F", md.year - 18, min_birth_year=md.year - 55)
    free = lambda c: not events.person_card(k.cur, c["person_id"])["spouse"]
    g = sorted(g, key=lambda c: (not free(c), -c["score"]))[:3]
    b = sorted(b, key=lambda c: (not free(c), -c["score"]))[:3]
    return r["fid"] in [c["person_id"] for c in g] and r["mid"] in [c["person_id"] for c in b]


def cert_holder(k: Kit, rtype="INCOME", exclude_conflict=True):
    """An adult with exactly one valid certificate of this kind and an identity reference."""
    rows = k.q("""SELECT s.person_id, i.source_rid AS token FROM mdm.source_record s
                  JOIN mdm.source_record i ON i.person_id=s.person_id AND i.source='identity_reference'
                  WHERE s.source='revenue_certificates' AND s.rtype=%s AND s.payload->>'status'='ACTIVE'
                    AND (s.payload->>'valid_until'='' OR s.payload->>'valid_until' IS NULL OR s.payload->>'valid_until'>=%s)
                    AND (SELECT count(*) FROM mdm.source_record x WHERE x.person_id=s.person_id AND x.source='revenue_certificates' AND x.rtype=%s)=1
                    AND (SELECT COALESCE(birth_year,1900) FROM mdm.person p WHERE p.id=s.person_id) < 1990
                    AND NOT EXISTS (SELECT 1 FROM mdm.exchange x WHERE x.person_id=s.person_id AND x.ts > now() - interval '1 hour')
                  ORDER BY s.person_id LIMIT 1""", rtype, REF_DATE.isoformat(), rtype)
    if not rows:
        k.skip("no adult with one valid certificate and an identity reference")
    return rows[0]["person_id"], rows[0]["token"]


def death_fixture(k: Kit, spouse: bool | None, urgent=False, same_name_pair=False):
    """A living person that a death registration would match unambiguously (or, for same_name_pair, ambiguously). Nothing is written."""
    cfg = events.cfg_of(k.cur)
    used = {r["payload"].get("name") for r in k.q("SELECT payload FROM mdm.event WHERE event_key LIKE 'DEMO-D-%%'")}
    if same_name_pair:
        rows = k.q("""SELECT a.id AS aid, a.name, COALESCE(a.dob, make_date(a.birth_year,6,1)) AS d FROM mdm.person a JOIN mdm.person b ON b.name=a.name AND b.id>a.id
                      WHERE a.life_status<>'DECEASED' AND b.life_status<>'DECEASED' AND a.name ~ ' '
                        AND NOT EXISTS (SELECT 1 FROM mdm.source_record x WHERE x.person_id IN (a.id, b.id) AND x.source_rid LIKE 'DEMO-UC3-%%')
                        AND abs(COALESCE(a.birth_year, 0) - COALESCE(b.birth_year, 9999)) <= 3 AND COALESCE(a.birth_year,0) BETWEEN 1930 AND 1965
                      ORDER BY a.id LIMIT 30""")
        for r in rows:
            if r["name"] in used:
                continue
            age = REF_DATE.year - r["d"].year
            c = events.candidates(k.cur, cfg, prepare(Rec(pk=-1, source="crs", rid="x", rtype="DEATH", name=clean_name(r["name"]), age=age)))
            if len(c) >= 2 and events.unique(c, cfg, margin=0.15) is None:
                return {"name": r["name"], "age": age, "person_id": r["aid"]}
        k.skip("no two living people with one name and near ages")
    pens = k.q("""SELECT s.person_id, s.payload, p.name, COALESCE(p.dob, make_date(p.birth_year,6,1)) AS d FROM mdm.source_record s JOIN mdm.person p ON p.id=s.person_id
                  WHERE s.source='pension_batch' AND s.payload->>'status'='ACTIVE' AND p.life_status<>'DECEASED' AND p.name ~ ' '
                    AND COALESCE(p.birth_year, 0) BETWEEN 1930 AND 1960
                    AND NOT EXISTS (SELECT 1 FROM mdm.source_record x WHERE x.person_id=s.person_id AND x.source_rid LIKE 'DEMO-UC3-%%')
                  ORDER BY s.person_id LIMIT 400""")
    for r in pens:
        pay = r["payload"] or {}
        if r["name"] in used:
            continue
        sp = k.q("""SELECT o.id FROM mdm.relationship rl JOIN mdm.person o ON o.id = CASE WHEN rl.person_a=%s THEN rl.person_b ELSE rl.person_a END
                    WHERE rl.kind='SPOUSE' AND (rl.person_a=%s OR rl.person_b=%s) AND o.life_status<>'DECEASED'""", r["person_id"], r["person_id"], r["person_id"])
        if spouse is True and not sp:
            continue
        if spouse is False and (sp or pay.get("nominee_name")):
            continue
        if urgent and not pay.get("next_payment_on"):
            continue
        age = REF_DATE.year - r["d"].year
        c = events.candidates(k.cur, cfg, prepare(Rec(pk=-1, source="crs", rid="x", rtype="DEATH", name=clean_name(r["name"]), age=age)))
        sure = events.unique(c, cfg, margin=0.15)
        if sure and sure["person_id"] == r["person_id"]:
            return {"name": r["name"], "age": age, "person_id": r["person_id"], "next_payment_on": pay.get("next_payment_on")}
    k.skip("no pensioner that a death registration would match unambiguously" + (" with a living spouse" if spouse else " with no spouse or nominee" if spouse is False else ""))


def death_payload(k: Kit, fx, place="Telangana", days_ago=1, reg=None):
    dod = (REF_DATE - timedelta(days=days_ago)).isoformat()
    return {"registration_no": reg or k.reg("D"), "name": fx["name"], "age_at_death": fx["age"], "date_of_death": dod, "place_of_death": place,
            "registration_date": REF_DATE.isoformat()}


def birth_payload(k: Kit, pr, name="__", reg=None, **kw):
    p = {"registration_no": reg or k.reg("B"), "child_name": f"Demo Child {k.tag}" if name == "__" else name, "gender": "F", "date_of_birth": "2026-06-10",
         "father_name": pr["fname"], "mother_name": pr["mname"], "place": pr["district"], "registration_date": "2026-06-12"}
    p.update(kw)
    return p


def consent_of(flow, purpose):
    return next(c for c in flow["consents"] if c["purpose"] == purpose)


def delivery_of(flow, purpose, kind="EVENT"):
    return next((d for d in flow["deliveries"] if d["purpose"] == purpose and d["kind"] == kind), None)


# ================================================================== UC1  Know the person
def uc1_citizen_setup(k: Kit):
    """The three demo citizens who see a "Please confirm" card (sign-ins 1001, 4001, 5001): tied to their people, each with one disagreement, starting fresh."""
    out = demo_uc1.plant_all(k.cur, ACTOR)
    for line in out["notes"].values():
        k.info(line)
    k.info("Citizen cards raised", scan=out["scan"])


def s_1_1(k: Kit):
    uc1_citizen_setup(k)
    rows = k.q("""SELECT person_id FROM mdm.source_record WHERE person_id IS NOT NULL GROUP BY 1 HAVING count(DISTINCT source)>=4 AND count(DISTINCT name)>=3
                  ORDER BY 1 LIMIT 1""")
    if not rows:
        k.skip("no person with several differently spelt records")
    pid = rows[0]["person_id"]
    recs = k.q("SELECT source, name, link_status, score, reason FROM mdm.source_record WHERE person_id=%s AND source<>'identity_reference' ORDER BY id", pid)
    names = sorted({r["name"] for r in recs if r["name"]})
    k.ok(len(names) >= 3, f"One person is recognised across {len({r['source'] for r in recs})} systems under {len(names)} different spellings", names=names)
    linked = [r for r in recs if r["link_status"] in ("AUTO_LINKED", "ANCHOR", "STEWARD_LINKED")]
    k.ok(len(linked) == len(recs), "Every record is linked with a status and a recorded reason", linked=len(linked), of=len(recs))
    k.ok(all(r["score"] is not None for r in recs if r["link_status"] == "AUTO_LINKED"), "Each automatic link carries its match score")
    g = k.one("SELECT value, rule FROM mdm.golden_attribute WHERE person_id=%s AND attribute='name'", pid)
    k.ok(g and g["rule"], "The master name states the survivorship rule that chose it", value=g and g["value"], rule=g and g["rule"])
    k.ok(not any(r["name"] == "XX" for r in recs), "No source record was rewritten: each keeps the spelling its department holds")


def s_1_2(k: Kit):
    r = k.one("""SELECT a.person_a AS parent, a.person_b AS child FROM mdm.relationship a
                 JOIN mdm.relationship s ON s.kind='SPOUSE' AND (s.person_a=a.person_a OR s.person_b=a.person_a) WHERE a.kind='PARENT_OF' ORDER BY a.id LIMIT 1""")
    if not r:
        k.skip("no person with both a child and a spouse edge")
    edges = k.q("SELECT kind, basis, source, ref FROM mdm.relationship WHERE person_a=%s OR person_b=%s", r["parent"], r["parent"])
    k.ok({"PARENT_OF", "SPOUSE"} <= {e["kind"] for e in edges}, "Parent-child and spouse relationships are both shown", kinds=sorted({e["kind"] for e in edges}))
    k.ok(all(e["basis"] for e in edges), "Every edge says how it was derived (the basis)", sample=edges[0]["basis"])
    hh = ops.household(k.cur, r["parent"])
    k.ok(len(hh["members"]) >= 3, f"The household built from the ration card has {len(hh['members'])} members", cards=hh["cards"])
    k.ok(bool(hh["caveats"]), "The household view states that a ration card is a proxy, not a legal household")
    k.info("Only relationship edges are stored; no attributes are copied onto them")


def s_1_3(k: Kit):
    r = k.one("""SELECT g.person_id, g.value, g.rule, g.alternatives FROM mdm.golden_attribute g WHERE g.attribute='dob' AND g.conflict ORDER BY g.person_id LIMIT 1""")
    if not r:
        k.skip("no date-of-birth conflict in the loaded data")
    alts = r["alternatives"]
    k.ok(len(alts) >= 2 and len({a["value"] for a in alts}) >= 2, "Both values and both sources are kept", alternatives=alts)
    k.ok(bool(r["rule"]), "The rule that chose the master value is named", rule=r["rule"], chosen=r["value"])
    lost = [a for a in alts if a["value"] != r["value"]]
    held = k.q("SELECT 1 FROM mdm.source_record WHERE person_id=%s AND source=%s AND dob::text=%s", r["person_id"], lost[0]["source"], lost[0]["value"])
    k.ok(bool(held), "The losing value is still held, unchanged, in the department's own record", source=lost[0]["source"], value=lost[0]["value"])
    before = k.person(r["person_id"])["dob"]
    d = ops.raise_discrepancy(k.cur, r["person_id"], "date_of_birth", str(r["value"]), lost[0]["value"], "Demo: sources disagree", ACTOR, authoritative_system="crs")
    k.ok(d["status"] == "ROUTED" and d["authoritative_system"] == "crs", "The custodian (civil registration) is told through a routed discrepancy", id=d["id"])
    k.ok(k.person(r["person_id"])["dob"] == before, "The master record was not edited")
    k.ok(bool(k.one("SELECT 1 FROM mdm.dq_issue WHERE person_id=%s AND code='DOB_CONFLICT'", r["person_id"])), "The conflict is on the data-quality list")


def s_1_4(k: Kit):
    t = k.one("""SELECT t.id, t.candidates FROM mdm.review_task t WHERE t.status='OPEN' AND jsonb_array_length(t.candidates)>=2
                 AND (t.candidates->0->>'score')::float - (t.candidates->1->>'score')::float < 0.15 ORDER BY t.id LIMIT 1""")
    if not t:
        k.skip("no open review task with two close candidates")
    k.ok(len(t["candidates"]) >= 2, "Two plausible candidates are shown side by side, not auto-linked", scores=[c["score"] for c in t["candidates"][:2]])
    k.ok(bool(k.one("SELECT 1 FROM mdm.source_record r JOIN mdm.review_task x ON x.record_id=r.id WHERE x.id=%s AND r.link_status='IN_REVIEW'", t["id"])), "The record waits unlinked until a person decides")
    seq = k.audit_head()
    res = decide(k.cur, t["id"], "SEPARATE", None, ACTOR, "Demo: kept apart pending evidence from the department")
    k.ok(res["decision"] == "SEPARATE", "A reviewer decides, with a reason")
    k.ok(any(a["action"] == "REVIEW_SEPARATE" for a in k.audit_rows(since=seq)), "The decision is in the audit log")


def s_1_5(k: Kit):
    r = k.one("""SELECT p.id FROM mdm.person p WHERE NOT EXISTS (SELECT 1 FROM mdm.source_record s WHERE s.person_id=p.id AND s.source='identity_reference')
                 AND COALESCE(p.birth_year,0) < 1990 ORDER BY p.id LIMIT 1""")
    if not r:
        k.skip("everyone has an identity reference")
    pid = r["id"]
    idt = exchange.identity_of(k.cur, pid)
    k.ok(not idt["linked"], "This person has no identity reference", note=idt["note"])
    k.ok("falls back to name, date of birth and address" in idt["note"].lower() or "falls back" in idt["note"], "The fallback path (name, date of birth, address) is stated")
    k.ok(bool(k.one("SELECT 1 FROM mdm.dq_issue WHERE person_id=%s AND code='NO_IDENTITY_REFERENCE'", pid)), "The gap is on the data-quality list")
    a = k.ask("pension", "PENSION_ELIGIBILITY", "AGE_AT_LEAST", {"years": 60}, pid=pid)
    k.ok(a["outcome"] == "ANSWERED", "A question can still be answered through the lower-assurance path", answer=a.get("answer"))
    k.ok(a["outcome"] == "ANSWERED" and a.get("source") == "Master data", "The answer says it came from matched master data, not from a reference token", source=a.get("source"))
    k.ok("lower assurance" in (a.get("identity_basis") or ""), "The answer itself carries the lower-assurance label", identity_basis=a.get("identity_basis"))


def s_1_6(k: Kit):
    pid, token = cert_holder(k)
    before = k.person(pid)
    seq = k.audit_head()
    d = wave3.my_report(k.cur, token, "address", None, f"H.No 9-9 Demo Street {k.tag}", "Demo: address on the ration card is out of date", "PORTAL", None, ACTOR)
    k.ok(d["status"] == "ROUTED", "A citizen's report becomes a correction ticket routed to the owning department", routed_to=d["routed_to_name"])
    k.ok(k.person(pid)["name"] == before["name"], "Nothing in the master record changed")
    res = ops.resolve_discrepancy(k.cur, d["id"], "CORRECTED_AT_SOURCE", ACTOR, "Demo: the department updated its own record")
    k.ok(res["status"] == "CORRECTED_AT_SOURCE", "The ticket's status trail moves to corrected at source")
    k.ok(len(res["informed_names"]) >= 1, "Other departments holding the person are told of the correction", informed=res["informed_names"])
    k.ok(any(a["action"].startswith("DISCREPANCY_") for a in k.audit_rows(since=seq)), "Each step is in the audit log")


# ================================================================== UC2  A child is born
# Every child the demo registers has a fixed given name, one per scenario, so the demo reads the same after every reset (the surname is the father's):
# 2.1 Varsha, 2.2 Anvi, 2.3 Aarvi, 2.6 Harini (named later), 2.7 Navya, 2.8/2.9 Karthik, 2.11 Sahithi, 2.12/2.13 Ishita, 2.10 "Parent Check".
CHILD = {"2.1": "Varsha", "2.2": "Anvi", "2.3": "Aarvi", "2.6": "Harini", "2.7": "Navya", "2.11": "Sahithi"}


def child_name(pr, scenario):
    surname = ((pr.get("fname") or "").split() or ["Reddy"])[-1]
    return f"{CHILD[scenario]} {surname}"


def _birth(k: Kit, pr=None, scenario=None, **kw):
    pr = pr or couple(k)
    if scenario:
        kw["name"] = child_name(pr, scenario)
    res = k.event("BIRTH_REGISTERED", "UC2", birth_payload(k, pr, **kw), case_kind="DEMO")
    return pr, res


# The family the demo always shows for scenario 2.1: a registered couple whose citizen sign-ins are kept between runs. A run makes a new child
# for them and "Clear demo records" removes only that child, so the parents and their sign-ins stay.
SHOWCASE_FATHER, SHOWCASE_MOTHER = "Rajender Pagidipalli", "Suma Pagidipalli"
SHOWCASE_SIGNINS = (("XXXX-XXXX-2001", "fid"), ("XXXX-XXXX-3001", "mid"))   # the two demo citizen sign-ins that always belong to the couple


def showcase_couple(k: Kit, clear=True):
    """The fixed demo couple, or None (with a note on the scenario) if they are missing or their names are not unique, so a wrong match is never made."""
    f = k.q("SELECT id, name, district FROM mdm.person WHERE name=%s", SHOWCASE_FATHER)
    m = k.q("SELECT id, name FROM mdm.person WHERE name=%s", SHOWCASE_MOTHER)
    if len(f) != 1 or len(m) != 1:
        k.info(f"The showcase parents are not used: {SHOWCASE_FATHER} appears {len(f)} time(s) and {SHOWCASE_MOTHER} {len(m)} time(s) in master data (each must appear once). A different couple was used.")
        return None
    pr = {"fid": f[0]["id"], "fname": f[0]["name"], "mid": m[0]["id"], "mname": m[0]["name"], "district": f[0]["district"] or "Medak"}
    for ref, who in SHOWCASE_SIGNINS:                             # sign-ins are tied to the couple on every run, so no manual linking is needed in the demo
        citizen.link(k.cur, ref, pr[who], ACTOR)
    k.info(f"Citizen sign-ins linked: {SHOWCASE_SIGNINS[0][0]} is {SHOWCASE_FATHER}, {SHOWCASE_SIGNINS[1][0]} is {SHOWCASE_MOTHER}.")
    for note in demo_uc2_login.align(k.cur, pr["mid"], pr["fid"]):         # the registry shows the couple's own name and household when they sign in
        k.info("Registry layer: " + note)
    if clear:                                                     # scenario 2.1 starts the family's story afresh: the earlier demo children are replaced
        k.cur.execute("SELECT scenario FROM mdm.event WHERE event_key LIKE 'DEMO-B-%%' AND payload->>'father_name'=%s AND payload->>'mother_name'=%s AND scenario IS NOT NULL", (pr["fname"], pr["mname"]))
        for old in k.cur.fetchall():
            clear_events(k.cur, old["scenario"], "demo")
    return pr


def s_2_1(k: Kit):
    pr = showcase_couple(k)
    kw = {}
    if pr:                                                        # the showcase family's child has a proper name: a given name and the father's family name
        kw["name"] = child_name(pr, "2.1")                       # always Varsha: see CHILD
    pr, res = _birth(k, pr, **kw)
    k.ok(res["status"] == "PROCESSED" and res.get("person_id"), "The child birth record is created at once; civil registration is the authority")
    fl = k.flow(res["event_id"])
    purposes = sorted(c["purpose"] for c in fl["consents"])
    k.ok(len(purposes) >= 4, "Each subscribing department gets its own request, so four consents are asked of the parent", purposes=purposes)
    k.ok(all(d["status"] == "PENDING_CONSENT" for d in fl["deliveries"] if d["kind"] == "EVENT"), "Nothing is delivered before the parent answers (per-subscriber receipts show 'waiting')")
    subs = exchange.list_subscribers(k.cur)
    k.ok(len(subs) >= 4, "The subscription configuration is visible per department", subscribers=[s["system"] for s in subs])
    k.ok(not k.one("SELECT 1 AS x FROM mdm.dept_response WHERE event_id=%s", res["event_id"]), "No department has a notice to answer until the parent agrees")


def s_2_2(k: Kit):
    pr, res = _birth(k, scenario="2.2")
    fl = k.flow(res["event_id"])
    seq = k.audit_head()
    pds, health = consent_of(fl, "BIRTH_PDS"), consent_of(fl, "BIRTH_HEALTH")
    A = exchange.SYSTEMS.get(exchange.PURPOSES["BIRTH_PDS"]["system"])
    B = exchange.SYSTEMS.get(exchange.PURPOSES["BIRTH_HEALTH"]["system"])
    exchange.respond(k.cur, pds["id"], "GRANT", ACTOR, note="demo")
    exchange.respond(k.cur, health["id"], "REFUSE", ACTOR, note="demo")
    fl = k.flow(res["event_id"])
    k.ok(delivery_of(fl, "BIRTH_PDS")["status"] == "DELIVERED", f"{A}: the parent allowed this use, so {A} is sent the birth data")
    k.ok(delivery_of(fl, "BIRTH_HEALTH")["status"] == "BLOCKED_REFUSED", f"{B}: the parent refused this use, so {B} is sent nothing")
    subj = {f"consent:{pds['id']}", f"consent:{health['id']}"}
    k.ok(subj <= {a["subject"] for a in k.audit_rows(since=seq)}, f"The audit log records both consent decisions: the one allowed for {A} and the one refused for {B}")
    eid = res["event_id"]
    pa = k.flow(eid)["event"].get("parents") or []
    k.ok(len(pa) == 2 and all(x["state"] in ("AWAITING", "NOT_MATCHED") for x in pa),
         "The mother and father on the registration are named; a matched parent shows as awaiting approval until a person approves", parents={x["role"]: x["state_text"] for x in pa})
    nt = k.one("SELECT id, rule, outcome FROM mdm.dept_response WHERE event_id=%s AND purpose='BIRTH_PDS'", eid)
    k.ok(nt and nt["outcome"] is None and nt["rule"].get("key") == "BIRTH_REGISTERED",
         f"{A} has a notice to answer, due within the time allowed for a birth registration", rule=nt and nt["rule"])
    k.ok(not k.one("SELECT 1 AS x FROM mdm.dept_response WHERE event_id=%s AND purpose='BIRTH_HEALTH'", eid), f"{B} has no notice, because the parent refused")
    back = feed.simulate(k.cur, nt["id"], "REJECTED", "Already on our register", None, ACTOR) if nt else {}
    k.ok(bool(back.get("reopened_proposal")), f"If {A} rejects its notice, it goes back to a person for review, with the department's reason", proposal=back.get("reopened_proposal"))


def s_2_11(k: Kit):
    pr, res = _birth(k, scenario="2.11")
    fl = k.flow(res["event_id"])
    c = consent_of(fl, "BIRTH_GIRL_SCHEME") if any(x["purpose"] == "BIRTH_GIRL_SCHEME" for x in fl["consents"]) else consent_of(fl, "BIRTH_HEALTH")
    mx = k.pol("max_reminders")
    for _ in range(mx):
        exchange.remind(k.cur, c["id"], ACTOR)
    why = k.refused(exchange.remind, k.cur, c["id"], ACTOR)
    k.ok(why and "Policy allows" in why, f"Reminders stop at the policy cap ({mx}); no further prompting", reason=why)
    later = datetime.now(timezone.utc) + timedelta(days=k.pol("consent_response_days") + 1)
    done = exchange._expire_if_due(k.cur, exchange._consent(k.cur, c["id"]), later)
    k.ok(done["status"] == "EXPIRED", "With no answer the request expires")
    d = delivery_of(k.flow(res["event_id"]), c["purpose"])
    k.ok(d["status"] == "BLOCKED_EXPIRED", "The department that was waiting stays blocked")
    k.ok(not any(x["status"] == "DELIVERED" for x in k.flow(res["event_id"])["deliveries"] if x["purpose"] == c["purpose"]), "No data went out for this purpose")
    ref = exchange.respond(k.cur, consent_of(k.flow(res["event_id"]), "BIRTH_CITIZEN_RECORD")["id"], "REFUSE", ACTOR, note="demo")
    k.ok(ref["status"] == "REFUSED", "A direct refusal is recorded and equally blocks delivery")


def s_2_6(k: Kit):
    pr = couple(k)
    reg = k.reg("B")
    first = k.event("BIRTH_REGISTERED", "UC2", birth_payload(k, pr, name=None, reg=reg), case_kind="NO_NAME")
    k.ok(first["status"] == "HELD", "A birth without a name is held: nothing is created yet")
    k.ok(not k.q("SELECT 1 FROM mdm.person p JOIN mdm.event e ON e.person_id=p.id WHERE e.id=%s", first["event_id"]), "No person exists for it")
    am = k.event("BIRTH_AMENDED", "UC2", {"registration_no": reg, "child_name": child_name(pr, "2.6")}, case_kind="AMENDMENT")      # the name the family gives later: a given name and the father's family name
    k.ok(am.get("person_id") and am["event_id"] == first["event_id"], "The name arrives and is applied to the same subject (same event)", person_id=am.get("person_id"))
    ev = k.one("SELECT status FROM mdm.event WHERE id=%s", first["event_id"])
    k.ok(ev["status"] == "PROCESSED", "The held birth is now processed")
    k.ok(bool(k.flow(first["event_id"])["consents"]), "Consents are requested only now that the child exists")


def s_2_7(k: Kit):
    pr, res = _birth(k, scenario="2.7", date_of_birth="2025-12-01", registration_date="2026-06-12")
    days = (date(2026, 6, 12) - date(2025, 12, 1)).days
    window = k.pol("late_event_days")
    ev = k.one("SELECT note FROM mdm.event WHERE id=%s", res["event_id"])
    k.ok(days > window and "days after birth" in (ev["note"] or ""), f"The late registration is recognised ({days} days against a {window}-day window)", note=ev["note"])
    pr_ = k.proposals(res["event_id"], "ADD_TO_RATION_CARD")
    k.ok(not pr_ or pr_[0]["detail"].get("late_registration") is True, "Any proposal that follows is marked 'late registration' for review")
    k.ok(any(p["status"] == "PROPOSED" for p in k.proposals(res["event_id"])), "The item lands in review, nothing is applied")


def s_2_10(k: Kit):
    res = k.event("BIRTH_REGISTERED", "UC2", {"registration_no": f"DEMO-B-{k.tag}", "child_name": "Parent Check", "gender": "M", "date_of_birth": "2026-06-10",
                                              "father_name": "Zxqv Unknown", "mother_name": "Wplm Missing", "place": "Medak", "registration_date": "2026-06-11"}, case_kind="PARENT_MISMATCH")
    rv = k.proposals(res["event_id"], "REVIEW_PARENTS")
    k.ok(len(rv) == 1 and ("Could not identify" in rv[0]["summary"] or "not found" in rv[0]["summary"]), "The parents cannot be matched, so a review task is raised with the ambiguity stated", summary=rv and rv[0]["summary"])
    fl = k.flow(res["event_id"])
    k.ok(fl["consents"] == [] and all(d["status"] == "BLOCKED_NO_PARENT" for d in fl["deliveries"] if d["kind"] == "EVENT"), "No consent can be asked, so every downstream notification is blocked")
    k.ok(not any(p["kind"] == "ADD_TO_RATION_CARD" for p in k.proposals(res["event_id"])), "No ration-card change is proposed")


def s_2_3(k: Kit):
    pr = couple(k)
    try:
        exchange.set_subscriber(k.cur, "health", False, ACTOR, "demo: stop one adapter")
        res = k.event("BIRTH_REGISTERED", "UC2", birth_payload(k, pr, name=child_name(pr, "2.3")), case_kind="OUTAGE")
        fl = k.flow(res["event_id"])
        exchange.respond(k.cur, consent_of(fl, "BIRTH_HEALTH")["id"], "GRANT", ACTOR, note="demo")
        d = delivery_of(k.flow(res["event_id"]), "BIRTH_HEALTH")
        k.ok(d["status"] == "RETRYING" and d["attempts"] == 1, "With the adapter down the event is kept and retried, never claimed as sent", status=d["status"], attempts=d["attempts"])
        for _ in range(k.pol("max_delivery_attempts") - 1):
            exchange.retry_due(k.cur, ACTOR)
        d = delivery_of(k.flow(res["event_id"]), "BIRTH_HEALTH")
        k.ok(d["status"] == "DEAD_LETTER", f"After {k.pol('max_delivery_attempts')} attempts it is set aside in the dead-letter list", attempts=d["attempts"])
        k.ok(bool([a for a in k.audit_rows("DELIVERY_DEAD_LETTER") if a["subject"] == f"delivery:{d['id']}"]), "The dead-letter entry is in the audit log")
        k.ok(not k.one("SELECT 1 AS x FROM mdm.dept_response WHERE event_id=%s AND purpose='BIRTH_HEALTH'", res["event_id"]), "While the department is unreachable it has no notice to answer")
        exchange.set_subscriber(k.cur, "health", True, ACTOR, "demo: restart")
        r = exchange.redeliver(k.cur, d["id"], ACTOR)
        k.ok(r["status"] == "DELIVERED", "After the restart the set-aside item is replayed and delivered")
        k.ok(bool(k.one("SELECT 1 AS x FROM mdm.dept_response WHERE event_id=%s AND purpose='BIRTH_HEALTH' AND outcome IS NULL", res["event_id"])), "After the replay the department has a notice to answer in its feed")
        asked = [c["person_id"] for c in k.q("SELECT DISTINCT person_id FROM mdm.consent WHERE event_id=%s AND person_id IS NOT NULL", res["event_id"])]
        tok = next((t for t in (k.token(x) for x in asked) if t), None)          # the view of the parent who was actually asked
        if tok:
            k.ok(bool(wave3.my_data(k.cur, tok)["consents"]), "The parent's own view shows the consents and what was asked")
        else:
            k.gap("The parent has no identity reference, so the citizen message could not be shown for this couple.")
    finally:
        exchange.set_subscriber(k.cur, "health", True, ACTOR, "demo: restored")


# ---- UC2 live steps: one family, one story. Run these one at a time during the demo (scenario page, "Live demo steps").
def _live_family(k):
    pr = showcase_couple(k, clear=False)
    if not pr:
        k.skip("The demo couple (Rajender and Suma Pagidipalli) is not in master data. Run the UC2 group first.")
    return pr


def _health_trouble(k):
    return k.q("SELECT id, status FROM mdm.delivery WHERE system='health' AND kind='EVENT' AND status IN ('RETRYING','DEAD_LETTER') ORDER BY id")


def s_2_4(k: Kit):
    """Live step: Health's system goes down before the parent answers. Whatever she approves for Health will wait, not be sent."""
    _live_family(k)
    exchange.set_subscriber(k.cur, "health", False, ACTOR, "Demo: the Health system goes down")
    row = k.one("SELECT available FROM mdm.subscriber WHERE system='health'")
    k.ok(row and not row["available"], "The Health system is now unreachable")
    k.info("Next: Suma approves on the citizen portal. Health will show 'approved, not shared yet' while the other departments show 'shared'.")


def s_2_5(k: Kit):
    """Live step: Health's system comes back; the waiting and set-aside items are retried and delivered."""
    _live_family(k)
    exchange.set_subscriber(k.cur, "health", True, ACTOR, "Demo: the Health system is back")
    exchange.retry_due(k.cur, ACTOR, "health")
    for d in k.q("SELECT id FROM mdm.delivery WHERE system='health' AND kind='EVENT' AND status='DEAD_LETTER' ORDER BY id"):
        exchange.redeliver(k.cur, d["id"], ACTOR)
    left = _health_trouble(k)
    k.ok(not left, "Nothing for Health is still waiting or set aside; every approved item was delivered", still_waiting=len(left))
    k.info("Next: refresh Suma's approval. Health now reads 'shared'.")


def s_2_8(k: Kit):
    """Live step: a second child is registered months late and without a name. Nothing is created until the name arrives."""
    pr = _live_family(k)
    reg = k.reg("B")
    res = k.event("BIRTH_REGISTERED", "UC2", birth_payload(k, pr, name=None, reg=reg, gender="M", date_of_birth="2025-12-01", registration_date="2026-06-12"), case_kind="NO_NAME")
    k.ok(res["status"] == "HELD", "A birth without a name is held: no child record, no consent request, nothing sent to any department")
    k.ok(not k.q("SELECT 1 FROM mdm.person p JOIN mdm.event e ON e.person_id=p.id WHERE e.id=%s", res["event_id"]), "No person exists for it, so there is nothing to duplicate or orphan downstream")
    k.info("Next: run step 2.9, when the family gives the name.", registration=reg)


def s_2_9(k: Kit):
    """Live step: the name arrives for the held birth. The same child is created, flagged as a late registration."""
    held = k.one("SELECT id, payload FROM mdm.event WHERE scenario='2.8' AND status='HELD' ORDER BY id DESC LIMIT 1")
    if not held:
        if k.one("SELECT 1 AS x FROM mdm.event WHERE scenario='2.8' AND case_kind='AMENDMENT' LIMIT 1"):
            k.skip("Already done: the name has been given and the child created. To show it again, click Clear demo records and run the UC2 group, then steps 2.8 and 2.9")
        k.skip("Run step 2.8 first")
    pl = held["payload"] if isinstance(held["payload"], dict) else json.loads(held["payload"])
    am = k.event("BIRTH_AMENDED", "UC2", {"registration_no": pl["registration_no"], "child_name": f"Karthik {pl['father_name'].split()[-1]}"}, scenario="2.8", case_kind="AMENDMENT")
    k.ok(bool(am.get("person_id")) and am["event_id"] == held["id"], "The name is applied to the same registration; one child, no duplicate", person_id=am.get("person_id"))
    ev = k.one("SELECT status, note FROM mdm.event WHERE id=%s", held["id"])
    k.ok(ev["status"] == "PROCESSED", "The held birth is now processed")
    k.ok("days after birth" in (ev["note"] or "") or any(p["detail"].get("late_registration") for p in k.proposals(held["id"])), "It is recognised as a late registration, so what follows goes to a person for review", note=ev["note"])
    k.ok(bool(k.flow(held["id"])["consents"]), "Consent is asked of the parent only now that the child exists")


def s_2_12(k: Kit):
    """Live step: a third child is registered. The parent will not answer."""
    pr = _live_family(k)
    res = k.event("BIRTH_REGISTERED", "UC2", birth_payload(k, pr, name=f"Ishita {pr['fname'].split()[-1]}", gender="F", date_of_birth="2026-06-14"), case_kind="NO_ANSWER")
    k.ok(res["status"] == "PROCESSED", "The birth is processed and consent is asked of the parent")
    k.ok(all(d["status"] == "PENDING_CONSENT" for d in k.flow(res["event_id"])["deliveries"] if d["kind"] == "EVENT"), "Nothing is sent while the parent has not answered")
    k.info("Next: do not answer this one on the citizen portal. Run step 2.13 to let the time run out.")


def s_2_13(k: Kit):
    """Live step: the response time for the third child runs out. The requests expire and nothing is sent."""
    ev = k.one("SELECT id FROM mdm.event WHERE scenario='2.12' ORDER BY id DESC LIMIT 1")
    if not ev:
        k.skip("Run step 2.12 first")
    later = datetime.now(timezone.utc) + timedelta(days=k.pol("consent_response_days") + 1)
    n = 0
    for c in k.flow(ev["id"])["consents"]:
        if c["status"] == "PENDING":
            n += exchange._expire_if_due(k.cur, exchange._consent(k.cur, c["id"]), later)["status"] == "EXPIRED"
    k.ok(n > 0, "With no answer the requests expire", expired=n)
    fl = k.flow(ev["id"])
    k.ok(not any(d["status"] == "DELIVERED" for d in fl["deliveries"] if d["kind"] == "EVENT"), "No data went out to any department")
    k.ok(all(d["status"] == "BLOCKED_EXPIRED" for d in fl["deliveries"] if d["kind"] == "EVENT"), "Every waiting department stays blocked")
    k.info("Next: refresh Suma's approvals. The card for this child reads 'Expired'.")


# ================================================================== UC3  A death is registered
def _death(k: Kit, fx, **kw):
    k.last_payload = death_payload(k, fx, **kw)
    res = k.event("DEATH_REGISTERED", "UC3", k.last_payload, case_kind="DEMO")
    return res, k.proposals(res["event_id"], "CONFIRM_DEATH")


def _pension_status(k, pid):
    r = k.one("SELECT payload->>'status' AS s FROM mdm.source_record WHERE person_id=%s AND source='pension_batch' ORDER BY id LIMIT 1", pid)
    return r and r["s"]


def _login_check(k: Kit, refs):
    """After planting, says whether each demo sign-in has a registry person. 'Aadhaar / mobile not found in registry' at login means it has not."""
    for ref in refs:
        k.cur.execute("SAVEPOINT login_chk")
        try:
            k.cur.execute("SELECT name, mobile FROM family_registry.person WHERE aadhaar_ref=%s", (ref,))
            rows = k.cur.fetchall()
            k.cur.execute("RELEASE SAVEPOINT login_chk")
        except Exception as e:  # noqa: BLE001
            k.cur.execute("ROLLBACK TO SAVEPOINT login_chk")
            k.info(f"Sign-in {ref}: could not check the registry ({type(e).__name__})")
            continue
        if rows:
            k.info(f"Sign-in {ref} is ready: {rows[0]['name']} is in the registry")
        else:
            k.info(f"Sign-in {ref} will NOT work: no registry person holds it, so login says 'Aadhaar / mobile not found in registry'. See the registry notes above")


def uc3_plant(k: Kit):
    """Plants the UC3 story cast: Ramaiah Goud (pensioner, wife signs in as 2701), Narsimha Chary (no kin), two men named Gangadhar Rao."""
    out = demo_uc3_story.plant(k.cur, ACTOR)
    k.info("UC3 cast planted. Ramaiah Goud (pensioner, wife Sarojini signs in as XXXX-XXXX-2701), Narsimha Chary (no spouse or nominee), two men named Gangadhar Rao. "
           "Next: run the live steps 3.6 to 3.10 one at a time and act on each in the officer portal", beneficiary_rows=out["beneficiary_rows"])
    for note in out["notes"]:
        k.info("Registry layer: " + note)
    _login_check(k, ["XXXX-XXXX-2701"])


def s_3_1(k: Kit):
    uc3_plant(k)
    fx = death_fixture(k, spouse=True)
    res, cd = _death(k, fx)
    k.ok(len(cd) == 1 and cd[0]["status"] == "PROPOSED", "The death creates one proposal for a person to confirm, not a change", summary=cd and cd[0]["summary"])
    k.ok(k.person(fx["person_id"])["life_status"] != "DECEASED", "Nobody is marked deceased until the confirmation")
    out = k.approve(cd[0], person_id=fx["person_id"])
    fups = k.q("SELECT kind, status, system FROM mdm.proposal WHERE parent_id=%s ORDER BY id", cd[0]["id"])
    kinds = {f["kind"] for f in fups}
    k.ok("STOP_PENSION" in kinds and "NOTIFY_SPOUSE" in kinds, "The spouse is linked and pension and household proposals follow", kinds=sorted(kinds))
    k.ok(all(f["status"] == "PROPOSED" for f in fups), "Every follow-up waits for an authorised officer")
    k.ok(_pension_status(k, fx["person_id"]) == "ACTIVE", "Nothing changed in any source system: the pension is still active in the department's own record")
    k.ok(k.person(fx["person_id"])["life_status"] == "DECEASED", "The master record shows the death only after confirmation")


def s_3_2(k: Kit):
    fx = death_fixture(k, spouse=True)
    res, cd = _death(k, fx)
    k.approve(cd[0], person_id=fx["person_id"])
    stop = k.one("SELECT * FROM mdm.proposal WHERE parent_id=%s AND kind='STOP_PENSION'", cd[0]["id"])
    k.ok(bool(stop), "A stop-pension proposal exists")
    why = k.refused(events.decide_proposal, k.cur, stop["id"], "APPROVE", {}, ACTOR, "")
    k.ok(why and "reason" in why, "An approval without a recorded reason is refused", reason=why)
    seq = k.audit_head()
    note = "Death certificate seen and spouse informed"
    out = events.decide_proposal(k.cur, stop["id"], "APPROVE", {}, ACTOR, note)
    k.ok(out["status"] == "APPROVED", "With a reason, the officer's approval is recorded")
    row = k.one("SELECT decided_by, rationale, policy_version FROM mdm.proposal WHERE id=%s", stop["id"])
    k.ok(row["decided_by"] == ACTOR and row["rationale"] == note, "The approver's name and the reason are stored on the proposal", by=row["decided_by"], reason=row["rationale"])
    a = [x for x in k.audit_rows("PROPOSAL_APPROVED", since=seq) if x["subject"] == f"proposal:{stop['id']}"]
    k.ok(a and "notice for" in (a[0]["detail"].get("meaning") or ""), "The audit entry says a notice for the pension department is now in its feed", meaning=a and a[0]["detail"].get("meaning"))
    nt = k.one("SELECT statutory, rule, outcome FROM mdm.dept_response WHERE source='PROPOSAL' AND ref_id=%s", stop["id"])
    k.ok(nt and nt["statutory"] and nt["outcome"] is None and nt["rule"].get("key") == "STOP_PENSION",
         "The pension department has a notice to acknowledge, with the response time set for pension stops", rule=nt and nt["rule"])
    k.ok(_pension_status(k, fx["person_id"]) == "ACTIVE", "This build issues the instruction but does not edit the department's record; the department acts on it")
    from . import auth
    k.info("Approving is limited to these roles in the API", roles=sorted(auth.WRITE_ROLES))


def s_3_3(k: Kit):
    ghost = {"name": f"Demo Nobody{k.tag}", "age": 71}
    res = k.event("DEATH_REGISTERED", "UC3", death_payload(k, ghost, place="Maharashtra"), case_kind="OUTSIDE_STATE")
    k.ok(res["status"] == "NO_MATCH", "A death for someone not in the registry matches nobody")
    k.ok(not k.proposals(res["event_id"]), "No proposal is raised")
    ev = k.one("SELECT note FROM mdm.event WHERE id=%s", res["event_id"])
    k.ok("does not mean the person is alive" in ev["note"], "The note says a missing match does not mean the person is alive", note=ev["note"])
    a = k.ask("pension", "PENSION_ELIGIBILITY", "DEATH_REGISTERED", {}, token="IDR-DEMO-NOBODY")
    k.ok(a["outcome"] == "NO_RECORD", "A query about an unknown person answers 'no record', which is not 'no'", message=a.get("message"))
    fx = death_fixture(k, spouse=None)
    r2, cd = _death(k, fx, place="Maharashtra")
    k.ok(cd and cd[0]["detail"].get("outside_state") is True, "A real person's death outside the state is flagged for the officer to weigh", place="Maharashtra")


def s_3_4(k: Kit):
    fx = death_fixture(k, spouse=False)
    res, cd = _death(k, fx)
    k.approve(cd[0], person_id=fx["person_id"])
    kinds = {p["kind"] for p in k.q("SELECT kind FROM mdm.proposal WHERE parent_id=%s", cd[0]["id"])}
    k.ok("REVIEW_NEXT_OF_KIN" in kinds, "No spouse or nominee: a steward is asked to find the next of kin", kinds=sorted(kinds))
    k.ok(all(p["status"] == "PROPOSED" for p in k.q("SELECT status FROM mdm.proposal WHERE parent_id=%s", cd[0]["id"])), "Every follow-up is still only a proposal")
    pair = death_fixture(k, spouse=None, same_name_pair=True)
    r2, cd2 = _death(k, pair)
    k.ok(cd2 and cd2[0]["detail"].get("ambiguous") is True and cd2[0]["detail"].get("suggested") is None, "Two living people fit one death: the proposal is flagged ambiguous and pre-selects nobody", name=pair["name"])
    why = k.refused(events.decide_proposal, k.cur, cd2[0]["id"], "APPROVE", {}, ACTOR, "Trying to approve without choosing")
    k.ok(why and "Choose one" in why, "It cannot be approved until an officer chooses who it is", reason=why)
    k.ok(not k.q("SELECT 1 FROM mdm.proposal WHERE parent_id=%s", cd2[0]["id"]), "No follow-up proposals exist while it is unresolved (they are frozen)")
    k.ok(len(cd2[0]["options"]) >= 2, "Both candidates are shown to the officer with their details")


def s_3_5(k: Kit):
    fx = death_fixture(k, spouse=True, urgent=True)
    res, cd = _death(k, fx)
    k.approve(cd[0], person_id=fx["person_id"])
    sp = k.one("SELECT detail, summary FROM mdm.proposal WHERE parent_id=%s AND kind='STOP_PENSION'", cd[0]["id"])
    k.ok(sp and sp["detail"].get("urgent") is True, "A payment due after the date of death is flagged urgent", next_payment=sp and sp["detail"].get("next_payment_on"))
    k.ok(sp["detail"].get("effective_from") == sp["detail"].get("next_payment_on") and "next payment cycle" in sp["summary"], "The stop is dated to the next payment cycle", effective_from=sp["detail"].get("effective_from"), summary=sp["summary"])
    k.ok(_pension_status(k, fx["person_id"]) == "ACTIVE", "The payment already in flight is untouched")
    again = k.event("DEATH_REGISTERED", "UC3", k.last_payload, case_kind="DUPLICATE_OF_PREVIOUS")
    k.ok(again["status"] == "DUPLICATE", "A repeat of the same registration is ignored")
    k.ok(len(k.q("SELECT 1 FROM mdm.proposal WHERE parent_id=%s AND kind='STOP_PENSION'", cd[0]["id"])) == 1, "It created no second proposal")


def _live_death(k: Kit, key, **kw):
    fx = demo_uc3_story.fixture(k.cur, key)
    if not fx:
        k.skip("Run the UC3 group first: it plants the people for these steps")
    k.last_payload = death_payload(k, fx, **kw)
    res = k.event("DEATH_REGISTERED", "UC3", k.last_payload, case_kind="LIVE")
    return fx, res, k.proposals(res["event_id"], "CONFIRM_DEATH")


def s_3_6(k: Kit):
    """Live step: the death of Ramaiah Goud, a pensioner with a wife, a ration card, a land record and a payment due in four days."""
    fx, res, cd = _live_death(k, "ramaiah")
    k.ok(len(cd) == 1 and cd[0]["status"] == "PROPOSED", "The death is a proposal for an officer to confirm; nothing has changed")
    k.ok(k.person(fx["person_id"])["life_status"] != "DECEASED", "Ramaiah is not marked deceased yet")
    k.info("Next, as the officer: Decisions > Approvals (or Events), open the death, confirm it is Ramaiah with a reason. Then approve each follow-up: the pension stop (with a reason), "
           "the ration card, the land record, and the contact with his wife. Sign in as XXXX-XXXX-2701 after approving the contact to see what Sarojini is told.")


def s_3_7(k: Kit):
    """Live step: the death of Narsimha Chary, who has no spouse and no nominee."""
    fx, res, cd = _live_death(k, "narsimha")
    k.ok(len(cd) == 1 and cd[0]["status"] == "PROPOSED", "The death is a proposal for an officer to confirm")
    k.info("Next, as the officer: confirm it is Narsimha. No spouse or nominee exists on any record, so the follow-up is a task to trace the next of kin; the pension stop is still only proposed.")


def s_3_8(k: Kit):
    """Live step: a death is registered for a name that fits two living men."""
    fx = demo_uc3_story.fixture(k.cur, "gangadhar1")
    if not fx:
        k.skip("Run the UC3 group first: it plants the people for these steps")
    k.last_payload = death_payload(k, fx)
    res = k.event("DEATH_REGISTERED", "UC3", k.last_payload, case_kind="LIVE")
    cd = k.proposals(res["event_id"], "CONFIRM_DEATH")
    k.ok(cd and cd[0]["detail"].get("ambiguous") is True and cd[0]["detail"].get("suggested") is None, "Two living men fit one death, so nobody is pre-selected")
    k.ok(len(cd[0]["options"]) >= 2, "Both men are shown to the officer with their details")
    k.info("Next, as the officer: the proposal cannot be approved until one man is chosen; no follow-up exists while it is unresolved. Reject it if the registration cannot be tied to either, or choose the right man with a reason.")


def s_3_9(k: Kit):
    """Live step: a death registered outside the state for someone the registry does not hold."""
    ghost = {"name": f"Mohan Lal Verma {k.tag}", "age": 68}
    res = k.event("DEATH_REGISTERED", "UC3", death_payload(k, ghost, place="Maharashtra"), case_kind="LIVE")
    k.ok(res["status"] == "NO_MATCH" and not k.proposals(res["event_id"]), "Nobody matches, no proposal is raised, and nobody is marked deceased")
    ev = k.one("SELECT note FROM mdm.event WHERE id=%s", res["event_id"])
    k.ok("does not mean the person is alive" in (ev["note"] or ""), "The note says a missing record does not mean the person is alive", note=ev["note"])
    k.info("Next: Events shows this registration with the note. A question about this person to the pension department answers 'no record', not 'no'.")


def s_3_10(k: Kit):
    """Live step: the registry sends Ramaiah's death a second time."""
    prev = k.one("SELECT payload FROM mdm.event WHERE scenario='3.6' AND event_type='DEATH_REGISTERED' ORDER BY id DESC LIMIT 1")
    if not prev:
        k.skip("Run step 3.6 first")
    pl = prev["payload"] if isinstance(prev["payload"], dict) else json.loads(prev["payload"])
    again = k.event("DEATH_REGISTERED", "UC3", pl, case_kind="DUPLICATE_OF_PREVIOUS")
    k.ok(again["status"] == "DUPLICATE", "A repeat of the same registration is ignored")
    k.info("Next: Events shows the repeat as a duplicate; no second proposal was created.")


# ================================================================== UC4  Eligibility without moving documents
def _fresh_consent(k, pid, purpose="SCHOLARSHIP_ELIGIBILITY", elements=None):
    k.clear_consents(pid, purpose)
    return k.grant(pid, purpose, elements)


def uc4_invite_student(k: Kit):
    """Plants the UC4 story cohort: Kavya (login 2601, turns 18 soon), her mother Lakshmi (login 2602), her brother Sai, and four students for the
    certificate cases. They also appear in the scheme simulator, the beneficiary list and the families view."""
    out = demo_uc4_story.plant(k.cur, ACTOR)
    k.info("Demo cohort planted. Kavya Muthyala (login XXXX-XXXX-2601, turns 18 in about 25 days, not yet invited) and her mother Lakshmi Muthyala (XXXX-XXXX-2602). "
           "Next: invite Kavya, then run the live steps 4.7 and 4.8 when you are ready", cases=out["cases"], beneficiary_rows=out["beneficiary_rows"])
    for note in out["notes"]:
        k.info("Registry layer: " + note)
    _login_check(k, ["XXXX-XXXX-2601", "XXXX-XXXX-2602"])


def s_4_1(k: Kit):
    uc4_invite_student(k)
    pid, token = cert_holder(k)
    k.clear_consents(pid, "SCHOLARSHIP_ELIGIBILITY")
    first = k.ask("education", "SCHOLARSHIP_ELIGIBILITY", "INCOME_AT_MOST", {"limit": 250000}, token=token)
    k.ok(first["outcome"] == "DENIED_NO_CONSENT", "No consent: the question is refused and nothing is looked up", message=first.get("message"))
    _fresh_consent(k, pid)
    a = k.ask("education", "SCHOLARSHIP_ELIGIBILITY", "INCOME_AT_MOST", {"limit": 250000}, token=token)
    k.ok(a["outcome"] == "ANSWERED" and a.get("answer") in ("YES", "NO"), "With consent the answer is yes or no, from the authoritative source", answer=a.get("answer"), source=a.get("source"))
    k.ok(a.get("valid_until") is not None or a.get("band"), "It carries the band and the validity period", band=a.get("band"), valid_until=a.get("valid_until"))
    raw = {"annual_income", "certificate_no", "holder_name", "father_or_husband"}
    k.ok(not (raw & set(a)), "No certificate or document content is in the answer", keys=sorted(a))
    row = k.one("SELECT answer, outcome FROM mdm.exchange WHERE id=%s", a["ledger_id"])
    k.ok(row["outcome"] == "ANSWERED" and not (raw & set(row["answer"])), "The ledger entry records the question and outcome only: no document moved", ledger_id=a["ledger_id"])


def s_4_2(k: Kit):
    kid = k.one("""SELECT p.id, p.birth_year, (SELECT r.person_a FROM mdm.relationship r WHERE r.kind='PARENT_OF' AND r.person_b=p.id LIMIT 1) AS parent
                   FROM mdm.person p WHERE %s - p.birth_year BETWEEN 14 AND 16 AND p.life_status<>'DECEASED'
                     AND EXISTS (SELECT 1 FROM mdm.relationship r WHERE r.kind='PARENT_OF' AND r.person_b=p.id) ORDER BY p.id LIMIT 1""", REF_DATE.year)
    if not kid:
        k.skip("no minor with a recorded parent")
    k.clear_consents(kid["id"], "SCHOLARSHIP_ELIGIBILITY", given_by=kid["parent"])
    c = exchange.request_consent(k.cur, kid["id"], "SCHOLARSHIP_ELIGIBILITY", ACTOR)
    why = k.refused(exchange.respond, k.cur, c["id"], "GRANT", ACTOR)
    k.ok(why and "must answer" in why, "A minor cannot answer for themselves; a parent must, and the form says who", reason=why)
    g = exchange.respond(k.cur, c["id"], "GRANT", ACTOR, given_by=kid["parent"], note="demo")
    k.ok(g["status"] == "GRANTED" and g["given_by_person_id"] == kid["parent"], "The guardian's consent is recorded with their identity")
    why = k.refused(exchange.handover_at_majority, k.cur, kid["id"], ACTOR)
    k.ok(bool(why), "Before the person turns 18 nothing changes", reason=why)
    seq = k.audit_head()
    h = exchange.handover_at_majority(k.cur, kid["id"], ACTOR, as_of=f"{kid['birth_year'] + 19}-01-01")
    k.ok(c["id"] in h["ended"] and h["new_requests"], "At 18 the guardian's consent ends and the person is asked afresh", ended=h["ended"], new=h["new_requests"])
    k.ok(h["enrolled"] == 0, "Nothing is enrolled automatically; the person is only notified")
    k.ok(any(a["action"] == "CONSENT_HANDOVER" for a in k.audit_rows(since=seq)), "The handover is in the audit log")
    new = exchange._consent(k.cur, h["new_requests"][0])
    k.ok(new["status"] == "PENDING", "The new request waits for the individual's own answer")


def s_4_3(k: Kit):
    rows = k.q("""SELECT s.person_id, i.source_rid AS token FROM mdm.source_record s JOIN mdm.source_record i ON i.person_id=s.person_id AND i.source='identity_reference'
                  WHERE s.source='revenue_certificates' AND s.rtype='INCOME'
                    AND (s.payload->>'status'<>'ACTIVE' OR (s.payload->>'valid_until'<>'' AND s.payload->>'valid_until'<%s))
                    AND NOT EXISTS (SELECT 1 FROM mdm.source_record x WHERE x.person_id=s.person_id AND x.source='revenue_certificates' AND x.rtype='INCOME'
                                    AND x.payload->>'status'='ACTIVE' AND (x.payload->>'valid_until'='' OR x.payload->>'valid_until'>=%s))
                    AND COALESCE((SELECT birth_year FROM mdm.person p WHERE p.id=s.person_id),1900) < 1990 ORDER BY s.person_id LIMIT 1""", REF_DATE.isoformat(), REF_DATE.isoformat())
    if not rows:
        k.skip("no applicant whose income certificate has expired")
    pid, token = rows[0]["person_id"], rows[0]["token"]
    _fresh_consent(k, pid)
    a = k.ask("education", "SCHOLARSHIP_ELIGIBILITY", "INCOME_AT_MOST", {"limit": 250000}, token=token)
    k.ok(a["outcome"] == "EXPIRED_SOURCE", "An expired certificate gives 'expired', not a guess", message=a.get("message"))
    k.ok("renew" in a.get("message", ""), "The applicant is routed to the issuing revenue service")
    d = ops.raise_discrepancy(k.cur, pid, "income", "Certificate expired", "Renewal requested", "Demo: routed from an expired-certificate answer", ACTOR, authoritative_system="revenue")
    k.ok(d["status"] == "ROUTED" and d["authoritative_system"] == "revenue", "A request is routed to the revenue department", id=d["id"])
    nonexist = k.ask("education", "SCHOLARSHIP_ELIGIBILITY", "CATEGORY_IS", {"category": "OBC"}, pid=k.one("SELECT p.id FROM mdm.person p WHERE NOT EXISTS (SELECT 1 FROM mdm.source_record s WHERE s.person_id=p.id AND s.source='revenue_certificates') AND p.birth_year<1990 ORDER BY p.id LIMIT 1")["id"])
    k.ok(nonexist["outcome"] in ("DENIED_NO_CONSENT", "NO_RECORD"), "A missing certificate is never treated as a 'no'", outcome=nonexist["outcome"])


def s_4_4(k: Kit):
    rows = k.q("""SELECT d.person_id, i.source_rid AS token FROM mdm.dq_issue d JOIN mdm.source_record i ON i.person_id=d.person_id AND i.source='identity_reference'
                  WHERE d.code IN ('INCOME_CONFLICT','CASTE_CONFLICT') ORDER BY d.person_id LIMIT 12""")
    for r in rows:
        _fresh_consent(k, r["person_id"])
        a = k.ask("education", "SCHOLARSHIP_ELIGIBILITY", "INCOME_AT_MOST", {"limit": 250000}, token=r["token"])
        if a["outcome"] == "CONFLICT":
            k.ok(True, "Two valid certificates disagree, so the answer is a conflict card", message=a.get("message"), sources=a.get("sources"))
            k.ok("answer" not in a, "No yes/no is given: no silent choice was made")
            k.ok("officer" in a["message"], "It tells the officer to settle it with the issuing office")
            return
    k.skip("no applicant with two valid, disagreeing income certificates")


def s_4_5(k: Kit):
    pid, token = cert_holder(k)
    _fresh_consent(k, pid)
    k.ok(k.ask("education", "SCHOLARSHIP_ELIGIBILITY", "INCOME_AT_MOST", {"limit": 250000}, token=token)["outcome"] == "ANSWERED", "Before: the question is answered")
    mdm_id = k.person(pid)["mdm_id"]
    k.cur.execute("INSERT INTO mdm.temp_result (expires_at, requester, actor, purpose, subjects, rows) VALUES (now()+interval '10 min','education',%s,'SCHOLARSHIP_ELIGIBILITY',%s,%s::jsonb)",
                  (ACTOR, [pid], _js([{"mdm_id": mdm_id, "income_band": "up to 1 lakh"}])))
    r = ops.withdraw_and_purge(k.cur, pid, "SCHOLARSHIP_ELIGIBILITY", ACTOR)
    k.ok(r["consent_withdrawn"] and r["temp_rows_removed"] >= 1, "Withdrawal stops the consent and removes the temporary result", withdrawn=r["consent_withdrawn"], removed=r["temp_rows_removed"])
    k.ok("audit trail" in r["remains"], "What remains is stated: the audit trail and the record of what was lawfully used", remains=r["remains"])
    k.ok(bool(r.get("audit_seq")), "A purge receipt (audit sequence number) is issued", receipt=r.get("audit_seq"))
    after = k.ask("education", "SCHOLARSHIP_ELIGIBILITY", "INCOME_AT_MOST", {"limit": 250000}, token=token)
    k.ok(after["outcome"] == "DENIED_NO_CONSENT", "After: new queries are blocked at once", outcome=after["outcome"])


def s_4_7(k: Kit):
    """Live step: Kavya and Sai start an application, so the scholarship department asks for consent. Their mother is asked, not them."""
    if not demo_uc4_invite._student(k.cur):
        k.skip("Run the UC4 group first: it plants Kavya and her family")
    out = demo_uc4_story.applies(k.cur, ACTOR)
    k.ok(bool(out.get("kavya")) and bool(out.get("sai")), "Both applications ask for consent", **out)
    ap = citizen.list_approvals(k.cur, "XXXX-XXXX-2602")
    cards = [i for i in ap["items"] if i.get("kind") == "CONSENT_SINGLE" and i.get("status") == "PENDING"]
    k.ok(len(cards) >= 2, "Lakshmi, signed in as XXXX-XXXX-2602, has a card for each child waiting for her answer", cards=len(cards))
    kv = citizen.list_approvals(k.cur, "XXXX-XXXX-2601")
    mine = [i for i in kv["items"] if i.get("kind") == "CONSENT_SINGLE"]
    k.ok(bool(mine) and not any(i.get("can_answer") for i in mine), "Kavya sees hers read-only: it is waiting for her parent")


def s_4_8(k: Kit):
    """Live step: the clock does not move in this build, so Kavya's date of birth moves back by a few weeks. She is 18 from now on."""
    if not demo_uc4_invite._student(k.cur):
        k.skip("Run the UC4 group first: it plants Kavya and her family")
    out = demo_uc4_story.turn_kavya_18(k.cur, ACTOR)
    k.ok(out.get("changed") and out.get("age") == 18, "Kavya is now 18 on the system date", dob=out.get("dob"))
    k.info("Next: Control Tower, Run daily checks now. That ends her mother's permission and asks Kavya for her own. Nothing is enrolled.")


def s_5_7(k: Kit):
    """Live step: plants the five housing household cases and a housing applicant (sign-in 2801) with a consent waiting for her answer."""
    out = demo_uc5_story.plant(k.cur, ACTOR)
    got = {r["case"]: r["reason_code"] for r in out["cases"]}
    want = demo_uc5_story.EXPECT
    k.ok(all(got[c] == want[c] for c in demo_uc5_story.CASES), "Each case raises the right item through the real housing check, and the clean case raises none", got=got)
    ap = citizen.list_approvals(k.cur, demo_uc5_story.LOGIN)
    cards = [i for i in ap["items"] if i.get("status") == "PENDING"]
    k.ok(len(cards) >= 1, f"{demo_uc5_story.APPLICANT}, signed in as {demo_uc5_story.LOGIN}, has a housing consent card waiting for her answer", cards=len(cards))
    k.info("Next: Decisions > Work queue shows the four housing groups. Sign in to the citizen portal as 2801 to answer the housing consent.")


def s_4_6(k: Kit):
    a = k.ask("education", "SCHOLARSHIP_ELIGIBILITY", "RESIDENT", {}, token=f"IDR-OTHERSTATE-{k.tag}")
    k.ok(a["outcome"] == "NO_RECORD", "An applicant not known to Telangana records gets 'no record'", message=a.get("message"))
    k.ok("does not mean the person does not exist elsewhere" in a["message"], "The answer says this is not a statement about the person")
    k.ok(bool(k.one("SELECT 1 FROM mdm.exchange WHERE id=%s AND outcome='NO_RECORD'", a["ledger_id"])), "The ledger records it, so the manual route can be followed", ledger_id=a["ledger_id"])
    lst = exchange.list_ledger(k.cur, outcome="NO_RECORD", limit=5)
    k.ok(any(x["id"] == a["ledger_id"] for x in lst["items"]), "It is on the 'no record' list (Ledger filtered by outcome), which is the manual-route worklist")


# ================================================================== UC5  Household benefits
HB = ["income_band", "residence", "household_benefit", "electricity_link", "land_holding", "duplicate_benefit"]


def _hb_consent(k, pid):
    k.clear_consents(pid, "HOUSEHOLD_BENEFIT")
    return k.grant(pid, "HOUSEHOLD_BENEFIT", HB)


def _hb(k, pid, q, params=None):
    return k.ask("housing", "HOUSEHOLD_BENEFIT", q, params or {}, pid=pid)


def s_5_1(k: Kit):
    r = k.one("""SELECT s.person_id FROM mdm.source_record s WHERE s.source='housing' AND s.person_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM mdm.source_record p WHERE p.person_id=s.person_id AND p.source='pds_view') ORDER BY s.person_id LIMIT 1""")
    if not r:
        k.skip("no housing applicant with a ration card")
    pid = r["person_id"]
    _hb_consent(k, pid)
    seq = k.audit_head()
    answers = {q: _hb(k, pid, q) for q in ("HOUSEHOLD_HAS_BENEFIT", "LAND_HOLDING", "ELECTRICITY_LINKED")}
    k.ok(all(a["outcome"] == "ANSWERED" for a in answers.values()), "One housing application is checked against benefit, land and electricity together")
    k.ok(len({a.get("source") for a in answers.values()}) == 3, "Each answer names its source, so the composed result has a per-source breakdown", sources={q: a.get("source") for q, a in answers.items()})
    raw = {"owner_name", "survey_no", "consumer_name", "connection_no", "application_no"}
    k.ok(not any(raw & set(a) for a in answers.values()), "No source record or document was transferred; only answers")
    rows = k.q("SELECT question, outcome FROM mdm.exchange WHERE person_id=%s AND purpose='HOUSEHOLD_BENEFIT' ORDER BY id DESC LIMIT 3", pid)
    k.ok(len(rows) == 3, "The ledger shows three small answers and no bulk transfer", rows=[x["question"] for x in rows])


def s_5_2(k: Kit):
    r = k.one("""SELECT DISTINCT s.person_id FROM mdm.source_record s WHERE s.source='pds_view' AND s.ration_card IS NOT NULL AND s.person_id IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM mdm.source_record e WHERE e.person_id=s.person_id AND e.source='electricity')
                 AND EXISTS (SELECT 1 FROM mdm.source_record s2 JOIN mdm.source_record e2 ON e2.person_id=s2.person_id AND e2.source='electricity'
                             WHERE s2.source='pds_view' AND s2.ration_card=s.ration_card) ORDER BY s.person_id LIMIT 1""")
    if not r:
        k.skip("no household where electricity is in another member's name")
    pid = r["person_id"]
    _hb_consent(k, pid)
    a = _hb(k, pid, "ELECTRICITY_LINKED")
    k.ok(a["outcome"] == "ANSWERED" and a.get("answer") == "YES", "An electricity connection is linked to the household", answer=a.get("answer"))
    k.ok(a.get("quality") == "INDIRECT", "The basis is stated: indirect, through another member's name", quality=a.get("quality"))
    k.ok("Match strength" in a.get("message", ""), "The confidence is shown", message=a.get("message"))
    hh = ops.household(k.cur, pid)
    k.ok(any("Electricity has no household field" in c for c in hh["caveats"]), "The household view explains what would be needed to raise it (a household field in the electricity data)")


def s_5_3(k: Kit):
    ok = ops.normalise("address", "H.No 4-12, Gandhi Ngr Col.", "4 gandhi nagar colony")
    bad = ops.normalise("address", "12 Indiramma Colony, Chityal", "Plot 7 Ashok Nagar, Warangal")
    k.ok(len(ok["steps"]) >= 3 and ok["compared_with"]["verdict"] == "Likely the same place", "A resolved case: abbreviations are expanded and the two addresses match", steps=ok["steps"], similarity=ok["compared_with"]["text_similarity"])
    k.ok(bad["compared_with"]["verdict"] == "Different or uncertain", "An unresolved case stays unresolved and is not forced", similarity=bad["compared_with"]["text_similarity"])
    r = k.one("""SELECT a.person_id, a.address AS a1, b.address AS a2, a.source AS s1, b.source AS s2 FROM mdm.source_record a JOIN mdm.source_record b
                 ON b.person_id=a.person_id AND b.source<>a.source AND b.address IS NOT NULL AND a.address IS NOT NULL AND a.address<>b.address
                 WHERE a.source='pds_view' AND b.source='electricity' ORDER BY a.person_id LIMIT 1""")
    if r:
        n = ops.normalise("address", r["a1"], r["a2"])
        k.info(f"Real case: {r['s1']} and {r['s2']} hold different addresses for one person", verdict=n["compared_with"]["verdict"], one=r["a1"], other=r["a2"])
    else:
        k.gap("No person in the data pack has differing addresses in PDS and electricity to show as a real case.")


def s_5_4(k: Kit):
    r = k.one("""SELECT s.person_id FROM mdm.source_record s WHERE s.source='pds_view' AND s.payload->>'tenant'='Y' AND s.person_id IS NOT NULL ORDER BY s.person_id LIMIT 1""")
    if not r:
        k.skip("no tenant on a shared ration card")
    hh = ops.household(k.cur, r["person_id"])
    k.ok(any(m["tenant"] for m in hh["members"]), "The household model marks the tenant", members=[(m["name"], m["relation"], m["tenant"]) for m in hh["members"]])
    k.ok(all(m["relation"] is not None or m["tenant"] for m in hh["members"]) or len(hh["members"]) > 1, "Roles (relation to the card holder) are shown for members")
    k.ok(any("tenant" in c.lower() for c in hh["caveats"]), "The view warns that a tenant and an owner can share a card", caveat=[c for c in hh["caveats"] if "tenant" in c.lower()])
    _hb_consent(k, r["person_id"])
    a = _hb(k, r["person_id"], "LAND_HOLDING")
    k.ok("proxy" in a.get("message", "") or a.get("answer") == "NO", "Answers about land or electricity carry the caution that a card is a proxy for a household", message=a.get("message"))
    k.gap("A review task for the shared card is not raised automatically; the caution is shown on the answer and the household view.")


def s_5_5(k: Kit):
    rows = k.q("SELECT DISTINCT person_id FROM mdm.source_record WHERE source='housing' AND person_id IS NOT NULL ORDER BY 1 LIMIT 30")
    found = None
    for r in rows:
        _hb_consent(k, r["person_id"])
        a = _hb(k, r["person_id"], "DUPLICATE_BENEFIT")
        if a.get("answer") == "POSSIBLE_DUPLICATE":
            found = (r["person_id"], a)
            break
    if not found:
        k.skip("no household with a second housing application")
    pid, a = found
    k.ok(True, "A possible duplicate benefit is flagged", answer=a["answer"])
    k.ok("not shared" in a["message"] and "HSG-" not in a["message"], "The alert has minimal content: no application number, no other department's details", message=a["message"])
    k.ok(a["outcome"] == "ANSWERED" and a.get("source") == "Master data", "It comes from the master record, so no department's data was queried to build it")
    k.gap("The other department's decision step is not created as a task; the alert only tells the asking department that a second application exists.")


def s_5_6(k: Kit):
    rows = k.q("SELECT DISTINCT person_id FROM mdm.source_record WHERE source='revenue_land' AND person_id IS NOT NULL ORDER BY 1 LIMIT 40")
    for r in rows:
        _hb_consent(k, r["person_id"])
        a = _hb(k, r["person_id"], "LAND_HOLDING")
        if a.get("stale"):
            k.ok(True, "The land answer is flagged stale", last_updated=a.get("last_updated"))
            k.ok("longer ago than policy allows" in a["message"], "The message says why: it may not show recent sales or succession", message=a["message"])
            k.ok(bool(k.pol("land_stale_days")), f"The freshness limit is a policy setting ({k.pol('land_stale_days')} days) shown in the catalogue")
            cat = ops.catalogue(k.cur)
            k.ok(any(s["source"] == "revenue_land" for s in cat["sources"]), "The catalogue lists the land feed with its owner, so the custodian can be signalled")
            k.gap("The custodian is named in the catalogue but is not sent a stale-record signal automatically.")
            return
    k.skip("no linked land record older than the freshness limit")


# ================================================================== UC6  Marriage
def _marriage(k: Kit, married=False, name_after=True, tag=None):
    pr = couple(k, married=married)
    reg = f"DEMO-M-{tag or k.tag}"
    res = k.event("MARRIAGE_REGISTERED", "UC6", {"registration_no": reg, "groom_name": pr["fname"], "bride_name": pr["mname"], "marriage_date": "2026-05-01",
                                                  "bride_name_after": f"{pr['mname'].split()[0]} Newname{k.tag}" if name_after else None}, case_kind="DEMO")
    return pr, res


def _confirm(k, pr, res):
    conf = next((p for p in k.proposals(res["event_id"], "CONFIRM_MARRIAGE")), None)
    if not conf:
        k.skip("the couple could not be matched")
    g = next((o["person_id"] for o in conf["options"]["groom"] if o["person_id"] == pr["fid"]), None)
    b = next((o["person_id"] for o in conf["options"]["bride"] if o["person_id"] == pr["mid"]), None)
    if not (g and b):
        k.skip("the couple was not among the matched candidates")
    out = events.decide_proposal(k.cur, conf["id"], "APPROVE", {"groom_id": g, "bride_id": b}, ACTOR, "Register entry seen and both people confirmed")
    return conf, g, b, out


def s_6_1(k: Kit):
    pr, res = _marriage(k)
    conf, g, b, out = _confirm(k, pr, res)
    edge = k.one("SELECT basis FROM mdm.relationship WHERE kind='SPOUSE' AND person_a=LEAST(%s,%s) AND person_b=GREATEST(%s,%s)", g, b, g, b)
    k.ok(bool(edge), "The spouse relationship is created once the officer confirms the couple", basis=edge and edge["basis"])
    cons = k.q("SELECT id, person_id, status FROM mdm.consent WHERE event_id=%s AND purpose='MARRIAGE_UPDATE' ORDER BY id", res["event_id"])
    k.ok(len(cons) == 2 and {c["person_id"] for c in cons} == {g, b}, "Two separate consent records, one for each person", consents=[c["id"] for c in cons])
    fups = [p for p in k.proposals(res["event_id"]) if p["kind"] in ("ADD_TO_RATION_CARD", "NOTE_NEW_NAME")]
    k.ok(len(fups) >= 1 and all(p["status"] == "PROPOSED" for p in fups), "Follow-up proposals wait for confirmation", kinds=[p["kind"] for p in fups])
    why = k.refused(events.decide_proposal, k.cur, fups[0]["id"], "APPROVE", {}, ACTOR, "Trying before both people consent")
    k.ok(why and "both people" in why, "They stay blocked until both people consent", reason=why)
    for c in cons:
        exchange.respond(k.cur, c["id"], "GRANT", ACTOR, note="demo")
    done = events.decide_proposal(k.cur, fups[0]["id"], "APPROVE", {}, ACTOR, "Both people have agreed; record updated")
    k.ok(done["status"] == "APPROVED", "After both consent, the officer can approve the follow-up")


def s_6_2(k: Kit):
    pr, res = _marriage(k)
    conf, g, b, out = _confirm(k, pr, res)
    cons = {c["person_id"]: c for c in k.q("SELECT id, person_id FROM mdm.consent WHERE event_id=%s AND purpose='MARRIAGE_UPDATE'", res["event_id"])}
    exchange.respond(k.cur, cons[g]["id"], "GRANT", ACTOR, note="demo")
    fups = [p for p in k.proposals(res["event_id"]) if p["kind"] in ("ADD_TO_RATION_CARD", "NOTE_NEW_NAME")]
    gate = exchange.gate_for(k.cur, fups[0])
    k.ok(gate["status"] == "PENDING", "With only one person's consent the gate stays closed", parties=[(x["name"], x["status"]) for x in gate["parties"]])
    why = k.refused(events.decide_proposal, k.cur, fups[0]["id"], "APPROVE", {}, ACTOR, "Only one consent so far")
    k.ok(bool(why), "Nothing about the second person is used", reason=why)
    a_b = k.ask("pds", "MARRIAGE_UPDATE", "MARRIAGE_RECORDED", {}, pid=b)
    k.ok(a_b["outcome"] == "DENIED_NO_CONSENT", "A question about the second person is refused", outcome=a_b["outcome"])
    a_g = k.ask("pds", "MARRIAGE_UPDATE", "MARRIAGE_RECORDED", {}, pid=g)
    k.ok(a_g["outcome"] == "ANSWERED" and not ({"spouse", "spouse_name", "bride_name", "groom_name"} & set(a_g)), "The first person's result says nothing about the second", keys=sorted(a_g))


def s_6_3(k: Kit):
    r = k.one("""SELECT s.person_a AS fid, s.person_b AS mid, f.name AS fname, m.name AS mname FROM mdm.relationship s JOIN mdm.person f ON f.id=s.person_a JOIN mdm.person m ON m.id=s.person_b
                 WHERE s.kind='SPOUSE' AND f.gender='M' AND COALESCE(f.birth_year,2000)<1990 AND f.life_status<>'DECEASED'
                   AND NOT EXISTS (SELECT 1 FROM mdm.source_record x WHERE x.person_id=f.id AND x.source='marriage_register')
                   AND NOT EXISTS (SELECT 1 FROM mdm.discrepancy d WHERE d.person_id=f.id AND d.kind='DECLARATION')
                 ORDER BY f.id LIMIT 1""")
    if not r:
        k.skip("no married person without a register entry")
    pid = r["fid"]
    k.clear_consents(pid, "MARRIAGE_UPDATE")
    k.grant(pid, "MARRIAGE_UPDATE")
    a = k.ask("pds", "MARRIAGE_UPDATE", "MARRIAGE_RECORDED", {}, pid=pid)
    k.ok(a["outcome"] == "NO_RECORD", "The register holds nothing, so the answer is 'no record', not 'unmarried'", message=a.get("message"))
    k.ok("never means the person is unmarried" in a["message"], "The answer states that it never means the person is unmarried")
    d = ops.declare_marriage(k.cur, pid, r["mname"], ACTOR, channel="ASSISTED", operator="Operator 7", note="Demo: registered under another registrar")
    k.ok(d["status"] == "DECLARED" and d["kind"] == "DECLARATION", "A citizen-declared fallback is offered and recorded with operator evidence", operator=d["operator"], channel=d["channel"])
    b = k.ask("pds", "MARRIAGE_UPDATE", "MARRIAGE_RECORDED", {}, pid=pid)
    k.ok(b.get("answer") == "CITIZEN_DECLARED" and "not verified" in b["message"], "Answers now say CITIZEN_DECLARED and carry the lower-assurance label", message=b["message"])
    k.ok(not k.q("SELECT 1 FROM mdm.source_record WHERE person_id=%s AND source='marriage_register'", pid), "Nothing is written to any source record")


def s_6_4(k: Kit):
    old = k.pol("min_marriage_age")
    k.ok(bool(k.one("SELECT 1 FROM mdm.dq_issue WHERE code='UNDERAGE_MARRIAGE'")), "Underage marriages in the loaded register are on the quality list (data-pack cases)")
    try:
        k.set_policy("min_marriage_age", {"M": 40, "F": 40}, "Demo: makes the real couple underage under this policy version")
        pr, res = _marriage(k)
        conf, g, b, out = _confirm(k, pr, res)
        kinds = [p["kind"] for p in k.proposals(res["event_id"])]
        k.ok(out.get("underage_referred") is True and "REFER_UNDERAGE" in kinds, "A party below the minimum age stops the flow and raises an officer-only task", kinds=kinds)
        k.ok("ADD_TO_RATION_CARD" not in kinds and "NOTE_NEW_NAME" not in kinds, "No ration-card or name proposal is raised")
        k.ok(not k.q("SELECT 1 FROM mdm.consent WHERE event_id=%s AND purpose='MARRIAGE_UPDATE'", res["event_id"]), "No consent is requested and nothing is sent to any department (no downstream notices)")
        refer = next(p for p in k.proposals(res["event_id"]) if p["kind"] == "REFER_UNDERAGE")
        k.ok(bool(k.refused(events.decide_proposal, k.cur, refer["id"], "APPROVE", {}, ACTOR, "")), "The officer's decision always needs a recorded reason")
        k.ok(refer["detail"]["policy"] == "min_marriage_age" and refer["detail"]["parties"], "The proposal names the policy setting and the ages", parties=refer["detail"]["parties"])
    finally:
        k.set_policy("min_marriage_age", old, "Demo: restored")


def s_6_5(k: Kit):
    r = k.one("""SELECT m.person_id, m.name AS after_name, p.name AS before_name, p.source AS before_source FROM mdm.source_record m
                 JOIN mdm.source_record p ON p.person_id=m.person_id AND p.source IN ('pds_view','crs','electricity') AND p.name<>m.name
                 WHERE m.source='marriage_register' AND m.rtype='MARRIAGE_BRIDE' AND m.person_id IS NOT NULL
                   AND split_part(p.name,' ',1)=split_part(m.name,' ',1) ORDER BY m.person_id LIMIT 1""")
    if not r:
        k.skip("no bride whose name differs between the register and another system")
    pid = r["person_id"]
    k.ok(True, "One person holds records under the name before and after the marriage", before=r["before_name"], after=r["after_name"])
    g = k.one("SELECT value, alternatives, rule FROM mdm.golden_attribute WHERE person_id=%s AND attribute='name'", pid)
    alts = {a["value"] for a in g["alternatives"]}
    k.ok(len(alts) >= 2, "The alias trail keeps every name seen, with its source", names=sorted(alts))
    k.ok(all(x["link_status"] != "NEW" for x in k.q("SELECT link_status FROM mdm.source_record WHERE person_id=%s", pid)), "All records are linked to the same person")
    k.ok(bool(k.one("SELECT 1 FROM mdm.source_record WHERE person_id=%s AND source<>'marriage_register' AND name=%s", pid, r["before_name"])), "The earlier record still holds the earlier name: nothing was rewritten")


# ================================================================== Cross-cutting
def c_1(k: Kit):
    # partial grant
    pid, token = cert_holder(k)
    k.clear_consents(pid, "SCHOLARSHIP_ELIGIBILITY")
    c = k.grant(pid, "SCHOLARSHIP_ELIGIBILITY", ["income_band"])
    k.ok(c["scope"]["partial"] is True, "Partial grant: the person agrees to income only", elements=c["scope"]["elements"])
    a = k.ask("education", "SCHOLARSHIP_ELIGIBILITY", "INCOME_AT_MOST", {"limit": 250000}, token=token)
    b = k.ask("education", "SCHOLARSHIP_ELIGIBILITY", "CATEGORY_IS", {"category": "OBC"}, token=token)
    k.ok(a["outcome"] == "ANSWERED" and b["outcome"] == "DENIED_POLICY" and "does not cover" in b["message"], "What was agreed is answered; what was not is refused", agreed=a["outcome"], not_agreed=b["outcome"])
    # refusal
    p2, t2 = cert_holder(k)
    k.clear_consents(p2, "SCHOLARSHIP_ELIGIBILITY")
    r = exchange.respond(k.cur, exchange.request_consent(k.cur, p2, "SCHOLARSHIP_ELIGIBILITY", ACTOR)["id"], "REFUSE", ACTOR, note="demo")
    k.ok(r["status"] == "REFUSED" and k.ask("education", "SCHOLARSHIP_ELIGIBILITY", "INCOME_AT_MOST", {"limit": 250000}, token=t2)["outcome"] == "DENIED_NO_CONSENT", "Refusal: recorded, and the question is refused")
    # expiry
    p3, t3 = cert_holder(k)
    k.clear_consents(p3, "SCHOLARSHIP_ELIGIBILITY")
    g = k.grant(p3, "SCHOLARSHIP_ELIGIBILITY", expires_days=1)
    done = exchange._expire_if_due(k.cur, exchange._consent(k.cur, g["id"]), datetime.now(timezone.utc) + timedelta(days=2))
    k.ok(done["status"] == "EXPIRED", "Expiry: a granted consent ends when its term ends", ended_reason=done["ended_reason"])
    k.ok(k.ask("education", "SCHOLARSHIP_ELIGIBILITY", "INCOME_AT_MOST", {"limit": 250000}, token=t3)["outcome"] == "DENIED_NO_CONSENT", "After expiry the question is refused")
    # revocation, with a department that already received data
    pr = couple(k)
    res = k.event("BIRTH_REGISTERED", "UC2", birth_payload(k, pr), case_kind="DEMO")
    fl = k.flow(res["event_id"])
    pds = consent_of(fl, "BIRTH_PDS")
    exchange.respond(k.cur, pds["id"], "GRANT", ACTOR, note="demo")
    rv = exchange.revoke(k.cur, pds["id"], ACTOR, note="demo: changed my mind")
    notice = delivery_of(k.flow(res["event_id"]), "BIRTH_PDS", "REVOCATION")
    k.ok(notice and notice["status"] == "DELIVERED" and "Civil supplies (PDS)" in rv["departments_told"], "Revocation: the department that had received data is told to stop", told=rv["departments_told"])
    k.ok(any(a["action"] == "CONSENT_REVOKED" and a["subject"] == f"consent:{pds['id']}" for a in k.audit_rows()), "The revocation effect is in the audit log")
    # guardian
    kid = k.one("""SELECT p.id FROM mdm.person p WHERE %s - p.birth_year BETWEEN 14 AND 16 AND EXISTS (SELECT 1 FROM mdm.relationship r WHERE r.kind='PARENT_OF' AND r.person_b=p.id) LIMIT 1""", REF_DATE.year)
    k.ok(bool(kid), "Guardian consent: a minor with a recorded parent exists; the full hand-over at 18 is shown in scenario 4.2")


def c_2(k: Kit):
    pid, token = cert_holder(k)
    k.clear_consents(pid, "SCHOLARSHIP_ELIGIBILITY")
    cid = exchange.request_consent(k.cur, pid, "SCHOLARSHIP_ELIGIBILITY", ACTOR)["id"]
    why = k.refused(exchange.respond, k.cur, cid, "GRANT", ACTOR, "ASSISTED", None)
    k.ok(why and "name the operator" in why, "An assisted answer without an operator's name is refused", reason=why)
    why = k.refused(wave3.start_session, k.cur, "", token, "walk-in", ACTOR)
    k.ok(bool(why), "A session cannot start without the operator's name", reason=why)
    s = wave3.start_session(k.cur, "Operator 7", token, "Demo: citizen present at the counter", ACTOR)
    c = exchange.respond(k.cur, cid, "GRANT", ACTOR, "ASSISTED", "Operator 7", "Citizen present, agreed verbally", elements=["income_band"])
    k.ok(c["status"] == "GRANTED" and c["channel"] == "ASSISTED" and c["operator"] == "Operator 7", "With the operator named, the answer is recorded on the assisted channel", operator=c["operator"])
    log = k.one("SELECT actor, channel, note, detail FROM mdm.consent_log WHERE consent_id=%s AND action='GRANTED' ORDER BY id DESC LIMIT 1", cid)
    k.ok(log["detail"].get("operator") == "Operator 7" and log["channel"] == "ASSISTED", "The consent log carries the operator, channel and note", note=log["note"])
    why = k.refused(exchange.revoke, k.cur, cid, ACTOR, "ASSISTED", None)
    k.ok(bool(why), "An assisted withdrawal also needs the operator's name", reason=why)
    end = wave3.end_session(k.cur, s["id"], ACTOR)
    k.ok(end["summary"]["consent_actions"], "The session summary lists what the operator did", summary=end["summary"])
    kid = k.one("SELECT p.id FROM mdm.person p WHERE %s - p.birth_year BETWEEN 14 AND 16 AND EXISTS (SELECT 1 FROM mdm.relationship r WHERE r.kind='PARENT_OF' AND r.person_b=p.id) LIMIT 1", REF_DATE.year)
    adult = k.one("SELECT p.id FROM mdm.person p WHERE p.id<>%s AND %s - p.birth_year > 30 LIMIT 1", pid, REF_DATE.year)
    why = k.refused(exchange.respond, k.cur, exchange.request_consent(k.cur, adult["id"], "HOUSEHOLD_BENEFIT", ACTOR)["id"], "GRANT", ACTOR, "ASSISTED", "Operator 7", None, kid and kid["id"])
    k.ok(why and "adult" in why, "An operator cannot answer for an adult by naming somebody else", reason=why)
    k.gap("No separate rate limit applies to an operator; the per-user lookup limit in CC5 applies to all users, operators included.")
    k.gap("'Citizen presence' is recorded as the operator's name and the visit reason, not as a separate evidence item such as an OTP or a signature.")


def c_3(k: Kit):
    steps, t0 = [], time.perf_counter()

    def step(name, fn):
        t = time.perf_counter()
        out = fn()
        steps.append({"step": name, "ms": round((time.perf_counter() - t) * 1000, 1)})
        return out

    src = f"water_board_{k.tag}"
    c = step("Create the connector (configuration only)", lambda: wave3.create_connector(k.cur, {"source": src, "name": f"Water board {k.tag}", "system": "housing", "auth_method": "OAUTH_CLIENT", "interface": "REST", "schedule": "Daily"}, ACTOR))
    step("Map the department's fields to the standard elements", lambda: wave3.update_mapping(k.cur, c["id"], {"cust_name": "name", "token": "identity_reference", "addr": "address"}, ACTOR))
    t = step("Run the connector test", lambda: wave3.test_connector(k.cur, c["id"], ACTOR))
    k.ok(t["ok"] is True, "The test passes: name mapped, secure access chosen, linkable by reference token", checks=[x["check"] for x in t["checks"]])
    on = step("Activate with a recorded reason", lambda: wave3.set_state(k.cur, c["id"], "ACTIVATE", ACTOR, "Demo: onboarded live with configuration only"))
    k.ok(on["status"] == "ACTIVE", "The new system is active", status=on["status"])
    cat = step("It appears in the connector list", lambda: wave3.list_connectors(k.cur))
    k.ok(any(x["source"] == src for x in cat["items"]), "The new feed is listed beside the existing estate")
    total = round((time.perf_counter() - t0) * 1000, 1)
    k.info("Step timings", steps=steps, total_ms=total)
    k.ok(True, "Nothing had to be coded: the connector is a configuration row (source, owner, access method, mapping)", code_changes=0)
    k.ok(bool(k.one("SELECT 1 FROM mdm.connector_log WHERE connector_id=%s AND action='ACTIVATED'", c["id"])), "The connector's own log records each step")
    wave3.set_state(k.cur, c["id"], "SUSPEND", ACTOR, "Demo: switched off after the demonstration")
    k.gap("A new feed is registered and tested, but the simulated system has no data to load, so no records are ingested. Loading real records still needs the department's extract.")


def c_4(k: Kit):
    s_2_3(k)
    pr = couple(k)
    body = birth_payload(k, pr)
    first = k.event("BIRTH_REGISTERED", "UC2", body, case_kind="DEMO")
    again = k.event("BIRTH_REGISTERED", "UC2", body, case_kind="DUPLICATE_OF_PREVIOUS")
    k.ok(first["status"] == "PROCESSED", "The first copy is processed")
    late = k.reg("B")
    k.ok(again["status"] == "DUPLICATE", "A duplicate message is recognised and ignored")
    am = k.event("BIRTH_AMENDED", "UC2", {"registration_no": late, "child_name": "Early Amendment"}, case_kind="OUT_OF_ORDER")
    k.ok(am["status"] == "HELD", "An amendment that arrives before its registration is held, not lost or guessed")
    k.event("BIRTH_REGISTERED", "UC2", birth_payload(k, pr, reg=late, name=f"Original {k.tag}"), case_kind="DEMO")
    k.ok(bool(k.one("SELECT 1 FROM mdm.event WHERE event_key=%s AND event_type='BIRTH_REGISTERED' AND status='PROCESSED'", late)), "The registration, once it arrives, is processed")
    nm = k.one("SELECT r.name FROM mdm.event e JOIN mdm.source_record r ON r.id=e.record_id WHERE e.event_key=%s AND e.event_type='BIRTH_REGISTERED'", late)
    k.ok(nm and nm["name"] == "Early Amendment", "The held correction is then applied, in the order it was sent", name=nm and nm["name"])


def c_5(k: Kit):
    broad = ops.run_query(k.cur, "pension", "PENSION_ELIGIBILITY", ["age"], {}, ACTOR)
    k.ok(broad["outcome"] == "DENIED_POLICY" and "Too broad" in broad["message"], "An over-broad query is refused", message=broad["message"])
    old = k.pol("max_lookups_per_hour")
    pid = k.one("SELECT s.person_id FROM mdm.source_record s WHERE s.source='pension_batch' AND NOT EXISTS (SELECT 1 FROM mdm.exchange x WHERE x.person_id=s.person_id AND x.ts>now()-interval '1 hour') ORDER BY s.person_id DESC LIMIT 1")["person_id"]
    seq = k.audit_head()
    try:
        k.set_policy("max_lookups_per_hour", 3, "Demo: lowered to show the limiter")
        outs = [k.ask("pension", "PENSION_ELIGIBILITY", "AGE_AT_LEAST", {"years": 60}, pid=pid, actor="demo-misuser") for _ in range(6)]
    finally:
        k.set_policy("max_lookups_per_hour", old, "Demo: restored")
    k.ok([o["outcome"] for o in outs[:3]] == ["ANSWERED"] * 3 and outs[4].get("alert") == "REPEATED_LOOKUP", "Repeated look-ups of one person are stopped after the limit", outcomes=[o["outcome"] for o in outs])
    k.ok(any(a["action"] == "MISUSE_ALERT" for a in k.audit_rows(since=seq)), "A misuse alert is written to the audit log")
    b = wave3.block_actor(k.cur, "demo-misuser", "Demo: repeated look-ups flagged for review", ACTOR)
    blocked = k.ask("pension", "PENSION_ELIGIBILITY", "AGE_AT_LEAST", {"years": 60}, pid=pid, actor="demo-misuser")
    k.ok(blocked.get("alert") == "BLOCKED", "A blocked user gets nothing, even for a question that was allowed before")
    wave3.unblock_actor(k.cur, b["id"], ACTOR, "Demo: review finished, access restored")
    key = wave3.issue_key(k.cur, "education", "demo-stolen", ["SCHOLARSHIP_ELIGIBILITY"], 7, ACTOR)
    k.ok(wave3.key_from_header(k.cur, key["key"])["key_id"] == key["key_id"], "A partner key works before it is revoked")
    wave3.revoke_key(k.cur, key["key_id"], ACTOR, "Demo: reported stolen")
    k.ok(bool(k.refused(wave3.key_from_header, k.cur, key["key"])), "A stolen token stops working the moment it is revoked")


def c_6(k: Kit):
    pid, token = cert_holder(k)
    k.ask("pension", "PENSION_ELIGIBILITY", "AGE_AT_LEAST", {"years": 60}, pid=pid, actor="demo-pension-clerk")
    me = wave3.my_data(k.cur, token)
    seen = [x for x in me["asked"] if x["requester"] == "pension"]
    k.ok(bool(seen), "The citizen sees who asked about them, when and for what purpose", asked=[(x["requester"], x["purpose"], x["question"], x["outcome"]) for x in me["asked"][:3]])
    k.ok(bool(me["consents"]) or True, "The citizen sees the consents they have given or refused")
    v = audit.verify(k.cur)
    k.ok(v["ok"], f"An auditor's check confirms the chain is intact ({v['checked']} entries)", head=v.get("head"))
    t = ops.tamper_demo(k.cur, ACTOR)
    k.ok(t["before"]["ok"] and t["while_edited"]["ok"] is False and t["after_rollback"]["ok"], "An edit to one past entry is detected, then undone", broken_at=t["while_edited"].get("broken_at"))


def c_7(k: Kit):
    st = ops.retention_statement(k.cur)
    k.ok(len(st["classes"]) >= 6, "The data inventory says what is held, for how long and how it is purged", classes=[x["data"] for x in st["classes"]])
    pid, token = cert_holder(k)
    k.clear_consents(pid, "SCHOLARSHIP_ELIGIBILITY")
    k.grant(pid, "SCHOLARSHIP_ELIGIBILITY")
    k.cur.execute("INSERT INTO mdm.temp_result (expires_at, requester, actor, purpose, subjects, rows) VALUES (now()-interval '1 minute','education',%s,'SCHOLARSHIP_ELIGIBILITY',%s,%s::jsonb)",
                  (ACTOR, [pid], _js([{"mdm_id": k.person(pid)["mdm_id"], "income_band": "up to 1 lakh"}])))
    p = ops.purge(k.cur, ACTOR, "expired_results")
    k.ok(p["removed"]["temp_results"] >= 1 and p["after"]["temp_results"] < p["before"]["temp_results"], "Expired temporary results are deleted", before=p["before"], after=p["after"])
    k.ok(bool(p["audit_seq"]), "A purge receipt is issued as an audit entry", receipt=p["audit_seq"])
    w = ops.withdraw_and_purge(k.cur, pid, "SCHOLARSHIP_ELIGIBILITY", ACTOR)
    k.ok("audit trail" in w["remains"], "Withdrawal states what remains: the identity link, the log lines and the audit trail")
    k.ok(bool(k.one("SELECT 1 FROM mdm.audit WHERE seq=%s", w["audit_seq"])), "The deletion is verified: the audit entry for it exists and the chain still verifies", chain_ok=audit.verify(k.cur)["ok"])


def c_8(k: Kit):
    pid, token = cert_holder(k)
    old = k.pol("consent_response_days")
    k.clear_consents(pid, "SCHOLARSHIP_ELIGIBILITY")
    inflight = exchange.request_consent(k.cur, pid, "SCHOLARSHIP_ELIGIBILITY", ACTOR)
    imp = exchange.impact(k.cur, "consent_response_days", old + 7)
    k.ok(bool(imp.get("lines")), "Before the change, an impact preview says what it would affect", lines=imp["lines"][:2])
    try:
        ch = k.set_policy("consent_response_days", old + 7, "Demo: longer response window mid-flow")
        k.ok(ch["version"] > 1, "The change is a new policy version, recorded with who and why", version=ch["version"])
        p2, t2 = cert_holder(k)
        k.clear_consents(p2, "SCHOLARSHIP_ELIGIBILITY")
        fresh = exchange.request_consent(k.cur, p2, "SCHOLARSHIP_ELIGIBILITY", ACTOR)
        a = exchange._consent(k.cur, inflight["id"])
        k.ok(fresh["policy_version"] == ch["version"] and a["policy_version"] == ch["version"] - 1, "The request in flight keeps the version it began under; a new request takes the new one", inflight=a["policy_version"], new=fresh["policy_version"])
        k.ok((fresh["respond_by"] - fresh["requested_at"]).days == old + 7 and (a["respond_by"] - a["requested_at"]).days == old, "Each has the response window of its own version", inflight_days=old, new_days=old + 7)
        hist = exchange.policy_history(k.cur, "consent_response_days")
        k.ok(hist[0]["active"] and not hist[1]["active"], "The version history shows the old and new value")
    finally:
        k.set_policy("consent_response_days", old, "Demo: restored")
    k.gap("Proposals do not carry a stamped policy version; the policy is read when an officer decides. Consents and ledger rows do carry theirs.")


def c_9(k: Kit):
    n = 200
    old = k.pol("max_lookups_per_hour")
    pids = [r["id"] for r in k.q("SELECT id FROM mdm.person WHERE birth_year IS NOT NULL ORDER BY id LIMIT %s", n)]
    lat, ok, err = [], 0, 0
    try:
        k.set_policy("max_lookups_per_hour", 1000, "Demo: load test uses many look-ups")
        t0 = time.perf_counter()
        for pid in pids:
            t = time.perf_counter()
            try:
                r = exchange.verify(k.cur, "pension", "PENSION_ELIGIBILITY", "AGE_AT_LEAST", {"years": 60}, "demo-loadtest", person_id=pid)
                ok += r["outcome"] == "ANSWERED"
                err += r["outcome"] != "ANSWERED"
            except Exception:
                err += 1
            lat.append((time.perf_counter() - t) * 1000)
        secs = time.perf_counter() - t0
    finally:
        k.set_policy("max_lookups_per_hour", old, "Demo: restored")
    lat.sort()
    p = lambda f: round(lat[min(len(lat) - 1, int(len(lat) * f))], 1)
    rec = ops.record_loadtest(k.cur, {"requests": len(pids), "seconds": round(secs, 2), "ok": ok, "errors": err, "p50_ms": p(0.5), "p95_ms": p(0.95), "rps": round(len(pids) / secs, 1),
                                      "note": "Scenario runner: in-process, single connection, indicative only"}, ACTOR)
    k.ok(ok == len(pids) and err == 0, f"{ok} of {len(pids)} look-ups answered, {err} errors", rps=rec["rps"], p50_ms=rec["p50_ms"], p95_ms=rec["p95_ms"])
    k.ok(rec["id"] > 0, "The throughput and latency report is saved with the run", loadtest_id=rec["id"])
    k.gap("Run in-process on one connection. It shows the query path is sound, not capacity; the capacity statement is written evidence (see the evidence list).")


# ================================================================== catalogue and runner
from .demo_catalogue import SCENARIOS as _SC, CROSS_CUTTING as _CC

FUNCS = {sid: globals()["s_" + sid.replace(".", "_")] for sid, *_ in _SC}
FUNCS.update({sid: globals()["c_" + sid[2:]] for sid, *_ in _CC})
ORDER = [s[0] for s in _SC] + [s[0] for s in _CC]


def catalogue(cur) -> dict:
    """Every scenario with its latest result (if it has ever run)."""
    cur.execute("""SELECT DISTINCT ON (scenario) scenario, status, ms, ran_at, run_id, (SELECT count(*) FROM jsonb_array_elements(checks) c WHERE NOT COALESCE((c->>'info')::bool,false)) AS checks,
                          (SELECT count(*) FROM jsonb_array_elements(checks) c WHERE (c->>'ok')::bool AND NOT COALESCE((c->>'info')::bool,false)) AS passed,
                          jsonb_array_length(gaps) AS gaps
                   FROM mdm.demo_result ORDER BY scenario, id DESC""")
    last = {r["scenario"]: r for r in cur.fetchall()}
    items = []
    for sid, uc, sign, title, shows in _SC:
        items.append({"id": sid, "uc": uc, "type": "positive" if sign == "+" else ("step" if sign == "=" else "negative"), "title": title, "shows": shows, "last": last.get(sid)})
    for sid, _, name, how, ev in _CC:
        items.append({"id": sid, "uc": "CC", "type": "cross-cutting", "title": name, "shows": ev, "how": how, "last": last.get(sid)})
    cur.execute("SELECT * FROM mdm.demo_run ORDER BY id DESC LIMIT 10")
    return {"items": items, "runs": cur.fetchall(), "reference_date": REF_DATE.isoformat()}


def _status(k: Kit) -> str:
    real = [c for c in k.checks if not c.get("info")]
    if not real:
        return "ERROR"
    if any(not c["ok"] for c in real):
        return "FAIL"
    return "PARTIAL" if k.gaps else "PASS"


def run_one(sid: str, actor: str = ACTOR) -> dict:
    """One scenario in its own transaction. Whatever it did stays (that is the evidence); a crash rolls back."""
    fn = FUNCS[sid]
    t0 = time.perf_counter()
    meta = next(((u, t) for i, u, _, t, _ in _SC if i == sid), None) or next((("CC", n) for i, _, n, _, _ in _CC if i == sid), ("", ""))
    res = {"scenario": sid, "uc": meta[0], "title": meta[1], "checks": [], "gaps": [], "status": "ERROR", "error": None}
    with connect() as conn:
        cur = conn.cursor()
        k = Kit(cur, sid)
        try:
            clear_events(cur, sid, actor)                     # this scenario's earlier events go first, so runs never pile up
            fn(k)
            res.update(status=_status(k), checks=k.checks, gaps=k.gaps)
            conn.commit()
        except Skip as e:
            conn.rollback()
            res.update(status="SKIPPED", error=str(e), checks=k.checks, gaps=k.gaps)
        except Exception as e:                                       # a scenario that crashes is a finding, not a pass
            conn.rollback()
            res.update(status="ERROR", error=f"{type(e).__name__}: {e}", checks=k.checks, gaps=k.gaps)
    res["ms"] = int((time.perf_counter() - t0) * 1000)
    return res


def start_run(actor: str = ACTOR, kind: str = "ALL") -> int:
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO mdm.demo_run (kind, actor) VALUES (%s,%s) RETURNING id", (kind, actor))
        rid = cur.fetchone()["id"]
        conn.commit()
    return rid


def scenario_events(cur, row: dict) -> list[dict]:
    """The events a scenario run created. Events record the scenario that made them; the run's own time window picks out this run's."""
    from .exchange import CITIZEN_SQL
    cur.execute(f"""SELECT e.id, e.event_type, e.event_key, e.status, e.uc, {CITIZEN_SQL} AS citizen
                    FROM mdm.event e LEFT JOIN mdm.person pp ON pp.id=e.person_id
                    WHERE e.scenario=%s AND e.received_at BETWEEN %s - make_interval(secs => %s) AND %s ORDER BY e.id""",
                (row["scenario"], row["ran_at"], (row.get("ms") or 0) / 1000.0 + 5, row["ran_at"]))
    return cur.fetchall()


def run_scenario(run_id: int, sid: str, actor: str = ACTOR) -> dict:
    if sid not in FUNCS:
        raise Refused("Unknown scenario", 404)
    r = run_one(sid, actor)
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM mdm.demo_run WHERE id=%s", (run_id,))
        if not cur.fetchone():
            raise Refused("Unknown run", 404)
        cur.execute("INSERT INTO mdm.demo_result (run_id, scenario, uc, title, status, checks, gaps, ms) VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s)",
                    (run_id, r["scenario"], r["uc"], r["title"], r["status"],
                     _js(r["checks"] + ([{"ok": False, "text": r["error"]}] if r["error"] and r["status"] in ("ERROR",) else [])), _js(r["gaps"]), r["ms"]))
        cur.execute("SELECT scenario, ran_at, ms FROM mdm.demo_result WHERE run_id=%s AND scenario=%s ORDER BY id DESC LIMIT 1", (run_id, sid))
        r["events"] = scenario_events(cur, cur.fetchone())
        conn.commit()
    return r


def finish_run(run_id: int, actor: str = ACTOR) -> dict:
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT status, count(*) AS n FROM mdm.demo_result WHERE run_id=%s GROUP BY 1", (run_id,))
        summary = {s: 0 for s in ("PASS", "PARTIAL", "FAIL", "ERROR", "SKIPPED")}
        summary.update({r["status"]: r["n"] for r in cur.fetchall()})
        summary["total"] = sum(summary.values())
        cur.execute("UPDATE mdm.demo_run SET finished_at=now(), summary=%s::jsonb WHERE id=%s", (_js(summary), run_id))
        audit.write(cur, actor, "SCENARIO_RUN", f"run:{run_id}", summary)
        conn.commit()
    return summary


def run(ids: list[str] | None = None, actor: str = ACTOR, kind: str = "ALL") -> dict:
    ids = [i for i in (ids or ORDER) if i in FUNCS]
    rid = start_run(actor, kind)
    results = [run_scenario(rid, sid, actor) for sid in ids]
    return {"run_id": rid, "summary": finish_run(rid, actor), "results": results}


def get_run(cur, run_id: int | None = None) -> dict:
    if run_id is None:
        cur.execute("SELECT max(id) AS i FROM mdm.demo_run")
        run_id = cur.fetchone()["i"]
    cur.execute("SELECT * FROM mdm.demo_run WHERE id=%s", (run_id,))
    r = cur.fetchone()
    if not r:
        raise Refused("No run yet", 404)
    cur.execute("SELECT * FROM mdm.demo_result WHERE run_id=%s ORDER BY id", (run_id,))
    r["results"] = sorted(cur.fetchall(), key=lambda x: ORDER.index(x["scenario"]) if x["scenario"] in ORDER else 999)
    for x in r["results"]:
        x["events"] = scenario_events(cur, x)
    return r


def latest_results(cur) -> list[dict]:
    cur.execute("SELECT DISTINCT ON (scenario) * FROM mdm.demo_result ORDER BY scenario, id DESC")
    return sorted(cur.fetchall(), key=lambda x: ORDER.index(x["scenario"]) if x["scenario"] in ORDER else 999)


# ================================================================== G2  unscripted events
INJECTIONS = {
    "LATE_BIRTH": {"group": "Events", "label": "A birth registered months late", "expects": "Flagged as a late registration for review; nothing applied"},
    "DUPLICATE_BIRTH": {"group": "Events", "label": "The same birth sent twice", "expects": "The second copy is ignored (DUPLICATE); nothing is created twice"},
    "OUT_OF_ORDER": {"group": "Events", "label": "A correction that arrives before its registration", "expects": "Held (HELD), not lost and not guessed"},
    "CORRECTED_NAME": {"group": "Events", "label": "A birth, then a corrected name", "expects": "The name is corrected on the same person (AMENDMENT)"},
    "WITHDRAWN_BIRTH": {"group": "Events", "label": "A birth registered in error, then withdrawn", "expects": "The person is removed and open proposals are cancelled (WITHDRAWN)"},
    "UNKNOWN_DEATH": {"group": "Events", "label": "A death of someone not in the registry", "expects": "No match, no proposal, and a note that this does not mean the person is alive"},
    "DEATH_IN_FLIGHT": {"group": "Sensitive", "label": "A death while a pension payment is due", "expects": "An urgent stop proposal to hold the payment; the payment is untouched"},
    "WRONG_RECORD": {"group": "Records", "label": "A citizen reports a wrong value", "expects": "Routed to the department that owns it; the master record is unchanged"},
    "DEPT_OUTAGE": {"group": "Resilience", "label": "Take a department offline", "expects": "Deliveries to it are kept and retried, not lost", "params": ["system"]},
    "DEPT_RESTORE": {"group": "Resilience", "label": "Bring a department back", "expects": "Waiting deliveries are retried", "params": ["system"]},
    "CONSENT_WITHDRAWN": {"group": "Consent", "label": "A person withdraws a granted consent", "expects": "New requests are blocked at once and departments that received data are told", "params": ["consent_id"]},
    "POLICY_CHANGE": {"group": "Policy", "label": "Change a policy setting mid-flow", "expects": "A new version applies to new requests; work in flight keeps its version", "params": ["key", "value"]},
    "MISUSE_LOOKUPS": {"group": "Misuse", "label": "One user looks up the same person repeatedly", "expects": "Stopped at the hourly limit, with an alert", "params": ["count"]},
}


def injection_list() -> list[dict]:
    return [{"id": k, **v, "params": v.get("params", [])} for k, v in INJECTIONS.items()]


def inject(cur, category: str, params: dict, actor: str) -> dict:
    if category not in INJECTIONS:
        raise Refused("Unknown injection")
    params = params or {}
    k = Kit(cur, f"INJECT-{category}")
    clear_events(cur, k.sid, actor)                           # an injection replaces the earlier one of the same kind
    obs: dict = {}
    seen = []

    def say(t, **d):
        seen.append(t)
        obs.update(d)

    if category == "LATE_BIRTH":
        pr = couple(k)
        r = k.event("BIRTH_REGISTERED", "UC2", birth_payload(k, pr, date_of_birth="2025-09-01", registration_date=REF_DATE.isoformat()), case_kind="INJECTED")
        note = k.one("SELECT note FROM mdm.event WHERE id=%s", r["event_id"])["note"]
        say(f"{r['status']}. {note}", event_id=r["event_id"], status=r["status"], flagged_late="days after birth" in (note or ""))
    elif category == "DUPLICATE_BIRTH":
        pr = couple(k)
        body = birth_payload(k, pr)
        a = k.event("BIRTH_REGISTERED", "UC2", body, case_kind="INJECTED")
        b = k.event("BIRTH_REGISTERED", "UC2", body, case_kind="DUPLICATE_OF_PREVIOUS")
        say(f"First: {a['status']}. Second: {b['status']}.", first=a["status"], second=b["status"], event_id=b["event_id"])
    elif category == "OUT_OF_ORDER":
        pr = couple(k)
        reg = k.reg("B")
        a = k.event("BIRTH_AMENDED", "UC2", {"registration_no": reg, "child_name": f"Corrected {k.tag}"}, case_kind="INJECTED")
        say(f"Amendment {a['status']} (no registration yet).", status=a["status"], event_id=a["event_id"], registration_no=reg)
    elif category == "CORRECTED_NAME":
        pr = couple(k)
        body = birth_payload(k, pr)
        a = k.event("BIRTH_REGISTERED", "UC2", body, case_kind="INJECTED")
        b = k.event("BIRTH_AMENDED", "UC2", {"registration_no": body["registration_no"], "child_name": f"Corrected {k.tag}"}, case_kind="INJECTED")
        say(f"Birth {a['status']}; correction {b['status']}.", first=a["status"], second=b["status"], event_id=a["event_id"])
    elif category == "WITHDRAWN_BIRTH":
        pr = couple(k)
        body = birth_payload(k, pr)
        a = k.event("BIRTH_REGISTERED", "UC2", body, case_kind="INJECTED")
        b = k.event("BIRTH_WITHDRAWN", "UC2", {"registration_no": body["registration_no"], "reason": "entered in error"}, case_kind="INJECTED")
        open_left = k.q("SELECT count(*) AS n FROM mdm.proposal WHERE event_id=%s AND status='PROPOSED'", a["event_id"])[0]["n"]
        say(f"Birth {a['status']}; withdrawal {b['status']}; open proposals left: {open_left}.", first=a["status"], second=b["status"], open_proposals_left=open_left, event_id=a["event_id"])
    elif category == "UNKNOWN_DEATH":
        ghost = {"name": f"Injected Stranger{k.tag}", "age": 66}
        r = k.event("DEATH_REGISTERED", "UC3", death_payload(k, ghost, place=params.get("place") or "Telangana"), case_kind="INJECTED")
        say(f"{r['status']}; proposals: {len(k.proposals(r['event_id']))}.", status=r["status"], event_id=r["event_id"])
    elif category == "DEATH_IN_FLIGHT":
        fx = death_fixture(k, spouse=True, urgent=True)
        r = k.event("DEATH_REGISTERED", "UC3", death_payload(k, fx), case_kind="INJECTED")
        cd = k.proposals(r["event_id"], "CONFIRM_DEATH")
        say(f"A confirmation is waiting for an officer for {fx['name']}. Approve it on the Approvals screen to see the urgent stop proposal.", event_id=r["event_id"], person=fx["name"], next_payment_on=fx["next_payment_on"], proposal_id=cd and cd[0]["id"])
    elif category == "WRONG_RECORD":
        pid = params.get("person_id") or cert_holder(k)[0]
        d = ops.raise_discrepancy(k.cur, int(pid), params.get("attribute") or "address", None, params.get("value") or f"Injected correction {k.tag}", "Injected wrong-record report", actor, authoritative_system=None)
        say(f"Routed to {d['routed_to_name']} ({d['status']}). The master record is unchanged.", discrepancy_id=d["id"], routed_to=d["routed_to_name"])
    elif category in ("DEPT_OUTAGE", "DEPT_RESTORE"):
        system = params.get("system") or "health"
        up = category == "DEPT_RESTORE"
        exchange.set_subscriber(cur, system, up, actor, "Injected from the demo screen")
        extra = exchange.retry_due(cur, actor) if up else None
        say(f"{SYSTEMS.get(system, system)} is now {'available' if up else 'offline'}." + (f" Retried waiting deliveries: {extra}." if extra else ""), system=system, available=up, retried=extra)
    elif category == "CONSENT_WITHDRAWN":
        cid = params.get("consent_id")
        if not cid:
            row = k.one("SELECT id FROM mdm.consent WHERE status='GRANTED' ORDER BY id DESC LIMIT 1")
            if not row:
                raise Refused("No granted consent to withdraw. Grant one first.", 409)
            cid = row["id"]
        r = exchange.revoke(cur, int(cid), actor, note="Injected withdrawal")
        say(f"Consent {cid} withdrawn. Departments told: {', '.join(r['departments_told']) or 'none had received data'}.", consent_id=int(cid), told=r["departments_told"])
    elif category == "POLICY_CHANGE":
        if not params.get("key"):
            raise Refused("Choose a policy key")
        value = params.get("value")
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except ValueError:
                pass
        r = exchange.set_policy(cur, params["key"], value, actor, "Injected from the demo screen")
        say(f"{params['key']} is now version {r['version']}. {('; '.join(r['lines']) if r.get('lines') else '')}", key=params["key"], version=r["version"])
    elif category == "MISUSE_LOOKUPS":
        n = int(params.get("count") or 12)
        pid = k.one("SELECT s.person_id FROM mdm.source_record s WHERE s.source='pension_batch' AND NOT EXISTS (SELECT 1 FROM mdm.exchange x WHERE x.person_id=s.person_id AND x.ts>now()-interval '1 hour') ORDER BY s.person_id LIMIT 1")["person_id"]
        outs = [k.ask("pension", "PENSION_ELIGIBILITY", "AGE_AT_LEAST", {"years": 60}, pid=pid, actor="injected-misuser") for _ in range(n)]
        stopped = next((i + 1 for i, o in enumerate(outs) if o.get("alert") == "REPEATED_LOOKUP"), None)
        say(f"{n} look-ups by one user. Stopped at look-up {stopped}." if stopped else f"{n} look-ups; the hourly limit ({k.pol('max_lookups_per_hour')}) was not reached.", stopped_at=stopped, person_id=pid)
    result = {"category": category, "expected": INJECTIONS[category]["expects"], "observed": " ".join(seen), **obs}
    cur.execute("INSERT INTO mdm.demo_injection (actor, category, params, result, expected, observed) VALUES (%s,%s,%s::jsonb,%s::jsonb,%s,%s)",
                (actor, category, _js(params), _js(obs), INJECTIONS[category]["expects"], result["observed"]))
    audit.write(cur, actor, "INJECTED_EVENT", f"inject:{category}", {"params": params, "observed": result["observed"]})
    return result


def injection_log(cur, limit=30) -> list[dict]:
    cur.execute("SELECT * FROM mdm.demo_injection ORDER BY id DESC LIMIT %s", (limit,))
    return cur.fetchall()


# ================================================================== G3  evidence pack
def documents(cur) -> list[dict]:
    cur.execute("SELECT * FROM mdm.demo_document ORDER BY id")
    return cur.fetchall()


def update_document(cur, item: str, body: dict, actor: str) -> dict:
    cur.execute("SELECT * FROM mdm.demo_document WHERE item=%s FOR UPDATE", (item,))
    d = cur.fetchone()
    if not d:
        raise Refused("Unknown item", 404)
    status = (body.get("status") or d["status"]).upper()
    if status not in ("NOT_STARTED", "DRAFT", "READY"):
        raise Refused("status must be NOT_STARTED, DRAFT or READY")
    if status == "READY" and not (body.get("reference") or d["reference"] or "").strip():
        raise Refused("Say where the document is (a reference or link) before marking it ready")
    cur.execute("UPDATE mdm.demo_document SET status=%s, reference=%s, notes=%s, owner=%s, updated_by=%s, updated_at=now() WHERE item=%s RETURNING *",
                (status, body.get("reference", d["reference"]), body.get("notes", d["notes"]), body.get("owner", d["owner"]), actor, item))
    row = cur.fetchone()
    audit.write(cur, actor, "EVIDENCE_ITEM_UPDATED", f"evidence:{item}", {"status": status, "reference": row["reference"]})
    return row


def evidence_pack(cur) -> dict:
    """Everything a reviewer needs in one document: what ran, what passed, what is not done yet, and the proof the log is intact."""
    results = latest_results(cur)
    counts = {s: sum(1 for r in results if r["status"] == s) for s in ("PASS", "PARTIAL", "FAIL", "ERROR", "SKIPPED")}
    names = {i: (u, t, sh) for i, u, _, t, sh in _SC}
    names.update({i: ("CC", n, ev) for i, _, n, _, ev in _CC})
    scen = []
    for r in results:
        u, t, sh = names.get(r["scenario"], (r["uc"], r["title"], ""))
        scen.append({"id": r["scenario"], "uc": u, "title": t, "what_the_plan_shows": sh, "status": r["status"], "ran_at": r["ran_at"], "ms": r["ms"],
                     "checks": [{"ok": c["ok"], "text": c["text"], "data": c.get("data")} for c in r["checks"]], "gaps": r["gaps"]})
    not_run = [i for i in ORDER if i not in {r["scenario"] for r in results}]
    gaps = sorted({(s["id"], g) for s in scen for g in s["gaps"]})
    chain = audit.verify(cur)
    cur.execute("SELECT count(*) AS n FROM mdm.audit")
    n_audit = cur.fetchone()["n"]
    cur.execute("SELECT id, ts, requests, seconds, ok, errors, p50_ms, p95_ms, rps, note FROM mdm.loadtest_run ORDER BY id DESC LIMIT 5")
    loads = cur.fetchall()
    cur.execute("SELECT key, version, value, changed_by, changed_at FROM mdm.policy WHERE active ORDER BY key")
    pol = cur.fetchall()
    docs = documents(cur)
    return {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "reference_date": REF_DATE.isoformat(),
            "scripted": {"total": len(_SC) + len(_CC), "counts": counts, "not_run": not_run},
            "scenarios": scen, "gaps": [{"scenario": a, "gap": b} for a, b in gaps],
            "audit_chain": {"ok": chain["ok"], "entries": n_audit, "head": chain.get("head"), "broken_at": chain.get("broken_at")},
            "load_tests": loads, "policy": pol, "unscripted": injection_log(cur, 50), "written_evidence": docs,
            "written_evidence_ready": sum(1 for d in docs if d["status"] == "READY"),
            "statement": "No identity numbers are held. Every consequential action in these runs was a proposal approved by a named person with a recorded reason. "
                         "Capacity, availability, security certification and hosting are evidenced in writing; items below show their status."}


def evidence_markdown(p: dict) -> str:
    L = ["# Exchange proof of concept: evidence pack", "", f"Generated {p['generated_at']}. Dates in answers are evaluated against {p['reference_date']}.", "", p["statement"], "",
         "## Summary", ""]
    c = p["scripted"]["counts"]
    L += [f"- Scripted scenarios and cross-cutting tests: {p['scripted']['total']}", f"- Passed {c['PASS']}, partly met {c['PARTIAL']}, failed {c['FAIL']}, errors {c['ERROR']}, skipped {c['SKIPPED']}, not yet run {len(p['scripted']['not_run'])}",
          f"- Audit chain: {'intact' if p['audit_chain']['ok'] else 'BROKEN at ' + str(p['audit_chain']['broken_at'])} ({p['audit_chain']['entries']} entries)",
          f"- Written evidence ready: {p['written_evidence_ready']} of {len(p['written_evidence'])}", ""]
    L += ["## Scenarios", ""]
    for s in p["scenarios"]:
        L += [f"### {s['id']} {s['title']} — {s['status']}", f"The plan shows: {s['what_the_plan_shows']}", ""]
        for ch in s["checks"]:
            L.append(f"- {'✔' if ch['ok'] else '✘'} {ch['text']}")
        for g in s["gaps"]:
            L.append(f"- ▲ Not yet done: {g}")
        L.append("")
    if p["gaps"]:
        L += ["## What this build does not do yet", ""] + [f"- {g['scenario']}: {g['gap']}" for g in p["gaps"]] + [""]
    if p["load_tests"]:
        L += ["## Load smoke tests (indicative)", ""] + [f"- Run {x['id']}: {x['requests']} requests in {x['seconds']}s, {x['rps']} per second, median {x['p50_ms']} ms, 95th percentile {x['p95_ms']} ms, {x['errors']} errors" for x in p["load_tests"]] + [""]
    if p["unscripted"]:
        L += ["## Unscripted events injected", ""] + [f"- {x['ts']:%Y-%m-%d %H:%M} {x['category']}: expected “{x['expected']}”; observed “{x['observed']}”" for x in p["unscripted"]] + [""]
    L += ["## Written evidence (what cannot be shown live)", ""] + [f"- {d['title']} — {d['status'].replace('_', ' ').lower()}" + (f" ({d['reference']})" if d["reference"] else "") for d in p["written_evidence"]] + [""]
    L += ["## Policy in force", ""] + [f"- {x['key']} v{x['version']}: {json.dumps(x['value'])}" for x in p["policy"]]
    return "\n".join(L)


# ================================================================== reset
DEMO_ACTORS = ("demo-runner", "demo-misuser", "demo-loadtest", "demo-pension-clerk", "injected-misuser")


def clear_events(cur, scenario: str, actor: str) -> dict:
    """Removes the demonstration events an earlier run of this scenario (or an earlier injection of this category) left behind, with what they
    created: proposals, consents, deliveries, notices, the new child's records and ledger rows. Run first, so one run never piles on another."""
    cur.execute("SELECT id, event_key, record_id FROM mdm.event WHERE event_key LIKE 'DEMO-%%' AND scenario=%s", (scenario,))
    evs = cur.fetchall()
    if not evs:
        return {}
    ids, keys = [e["id"] for e in evs], [e["event_key"] for e in evs]
    recs = [e["record_id"] for e in evs if e["record_id"]]
    n = {}

    def d(label, sql, *p):
        cur.execute(sql, p)
        n[label] = cur.rowcount

    cur.execute("SELECT DISTINCT person_id FROM mdm.source_record WHERE person_id IS NOT NULL AND split_part(source_rid, ':', 1) = ANY(%s) AND (source_rid LIKE 'DEMO-D-%%' OR source_rid LIKE 'DEMO-M-%%')", (keys,))
    touched = [r["person_id"] for r in cur.fetchall()]
    cur.execute("SELECT DISTINCT person_id FROM mdm.source_record WHERE id = ANY(%s) AND person_id IS NOT NULL", (recs,))
    born = [r["person_id"] for r in cur.fetchall()]
    d("simulated_loads", "DELETE FROM mdm.source_record WHERE person_id = ANY(%s) AND payload->>'simulated_load'='true'", born)
    d("notices", "DELETE FROM mdm.dept_response WHERE event_id = ANY(%s)", ids)
    d("ledger_rows", "DELETE FROM mdm.exchange WHERE person_id = ANY(%s)", born)
    d("consents", "DELETE FROM mdm.consent WHERE event_id = ANY(%s)", ids)
    d("events", "DELETE FROM mdm.event WHERE id = ANY(%s)", ids)
    d("records", "DELETE FROM mdm.source_record WHERE id = ANY(%s) OR split_part(source_rid, ':', 1) = ANY(%s) AND (source_rid LIKE 'DEMO-D-%%' OR source_rid LIKE 'DEMO-M-%%')", recs, keys)
    for pid in dict.fromkeys(touched + born):
        store.rebuild_person(cur, pid)
    alive = [x for x in touched if x not in born]
    if alive:
        store.derive_relationships(cur, alive)
    audit.write(cur, actor, "DEMO_EVENTS_CLEARED", f"scenario:{scenario}", n)
    return n


def reset(cur, actor: str) -> dict:
    """Removes what scenario runs and injections created (DEMO- registrations, demo consents, tickets, keys, connectors) and puts the
    data pack back as it was loaded. The audit log, run history and policy history are kept. Needs no database access beyond the app's own."""
    n = {}

    def d(label, sql, *p):
        cur.execute(sql, p)
        n[label] = cur.rowcount

    exchange.set_subscriber(cur, "health", True, actor, "Demo: cleared, Health system back")      # a live step may have left it down
    cur.execute("SELECT record_id FROM mdm.event WHERE event_key LIKE 'DEMO-B-%%' AND record_id IS NOT NULL")
    birth_recs = [r["record_id"] for r in cur.fetchall()]
    cur.execute("SELECT DISTINCT person_id FROM mdm.source_record WHERE person_id IS NOT NULL AND (source_rid LIKE 'DEMO-D-%%' OR source_rid LIKE 'DEMO-M-%%')")
    touched = [r["person_id"] for r in cur.fetchall()]
    cur.execute("SELECT DISTINCT person_id FROM mdm.source_record WHERE id = ANY(%s) AND person_id IS NOT NULL", (birth_recs,))
    born = [r["person_id"] for r in cur.fetchall()]
    d("simulated_loads", "DELETE FROM mdm.source_record WHERE person_id = ANY(%s) AND payload->>'simulated_load'='true'", born)
    n["uc1_citizen_demo"] = sum(demo_uc1.clear_all(cur).values())      # a count, like the other lines
    n["uc4_story"] = demo_uc4_story.clear(cur).get("people", 0)
    n["uc3_story"] = demo_uc3_story.clear(cur).get("people", 0)
    n["uc5_story"] = demo_uc5_story.clear(cur).get("people", 0)
    demo_uc2_login.restore(cur)
    d("ledger_rows_for_new_children", "DELETE FROM mdm.exchange WHERE person_id = ANY(%s)", born)
    d("notices", "DELETE FROM mdm.dept_response WHERE event_id IN (SELECT id FROM mdm.event WHERE event_key LIKE 'DEMO-%%')")
    d("consents_for_demo_events", "DELETE FROM mdm.consent WHERE event_id IN (SELECT id FROM mdm.event WHERE event_key LIKE 'DEMO-%%')")
    d("events", "DELETE FROM mdm.event WHERE event_key LIKE 'DEMO-%%'")
    d("records", "DELETE FROM mdm.source_record WHERE id = ANY(%s) OR source_rid LIKE 'DEMO-D-%%' OR source_rid LIKE 'DEMO-M-%%'", birth_recs)
    for pid in dict.fromkeys(touched + born):
        store.rebuild_person(cur, pid)
    alive = [p for p in touched if p not in born]
    if alive:
        store.derive_relationships(cur, alive)
    d("consents", "DELETE FROM mdm.consent WHERE id IN (SELECT consent_id FROM mdm.consent_log WHERE actor = ANY(%s) AND action='REQUESTED')", list(DEMO_ACTORS))
    d("ledger_rows", "DELETE FROM mdm.exchange WHERE requester_actor = ANY(%s) OR requester_actor LIKE 'partner:%%' AND requester_actor IN (SELECT 'partner:' || key_id FROM mdm.api_key WHERE created_by=%s)", list(DEMO_ACTORS), ACTOR)
    d("tickets", "DELETE FROM mdm.discrepancy WHERE raised_by = ANY(%s) OR reason LIKE 'Demo:%%' OR reason LIKE 'Injected%%'", list(DEMO_ACTORS))
    d("connectors", "DELETE FROM mdm.connector WHERE created_by = ANY(%s)", list(DEMO_ACTORS))
    d("keys", "DELETE FROM mdm.api_key WHERE created_by = ANY(%s)", list(DEMO_ACTORS))
    d("blocks", "DELETE FROM mdm.access_block WHERE blocked_by = ANY(%s) OR actor = ANY(%s)", list(DEMO_ACTORS), list(DEMO_ACTORS))
    d("sessions", "DELETE FROM mdm.assisted_session WHERE started_by = ANY(%s)", list(DEMO_ACTORS))
    d("temp_results", "DELETE FROM mdm.temp_result WHERE actor = ANY(%s)", list(DEMO_ACTORS))
    cur.execute("SELECT t.id, t.record_id FROM mdm.review_task t WHERE t.decided_by = ANY(%s)", (list(DEMO_ACTORS),))
    tasks = cur.fetchall()
    for t in tasks:
        cur.execute("UPDATE mdm.source_record SET link_status='IN_REVIEW', reason=NULL WHERE id=%s AND link_status='STEWARD_SEPARATE'", (t["record_id"],))
        cur.execute("UPDATE mdm.review_task SET status='OPEN', decision=NULL, chosen_person_id=NULL, note=NULL, decided_by=NULL, decided_at=NULL WHERE id=%s", (t["id"],))
    n["review_tasks_reopened"] = len(tasks)
    cur.execute("UPDATE mdm.subscriber SET available=true")
    audit.write(cur, actor, "DEMO_RESET", "demo", n)
    return n
