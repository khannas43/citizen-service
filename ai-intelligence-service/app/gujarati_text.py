"""Script-tolerant understanding of spoken Gujarati for the voice eligibility assistant.

Why this exists: Whisper writes Gujarati speech in whichever script it feels like (the `medium` model
usually answers in Devanagari, with Hindi-style spellings and odd word splits), so matching literal
Gujarati-script keywords fails. Here Gujarati and Devanagari are first reduced to the same rough
phonetic form ("skeleton"), then matched fuzzily against a small vocabulary:

    छत्रीस / ચત્રીસ / છત્રીસ  ->  ctris          अमदा वाद मा  ->  amdavad ma

The vocabulary (numbers 1-100, lakh/thousand, gender, marital status, jobs, caste names, districts) was
written from Gujarati usage and tuned against real Whisper-medium transcripts; spellings of the less common
number words should be reviewed by a native speaker before wider use.
"""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field

# ------------------------------------------------------------------ script handling

_DEVANAGARI_START, _DEVANAGARI_END = 0x0900, 0x097F
_GUJARATI_OFFSET = 0x0A80 - 0x0900


def to_gujarati_script(text: str) -> str:
    """Devanagari -> Gujarati script (the two blocks share one layout); digits become ASCII."""
    out: list[str] = []
    for ch in text or "":
        cp = ord(ch)
        if 0x0966 <= cp <= 0x096F:          # Devanagari digits
            out.append(str(cp - 0x0966))
        elif 0x0AE6 <= cp <= 0x0AEF:        # Gujarati digits
            out.append(str(cp - 0x0AE6))
        elif cp in (0x0964, 0x0965):        # danda
            out.append(" ")
        elif _DEVANAGARI_START <= cp <= _DEVANAGARI_END:
            out.append(chr(cp + _GUJARATI_OFFSET))
        elif cp in (0x200C, 0x200D):        # zero-width joiners
            continue
        else:
            out.append(ch)
    return "".join(out)


_CONSONANTS = {
    "ક": "k", "ખ": "k", "ગ": "g", "ઘ": "g", "ઙ": "n",
    "ચ": "c", "છ": "c", "જ": "j", "ઝ": "j", "ઞ": "n",
    "ટ": "t", "ઠ": "t", "ડ": "d", "ઢ": "d", "ણ": "n",
    "ત": "t", "થ": "t", "દ": "d", "ધ": "d", "ન": "n",
    "પ": "p", "ફ": "p", "બ": "b", "ભ": "b", "મ": "m",
    "ય": "y", "ર": "r", "લ": "l", "ળ": "l", "વ": "v",
    "શ": "s", "ષ": "s", "સ": "s", "હ": "h",
}
_VOWEL_SIGNS = {
    "ા": "a", "િ": "i", "ી": "i", "ુ": "u", "ૂ": "u", "ૃ": "ru",
    "ે": "e", "ૈ": "e", "ૅ": "e", "ો": "o", "ૌ": "o", "ૉ": "o",
}
_INDEPENDENT_VOWELS = {
    "અ": "a", "આ": "a", "ઇ": "i", "ઈ": "i", "ઉ": "u", "ઊ": "u", "ઋ": "ru",
    "એ": "e", "ઐ": "e", "ઓ": "o", "ઔ": "o", "ઍ": "e", "ઑ": "o",
}
_VOWELS = set("aeiou")


def skeleton(token: str) -> str:
    """Rough phonetic form of one word. Inherent vowels, length, nasals and aspiration are ignored."""
    gu = to_gujarati_script(token).lower()
    out: list[str] = []
    for ch in gu:
        if ch in _CONSONANTS:
            out.append(_CONSONANTS[ch])
        elif ch in _VOWEL_SIGNS:
            out.append(_VOWEL_SIGNS[ch])
        elif ch in _INDEPENDENT_VOWELS:
            out.append(_INDEPENDENT_VOWELS[ch])
        elif ch.isascii() and ch.isalnum():
            out.append(ch)                  # Latin letters / digits pass through
        # virama, anusvara, chandrabindu, visarga, nukta and punctuation are dropped
    collapsed: list[str] = []
    for ch in "".join(out):
        if not collapsed or collapsed[-1] != ch:
            collapsed.append(ch)
    return "".join(collapsed)


