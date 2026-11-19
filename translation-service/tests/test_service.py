import os
os.environ["MT_ENGINE"] = "echo"
from fastapi.testclient import TestClient
from app import main

c = TestClient(main.app)


def test_health_names_the_engine_and_languages():
    h = c.get("/health").json()
    assert h["ok"] and h["engine"] == "echo" and h["languages"] == ["te"]


def test_translates_a_batch_in_order():
    r = c.post("/translate", json={"texts": ["one", "two"], "target": "te"})
    assert r.status_code == 200 and r.json()["translations"] == ["one", "two"]


def test_refuses_a_language_that_is_not_enabled_and_oversize_input():
    assert c.post("/translate", json={"texts": ["x"], "target": "ta"}).status_code == 400
    assert c.post("/translate", json={"texts": ["x"] * 17, "target": "te"}).status_code == 400
    assert c.post("/translate", json={"texts": ["x" * 1001], "target": "te"}).status_code == 400
    assert c.post("/translate", json={"texts": ["x"], "source": "te", "target": "te"}).status_code == 400


def test_a_failing_model_gives_503_not_a_crash(monkeypatch):
    class Boom:
        name, loaded = "indictrans2", False
        def translate(self, t, g): raise RuntimeError("no weights")
    monkeypatch.setattr(main, "engine", Boom())
    assert c.post("/translate", json={"texts": ["x"], "target": "te"}).status_code == 503


def test_protected_terms_are_kept_and_mapped(tmp_path, monkeypatch):
    from app import glossary
    p = tmp_path / "g.json"
    p.write_text('{"keep": ["PDS", "Rythu Bandhu"], "map": {"ration card": "రేషన్ కార్డు"}}', encoding="utf-8")
    g = glossary.load(str(p))
    t, m = glossary.protect("The PDS ration card of a Rythu Bandhu farmer, ration card again", g)
    assert "PDS" not in t and "ration" not in t and len(m) == 3            # same term twice gets one token
    back, ok = glossary.restore(t, m)
    assert ok and back == "The PDS రేషన్ కార్డు of a Rythu Bandhu farmer, రేషన్ కార్డు again"
    assert glossary.protect("pds is matched without case", g)[1]          # case-insensitive
    assert glossary.protect("a standard apps", g)[1] == {}                 # not inside other words


def test_a_text_whose_terms_went_missing_is_translated_again_plain(monkeypatch):
    class Drop:
        name, loaded = "indictrans2", True
        def translate(self, texts, target):
            return ["(dropped)" if "ZQ" in t else "plain:" + t for t in texts]
    monkeypatch.setattr(main, "engine", Drop())
    r = c.post("/translate", json={"texts": ["Check the PDS card", "No terms here"], "target": "te"}).json()
    assert r["translations"] == ["plain:Check the PDS card", "plain:No terms here"] and r["unprotected"] == 1


def test_a_full_stop_the_model_added_to_a_name_or_label_is_dropped():
    from app.main import match_ending
    assert match_ending("Male", "పురుషుడు.") == "పురుషుడు"
    assert match_ending("Kamareddy", "కామారెడ్డి।") == "కామారెడ్డి"
    assert match_ending("Record not found.", "రికార్డు దొరకలేదు.") == "రికార్డు దొరకలేదు."
    assert match_ending("Is it done?", "అయిందా?") == "అయిందా?"
    assert match_ending("", "") == ""
