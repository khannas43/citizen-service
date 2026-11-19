"""Server messages in the person's language. A message the service refuses with is matched against a catalogue of templates
(the English text with its variable parts as {}) and returned in the requested language together with a stable code and the
variable parts, so any client can translate by code instead. English is the source and the fallback."""
from __future__ import annotations
import hashlib, json, re
from pathlib import Path

_DIR = Path(__file__).parent / "i18n"
SUPPORTED = {"te"}
# the fixed words that fill the {} slots (statuses, outcomes, routes) are translated before they are placed in a sentence
WORDS = {"te": {"pending": "పెండింగ్‌లో", "granted": "మంజూరైన", "refused": "తిరస్కరించిన", "revoked": "ఉపసంహరించిన", "expired": "గడువు ముగిసిన",
                "feed": "ఫీడ్", "file": "ఫైల్", "portal": "పోర్టల్", "both": "రెండూ", "accepted": "అంగీకరించిన", "applied": "అమలైన",
                "rejected": "తిరస్కరించిన", "acknowledged": "గుర్తించిన", "simulated": "అనుకరణ"}}
_cache: dict = {}


def code_of(template: str) -> str:
    words = re.sub(r"[^a-z0-9 ]", "", template.lower().replace("{}", "x")).split()[:5]
    return "_".join(words) + "_" + hashlib.sha1(template.encode()).hexdigest()[:6]


def _catalog(lang: str):
    if lang not in _cache:
        data = json.loads((_DIR / f"{lang}.json").read_text(encoding="utf-8"))
        _cache[lang] = [(re.compile("^" + "(.+?)".join(re.escape(p) for p in t.split("{}")) + "$", re.S), t, tr) for t, tr in data.items()]
    return _cache[lang]


def pick_language(header: str | None) -> str:
    for part in (header or "").split(","):
        tag = part.split(";")[0].strip().lower().split("-")[0]
        if tag in SUPPORTED:
            return tag
        if tag == "en":
            return "en"
    return "en"


def translate(msg: str, lang: str = "en") -> dict:
    """Returns {detail, code, params}; detail is in the requested language when the catalogue has the message."""
    if not isinstance(msg, str):
        return {"detail": msg}
    if lang in SUPPORTED:
        for rx, tpl, tr in _catalog(lang):
            m = rx.match(msg)
            if m:
                params = list(m.groups())
                shown = [WORDS[lang].get(str(p).lower(), p) for p in params]
                out = tr
                for p in shown:
                    out = out.replace("{}", str(p), 1)
                return {"detail": out, "code": code_of(tpl), "params": params, "lang": lang}
    # English, or no translation yet: still give the code when the message is in the catalogue
    for rx, tpl, _ in _catalog("te"):
        m = rx.match(msg)
        if m:
            return {"detail": msg, "code": code_of(tpl), "params": list(m.groups()), "lang": "en"}
    return {"detail": msg}