def consonants(skel: str) -> str:
    return "".join(ch for ch in skel if ch not in _VOWELS)


def similarity(a: str, b: str) -> float:
    """1.0 for the same sound pattern; consonant-only agreement counts as a strong (0.85) match."""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    ratio = difflib.SequenceMatcher(None, a, b).ratio()
    ca, cb = consonants(a), consonants(b)
    if ca and ca == cb and (len(ca) >= 3 or (len(ca) == 2 and ratio >= 0.66)):
        ratio = max(ratio, 0.85)        # same consonants, different vowels: Whisper's usual wobble
    return ratio


# ------------------------------------------------------------------ vocabulary

# Gujarati number words. Where two numbers sound alike (7 and 60: saat / saath) both are listed and the
# caller picks by context.
_NUMBER_WORDS = """
1 એક|2 બે|3 ત્રણ|4 ચાર|5 પાંચ|6 છ|7 સાત|8 આઠ|9 નવ|10 દસ
11 અગિયાર|12 બાર|13 તેર|14 ચૌદ|15 પંદર|16 સોળ|17 સત્તર|18 અઢાર|19 ઓગણીસ|20 વીસ
21 એકવીસ|22 બાવીસ|23 ત્રેવીસ|24 ચોવીસ|25 પચ્ચીસ|26 છવ્વીસ|27 સત્તાવીસ|28 અઠ્ઠાવીસ|29 ઓગણત્રીસ|30 ત્રીસ
31 એકત્રીસ|32 બત્રીસ|33 તેત્રીસ|34 ચોત્રીસ|35 પાંત્રીસ|36 છત્રીસ|37 સડત્રીસ|38 અડત્રીસ|39 ઓગણચાલીસ|40 ચાલીસ
41 એકતાલીસ|42 બેતાલીસ|43 ત્રેતાલીસ|44 ચુમ્માલીસ|45 પિસ્તાલીસ|46 છેતાલીસ|47 સુડતાલીસ|48 અડતાલીસ|49 ઓગણપચાસ|50 પચાસ
51 એકાવન|52 બાવન|53 ત્રેપન|54 ચોપન|55 પંચાવન|56 છપ્પન|57 સત્તાવન|58 અઠ્ઠાવન|59 ઓગણસાઠ|60 સાઠ
61 એકસઠ|62 બાસઠ|63 ત્રેસઠ|64 ચોસઠ|65 પાંસઠ|66 છાસઠ|67 સડસઠ|68 અડસઠ|69 અગણોતેર|70 સિત્તેર
71 એકોતેર|72 બોતેર|73 તોતેર|74 ચુમોતેર|75 પંચોતેર|76 છોતેર|77 સિત્યોતેર|78 ઇઠ્યોતેર|79 ઓગણએંસી|80 એંસી
81 એક્યાસી|82 બ્યાસી|83 ત્યાસી|84 ચોર્યાસી|85 પંચ્યાસી|86 છ્યાસી|87 સિત્યાસી|88 ઇઠ્યાસી|89 નેવ્યાસી|90 નેવું
91 એકાણું|92 બાણું|93 ત્રાણું|94 ચોરાણું|95 પંચાણું|96 છન્નું|97 સત્તાણું|98 અઠ્ઠાણું|99 નવ્વાણું|100 સો
"""

