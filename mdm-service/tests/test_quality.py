"""Feed quality: Great Expectations contracts per department feed."""
import os
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""
import great_expectations as gx
import great_expectations.expectations as gxe
from fastapi.testclient import TestClient
from app import quality
from app.api import app

c = TestClient(app)


def _ctx():
    ctx = gx.get_context(mode="ephemeral")
    return ctx


def _row(rid, **k):
    base = {"source_rid": rid, "name": "Asha Rao", "gender": "F", "dob": "1990-01-02", "age": None, "birth_year": None,
            "district": "Medak", "address": "1-2 Main Rd", "ration_card": None, "as_of": "2026-06-10"}
    base.update(k)
    return base


def test_clean_feed_passes_with_no_critical_failure():
    rows = [_row(f"PN-{i:07d}", name=f"Person {i} Rao") for i in range(1, 40)]
    res = quality._run_source(_ctx(), gx, gxe, "pension_batch", rows)
    assert res and all(r["success"] for r in res if r["severity"] == "critical")
    assert quality.source_status(res) in ("PASS", "WARN")


def test_broken_feed_fails_on_key_value_and_format_problems():
    rows = [_row("PN-0000001"), _row("PN-0000001"), _row("BADKEY", name=None), _row("PN-0000003", gender="X"),
            _row("PN-0000004", dob="1850-01-01"), _row("PN-0000005", age=240), _row("PN-0000006", as_of="yesterday")]
    res = quality._run_source(_ctx(), gx, gxe, "pension_batch", rows)
    failed = {(r["expectation"], r["column_name"]) for r in res if not r["success"] and r["severity"] == "critical"}
    for want in [("expect_column_values_to_be_unique", "source_rid"), ("expect_column_values_to_match_regex", "source_rid"),
                 ("expect_column_values_to_not_be_null", "name"), ("expect_column_values_to_be_in_set", "gender"),
                 ("expect_column_values_to_be_between", "dob_year"), ("expect_column_values_to_be_between", "age"),
                 ("expect_column_values_to_match_regex", "as_of")]:
        assert want in failed, want
    assert quality.source_status(res) == "FAIL"
    bad = next(r for r in res if r["expectation"] == "expect_column_values_to_be_in_set")
    assert bad["samples"] and bad["samples"][0]["source_rid"] == "PN-0000003", "a failing result names the record that failed"


def test_missing_optional_field_is_only_a_warning():
    rows = [_row(f"PN-{i:07d}", name=f"Person {i} Rao", dob=None) for i in range(1, 30)]
    res = quality._run_source(_ctx(), gx, gxe, "pension_batch", rows)
    assert quality.source_status(res) == "WARN"


def test_run_is_kept_and_readable_through_the_api():
    r = c.post("/api/x/quality/run")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["totals"]["feeds"] >= 1 and d["gx_version"]
    latest = c.get("/api/x/quality/latest").json()
    assert latest["run"]["id"] == d["id"] and latest["results"]
    row = latest["results"][0]
    assert row["severity"] in ("critical", "advisory") and row["description"] and row["expectation"].startswith("expect_")
    assert any(f["name"] for f in latest["summary"]["feeds"].values())
    runs = c.get("/api/x/quality/runs").json()["items"]
    assert runs and runs[0]["id"] == d["id"]
    assert c.get(f"/api/x/quality/runs/{d['id']}").status_code == 200
    assert c.get("/api/x/quality/runs/99999999").status_code == 404


def test_sample_event_feed_plays_even_when_the_load_script_left_none(monkeypatch):
    monkeypatch.setenv("MDM_EVENTS_FILE", "/nonexistent/feed.jsonl")
    r = c.post("/api/events/replay")
    assert r.status_code == 200, r.text
    assert r.json()["events"] >= 30


def test_event_stream_filters_by_date_range():
    c.post("/api/events/replay")
    today = c.get("/api/x/events?limit=1").json()["items"][0]["received_at"][:10]
    inside = c.get(f"/api/x/events?date_from={today}&date_to={today}").json()["total"]
    before = c.get("/api/x/events?date_to=2000-01-01").json()["total"]
    assert inside > 0 and before == 0


