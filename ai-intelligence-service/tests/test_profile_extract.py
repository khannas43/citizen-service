import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.profile_extract import (
    extract_profile,
    extract_rules,
    merge_slots,
    missing_required,
    validate_slots,
)


def test_widow_ahmedabad_obc_income():
    text = "I am a 36 year old widow from Ahmedabad, OBC, family income 1.2 lakh"
    slots = validate_slots(extract_rules(text))
    assert slots["age"] == 36
    assert slots["gender"] == "F"
    assert slots["maritalStatus"] == "WIDOWED"
    assert slots["casteCategory"] == "OBC"
    assert slots["district"] == "Ahmedabad"
    assert slots["annualIncome"] == 120_000


def test_income_one_lakh_twenty_thousand():
    text = "income one lakh twenty thousand"
    slots = validate_slots(extract_rules(text))
    assert slots["annualIncome"] == 120_000


def test_gujarati_age_and_widow():
    text = "હું 40 વર્ષની વિધવા છું OBC અમદાવાદ"
    slots = validate_slots(extract_rules(text))
    assert slots.get("age") == 40
    assert slots.get("gender") == "F"
    assert slots.get("maritalStatus") == "WIDOWED"
    assert slots.get("casteCategory") == "OBC"
    assert slots.get("district") == "Ahmedabad"


def test_enum_rejects_invalid():
    raw = {"gender": "X", "casteCategory": "INVALID", "district": "Mumbai", "age": 200}
    clean = validate_slots(raw)
    assert "gender" not in clean
    assert "casteCategory" not in clean
    assert "district" not in clean
    assert "age" not in clean


def test_merge_prior_newer_overrides():
    prior = {"age": 30, "gender": "M", "district": "Surat"}
    new = {"age": 36, "gender": "F"}
    merged = merge_slots(prior, new)
    assert merged["age"] == 36
    assert merged["gender"] == "F"
    assert merged["district"] == "Surat"


def test_missing_required_order():
    assert missing_required({}) == ["ageOrDob", "gender", "casteCategory", "district"]
    assert missing_required({"age": 40}) == ["gender", "casteCategory", "district"]


@pytest.mark.asyncio
async def test_gemma_failure_returns_rules():
    text = "I am 36 years old widow Ahmedabad OBC"
    with patch("app.llm.ollama_generate", new_callable=AsyncMock, side_effect=RuntimeError("down")):
        out = await extract_profile(text, "en", None)
    assert out["slots"]["age"] == 36
    assert out["slots"]["district"] == "Ahmedabad"
    assert not out.get("blocked")


# ---- district recognition: spelling variants, native scripts and false positives ----
import pytest  # noqa: E402

from app.profile_extract import _parse_district  # noqa: E402


@pytest.mark.parametrize("text,expected", [
    ("I am from Ahmadabad", "Ahmedabad"),
    ("I live in Amdavad", "Ahmedabad"),
    ("from Baroda city", "Vadodara"),
    ("Kachchh district", "Kutch"),
    ("we are in Panch Mahals", "Panchmahal"),
    ("I live in Ahmdabad", "Ahmedabad"),          # slightly wrong spelling (fuzzy)
    ("Vadodra", "Vadodara"),
    ("Chhotaudepur", "Chhota Udaipur"),
    ("suret maravu shu", "Surat"),                # Whisper's Latin rendering of Gujarati
    ("અમદાવાદમાં રહું છું", "Ahmedabad"),
    ("હું જૂનાગઢ છું", "Junagadh"),
    ("મહેસાણા", "Mehsana"),
    ("ગીર સોમનાથ", "Gir Somnath"),
    ("मैं अहमदाबाद में रहता हूँ", "Ahmedabad"),   # Gujarati speech written in Devanagari
    ("वडोदरा", "Vadodara"),
    ("गिर सोमनाथ", "Gir Somnath"),
])
def test_district_variants(text, expected):
    assert _parse_district(text) == expected


@pytest.mark.parametrize("text", [
    "I am a patient with a pattern",
    "my name is Anandi and I like danger",       # must not fuzzy-match a person's name to Anand
    "this is a state of mind",
    "the tapestry is nice",
    "I want some sustenance",
])
def test_ordinary_words_are_not_districts(text):
    assert _parse_district(text) is None


def test_all_32_districts_have_a_gujarati_and_devanagari_name():
    from app.profile_extract import DISTRICTS, DISTRICT_ALIASES

    for d in DISTRICTS:
        aliases = DISTRICT_ALIASES.get(d, [])
        assert any("઀" <= ch <= "૿" for a in aliases for ch in a), f"{d}: no Gujarati-script name"
        assert any("ऀ" <= ch <= "ॿ" for a in aliases for ch in a), f"{d}: no Devanagari name"
