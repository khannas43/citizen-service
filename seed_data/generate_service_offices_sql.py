#!/usr/bin/env python3
"""Generate seed_data/seed_service_offices.sql: SAMPLE offices (data_source = DEMO_SEED).

Coverage rules (the script refuses to write the file if any of them fails):
  * every district has a collectorate, a Jan Seva Kendra and a Mamlatdar office
  * every village in the portal's village dropdown (family-registry geography, REGISTRY below) has at
    least one office of its own (a village Jan Seva Kendra)
  * every taluka (office talukas + registry talukas) has at least 2 offices
  * every e-mail address ends with @gujarat.gov.in and is unique

All contact details are SAMPLE data. Phone numbers use a local part starting with 0 (not a valid Indian
subscriber number) and addresses say "(sample address)". The gujarat.gov.in domain is real, so keep these
rows marked DEMO_SEED: the portal shows a "Demo data - not an official directory" notice while any are returned.
"""
import math
import re
import uuid
from pathlib import Path

NS = uuid.UUID("6f1d3a52-2b0e-4a67-9a4e-0d3c5b7e9f11")  # stable ids so re-runs do not churn rows
EMAIL_DOMAIN = "gujarat.gov.in"

# district, gujarati, hq taluka (town), pincode, std code, lat, lng  (HQ coordinates are approximate)
DISTRICTS = [
    ("Ahmedabad", "અમદાવાદ", "Ahmedabad City", "380001", "079", 23.0225, 72.5714),
    ("Surat", "સુરત", "Surat City", "395003", "0261", 21.1702, 72.8311),
    ("Vadodara", "વડોદરા", "Vadodara City", "390001", "0265", 22.3072, 73.1812),
    ("Rajkot", "રાજકોટ", "Rajkot", "360001", "0281", 22.3039, 70.8022),
    ("Gandhinagar", "ગાંધીનગર", "Gandhinagar", "382010", "079", 23.2156, 72.6369),
    ("Bhavnagar", "ભાવનગર", "Bhavnagar", "364001", "0278", 21.7645, 72.1519),
    ("Jamnagar", "જામનગર", "Jamnagar", "361001", "0288", 22.4707, 70.0577),
    ("Junagadh", "જૂનાગઢ", "Junagadh", "362001", "0285", 21.5222, 70.4579),
    ("Kutch", "કચ્છ", "Bhuj", "370001", "02832", 23.2420, 69.6669),
    ("Mehsana", "મહેસાણા", "Mehsana", "384001", "02762", 23.5880, 72.3693),
    ("Anand", "આણંદ", "Anand", "388001", "02692", 22.5645, 72.9289),
    ("Bharuch", "ભરૂચ", "Bharuch", "392001", "02642", 21.7051, 72.9959),
    ("Narmada", "નર્મદા", "Rajpipla", "393145", "02640", 21.8700, 73.5000),
    ("Sabarkantha", "સાબરકાંઠા", "Himmatnagar", "383001", "02772", 23.5970, 72.9690),
    ("Banaskantha", "બનાસકાંઠા", "Palanpur", "385001", "02742", 24.1725, 72.4380),
    ("Patan", "પાટણ", "Patan", "384265", "02766", 23.8493, 72.1266),
    ("Surendranagar", "સુરેન્દ્રનગર", "Surendranagar", "363001", "02752", 22.7270, 71.6480),
    ("Morbi", "મોરબી", "Morbi", "363641", "02822", 22.8173, 70.8378),
    ("Amreli", "અમરેલી", "Amreli", "365601", "02792", 21.5990, 71.2150),
    ("Botad", "બોટાદ", "Botad", "364710", "02849", 22.1690, 71.6670),
    ("Porbandar", "પોરબંદર", "Porbandar", "360575", "0286", 21.6417, 69.6293),
    ("Navsari", "નવસારી", "Navsari", "396445", "02637", 20.9467, 72.9520),
    ("Valsad", "વલસાડ", "Valsad", "396001", "02632", 20.5992, 72.9342),
    ("Dang", "ડાંગ", "Ahwa", "394710", "02631", 20.7570, 73.6870),
    ("Tapi", "તાપી", "Vyara", "394650", "02626", 21.1100, 73.3930),
    ("Mahisagar", "મહીસાગર", "Lunawada", "389230", "02674", 23.1280, 73.6100),
    ("Chhota Udaipur", "છોટા ઉદેપુર", "Chhota Udaipur", "391165", "02669", 22.3050, 74.0140),
    ("Aravalli", "અરવલ્લી", "Modasa", "383315", "02774", 23.4640, 73.2990),
    ("Dahod", "દાહોદ", "Dahod", "389151", "02673", 22.8350, 74.2540),
    ("Panchmahal", "પંચમહાલ", "Godhra", "389001", "02672", 22.7750, 73.6150),
    ("Kheda", "ખેડા", "Nadiad", "387001", "0268", 22.6930, 72.8610),
    ("Gir Somnath", "ગીર સોમનાથ", "Veraval", "362265", "02876", 20.9070, 70.3670),
]
DIST = {d[0]: d for d in DISTRICTS}

