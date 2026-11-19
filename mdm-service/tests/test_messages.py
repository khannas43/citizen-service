import ast, glob, os
os.environ.setdefault("MDM_AUTH_DISABLED", "true")
os.environ["MDM_BASE"] = ""
from fastapi.testclient import TestClient
from app.api import app
from app import messages

c = TestClient(app)


def test_every_refusal_template_has_a_telugu_translation():
    def tpl(n):
        if isinstance(n, ast.Constant) and isinstance(n.value, str): return n.value
        if isinstance(n, ast.JoinedStr): return "".join(v.value if isinstance(v, ast.Constant) else "{}" for v in n.values)
        if isinstance(n, ast.BinOp) and isinstance(n.op, ast.Add):
            a, b = tpl(n.left), tpl(n.right); return None if a is None or b is None else a + b
    found, missing = set(), []
    for f in glob.glob(os.path.join(os.path.dirname(messages.__file__), "*.py")):
        for n in ast.walk(ast.parse(open(f).read())):
            if isinstance(n, ast.Call) and getattr(n.func, "id", getattr(n.func, "attr", None)) == "Refused" and n.args:
                t = tpl(n.args[0])
                if t: found.add(t)
    cat = {t for _, t, _ in messages._catalog("te")}
    assert not (found - cat), sorted(found - cat)
    # placeholders line up between English and Telugu
    for _, t, tr in messages._catalog("te"):
        assert t.count("{}") == tr.count("{}"), t


def test_translate_fills_variable_parts_and_gives_a_code():
    r = messages.translate("This request is granted, so it cannot be answered. Ask again to start a new request.", "te")
    assert "మంజూరైన" in r["detail"] and r["params"] == ["granted"] and r["code"].startswith("this_request_is_x_so")
    en = messages.translate("Consent not found", "en")
    assert en["detail"] == "Consent not found"


def test_the_api_answers_in_the_requested_language():
    te = c.get("/api/x/consents/99999999", headers={"Accept-Language": "te-IN,te;q=0.9"})
    en = c.get("/api/x/consents/99999999")
    assert te.status_code == en.status_code == 404
    assert te.json()["detail"] == "సమ్మతి కనబడలేదు" and en.json()["detail"] == "Consent not found" and te.json()["code"] == en.json()["code"]