def test_replay_once_does_not_pile_up_duplicates():
    c.post("/api/events/replay")
    n = c.get("/api/x/events?limit=1").json()["total"]
    r = c.post("/api/events/replay?once=true").json()
    assert r.get("skipped") is True
    assert c.get("/api/x/events?limit=1").json()["total"] == n


def test_audit_filters_sorts_and_lists_who_and_what():
    f = c.get("/api/x/audit/facets").json()
    assert f["actors"] and f["actions"] and f["range"]["first"]
    a = f["actions"][0]["value"]
    r = c.get("/api/x/audit", params={"action_is": a, "limit": 5, "sort": "ts", "dir": "asc"}).json()
    assert r["total"] > 0 and all(i["action"] == a for i in r["items"])
    ts = [i["ts"] for i in r["items"]]
    assert ts == sorted(ts)
    day = str(f["range"]["last"])[:10]
    assert c.get("/api/x/audit", params={"date_from": day, "date_to": day, "limit": 1}).json()["total"] > 0
    assert c.get("/api/x/audit", params={"date_to": "2000-01-01", "limit": 1}).json()["total"] == 0


def test_review_search_covers_the_whole_queue_and_records_carry_comparison_fields():
    r = c.get("/api/review", params={"limit": 1}).json()
    assert r["total"] > 0
    first = r["items"][0]
    hit = c.get("/api/review", params={"q": first["source_rid"], "limit": 5}).json()
    assert hit["total"] >= 1 and any(i["id"] == first["id"] for i in hit["items"])
    assert c.get("/api/review", params={"q": "zzzz-no-such-record", "limit": 5}).json()["total"] == 0
    t = c.get(f"/api/review/{first['id']}").json()
    assert {"source_name", "address", "family", "spouse", "mobile"} <= set(t["view"])
    assert all({"source_name", "address", "spouse", "mobile"} <= set(x) for cand in t["candidate_details"] for x in cand["records"])


def test_people_sort_and_filters():
    base = c.get("/api/persons?limit=200").json()
    if not base["total"]:
        return
    for key in ("name", "mdm_id", "dob", "district", "life_status", "source_count", "open_issues"):
        up = c.get(f"/api/persons?limit=50&sort={key}&dir=asc")
        assert up.status_code == 200, key
    desc = [p["source_count"] for p in c.get("/api/persons?limit=50&sort=source_count&dir=desc").json()["items"]]
    assert desc == sorted(desc, reverse=True)
    d = c.get("/api/persons/facets").json()["districts"]
    if d:
        got = c.get(f"/api/persons?limit=200&district={d[0]['value']}").json()
        assert got["total"] == d[0]["n"] and all(p["district"] == d[0]["value"] for p in got["items"])
    dead = c.get("/api/persons?limit=200&life_status=DECEASED").json()["items"]
    assert all(p["life_status"] == "DECEASED" for p in dead)
    rng = c.get("/api/persons?limit=200&date_from=1990-01-01&date_to=1999-12-31").json()["items"]
    assert all("1990" <= str(p["dob"] or p["birth_year"])[:4] <= "1999" for p in rng)


def test_review_shows_provisional_person_and_allows_confirming_it():
    items = c.get("/api/review?limit=200").json()["items"]
    empty = [i for i in items if i["candidate_count"] == 0]
    if not empty:
        return
    for i in empty:
        t = c.get(f"/api/review/{i['id']}").json()
        if t["candidate_details"]:
            first = t["candidate_details"][0]
            assert first["tentative"] is True and first["person"]["id"] == t["own_person"] and first["records"]
            assert all(r["id"] != t["record_id"] for r in first["records"])
            return