# Snapshot of the family-registry geography that feeds the portal's Taluka -> Village dropdowns
# (select district, taluka, string_agg(village) from family_registry.family). Regenerate if it changes.
REGISTRY = {
    ("Ahmedabad", "Dholka"): ["Bagodara", "Bavla", "Dhandhuka", "Dholka"],
    ("Ahmedabad", "Sanand"): ["Bol", "Chandrala", "Itola", "Sanand"],
    ("Ahmedabad", "Viramgam"): ["Charada", "Kanpur", "Viramgam"],
    ("Anand", "Anand"): ["Anand", "Khambhat", "Vallabh Vidyanagar"],
    ("Banaskantha", "Deesa"): ["Deesa", "Dhanera", "Palanpur"],
    ("Banaskantha", "Palanpur"): ["Kankrej", "Palanpur", "Radhanpur"],
    ("Junagadh", "Junagadh"): ["Junagadh", "Keshod", "Veraval"],
    ("Kutch", "Bhuj"): ["Anjar", "Bhuj", "Mandvi"],
    ("Kutch", "Gandhidham"): ["Adipur", "Gandhidham", "Mundra"],
    ("Mehsana", "Mehsana"): ["Mehsana", "Unjha", "Visnagar"],
    ("Patan", "Patan"): ["Harij", "Patan", "Sidhpur"],
    ("Rajkot", "Morbi"): ["Morbi", "Tankara", "Wankaner"],
    ("Rajkot", "Rajkot"): ["Gondal", "Jetpur", "Rajkot City"],
    ("Surat", "Choryasi"): ["Bhatha", "Sachin", "Utran"],
    ("Surat", "Katargam"): ["Katargam", "Kosad", "Sarthana"],
    ("Surat", "Olpad"): ["Hansot", "Limbachha", "Olpad"],
    ("Vadodara", "Dabhoi"): ["Bodeli", "Dabhoi", "Sinor"],
    ("Vadodara", "Waghodia"): ["Padra", "Savli", "Waghodia"],
}

# Approximate taluka headquarters (lat, lng) for registry talukas
TALUKA_HQ = {
    ("Ahmedabad", "Dholka"): (22.7260, 72.4420), ("Ahmedabad", "Sanand"): (22.9920, 72.3820),
    ("Ahmedabad", "Viramgam"): (23.1190, 72.0390), ("Anand", "Anand"): (22.5645, 72.9289),
    ("Banaskantha", "Deesa"): (24.2590, 72.1900), ("Banaskantha", "Palanpur"): (24.1725, 72.4380),
    ("Junagadh", "Junagadh"): (21.5222, 70.4579), ("Kutch", "Bhuj"): (23.2420, 69.6669),
    ("Kutch", "Gandhidham"): (23.0753, 70.1337), ("Mehsana", "Mehsana"): (23.5880, 72.3693),
    ("Patan", "Patan"): (23.8493, 72.1266), ("Rajkot", "Morbi"): (22.8173, 70.8378),
    ("Rajkot", "Rajkot"): (22.3039, 70.8022), ("Surat", "Choryasi"): (21.1620, 72.7900),
    ("Surat", "Katargam"): (21.2290, 72.8330), ("Surat", "Olpad"): (21.3380, 72.7530),
    ("Vadodara", "Dabhoi"): (22.1270, 73.4300), ("Vadodara", "Waghodia"): (22.3100, 73.3600),
}

