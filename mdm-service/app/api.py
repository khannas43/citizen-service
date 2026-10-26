"""MDM service API. Mounted under /mdm-service in the cluster; the officer portal's nginx forwards /mdm-service/ here."""
from __future__ import annotations
import json, os
from dataclasses import asdict
from typing import Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel

from . import audit, auth, store, stewardship
from .db import connect, STATE
from .matching import MatchConfig, cluster_records
from .model import Rec
from .sources import SOURCE_INFO, SOURCE_ORDER
from .survivorship import DEFAULT_SURVIVORSHIP, RULE_TEXT

BASE = os.getenv("MDM_BASE", "/mdm-service")      # context path, like the other services
app = FastAPI(title="Master Data Management service", docs_url=f"{BASE}/docs", openapi_url=f"{BASE}/openapi.json")
router = APIRouter()


def cur_dep():
    with connect() as conn:
        cur = conn.cursor()
        yield cur
        conn.commit()


def label(src: str) -> str:
    return SOURCE_INFO.get(src, (src,))[0]


def page(cur, sql_from: str, params: list, select: str, order: str, limit: int, offset: int):
    cur.execute(f"SELECT count(*) AS n FROM {sql_from}", params)
    total = cur.fetchone()["n"]
    cur.execute(f"SELECT {select} FROM {sql_from} ORDER BY {order} LIMIT %s OFFSET %s", params + [limit, offset])
    return {"total": total, "limit": limit, "offset": offset, "items": cur.fetchall()}


@router.get("/api/health")
def health():
    return {"status": "ok", "state": STATE}