def test_every_list_sorts_and_narrows_by_date():
    lists = {"/api/x/events": ["received_at", "event", "status", "depts", "open_proposals"],
             "/api/x/consents": ["person_name", "purpose_name", "system_name", "status", "expires_at"],
             "/api/x/ledger": ["ts", "kind", "requester", "person_name", "question", "outcome"],
             "/api/x/discrepancies": ["person", "attribute", "change", "authoritative_name", "status", "raised_at"],
             "/api/dq/issues": ["code", "name", "detail", "source_name", "district", "created_at"],
             "/api/audit": ["seq", "ts", "actor", "action", "subject"],
             "/api/review": ["name", "source_name", "dob", "district", "score", "candidate_count"],
             "/api/persons": ["name", "mdm_id", "dob", "district", "life_status", "source_count", "open_issues"]}
    for path, keys in lists.items():
        for k in keys:
            for d in ("asc", "desc"):
                r = c.get(f"{path}?limit=5&sort={k}&dir={d}")
                assert r.status_code == 200, (path, k, d, r.text[:120])
        if path not in ("/api/review", "/api/persons"):
            assert c.get(f"{path}?date_from=2099-01-01&limit=5").json()["total"] == 0, path
    ev = [e["event_type"] for e in c.get("/api/x/events?limit=200&sort=event_type&dir=asc").json()["items"]]
    assert ev == sorted(ev)


def test_audit_list_filters_by_who_and_what():
    all_ = c.get("/api/audit?limit=200").json()
    who = all_["items"][0]["actor"]
    got = c.get(f"/api/audit?limit=200&actor_is={who}").json()
    assert 0 < got["total"] <= all_["total"] and all(a["actor"] == who for a in got["items"])
    act = all_["items"][0]["action"]
    got = c.get(f"/api/audit?limit=200&action={act}").json()
    assert got["total"] > 0 and all(a["action"] == act for a in got["items"])


# ------------------------------------------------------------------------------------------ records received in a date range, rule settings
import pytest
from app.db import connect


def _day_rows(n, day, **k):
    return [_row(f"PN-{i:07d}", received_day=day, name=f"Person {i} Rao", **k) for i in range(n)]


def test_daily_counts_add_up_to_the_rule_totals():
    rows = [_row(f"PN-{i:07d}", received_day="2026-10-01" if i < 30 else "2026-10-02", name=f"Person {i} Rao", gender="X" if i in (3, 35, 36) else "F") for i in range(50)]
    res = quality._run_source(_ctx(), gx, gxe, "pension_batch", rows)
    g = next(r for r in res if r["rule_key"] == "gender_valid")
    assert g["unexpected_count"] == 3
    assert g["days"] == {"2026-10-01": [30, 1], "2026-10-02": [20, 2]}
    for r in res:
        if r["scope"] == "record":
            assert sum(v[0] for v in r["days"].values()) == 50 and sum(v[1] for v in r["days"].values()) == (r["unexpected_count"] or 0), r["rule_key"]


def test_whole_feed_rules_are_pass_or_fail_only():
    res = quality._run_source(_ctx(), gx, gxe, "pension_batch", _day_rows(5, "2026-10-01"))
    feed_rules = {r["rule_key"] for r in res if r["scope"] == "feed"}
    assert {"row_count", "freshness"} <= feed_rules
    assert all(r["days"] is None for r in res if r["scope"] == "feed")


def test_settings_change_what_is_checked():
    rows = _day_rows(20, "2026-10-01", age=105)
    base = quality._run_source(_ctx(), gx, gxe, "pension_batch", rows)
    assert next(r for r in base if r["rule_key"] == "age_range")["success"]
    strict = quality._run_source(_ctx(), gx, gxe, "pension_batch", rows, quality.validate({"max_age": 100}))
    a = next(r for r in strict if r["rule_key"] == "age_range")
    assert not a["success"] and a["description"] == "Ages are between 0 and 100" and a["unexpected_count"] == 20
    off = quality._run_source(_ctx(), gx, gxe, "pension_batch", rows, quality.validate({"advisory_off": ["completeness", "freshness", "repeats"]}))
    assert not any(r["rule_key"] in ("freshness", "repeats") or r["rule_key"].startswith("complete:") for r in off)
    assert all(r["rule_key"] != "name_present" or r["severity"] == "critical" for r in off)         # critical rules cannot be switched off