# Approximate village / town positions; anything missing falls back to a deterministic offset from its taluka HQ
VILLAGE_POS = {
    "Bagodara": (22.4690, 72.2780), "Bavla": (22.8330, 72.3620), "Dhandhuka": (22.3790, 71.9810),
    "Bol": (22.9500, 72.3900), "Chandrala": (22.9700, 72.3000), "Itola": (22.9300, 72.4200),
    "Charada": (23.0500, 72.0500), "Kanpur": (23.1500, 72.1300),
    "Khambhat": (22.3084, 72.6200), "Vallabh Vidyanagar": (22.5560, 72.9250),
    "Dhanera": (24.5080, 72.0230), "Kankrej": (24.0200, 72.0000), "Radhanpur": (23.8300, 71.6000),
    "Keshod": (21.3070, 70.2500), "Veraval": (20.9070, 70.3670),
    "Anjar": (23.1130, 70.0270), "Mandvi": (22.8330, 69.3500),
    "Adipur": (23.0770, 70.0850), "Mundra": (22.8390, 69.7220),
    "Unjha": (23.8010, 72.3930), "Visnagar": (23.7010, 72.5460),
    "Harij": (23.6930, 71.9060), "Sidhpur": (23.9180, 72.3730),
    "Tankara": (22.6700, 70.7800), "Wankaner": (22.6160, 70.9460),
    "Gondal": (21.9610, 70.7950), "Jetpur": (21.7540, 70.6250),
    "Bhatha": (21.1000, 72.8300), "Sachin": (21.0830, 72.8750), "Utran": (21.2400, 72.8800),
    "Kosad": (21.2230, 72.8650), "Sarthana": (21.2300, 72.8990),
    "Hansot": (21.5870, 72.8110), "Limbachha": (21.3100, 72.7100),
    "Bodeli": (22.2570, 73.7220), "Sinor": (21.9060, 73.3150),
    "Padra": (22.2380, 73.0850), "Savli": (22.5700, 73.2100),
}

# 8 extra Jan Seva Kendras in the largest districts: district, gujarati place, place, pincode, lat, lng
EXTRA_JSK = [
    ("Ahmedabad", "બાવળા", "Bavla", "382220", 22.8330, 72.3620),
    ("Ahmedabad", "સાણંદ", "Sanand", "382110", 22.9920, 72.3820),
    ("Ahmedabad", "નરોડા", "Naroda", "382330", 23.0700, 72.6500),
    ("Surat", "ઓલપાડ", "Olpad", "394540", 21.3380, 72.7530),
    ("Surat", "બારડોલી", "Bardoli", "394601", 21.1200, 73.1120),
    ("Vadodara", "પાદરા", "Padra", "391440", 22.2380, 73.0850),
    ("Rajkot", "ગોંડલ", "Gondal", "360311", 21.9610, 70.7950),
    ("Gandhinagar", "કલોલ", "Kalol", "382721", 23.2420, 72.4960),
]

# 11 department offices: dept, english name, gujarati name, district, lat/lng offset from HQ
DEPT_OFFICES = [
    ("Social Justice", "District Social Justice Office", "જિલ્લા સામાજિક ન્યાય કચેરી", "Ahmedabad", 0.012, -0.010),
    ("Health", "District Health Office", "જિલ્લા આરોગ્ય કચેરી", "Ahmedabad", -0.015, 0.012),
    ("Agriculture", "District Agriculture Office", "જિલ્લા ખેતીવાડી કચેરી", "Ahmedabad", 0.020, 0.018),
    ("Social Justice", "District Social Justice Office", "જિલ્લા સામાજિક ન્યાય કચેરી", "Surat", 0.010, -0.012),
    ("Industries", "District Industries Centre", "જિલ્લા ઉદ્યોગ કેન્દ્ર", "Surat", -0.014, 0.010),
    ("Education", "District Education Office", "જિલ્લા શિક્ષણ કચેરી", "Vadodara", 0.011, 0.009),
    ("Food & Civil Supplies", "District Supply Office", "જિલ્લા પુરવઠા કચેરી", "Rajkot", -0.010, -0.011),
    ("Rural Dev", "District Rural Development Agency", "જિલ્લા ગ્રામ વિકાસ એજન્સી", "Gandhinagar", 0.009, -0.008),
    ("Labour", "Assistant Labour Commissioner Office", "મદદનીશ શ્રમ આયુક્ત કચેરી", "Gandhinagar", -0.012, 0.014),
    ("Tribal Development", "District Tribal Development Office", "જિલ્લા આદિજાતિ વિકાસ કચેરી", "Dang", 0.008, -0.007),
    ("Women & Child Dev", "District Women & Child Development Office", "જિલ્લા મહિલા અને બાળ વિકાસ કચેરી", "Junagadh", -0.011, 0.012),
]

