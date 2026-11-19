"""Data lineage at three levels, built from what the platform already records.

  field   : for each master value, which systems offered which value, which one won and by which rule
  record  : each department record behind a person, with its load run, freshness and link reason
  flow    : an event followed through proposals, consent, deliveries, the clearing house and the audit log

Plus an overview of sources -> master data -> outputs -> consuming departments, and an OpenLineage-shaped export so the
same lineage can later be loaded into a catalogue such as OpenMetadata. Nothing here is stored separately: it is all derived.
"""
from __future__ import annotations
from datetime import datetime, timezone

from .exchange import SYSTEMS, PURPOSES
from .sources import SOURCE_INFO, SOURCE_ORDER
from .stewardship import Refused

LINKED = ("AUTO_LINKED", "STEWARD_LINKED", "ANCHOR")


def src_name(s: str | None) -> str:
    return SOURCE_INFO.get(s, (s or "unknown",))[0]


# ---------------------------------------------------------------------------------------- person: field and record level
def attach_history(cur, recs: list) -> None:
    """Give each record its link history (oldest first) and `last_change` (newest entry), from mdm.record_link_history."""
    for r in recs:
        r["history"], r["last_change"] = [], None
    if not recs:
        return
    keys = [(r["source"], r["source_rid"]) for r in recs]
    cur.execute("""SELECT h.source, h.source_rid, h.ts, h.event, h.from_person, h.to_person, h.from_status, h.to_status, h.score,
                          h.load_id, h.actor, h.note, h.reason, pf.mdm_id AS from_mdm_id, pt.mdm_id AS to_mdm_id
                   FROM mdm.record_link_history h
                   LEFT JOIN mdm.person pf ON pf.id=h.from_person LEFT JOIN mdm.person pt ON pt.id=h.to_person
                   WHERE (h.source, h.source_rid) IN (SELECT * FROM unnest(%s::text[], %s::text[]))
                   ORDER BY h.ts, h.id""", ([k[0] for k in keys], [k[1] for k in keys]))
    by = {}
    for h in cur.fetchall():
        h["score"] = float(h["score"]) if h["score"] is not None else None
        by.setdefault((h.pop("source"), h.pop("source_rid")), []).append(h)
    for r in recs:
        hist = by.get((r["source"], r["source_rid"]), [])
        r["history"] = hist
        r["last_change"] = hist[-1] if hist else None