def test_settings_are_validated():
    for bad in ({"max_age": 500}, {"name_share": 0.1}, {"name_min": 90}, {"advisory_off": ["names"]}, {"freshness_days": 0}):
        with pytest.raises(ValueError):
            quality.validate(bad)
    assert quality.validate({})["max_age"] == 120


def test_rule_change_needs_a_reason_and_makes_a_version():
    act = c.get("/api/x/quality/rules").json()["active"]
    v0, was = act["version"], act["settings"]["max_age"]
    to = 110 if was != 110 else 115
    r = c.post("/api/x/quality/rules", json={"settings": {"max_age": to}, "reason": ""})
    assert r.status_code == 400 and "why" in r.json()["detail"].lower()
    r = c.post("/api/x/quality/rules", json={"settings": {"max_age": to}, "reason": "Pension scheme allows centenarians"})
    assert r.status_code == 200 and r.json()["version"] == v0 + 1 and r.json()["changes"]["max_age"]["to"] == to
    assert c.post("/api/x/quality/rules", json={"settings": {"max_age": to}, "reason": "Same again, nothing new"}).status_code == 400
    ov = c.get("/api/x/quality/rules").json()
    assert ov["active"]["settings"]["max_age"] == to and ov["history"][0]["reason"].startswith("Pension")
    r = c.post("/api/x/quality/rules", json={"settings": {"max_age": was}, "reason": "Back to the previous limit"})
    assert r.status_code == 200
    audit = c.get("/api/audit", params={"action": "QUALITY_RULES_CHANGED"}).json()
    assert audit["total"] >= 2


def test_preview_changes_nothing():
    v = c.get("/api/x/quality/rules").json()["active"]["version"]
    p = c.post("/api/x/quality/rules/preview", json={"settings": {"completeness_share": 0.9999}}).json()
    assert p["changes"]["completeness_share"]["to"] == 0.9999 and "feeds" in p
    assert c.get("/api/x/quality/rules").json()["active"]["version"] == v


def test_range_report_and_csv_agree():
    c.post("/api/x/quality/demo-history", params={"days": 60})
    run = c.post("/api/x/quality/run").json()
    assert run["rule_version"] >= 1
    today = c.get("/api/x/quality/range").json()["to"]
    wide = c.get("/api/x/quality/range", params={"date_from": "2000-01-01", "date_to": today}).json()
    latest = c.get("/api/x/quality/latest").json()
    # the whole history adds up to the run's own totals
    by = {(r["source"], r["rule_key"]): r for r in latest["results"]}
    for r in wide["rules"]:
        if r["scope"] == "record":
            assert r["failed"] == (by[(r["source"], r["rule_key"])]["unexpected_count"] or 0)
    assert wide["tiles"]["records"] == sum(f["records"] for f in latest["summary"]["feeds"].values())
    # a narrower window is a subset
    week = c.get("/api/x/quality/range", params={"date_from": "2026-10-01", "date_to": "2026-10-07"}).json()
    assert 0 < week["tiles"]["records"] < wide["tiles"]["records"] and len(week["days"]) <= 7
    one = c.get("/api/x/quality/range", params={"date_from": "2000-01-01", "date_to": today, "source": "pension_batch"}).json()
    assert {r["source"] for r in one["rules"]} == {"pension_batch"}
    # CSV carries the same counts, and nothing about a person
    t = c.get("/api/x/quality/range.csv", params={"kind": "summary", "date_from": "2026-10-01", "date_to": "2026-10-07"})
    assert t.status_code == 200 and "attachment" in t.headers["content-disposition"] and "2026-10-01_to_2026-10-07" in t.headers["content-disposition"]
    import csv as _csv, io as _io
    rows = list(_csv.DictReader(_io.StringIO(t.text.lstrip("﻿"))))
    assert len(rows) == len(week["rules"]) and set(rows[0]) >= {"feed", "rule", "records_checked", "records_failed", "result", "rule_settings_version"}
    d = c.get("/api/x/quality/range.csv", params={"kind": "daily", "date_from": "2026-10-01", "date_to": "2026-10-07"})
    drows = list(_csv.DictReader(_io.StringIO(d.text.lstrip("﻿"))))
    assert drows and set(drows[0]) >= {"date", "feed", "rule", "records_checked", "records_failed"}
    assert all("2026-10-01" <= x["date"] <= "2026-10-07" for x in drows)
    assert set(drows[0]) == {"date", "feed", "rule", "importance", "records_checked", "records_passed", "records_failed", "percent_failed", "rule_settings_version", "checks_run_at"}
    assert not any("PN-" in x["rule"] or "PN-" in x["feed"] for x in drows)       # counts only: no record keys, names or other details
    assert c.get("/api/x/quality/range.csv", params={"kind": "other"}).status_code == 400
    assert c.get("/api/x/quality/range", params={"date_from": "2026-10-09", "date_to": "2026-10-01"}).status_code == 400


