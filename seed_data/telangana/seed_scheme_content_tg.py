#!/usr/bin/env python3
"""Telangana DEMO scheme page content (overview, benefits, eligibility, documents, steps, FAQs) in English + Telugu.

Built from scheme_rules_tg.csv (same ids as seed_schemes_tg.py). content_source = DEMO_SEED; descriptions are demo text,
verify against the current G.O. before real use.

    python3 seed_data/telangana/seed_scheme_content_tg.py > /tmp/tg_content.sql
    (load with psql as the superuser, like the other TG seeds)
"""
import csv, json, sys, uuid
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from scheme_text_te import OVERVIEW_TE, BENEFIT_TE

ROOT = Path(__file__).resolve().parents[2]
NS = uuid.UUID("7e1c0a55-0000-4000-8000-0000000000a7")      # same namespace as seed_schemes_tg.py
rules = list(csv.DictReader(open(ROOT / "seed_data/telangana/scheme_rules_tg.csv", encoding="utf-8")))
names = {r["code"]: r["name_en"] for r in csv.DictReader(open(ROOT / "state-packs/TG/schemes.csv", encoding="utf-8"))}


def esc(s):
    return s.replace("'", "''")


def inr(v):
    n = int(v)
    s = str(n)
    if len(s) > 3:                       # Indian grouping
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return "₹" + s


SUFFIX = {"MONTHLY": ("per month", "నెలకు"), "ANNUAL": ("per year", "సంవత్సరానికి"), "ONE_TIME": ("one-time", "ఒకసారి")}
CASTE_TE = {"SC": "SC", "ST": "ST", "OBC": "BC", "NT": "NT", "GENERAL": "జనరల్"}


def benefit(r, key):
    bt, bv = r["benefit_type"], r["benefit_value"]
    if bt in SUFFIX:
        en, te = SUFFIX[bt]
        return f"{inr(bv)} {en}", f"{inr(bv)} {te}"
    return bv, BENEFIT_TE.get(key, bv)


def eligibility(r):
    en, te = [], []
    if r["min_age"] and r["max_age"]:
        en.append(f"age {r['min_age']}–{r['max_age']} years"); te.append(f"వయస్సు {r['min_age']}–{r['max_age']} సంవత్సరాలు")
    elif r["min_age"]:
        en.append(f"age {r['min_age']} years or above"); te.append(f"వయస్సు {r['min_age']} సంవత్సరాలు లేదా అంతకంటే ఎక్కువ")
    elif r["max_age"]:
        en.append(f"age up to {r['max_age']} years"); te.append(f"వయస్సు {r['max_age']} సంవత్సరాల వరకు")
    if r["income_ceiling"]:
        en.append(f"annual family income up to {inr(r['income_ceiling'])}"); te.append(f"కుటుంబ వార్షిక ఆదాయం {inr(r['income_ceiling'])} వరకు")
    if r["eligible_castes"]:
        cs = [c.strip() for c in r["eligible_castes"].split(",") if c.strip()]
        en.append("category: " + ", ".join("BC" if c == "OBC" else c for c in cs)); te.append("వర్గం: " + ", ".join(CASTE_TE.get(c, c) for c in cs))
    g = (r["gender"] or "ANY").upper()
    if g == "FEMALE":
        en.append("women applicants"); te.append("మహిళా దరఖాస్తుదారులు")
    elif g == "MALE":
        en.append("male applicants"); te.append("పురుష దరఖాస్తుదారులు")
    ec = r["extra_conditions"]
    if "occupation" in ec:
        en.append("occupation as stated for the scheme"); te.append("పథకానికి నిర్దేశించిన వృత్తి")
    if "education" in ec:
        en.append("graduate or above"); te.append("డిగ్రీ లేదా అంతకంటే ఎక్కువ విద్య")
    if not en:
        return "Open to families resident in Telangana.", "తెలంగాణలో నివసించే కుటుంబాలందరికీ."
    return "Eligibility: " + "; ".join(en) + ".", "అర్హత: " + "; ".join(te) + "."