# Gujarati spellings for places that get their own offices (Latin name is kept where unsure)
GU = {
    "Dholka": "ધોળકા", "Bagodara": "બગોદરા", "Bavla": "બાવળા", "Dhandhuka": "ધંધુકા", "Sanand": "સાણંદ",
    "Bol": "બોળ", "Chandrala": "ચંદ્રાલા", "Itola": "ઇટોલા", "Viramgam": "વિરમગામ", "Charada": "ચારડા",
    "Kanpur": "કણપુર", "Anand": "આણંદ", "Khambhat": "ખંભાત", "Vallabh Vidyanagar": "વલ્લભ વિદ્યાનગર",
    "Deesa": "ડીસા", "Dhanera": "ધાનેરા", "Palanpur": "પાલનપુર", "Kankrej": "કાંકરેજ", "Radhanpur": "રાધનપુર",
    "Junagadh": "જૂનાગઢ", "Keshod": "કેશોદ", "Veraval": "વેરાવળ", "Bhuj": "ભુજ", "Anjar": "અંજાર",
    "Mandvi": "માંડવી", "Gandhidham": "ગાંધીધામ", "Adipur": "આદિપુર", "Mundra": "મુન્દ્રા", "Mehsana": "મહેસાણા",
    "Unjha": "ઊંઝા", "Visnagar": "વિસનગર", "Patan": "પાટણ", "Harij": "હારીજ", "Sidhpur": "સિદ્ધપુર",
    "Morbi": "મોરબી", "Tankara": "ટંકારા", "Wankaner": "વાંકાનેર", "Rajkot": "રાજકોટ", "Gondal": "ગોંડલ",
    "Jetpur": "જેતપુર", "Rajkot City": "રાજકોટ શહેર", "Choryasi": "ચોર્યાસી", "Bhatha": "ભાઠા", "Sachin": "સચિન",
    "Utran": "ઉતરાણ", "Katargam": "કતારગામ", "Kosad": "કોસાડ", "Sarthana": "સરથાણા", "Olpad": "ઓલપાડ",
    "Hansot": "હાંસોટ", "Limbachha": "લીંબાચા", "Dabhoi": "ડભોઇ", "Bodeli": "બોડેલી", "Sinor": "સિનોર",
    "Waghodia": "વાઘોડિયા", "Padra": "પાદરા", "Savli": "સાવલી", "Naroda": "નરોડા", "Bardoli": "બારડોલી",
    "Kalol": "કલોલ",
}

ALL_DEPARTMENTS = [
    "Education", "Agriculture", "Women & Child Dev", "Rural Dev", "Health",
    "Food & Civil Supplies", "Industries", "Social Justice", "Labour", "Tribal Development",
]
# Mamlatdar offices handle land, income and caste records, so they back these services too.
MAMLATDAR_DEPTS = {"Social Justice", "Food & Civil Supplies", "Rural Dev", "Agriculture", "Tribal Development", "Labour"}
PANCHAYAT_DEPTS = {"Agriculture", "Rural Dev", "Social Justice", "Women & Child Dev", "Health", "Tribal Development"}

HOURS = {
    "DISTRICT_COLLECTORATE": ("Mon–Fri 10:30–18:10", "Saturday, Sunday"),
    "JAN_SEVA_KENDRA": ("Mon–Sat 09:00–17:00", "Sunday"),
    "MAMLATDAR": ("Mon–Fri 10:30–18:10", "Saturday, Sunday"),
    "TALUKA_PANCHAYAT": ("Mon–Fri 10:30–18:10", "Saturday, Sunday"),
    "DEPARTMENT_OFFICE": ("Mon–Fri 10:30–18:10", "Saturday, Sunday"),
}

lines = [
    "-- SAMPLE office directory -- NOT official. data_source = DEMO_SEED.",
    "-- Phones use an invalid local part (starts with 0); addresses are marked (sample address).",
    "-- Regenerate with: python3 seed_data/generate_service_offices_sql.py",
    "DELETE FROM scheme_engine.office_service_link WHERE office_id IN "
    "(SELECT id FROM scheme_engine.service_office WHERE data_source = 'DEMO_SEED');",
    "DELETE FROM scheme_engine.service_office WHERE data_source = 'DEMO_SEED';",
    "",
]

offices = []  # dicts: id, type, district, taluka, village, dept, email
seq = {"n": 0}
used_emails = set()


def q(s):
    return "'" + s.replace("'", "''") + "'"


def slug(s):
    return re.sub(r"[^a-z0-9]+", ".", s.lower()).strip(".")


