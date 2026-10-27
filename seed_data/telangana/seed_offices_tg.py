#!/usr/bin/env python3
"""Telangana SAMPLE office directory -> scheme_engine.service_office / office_service_link / geo_centroid.

All rows are data_source = DEMO_SEED (the portal shows a "demo data" notice). Phones use an invalid local part,
e-mails use the reserved example domain, positions are APPROXIMATE (district centroid + deterministic spread),
not surveyed. Offices: per district a Collectorate, a Mee Seva centre and one office per department; per mandal
(all 621 from the LGD pack) a Tahsildar (MRO) office, a Mandal Parishad office and a Mee Seva centre; per village
that has registered families (optional --registry file) a village Mee Seva centre.

    kubectl exec -n citizen $PGPOD -- psql -U postgres -d citizen_db -At -F, \\
      -c "select distinct district, taluka, village from family_registry.family" > /tmp/tg_registry.csv
    python3 seed_data/telangana/seed_offices_tg.py --registry /tmp/tg_registry.csv > /tmp/tg_offices.sql
    # then load /tmp/tg_offices.sql with psql as the superuser, like the other TG seeds
"""
import argparse, csv, math, re, sys, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LGD = ROOT / "state-packs/TG/lgd"
NS = uuid.UUID("7e1c0a55-0000-4000-8000-0000000000b1")
DOMAIN = "demo.telangana.example"