# ------------------------------------------------------------------------------------------ why a check failed, department contacts
def test_failed_check_says_what_was_found_with_values():
    rows = [_row(f"PN-{i:07d}", received_day="2026-10-01", name=f"Person {i} Rao", gender="X" if i < 3 else ("x" if i < 5 else "F"), district="Medak" if i < 4 else "Nizamabad") for i in range(40)]
    res = quality._run_source(_ctx(), gx, gxe, "pension_batch", rows)
    g = next(r for r in res if r["rule_key"] == "gender_valid")
    assert not g["success"]
    f = g["found"]
    assert {b["label"]: b["count"] for b in f["breakdown"]} == {"X": 3, "x": 2}
    assert {e["value"] for e in f["examples"]} == {"X", "x"} and len(f["examples"]) == 5 and f["districts"][0] == {"label": "Medak", "count": 4}
    e = quality.explain({**g, "tolerance": 0, "unexpected_percent": 12.5})
    assert "5 records carry a gender value that is not M or F" in e["why"] and "X (3)" in e["why"] and "map their gender codes" in e["action"]


def test_key_format_failures_are_classified():
    rows = _day_rows(10, "2026-10-01")
    rows[0]["source_rid"] = "XX-0000001"
    rows[1]["source_rid"] = "PN-12 3"
    res = quality._run_source(_ctx(), gx, gxe, "pension_batch", rows)
    f = next(r for r in res if r["rule_key"] == "rid_format")["found"]
    assert {b["label"] for b in f["breakdown"]} == {"different prefix", "contains spaces"}


def test_every_failed_check_in_a_real_run_has_a_reason_and_a_contact():
    c.post("/api/x/quality/run")
    latest = c.get("/api/x/quality/latest").json()
    failed = [r for r in latest["results"] if not r["success"]]
    assert failed
    for r in failed:
        ex = r["explain"]
        assert ex and ex["why"] and ex["action"] and "None" not in ex["why"] and "{" not in ex["why"] + ex["action"], r["rule_key"]
    assert latest["contacts"]["crs"]["name"]


def test_department_contacts_can_be_edited_and_are_audited():
    assert {x["source"] for x in c.get("/api/x/quality/contacts").json()["items"]} >= {"crs", "pension_batch"}
    r = c.put("/api/x/quality/contacts/pension_batch", json={"name": "Meena Rao", "role": "Pension MIS lead", "email": "meena.rao@pension.example", "phone": "040-0000000"})
    assert r.status_code == 200 and r.json()["name"] == "Meena Rao" and not r.json()["placeholder"]
    assert c.put("/api/x/quality/contacts/pension_batch", json={"name": "A", "email": "not-an-email"}).status_code == 400
    assert c.put("/api/x/quality/contacts/pension_batch", json={"name": ""}).status_code == 400
    assert c.put("/api/x/quality/contacts/nope", json={"name": "A"}).status_code == 400
    assert c.get("/api/x/quality/latest").json()["contacts"]["pension_batch"]["email"] == "meena.rao@pension.example"
    assert c.get("/api/audit", params={"action": "QUALITY_CONTACT_CHANGED"}).json()["total"] >= 1


