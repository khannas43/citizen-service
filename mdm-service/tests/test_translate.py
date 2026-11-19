"""Machine translation of department free text: off by default, cached, never required."""
import os, uuid
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""
import pytest
from fastapi.testclient import TestClient
from app.api import app
from app import translate
from tests.test_feed import q

c = TestClient(app)
TAG = uuid.uuid4().hex[:8]


@pytest.fixture
def on(monkeypatch):
    monkeypatch.setenv("MT_ENABLED", "true")
    monkeypatch.setenv("MT_URL", "http://translation-service:8200")
    calls = []

    def fake(texts, target):
        calls.append(list(texts))
        return ["TE:" + t for t in texts]
    monkeypatch.setattr(translate, "_call_service", fake)
    return calls


def test_off_by_default_and_returns_the_text_unchanged(monkeypatch):
    monkeypatch.delenv("MT_ENABLED", raising=False)
    assert c.get("/api/x/translate/status").json() == {"enabled": False, "languages": []}
    r = c.post("/api/x/translate", json={"texts": ["Record not found at the source"], "target": "te"}).json()
    assert r["enabled"] is False and r["items"][0]["translated"] == "Record not found at the source" and r["items"][0]["machine"] is False


def test_translates_marks_machine_and_caches(on):
    t = "Birth record not found in our register " + TAG
    r = c.post("/api/x/translate", json={"texts": [t, t], "target": "te"}).json()
    assert [i["translated"] for i in r["items"]] == ["TE:" + t, "TE:" + t] and all(i["machine"] for i in r["items"])
    assert on == [[t]]                                   # the same text twice is sent once
    c.post("/api/x/translate", json={"texts": [t], "target": "te"})
    assert on == [[t]]                                   # the second request is served from the cache
    assert q("SELECT count(*) n FROM mdm.translation_cache WHERE source_text=%s", t)[0]["n"] == 1


def test_names_numbers_and_telugu_are_never_sent(on):
    texts = ["KA-1234/2026", "12345", "", "   ", "తెలుగు పాఠ్యం ఇప్పటికే ఉంది", "Ok"]
    r = c.post("/api/x/translate", json={"texts": texts, "target": "te"}).json()
    assert on == [] and all(not i["machine"] for i in r["items"])


def test_a_failing_service_gives_the_original_not_an_error(on, monkeypatch):
    def boom(texts, target): raise RuntimeError("down")
    monkeypatch.setattr(translate, "_call_service", boom)
    t = "Reason for rejection that will not translate " + TAG
    r = c.post("/api/x/translate", json={"texts": [t], "target": "te"})
    assert r.status_code == 200 and r.json()["items"][0] == {"text": t, "translated": t, "machine": False, "reviewed": False}
    assert q("SELECT count(*) n FROM mdm.translation_cache WHERE source_text=%s", t)[0]["n"] == 0


def test_limits_and_unknown_language(on):
    assert c.post("/api/x/translate", json={"texts": [], "target": "te"}).status_code == 400
    assert c.post("/api/x/translate", json={"texts": ["x" * 1001], "target": "te"}).status_code == 400
    assert c.post("/api/x/translate", json={"texts": ["hello there"], "target": "ta"}).status_code == 400


# ---- reviewer-checked translations win over machine output ----
def test_a_reviewed_translation_wins_is_not_marked_machine_and_skips_the_service(on):
    t = "This notice was acknowledged " + TAG
    c.post("/api/x/translate", json={"texts": [t], "target": "te"})                       # machine text is cached first
    assert on == [[t]]
    r = c.put("/api/x/translate/memory", json={"text": t, "translated": "ఈ నోటీసు అందినట్లు నమోదైంది"})
    assert r.status_code == 200
    r = c.post("/api/x/translate", json={"texts": ["  " + t.replace(" ", "  ") + " "], "target": "te"}).json()     # extra spaces make no difference
    it = r["items"][0]
    assert it["translated"] == "ఈ నోటీసు అందినట్లు నమోదైంది" and it["machine"] is False and it["reviewed"] is True
    assert on == [[t]]                                                                     # nothing new was sent to the service
    assert q("SELECT count(*) n FROM mdm.translation_cache WHERE source_text=%s", t)[0]["n"] == 0