def docs(r):
    d = [("Aadhaar card", "ఆధార్ కార్డు", "Identity and address proof", "గుర్తింపు మరియు చిరునామా రుజువు"),
         ("Ration (Food Security) card", "రేషన్ (ఆహార భద్రత) కార్డు", "Household proof", "కుటుంబ రుజువు"),
         ("Bank passbook", "బ్యాంక్ పాస్‌బుక్", "Account for benefit credit (first page)", "ప్రయోజనం జమ చేయడానికి ఖాతా (మొదటి పేజీ)")]
    if r["income_ceiling"]:
        d.append(("Income certificate", "ఆదాయ ధృవీకరణ పత్రం", "Issued by the Tahsildar (MRO) / Mee Seva", "తహసీల్దార్ (MRO) / మీ సేవ జారీ చేసినది"))
    if r["eligible_castes"]:
        d.append(("Caste certificate", "కుల ధృవీకరణ పత్రం", "Valid certificate for the claimed category", "క్లెయిమ్ చేసిన వర్గానికి చెల్లుబాటు అయ్యే పత్రం"))
    if r["min_age"] or r["max_age"]:
        d.append(("Age proof", "వయస్సు రుజువు", "Birth certificate, SSC memo or Aadhaar", "జనన ధృవీకరణ, SSC మెమో లేదా ఆధార్"))
    if "farmer" in r["extra_conditions"] or r["category"] == "AGRICULTURE":
        d.append(("Pattadar passbook / land record", "పట్టాదారు పాస్‌బుక్ / భూమి రికార్డు", "Land ownership or cultivation proof", "భూమి యాజమాన్యం లేదా సాగు రుజువు"))
    if r["category"] == "EDUCATION":
        d.append(("Education records", "విద్యా పత్రాలు", "Mark memos, admission or enrolment proof", "మార్కుల మెమోలు, ప్రవేశం లేదా నమోదు రుజువు"))
    if r["category"] == "HOUSING":
        d.append(("Residence / site proof", "నివాస / స్థల రుజువు", "House site or residence proof", "ఇంటి స్థలం లేదా నివాస రుజువు"))
    return [{"title": a, "titleLocal": b, "note": c, "noteLocal": e} for a, b, c, e in d]


STEPS = [
 ("Check eligibility", "అర్హతను తనిఖీ చేయండి", "Use the eligibility check with your age, income and other details.", "మీ వయస్సు, ఆదాయం మరియు ఇతర వివరాలతో అర్హత తనిఖీని ఉపయోగించండి."),
 ("Gather documents", "పత్రాలను సిద్ధం చేయండి", "Collect the documents listed for this scheme.", "ఈ పథకానికి జాబితా చేసిన పత్రాలను సేకరించండి."),
 ("Apply online or at a Mee Seva centre", "ఆన్‌లైన్‌లో లేదా మీ సేవ కేంద్రంలో దరఖాస్తు", "Submit on this portal or visit the nearest Mee Seva centre.", "ఈ పోర్టల్‌లో సమర్పించండి లేదా సమీప మీ సేవ కేంద్రాన్ని సందర్శించండి."),
 ("Track your application", "మీ దరఖాస్తును ట్రాక్ చేయండి", "Track the status in My Applications after login.", "లాగిన్ అయిన తర్వాత నా దరఖాస్తులలో స్థితిని ట్రాక్ చేయండి."),
 ("Receive the benefit", "ప్రయోజనం పొందండి", "The benefit is credited or issued as per scheme rules after approval.", "ఆమోదం తర్వాత పథక నిబంధనల ప్రకారం ప్రయోజనం జమ చేయబడుతుంది లేదా అందజేయబడుతుంది."),
]
FAQS = [
 ("Who can apply?", "ఎవరు దరఖాస్తు చేయవచ్చు?", "See the eligibility section on this page; it matches the live eligibility engine.", "ఈ పేజీలోని అర్హత విభాగాన్ని చూడండి; ఇది ప్రత్యక్ష అర్హత ఇంజిన్‌తో సరిపోతుంది."),
 ("Is there a fee?", "రుసుము ఉందా?", "No portal fee is charged for applying here; department or Mee Seva service charges may apply separately.", "ఇక్కడ దరఖాస్తుకు పోర్టల్ రుసుము లేదు; శాఖ లేదా మీ సేవ సేవా రుసుములు విడిగా వర్తించవచ్చు."),
 ("How long does approval take?", "ఆమోదానికి ఎంత సమయం పడుతుంది?", "Processing time varies by department; track the status online after applying.", "ప్రాసెసింగ్ సమయం శాఖను బట్టి మారుతుంది; దరఖాస్తు తర్వాత ఆన్‌లైన్‌లో స్థితిని ట్రాక్ చేయండి."),
]

