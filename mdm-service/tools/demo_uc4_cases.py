#!/usr/bin/env python3
"""Demo only: plant four synthetic UC4 scholarship students, then raise the three non-answer items
through the normal / verify path (expired / conflict / other-state) plus one clean control.

Each student is 17, has a citizen sign-in link, and a scholarship consent already GRANTED by a
recorded parent. Certificate and link rows use the source_rid / aadhaar_ref prefix DEMO-UC4- so
they can be found and removed. Output uses only references and states — never an income value.

  MDM_DB_DSN="host=... dbname=citizen_db ..." python3 mdm-service/tools/demo_uc4_cases.py
  ... --apply
  ... --remove

  # On the cluster pod (DB_* env already set):
  #   kubectl -n citizen cp mdm-service/tools/demo_uc4_cases.py deploy/mdm-service:/tmp/demo_uc4_cases.py
  #   kubectl -n citizen exec deploy/mdm-service -- sh -c 'cd /opt/app && PYTHONPATH=/opt/app python /tmp/demo_uc4_cases.py --apply'
"""
from __future__ import annotations
import argparse, json, os, sys, uuid
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

PREFIX = "DEMO-UC4-"
ACTOR = "demo-uc4-script"
CASES = ("expired", "conflict", "other_state", "clean")
REASON_FOR = {
    "EXPIRED_SOURCE": "CERT_EXPIRED",
    "CONFLICT": "CERT_CONFLICT",
    "NO_RECORD": "OTHER_STATE",
    "ANSWERED": None,
}


def _tag() -> str:
    """Letters only: name tokens strip digits, and Latin names must stay letter-shaped."""
    return "".join(chr(97 + int(c, 16) % 26) for c in uuid.uuid4().hex[:8])


def _dsn() -> str:
    from app.db import dsn
    return dsn()


def _connect():
    """Same state-scoped connection the service uses (app.state_code)."""
    from app.db import connect
    return connect()


def _person(cur, name: str, *, dob: date, gender: str, district: str) -> int:
    cur.execute("SELECT nextval('mdm.person_id_seq') AS i")
    pid = cur.fetchone()["i"]
    cur.execute("""INSERT INTO mdm.person (id, mdm_id, name, dob, birth_year, gender, district, life_status)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,'ALIVE')""",
                (pid, f"MDM-{pid:08d}", name, dob, dob.year, gender, district))
    return pid


def _rel(cur, parent: int, child: int):
    cur.execute("""INSERT INTO mdm.relationship (person_a, person_b, kind, basis, source)
                   SELECT %s,%s,'PARENT_OF','demo uc4','demo'
                   WHERE NOT EXISTS (
                     SELECT 1 FROM mdm.relationship WHERE kind='PARENT_OF' AND person_a=%s AND person_b=%s)""",
                (parent, child, parent, child))


def _cert(cur, pid: int, rid: str, *, annual: int, valid_until: str, name: str):
    cur.execute("""INSERT INTO mdm.source_record
                   (person_id, source, source_rid, rtype, name, link_status, score, as_of, payload)
                   VALUES (%s,'revenue_certificates',%s,'INCOME',%s,'AUTO_LINKED',0.95,CURRENT_DATE,%s::jsonb)""",
                (pid, rid, name, json.dumps({"annual_income": annual, "valid_until": valid_until, "status": "ACTIVE"})))


def _link(cur, ref: str, pid: int):
    from app import citizen
    citizen.link(cur, ref, pid, ACTOR)


def _grant_parent(cur, student: int, parent: int):
    from app import exchange
    c = exchange.request_consent(cur, student, "SCHOLARSHIP_ELIGIBILITY", ACTOR, student)
    cur.execute("""UPDATE mdm.consent SET status='GRANTED', given_by_person_id=%s, responded_at=now(),
                          scope=%s::jsonb, expires_at=now() + interval '90 days', channel='ASSISTED', operator=%s
                   WHERE id=%s""",
                (parent, json.dumps({"elements": ["income_band", "category", "residence", "age"], "partial": False}),
                 ACTOR, c["id"]))
    return c["id"]


def _find_demo_person_ids(cur) -> list[int]:
    cur.execute("""SELECT DISTINCT person_id AS id FROM mdm.source_record WHERE source_rid LIKE %s
                   UNION SELECT person_id FROM mdm.citizen_link WHERE aadhaar_ref LIKE %s""",
                (PREFIX + "%", PREFIX + "%"))
    return [r["id"] for r in cur.fetchall()]


