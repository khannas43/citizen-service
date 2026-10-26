"""Name handling for Telangana records: Telugu script to Latin, honorific stripping, a phonetic skeleton key.

Everything here is approximate on purpose. The aim is that the common spelling variants of one name
(Goud / Gowd, Srinivas / Sreenivas / Srinivasa, Mohammed / Mohd, a Telugu-script spelling) end up with the same
or very close keys, while different names stay apart. No external service is used.
"""
from __future__ import annotations
import re
import unicodedata

# ---- Telugu script -> Latin (rough romanisation) -------------------------------------------------
_T_CONS = {"క": "k", "ఖ": "kh", "గ": "g", "ఘ": "gh", "ఙ": "ng", "చ": "ch", "ఛ": "chh", "జ": "j", "ఝ": "jh", "ఞ": "n",
           "ట": "t", "ఠ": "th", "డ": "d", "ఢ": "dh", "ణ": "n", "త": "t", "థ": "th", "ద": "d", "ధ": "dh", "న": "n",
           "ప": "p", "ఫ": "ph", "బ": "b", "భ": "bh", "మ": "m", "య": "y", "ర": "r", "ఱ": "r", "ల": "l", "ళ": "l",
           "వ": "v", "శ": "sh", "ష": "sh", "స": "s", "హ": "h"}
_T_VOWEL = {"అ": "a", "ఆ": "aa", "ఇ": "i", "ఈ": "ee", "ఉ": "u", "ఊ": "oo", "ఋ": "ru", "ఎ": "e", "ఏ": "e", "ఐ": "ai",
            "ఒ": "o", "ఓ": "o", "ఔ": "au"}
_T_SIGN = {"ా": "aa", "ి": "i", "ీ": "ee", "ు": "u", "ూ": "oo", "ె": "e", "ే": "e", "ై": "ai", "ొ": "o", "ో": "o", "ౌ": "au",
           "ృ": "ru"}
_VIRAMA, _ANUSVARA, _VISARGA = "్", "ం", "ః"


def has_telugu(s: str) -> bool:
    return any("ఀ" <= c <= "౿" for c in s or "")


def telugu_to_latin(s: str) -> str:
    out, i, n = [], 0, len(s)
    while i < n:
        c = s[i]
        if c in _T_CONS:
            base = _T_CONS[c]
            nxt = s[i + 1] if i + 1 < n else ""
            if nxt == _VIRAMA:
                out.append(base)
                i += 2
                continue
            if nxt in _T_SIGN:
                out.append(base + _T_SIGN[nxt])
                i += 2
                continue
            out.append(base + "a")
            i += 1
        elif c in _T_VOWEL:
            out.append(_T_VOWEL[c]); i += 1
        elif c == _ANUSVARA:
            out.append("n"); i += 1
        elif c in (_VISARGA, "‌", "‍"):
            i += 1
        else:
            out.append(c); i += 1
    return "".join(out)


# ---- Latin normalisation ------------------------------------------------------------------------
_HONORIFICS = {"smt", "sri", "shri", "mr", "mrs", "ms", "dr", "late", "sk", "s/o", "d/o", "w/o"}
_ALIAS = {"mohd": "mohammed", "md": "mohammed", "muhammad": "mohammed", "mohamed": "mohammed", "mahammad": "mohammed",
          "sheikh": "shaikh", "shaik": "shaikh", "sk": "shaikh", "srinivasulu": "srinivas", "srinivasa": "srinivas",
          "sreenivas": "srinivas", "sreenivasa": "srinivas", "venkata": "venkat", "laxmi": "lakshmi", "lakshmy": "lakshmi",
          "lakshman": "laxman", "rajendra": "rajender", "rajendar": "rajender", "ravindra": "ravinder", "ravender": "ravinder",
          "yadayya": "yadaiah", "nayak": "naik", "yerukala": "erukala", "erukula": "erukala", "gowd": "goud", "reddi": "reddy",
          "swati": "swathi", "swathy": "swathi"}


def _ascii(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def tokens(name: str) -> list[str]:
    """Lower-case Latin tokens (initials kept as one letter), honorifics removed, aliases folded."""
    if not name:
        return []
    s = telugu_to_latin(name) if has_telugu(name) else name
    s = _ascii(s).lower()
    s = re.sub(r"[^a-z\s.]", " ", s)
    s = re.sub(r"\.", ". ", s)
    out = []
    for t in s.split():
        t = t.strip(".")
        if not t or t in _HONORIFICS:
            continue
        out.append(_ALIAS.get(t, t))
    return out


def skeleton(tok: str) -> str:
    """Phonetic skeleton: keeps the first letter, then only consonants, with common equivalences folded."""
    t = tok.lower()
    if len(t) <= 1:
        return t
    t = re.sub(r"^y(?=[aeiou])", "", t)
    for a, b in (("ph", "p"), ("th", "t"), ("dh", "d"), ("kh", "k"), ("gh", "g"), ("bh", "b"), ("sh", "s"), ("chh", "c"), ("ch", "c"),
                 ("ck", "k"), ("w", "v"), ("z", "j"), ("x", "ks"), ("q", "k"), ("f", "p")):
        t = t.replace(a, b)
    first, rest = ("a" if t[0] in "aeiou" else t[0]), t[1:]
    rest = re.sub(r"[aeiouy]", "", rest)
    s = first + rest
    s = re.sub(r"(.)\1+", r"\1", s)
    return s


def name_key(name: str) -> str:
    return " ".join(sorted(skeleton(t) for t in tokens(name)))