def person_lineage(cur, pid: int) -> dict:
    cur.execute("SELECT id, mdm_id, name, source_count, life_status FROM mdm.person WHERE id=%s", (pid,))
    person = cur.fetchone()
    if not person:
        raise Refused("Person not found", 404)

    cur.execute("""SELECT r.id, r.source, r.source_rid, r.rtype, r.name, r.gender, r.dob, r.age, r.birth_year, r.address, r.district,
                          r.as_of, r.link_status, r.score, r.reason, r.load_id, l.finished_at AS loaded_at, l.rule_version
                   FROM mdm.source_record r LEFT JOIN mdm.load_run l ON l.id=r.load_id
                   WHERE r.person_id=%s ORDER BY r.source, r.id""", (pid,))
    recs = cur.fetchall()
    attach_history(cur, recs)
    by_src: dict[str, list] = {}
    for r in recs:
        r["dob"] = r["dob"].isoformat() if r["dob"] else None
        r["score"] = float(r["score"]) if r["score"] is not None else None
        by_src.setdefault(r["source"], []).append(r)
    sources = []
    for s in [x for x in SOURCE_ORDER if x in by_src] + [x for x in by_src if x not in SOURCE_ORDER]:
        info = SOURCE_INFO.get(s, (s, "", 0))
        sources.append({"source": s, "name": info[0], "interface": info[1], "freshness_hours": info[2], "records": by_src[s]})

    cur.execute("SELECT attribute, value, chosen_source, rule, alternatives, conflict FROM mdm.golden_attribute WHERE person_id=%s ORDER BY attribute", (pid,))
    fields = []
    for g in cur.fetchall():
        offers = []
        for a in g["alternatives"] or []:
            offers.append({"source": a.get("source"), "source_name": src_name(a.get("source")), "value": a.get("value"),
                           "agrees": a.get("value") == g["value"],
                           "chosen": a.get("source") == g["chosen_source"] and a.get("value") == g["value"]})
        fields.append({"attribute": g["attribute"], "value": g["value"], "chosen_source": g["chosen_source"], "chosen_source_name": src_name(g["chosen_source"]),
                       "rule": g["rule"], "conflict": g["conflict"], "offers": offers,
                       "distinct_values": len({o["value"] for o in offers})})
    order = {"name": 0, "dob": 1, "gender": 2, "address": 3}
    fields.sort(key=lambda f: (order.get(f["attribute"], 9), f["attribute"]))

    cur.execute("""SELECT rel.kind, rel.basis, rel.source, rel.ref, CASE WHEN rel.person_a=%s THEN rel.person_b ELSE rel.person_a END AS other_id,
                          CASE WHEN rel.person_a=%s THEN 'out' ELSE 'in' END AS direction
                   FROM mdm.relationship rel WHERE rel.person_a=%s OR rel.person_b=%s ORDER BY rel.kind, rel.id""", (pid, pid, pid, pid))
    rels = cur.fetchall()
    ids = list({r["other_id"] for r in rels})
    names = {}
    if ids:
        cur.execute("SELECT id, name, mdm_id FROM mdm.person WHERE id = ANY(%s)", (ids,))
        names = {r["id"]: r for r in cur.fetchall()}
    for r in rels:
        o = names.get(r["other_id"], {})
        r["other_name"], r["other_mdm_id"], r["source_name"] = o.get("name"), o.get("mdm_id"), src_name(r["source"])

    return {"person": person, "sources": sources, "fields": fields, "relationships": rels,
            "summary": {"systems": len(sources), "records": len(recs), "spellings": len({(r["name"] or "").strip() for r in recs if r["name"]}),
                        "conflicts": sum(1 for f in fields if f["distinct_values"] > 1)}}


# ----------------------------------------------------------------------------------------------- event: flow level
def _node(nodes, nid, kind, label, sub=None, status=None, ts=None, link=None, detail=None, status_text=None):
    nodes.append({"id": nid, "kind": kind, "label": label, "sub": sub, "status": status, "status_text": status_text, "ts": ts, "link": link, "detail": detail or {}})