# ---------------------------------------------------------------- dashboard
@router.get("/api/dashboard")
def dashboard(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    cur.execute("SELECT count(*) AS persons, count(*) FILTER (WHERE life_status='DECEASED') AS deceased, "
                "count(*) FILTER (WHERE source_count>=3) AS well_linked FROM mdm.person")
    totals = cur.fetchone()
    cur.execute("SELECT count(*) AS n FROM mdm.source_record")
    totals["records"] = cur.fetchone()["n"]
    cur.execute("SELECT link_status, count(*) AS n FROM mdm.source_record GROUP BY 1")
    links = {r["link_status"]: r["n"] for r in cur.fetchall()}
    cur.execute("SELECT status, count(*) AS n FROM mdm.review_task GROUP BY 1")
    reviews = {r["status"]: r["n"] for r in cur.fetchall()}
    cur.execute("SELECT s.source, count(*) AS records, count(DISTINCT s.person_id) AS persons, "
                "count(*) FILTER (WHERE s.link_status IN ('AUTO_LINKED','STEWARD_LINKED','ANCHOR')) AS linked, "
                "count(*) FILTER (WHERE s.link_status='IN_REVIEW') AS in_review, max(left(s.as_of,10)) AS latest "
                "FROM mdm.source_record s GROUP BY 1")
    by = {r["source"]: r for r in cur.fetchall()}
    cur.execute("SELECT source, count(*) AS open FROM mdm.dq_issue i JOIN mdm.source_record r ON r.id=i.record_id WHERE i.status='OPEN' GROUP BY 1")
    issues = {r["source"]: r["open"] for r in cur.fetchall()}
    sources = []
    for s in SOURCE_ORDER:
        info = SOURCE_INFO[s]
        r = by.get(s, {})
        sources.append({"source": s, "name": info[0], "interface": info[1], "freshness_hours": info[2], "records": r.get("records", 0),
                        "persons": r.get("persons", 0), "linked": r.get("linked", 0), "in_review": r.get("in_review", 0),
                        "latest": r.get("latest"), "open_issues": issues.get(s, 0)})
    cur.execute("SELECT code, severity, status, count(*) AS n FROM mdm.dq_issue GROUP BY 1,2,3 ORDER BY n DESC")
    dq = cur.fetchall()
    cur.execute("SELECT source_count, count(*) AS n FROM mdm.person GROUP BY 1 ORDER BY 1")
    coverage = cur.fetchall()
    cur.execute("SELECT id, started_at, finished_at, rule_version, stats FROM mdm.load_run ORDER BY id DESC LIMIT 5")
    return {"totals": totals, "links": links, "reviews": reviews, "sources": sources, "dq": dq, "coverage": coverage, "loads": cur.fetchall()}


# ---------------------------------------------------------------- persons
@router.get("/api/persons")
def persons(q: Optional[str] = None, district: Optional[str] = None, source: Optional[str] = None, life_status: Optional[str] = None,
            has_issue: Optional[bool] = None, min_sources: int = 0, limit: int = Query(25, le=200), offset: int = 0,
            cur=Depends(cur_dep), _=Depends(auth.can_read)):
    where, params = ["1=1"], []
    if q:
        where.append("(p.name ILIKE %s OR p.name_local ILIKE %s OR p.mdm_id ILIKE %s OR EXISTS (SELECT 1 FROM mdm.source_record r WHERE r.person_id=p.id "
                     "AND (r.ration_card ILIKE %s OR r.source_rid ILIKE %s OR r.name ILIKE %s)))")
        params += [f"%{q}%"] * 6
    if district:
        where.append("p.district = %s"); params.append(district)
    if source:
        where.append("EXISTS (SELECT 1 FROM mdm.source_record r WHERE r.person_id=p.id AND r.source=%s)"); params.append(source)
    if life_status:
        where.append("p.life_status=%s"); params.append(life_status)
    if has_issue:
        where.append("EXISTS (SELECT 1 FROM mdm.dq_issue i WHERE i.person_id=p.id AND i.status='OPEN')")
    if min_sources:
        where.append("p.source_count >= %s"); params.append(min_sources)
    res = page(cur, "mdm.person p WHERE " + " AND ".join(where), params,
               "p.id, p.mdm_id, p.name, p.name_local, p.gender, p.dob, p.birth_year, p.district, p.mandal, p.life_status, p.source_count, "
               "p.record_count, p.confidence, (SELECT count(*) FROM mdm.dq_issue i WHERE i.person_id=p.id AND i.status='OPEN') AS open_issues",
               "p.name, p.id", limit, offset)
    return res


@router.get("/api/persons/{pid}")
def person360(pid: int, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    cur.execute("SELECT * FROM mdm.person WHERE id=%s", (pid,))
    p = cur.fetchone()
    if not p:
        raise HTTPException(404, "Person not found")
    cur.execute("SELECT attribute, value, chosen_source, rule, alternatives, conflict FROM mdm.golden_attribute WHERE person_id=%s ORDER BY id", (pid,))
    attrs = cur.fetchall()
    cur.execute("SELECT id, source, source_rid, rtype, name, gender, dob, age, birth_year, district, mandal, village, address, ration_card, relation, "
                "as_of, link_status, score, reason, evidence, payload FROM mdm.source_record WHERE person_id=%s ORDER BY id", (pid,))
    recs = cur.fetchall()
    for r in recs:
        r["source_name"] = label(r["source"])
    have = {r["source"] for r in recs}
    missing = [{"source": s, "name": SOURCE_INFO[s][0], "note": "No record found. This is not the same as 'no entitlement' or 'not married'; "
                "it means this system holds nothing that links to this person."} for s in SOURCE_ORDER if s not in have]
    cur.execute("SELECT r.id, r.kind, r.basis, r.source, r.ref, r.person_a, r.person_b, o.id AS oid, o.mdm_id, o.name, o.life_status, o.gender, o.birth_year "
                "FROM mdm.relationship r JOIN mdm.person o ON o.id = CASE WHEN r.person_a=%s THEN r.person_b ELSE r.person_a END "
                "WHERE r.person_a=%s OR r.person_b=%s ORDER BY r.kind, o.name", (pid, pid, pid))
    rels = []
    for r in cur.fetchall():
        role = "SPOUSE" if r["kind"] == "SPOUSE" else ("PARENT" if r["person_b"] == pid else "CHILD")
        rels.append({"kind": r["kind"], "role_of_other": role, "basis": r["basis"], "source": r["source"], "ref": r["ref"],
                     "other": {"id": r["oid"], "mdm_id": r["mdm_id"], "name": r["name"], "life_status": r["life_status"],
                               "gender": r["gender"], "birth_year": r["birth_year"]}})
    cur.execute("SELECT id, code, severity, detail, status, correction_note, record_id FROM mdm.dq_issue WHERE person_id=%s ORDER BY severity, id", (pid,))
    issues = cur.fetchall()
    cur.execute("SELECT seq, ts, actor, action, subject, detail FROM mdm.audit WHERE detail->>'from_person'=%s OR detail->>'to_person'=%s "
                "OR subject=%s ORDER BY seq DESC LIMIT 20", (str(pid), str(pid), f"person:{pid}"))
    return {"person": p, "attributes": attrs, "records": recs, "missing_sources": missing, "relationships": rels, "issues": issues,
            "audit": cur.fetchall()}


@router.get("/api/persons/{pid}/graph")
def person_graph(pid: int, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    cur.execute("SELECT 1 FROM mdm.person WHERE id=%s", (pid,))
    if not cur.fetchone():
        raise HTTPException(404, "Person not found")
    cur.execute("SELECT DISTINCT other FROM (SELECT CASE WHEN person_a=%s THEN person_b ELSE person_a END AS other FROM mdm.relationship "
                "WHERE person_a=%s OR person_b=%s UNION SELECT r2.person_id FROM mdm.source_record r1 JOIN mdm.source_record r2 "
                "ON r2.ration_card=r1.ration_card WHERE r1.person_id=%s AND r1.source='pds_view' AND r2.source='pds_view' "
                "AND r2.person_id IS NOT NULL) x", (pid, pid, pid, pid))
    ids = sorted({pid} | {r["other"] for r in cur.fetchall()})
    cur.execute("SELECT id, mdm_id, name, gender, birth_year, life_status, source_count FROM mdm.person WHERE id=ANY(%s)", (ids,))
    nodes = cur.fetchall()
    cur.execute("SELECT person_a AS source, person_b AS target, kind, basis FROM mdm.relationship WHERE person_a=ANY(%s) AND person_b=ANY(%s)", (ids, ids))
    return {"focus": pid, "nodes": nodes, "edges": cur.fetchall()}


@router.get("/api/households/{ration_card}")
def household(ration_card: str, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    cur.execute("SELECT r.id AS record_id, r.relation, r.age, r.payload->>'tenant' AS tenant, r.payload->>'member_status' AS card_status, "
                "p.id, p.mdm_id, p.name, p.gender, p.birth_year, p.life_status, p.source_count FROM mdm.source_record r "
                "LEFT JOIN mdm.person p ON p.id=r.person_id WHERE r.source='pds_view' AND r.ration_card=%s ORDER BY r.id", (ration_card,))
    members = cur.fetchall()
    if not members:
        raise HTTPException(404, "Ration card not found")
    ids = [m["id"] for m in members if m["id"]]
    cur.execute("SELECT person_a AS source, person_b AS target, kind, basis FROM mdm.relationship WHERE person_a=ANY(%s) AND person_b=ANY(%s)", (ids, ids))
    return {"ration_card": ration_card, "members": members, "edges": cur.fetchall()}


# ---------------------------------------------------------------- review queue
@router.get("/api/review")
def review_queue(status: str = "OPEN", source: Optional[str] = None, limit: int = Query(25, le=200), offset: int = 0,
                 cur=Depends(cur_dep), _=Depends(auth.can_read)):
    where, params = ["t.status=%s"], [status]
    if source:
        where.append("r.source=%s"); params.append(source)
    res = page(cur, "mdm.review_task t JOIN mdm.source_record r ON r.id=t.record_id WHERE " + " AND ".join(where), params,
               "t.id, t.status, t.decision, t.decided_by, t.decided_at, r.id AS record_id, r.source, r.source_rid, r.name, r.dob, r.age, r.district, "
               "r.mandal, r.score, r.reason, jsonb_array_length(t.candidates) AS candidate_count",
               "r.score DESC, t.id", limit, offset)
    for i in res["items"]:
        i["source_name"] = label(i["source"])
    return res


@router.get("/api/review/{tid}")
def review_item(tid: int, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    cur.execute("SELECT t.*, r.source, r.source_rid, r.rtype, r.name, r.gender, r.dob, r.age, r.birth_year, r.district, r.mandal, r.village, "
                "r.address, r.ration_card, r.parents, r.payload, r.evidence, r.score, r.reason, r.person_id AS own_person "
                "FROM mdm.review_task t JOIN mdm.source_record r ON r.id=t.record_id WHERE t.id=%s", (tid,))
    t = cur.fetchone()
    if not t:
        raise HTTPException(404, "Review task not found")
    cands = []
    for c in t["candidates"]:
        cur.execute("SELECT id, mdm_id, name, name_local, gender, dob, birth_year, district, mandal, village, address, life_status, source_count "
                    "FROM mdm.person WHERE id=%s", (c["person_id"],))
        person = cur.fetchone()
        if not person:
            continue
        cur.execute("SELECT source, name, dob, age, district, mandal, village FROM mdm.source_record WHERE person_id=%s ORDER BY id LIMIT 8", (c["person_id"],))
        cands.append({"person": person, "score": c["score"], "evidence": c["evidence"], "records": cur.fetchall()})
    t["source_name"] = label(t["source"])
    t["candidate_details"] = cands
    return t


class Decision(BaseModel):
    decision: str
    person_id: Optional[int] = None
    note: Optional[str] = None


def run(fn, *a):
    try:
        return fn(*a)
    except stewardship.Refused as e:
        raise HTTPException(e.code, str(e))


@router.post("/api/review/{tid}/decision")
def decide(tid: int, body: Decision, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(stewardship.decide, cur, tid, body.decision, body.person_id, u["actor"], body.note)


class Note(BaseModel):
    note: Optional[str] = None


@router.post("/api/records/{rid}/unlink")
def unlink(rid: int, body: Note, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(stewardship.unlink, cur, rid, u["actor"], body.note)


# ---------------------------------------------------------------- data quality
@router.get("/api/dq/summary")
def dq_summary(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    cur.execute("SELECT i.code, i.severity, count(*) AS total, count(*) FILTER (WHERE i.status='OPEN') AS open, "
                "count(*) FILTER (WHERE i.status='CORRECTION_REQUESTED') AS requested FROM mdm.dq_issue i GROUP BY 1,2 ORDER BY total DESC")
    by_code = cur.fetchall()
    cur.execute("SELECT r.source, count(*) AS n FROM mdm.dq_issue i JOIN mdm.source_record r ON r.id=i.record_id GROUP BY 1 ORDER BY n DESC")
    return {"by_code": by_code, "by_source": [{"source": r["source"], "name": label(r["source"]), "n": r["n"]} for r in cur.fetchall()]}


@router.get("/api/dq/issues")
def dq_issues(code: Optional[str] = None, severity: Optional[str] = None, status: Optional[str] = None, source: Optional[str] = None,
              limit: int = Query(25, le=200), offset: int = 0, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    where, params = ["1=1"], []
    for col, v in (("i.code", code), ("i.severity", severity), ("i.status", status), ("r.source", source)):
        if v:
            where.append(f"{col}=%s"); params.append(v)
    res = page(cur, "mdm.dq_issue i LEFT JOIN mdm.source_record r ON r.id=i.record_id JOIN mdm.person p ON p.id=i.person_id WHERE " + " AND ".join(where),
               params, "i.id, i.code, i.severity, i.detail, i.status, i.correction_note, i.requested_by, i.person_id, p.mdm_id, p.name, r.source, r.source_rid",
               "CASE i.severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, i.id", limit, offset)
    for i in res["items"]:
        i["source_name"] = label(i["source"]) if i["source"] else None
    return res


class Correction(BaseModel):
    note: str


@router.post("/api/dq/issues/{iid}/correction")
def correction(iid: int, body: Correction, cur=Depends(cur_dep), u=Depends(auth.can_write)):
    return run(stewardship.request_correction, cur, iid, body.note, u["actor"])


# ---------------------------------------------------------------- rules
@router.get("/api/rules")
def rules(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    cur.execute("SELECT version, config, active, created_by, created_at, note FROM mdm.rule_set ORDER BY version DESC")
    rows = cur.fetchall()
    cur.execute("SELECT config FROM mdm.rule_set WHERE active ORDER BY version DESC LIMIT 1")
    active = cur.fetchone()
    return {"active": active["config"] if active else {"match": asdict(MatchConfig()), "survivorship": DEFAULT_SURVIVORSHIP},
            "versions": rows, "survivorship_text": RULE_TEXT,
            "explain": {"auto": "At or above this score a record is linked automatically",
                        "review": "Between this score and auto, a steward decides",
                        "margin": "If two candidates are this close, a steward decides",
                        "info_needed": "Matches resting on name and district alone are not trusted below this amount of evidence"}}


class Preview(BaseModel):
    match: dict = {}


def _recs_from_db(cur) -> list[Rec]:
    cur.execute("SELECT * FROM mdm.source_record ORDER BY id")
    out = []
    for i, r in enumerate(cur.fetchall()):
        rec = Rec(pk=i, source=r["source"], rid=r["source_rid"], rtype=r["rtype"], name=r["name"] or "", gender=r["gender"], dob=r["dob"],
                  age=r["age"], byear=r["birth_year"], district=r["district"], mandal=r["mandal"], village=r["village"], address=r["address"],
                  ration_card=r["ration_card"], household_id=r["household_id"], relation=r["relation"], parents=r["parents"] or [],
                  as_of=r["as_of"], raw=r["payload"] or {})
        rec.db_status = r["link_status"]
        out.append(rec)
    return out


def _check_match(m: dict) -> MatchConfig:
    base = asdict(MatchConfig())
    for k in m:
        if k not in base:
            raise HTTPException(400, f"Unknown setting: {k}")
    base.update(m)
    if not (0 < base["review"] < base["auto"] <= 1):
        raise HTTPException(400, "Thresholds must satisfy 0 < review < auto <= 1")
    return MatchConfig(**base)


@router.post("/api/rules/preview")
def preview(body: Preview, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    """What would these settings do? Re-runs matching in memory on the stored records; nothing is changed."""
    cfg = _check_match(body.match)
    recs = _recs_from_db(cur)
    dec, members = cluster_records(recs, cfg)
    new = {"AUTO_LINKED": 0, "IN_REVIEW": 0, "NEW": 0}
    for d in dec.values():
        new[d.status] += 1
    cur.execute("SELECT link_status, count(*) AS n FROM mdm.source_record GROUP BY 1")
    cur_counts = {r["link_status"]: r["n"] for r in cur.fetchall()}
    cur.execute("SELECT count(*) AS n FROM mdm.person")
    n_persons = cur.fetchone()["n"]
    now_auto = cur_counts.get("AUTO_LINKED", 0)
    cur_review = cur_counts.get("IN_REVIEW", 0)
    cur_new = cur_counts.get("NEW", 0) + cur_counts.get("ANCHOR", 0)
    changed = [{"source": r.source, "id": r.rid, "name": r.name, "was": r.db_status, "would_be": dec[r.pk].status, "score": round(dec[r.pk].score, 3)}
               for r in recs if r.db_status in ("AUTO_LINKED", "IN_REVIEW") and r.db_status != dec[r.pk].status][:25]
    return {"settings": asdict(cfg), "would_produce": {"persons": len(members), **new},
            "currently": {"persons": n_persons, "AUTO_LINKED": now_auto, "IN_REVIEW": cur_review, "NEW": cur_new},
            "sample_of_changes": changed,
            "note": "Nothing was changed. Saving these settings applies them at the next reload."}


class SaveRules(BaseModel):
    match: dict
    note: Optional[str] = None


@router.post("/api/rules")
def save_rules(body: SaveRules, cur=Depends(cur_dep), u=Depends(auth.can_admin)):
    cfg = _check_match(body.match)
    cur.execute("SELECT config, coalesce((SELECT max(version) FROM mdm.rule_set),0)+1 AS v FROM mdm.rule_set WHERE active ORDER BY version DESC LIMIT 1")
    prev = cur.fetchone()
    surv = prev["config"].get("survivorship", DEFAULT_SURVIVORSHIP) if prev else DEFAULT_SURVIVORSHIP
    v = prev["v"] if prev else 1
    cur.execute("UPDATE mdm.rule_set SET active=false")
    cur.execute("INSERT INTO mdm.rule_set (version, config, active, created_by, note) VALUES (%s,%s::jsonb,true,%s,%s)",
                (v, json.dumps({"match": asdict(cfg), "survivorship": surv}), u["actor"], body.note))
    audit.write(cur, u["actor"], "RULES_SAVED", f"rule_set:{v}", {"match": asdict(cfg), "note": body.note})
    return {"version": v, "applies": "at the next reload of the extracts"}


# ---------------------------------------------------------------- audit
@router.get("/api/audit")
def audit_list(action: Optional[str] = None, limit: int = Query(25, le=200), offset: int = 0, cur=Depends(cur_dep), _=Depends(auth.can_read)):
    where, params = ["1=1"], []
    if action:
        where.append("action=%s"); params.append(action)
    return page(cur, "mdm.audit WHERE " + " AND ".join(where), params, "seq, ts, actor, action, subject, detail, left(hash,12) AS hash", "seq DESC", limit, offset)


@router.get("/api/audit/verify")
def audit_verify(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return audit.verify(cur)


@router.get("/api/sources")
def sources(cur=Depends(cur_dep), _=Depends(auth.can_read)):
    return [{"source": s, "name": SOURCE_INFO[s][0], "interface": SOURCE_INFO[s][1], "freshness_hours": SOURCE_INFO[s][2]} for s in SOURCE_ORDER]


app.include_router(router, prefix=BASE)
