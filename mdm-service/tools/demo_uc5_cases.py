#!/usr/bin/env python3
"""Demo only: plant synthetic UC5 housing households and raise the four household items through the real housing check.

Five households, each an adult applicant (with a household around them where the case needs one) and a housing consent
already GRANTED. Source records carry the source_rid prefix DEMO-UC5- so they can be found and removed. Output uses only
references and states, never an income value.

  1 duplicate    spouse and applicant both have an application on one ration card
  2 deadcard     a household member is recorded as deceased but still active on the ration card
  3 conflict     the housing record names a household that is not the applicant's ration card
  4 nohousehold  an applicant with no ration card and nobody linked
  5 clean        one application, one card, valid certificates: the control (nothing is raised)

  MDM_DB_DSN="host=... dbname=citizen_db ..." python3 mdm-service/tools/demo_uc5_cases.py          # dry run
  ... --apply        plant them and run the real housing checks, twice (the second run must raise nothing new)
  ... --remove       withdraw their items and delete exactly what this script created

  # On the cluster pod:
  #   kubectl -n citizen cp mdm-service/tools/demo_uc5_cases.py deploy/mdm-service:/tmp/demo_uc5_cases.py
  #   kubectl -n citizen exec deploy/mdm-service -- sh -c 'cd /opt/app && PYTHONPATH=/opt/app python /tmp/demo_uc5_cases.py --apply'
"""
from __future__ import annotations
import argparse, json, os, sys, uuid
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

PREFIX = "DEMO-UC5-"
ACTOR = "demo-uc5-script"
CASES = ("duplicate", "deadcard", "conflict", "nohousehold", "clean")
KINDS = ["REVIEW_DUPLICATE_BENEFIT", "REVIEW_CARD_MEMBER", "SETTLE_HOUSEHOLD_CONFLICT", "HOUSEHOLD_NOT_FOUND"]
EXPECT = {"duplicate": "DUPLICATE_BENEFIT", "deadcard": "CARD_DEAD_ACTIVE", "conflict": "HOUSEHOLD_CONFLICT", "nohousehold": "NO_HOUSEHOLD", "clean": None}
ELEMENTS = ["income_band", "residence", "household_benefit", "electricity_link", "land_holding", "duplicate_benefit"]


def _tag() -> str:
    return "".join(chr(97 + int(c, 16) % 26) for c in uuid.uuid4().hex[:8])


def _connect():
    from app.db import connect
    return connect()


def _person(cur, name: str, *, age: int, gender: str, on: date) -> int:
    cur.execute("SELECT nextval('mdm.person_id_seq') AS i")
    pid = cur.fetchone()["i"]
    cur.execute("INSERT INTO mdm.person (id, mdm_id, name, birth_year, gender, district, life_status) VALUES (%s,%s,%s,%s,%s,'Medak','ALIVE')",
                (pid, f"MDM-{pid:08d}", name, on.year - age, gender))
    return pid


def _rec(cur, pid: int, source: str, rid: str, rtype: str, name: str, payload: dict, card: str | None = None):
    cur.execute("""INSERT INTO mdm.source_record (person_id, source, source_rid, rtype, name, link_status, score, as_of, ration_card, payload)
                   VALUES (%s,%s,%s,%s,%s,'AUTO_LINKED',0.95,CURRENT_DATE,%s,%s::jsonb)""", (pid, source, rid, rtype, name, card, json.dumps(payload)))


def _couple(cur, case: str, tag: str, on: date):
    a = _person(cur, f"Demo Ucfive {case} Applicant {tag}", age=42, gender="M", on=on)
    s = _person(cur, f"Demo Ucfive {case} Spouse {tag}", age=38, gender="F", on=on)
    cur.execute("INSERT INTO mdm.relationship (person_a, person_b, kind, basis, source) VALUES (%s,%s,'SPOUSE','demo uc5','demo')", (a, s))
    card = f"{PREFIX}RC-{case}-{tag}"
    for p, w in ((a, "a"), (s, "s")):
        _rec(cur, p, "pds_view", f"{PREFIX}pds-{case}-{w}-{tag}", "RATION", f"Demo {w}", {}, card)
    return a, s, card