def event_flow(cur, event_id: int) -> dict:
    from .exchange import CITIZEN_SQL, event_people
    cur.execute(f"SELECT e.*, {CITIZEN_SQL} AS citizen, pp.mdm_id AS person_mdm_id FROM mdm.event e LEFT JOIN mdm.person pp ON pp.id=e.person_id WHERE e.id=%s", (event_id,))
    ev = cur.fetchone()
    if not ev:
        raise Refused("Event not found", 404)
    nodes, edges = [], []

    # where it came from
    origin_src = None
    if ev["record_id"]:
        cur.execute("SELECT source, source_rid FROM mdm.source_record WHERE id=%s", (ev["record_id"],))
        rec = cur.fetchone()
        origin_src = rec and rec["source"]
    demo = str(ev["event_key"]).startswith("DEMO-") or ev["scenario"] is not None and str(ev["event_key"]).startswith("T-")
    if not origin_src:
        origin_src = "marriage_register" if "MARRIAGE" in ev["event_type"] else "crs"
    _node(nodes, "src", "source", src_name(origin_src), "Event feed" if not demo else "Event feed (demonstration record)", link="/dx/catalogue",
          detail={"source": origin_src, "interface": SOURCE_INFO.get(origin_src, ("", ""))[1]})
    _node(nodes, "ev", "event", ev["event_type"].replace("_", " ").title(), f"Key {ev['event_key']}", status=ev["status"], ts=ev["received_at"],
          link=f"/dx/events", detail={"event_id": ev["id"], "uc": ev["uc"], "scenario": ev["scenario"], "note": ev["note"], "event_key": ev["event_key"]})
    edges.append({"from": "src", "to": "ev", "label": "published"})

    if ev["person_id"]:
        cur.execute("SELECT id, mdm_id, name, source_count FROM mdm.person WHERE id=%s", (ev["person_id"],))
        p = cur.fetchone()
        if p:
            _node(nodes, "person", "person", p["name"], f"{p['mdm_id']} · in {p['source_count']} system(s)", link=f"/mdm?tab=people&person={p['id']}")
            edges.append({"from": "ev", "to": "person", "label": "matched to"})

    from .exchange import event_parents, event_people, PARENT_STATE
    TONE_KEY = {"LINKED": "LINKED", "AWAITING": "AWAITING_APPROVAL", "DECLINED": "NOT_APPROVED", "NOT_MATCHED": "NOT_MATCHED"}
    parents = event_parents(cur, ev)
    for q in parents:                                   # a birth: the mother and father, each linked to their own page when matched
        nid = f"parent_{q['role'].lower()}"
        _node(nodes, nid, "person", f"{q['role']}: {q['name']}", q["why"] or (f"{q['mdm_id']}" if q["mdm_id"] else None), status=TONE_KEY[q["state"]],
              status_text=PARENT_STATE[q["state"]], link=f"/mdm?tab=people&person={q['person_id']}" if q["person_id"] else None,
              detail={"role": q["role"], "registered_name": q["name"], "state": PARENT_STATE[q["state"]], "person_id": q["person_id"]})
        edges.append({"from": nid, "to": "person" if ev["person_id"] else "ev", "label": f"{q['role'].lower()} of"})
    if "MARRIAGE" in ev["event_type"]:                  # a marriage: both parties, whether or not each could be matched
        for q in event_people(cur, ev):
            if q["person_id"] and q["person_id"] == ev["person_id"]:
                continue
            nid = f"party_{(q['role'] or 'x').lower()}"
            _node(nodes, nid, "person", f"{q['role']}: {q['name']}", q.get("why") or q.get("mdm_id"), status=TONE_KEY.get(q.get("state"), "NOT_MATCHED"),
                  status_text=PARENT_STATE.get(q.get("state"), "not matched"), link=f"/mdm?tab=people&person={q['person_id']}" if q["person_id"] else None,
                  detail={"role": q["role"], "registered_name": q["name"], "state": PARENT_STATE.get(q.get("state"), "not matched"), "person_id": q["person_id"]})
            edges.append({"from": "ev", "to": nid, "label": "matched to" if q["person_id"] else "no match"})

    cur.execute("SELECT id, parent_id, kind, system, status, summary, decided_by, decided_at, created_at, rationale FROM mdm.proposal WHERE event_id=%s ORDER BY id", (event_id,))
    props = cur.fetchall()
    pids = {p["id"] for p in props}
    for p in props:
        nid = f"prop{p['id']}"
        _node(nodes, nid, "proposal", p["kind"].replace("_", " ").capitalize(), p["summary"], status=p["status"], ts=p["decided_at"] or p["created_at"],
              link="/dx/approvals", detail={"system": p["system"], "kind": p["kind"], "decided_by": p["decided_by"], "rationale": p["rationale"],
                                                 "proposed_at": p["created_at"].isoformat() if p["created_at"] else None})
        edges.append({"from": f"prop{p['parent_id']}" if p["parent_id"] in pids else "ev", "to": nid,
                      "label": "follow-up" if p["parent_id"] in pids else "proposed"})

    cur.execute("SELECT id, system, purpose, kind, status, attempts, consent_id, created_at FROM mdm.delivery WHERE event_id=%s ORDER BY id", (event_id,))
    dels = cur.fetchall()
    cons = {}
    for d in dels:
        if d["consent_id"] and d["consent_id"] not in cons:
            cur.execute("SELECT id, purpose, status, channel_last FROM (SELECT c.id, c.purpose, c.status, "
                        "(SELECT channel FROM mdm.consent_log WHERE consent_id=c.id ORDER BY id DESC LIMIT 1) AS channel_last FROM mdm.consent c WHERE c.id=%s) x", (d["consent_id"],))
            c = cur.fetchone()
            if c:
                cons[c["id"]] = c
                _node(nodes, f"con{c['id']}", "consent", PURPOSES.get(c["purpose"], {}).get("name", c["purpose"]), f"Consent {c['id']}", status=c["status"],
                      link="/dx/consent", detail={"answered_via": c["channel_last"]})
                edges.append({"from": "ev", "to": f"con{c['id']}", "label": "asked"})
    for d in dels:
        nid = f"del{d['id']}"
        _node(nodes, nid, "delivery", SYSTEMS.get(d["system"], d["system"]), PURPOSES.get(d["purpose"], {}).get("name", d["purpose"]) + (" (withdrawal notice)" if d["kind"] == "REVOCATION" else ""),
              status=d["status"], ts=d["created_at"], link="/dx/control", detail={"attempts": d["attempts"], "purpose": PURPOSES.get(d["purpose"], {}).get("name", d["purpose"]), "kind": d["kind"], "consent_id": d["consent_id"]})
        edges.append({"from": f"con{d['consent_id']}" if d["consent_id"] in cons else "ev", "to": nid,
                      "label": "allowed" if d["consent_id"] in cons else "sent to"})

    # clearing house rows for this person and these consents
    if ev["person_id"] and cons:
        cur.execute("SELECT id, ts, kind, requester, purpose, outcome FROM mdm.exchange WHERE person_id=%s AND consent_id = ANY(%s) ORDER BY id LIMIT 12", (ev["person_id"], list(cons)))
        ex = cur.fetchall()
        if ex:
            _node(nodes, "ledger", "ledger", f"{len(ex)} entr{'y' if len(ex) == 1 else 'ies'} in the clearing house", "What was released, to whom, under which consent",
                  link="/dx/ledger", detail={"rows": [{"id": e["id"], "ts": e["ts"].isoformat() if e["ts"] else None, "kind": e["kind"], "requester": e["requester"], "purpose": e["purpose"], "outcome": e["outcome"]} for e in ex]})
            for c in cons:
                edges.append({"from": f"con{c}", "to": "ledger", "label": "recorded"})

    subjects = [f"event:{event_id}"] + [f"proposal:{i}" for i in pids] + [f"consent:{c}" for c in cons] + [f"delivery:{d['id']}" for d in dels]
    cur.execute("SELECT seq, ts, actor, action, subject FROM mdm.audit WHERE subject = ANY(%s) ORDER BY seq LIMIT 40", (subjects,))
    au = cur.fetchall()
    if au:
        _node(nodes, "audit", "audit", f"{len(au)} audit entr{'y' if len(au) == 1 else 'ies'}", "Tamper-evident log, each line fingerprints the one before", link="/dx/audit",
              detail={"rows": [{"seq": a["seq"], "ts": a["ts"].isoformat() if a["ts"] else None, "actor": a["actor"], "action": a["action"], "subject": a["subject"]} for a in au]})
        edges.append({"from": "ev", "to": "audit", "label": "logged"})
    for n in nodes:
        if isinstance(n["ts"], datetime):
            n["ts"] = n["ts"].isoformat()
    return {"event": {"id": ev["id"], "event_type": ev["event_type"], "event_key": ev["event_key"], "status": ev["status"], "uc": ev["uc"],
                      "citizen": ev["citizen"], "person_id": ev["person_id"], "person_mdm_id": ev["person_mdm_id"], "people": event_people(cur, ev), "parents": parents,
                      "scenario": ev["scenario"], "scenario_title": __import__("app.demo_catalogue", fromlist=["title_of"]).title_of(ev["scenario"]) if ev["scenario"] else None,
                      "received_at": ev["received_at"]},
            "nodes": nodes, "edges": edges}