def unique_email(local, district):
    email = f"{local}@{EMAIL_DOMAIN}"
    if email in used_emails:
        email = f"{local}.{slug(district)}@{EMAIL_DOMAIN}"
    n = 2
    while email in used_emails:
        email = f"{local}.{slug(district)}{n}@{EMAIL_DOMAIN}"
        n += 1
    used_emails.add(email)
    return email


def gu(name):
    return GU.get(name, name)


def add_office(key, name, name_gu, otype, dept, address, district, taluka, village, pincode, lat, lng, std, email_local):
    seq["n"] += 1
    oid = uuid.uuid5(NS, key)
    hours, off = HOURS[otype]
    phone = f"{std}-0000 {seq['n']:04d}"
    email = unique_email(email_local, district)
    lines.append(
        "INSERT INTO scheme_engine.service_office (id, name, name_gujarati, office_type, department, address, "
        "district, taluka, village, pincode, latitude, longitude, phone, email, working_hours, weekly_off, "
        "is_active, data_source, last_verified_on) VALUES ("
        f"'{oid}', {q(name)}, {q(name_gu)}, '{otype}', {q(dept) if dept else 'NULL'}, {q(address)}, "
        f"{q(district)}, {q(taluka)}, {q(village) if village else 'NULL'}, '{pincode}', {lat:.6f}, {lng:.6f}, "
        f"{q(phone)}, {q(email)}, {q(hours)}, {q(off)}, true, 'DEMO_SEED', CURRENT_DATE);"
    )
    offices.append({"id": oid, "type": otype, "district": district, "taluka": taluka,
                    "village": village, "dept": dept, "email": email})


# ---- district level: collectorate + Jan Seva Kendra + Mamlatdar (HQ taluka) ----
for dist, dist_gu, town, pin, std, lat, lng in DISTRICTS:
    lines.append(
        "INSERT INTO scheme_engine.geo_centroid (district, latitude, longitude, approximate) "
        f"VALUES ({q(dist)}, {lat}, {lng}, true) ON CONFLICT (district) DO UPDATE SET "
        "latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude;"
    )
    base = slug(dist)
    add_office(f"coll:{dist}", f"{dist} Collectorate", f"{dist_gu} કલેક્ટરેટ", "DISTRICT_COLLECTORATE",
               "General Administration", f"Collector Office Campus, Civil Lines, {town} – {pin} (sample address)",
               dist, town, None, pin, lat + 0.010, lng + 0.010, std, f"collector.{base}")
    add_office(f"jsk:{dist}", f"{dist} Jan Seva Kendra", f"{dist_gu} જન સેવા કેન્દ્ર", "JAN_SEVA_KENDRA", None,
               f"Jan Seva Kendra, Ground Floor, Civic Centre, {town} – {pin} (sample address)",
               dist, town, None, pin, lat - 0.006, lng - 0.008, std, f"jsk.{base}")
    add_office(f"mam:{dist}", f"{town} Mamlatdar Office", f"{gu(town)} મામલતદાર કચેરી", "MAMLATDAR", None,
               f"Mamlatdar Office, Mini Secretariat, {town} – {pin} (sample address)",
               dist, town, None, pin, lat + 0.006, lng - 0.012, std, f"mamlatdar.{slug(town)}")

# ---- extra Jan Seva Kendras in big districts, each with a Mamlatdar office so the taluka has >= 2 offices ----
for dist, place_gu, place, pin, lat, lng in EXTRA_JSK:
    _, _, _, _, std, _, _ = DIST[dist]
    add_office(f"jsk:{dist}:{place}", f"{place} Jan Seva Kendra", f"{place_gu} જન સેવા કેન્દ્ર", "JAN_SEVA_KENDRA", None,
               f"Jan Seva Kendra, Taluka Seva Sadan, {place} – {pin} (sample address)",
               dist, place, None, pin, lat, lng, std, f"jsk.{slug(place)}")
    add_office(f"mam:{dist}:{place}", f"{place} Mamlatdar Office", f"{place_gu} મામલતદાર કચેરી", "MAMLATDAR", None,
               f"Mamlatdar Office, Taluka Seva Sadan, {place} – {pin} (sample address)",
               dist, place, None, pin, lat + 0.004, lng - 0.006, std, f"mamlatdar.{slug(place)}")

