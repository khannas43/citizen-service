"""Deterministic (+ optional LLM fallback) slot extraction for guest eligibility voice."""
from __future__ import annotations

import json
import re
from typing import Any

from app.gujarati_text import build_district_index, extract_gujarati_slots, find_district

DISTRICTS = [
    "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar", "Bhavnagar", "Jamnagar",
    "Junagadh", "Kutch", "Mehsana", "Anand", "Bharuch", "Narmada", "Sabarkantha",
    "Banaskantha", "Patan", "Surendranagar", "Morbi", "Amreli", "Botad", "Porbandar",
    "Navsari", "Valsad", "Dang", "Tapi", "Mahisagar", "Chhota Udaipur", "Aravalli",
    "Dahod", "Panchmahal", "Kheda", "Gir Somnath",
]

CASTES = {"SC", "ST", "OBC", "NT", "GENERAL", "EWS"}
GENDERS = {"F", "M"}
MARITAL = {"SINGLE", "MARRIED", "WIDOWED", "DIVORCED", "SEPARATED"}
EMPLOYMENT = {
    "FARMER", "AGRICULTURIST", "SELF_EMPLOYED", "EMPLOYED", "UNEMPLOYED",
    "STUDENT", "HOMEMAKER", "RETIRED",
}
EDUCATION = {
    "NONE", "PRIMARY", "SECONDARY", "MATRIC", "HIGHER_SEC", "GRADUATE", "POST_GRADUATE",
}

REQUIRED_KEYS = ("age", "dob", "gender", "casteCategory", "district")

GU_NUM = {
    "એક": 1, "બે": 2, "ત્રણ": 3, "ચાર": 4, "પાંચ": 5, "છ": 6, "સાત": 7, "આઠ": 8, "નવ": 9,
    "દસ": 10, "અગિયાર": 11, "બાર": 12, "તેર": 13, "ચૌદ": 14, "પંદર": 15,
    "સોળ": 16, "સત્તર": 17, "અઢાર": 18, "ઓગણીસ": 19, "વીસ": 20, "ત્રીસ": 30,
    "ચalis": 40, "પચાસ": 50, "સાઠ": 60,
}

EN_INCOME_PHRASES = {
    "one lakh twenty thousand": 120_000,
    "1 lakh 20 thousand": 120_000,
    "one lakh twenty": 120_000,
}


def contains_sensitive_id(transcript: str) -> bool:
    return bool(re.search(r"\d{10,}", transcript or ""))


def merge_slots(prior: dict[str, Any] | None, new: dict[str, Any]) -> dict[str, Any]:
    out = dict(prior or {})
    for k, v in (new or {}).items():
        if v is not None and v != "":
            out[k] = v
    return out


def missing_required(slots: dict[str, Any]) -> list[str]:
    missing = []
    if not slots.get("age") and not slots.get("dob"):
        missing.append("ageOrDob")
    if not slots.get("gender"):
        missing.append("gender")
    if not slots.get("casteCategory"):
        missing.append("casteCategory")
    if not slots.get("district"):
        missing.append("district")
    return missing


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def _parse_income(text: str) -> int | None:
    t = _norm(text)
    for phrase, amount in EN_INCOME_PHRASES.items():
        if phrase in t:
            return amount
    # Gujarati lakh patterns
    gu_lakh = re.search(
        r"(એક|બે|ત્રણ|ચાર|પાંચ|1|2|3|4|5)?\s*લાખ\s*(?:વીસ|30|40|50|\d+)?\s*(?:હજાર)?",
        text or "",
    )
    if gu_lakh:
        base = 100_000
        m = re.search(r"(\d+(?:\.\d+)?)\s*lakh", t)
        if m:
            return int(float(m.group(1)) * 100_000)
        if "એક" in text and "લાખ" in text:
            extra = 0
            if "વીસ" in text and "હજાર" in text:
                extra = 20_000
            elif re.search(r"(\d+)\s*હજાર", text):
                extra = int(re.search(r"(\d+)\s*હજાર", text).group(1)) * 1000
            return base + extra
    m = re.search(r"(\d+(?:\.\d+)?)\s*lakh", t)
    if m:
        return int(float(m.group(1)) * 100_000)
    m = re.search(r"(\d+(?:\.\d+)?)\s*lac", t)
    if m:
        return int(float(m.group(1)) * 100_000)
    m = re.search(r"income\s*(?:is|of|around)?\s*₹?\s*([\d,]+)", t)
    if m:
        return int(m.group(1).replace(",", ""))
    m = re.search(r"₹?\s*([\d,]{5,})", t)
    if m:
        return int(m.group(1).replace(",", ""))
    m = re.search(r"\b(\d{5,7})\b", t)
    if m:
        val = int(m.group(1))
        if val >= 10_000:
            return val
    return None


