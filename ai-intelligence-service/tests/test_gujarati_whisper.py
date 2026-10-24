"""Gujarati profile extraction against REAL Whisper-medium output.

Ids g*/h*/k* were used to tune the parser; ids u* are an unseen batch (heard through the host worker) added
afterwards, scoring 59/87 slots before the parser fixes and 83/87 after. Ids f* are a second batch that was
held out (102/113 slots before its parser fixes, 108/113 after).

tests/fixtures/gujarati_whisper_medium.json holds sentences spoken by a synthetic Gujarati voice (gTTS),
what faster-whisper `medium` transcribed (beam 5, temperature 0; mostly Devanagari with Hindi-style
spellings and odd word splits) and the profile the speaker meant. The parser must recover it.
"""
import json
from pathlib import Path

import pytest

from app.gujarati_text import skeleton, to_gujarati_script
from app.profile_extract import extract_rules

CASES = json.loads((Path(__file__).parent / "fixtures" / "gujarati_whisper_medium.json").read_text(encoding="utf-8"))

# Whisper itself got these wrong, so no parser can recover the value; the slot must come out wrong or empty,
# never as a different confident value for the OTHER fields.
WHISPER_LIMITED = {
    "h4": "Whisper wrote 'ઓગણત્રીસ' (29) as the digits 30",
    "h6": "Whisper garbled 'સડસઠ' (67) into 'संसत'",
    "k11": "Whisper wrote 'ચુમોતેર' (74) as 'चुमो 13' and 'એંસી હજાર' (80 thousand) as '1000'",
    "u2": "Whisper wrote 'ઓગણચાલીસ' (39) as the digits 40",
    "u5": "Whisper wrote 'એક લાખ પાંચ હજાર' (1.05 lakh) as '1,5,000,000'",
    "u17": "Whisper wrote 'તેત્રીસ' (33) as 'ते 30' and 'જનજાતિ' as 'जंजाती', which sounds like plain 'jati' (SC)",
    "f1": "Whisper wrote 'ઓગણત્રીસ' (29) as 'ओगन 30' and dropped 'હજાર' after 'ચાલીસ' (income left empty)",
    "f9": "Whisper wrote 'બત્રીસ' (32) as the digits 30",
    "f10": "Whisper heard 'પાંત્રીસ હજાર' (35,000) as '25,000'",
    "f14": "Whisper's 'साडत्री' sounds like both 37 and 38",
}


@pytest.mark.parametrize("case", [c for c in CASES if c["id"] not in WHISPER_LIMITED], ids=lambda c: c["id"])
def test_recovers_every_detail_from_what_whisper_heard(case):
    got = extract_rules(case["heard"])
    wrong = {k: (v, got.get(k)) for k, v in case["expected"].items() if got.get(k) != v}
    assert not wrong, f"heard: {case['heard']}\n(expected, got): {wrong}"


@pytest.mark.parametrize("case", [c for c in CASES if c["id"] in WHISPER_LIMITED], ids=lambda c: c["id"])
def test_whisper_limited_cases_still_recover_the_rest(case):
    got = extract_rules(case["heard"])
    # every field Whisper did not corrupt is still right
    corrupted = {
        "h4": {"age"}, "h6": {"age"}, "k11": {"age", "annualIncome"},
        "u2": {"age"}, "u5": {"annualIncome"}, "u17": {"age", "casteCategory"},
        "f1": {"age", "annualIncome"}, "f9": {"age"}, "f10": {"annualIncome"}, "f14": {"age"},
    }[case["id"]]
    wrong = {k: (v, got.get(k)) for k, v in case["expected"].items() if k not in corrupted and got.get(k) != v}
    assert not wrong, f"{WHISPER_LIMITED[case['id']]}: {wrong}"


def test_overall_slot_accuracy_stays_high():
    total = right = 0
    for case in CASES:
        got = extract_rules(case["heard"])
        for key, value in case["expected"].items():
            total += 1
            right += got.get(key) == value
    assert right / total >= 0.95, f"{right}/{total}"


def test_scripts_normalise_to_the_same_sound():
    # one word, three spellings: Gujarati script, Gujarati with a different consonant, Devanagari
    assert skeleton("છત્રીસ") == skeleton("चत्रीस") == skeleton("ચત્રીસ")
    assert skeleton("વિધવા") == skeleton("विद्वा")
    assert skeleton("ઉંમર") == skeleton("उम्मर")


def test_devanagari_converts_to_gujarati_script_and_digits():
    assert to_gujarati_script("अमदावाद") == "અમદાવાદ"
    assert to_gujarati_script("४८ ४०,०००") == "48 40,000"


@pytest.mark.parametrize("text", [
    "नमस्ते, आप कैसे हैं? मुझे आज बाजार जाना है और सब्जी खरीदनी है।",     # ordinary Hindi: 'bazaar' is not 'thousand'
    "બાજારમાં હજાર લોકો છે",
    "આજે હવામાન સારું છે અને હું બજારમાં જાઉં છું",
])
def test_ordinary_sentences_do_not_invent_a_profile(text):
    assert extract_rules(text) == {}


def test_gujarati_numbers_with_two_readings_prefer_the_adult_age():
    # સાત (7) and સાઠ (60) sound alike once the retroflex is lost; an applicant aged 7 is not plausible
    got = extract_rules("मारी उम्मर साथ वर्श छे")
    assert got.get("age") == 60


def test_income_grammar_lakh_thousand_and_half():
    assert extract_rules("आवक एक लाख वीस हजार रूपिया")["annualIncome"] == 120_000
    assert extract_rules("आवक बे लाख रूपिया")["annualIncome"] == 200_000
    assert extract_rules("आवक दोढ लाख रूपिया")["annualIncome"] == 150_000
    assert extract_rules("आवक पचास हजार")["annualIncome"] == 50_000
    assert extract_rules("आवक 30,000 रूपिया")["annualIncome"] == 30_000