# ---- department offices ----
for dept, name, name_gu, dist, dlat, dlng in DEPT_OFFICES:
    _, _, town, pin, std, lat, lng = DIST[dist]
    add_office(f"dept:{dept}:{dist}", f"{name} – {dist}", f"{name_gu} – {DIST[dist][1]}", "DEPARTMENT_OFFICE", dept,
               f"{name}, Government Offices Complex, {town} – {pin} (sample address)",
               dist, town, None, pin, lat + dlat, lng + dlng, std, f"{slug(dept)}.{slug(dist)}")

# ---- registry talukas and villages: taluka offices (>= 2) and one office per village ----
office_taluka_keys = {(o["district"], o["taluka"]) for o in offices}
for (dist, taluka), villages in REGISTRY.items():
    _, dist_gu, _, pin, std, dlat, dlng = DIST[dist]
    hq = TALUKA_HQ[(dist, taluka)]
    if (dist, taluka) not in office_taluka_keys:
        # A taluka the office master did not list yet: Mamlatdar + Taluka Panchayat + Jan Seva Kendra.
        add_office(f"mam:{dist}:{taluka}", f"{taluka} Mamlatdar Office", f"{gu(taluka)} મામલતદાર કચેરી", "MAMLATDAR", None,
                   f"Mamlatdar Office, Taluka Seva Sadan, {taluka}, {dist} – {pin} (sample address)",
                   dist, taluka, None, pin, hq[0] + 0.004, hq[1] - 0.006, std, f"mamlatdar.{slug(taluka)}")
        add_office(f"tp:{dist}:{taluka}", f"{taluka} Taluka Panchayat", f"{gu(taluka)} તાલુકા પંચાયત", "TALUKA_PANCHAYAT", None,
                   f"Taluka Panchayat Office, {taluka}, {dist} – {pin} (sample address)",
                   dist, taluka, None, pin, hq[0] + 0.008, hq[1] + 0.004, std, f"tdo.{slug(taluka)}")
        add_office(f"tjsk:{dist}:{taluka}", f"{taluka} Taluka Jan Seva Kendra", f"{gu(taluka)} તાલુકા જન સેવા કેન્દ્ર", "JAN_SEVA_KENDRA", None,
                   f"Jan Seva Kendra, Taluka Seva Sadan, {taluka}, {dist} – {pin} (sample address)",
                   dist, taluka, None, pin, hq[0] - 0.004, hq[1] + 0.006, std, f"jsk.{slug(taluka)}")
    elif sum(1 for o in offices if (o["district"], o["taluka"]) == (dist, taluka)) < 2:
        raise SystemExit(f"taluka {dist}/{taluka} has fewer than 2 offices")

    for i, village in enumerate(villages):
        vlat, vlng = VILLAGE_POS.get(village, (hq[0] + 0.012 * (i + 1), hq[1] - 0.010 * (i + 1)))
        if (vlat, vlng) == hq or village in (taluka, "Rajkot City"):
            vlat, vlng = hq[0] + 0.004, hq[1] + 0.004  # keep the pin off the taluka offices
        add_office(f"vil:{dist}:{taluka}:{village}", f"{village} Gram Jan Seva Kendra",
                   f"{gu(village)} ગ્રામ જન સેવા કેન્દ્ર", "JAN_SEVA_KENDRA", None,
                   f"Gram Panchayat Office, {village}, Taluka {taluka}, {dist} – {pin} (sample address)",
                   dist, taluka, village, pin, vlat, vlng, std, f"egram.{slug(village)}.{slug(taluka)}")