# kind, Gujarati forms (more spellings mean more chances to match), value
_KEYWORDS: list[tuple[str, list[str], object]] = [
    ("AGEWORD", ["ઉંમર", "ઉમર", "વય"], None),
    ("YEAR", ["વર્ષ", "વરસ", "સાલ", "વર્ષનો", "વર્ષની", "વર્શનો", "વર્શની", "વર્ષનું", "વર્શનું"], None),
    ("ANNUAL", ["વાર્ષિક", "વાર્શિક", "વાર્શી", "વાર્ષી"], None),
    ("INCOME", ["આવક", "કમાણી", "પગાર", "આમદની"], None),
    ("LAKH", ["લાખ", "લાખો", "લાગ", "લાક"], 100_000),
    ("THOUSAND", ["હજાર", "હઝાર", "જાર", "અજાર", "સજાર", "સાજાર"], 1_000),
    ("CRORE", ["કરોડ"], 10_000_000),
    ("FRAC", ["દોઢ"], 1.5),
    ("FRAC", ["અઢી", "કઢી", "અડી"], 2.5),
    ("FRAC", ["સવા"], 1.25),
    ("AMOUNT", ["દોઢલાખ", "દોઢલાખની", "દોડલાગ", "દોઢલાગ", "દોડલાખ"], 150_000),
    ("PONA", ["પોણા", "પોણો", "પૌણા"], 0.25),
    ("AMOUNT", ["સવાલાખ"], 125_000),
    ("AMOUNT", ["અઢીલાખ"], 250_000),
    ("RUPEE", ["રૂપિયા", "રૂપિયાની", "રૂપિયે"], None),
    ("GENDER", ["સ્ત્રી", "મહિલા", "બહેન", "સ્ત્રીઓ"], "F"),
    ("GENDER", ["પુરુષ", "પુરૂષ", "ભાઈ", "પુરુશ"], "M"),
    ("MARITAL", ["વિધવા"], "WIDOWED"),
    ("MARITAL", ["વિવાહિત", "પરિણીત", "લગ્ન"], "MARRIED"),
    ("MARITAL", ["અવિવાહિત", "કુંવારી", "કુંવારો", "અપરિણીત", "અપરણિત", "અપરિનીત"], "SINGLE"),
    ("MARITAL", ["છૂટાછેડા", "છુટાછેડા", "છૂટાછેડાલીધેલી"], "DIVORCED"),
    ("MARITAL", ["વિધુર"], "WIDOWER"),
    ("EMPLOYMENT", ["ખેડૂત", "ખેડુત", "કિસાન", "ખેતી"], "FARMER"),
    ("EMPLOYMENT", ["વિદ્યાર્થી", "વિદ્યાર્થીની", "વિધ્યાર્થી"], "STUDENT"),
    ("EMPLOYMENT", ["નિવૃત્ત", "નિવૃત"], "RETIRED"),
    ("EMPLOYMENT", ["બેરોજગાર", "બેકાર"], "UNEMPLOYED"),
    ("EMPLOYMENT", ["ગૃહિણી"], "HOMEMAKER_F"),
    ("EMPLOYMENT", ["ઘરકામ"], "HOMEMAKER"),
    ("EMPLOYMENT", ["સ્વરોજગાર", "ધંધો", "વેપારી"], "SELF_EMPLOYED"),
    ("EMPLOYMENT", ["નોકરી", "નોકરિયાત"], "EMPLOYED"),
    ("CASTEWORD", ["જાતિ", "જ્ઞાતિ", "શ્રેણી", "કેટેગરી", "વર્ગ"], None),
]

# words that reduce to the same consonants as "umar" (age) but mean something else ("mari" = my)
_NOT_AGE_WORD = {"mari", "mara", "maru", "mare", "mar", "mri", "amri"}


@dataclass(frozen=True)
class LexItem:
    key: str                    # skeleton
    kind: str
    value: object
    min_score: float


def _build_lexicon() -> list[LexItem]:
    items: list[LexItem] = []
    for line in _NUMBER_WORDS.strip().splitlines():
        for entry in line.split("|"):
            num, word = entry.strip().split(" ", 1)
            sk = skeleton(word)
            # very short skeletons (એક -> "ek", છ -> "c") must match exactly
            items.append(LexItem(sk, "NUM", int(num), 1.0 if len(sk) <= 3 else 0.82))
    for kind, forms, value in _KEYWORDS:
        for form in forms:
            sk = skeleton(form)
            if kind in ("LAKH", "THOUSAND", "CRORE", "FRAC"):
                floor = 0.8                      # spelling variants (sajar, ajar, lag) are listed explicitly
            elif kind in ("YEAR", "AGEWORD", "ANNUAL"):
                floor = 0.8                      # varsh -> varshch, umar -> amar
            elif len(sk) <= 3:
                floor = 1.0
            else:
                floor = 0.8
            items.append(LexItem(sk, kind, value, floor))
    return items