# ------------------------------------------------------------------------------------------ demo history shows a trend; allowed share; trend per feed
def test_demo_history_has_incident_days_that_stand_out_from_the_allowed_share():
    """Seed a private quality_run + daily rows; do not depend on shared demo received_at."""
    from datetime import date, timedelta
    from app.db import connect

    today = date.today()
    src, rule = "pension_batch", "complete:dob"
    tol = 0.02  # 2%
    run_id = None
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("""INSERT INTO mdm.quality_run (actor, gx_version, trigger, rule_version, finished_at, summary)
                       VALUES ('test-history','0','TEST',1,now(),'{"totals":{}}'::jsonb) RETURNING id""")
        run_id = cur.fetchone()["id"]
        cur.execute("""INSERT INTO mdm.quality_result
                       (run_id, source, expectation, column_name, severity, description, success,
                        element_count, unexpected_count, unexpected_percent, rule_key, scope, tolerance, found)
                       VALUES (%s,%s,'expect_x','dob','critical','DOB present',true,100,0,0,%s,'record',%s,'{}'::jsonb)""",
                    (run_id, src, rule, tol))
        # 60 days: quiet baseline, three incident days with a high fail share, lighter weekends
        rows = []
        incident_offs = {9, 10, 20}
        for off in range(60):
            day = today - timedelta(days=off)
            weekend = day.weekday() >= 5
            checked = 20 if weekend else 100
            failed = int(checked * 0.25) if off in incident_offs else int(checked * 0.005)
            rows.append((run_id, src, rule, day, checked, failed))
        cur.executemany(
            "INSERT INTO mdm.quality_daily (run_id, source, rule_key, day, checked, failed) VALUES (%s,%s,%s,%s,%s,%s)",
            rows,
        )
        conn.commit()
    try:
        rep = c.get("/api/x/quality/range", params={"date_from": "2000-01-01", "date_to": today.isoformat()}).json()
        assert rep["run"]["id"] == run_id
        allowed = rep["allowed_percent"]
        assert allowed is not None and 0 < allowed < 5
        rates = [d["percent_failed"] for d in rep["days"] if d["percent_failed"] is not None]
        bad = [r for r in rates if r > allowed]
        assert 1 <= len(bad) <= 8 and max(rates) > 2 * allowed
        assert len(rep["days"]) >= 50
        weekend = [d["records"] for d in rep["days"] if date.fromisoformat(d["day"]).weekday() >= 5]
        weekday = [d["records"] for d in rep["days"] if date.fromisoformat(d["day"]).weekday() < 5]
        assert weekend and weekday and sum(weekend) / len(weekend) < sum(weekday) / len(weekday)
    finally:
        with connect() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM mdm.quality_daily WHERE run_id=%s", (run_id,))
            cur.execute("DELETE FROM mdm.quality_result WHERE run_id=%s", (run_id,))
            cur.execute("DELETE FROM mdm.quality_run WHERE id=%s", (run_id,))
            conn.commit()


def test_latest_run_carries_a_pass_rate_trend_per_feed():
    c.post("/api/x/quality/run"); c.post("/api/x/quality/run")
    latest = c.get("/api/x/quality/latest").json()
    assert latest["trend"]["pension_batch"] and len(latest["trend"]["pension_batch"]) >= 2 and all(0 <= v <= 100 for v in latest["trend"]["pension_batch"])


# ------------------------------------------------------------------------------------------ records received: detail, chase list