def _parse_age(text: str) -> int | None:
    t = _norm(text)
    m = re.search(r"(\d{1,3})\s*(?:years?\s*old|year\s*old|yrs?\.?|years?)", t)
    if m:
        age = int(m.group(1))
        return age if 0 < age <= 120 else None
    m = re.search(r"age\s*(?:is|of)?\s*(\d{1,3})", t)
    if m:
        age = int(m.group(1))
        return age if 0 < age <= 120 else None
    m = re.search(r"(\d{1,3})\s*(?:વર્ષ|years)", text or "")
    if m:
        age = int(m.group(1))
        return age if 0 < age <= 120 else None
    m = re.search(r"ઉંમર\s*(\d{1,3})", text or "")
    if m:
        age = int(m.group(1))
        return age if 0 < age <= 120 else None
    return None


def _parse_gender(text: str) -> str | None:
    t = _norm(text)
    if re.search(r"\b(female|woman|girl|widow|ladies)\b", t) or re.search(r"સ્ત્રી|મહિલા|વિધવા", text or ""):
        return "F"
    if re.search(r"\b(male|man|boy)\b", t) or re.search(r"પુરુષ|પુરુશ", text or ""):
        return "M"
    return None


def _parse_marital(text: str) -> str | None:
    t = _norm(text)
    if re.search(r"\bwidow", t) or "વિધવા" in (text or ""):
        return "WIDOWED"
    if "married" in t or "વિવાહિત" in (text or ""):
        return "MARRIED"
    if "single" in t or "અવિવાહિત" in (text or ""):
        return "SINGLE"
    if "divorced" in t or "છૂટાછેડા" in (text or ""):
        return "DIVORCED"
    return None


def _parse_employment(text: str) -> str | None:
    t = _norm(text)
    if re.search(r"\b(farmer|kisan|agricultur)", t) or re.search(r"ખેડૂત|કૃષિ", text or ""):
        return "FARMER"
    if "student" in t or "વિદ્યાર્થી" in (text or ""):
        return "STUDENT"
    if "self employed" in t or "self-employed" in t:
        return "SELF_EMPLOYED"
    if re.search(r"\bemployed\b", t):
        return "EMPLOYED"
    if "unemployed" in t:
        return "UNEMPLOYED"
    return None


def _parse_caste(text: str) -> str | None:
    t = _norm(text).upper()
    for c in CASTES:
        if re.search(rf"\b{c}\b", t):
            return c
    if "OBC" in t.replace(".", ""):
        return "OBC"
    return None