# ----------------------------------------------------------------------------------- overview: sources to consumers
def overview(cur, source: str | None = None) -> dict:
    """`source` narrows the core, output and consumer columns to the people that source holds (a person usually sits in several
    systems, so these are not exclusive to the source)."""
    cur.execute("""SELECT s.source, count(*) AS records, count(DISTINCT s.person_id) AS persons,
                          count(*) FILTER (WHERE s.link_status IN ('AUTO_LINKED','STEWARD_LINKED','ANCHOR')) AS linked,
                          count(*) FILTER (WHERE s.link_status='IN_REVIEW') AS in_review, max(left(s.as_of,10)) AS latest, max(l.finished_at) AS loaded_at
                   FROM mdm.source_record s LEFT JOIN mdm.load_run l ON l.id=s.load_id GROUP BY 1""")
    by = {r["source"]: r for r in cur.fetchall()}
    cur.execute("SELECT r.source, count(*) AS n FROM mdm.dq_issue i JOIN mdm.source_record r ON r.id=i.record_id WHERE i.status='OPEN' GROUP BY 1")
    dq = {r["source"]: r["n"] for r in cur.fetchall()}
    cur.execute("SELECT source, name, system, interface, auth_method, status FROM mdm.connector")
    con = {r["source"]: r for r in cur.fetchall()}
    sources = []
    for s in SOURCE_ORDER + [x for x in by if x not in SOURCE_ORDER]:
        if s not in by:
            continue
        info = SOURCE_INFO.get(s, (s, "", 0))
        r = by[s]
        sources.append({"source": s, "name": info[0], "interface": info[1], "freshness_hours": info[2], "records": r["records"], "persons": r["persons"],
                        "linked": r["linked"], "in_review": r["in_review"], "latest": r["latest"],
                        "loaded_at": r["loaded_at"].isoformat() if r["loaded_at"] else None, "open_issues": dq.get(s, 0),
                        "connector": (con.get(s) or {}).get("status")})
    ps = "(SELECT DISTINCT person_id FROM mdm.source_record WHERE source=%s AND person_id IS NOT NULL)"
    src = (source,) if source else ()
    sc = lambda col: f" WHERE {col} IN {ps}" if source else ""          # restrict a person_id column to the focused source's people
    def one(q, args=()):
        cur.execute(q, args)
        return cur.fetchone()["n"]
    persons = one("SELECT count(*) AS n FROM mdm.person" + sc("id"), src)
    golden = one("SELECT count(*) AS n FROM mdm.golden_attribute" + (" WHERE chosen_source=%s" if source else ""), src)
    rels = one("SELECT count(*) AS n FROM mdm.relationship" + (" WHERE source=%s" if source else ""), src)
    review = one("SELECT count(*) AS n FROM mdm.review_task t" + (" JOIN mdm.source_record r ON r.id=t.record_id AND r.source=%s" if source else "") + (" WHERE t.status='OPEN'"), src)
    cur.execute("SELECT id, finished_at, rule_version, stats FROM mdm.load_run ORDER BY id DESC LIMIT 1")
    load = cur.fetchone()
    events = one("SELECT count(*) AS n FROM mdm.event" + sc("person_id"), src)
    props = one("SELECT count(*) AS n FROM mdm.proposal" + sc("person_id"), src)
    ex = (" AND person_id IN " + ps) if source else ""
    answers = one("SELECT count(*) AS n FROM mdm.exchange WHERE kind = 'VERIFY'" + ex, src)
    queries = one("SELECT count(*) AS n FROM mdm.exchange WHERE kind = 'QUERY'" + ex, src)
    cur.execute("SELECT system, count(*) AS n, count(*) FILTER (WHERE status='DELIVERED') AS delivered FROM mdm.delivery" + sc("person_id") + " GROUP BY 1 ORDER BY 2 DESC", src)
    dels = cur.fetchall()
    cur.execute("SELECT requester, count(*) AS n FROM mdm.exchange WHERE requester IS NOT NULL" + ex + " GROUP BY 1 ORDER BY 2 DESC LIMIT 12", src)
    reqs = cur.fetchall()
    consumers: dict[str, dict] = {}
    for d in dels:
        c = consumers.setdefault(d["system"], {"system": d["system"], "name": SYSTEMS.get(d["system"], d["system"]), "events_delivered": 0, "events_total": 0, "answers": 0})
        c["events_delivered"], c["events_total"] = d["delivered"], d["n"]
    for r in reqs:
        key = next((k for k, v in SYSTEMS.items() if v == r["requester"] or k == r["requester"]), r["requester"])
        c = consumers.setdefault(key, {"system": key, "name": SYSTEMS.get(key, r["requester"]), "events_delivered": 0, "events_total": 0, "answers": 0})
        c["answers"] += r["n"]
    focus = next((x for x in sources if x["source"] == source), None)
    return {"sources": sources, "focus": source if focus else None,
            "core": {"records": focus["records"] if focus else sum(s["records"] for s in sources), "persons": persons, "golden_attributes": golden, "relationships": rels, "review_open": review,
                     "last_load": {"id": load["id"], "finished_at": load["finished_at"].isoformat(), "rule_version": load["rule_version"]} if load else None},
            "outputs": [{"kind": "events", "label": "Life events published", "count": events}, {"kind": "proposals", "label": "Actions proposed to people", "count": props},
                        {"kind": "answers", "label": "Verification answers", "count": answers}, {"kind": "queries", "label": "Bounded group queries", "count": queries}],
            "consumers": sorted(consumers.values(), key=lambda c: -(c["events_total"] + c["answers"]))}


