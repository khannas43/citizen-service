"""Turning-18 worklist: search, filters, sort, paging, stats; dept officers get 403."""
from __future__ import annotations
import os

os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""

from fastapi.testclient import TestClient

from app.api import app
from app import auth

ADMIN = {"X-Test-Roles": "MDM_ADMIN", "X-Test-Actor": "admin"}
PDS = {"X-Test-Roles": "PDS_OFFICER", "X-Test-Actor": "pds.officer"}
cl = TestClient(app)


def test_turning18_basic_shape_and_stats():
    r = cl.get("/api/worklists/turning-18", params={"limit": 10}, headers=ADMIN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body and "total" in body and "stats" in body
    for k in ("turning_30", "already_18", "not_on_portal", "invited", "income_expired_or_none"):
        assert k in body["stats"]
    for i in body["items"]:
        assert "next_steps" in i and "next_step" in i and "consent_status" in i


def test_turning18_search_and_filters():
    base = cl.get("/api/worklists/turning-18", params={"limit": 50}, headers=ADMIN).json()
    if not base["items"]:
        return
    sample = base["items"][0]
    # Search by name fragment
    q = cl.get("/api/worklists/turning-18", params={"q": sample["name"][:4], "limit": 50}, headers=ADMIN).json()
    assert q["total"] >= 1
    assert any(sample["id"] == i["id"] for i in q["items"])
    # Identity filter both ways
    yes = cl.get("/api/worklists/turning-18", params={"identity": "yes", "limit": 5}, headers=ADMIN).json()
    no = cl.get("/api/worklists/turning-18", params={"identity": "no", "limit": 5}, headers=ADMIN).json()
    assert all(i["has_identity"] for i in yes["items"])
    assert all(not i["has_identity"] for i in no["items"])
    # Income, portal, invited, consent
    for income_state in ("valid", "expired", "none"):
        r = cl.get("/api/worklists/turning-18", params={"income_state": income_state, "limit": 5}, headers=ADMIN).json()
        assert all(i["income_state"] == income_state for i in r["items"])
    for on_portal, want in (("yes", True), ("no", False)):
        r = cl.get("/api/worklists/turning-18", params={"on_portal": on_portal, "limit": 5}, headers=ADMIN).json()
        assert all(bool(i["on_scholarship_portal"]) is want for i in r["items"])
    for invited, want in (("yes", True), ("no", False)):
        r = cl.get("/api/worklists/turning-18", params={"invited": invited, "limit": 5}, headers=ADMIN).json()
        assert all(bool(i["invited"]) is want for i in r["items"])
    for consent in ("none", "parent_asked", "parent_allowed", "handover_pending", "student_allowed", "refused", "ended"):
        r = cl.get("/api/worklists/turning-18", params={"consent": consent, "limit": 5}, headers=ADMIN).json()
        assert all(i["consent_status"] == consent for i in r["items"])


def test_turning18_sort_both_ways_and_paging():
    asc = cl.get("/api/worklists/turning-18", params={"sort": "person", "dir": "asc", "limit": 10}, headers=ADMIN).json()
    desc = cl.get("/api/worklists/turning-18", params={"sort": "person", "dir": "desc", "limit": 10}, headers=ADMIN).json()
    if len(asc["items"]) >= 2:
        names_a = [i["name"] for i in asc["items"]]
        assert names_a == sorted(names_a, key=lambda s: s.lower())
    if len(desc["items"]) >= 2:
        names_d = [i["name"] for i in desc["items"]]
        assert names_d == sorted(names_d, key=lambda s: s.lower(), reverse=True)
    # Offset + total
    page0 = cl.get("/api/worklists/turning-18", params={"limit": 2, "offset": 0, "sort": "turns_18"}, headers=ADMIN).json()
    page1 = cl.get("/api/worklists/turning-18", params={"limit": 2, "offset": 2, "sort": "turns_18"}, headers=ADMIN).json()
    assert page0["total"] == page1["total"]
    if page0["total"] > 2:
        ids0 = {i["id"] for i in page0["items"]}
        ids1 = {i["id"] for i in page1["items"]}
        assert ids0.isdisjoint(ids1)


def test_turning18_turns_date_range():
    r = cl.get("/api/worklists/turning-18", params={"turns_from": "2000-01-01", "turns_to": "2099-12-31", "limit": 5}, headers=ADMIN)
    assert r.status_code == 200
    assert "total" in r.json()


def test_dept_officer_forbidden_on_turning18():
    assert cl.get("/api/worklists/turning-18", headers=PDS).status_code == 403
    assert not auth.path_allowed_for_dept("GET", "/api/worklists/turning-18")