def _grant(cur, pid: int):
    from app import exchange
    c = exchange.request_consent(cur, pid, "HOUSEHOLD_BENEFIT", ACTOR, None)
    cur.execute("UPDATE mdm.consent SET status='GRANTED', responded_at=now(), scope=%s::jsonb, expires_at=now() + interval '90 days' WHERE id=%s",
                (json.dumps({"elements": ELEMENTS, "partial": False}), c["id"]))


def _plan(tag: str) -> list[dict]:
    return [{"case": c, "tag": tag} for c in CASES]


def _open(cur, pids: list[int]) -> list[dict]:
    cur.execute("SELECT id, kind, reason_code FROM mdm.proposal WHERE person_id = ANY(%s) AND kind = ANY(%s) AND status='PROPOSED' ORDER BY id", (pids, KINDS))
    return cur.fetchall()


def apply(cur, tag: str, on: date) -> list[dict]:
    from app import exchange
    exp, out = (on + timedelta(days=180)).isoformat(), []
    for case in CASES:
        if case == "nohousehold":
            a = _person(cur, f"Demo Ucfive nohousehold Applicant {tag}", age=40, gender="M", on=on)
            s, card = None, None
            _rec(cur, a, "housing", f"{PREFIX}app-nohh-{tag}", "APPLICATION", "Demo applicant", {"status": "SUBMITTED"})
            members = [a]
        else:
            a, s, card = _couple(cur, case, tag, on)
            members = [a, s]
            if case == "duplicate":
                _rec(cur, a, "housing", f"{PREFIX}app-dup-a-{tag}", "APPLICATION", "Demo a", {"status": "SUBMITTED"})
                _rec(cur, s, "housing", f"{PREFIX}app-dup-s-{tag}", "APPLICATION", "Demo s", {"status": "SUBMITTED"})
            elif case == "deadcard":
                cur.execute("INSERT INTO mdm.dq_issue (person_id, code, severity, status) VALUES (%s,'DEAD_ACTIVE_ON_RATION_CARD','HIGH','OPEN')", (s,))
                _rec(cur, a, "housing", f"{PREFIX}app-dead-{tag}", "APPLICATION", "Demo a", {"status": "SUBMITTED"})
            elif case == "conflict":
                _rec(cur, a, "housing", f"{PREFIX}app-conf-{tag}", "APPLICATION", "Demo a", {"status": "SUBMITTED", "household_ref": f"{PREFIX}RC-OTHER-{tag}"})
            elif case == "clean":
                _rec(cur, a, "housing", f"{PREFIX}app-clean-{tag}", "APPLICATION", "Demo a", {"status": "SUBMITTED"})
                _rec(cur, a, "revenue_certificates", f"{PREFIX}inc-clean-a-{tag}", "INCOME", "Demo a", {"annual_income": 90000, "valid_until": exp, "status": "ACTIVE"})
                _rec(cur, s, "revenue_certificates", f"{PREFIX}inc-clean-s-{tag}", "INCOME", "Demo s", {"annual_income": 120000, "valid_until": exp, "status": "ACTIVE"})
        _grant(cur, a)
        q = "DUPLICATE_BENEFIT" if case == "duplicate" else "HOUSEHOLD_HAS_BENEFIT"
        v = exchange.verify(cur, "housing", "HOUSEHOLD_BENEFIT", q, {}, ACTOR, person_id=a)
        row = {"case": case, "person_id": a, "members": members, "question": q, "outcome": v.get("outcome"), "answer": v.get("answer")}
        if case == "clean":
            inc = exchange.verify(cur, "housing", "HOUSEHOLD_BENEFIT", "HOUSEHOLD_INCOME_AT_MOST", {"limit": 200000}, ACTOR, person_id=a)
            row["income_answer"] = inc.get("answer")
        items = _open(cur, members)
        row["proposal_id"] = items[0]["id"] if items else None
        row["reason_code"] = items[0]["reason_code"] if items else None
        out.append(row)
    return out


