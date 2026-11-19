"""Protected terms. A term is swapped for a neutral token before translation and put back afterwards, so scheme names, department names and
abbreviations are not mangled by the model. "keep" terms stay as written; "map" terms become the Telugu the reviewer approved.
If a token does not come back from the model, that text is translated again without protection rather than shown damaged."""
from __future__ import annotations
import json, os, re

PATH = os.getenv("MT_GLOSSARY", os.path.join(os.path.dirname(__file__), "glossary.json"))


def load(path: str = PATH) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            g = json.load(f)
    except FileNotFoundError:
        g = {}
    keep = [t for t in g.get("keep", []) if t.strip()]
    mapped = {k: v for k, v in g.get("map", {}).items() if k.strip() and v.strip()}
    terms = sorted({*keep, *mapped}, key=len, reverse=True)       # longest first: "ration card" before "card"
    return {"keep": set(keep), "map": mapped, "pattern": re.compile(r"(?<![\w])(" + "|".join(re.escape(t) for t in terms) + r")(?![\w])", re.I) if terms else None}


def token(i: int) -> str:
    return f"ZQ{i}Q"


def protect(text: str, g: dict):
    """Returns (text with tokens, {token: replacement}). No glossary or no match: the text is unchanged."""
    if not g.get("pattern"):
        return text, {}
    found, out = {}, []

    def sub(m):
        t = m.group(0)
        key = next((k for k in [*g["map"], *g["keep"]] if k.lower() == t.lower()), t)
        for tok, (orig, _) in found.items():
            if orig.lower() == t.lower():
                return tok
        tok = token(len(found) + 1)
        found[tok] = (t, g["map"].get(key, t))
        return tok
    protected = g["pattern"].sub(sub, text)
    return protected, {tok: rep for tok, (_, rep) in found.items()}


def restore(text: str, mapping: dict):
    """Returns (text, ok). ok is false if any token went missing."""
    ok = True
    for tok, rep in mapping.items():
        if tok not in text:
            ok = False
        text = text.replace(tok, rep)
    return text, ok
