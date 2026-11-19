"""A record a steward keeps separate must really leave the person it was provisionally grouped with."""
import uuid
from app.db import connect
from app import stewardship
from tests.test_uc1 import _insert_source, _open_review


def test_keep_separate_gives_the_record_its_own_person_and_removes_its_values_from_the_old_one():
    tag = uuid.uuid4().hex[:6]
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO mdm.person (mdm_id, name, gender, birth_year) VALUES (%s,%s,'M',1980) RETURNING id",
                    (f"MDM-SEP-{tag}", f"Sep Person {tag}"))
        pid = cur.fetchone()["id"]
        conn.commit()
    _insert_source(pid, "crs", f"SEP-OK-{tag}", name=f"Sep Person {tag}", score=0.95, link_status="AUTO_LINKED", dob="1980-05-06")
    doubt = _insert_source(pid, "revenue_certificates", f"SEP-DOUBT-{tag}", name=f"Sep Person {tag}", score=0.6,
                           link_status="IN_REVIEW", dob="2005-08-30")
    task = _open_review(doubt, [{"person_id": pid, "score": 0.6}])
    with connect() as conn:
        cur = conn.cursor()
        out = stewardship.decide(cur, task, "SEPARATE", None, "test-steward", "different person")
        conn.commit()
        cur.execute("SELECT person_id, link_status FROM mdm.source_record WHERE id=%s", (doubt,))
        rec = cur.fetchone()
        assert rec["link_status"] == "STEWARD_SEPARATE"
        assert rec["person_id"] != pid, "the separated record is still attached to the old person"
        assert out["person_id"] == rec["person_id"]
        cur.execute("SELECT count(*) AS n FROM mdm.source_record WHERE person_id=%s", (pid,))
        assert cur.fetchone()["n"] == 1
        cur.execute("SELECT dob FROM mdm.person WHERE id=%s", (pid,))
        assert str(cur.fetchone()["dob"]) == "1980-05-06"
        cur.execute("SELECT 1 FROM mdm.person WHERE id=%s", (rec["person_id"],))
        assert cur.fetchone()


def test_keep_separate_on_a_record_that_is_already_alone_makes_no_extra_person():
    tag = uuid.uuid4().hex[:6]
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO mdm.person (mdm_id, name, gender, birth_year) VALUES (%s,%s,'M',1990) RETURNING id",
                    (f"MDM-SEP1-{tag}", f"Alone {tag}"))
        pid = cur.fetchone()["id"]
        conn.commit()
    rid = _insert_source(pid, "crs", f"SEP-ALONE-{tag}", name=f"Alone {tag}", score=0.6, link_status="IN_REVIEW", dob="1990-01-01")
    task = _open_review(rid, [{"person_id": pid + 100000, "score": 0.6}])
    with connect() as conn:
        cur = conn.cursor()
        stewardship.decide(cur, task, "SEPARATE", None, "test-steward", "alone")
        conn.commit()
        cur.execute("SELECT person_id FROM mdm.source_record WHERE id=%s", (rid,))
        assert cur.fetchone()["person_id"] == pid