LEXICON = _build_lexicon()
_LEX_BY_KEY: dict[str, list[LexItem]] = {}
for _item in LEXICON:
    _LEX_BY_KEY.setdefault(_item.key, []).append(_item)

# ------------------------------------------------------------------ tokens and matching


@dataclass
class Token:
    text: str
    skel: str
    start: int
    digits: int | None = None       # a literal number such as 48 or 30,000
    kind: str | None = None
    value: object = None
    values: list[int] = field(default_factory=list)   # ambiguous number-word candidates


_TOKEN_RE = re.compile(r"\d[\d,]*(?:\.\d+)?|[^\s,.;:!?()\"'।॥|\-–—]+")


def tokenize(text: str) -> list[Token]:
    tokens: list[Token] = []
    for m in _TOKEN_RE.finditer(to_gujarati_script(text or "")):
        raw = m.group(0)
        if raw[0].isdigit():
            try:
                tokens.append(Token(raw, raw, m.start(), digits=int(float(raw.replace(",", "")))))
            except ValueError:
                continue
        else:
            tokens.append(Token(raw, skeleton(raw), m.start()))
    return tokens


def _best_lexicon(skel: str) -> tuple[float, list[LexItem]]:
    """Best-scoring lexicon entries for this skeleton. Ties on the loose score are broken by the plain
    similarity, so 19 (ognis) beats 79 (ognesi) for "agnis"; true ties stay as ambiguity (7 vs 60)."""
    exact = _LEX_BY_KEY.get(skel)
    if exact:
        return 1.0, list(exact)
    scored: list[tuple[float, float, LexItem]] = []
    for item in LEXICON:
        if abs(len(item.key) - len(skel)) > 3:
            continue
        score = similarity(skel, item.key)
        if score < item.min_score:
            continue
        if item.kind == "AGEWORD" and skel in _NOT_AGE_WORD:
            continue
        raw = difflib.SequenceMatcher(None, skel, item.key).ratio()
        scored.append((score, raw, item))
    if not scored:
        return 0.0, []
    top = max(s[0] for s in scored)
    pool = [s for s in scored if abs(s[0] - top) <= 1e-9]
    # among equals prefer the plainly closest word, then the one with identical consonants (sad-tris = 37, not 38)
    def tie_key(s):
        return s[1] + (0.01 if consonants(s[2].key) == consonants(skel) else 0.0)
    top_key = max(tie_key(s) for s in pool)
    return top, [s[2] for s in pool if abs(tie_key(s) - top_key) <= 1e-9]


def _lexicon_hit(skel: str, floor: float = 0.85) -> bool:
    if len(skel) < 3 and skel not in _LEX_BY_KEY:
        return False
    score, hits = _best_lexicon(skel)
    return bool(hits) and score >= floor


_COPULAS = {"cu", "su", "ce", "cho", "chu", "c"}


def _split_skeleton(skel: str, depth: int = 0) -> list[str]:
    """Split one glued word into vocabulary pieces ([skel] if it should stay whole)."""
    if len(skel) < 5 or depth > 3 or _lexicon_hit(skel, 0.95):
        return [skel]
    for cut in range(2, len(skel) - 1):
        left, right = skel[:cut], skel[cut:]
        tail = right in _COPULAS and len(left) >= 3 and _lexicon_hit(left, 0.85 if len(left) >= 4 else 0.95)
        if not tail and not _lexicon_hit(left, 0.95):
            continue
        particle = len(right) <= 3 and len(left) >= 4 and left in _LEX_BY_KEY      # kedut + usu
        # tail: a spoken copula ("vidva|cu", "lag|ce") after a vocabulary word that Whisper spelt loosely
        if particle or tail or _lexicon_hit(right, 0.8):
            return [left, right]                       # a leftover particle stays, unlabelled
        rest = _split_skeleton(right, depth + 1)       # three or four words glued together
        if len(rest) > 1:
            return [left, *rest]
    # a gender/marital/job word glued to the end of an unknown word and a copula ("delpuruscu" = ... purus cu)
    core = skel[:-2] if skel[-2:] in _COPULAS else skel
    for cut in range(1, len(core) - 3):
        word = core[cut:]
        if any(i.kind in ("GENDER", "MARITAL", "EMPLOYMENT") for i in _LEX_BY_KEY.get(word, [])):
            return [core[:cut], word]
    return [skel]