# district (LGD name): telugu, HQ town, pincode, std, lat, lng   (approximate HQ positions)
D = {
 "Adilabad": ("ఆదిలాబాద్", "Adilabad", "504001", "08732", 19.664, 78.532),
 "Bhadradri Kothagudem": ("భద్రాద్రి కొత్తగూడెం", "Kothagudem", "507101", "08744", 17.554, 80.619),
 "Hanumakonda": ("హనుమకొండ", "Hanamkonda", "506001", "0870", 18.000, 79.558),
 "Hyderabad": ("హైదరాబాద్", "Hyderabad", "500001", "040", 17.385, 78.487),
 "Jagitial": ("జగిత్యాల", "Jagitial", "505327", "08724", 18.795, 78.915),
 "Jangoan": ("జనగామ", "Jangaon", "506167", "08716", 17.724, 79.152),
 "Jayashankar Bhupalapally": ("జయశంకర్ భూపాలపల్లి", "Bhupalpally", "506169", "08713", 18.433, 79.867),
 "Jogulamba Gadwal": ("జోగులాంబ గద్వాల", "Gadwal", "509125", "08546", 16.235, 77.805),
 "Kamareddy": ("కామారెడ్డి", "Kamareddy", "503111", "08468", 18.320, 78.343),
 "Karimnagar": ("కరీంనగర్", "Karimnagar", "505001", "0878", 18.439, 79.129),
 "Khammam": ("ఖమ్మం", "Khammam", "507001", "08742", 17.247, 80.151),
 "Kumuram Bheem Asifabad": ("కుమురం భీం ఆసిఫాబాద్", "Asifabad", "504293", "08733", 19.358, 79.285),
 "Mahabubabad": ("మహబూబాబాద్", "Mahabubabad", "506101", "08719", 17.598, 80.002),
 "Mahabubnagar": ("మహబూబ్‌నగర్", "Mahabubnagar", "509001", "08542", 16.737, 77.987),
 "Mancherial": ("మంచిర్యాల", "Mancherial", "504208", "08736", 18.870, 79.443),
 "Medak": ("మెదక్", "Medak", "502110", "08452", 18.046, 78.263),
 "Medchal Malkajgiri": ("మేడ్చల్ మల్కాజిగిరి", "Medchal", "501401", "040", 17.629, 78.481),
 "Mulugu": ("ములుగు", "Mulugu", "506343", "08715", 18.192, 79.940),
 "Nagarkurnool": ("నాగర్‌కర్నూల్", "Nagarkurnool", "509209", "08540", 16.482, 78.326),
 "Nalgonda": ("నల్గొండ", "Nalgonda", "508001", "08682", 17.057, 79.267),
 "Narayanpet": ("నారాయణపేట", "Narayanpet", "509210", "08506", 16.745, 77.496),
 "Nirmal": ("నిర్మల్", "Nirmal", "504106", "08734", 19.096, 78.346),
 "Nizamabad": ("నిజామాబాద్", "Nizamabad", "503001", "08462", 18.672, 78.094),
 "Peddapalli": ("పెద్దపల్లి", "Peddapalli", "505172", "08728", 18.615, 79.372),
 "Rajanna Sircilla": ("రాజన్న సిరిసిల్ల", "Sircilla", "505301", "08723", 18.387, 78.832),
 "Ranga Reddy": ("రంగారెడ్డి", "Shamshabad", "501218", "040", 17.261, 78.381),
 "Sangareddy": ("సంగారెడ్డి", "Sangareddy", "502001", "08455", 17.619, 78.087),
 "Siddipet": ("సిద్దిపేట", "Siddipet", "502103", "08457", 18.101, 78.852),
 "Suryapet": ("సూర్యాపేట", "Suryapet", "508213", "08684", 17.140, 79.623),
 "Vikarabad": ("వికారాబాద్", "Vikarabad", "501101", "08416", 17.338, 77.904),
 "Wanaparthy": ("వనపర్తి", "Wanaparthy", "509103", "08545", 16.362, 78.062),
 "Warangal": ("వరంగల్", "Warangal", "506002", "0870", 17.968, 79.594),
 "Yadadri Bhuvanagiri": ("యాదాద్రి భువనగిరి", "Bhongir", "508116", "08685", 17.511, 78.886),
}
# department -> telugu (departments used by the TG demo schemes)
DEPTS = {
 "Rural Development (SERP)": "గ్రామీణాభివృద్ధి (సెర్ప్)", "Rural Development": "గ్రామీణాభివృద్ధి", "Agriculture": "వ్యవసాయం",
 "Social Welfare": "సాంఘిక సంక్షేమం", "Minorities Welfare": "మైనారిటీల సంక్షేమం", "Health": "ఆరోగ్యం",
 "Women and Child Welfare": "మహిళా శిశు సంక్షేమం", "Housing": "గృహనిర్మాణం", "Energy": "ఇంధనం", "Industries": "పరిశ్రమలు",
 "Education": "విద్య", "BC Welfare": "బీసీ సంక్షేమం", "Transport": "రవాణా", "Animal Husbandry": "పశుసంవర్ధకం",
}
MRO_DEPTS = ["Social Welfare", "BC Welfare", "Minorities Welfare", "Housing", "Agriculture", "Rural Development (SERP)"]
MPDO_DEPTS = ["Rural Development", "Rural Development (SERP)", "Women and Child Welfare", "Health", "Education", "Agriculture",
              "Animal Husbandry", "Housing"]
HOURS = {
 "DISTRICT_COLLECTORATE": ("Mon–Fri 10:30–17:00", "Saturday, Sunday"),
 "JAN_SEVA_KENDRA": ("Mon–Sat 09:00–17:00", "Sunday"),   # shown to the user as "Mee Seva Centre"
 "MAMLATDAR": ("Mon–Fri 10:30–17:00", "Saturday, Sunday"),   # "Tahsildar (MRO)"
 "TALUKA_PANCHAYAT": ("Mon–Fri 10:30–17:00", "Saturday, Sunday"),   # "Mandal Parishad"
 "DEPARTMENT_OFFICE": ("Mon–Fri 10:30–17:00", "Saturday, Sunday"),
}

ap = argparse.ArgumentParser()
ap.add_argument("--registry", help="csv: district,mandal,village of families (adds village Mee Seva centres)")
a = ap.parse_args()


def q(s):
    return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"


def slug(s):
    return re.sub(r"[^a-z0-9]+", ".", s.lower()).strip(".")


def rd(path):
    return list(csv.DictReader(open(path, encoding="utf-8-sig")))


