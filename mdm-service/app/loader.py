"""Load department extracts, run matching, write links, golden records, issues and relationships.
   python -m app.loader --dir /data/extracts [--force]"""
from __future__ import annotations
import argparse, csv, json, os, sys, time
from dataclasses import asdict
from itertools import combinations
from pathlib import Path

from .db import connect, STATE
from .sources import load_dir, SOURCE_INFO
from .matching import MatchConfig, cluster_records
from .survivorship import DEFAULT_SURVIVORSHIP
from . import audit, store

RESET_ORDER = ["dq_issue", "relationship", "golden_attribute", "review_task", "source_record", "person"]


def _js(x):
    return json.dumps(x, default=str, ensure_ascii=False)


def answer_key(folder: Path, recs, dec, members):
    f = folder / "truth_links.csv"
    if not f.exists():
        return None
    truth = {(r["source"], r["source_record_id"]): r["person_id"] for r in csv.DictReader(open(f, encoding="utf-8"))}
    by = {r.pk: truth.get((r.source, r.rid)) for r in recs}
    tp = fp = 0
    for ms in members.values():
        for a, b in combinations(ms, 2):
            if by[a] and by[b]:
                if by[a] == by[b]:
                    tp += 1
                else:
                    fp += 1
    per: dict = {}
    for r in recs:
        if by[r.pk]:
            per.setdefault(by[r.pk], []).append(r.pk)
    true_pairs = sum(len(v) * (len(v) - 1) // 2 for v in per.values())
    return {"precision": round(tp / max(tp + fp, 1), 4), "recall": round(tp / max(true_pairs, 1), 4),
            "true_persons": len(per), "clusters": len(members)}


def run_load(folder: str, state: str = STATE, actor: str = "loader", force: bool = False, rules: dict | None = None) -> dict:
    t0 = time.time()
    folder_p = Path(folder)
    if rules is None:
        with connect(state) as c0:
            cur0 = c0.cursor()
            cur0.execute("SELECT config FROM mdm.rule_set WHERE active ORDER BY version DESC LIMIT 1")
            row = cur0.fetchone()
            rules = row["config"] if row else {"match": {}, "survivorship": DEFAULT_SURVIVORSHIP}
    cfg = MatchConfig(**rules.get("match", {}))
    recs = load_dir(folder_p)
    dec, members = cluster_records(recs, cfg)
    key = answer_key(folder_p, recs, dec, members)
    with connect(state) as conn:
        cur = conn.cursor()
        cur.execute("SELECT count(*) AS n FROM mdm.review_task WHERE status='RESOLVED'")
        if cur.fetchone()["n"] and not force:
            raise SystemExit("Steward decisions exist for this state; reloading would discard them. Re-run with --force to proceed.")
        for t in RESET_ORDER:
            cur.execute(f"DELETE FROM mdm.{t}")
        cur.execute("SELECT count(*) AS n FROM mdm.rule_set")
        if not cur.fetchone()["n"]:
            cur.execute("INSERT INTO mdm.rule_set (version, config, active, created_by, note) VALUES (1, %s::jsonb, true, %s, 'Initial rules')",
                        (_js({"match": asdict(cfg), "survivorship": DEFAULT_SURVIVORSHIP}), actor))
        cur.execute("INSERT INTO mdm.load_run (rule_version) VALUES ((SELECT max(version) FROM mdm.rule_set WHERE active)) RETURNING id")
        load_id = cur.fetchone()["id"]
        cl_ids = sorted(members)
        cur.execute("SELECT nextval('mdm.person_id_seq') AS i FROM generate_series(1,%s)", (len(cl_ids),))
        pid_of = dict(zip(cl_ids, [r["i"] for r in cur.fetchall()]))
        cur.execute("SELECT nextval('mdm.source_record_id_seq') AS i FROM generate_series(1,%s)", (len(recs),))
        rid_of = {r.pk: x["i"] for r, x in zip(recs, cur.fetchall())}
        cur.executemany("INSERT INTO mdm.person (id, mdm_id) VALUES (%s, %s)", [(p, f"MDM-{p:08d}") for p in pid_of.values()])
        rows, mem_dicts = [], {c: [] for c in cl_ids}
        for r in recs:
            d = dec[r.pk]
            status = d.status
            if status == "NEW" and len(members[d.cluster]) > 1:
                status = "ANCHOR"
            rows.append((rid_of[r.pk], r.source, r.rid, r.rtype, r.name, r.gender, r.dob, r.age, r.byear, r.district, r.mandal,
                         r.village, r.address, r.ration_card, r.household_id, r.relation, r.as_of, _js(r.raw), _js(r.parents), pid_of[d.cluster],
                         status, round(d.score, 4), d.reason or None, _js(d.evidence), load_id))
            mem_dicts[d.cluster].append(dict(id=rid_of[r.pk], source=r.source, source_rid=r.rid, rtype=r.rtype, name=r.name, gender=r.gender,
                                              dob=r.dob, age=r.age, birth_year=r.byear, district=r.district, mandal=r.mandal, village=r.village,
                                              address=r.address, ration_card=r.ration_card, relation=r.relation, as_of=r.as_of, payload=r.raw,
                                              link_status=status, score=d.score))
        cur.executemany("""INSERT INTO mdm.source_record (id, source, source_rid, rtype, name, gender, dob, age, birth_year, district, mandal,
                           village, address, ration_card, household_id, relation, as_of, payload, parents, person_id, link_status, score, reason,
                           evidence, load_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s,%s::jsonb,%s)""", rows)
        reviews = []
        for r in recs:
            d = dec[r.pk]
            if d.status == "IN_REVIEW":
                cands = [{"person_id": pid_of[c], "score": round(s, 4), "evidence": ev} for c, s, ev in d.candidates if c != d.cluster]
                reviews.append((rid_of[r.pk], _js(cands)))
        cur.executemany("INSERT INTO mdm.review_task (record_id, candidates) VALUES (%s, %s::jsonb)", reviews)
        surv = rules.get("survivorship")
        for c in cl_ids:
            store.write_person(cur, pid_of[c], mem_dicts[c], surv)
        store.derive_relationships(cur)
        cur.execute("SELECT status, count(*) AS n FROM (SELECT link_status AS status FROM mdm.source_record) s GROUP BY 1")
        links = {r["status"]: r["n"] for r in cur.fetchall()}
        stats = {"records": len(recs), "persons": len(cl_ids), "links": links, "review_tasks": len(reviews),
                 "seconds": round(time.time() - t0, 1), "answer_key": key, "folder": str(folder)}
        cur.execute("UPDATE mdm.load_run SET finished_at=now(), stats=%s::jsonb WHERE id=%s", (_js(stats), load_id))
        audit.write(cur, actor, "LOAD", f"load_run:{load_id}", stats)
        conn.commit()
    return stats


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--state", default=STATE)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    print(json.dumps(run_load(a.dir, a.state, "loader", a.force), indent=2))