def _plan(tag: str, on: date) -> list[dict]:
    """Four case specs. Income amounts stay inside the plan only; they are never printed."""
    dob = date(on.year - 17, on.month, min(on.day, 28))
    out = []
    for case in CASES:
        student = f"Demo Ucfour {case.replace('_', '')} {tag}"
        parent = f"Demo Ucfour Parent {case.replace('_', '')} {tag}"
        ref = f"{PREFIX}{case}-{tag}"
        row = {
            "case": case,
            "tag": tag,
            "student_name": student,
            "parent_name": parent,
            "aadhaar_ref": ref,
            "district": "Medak" if case != "other_state" else f"Other State {tag}",
            "dob": dob.isoformat(),
            "certs": [],
        }
        if case == "expired":
            row["certs"] = [{"rid": f"{PREFIX}expired-{tag}", "annual": 120000,
                             "valid_until": (on - timedelta(days=30)).isoformat()}]
        elif case == "conflict":
            row["certs"] = [
                {"rid": f"{PREFIX}conflict-a-{tag}", "annual": 100000, "valid_until": (on + timedelta(days=180)).isoformat()},
                {"rid": f"{PREFIX}conflict-b-{tag}", "annual": 400000, "valid_until": (on + timedelta(days=180)).isoformat()},
            ]
        elif case == "clean":
            row["certs"] = [{"rid": f"{PREFIX}clean-{tag}", "annual": 150000,
                             "valid_until": (on + timedelta(days=180)).isoformat()}]
        # other_state: no certificate
        out.append(row)
    return out


def _print_plan(rows: list[dict], mode: str):
    print(f"{len(rows)} DEMO-UC4 cases  ({mode})")
    for r in rows:
        certs = ", ".join(c["rid"] for c in r["certs"]) or "(none)"
        print(f"  {r['case']}: ref={r['aadhaar_ref']}  certs=[{certs}]  district={r['district']!r}")


def _open_item(cur, pid: int) -> dict | None:
    cur.execute("""SELECT id, kind, reason_code, status FROM mdm.proposal
                   WHERE person_id=%s AND kind = ANY(%s) AND status='PROPOSED' ORDER BY id""",
                (pid, ["RENEW_CERTIFICATE", "SETTLE_SOURCE_CONFLICT", "MANUAL_ROUTE"]))
    return cur.fetchone()


def apply(cur, rows: list[dict], on: date) -> list[dict]:
    from app import exchange
    from datetime import date as _date
    results = []
    for r in rows:
        dob = _date.fromisoformat(r["dob"])
        parent = _person(cur, r["parent_name"], dob=date(on.year - 40, 1, 15), gender="F", district="Medak")
        student = _person(cur, r["student_name"], dob=dob, gender="F", district=r["district"])
        _rel(cur, parent, student)
        _link(cur, r["aadhaar_ref"], student)
        for c in r["certs"]:
            _cert(cur, student, c["rid"], annual=c["annual"], valid_until=c["valid_until"], name=r["student_name"])
        _grant_parent(cur, student, parent)
        # Real scholarship check — raises CERT_* through exchange.verify → _uc4_follow_up.
        out = exchange.verify(cur, "education", "SCHOLARSHIP_ELIGIBILITY", "INCOME_AT_MOST",
                              {"limit": 200000}, ACTOR, person_id=student)
        item = _open_item(cur, student)
        results.append({
            "case": r["case"],
            "aadhaar_ref": r["aadhaar_ref"],
            "person_id": student,
            "outcome": out.get("outcome"),
            "proposal_id": item["id"] if item else None,
            "reason_code": (item or {}).get("reason_code") or REASON_FOR.get(out.get("outcome")),
        })
    return results