# ---- the 31 talukas the family registry has no villages for: villages (rural) or areas (city talukas) ----
# Place names are real Gujarat localities chosen near each taluka; which taluka each belongs to is approximate
# sample data, and coordinates are spread around the taluka headquarters (not surveyed positions).
# kind "area" = a locality of a city taluka (shown in the same "Village / city area" dropdown).
EXTRA_VILLAGES = {
    ("Ahmedabad", "Ahmedabad City"): ("area", ["Navrangpura", "Maninagar", "Vastrapur", "Naranpura", "Satellite", "Ghatlodia"]),
    ("Ahmedabad", "Bavla"): ("village", ["Sachana", "Kerala", "Rajoda", "Dholi"]),
    ("Ahmedabad", "Naroda"): ("area", ["Naroda Gam", "Kubernagar", "Saijpur Bogha", "Nikol", "Krishnanagar"]),
    ("Amreli", "Amreli"): ("village", ["Chital", "Babapur", "Lathi", "Savarkundla"]),
    ("Aravalli", "Modasa"): ("village", ["Dhansura", "Shamlaji", "Bayad", "Malpur"]),
    ("Bharuch", "Bharuch"): ("village", ["Ankleshwar", "Dahej", "Jhagadia", "Amod"]),
    ("Bhavnagar", "Bhavnagar"): ("village", ["Sihor", "Talaja", "Ghogha", "Vartej"]),
    ("Botad", "Botad"): ("village", ["Gadhada", "Barwala", "Ranpur", "Paliyad"]),
    ("Chhota Udaipur", "Chhota Udaipur"): ("village", ["Kavant", "Pavi Jetpur", "Nasvadi", "Sankheda"]),
    ("Dahod", "Dahod"): ("village", ["Jhalod", "Garbada", "Limkheda", "Devgadh Baria"]),
    ("Dang", "Ahwa"): ("village", ["Waghai", "Subir", "Saputara", "Shamgahan"]),
    ("Gandhinagar", "Gandhinagar"): ("area", ["Sargasan", "Kudasan", "Randesan", "Adalaj", "Pethapur"]),
    ("Gandhinagar", "Kalol"): ("village", ["Chhatral", "Saij", "Pansar", "Dhanot"]),
    ("Gir Somnath", "Veraval"): ("village", ["Somnath", "Prabhas Patan", "Sutrapada", "Kodinar"]),
    ("Jamnagar", "Jamnagar"): ("village", ["Dhrol", "Lalpur", "Sikka", "Kalavad"]),
    ("Kheda", "Nadiad"): ("village", ["Mahemdavad", "Kathlal", "Dakor", "Kapadvanj"]),
    ("Mahisagar", "Lunawada"): ("village", ["Santrampur", "Kadana", "Virpur", "Khanpur"]),
    ("Morbi", "Morbi"): ("village", ["Maliya", "Tankara", "Wankaner", "Halvad"]),
    ("Narmada", "Rajpipla"): ("village", ["Dediapada", "Sagbara", "Tilakwada", "Nandod"]),
    ("Navsari", "Navsari"): ("village", ["Jalalpore", "Gandevi", "Chikhli", "Vansda"]),
    ("Panchmahal", "Godhra"): ("village", ["Kalol (Panchmahal)", "Halol", "Shehra", "Ghoghamba"]),
    ("Porbandar", "Porbandar"): ("village", ["Ranavav", "Kutiyana", "Bokhira", "Chhaya"]),
    ("Rajkot", "Gondal"): ("village", ["Bhunava", "Sudamda", "Ribda", "Gundala"]),
    ("Sabarkantha", "Himmatnagar"): ("village", ["Prantij", "Talod", "Idar", "Vadali"]),
    ("Surat", "Bardoli"): ("village", ["Mahuva", "Madhi", "Kadod", "Palsana"]),
    ("Surat", "Surat City"): ("area", ["Adajan", "Vesu", "Varachha", "Piplod", "Athwa", "Udhna"]),
    ("Surendranagar", "Surendranagar"): ("village", ["Wadhwan", "Limbdi", "Dudhrej", "Joravarnagar"]),
    ("Tapi", "Vyara"): ("village", ["Songadh", "Uchchhal", "Nizar", "Valod"]),
    ("Vadodara", "Padra"): ("village", ["Mujpur", "Ekalbara", "Dabka", "Vadu"]),
    ("Vadodara", "Vadodara City"): ("area", ["Alkapuri", "Fatehgunj", "Gotri", "Manjalpur", "Karelibaug", "Akota"]),
    ("Valsad", "Valsad"): ("village", ["Vapi", "Pardi", "Dharampur", "Umbergaon"]),
}

