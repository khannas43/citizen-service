"""Persistence: rebuild the golden record, data-quality issues and relationships from the linked department records."""
from __future__ import annotations
import json
from .survivorship import build_golden, derive_dq, DEFAULT_SURVIVORSHIP

PERSON_COLS = ("name", "name_local", "gender", "dob", "birth_year", "district", "mandal", "village", "address",
               "life_status", "source_count", "record_count", "confidence")


def active_rules(cur) -> dict:
    cur.execute("SELECT config FROM mdm.rule_set WHERE active ORDER BY version DESC LIMIT 1")
    r = cur.fetchone()
    return r["config"] if r else {"match": {}, "survivorship": DEFAULT_SURVIVORSHIP}


def records_of(cur, person_ids: list[int]) -> dict[int, list[dict]]:
    cur.execute("SELECT * FROM mdm.source_record WHERE person_id = ANY(%s) ORDER BY id", (person_ids,))
    out: dict[int, list[dict]] = {}
    for r in cur.fetchall():
        out.setdefault(r["person_id"], []).append(r)
    return out


def write_person(cur, pid: int, recs: list[dict], surv: dict | None = None, keep_requested: bool = True) -> dict:
    g = build_golden(recs, surv)
    cur.execute(f"UPDATE mdm.person SET {', '.join(c + '=%s' for c in PERSON_COLS)}, updated_at=now() WHERE id=%s",
                [g[c] for c in PERSON_COLS] + [pid])
    cur.execute("DELETE FROM mdm.golden_attribute WHERE person_id=%s", (pid,))
    cur.executemany("INSERT INTO mdm.golden_attribute (person_id, attribute, value, chosen_source, rule, alternatives, conflict) "
                    "VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s)",
                    [(pid, a["attribute"], a["value"], a["chosen_source"], a["rule"], json.dumps(a["alternatives"]), a["conflict"])
                     for a in g["attributes"]])
    # regenerate open issues; ones a steward already acted on stay
    old = {}
    cur.execute("SELECT id, code, record_id, status FROM mdm.dq_issue WHERE person_id=%s", (pid,))
    for r in cur.fetchall():
        old[(r["code"], r["record_id"])] = r
    keep = set()
    for i in derive_dq(g, recs):
        k = (i["code"], i["record_id"])
        if k in old:
            keep.add(old[k]["id"])
            continue
        cur.execute("INSERT INTO mdm.dq_issue (person_id, record_id, code, severity, detail) VALUES (%s,%s,%s,%s,%s)",
                    (pid, i["record_id"], i["code"], i["severity"], i["detail"]))
    stale = [r["id"] for r in old.values() if r["id"] not in keep and r["status"] == "OPEN"]
    if stale:
        cur.execute("DELETE FROM mdm.dq_issue WHERE id = ANY(%s)", (stale,))
    return g


def rebuild_person(cur, pid: int):
    cur.execute("SELECT 1 FROM mdm.person WHERE id=%s", (pid,))
    if not cur.fetchone():
        return None
    recs = records_of(cur, [pid]).get(pid, [])
    if not recs:                                   # a person with no records left disappears
        cur.execute("DELETE FROM mdm.person WHERE id=%s", (pid,))
        return None
    return write_person(cur, pid, recs, active_rules(cur).get("survivorship"))


def derive_relationships(cur, person_ids: list[int] | None = None):
    """Spouses from the marriage register (and ration cards); parent/child from ration-card relations.
    Every edge says what it was derived from."""
    scope = "" if person_ids is None else " AND (a.person_id = ANY(%(ids)s) OR b.person_id = ANY(%(ids)s))"
    if person_ids is None:
        cur.execute("DELETE FROM mdm.relationship")
    else:
        cur.execute("DELETE FROM mdm.relationship WHERE person_a = ANY(%s) OR person_b = ANY(%s)", (person_ids, person_ids))
    p = {"ids": person_ids}
    cur.execute(f"""
      INSERT INTO mdm.relationship (person_a, person_b, kind, basis, source, ref)
      SELECT DISTINCT LEAST(a.person_id,b.person_id), GREATEST(a.person_id,b.person_id), 'SPOUSE',
             'Registered marriage', 'marriage_register', split_part(a.source_rid, ':', 1)
      FROM mdm.source_record a JOIN mdm.source_record b
        ON b.source = 'marriage_register' AND b.rtype = 'MARRIAGE_BRIDE' AND split_part(b.source_rid, ':', 1) = a.source_rid
      WHERE a.source = 'marriage_register' AND a.rtype = 'MARRIAGE_GROOM'
        AND a.person_id IS NOT NULL AND b.person_id IS NOT NULL AND a.person_id <> b.person_id {scope}""", p)
    cur.execute(f"""
      INSERT INTO mdm.relationship (person_a, person_b, kind, basis, source, ref)
      SELECT DISTINCT LEAST(a.person_id,b.person_id), GREATEST(a.person_id,b.person_id), 'SPOUSE',
             'Head and spouse on the same ration card', 'pds_view', a.ration_card
      FROM mdm.source_record a JOIN mdm.source_record b
        ON a.ration_card = b.ration_card AND a.source = 'pds_view' AND b.source = 'pds_view'
       AND a.relation = 'Head' AND b.relation = 'Spouse'
      WHERE a.person_id IS NOT NULL AND b.person_id IS NOT NULL AND a.person_id <> b.person_id
        AND COALESCE(a.payload->>'tenant','N') <> 'Y' AND COALESCE(b.payload->>'tenant','N') <> 'Y' {scope}
        AND NOT EXISTS (SELECT 1 FROM mdm.relationship r WHERE r.kind='SPOUSE'
                        AND r.person_a = LEAST(a.person_id,b.person_id) AND r.person_b = GREATEST(a.person_id,b.person_id))""", p)
    cur.execute(f"""
      INSERT INTO mdm.relationship (person_a, person_b, kind, basis, source, ref)
      SELECT DISTINCT a.person_id, b.person_id, 'PARENT_OF',
             CASE WHEN a.relation = 'Head' THEN 'Head of the ration card and son/daughter' ELSE 'Spouse of the card head and son/daughter (inferred)' END,
             'pds_view', a.ration_card
      FROM mdm.source_record a JOIN mdm.source_record b
        ON a.ration_card = b.ration_card AND a.source = 'pds_view' AND b.source = 'pds_view'
       AND a.relation IN ('Head','Spouse') AND b.relation IN ('Son','Daughter')
      WHERE a.person_id IS NOT NULL AND b.person_id IS NOT NULL AND a.person_id <> b.person_id
        AND COALESCE(a.payload->>'tenant','N') <> 'Y' AND COALESCE(b.payload->>'tenant','N') <> 'Y' {scope}""", p)
    cur.execute(f"""
      INSERT INTO mdm.relationship (person_a, person_b, kind, basis, source, ref)
      SELECT DISTINCT b.person_id, a.person_id, 'PARENT_OF', 'Father/mother of the card head', 'pds_view', a.ration_card
      FROM mdm.source_record a JOIN mdm.source_record b
        ON a.ration_card = b.ration_card AND a.source = 'pds_view' AND b.source = 'pds_view'
       AND a.relation = 'Head' AND b.relation IN ('Father','Mother')
      WHERE a.person_id IS NOT NULL AND b.person_id IS NOT NULL AND a.person_id <> b.person_id
        AND COALESCE(a.payload->>'tenant','N') <> 'Y' AND COALESCE(b.payload->>'tenant','N') <> 'Y' {scope}""", p)