out = ["-- Telangana DEMO scheme page content (DEMO_SEED). Generated by seed_scheme_content_tg.py",
       "SELECT set_config('app.state_code', 'TG', false);", "SET search_path TO scheme_engine;",
       "ALTER TABLE scheme_content ADD COLUMN IF NOT EXISTS overview_local text;",
       "ALTER TABLE scheme_content ADD COLUMN IF NOT EXISTS benefits_note_local text;",
       "ALTER TABLE scheme_content ADD COLUMN IF NOT EXISTS eligibility_note_local text;",
       "DELETE FROM scheme_content WHERE content_source = 'DEMO_SEED' AND scheme_id IN (SELECT id FROM scheme WHERE created_by = 'seed-tg-demo');"]
for r in rules:
    key = r["code"].removeprefix("TG-")
    sid = uuid.uuid5(NS, r["code"])
    nm = names[r["code"]].removeprefix("Telangana ").strip()
    ben_en, ben_te = benefit(r, key)
    el_en, el_te = eligibility(r)
    overview_en = r["description"] + "."
    faq = [{"question": q, "questionLocal": qt, "answer": a, "answerLocal": at} for q, qt, a, at in FAQS]
    faq.append({"question": f"What is the {nm}?", "questionLocal": f"{nm} అంటే ఏమిటి?",
                "answer": overview_en + " Amounts and rules are set by the department.", "answerLocal": OVERVIEW_TE[key] + " మొత్తాలు మరియు నిబంధనలను శాఖ నిర్ణయిస్తుంది."})
    steps = [{"title": t, "titleLocal": tt, "detail": d, "detailLocal": dt} for t, tt, d, dt in STEPS]
    out.append(
        "INSERT INTO scheme_content (scheme_id, overview, overview_local, benefits_note, benefits_note_local, eligibility_note, eligibility_note_local, "
        "documents_required, application_steps, faqs, helpline_label, helpline_number, official_url, last_reviewed_on, content_source, updated_by, updated_at, version) VALUES ("
        f"'{sid}', '{esc(overview_en)}', '{esc(OVERVIEW_TE[key])}', '{esc('Benefit: ' + ben_en)}', '{esc('ప్రయోజనం: ' + ben_te)}', '{esc(el_en)}', '{esc(el_te)}', "
        f"'{esc(json.dumps(docs(r), ensure_ascii=False))}', '{esc(json.dumps(steps, ensure_ascii=False))}', '{esc(json.dumps(faq, ensure_ascii=False))}', "
        "NULL, NULL, NULL, CURRENT_DATE, 'DEMO_SEED', 'demo-seed', NOW(), 0) "
        "ON CONFLICT (scheme_id) DO UPDATE SET overview = EXCLUDED.overview, overview_local = EXCLUDED.overview_local, benefits_note = EXCLUDED.benefits_note, "
        "benefits_note_local = EXCLUDED.benefits_note_local, eligibility_note = EXCLUDED.eligibility_note, eligibility_note_local = EXCLUDED.eligibility_note_local, "
        "documents_required = EXCLUDED.documents_required, application_steps = EXCLUDED.application_steps, faqs = EXCLUDED.faqs, "
        "last_reviewed_on = EXCLUDED.last_reviewed_on, content_source = EXCLUDED.content_source, updated_at = NOW(), version = 0;")
sys.stdout.write("\n".join(out) + "\n")
print(f"-- {len(rules)} scheme pages", file=sys.stderr)