taluka_pos = {(d[0], d[2]): (d[5], d[6], d[3]) for d in DISTRICTS}            # HQ talukas: lat, lng, pincode
taluka_pos.update({(e[0], e[2]): (e[4], e[5], e[3]) for e in EXTRA_JSK})      # extra Jan Seva Kendra talukas
for (dist, taluka), (kind, places) in EXTRA_VILLAGES.items():
    _, _, _, _, std, _, _ = DIST[dist]
    hq_lat, hq_lng, pin = taluka_pos[(dist, taluka)]
    radius = 0.022 if kind == "area" else 0.05
    for i, place in enumerate(places):
        ang = 2 * math.pi * i / len(places) + 0.6
        plat, plng = hq_lat + radius * math.sin(ang), hq_lng + radius * math.cos(ang)
        if kind == "area":
            add_office(f"vil:{dist}:{taluka}:{place}", f"{place} Jan Seva Kendra", f"{gu(place)} જન સેવા કેન્દ્ર",
                       "JAN_SEVA_KENDRA", None,
                       f"Ward Service Centre, {place}, {taluka}, {dist} – {pin} (sample address)",
                       dist, taluka, place, pin, plat, plng, std, f"jsk.{slug(place)}.{slug(taluka)}")
        else:
            add_office(f"vil:{dist}:{taluka}:{place}", f"{place} Gram Jan Seva Kendra",
                       f"{gu(place)} ગ્રામ જન સેવા કેન્દ્ર", "JAN_SEVA_KENDRA", None,
                       f"Gram Panchayat Office, {place}, Taluka {taluka}, {dist} – {pin} (sample address)",
                       dist, taluka, place, pin, plat, plng, std, f"egram.{slug(place)}.{slug(taluka)}")

# ---- service links (resolution: scheme link -> DEPARTMENT: link -> CATEGORY: link) ----
link_n = 0


def add_link(oid, key):
    global link_n
    link_n += 1
    lines.append(
        "INSERT INTO scheme_engine.office_service_link (id, office_id, service_key) VALUES "
        f"('{uuid.uuid5(NS, f'link:{oid}:{key}')}', '{oid}', {q(key)}) ON CONFLICT DO NOTHING;"
    )


for o in offices:
    if o["type"] in ("DISTRICT_COLLECTORATE", "JAN_SEVA_KENDRA"):
        depts = ALL_DEPARTMENTS
    elif o["type"] == "MAMLATDAR":
        depts = sorted(MAMLATDAR_DEPTS)
    elif o["type"] == "TALUKA_PANCHAYAT":
        depts = sorted(PANCHAYAT_DEPTS)
    else:
        depts = [o["dept"]] if o["dept"] else []
    for d in depts:
        add_link(o["id"], f"DEPARTMENT:{d}")

# ---- self-check: refuse to write data that breaks the coverage rules ----
errors = []
village_offices = {}
taluka_counts = {}
for o in offices:
    taluka_counts[(o["district"], o["taluka"])] = taluka_counts.get((o["district"], o["taluka"]), 0) + 1
    if o["village"]:
        village_offices[(o["district"], o["taluka"], o["village"])] = village_offices.get((o["district"], o["taluka"], o["village"]), 0) + 1
    if not o["email"].endswith(f"@{EMAIL_DOMAIN}"):
        errors.append(f"bad email {o['email']}")
for (dist, taluka), villages in REGISTRY.items():
    for v in villages:
        if village_offices.get((dist, taluka, v), 0) < 1:
            errors.append(f"village without an office: {dist}/{taluka}/{v}")
villages_per_taluka = {}
for (dist, taluka, village) in village_offices:
    villages_per_taluka.setdefault((dist, taluka), set()).add(village)
for key in taluka_counts:
    if not villages_per_taluka.get(key):
        errors.append(f"taluka without any village/area: {key}")
for key, n in taluka_counts.items():
    if n < 2:
        errors.append(f"taluka with fewer than 2 offices: {key} ({n})")
for d in DISTRICTS:
    types = {o["type"] for o in offices if o["district"] == d[0]}
    for need in ("DISTRICT_COLLECTORATE", "JAN_SEVA_KENDRA", "MAMLATDAR"):
        if need not in types:
            errors.append(f"district {d[0]} missing {need}")
if len({o["email"] for o in offices}) != len(offices):
    errors.append("duplicate e-mail addresses")
if errors:
    raise SystemExit("seed self-check failed:\n  " + "\n  ".join(errors))

out = Path(__file__).resolve().parent / "seed_service_offices.sql"
out.write_text("\n".join(lines) + "\n", encoding="utf-8")
by_type = {}
for o in offices:
    by_type[o["type"]] = by_type.get(o["type"], 0) + 1
n_villages = sum(len(v) for v in REGISTRY.values())
print(f"Wrote {out}: {len(offices)} offices {by_type}, {link_n} service links")
print(f"Villages/areas per taluka: min {min(len(v) for v in villages_per_taluka.values())}, total {sum(len(v) for v in villages_per_taluka.values())} across {len(villages_per_taluka)} talukas")
print(f"Self-check ok: {n_villages} villages each with an office, {len(taluka_counts)} talukas each with >= 2 offices, "
      f"all {len(offices)} e-mails end with @{EMAIL_DOMAIN}")