def test_feed_summary_and_window_detail_and_chase():
    c.post("/api/x/quality/demo-history", params={"days": 60})
    c.post("/api/x/quality/run")
    today = c.get("/api/x/quality/range").json()["to"]
    from datetime import date, timedelta
    d7 = (date.fromisoformat(today) - timedelta(days=6)).isoformat()
    r = c.get("/api/x/quality/range", params={"date_from": d7, "date_to": today, "source": "pension_batch"}).json()
    assert "feed_summary" in r and r["feed_summary"]
    # values only for windows of 7 days or fewer
    long = c.get("/api/x/quality/range/detail", params={"date_from": "2026-09-01", "date_to": today, "source": "pension_batch", "rule": "complete:dob"})
    assert long.status_code == 400
    ok = c.get("/api/x/quality/range/detail", params={"date_from": d7, "date_to": today, "source": "pension_batch", "rule": "complete:dob"})
    assert ok.status_code == 200
    assert c.get("/api/x/quality/range/chase.csv", params={"date_from": "2026-09-01", "date_to": today}).status_code == 400
    ch = c.get("/api/x/quality/range/chase.csv", params={"date_from": d7, "date_to": today})
    assert ch.status_code == 200 and "attachment" in ch.headers["content-disposition"]
    # opening values leaves an audit trail
    from app import db
    with db.connect() as cn, cn.cursor() as cur:
        cur.execute("select count(*) as n from mdm.audit where action in ('QUALITY_VALUES_VIEWED','QUALITY_CHASE_LIST_EXPORTED')")
        assert cur.fetchone()["n"] >= 2


def test_people_list_can_show_only_people_waiting_for_review():
    allp = c.get("/api/persons", params={"limit": 200}).json()
    w = c.get("/api/persons", params={"in_review": "true", "limit": 200}).json()
    assert w["total"] <= allp["total"]
    assert all(p["in_review"] > 0 for p in w["items"]) and all("in_review" in p for p in allp["items"])


def test_person_page_lists_waiting_records_that_could_belong_to_them():
    w = c.get("/api/review", params={"limit": 1}).json()
    t = c.get(f"/api/review/{w['items'][0]['id']}").json()
    cand = next(x["person"]["id"] for x in t["candidate_details"] if x["person"]["id"] != t["own_person"])
    got = c.get(f"/api/persons/{cand}").json()
    assert any(x["task_id"] == t["id"] for x in got["could_belong"])
    own = c.get(f"/api/persons/{t['own_person']}").json()
    assert all(x["task_id"] != t["id"] for x in own["could_belong"])       # not offered back to the person that already holds it


def test_record_link_history_follows_a_steward_decision_and_an_unlink():
    from app.db import connect
    with connect() as con, con.cursor() as cur:
        cur.execute("""SELECT t.id, r.source, r.source_rid, r.id AS rid FROM mdm.review_task t JOIN mdm.source_record r ON r.id=t.record_id
                       WHERE t.status='OPEN' ORDER BY t.id LIMIT 1""")
        t = cur.fetchone()
    assert t, "needs an open review task"
    r = c.post(f"/api/review/{t['id']}/decision", json={"decision": "SEPARATE", "note": "history check"})
    assert r.status_code == 200, r.text
    with connect() as con, con.cursor() as cur:
        cur.execute("SELECT event, actor, note FROM mdm.record_link_history WHERE source=%s AND source_rid=%s ORDER BY ts, id", (t["source"], t["source_rid"]))
        rows = cur.fetchall()
    assert rows[0]["event"] == "RECORDED"
    # SEPARATE that gives the record its own person logs UNLINKED; alone-on-person stays KEPT_SEPARATE.
    assert rows[-1]["event"] in ("KEPT_SEPARATE", "UNLINKED") and rows[-1]["note"] == "history check" and rows[-1]["actor"]
    pid = r.json()["person_id"]
    lin = c.get(f"/api/x/lineage/person/{pid}").json()
    rec = next(x for s in lin["sources"] for x in s["records"] if x["source_rid"] == t["source_rid"])
    assert rec["last_change"]["event"] in ("KEPT_SEPARATE", "UNLINKED") and len(rec["history"]) >= 2
    assert [h["ts"] for h in rec["history"]] == sorted(h["ts"] for h in rec["history"])