def _demo_people(cur) -> list[int]:
    cur.execute("SELECT DISTINCT person_id AS id FROM mdm.source_record WHERE source_rid LIKE %s AND person_id IS NOT NULL", (PREFIX + "%",))
    return [r["id"] for r in cur.fetchall()]


def remove(cur) -> dict:
    pids = _demo_people(cur)
    if not pids:
        return {"people": 0, "withdrawn": 0, "source_records": 0, "consents": 0}
    cur.execute("""UPDATE mdm.proposal SET status='WITHDRAWN', note='demo uc5 remove', decided_by=%s, decided_at=now()
                   WHERE person_id = ANY(%s) AND status='PROPOSED' AND kind = ANY(%s)""", (ACTOR, pids, KINDS))
    withdrawn = cur.rowcount
    cur.execute("DELETE FROM mdm.delivery WHERE person_id = ANY(%s) AND purpose = ANY(%s)", (pids, KINDS))
    cur.execute("DELETE FROM mdm.dq_issue WHERE person_id = ANY(%s)", (pids,))
    cur.execute("DELETE FROM mdm.source_record WHERE person_id = ANY(%s)", (pids,))
    sr = cur.rowcount
    cur.execute("DELETE FROM mdm.consent WHERE person_id = ANY(%s) OR subject_person_id = ANY(%s)", (pids, pids))
    cons = cur.rowcount
    cur.execute("DELETE FROM mdm.relationship WHERE person_a = ANY(%s) OR person_b = ANY(%s)", (pids, pids))
    cur.execute("DELETE FROM mdm.person WHERE id = ANY(%s)", (pids,))
    return {"people": cur.rowcount, "withdrawn": withdrawn, "source_records": sr, "consents": cons}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--remove", action="store_true")
    ap.add_argument("--tag", default=None)
    a = ap.parse_args(argv)
    if a.apply and a.remove:
        raise SystemExit("Use --apply or --remove, not both")
    from app.survivorship import REF_DATE
    tag = a.tag or _tag()
    with _connect() as conn:
        cur = conn.cursor()
        if a.remove:
            s = remove(cur)
            conn.commit()
            print(f"removed DEMO-UC5-  people={s['people']} withdrawn={s['withdrawn']} source_records={s['source_records']} consents={s['consents']}")
            return 0
        if not a.apply:
            print(f"{len(CASES)} DEMO-UC5 cases  (dry run)")
            for c in CASES:
                print(f"  {c}: expect reason_code={EXPECT[c] or '—'}")
            return 0
        res = apply(cur, tag, REF_DATE)
        from app import exchange
        for r in res:                                               # second run: nothing new may be raised
            exchange.verify(cur, "housing", "HOUSEHOLD_BENEFIT", r["question"], {}, ACTOR, person_id=r["person_id"])
            again = _open(cur, r["members"])
            r["second_proposal_id"] = again[0]["id"] if again else None
            r["open_items"] = len(again)
        conn.commit()
        print(f"{len(CASES)} DEMO-UC5 cases  (APPLY tag={tag})")
        for r in res:
            ok = "ok" if r["reason_code"] == EXPECT[r["case"]] else "UNEXPECTED"
            extra = f"  income_answer={r['income_answer']}" if r.get("income_answer") else ""
            print(f"  {r['case']}: outcome={r['outcome']} answer={r.get('answer') or '—'}  proposal_id={r['proposal_id'] or '—'}  "
                  f"reason_code={r['reason_code'] or '—'}  open_after_second_run={r['open_items']}  [{ok}]{extra}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
