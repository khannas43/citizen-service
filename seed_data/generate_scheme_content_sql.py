#!/usr/bin/env python3
"""Generate seed_data/seed_scheme_content.sql — DEMO scheme page content (content_source = DEMO_SEED).

Fails loudly if any active scheme in the database lacks generated content.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "seed_scheme_content.sql"

WIDOW = "a1000001-0000-0000-0000-000000000004"
PM_KISAN = "b1000001-0000-0000-0000-000000000008"
KISAN_SURAKSHA = "b1000001-0000-0000-0000-000000000009"
CROP_LOAN = "b1000001-0000-0000-0000-000000000010"
PMAY_GRAMIN = "b1000001-0000-0000-0000-000000000013"

FARMER_IDS = {PM_KISAN, KISAN_SURAKSHA, CROP_LOAN, PMAY_GRAMIN}

STANDARD_STEPS = [
    ("Check eligibility", "પાત્રતા તપાસો", "Use the eligibility check with your age, income and other details.", "ઉંમર, આવક અને અન્ય વિગતો સાથે પાત્રતા તપાસનો ઉપયોગ કરો."),
    ("Gather documents", "દસ્તાવેજો ભેગા કરો", "Collect the documents listed for this scheme.", "આ યોજના માટે સૂચિબદ્ધ દસ્તાવેજો ભેગા કરો."),
    ("Apply online or at Jan Seva Kendra", "ઑનલાઇન અથવા JSK પર અરજી", "Submit through Digital Gujarat or visit the nearest Jan Seva Kendra.", "Digital Gujarat દ્વારા અથવા નજીકના JSK પર અરજી કરો."),
    ("Track application", "અરજી ટ્રેક કરો", "Track status in My Applications after login.", "લૉગિન પછી મારી અરજીઓમાં સ્થિતિ જુઓ."),
    ("Receive benefit", "લાભ મેળવો", "Benefit is credited or issued as per scheme rules after approval.", "મંજૂરી પછી યોજના નિયમો મુજબ લાભ મળે છે."),
]

FAQS = [
    ("Who can apply?", "કોણ અરજી કરી શકે?", "See the eligibility section on this page; criteria match the live eligibility engine.", "આ પૃષ્ઠ પાત્રતા વિભાગ જુઓ; માપદંડ લાઇવ પાત્રતા એન્જિન સાથે મેળ ખાય છે."),
    ("Is there a fee?", "શુલ્ક છે?", "Government scheme applications on Digital Gujarat do not charge a portal fee (department fees may apply separately).", "Digital Gujarat પર સરકારી યોજના અરજી માટે પોર્ટલ શુલ્ક નથી."),
    ("How long does approval take?", "મંજૂરીમાં કેટલો સમય?", "Processing time varies by department; track status online after applying.", "વિભાગ મુજબ સમય બદલાય; અરજી પછી ઑનલાઇન સ્થિતિ ટ્રેક કરો."),
]


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def fetch_active_schemes() -> list[dict]:
    query = (
        "SELECT id::text, name, name_gujarati, category, department, "
        "income_ceiling, eligible_castes, min_age, max_age, gender, district_scope, "
        "min_percentile, diploma_min_percentage, neet_mbbs_eligible "
        "FROM scheme_engine.scheme WHERE is_active = true ORDER BY name"
    )
    cmd = [
        "kubectl", "-n", "egov", "exec", "deploy/postgres", "--",
        "psql", "-U", "egovuser", "-d", "egov_db", "-t", "-A", "-F|", "-c", query,
    ]
    try:
        raw = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
    except subprocess.CalledProcessError as e:
        print(e.output, file=sys.stderr)
        raise SystemExit("Could not load schemes from Postgres (is kubectl/egov up?)")
    schemes = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) < 14:
            continue
        schemes.append({
            "id": parts[0].strip(),
            "name": parts[1],
            "name_gu": parts[2] or parts[1],
            "category": parts[3] or "",
            "department": parts[4] or "",
            "income_ceiling": parts[5] if parts[5] not in ("", "null") else None,
            "eligible_castes": parts[6] or "",
            "min_age": parts[7] if parts[7] not in ("", "null") else None,
            "max_age": parts[8] if parts[8] not in ("", "null") else None,
            "gender": parts[9] or "ANY",
            "district_scope": parts[10] or "",
            "min_percentile": parts[11] if parts[11] not in ("", "null") else None,
            "diploma_min_percentage": parts[12] if parts[12] not in ("", "null") else None,
            "neet_mbbs_eligible": parts[13].strip().lower() in ("t", "true", "1"),
        })
    if not schemes:
        raise SystemExit("No active schemes returned from database")
    return schemes


def documents_for(scheme: dict) -> list[dict]:
    docs = [
        {"title": "Aadhaar card", "titleGu": "આધાર કાર્ડ", "note": "Identity and address proof", "noteGu": "ઓળખ અને સરનામાનો પુરાવો"},
        {"title": "Bank account details", "titleGu": "બેંક ખાતા વિગતો", "note": "Passbook or cancelled cheque for benefit credit", "noteGu": "લાભ જમા માટે પાસબુક અથવા રદ્દ ચેક"},
    ]
    if scheme["income_ceiling"]:
        docs.append({"title": "Income certificate", "titleGu": "આવકનો દાખલો", "note": "Issued by competent authority", "noteGu": "સંબંધિત અધિકારી પાસેથી"})
    if scheme["eligible_castes"] and scheme["eligible_castes"].upper() != "NULL":
        docs.append({"title": "Caste certificate", "titleGu": "જાતિ પ્રમાણપત્ર", "note": "Valid caste certificate as per scheme rules", "noteGu": "યોજના નિયમો મુજબ માન્ય જાતિ પ્રમાણપત્ર"})
    if scheme["min_age"] or scheme["max_age"]:
        docs.append({"title": "Age proof", "titleGu": "ઉંમરનો પુરાવો", "note": "Birth certificate or school leaving certificate", "noteGu": "જન્મ પ્રમાણપત્ર અથવા LC"})
    if scheme["id"] == WIDOW or (scheme["gender"] == "FEMALE" and "widow" in scheme["name"].lower()):
        docs.append({"title": "Marital status proof", "titleGu": "વૈવાહિક સ્થિતિનો પુરાવો", "note": "Death certificate of spouse or legal proof of widowhood", "noteGu": "પતિનું મૃત્યુ પ્રમાણપત્ર અથવા કાનૂની પુરાવો"})
    if scheme["id"] in FARMER_IDS:
        docs.append({"title": "Land / cultivation proof", "titleGu": "જમીન / ખેતીનો પુરાવો", "note": "Land record or farmer registration as applicable", "noteGu": "લાગુ હોય તો 7/12 અથવા ખેડૂત નોંધણી"})
    cat = (scheme["category"] or "").upper()
    if cat == "EDUCATION" or scheme["min_percentile"] or scheme["diploma_min_percentage"] or scheme["neet_mbbs_eligible"]:
        docs.append({"title": "Education records", "titleGu": "શિક્ષણના દસ્તાવેજો", "note": "Mark sheets, admission proof and exam score card where applicable", "noteGu": "માર્કશીટ, પ્રવેશ પુરાવો અને પરીક્ષા સ્કોર કાર્ડ"})
    if scheme["district_scope"] and scheme["district_scope"].lower() not in ("gujarat", "state", "state-wide", ""):
        docs.append({"title": "Residence proof", "titleGu": "રહેઠાણનો પુરાવો", "note": f"Proof of residence in {scheme['district_scope']}", "noteGu": f"{scheme['district_scope']} માં રહેઠાણનો પુરાવો"})
    return docs[:20]


def steps_for(_scheme: dict) -> list[dict]:
    return [
        {"title": t, "titleGu": tg, "detail": d, "detailGu": dg}
        for t, tg, d, dg in STANDARD_STEPS
    ]


def faqs_for(scheme: dict) -> list[dict]:
    extra = {
        "title": f"What is {scheme['name']}?",
        "titleGu": f"{scheme['name_gu']} શું છે?",
        "detail": "See the overview on this page; amounts and rules are defined by the department.",
        "detailGu": "અવલોકન વિભાગમાં જુઓ; રકમ અને નિયમો વિભાગ દ્વારા નક્કી થાય છે.",
    }
    # FAQ uses question/answer keys
    out = [{"question": q, "questionGu": qg, "answer": a, "answerGu": ag} for q, qg, a, ag in FAQS]
    out.append({
        "question": extra["title"],
        "questionGu": extra["titleGu"],
        "answer": extra["detail"],
        "answerGu": extra["detailGu"],
    })
    return out[:20]


def main() -> None:
    schemes = fetch_active_schemes()
    lines = [
        "-- DEMO scheme page content — not official. content_source = DEMO_SEED",
        "SET search_path TO scheme_engine;",
        "DELETE FROM scheme_content WHERE content_source = 'DEMO_SEED';",
    ]
    for s in schemes:
        docs = json.dumps(documents_for(s), ensure_ascii=False)
        steps = json.dumps(steps_for(s), ensure_ascii=False)
        faqs = json.dumps(faqs_for(s), ensure_ascii=False)
        lines.append(
            f"INSERT INTO scheme_content (scheme_id, documents_required, application_steps, faqs, "
            f"helpline_label, helpline_number, official_url, last_reviewed_on, content_source, updated_by, updated_at, version) "
            f"VALUES ('{s['id']}', '{sql_escape(docs)}', '{sql_escape(steps)}', '{sql_escape(faqs)}', "
            f"NULL, NULL, NULL, CURRENT_DATE, 'DEMO_SEED', 'demo-seed', NOW(), 0) "
            f"ON CONFLICT (scheme_id) DO UPDATE SET "
            f"documents_required = EXCLUDED.documents_required, application_steps = EXCLUDED.application_steps, "
            f"faqs = EXCLUDED.faqs, last_reviewed_on = EXCLUDED.last_reviewed_on, content_source = EXCLUDED.content_source, "
            f"updated_at = NOW(), version = 0;"
        )
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(schemes)} schemes)")
    if len(schemes) < 1:
        raise SystemExit("No schemes written")


if __name__ == "__main__":
    main()