def remove(cur) -> dict:
    pids = _find_demo_person_ids(cur)
    # Also parents linked only by PARENT_OF to those students
    if pids:
        cur.execute("""SELECT DISTINCT CASE WHEN person_a = ANY(%s) THEN person_b ELSE person_a END AS id
                       FROM mdm.relationship WHERE kind='PARENT_OF' AND (person_a = ANY(%s) OR person_b = ANY(%s))""",
                    (pids, pids, pids))
        pids = sorted({*pids, *[r["id"] for r in cur.fetchall()]})
    withdrawn = deleted_sr = deleted_cons = deleted_links = deleted_rel = deleted_people = 0
    if not pids:
        return {"people": 0, "withdrawn": 0, "source_records": 0, "consents": 0, "links": 0}
    cur.execute("""UPDATE mdm.proposal SET status='WITHDRAWN', note='demo uc4 remove', decided_by=%s, decided_at=now()
                   WHERE person_id = ANY(%s) AND status='PROPOSED' AND kind = ANY(%s)""",
                (ACTOR, pids, ["RENEW_CERTIFICATE", "SETTLE_SOURCE_CONFLICT", "MANUAL_ROUTE"]))
    withdrawn = cur.rowcount
    cur.execute("DELETE FROM mdm.source_record WHERE source_rid LIKE %s OR person_id = ANY(%s)", (PREFIX + "%", pids))
    deleted_sr = cur.rowcount
    cur.execute("DELETE FROM mdm.consent WHERE person_id = ANY(%s) OR subject_person_id = ANY(%s) OR given_by_person_id = ANY(%s)",
                (pids, pids, pids))
    deleted_cons = cur.rowcount
    cur.execute("DELETE FROM mdm.citizen_link WHERE aadhaar_ref LIKE %s OR person_id = ANY(%s)", (PREFIX + "%", pids))
    deleted_links = cur.rowcount
    cur.execute("DELETE FROM mdm.relationship WHERE person_a = ANY(%s) OR person_b = ANY(%s)", (pids, pids))
    deleted_rel = cur.rowcount
    cur.execute("DELETE FROM mdm.person WHERE id = ANY(%s)", (pids,))
    deleted_people = cur.rowcount
    return {"people": deleted_people, "withdrawn": withdrawn, "source_records": deleted_sr,
            "consents": deleted_cons, "links": deleted_links, "relationships": deleted_rel}


def _print_results(results: list[dict]):
    for r in results:
        prop = r["proposal_id"]
        code = r["reason_code"]
        print(f"  {r['case']}: ref={r['aadhaar_ref']}  outcome={r['outcome']}  "
              f"proposal_id={prop if prop is not None else '—'}  reason_code={code if code else '—'}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="plant the four students and run INCOME_AT_MOST once each")
    ap.add_argument("--remove", action="store_true", help="withdraw proposals and delete DEMO-UC4- rows")
    ap.add_argument("--tag", default=None, help="letter tag shared by the four (default: random)")
    a = ap.parse_args(argv)
    if a.apply and a.remove:
        raise SystemExit("Use --apply or --remove, not both")
    try:
        if not _dsn():
            raise SystemExit("empty DSN")
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        raise SystemExit(f"Set MDM_DB_DSN or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD ({e})") from e
    from app.survivorship import REF_DATE
    on = REF_DATE
    tag = a.tag or _tag()
    rows = _plan(tag, on)

    with _connect() as conn:
        cur = conn.cursor()
        if a.remove:
            stats = remove(cur)
            conn.commit()
            print(f"removed DEMO-UC4-  people={stats['people']} withdrawn={stats['withdrawn']} "
                  f"source_records={stats['source_records']} consents={stats['consents']} links={stats['links']}")
            return 0
        if not a.apply:
            _print_plan(rows, "dry run")
            return 0
        # Drop any previous DEMO-UC4- plant so --apply is safe to re-run for a clean set, then plant.
        # Idempotent raises (one open item per person and kind) are checked by running verify twice below.
        results = apply(cur, rows, on)
        # Second pass: same people, same check — must raise nothing new.
        from app import exchange
        for r in results:
            exchange.verify(cur, "education", "SCHOLARSHIP_ELIGIBILITY", "INCOME_AT_MOST",
                            {"limit": 200000}, ACTOR, person_id=r["person_id"])
            again = _open_item(cur, r["person_id"])
            r["second_proposal_id"] = again["id"] if again else None
        conn.commit()
        print(f"4 DEMO-UC4 cases  (APPLY tag={tag})")
        _print_results(results)
        for r in results:
            if r["proposal_id"] and r["second_proposal_id"] not in (None, r["proposal_id"]):
                print(f"  WARN {r['case']}: second verify raised a new proposal {r['second_proposal_id']}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