dist_rows = {r["District Name(In English)"]: r for r in rd(LGD / "districts.csv")}
mandals = {}
for r in rd(LGD / "subdistricts.csv"):
    mandals.setdefault(r["District Name"], []).append(r["Sub-district Name"])
for d in D:
    if d not in dist_rows or d not in mandals:
        sys.exit(f"district {d} not in LGD pack")
village_local = {}
if a.registry:
    for r in rd(LGD / "villages.csv"):
        village_local[(r["District Name (In English)"], r["Sub-District Name (In English)"], r["Village Name (In English)"])] = r["Village Name (In Local)"]

offices, rows, links, used = [], [], [], set()
seq = {"n": 0}


def email(local, dist):
    e = f"{local}@{DOMAIN}"
    n = 1
    while e in used:
        n += 1
        e = f"{local}.{slug(dist)}{n}@{DOMAIN}"
    used.add(e)
    return e


def add(key, name, name_local, otype, dept, address, dist, mandal, village, pin, lat, lng, std, local_part):
    seq["n"] += 1
    oid = uuid.uuid5(NS, key)
    hrs, off = HOURS[otype]
    phone = f"{std}-0000 {seq['n']:04d}"
    rows.append(f"({q(oid)}, {q(name)}, {q(name_local)}, {q(otype)}, {q(dept)}, {q(address)}, {q(dist)}, {q(mandal)}, {q(village)}, {q(pin)}, "
                f"{lat:.6f}, {lng:.6f}, {q(phone)}, {q(email(local_part, dist))}, {q(hrs)}, {q(off)}, true, 'DEMO_SEED', CURRENT_DATE)")
    offices.append((oid, otype, dept))


lines = ["-- Telangana SAMPLE offices (DEMO_SEED). Generated by seed_data/telangana/seed_offices_tg.py",
         "SELECT set_config('app.state_code', 'TG', false);", "SET search_path TO scheme_engine;",
         "ALTER TABLE service_office ADD COLUMN IF NOT EXISTS name_local varchar(255);",
         "DELETE FROM office_service_link WHERE office_id IN (SELECT id FROM service_office WHERE data_source = 'DEMO_SEED');",
         "DELETE FROM service_office WHERE data_source = 'DEMO_SEED';"]

for dist, (te, town, pin, std, lat, lng) in D.items():
    lines.append(f"INSERT INTO geo_centroid (district, latitude, longitude, approximate) VALUES ({q(dist)}, {lat}, {lng}, true) "
                 "ON CONFLICT (district) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude;")
    b = slug(dist)
    add(f"coll:{dist}", f"{dist} Collectorate", f"{te} కలెక్టరేట్", "DISTRICT_COLLECTORATE", "General Administration",
        f"Collectorate, {town} – {pin} (sample address)", dist, town, None, pin, lat + 0.010, lng + 0.010, std, f"collector.{b}")
    add(f"msc:{dist}", f"{dist} District Mee Seva Centre", f"{te} జిల్లా మీ సేవ కేంద్రం", "JAN_SEVA_KENDRA", None,
        f"Mee Seva Centre, {town} – {pin} (sample address)", dist, town, None, pin, lat - 0.006, lng - 0.008, std, f"meeseva.{b}")
    for i, (dept, dte) in enumerate(DEPTS.items()):
        ang = 2 * math.pi * i / len(DEPTS)
        add(f"dept:{dist}:{dept}", f"{dept} Office – {dist}", f"{dte} కార్యాలయం – {te}", "DEPARTMENT_OFFICE", dept,
            f"{dept} District Office, {town} – {pin} (sample address)", dist, town, None, pin,
            lat + 0.02 * math.sin(ang), lng + 0.02 * math.cos(ang), std, f"{slug(dept)}.{b}")
    ms = sorted(mandals[dist])
    for i, m in enumerate(ms):
        ang = 2.399963 * (i + 1)                       # golden-angle spiral keeps mandals apart
        rad = 0.045 * math.sqrt(i + 1)
        mlat, mlng = lat + rad * math.sin(ang), lng + rad * math.cos(ang)
        add(f"mro:{dist}:{m}", f"{m} Tahsildar (MRO) Office", None, "MAMLATDAR", None,
            f"Mandal Revenue Office, {m}, {dist} – {pin} (sample address)", dist, m, None, pin, mlat + 0.003, mlng - 0.004, std, f"mro.{slug(m)}")
        add(f"mpdo:{dist}:{m}", f"{m} Mandal Parishad Office", None, "TALUKA_PANCHAYAT", None,
            f"Mandal Parishad Development Office, {m}, {dist} – {pin} (sample address)", dist, m, None, pin, mlat + 0.006, mlng + 0.003, std, f"mpdo.{slug(m)}")
        add(f"msm:{dist}:{m}", f"{m} Mandal Mee Seva Centre", None, "JAN_SEVA_KENDRA", None,
            f"Mee Seva Centre, {m}, {dist} – {pin} (sample address)", dist, m, None, pin, mlat - 0.003, mlng + 0.005, std, f"meeseva.{slug(m)}")