# ---------------------------------------------------------------------------------------------------------- export
PRODUCER = "https://citizen-services.example/mdm-service"
SCHEMA = "https://openlineage.io/spec/2-0-2/OpenLineage.json#/$defs/RunEvent"


def export(cur) -> dict:
    """Lineage as OpenLineage-shaped run events. Datasets are the department sources, the master tables and the outputs."""
    ov = overview(cur)
    now = datetime.now(timezone.utc).isoformat()
    ns_src, ns_mdm, ns_out = "citizen-services/source", "citizen-services/mdm", "citizen-services/exchange"

    def ds(ns, name, facets=None):
        return {"namespace": ns, "name": name, **({"facets": facets} if facets else {})}

    def run(job, inputs, outputs, ns="citizen-services/mdm"):
        return {"eventType": "COMPLETE", "eventTime": now, "producer": PRODUCER, "schemaURL": SCHEMA,
                "job": {"namespace": ns, "name": job}, "run": {"runId": f"{job}-{now}"}, "inputs": inputs, "outputs": outputs}

    srcs = [ds(ns_src, s["source"], {"documentation": {"description": f"{s['name']} ({s['interface']})"}}) for s in ov["sources"]]
    events = [run("load-and-match", srcs, [ds(ns_mdm, "mdm.source_record"), ds(ns_mdm, "mdm.person")]),
              run("survivorship", [ds(ns_mdm, "mdm.source_record"), ds(ns_mdm, "mdm.person")], [ds(ns_mdm, "mdm.golden_attribute")]),
              run("relationship-derivation", [ds(ns_mdm, "mdm.source_record")], [ds(ns_mdm, "mdm.relationship")]),
              run("event-publisher", [ds(ns_mdm, "mdm.golden_attribute"), ds(ns_mdm, "mdm.relationship")], [ds(ns_out, "mdm.event"), ds(ns_out, "mdm.proposal"), ds(ns_out, "mdm.delivery")], ns_out),
              run("verification-and-queries", [ds(ns_mdm, "mdm.golden_attribute"), ds(ns_out, "mdm.consent")], [ds(ns_out, "mdm.exchange")], ns_out)]
    for c in ov["consumers"]:
        events.append(run(f"deliver-to-{c['system']}", [ds(ns_out, "mdm.delivery"), ds(ns_out, "mdm.exchange")], [ds("citizen-services/consumer", c["system"], {"documentation": {"description": c["name"]}})], ns_out))
    return {"format": "OpenLineage-shaped run events (not yet loaded into any catalogue)", "generated_at": now, "events": events}