def split_fused(tokens: list[Token]) -> list[Token]:
    """Whisper sometimes glues neighbouring words ("umrcumali", "terhjar"): split where the pieces are
    vocabulary words. Only words that are not themselves vocabulary are considered."""
    out: list[Token] = []
    for tok in tokens:
        if tok.digits is not None:
            out.append(tok)
            continue
        for piece in _split_skeleton(tok.skel):
            out.append(Token(tok.text, piece, tok.start) if piece != tok.skel else tok)
    return out


def label_tokens(tokens: list[Token]) -> None:
    """Greedy, non-overlapping labelling of 1-3 token windows (Whisper splits and joins words freely)."""
    candidates: list[tuple[float, int, int, list[LexItem]]] = []
    n = len(tokens)
    for i in range(n):
        if tokens[i].digits is not None:
            continue
        for size in (1, 2, 3):
            if i + size > n or any(t.digits is not None for t in tokens[i:i + size]):
                continue
            skel = "".join(t.skel for t in tokens[i:i + size])
            if len(skel) < 2:
                continue
            score, hits = _best_lexicon(skel)
            if hits:
                candidates.append((score, size, i, hits))
    # a longer window that matches well ("sad tris" = 37) should beat its own tail ("tris" = 30)
    single_kinds = {c[2]: {h.kind for h in c[3]} for c in candidates if c[1] == 1}

    def window_bonus(c) -> float:
        score, size, i, hits = c
        if size == 1 or score < 0.85:
            return 0.0
        kinds = {h.kind for h in hits}
        # "iko ter" = 71 beats its tail "ter" = 13, but "esi ajar" (80 + thousand) must not merge into one word
        if any(single_kinds.get(j) and not single_kinds[j] & kinds for j in range(i, i + size)):
            return 0.0
        return 0.2

    candidates.sort(key=lambda c: (-(c[0] + window_bonus(c)), -c[1], c[2]))
    taken = [False] * n
    for score, size, i, hits in candidates:
        if any(taken[i:i + size]):
            continue
        first = hits[0]
        tok = tokens[i]
        tok.kind = first.kind
        tok.value = first.value
        if first.kind == "NUM":
            tok.values = sorted({h.value for h in hits if h.kind == "NUM"})
            tok.value = tok.values[-1]
        # a multi-token window lives on its first token; the rest are consumed
        for j in range(i + 1, i + size):
            tokens[j].kind = "_PART"
        for j in range(i, i + size):
            taken[j] = True


# ------------------------------------------------------------------ field extraction

_CASTE_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    ("OBC", ("obi", "obc", "obs")),
    ("EWS", ("ews", "ibdbl", "idbl")),
    ("ST", ("esti", "esit", "estt")),
    ("NT", ("enti", "enit", "entt")),
    ("GENERAL", ("jnrl", "janrl", "jnral", "general", "janaral", "jnarl", "samany", "samanya")),
]
_SC_PATTERNS = ("esi", "essi", "esci")
_ST_WORDS = ("jnjat", "jjat", "jnjti", "jnjit", "janjat")
_SC_WORDS = ("sucit", "sucet", "succit", "sucat", "sucut")


_LATIN_CASTE = {
    "sc": "SC", "st": "ST", "obc": "OBC", "nt": "NT", "ews": "EWS", "general": "GENERAL", "gen": "GENERAL",
    "ast": "ST", "ac": "SC", "asc": "SC",      # "es-ti" / "es-si" heard as "a-st" / "a-c"
}
_TOKEN_CASTE_PREFIXES: list[tuple[str, tuple[str, ...]]] = [
    ("ST", ("esti", "esit")),
    ("NT", ("eti", "enti", "enit")),       # the nasal in "enti" is dropped by the phonetic form
]