# Spoken / transcribed forms of each district: common English spellings, historic names, and the
# Gujarati and Devanagari spellings (Whisper often writes Gujarati speech in Devanagari).
DISTRICT_ALIASES: dict[str, list[str]] = {
    "Ahmedabad": ["ahmadabad", "ahemdabad", "ahmedbad", "amdavad", "અમદાવાદ", "अहमदाबाद"],
    "Surat": ["suret", "સુરત", "सूरत"],
    "Vadodara": ["baroda", "vadodra", "vododara", "વડોદરા", "वडोदरा"],
    "Rajkot": ["રાજકોટ", "राजकोट"],
    "Gandhinagar": ["gandhi nagar", "gandhinager", "ગાંધીનગર", "गांधीनगर"],
    "Bhavnagar": ["bhavnager", "ભાવનગર", "भावनगर"],
    "Jamnagar": ["jamnager", "જામનગર", "जामनगर"],
    "Junagadh": ["junagarh", "junagad", "જૂનાગઢ", "જુનાગઢ", "जूनागढ़", "जूनागढ"],
    "Kutch": ["kachchh", "kachh", "kuchch", "cutch", "કચ્છ", "कच्छ", "કચ્ષ", "कच्ष", "કચ્ક્ષ", "કજ્ષ", "कज्ष", "कज्श", "कज्स"],
    "Mehsana": ["mahesana", "mahesna", "મહેસાણા", "मेहसाणा", "महेसाणा"],
    "Anand": ["આણંદ", "आणंद", "आनंद"],
    "Bharuch": ["broach", "ભરૂચ", "भरूच", "भरूज", "ભરૂજ"],
    "Narmada": ["નર્મદા", "नर्मदा"],
    "Sabarkantha": ["sabar kantha", "sabarkanta", "સાબરકાંઠા", "साबरकांठा"],
    "Banaskantha": ["banas kantha", "banaskanta", "બનાસકાંઠા", "बनासकांठा"],
    "Patan": ["પાટણ", "पाटण"],
    "Surendranagar": ["surendra nagar", "surendranager", "સુરેન્દ્રનગર", "सुरेंद्रनगर"],
    "Morbi": ["morvi", "મોરબી", "मोरबी"],
    "Amreli": ["અમરેલી", "अमरेली"],
    "Botad": ["બોટાદ", "बोटाद"],
    "Porbandar": ["પોરબંદર", "पोरबंदर", "पूरबंदर", "પૂરબંદર"],
    "Navsari": ["નવસારી", "नवसारी"],
    "Valsad": ["વલસાડ", "वलसाड"],
    "Dang": ["dangs", "ડાંગ", "डांग"],
    "Tapi": ["તાપી", "तापी"],
    "Mahisagar": ["mahi sagar", "મહીસાગર", "महीसागर"],
    "Chhota Udaipur": ["chota udaipur", "chhotaudepur", "chota udepur", "chhota udepur", "છોટા ઉદેપુર", "છોટાઉદેપુર", "छोटा उदयपुर", "छोटाउदेपुर"],
    "Aravalli": ["arvalli", "aravali", "અરવલ્લી", "अरवल्ली"],
    "Dahod": ["dohad", "દાહોદ", "दाहोद"],
    "Panchmahal": ["panch mahal", "panchmahals", "પંચમહાલ", "पंचमहाल", "पंजमहाल", "પંજમહાલ"],
    "Kheda": ["kaira", "ખેડા", "खेड़ा", "खेडा"],
    "Gir Somnath": ["gir-somnath", "gir somnath", "somnath", "ગીર સોમનાથ", "गिर सोमनाथ"],
}


def _is_latin(s: str) -> bool:
    return all(ord(ch) < 0x0900 for ch in s)


def _district_matchers() -> list[tuple[str, re.Pattern[str] | str]]:
    """(district, matcher) pairs: Latin forms match on word boundaries, native script on substring."""
    out: list[tuple[str, re.Pattern[str] | str]] = []
    for d in DISTRICTS:
        names = [d.lower(), *DISTRICT_ALIASES.get(d, [])]
        for name in names:
            if _is_latin(name):
                out.append((d, re.compile(r"(?<![a-z])" + re.escape(name.lower()) + r"(?![a-z])")))
            else:
                out.append((d, name))
    # longest names first so "Gir Somnath" wins over a shorter overlapping name
    out.sort(key=lambda m: len(m[1].pattern if isinstance(m[1], re.Pattern) else m[1]), reverse=True)
    return out


_DISTRICT_MATCHERS = _district_matchers()