if a.registry:
    pos = {}
    for r in rd(LGD / "subdistricts.csv"):
        pass
    for rec in csv.reader(open(a.registry, encoding="utf-8")):
        if len(rec) < 3:
            continue
        dist, m, v = rec[0], rec[1], rec[2]
        if dist not in D:
            continue
        _, town, pin, std, lat, lng = D[dist]
        ms = sorted(mandals[dist])
        i = ms.index(m) if m in ms else 0
        rad = 0.045 * math.sqrt(i + 1)
        mlat, mlng = lat + rad * math.sin(2.399963 * (i + 1)), lng + rad * math.cos(2.399963 * (i + 1))
        h = int(uuid.uuid5(NS, f"pos:{dist}:{m}:{v}").hex[:8], 16)
        vlat, vlng = mlat + 0.03 * math.sin(h % 628 / 100), mlng + 0.03 * math.cos(h % 628 / 100)
        loc = village_local.get((dist, m, v))
        add(f"vms:{dist}:{m}:{v}", f"{v} Village Mee Seva Centre", f"{loc} మీ సేవ కేంద్రం" if loc else None, "JAN_SEVA_KENDRA", None,
            f"Gram Panchayat Office, {v}, Mandal {m}, {dist} – {pin} (sample address)", dist, m, v, pin, vlat, vlng, std, f"meeseva.{slug(v)}.{slug(m)}")

COLS = ("(id, name, name_local, office_type, department, address, district, taluka, village, pincode, latitude, longitude, "
        "phone, email, working_hours, weekly_off, is_active, data_source, last_verified_on)")
for i in range(0, len(rows), 250):
    lines.append(f"INSERT INTO service_office {COLS} VALUES\n" + ",\n".join(rows[i:i + 250]) + ";")

ALL = list(DEPTS)
lrows = []
for oid, otype, dept in offices:
    if otype in ("DISTRICT_COLLECTORATE", "JAN_SEVA_KENDRA"):
        ds = ALL
    elif otype == "MAMLATDAR":
        ds = MRO_DEPTS
    elif otype == "TALUKA_PANCHAYAT":
        ds = MPDO_DEPTS
    else:
        ds = [dept] if dept else []
    for d in ds:
        lrows.append(f"({q(uuid.uuid5(NS, f'link:{oid}:{d}'))}, {q(oid)}, {q('DEPARTMENT:' + d)})")
for i in range(0, len(lrows), 500):
    lines.append("INSERT INTO office_service_link (id, office_id, service_key) VALUES\n" + ",\n".join(lrows[i:i + 500]) + "\nON CONFLICT DO NOTHING;")

sys.stdout.write("\n".join(lines) + "\n")
by = {}
for _, t, _ in offices:
    by[t] = by.get(t, 0) + 1
print(f"-- {len(offices)} offices {by}, {len(lrows)} links", file=sys.stderr)