def _caste(tokens: list[Token]) -> str | None:
    for tok in tokens:                      # "SC", "OBC" written in Latin letters
        if tok.digits is None and tok.text.isascii() and tok.text.lower() in _LATIN_CASTE:
            return _LATIN_CASTE[tok.text.lower()]
    for tok in tokens:                      # "ेंटी" -> eti, with a particle stuck on the end (eticu)
        if tok.digits is not None:
            continue
        for caste, prefixes in _TOKEN_CASTE_PREFIXES:
            if any(tok.skel == p or (tok.skel.startswith(p) and len(tok.skel) <= len(p) + 2) for p in prefixes):
                return caste
    joined = "".join(t.skel for t in tokens if t.digits is None and t.kind != "MARITAL")   # "prenit" is not "enit"
    if any(p in joined for p in _ST_WORDS):                  # anusuchit janjati: contains "sucit" too, so ST first
        return "ST"
    if any(p in joined for p in _SC_WORDS):
        return "SC"
    for caste, pats in _CASTE_PATTERNS:
        if any(p in joined for p in pats):
            return caste
    if any(p in joined for p in _SC_PATTERNS):
        return "SC"
    # "mari jati si che": only the letter "si" survives after the caste word
    for i, tok in enumerate(tokens):
        if tok.kind == "CASTEWORD":
            for nxt in tokens[i + 1:i + 3]:
                if nxt.digits is None and nxt.skel in ("si", "sci"):
                    return "SC"
    return None


def _num_value(tok: Token, *, prefer_large: bool = True) -> int | None:
    if tok.digits is not None:
        return tok.digits
    if tok.kind == "NUM":
        return max(tok.values) if prefer_large else min(tok.values)
    return None


def _age(tokens: list[Token], used: set[int]) -> int | None:
    n = len(tokens)
    live = [i for i in range(n) if tokens[i].kind != "_PART"]
    for pos, i in enumerate(live):
        if tokens[i].kind != "YEAR":
            continue
        for back in live[max(0, pos - 3):pos][::-1]:        # number just before "varsh"
            val = _num_value(tokens[back])
            if val is not None and 0 < val <= 120:
                used.add(back)
                return val
    for pos, i in enumerate(live):
        if tokens[i].kind != "AGEWORD":
            continue
        for fwd in live[pos + 1:pos + 4]:                    # number just after "umar"
            if tokens[fwd].kind in ("INCOME", "LAKH", "THOUSAND", "AMOUNT", "YEAR", "FRAC"):
                break                                          # we have run into the income phrase
            val = _num_value(tokens[fwd])
            if val is not None and 0 < val <= 120:
                used.add(fwd)
                return val
    return None


def _income(tokens: list[Token], used: set[int]) -> int | None:
    live = [i for i in range(len(tokens)) if tokens[i].kind != "_PART" and i not in used]
    start = None
    for pos, i in enumerate(live):
        if tokens[i].kind == "INCOME":
            start = pos + 1
            break
    if start is None:                                         # no "avak": look for lakh / hajar
        for pos, i in enumerate(live):
            if tokens[i].kind in ("LAKH", "THOUSAND", "CRORE", "FRAC", "AMOUNT"):
                start = max(0, pos - 2)
                break
    if start is None:
        return None
    total, cur, seen, pona = 0.0, None, False, 0.0
    for i in live[start:start + 9]:
        tok = tokens[i]
        if tok.kind == "PONA":                               # "pona be lakh" = 2 - 1/4 = 1.75 lakh
            pona = float(tok.value)
            continue
        if tok.kind == "RUPEE" and seen:
            break
        val = _num_value(tok)
        if val is not None:
            if cur is not None and tok.digits is None:       # "bis ... pacas": keep the first of two plain numbers
                continue
            cur = val - pona
            pona = 0.0
            seen = True
        elif tok.kind == "AMOUNT":
            total += float(tok.value)
            cur, seen = None, True
        elif tok.kind == "FRAC":
            cur = float(tok.value)
            seen = True
        elif tok.kind in ("LAKH", "THOUSAND", "CRORE"):
            if cur is not None:                              # "hajar" with no number before it is just a word
                total += cur * float(tok.value)
                seen = True
            cur = None
        elif tok.kind in ("YEAR", "AGEWORD", "GENDER", "MARITAL", "EMPLOYMENT", "CASTEWORD") and seen:
            break
    if cur is not None:                                       # trailing plain number, e.g. "30,000"
        if cur >= 1000 or total > 0:
            total += cur
    if total >= 1000:
        return int(round(total))
    return None