def test_a_correction_replaces_an_earlier_one_and_can_be_removed(on):
    t = "Income certificate is too old " + TAG
    for g in ("మొదటి", "రెండవ"):
        assert c.put("/api/x/translate/memory", json={"text": t, "translated": g}).status_code == 200
    assert c.post("/api/x/translate", json={"texts": [t], "target": "te"}).json()["items"][0]["translated"] == "రెండవ"
    assert c.delete("/api/x/translate/memory", params={"text": t}).json() == {"removed": True}
    it = c.post("/api/x/translate", json={"texts": [t], "target": "te"}).json()["items"][0]
    assert it["machine"] is True and it["reviewed"] is False


def test_a_correction_without_telugu_letters_is_refused(on):
    r = c.put("/api/x/translate/memory", json={"text": "Pension stopped " + TAG, "translated": "Pension stopped"})
    assert r.status_code == 400
    assert c.put("/api/x/translate/memory", json={"text": "", "translated": "తెలుగు"}).status_code == 400


def test_importing_the_reviewer_csv(on):
    from app import translate_import
    import csv, io, tempfile, os
    a, b, d, e = (f"{w} {TAG}" for w in ("Row ok", "Row fixed", "Row blank", "Row bad"))
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["english", "machine_telugu", "reviewer_telugu", "verdict (ok / fix / wrong)"])
    w.writerow([a, "యంత్రం సరే", "", "ok"])
    w.writerow([b, "యంత్రం తప్పు", "సరిచేసిన పాఠ్యం", "fix"])
    w.writerow([d, "యంత్రం", "", ""])
    w.writerow([e, "యంత్రం", "no telugu here", "fix"])
    path = os.path.join(tempfile.mkdtemp(), "r.csv")
    open(path, "w", encoding="utf-8-sig").write(buf.getvalue())
    out = translate_import.main(["--reviewer", "Reviewer One", path])
    assert (out["approved"], out["corrected"], len(out["skipped"]), len(out["rejected"])) == (1, 1, 1, 1)
    r = c.post("/api/x/translate", json={"texts": [a, b], "target": "te"}).json()["items"]
    assert [i["translated"] for i in r] == ["యంత్రం సరే", "సరిచేసిన పాఠ్యం"] and all(i["reviewed"] and not i["machine"] for i in r)
    assert on == []
    rows = {m["source_text"]: m for m in c.get("/api/x/translate/memory").json()["items"]}
    assert rows[a]["origin"] == "approved" and rows[b]["origin"] == "corrected" and rows[b]["reviewed_by"] == "Reviewer One"
    out = translate_import.main(["--reviewer", "X", "--dry-run", path])             # a dry run stores nothing new
    assert c.get("/api/x/translate/memory").json()["items"][0]["reviewed_by"] != "X"


def test_a_long_list_is_sent_in_batches_the_service_accepts(on):
    texts = [f"Person name {TAG} {chr(97 + i)}{chr(97 + i)}xyz" for i in range(20)]
    r = c.post("/api/x/translate", json={"texts": texts, "target": "te"}).json()
    assert all(i["machine"] for i in r["items"]) and [i["translated"] for i in r["items"]] == ["TE:" + t for t in texts]
    assert [len(x) for x in on] == [16, 4]


def test_one_failing_batch_does_not_blank_the_others(on, monkeypatch):
    calls = []

    def flaky(texts, target):
        calls.append(len(texts))
        if len(calls) == 1:
            raise RuntimeError("bad request")
        return ["TE:" + t for t in texts]
    monkeypatch.setattr(translate, "_call_service", flaky)
    texts = [f"Village name {TAG} {chr(97 + i)}{chr(97 + i)}xyz" for i in range(20)]
    items = c.post("/api/x/translate", json={"texts": texts, "target": "te"}).json()["items"]
    assert [i["machine"] for i in items] == [False] * 16 + [True] * 4