def _squash(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def _fuzzy_district(latin_text: str) -> str | None:
    """Tolerate a slightly wrong spelling (Ahmdabad, Vadodra) without matching ordinary words."""
    import difflib

    tokens = re.findall(r"[a-z]+", latin_text.lower())
    # Only long names are safe to match loosely; short ones (Anand, Patan, Tapi) need an exact or alias hit.
    targets = {_squash(d): d for d in DISTRICTS if len(_squash(d)) >= 7}
    best: tuple[float, str] | None = None
    for size in (1, 2):
        for i in range(len(tokens) - size + 1):
            cand = "".join(tokens[i:i + size])
            if len(cand) < 5:
                continue
            for key, district in targets.items():
                if key[0] != cand[0] or abs(len(key) - len(cand)) > 3:
                    continue
                ratio = difflib.SequenceMatcher(None, cand, key).ratio()
                if ratio >= 0.86 and (best is None or ratio > best[0]):
                    best = (ratio, district)
    return best[1] if best else None


def _parse_district(text: str) -> str | None:
    raw = text or ""
    lowered = _norm(raw)
    for district, matcher in _DISTRICT_MATCHERS:
        if isinstance(matcher, re.Pattern):
            if matcher.search(lowered):
                return district
        elif matcher in raw:
            return district
    m = re.search(r"from\s+([A-Za-z\s]+?)(?:,|\.|$| income| with)", lowered)
    if m:
        guess = m.group(1).strip().title()
        for d in DISTRICTS:
            if d.lower() == guess.lower():
                return d
    return _fuzzy_district(lowered)


_GU_DISTRICT_INDEX = build_district_index(DISTRICT_ALIASES)


def _has_indic_script(text: str) -> bool:
    return any(0x0900 <= ord(ch) <= 0x0AFF for ch in text or "")


def extract_rules(transcript: str) -> dict[str, Any]:
    slots = _extract_rules_basic(transcript)
    if _has_indic_script(transcript):
        # Gujarati speech arrives in Gujarati script, Devanagari or a mix; the script-tolerant parser wins
        gu = extract_gujarati_slots(transcript)
        district = find_district(transcript, _GU_DISTRICT_INDEX)
        if district:
            gu["district"] = district
        slots.update(gu)
    return slots


def _extract_rules_basic(transcript: str) -> dict[str, Any]:
    slots: dict[str, Any] = {}
    age = _parse_age(transcript)
    if age:
        slots["age"] = age
    g = _parse_gender(transcript)
    if g:
        slots["gender"] = g
    if "widow" in _norm(transcript) or "વિધવા" in transcript:
        slots["gender"] = "F"
    m = _parse_marital(transcript)
    if m:
        slots["maritalStatus"] = m
    c = _parse_caste(transcript)
    if c:
        slots["casteCategory"] = c
    d = _parse_district(transcript)
    if d:
        slots["district"] = d
    inc = _parse_income(transcript)
    if inc:
        slots["annualIncome"] = inc
    e = _parse_employment(transcript)
    if e:
        slots["employmentStatus"] = e
    return slots


def validate_slots(slots: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    if slots.get("age") is not None:
        age = int(slots["age"])
        if 0 < age <= 120:
            clean["age"] = age
    if slots.get("gender") in GENDERS:
        clean["gender"] = slots["gender"]
    if slots.get("casteCategory") in CASTES:
        clean["casteCategory"] = slots["casteCategory"]
    if slots.get("district") in DISTRICTS:
        clean["district"] = slots["district"]
    if slots.get("maritalStatus") in MARITAL:
        clean["maritalStatus"] = slots["maritalStatus"]
    if slots.get("employmentStatus") in EMPLOYMENT:
        clean["employmentStatus"] = slots["employmentStatus"]
    if slots.get("educationLevel") in EDUCATION:
        clean["educationLevel"] = slots["educationLevel"]
    if slots.get("annualIncome") is not None:
        inc = int(slots["annualIncome"])
        if 0 < inc < 100_000_000:
            clean["annualIncome"] = inc
    if slots.get("village") and isinstance(slots["village"], str):
        v = slots["village"].strip()[:80]
        if v:
            clean["village"] = v
    return clean


async def extract_profile(transcript: str, language: str, prior: dict | None) -> dict[str, Any]:
    if contains_sensitive_id(transcript):
        return {
            "slots": validate_slots(merge_slots(prior, {})),
            "missing": missing_required(merge_slots(prior, {})),
            "confidence": 0.0,
            "blocked": True,
        }
    rule_slots = extract_rules(transcript)
    merged = validate_slots(merge_slots(prior, rule_slots))
    missing = missing_required(merged)
    confidence = 0.85 if len(merged) >= 3 else 0.6

    if missing and language in ("en", "gu"):
        try:
            from app.llm import ollama_generate

            prompt = f"""Extract eligibility profile fields from this {language} speech. Return ONLY JSON with keys you find:
age (int), gender (F or M), casteCategory (SC|ST|OBC|NT|GENERAL|EWS), district (from Gujarat list), maritalStatus, employmentStatus, annualIncome (int rupees).
Do not invent. Use null for unknown.

Speech: {transcript[:800]}

JSON:"""
            raw = await ollama_generate(prompt, max_tokens=256, timeout=8.0, retries=1)
            m = re.search(r"\{[\s\S]*\}", raw)
            if m:
                llm = json.loads(m.group(0))
                merged = validate_slots(merge_slots(merged, llm))
                missing = missing_required(merged)
                confidence = min(0.95, confidence + 0.1)
        except Exception:
            pass

    return {
        "slots": merged,
        "missing": missing,
        "confidence": confidence,
        "blocked": False,
    }