def extract_gujarati_slots(text: str) -> dict[str, object]:
    """Profile slots from Gujarati speech written in Gujarati script, Devanagari or a mix with Latin."""
    tokens = split_fused(tokenize(text))
    if not tokens:
        return {}
    label_tokens(tokens)
    slots: dict[str, object] = {}
    used: set[int] = set()

    first = lambda kind: next((t for t in tokens if t.kind == kind), None)  # noqa: E731

    marital = first("MARITAL")
    if marital:
        if marital.value == "WIDOWER":
            slots["maritalStatus"] = "WIDOWED"
            slots["gender"] = "M"
        else:
            slots["maritalStatus"] = marital.value
            if marital.value == "WIDOWED":
                slots["gender"] = "F"
    gender = next((t for t in tokens if t.kind == "GENDER"), None)
    if gender and "gender" not in slots:
        slots["gender"] = gender.value
    emp = first("EMPLOYMENT")
    if emp:
        if emp.value == "HOMEMAKER_F":              # the feminine word for homemaker
            slots["employmentStatus"] = "HOMEMAKER"
            slots.setdefault("gender", "F")
        else:
            slots["employmentStatus"] = emp.value
    caste = _caste(tokens)
    if caste:
        slots["casteCategory"] = caste
    age = _age(tokens, used)
    if age:
        slots["age"] = age
    income = _income(tokens, used)
    if income:
        slots["annualIncome"] = income
    return slots


# ------------------------------------------------------------------ districts (script-tolerant)


def build_district_index(aliases: dict[str, list[str]]) -> list[tuple[str, str]]:
    """(skeleton, district) for every non-Latin alias, longest first."""
    out: list[tuple[str, str]] = []
    for district, names in aliases.items():
        for name in names:
            if all(ord(ch) < 0x0900 for ch in name):
                continue
            sk = skeleton(name)
            if len(sk) >= 3:
                out.append((sk, district))
    out.sort(key=lambda x: -len(x[0]))
    return out


_POSTPOSITIONS = ("ma", "ni", "no", "na", "nu")


def _district_score(window: str, size: int, sk: str) -> float:
    """How well a spoken window matches one district name (0 = not at all)."""
    if len(sk) <= 4:
        # short names (dang, tapi) must match a whole window, give or take one stray letter
        if window == sk or (size == 1 and window.startswith(sk) and len(window) <= len(sk) + 2):
            return 1.0
        if size == 1 and len(window) == len(sk) + 1 and window.endswith(sk):
            return 0.9
        return 0.0
    if window == sk:
        return 1.0
    if window.startswith(sk) and len(window) <= len(sk) + 2:
        return 0.95                                  # name + postposition (amdavadma)
    if abs(len(window) - len(sk)) <= 2:
        score = similarity(window, sk)
        return score if score >= 0.86 else 0.0
    return 0.0


def find_district(text: str, index: list[tuple[str, str]]) -> str | None:
    tokens = [t for t in tokenize(text) if t.digits is None]
    n = len(tokens)
    best: tuple[float, str] | None = None
    for i in range(n):
        for size in (1, 2, 3):
            if i + size > n:
                continue
            joined = "".join(t.skel for t in tokens[i:i + size])
            # also try the window without a glued-on postposition ("bnaskantama" -> "bnaskanta")
            variants = {joined} | {joined[:-len(p)] for p in _POSTPOSITIONS
                                   if joined.endswith(p) and len(joined) - len(p) >= 3}
            for window in variants:
                if len(window) < 3:
                    continue
                for sk, district in index:
                    score = _district_score(window, size, sk)
                    if score and (best is None or score > best[0]):
                        best = (score, district)
    return best[1] if best else None
