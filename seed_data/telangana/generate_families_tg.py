#!/usr/bin/env python3
"""Telangana synthetic family_registry seed: 5 hero families + N random families.

All people are invented. Geography (district / mandal / village) is drawn from the LGD files in
state-packs/TG/lgd/, so every address resolves to a real LGD unit.

    python3 seed_data/telangana/generate_families_tg.py [--count 1000] > /tmp/tg_families.sql
    psql -d citizen_db -v ON_ERROR_STOP=1 -f /tmp/tg_families.sql      # after db/platform/001..003

Caste codes stay SC / ST / OBC / NT / GENERAL (the codes the existing services use); in Telangana OBC means BC.
"""
from __future__ import annotations
import argparse, csv, random, sys, uuid
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LGD = ROOT / "state-packs" / "TG" / "lgd"
TODAY = date(2026, 6, 21)

CASTE_WEIGHTS = [("SC", 0.17), ("ST", 0.10), ("OBC", 0.50), ("NT", 0.03), ("GENERAL", 0.20)]

NAMES = {
    "SC": {"M": ["Mallesh", "Yadaiah", "Narsimha", "Ravinder", "Anjaiah", "Srinivas", "Venkatesh", "Ramulu", "Laxman", "Komuraiah"],
           "F": ["Lakshmi", "Saraswathi", "Yellamma", "Sailaja", "Padma", "Anitha", "Kavitha", "Swapna", "Rajamma", "Mounika"],
           "last": ["Pagidipalli", "Dandu", "Gaddam", "Kanukuntla", "Jadala", "Ankam", "Bandari", "Kattula", "Mekala", "Paidi"]},
    "ST": {"M": ["Ravi", "Kishan", "Ramesh", "Hanumanthu", "Balu", "Gopal", "Mangilal", "Thirupathi"],
           "F": ["Sunitha", "Laxmibai", "Saritha", "Kamala", "Jyothi", "Padmabai", "Radhabai", "Shanti"],
           "last": ["Naik", "Ramavath", "Banoth", "Bhukya", "Dharavath", "Kotnak", "Madavi", "Atram", "Meshram", "Sodi"]},
    "OBC": {"M": ["Srikanth", "Praveen", "Naresh", "Mahesh", "Sudhakar", "Raghu", "Anil", "Rajender", "Venu", "Shankar"],
            "F": ["Padmavathi", "Swathi", "Radhika", "Madhavi", "Vijaya", "Sujatha", "Bhargavi", "Lavanya", "Sridevi", "Anusha"],
            "last": ["Goud", "Yadav", "Mudiraj", "Padmasali", "Munnuru", "Perka", "Gangaputra", "Vaddera", "Kummari", "Chakali"]},
    "NT": {"M": ["Raju", "Mogulaiah", "Eshwar", "Pochaiah", "Mallaiah", "Sattaiah"],
           "F": ["Yellavva", "Pochamma", "Maisamma", "Lacchamma", "Sarojana", "Devamma"],
           "last": ["Erukala", "Dommara", "Pardhi", "Budaga", "Sugali", "Pichiguntla"]},
}
GENERAL_HINDU = {"M": ["Venkat", "Ramakrishna", "Sandeep", "Vamshi", "Krishna", "Prasad", "Suresh", "Harsha"],
                 "F": ["Sravani", "Harika", "Aruna", "Sirisha", "Deepthi", "Prameela", "Vasantha", "Jhansi"],
                 "last": ["Reddy", "Rao", "Velama", "Naidu", "Sharma", "Raju", "Chowdary", "Varma"]}
GENERAL_MUSLIM = {"M": ["Mohammed", "Abdul", "Imran", "Salman", "Farooq", "Ismail", "Khaja", "Rahim"],
                  "F": ["Shabana", "Fatima", "Nazia", "Ayesha", "Rukhsana", "Sultana", "Zainab", "Noor"],
                  "last": ["Shaikh", "Syed", "Khan", "Pathan", "Quraishi", "Ansari", "Siddiqui", "Mirza"]}

OCCUPATION_INCOME = {
    "farmer": (60_000, 180_000), "daily wage": (40_000, 120_000), "teacher": (240_000, 480_000),
    "government employee": (360_000, 600_000), "shopkeeper": (120_000, 360_000), "auto driver": (90_000, 180_000),
    "ASHA worker": (48_000, 84_000), "weaver": (60_000, 120_000), "private job": (180_000, 420_000),
    "businessman": (480_000, 1_200_000), "homemaker": (0, 0), "student": (0, 0), "retired": (0, 0),
}
WORKING = ["farmer", "daily wage", "teacher", "government employee", "shopkeeper", "auto driver",
           "ASHA worker", "weaver", "private job", "businessman"]
STREETS = ["Ambedkar Nagar", "Gandhi Chowk", "Hanuman Nagar", "Indiramma Colony", "Bus Stand Road", "Panchayat Office Road",
           "Temple Street", "Masjid Road", "Kakatiya Colony", "Sai Nagar", "Ramalayam Street", "Jyothi Nagar"]
STRUCTURES = [(0.30, lambda r: (1, r.randint(1, 2), False, False)), (0.20, lambda r: (1, r.randint(3, 4), False, False)),
              (0.25, lambda r: (1, r.randint(1, 2), True, False)), (0.10, lambda r: (0, r.randint(2, 3), False, False)),
              (0.15, lambda r: (1, r.randint(2, 3), True, True))]


def load_geography():
    """[(district, mandal, [villages])] for inhabited rural villages that have a name."""
    tree: dict[tuple[str, str], list[str]] = {}
    with open(LGD / "villages.csv", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row["Village Status"].strip() != "Inhabitant":
                continue
            name = row["Village Name (In English)"].strip()
            if not name:
                continue
            tree.setdefault((row["District Name (In English)"].strip(), row["Sub-District Name (In English)"].strip()), []).append(name)
    return [(d, m, v) for (d, m), v in sorted(tree.items())]


def esc(v): return v.replace("'", "''")
def s(v): return "NULL" if v is None else f"'{esc(v)}'"
def b(v): return "true" if v else "false"


class Gen:
    def __init__(self, seed: int):
        self.r = random.Random(seed)
        self.geo = load_geography()
        self.aadhaar = 6000
        self.mobile = 6000

    def pick(self, pairs):
        x, c = self.r.random(), 0.0
        for k, w in pairs:
            c += w
            if x <= c:
                return k
        return pairs[-1][0]

    def name(self, caste, gender, pool=None):
        p = pool or NAMES[caste]
        return f"{self.r.choice(p[gender])} {self.r.choice(p['last'])}"

    def dob(self, age): return date(2026 - age, self.r.randint(1, 12), self.r.randint(1, 28))

    @staticmethod
    def age(d): return TODAY.year - d.year - ((TODAY.month, TODAY.day) < (d.month, d.day))

    def income(self, occ):
        lo, hi = OCCUPATION_INCOME[occ]
        return 0 if hi == 0 else self.r.randint(lo, hi)

    def person(self, name, dob, gender, occ, caste, alive=True, income=None):
        self.aadhaar += 1
        mobile = None
        if alive and occ != "student" and self.age(dob) >= 18:
            self.mobile += 1
            mobile = str(9876540000 + self.mobile)
        inc = self.income(occ) if income is None else income
        return (str(uuid.UUID(int=self.r.getrandbits(128), version=4)), name, dob, gender,
                f"XXXX-XXXX-{self.aadhaar:04d}", occ, inc, caste, alive, mobile)

    def family(self):
        r = self.r
        caste = self.pick(CASTE_WEIGHTS)
        pool = None
        if caste == "GENERAL":
            pool = GENERAL_MUSLIM if r.random() < 0.35 else GENERAL_HINDU
        district, mandal, villages = r.choice(self.geo)
        village = r.choice(villages)
        fid = str(uuid.UUID(int=r.getrandbits(128), version=4))
        fam = (fid, f"{r.randint(1, 200)} {r.choice(STREETS)}, {village}", village, mandal, district)
        x, c, struct = r.random(), 0.0, STRUCTURES[0][1]
        for w, fn in STRUCTURES:
            c += w
            if x <= c:
                struct = fn
                break
        spouse, kids, father, mother = struct(r)
        hg = "F" if r.random() < 0.30 else "M"
        hage = r.randint(30, 55)
        hocc = r.choice(WORKING)
        head = self.person(self.name(caste, hg, pool), self.dob(hage), hg, hocc, caste)
        persons, members = [head], [(fid, head[0], "HEAD")]
        if spouse:
            sg = "F" if hg == "M" else "M"
            alive = hg != "F"
            socc = r.choice(WORKING + ["homemaker"]) if alive else "daily wage"
            sp = self.person(self.name(caste, sg, pool), self.dob(max(hage + r.randint(-5, 5), 22)), sg, socc, caste,
                             alive=alive, income=None if alive else 0)
            persons.append(sp); members.append((fid, sp[0], "SPOUSE"))
        eldest = max(5, hage - r.randint(15, 20))
        for i in range(kids):
            cage = max(3, eldest - i * r.randint(2, 4))
            cg = r.choice("MF")
            cocc = "student" if cage < 22 else r.choice(WORKING)
            ch = self.person(self.name(caste, cg, pool), self.dob(cage), cg, cocc, caste)
            persons.append(ch); members.append((fid, ch[0], "SON" if cg == "M" else "DAUGHTER"))
        for flag, g, occ, rel in ((father, "M", "retired", "FATHER"), (mother, "F", "homemaker", "MOTHER")):
            if flag:
                p = self.person(self.name(caste, g, pool), self.dob(hage + r.randint(25, 35)), g, occ, caste)
                persons.append(p); members.append((fid, p[0], rel))
        return fam, persons, members


def hid(prefix, seq): return f"{prefix:08d}-0000-0000-0000-{seq:012d}"


def heroes():
    """Five demo families. Same ids as the DG2.0 demo so later demo scripts can reuse them. Hamlets are real LGD villages."""
    def fam(n, addr, village, mandal, district): return (f"a{n}000000-0000-0000-0000-00000000000{n}", addr, village, mandal, district)
    spec = [
        (1, ("12 Indiramma Colony, Chityal", "Chityal", "Chityal", "Jayashankar Bhupalapally"), "OBC", [
            ("Padmavathi Goud", date(1985, 3, 15), "F", "farmer", 95000, True, "HEAD"),
            ("Ramesh Goud", date(1982, 7, 20), "M", "daily wage", 45000, True, "SPOUSE"),
            ("Arjun Goud", date(2008, 1, 10), "M", "student", 0, True, "SON"),
            ("Ananya Goud", date(2012, 5, 22), "F", "student", 0, True, "DAUGHTER"),
            ("Yellamma Goud", date(1955, 11, 3), "F", "homemaker", 0, True, "MOTHER")]),
        (2, ("45 Ambedkar Nagar, Karimnagar", "Karimnagar", "Karimnagar", "Karimnagar"), "SC", [
            ("Rajender Pagidipalli", date(1978, 9, 12), "M", "shopkeeper", 180000, True, "HEAD"),
            ("Suma Pagidipalli", date(1980, 4, 18), "F", "ASHA worker", 60000, True, "SPOUSE"),
            ("Vikram Pagidipalli", date(2005, 8, 30), "M", "student", 0, True, "SON"),
            ("Gopal Pagidipalli", date(1948, 2, 14), "M", "retired", 0, False, "FATHER")]),
        (3, ("7 Gandhi Chowk, Utnoor", "Utnoor", "Utnoor", "Adilabad"), "ST", [
            ("Meera Madavi", date(1975, 6, 8), "F", "teacher", 320000, True, "HEAD"),
            ("Dinesh Madavi", date(1972, 12, 25), "M", "government employee", 480000, True, "SPOUSE"),
            ("Pooja Madavi", date(2000, 3, 14), "F", "student", 0, True, "DAUGHTER"),
            ("Rohit Madavi", date(2003, 7, 19), "M", "student", 0, True, "SON"),
            ("Bhimrao Madavi", date(1942, 1, 30), "M", "retired", 0, True, "FATHER"),
            ("Savitha Madavi", date(1945, 8, 11), "F", "homemaker", 0, True, "MOTHER")]),
        (4, ("23 Masjid Road, Nizamabad", "Nizamabad", "Nizamabad North", "Nizamabad"), "GENERAL", [
            ("Ahmed Shaikh", date(1970, 11, 5), "M", "businessman", 850000, True, "HEAD"),
            ("Fatima Shaikh", date(1974, 3, 22), "F", "homemaker", 0, True, "SPOUSE"),
            ("Zara Shaikh", date(1998, 9, 10), "F", "private job", 240000, True, "DAUGHTER"),
            ("Imran Shaikh", date(2001, 12, 15), "M", "student", 0, True, "SON")]),
        (5, ("3 Temple Street, Bhadrachalam", "Bhadrachalam", "Bhadrachalam", "Bhadradri Kothagudem"), "NT", [
            ("Yellavva Erukala", date(1980, 8, 17), "F", "daily wage", 72000, True, "HEAD"),
            ("Suresh Erukala", date(1977, 5, 30), "M", "daily wage", 0, False, "SPOUSE"),
            ("Kiran Erukala", date(2006, 2, 14), "M", "student", 0, True, "SON"),
            ("Lata Erukala", date(2009, 11, 8), "F", "student", 0, True, "DAUGHTER")]),
    ]
    out = []
    for n, (addr, village, mandal, district), caste, people in spec:
        f = fam(n, addr, village, mandal, district)
        persons, members = [], []
        for k, (nm, dob, g, occ, inc, alive, rel) in enumerate(people, 1):
            pid = hid(n * 10_000_000 + k, 1)
            mob = None if (occ == "student" or not alive or TODAY.year - dob.year < 18) else f"98765{n}{k:04d}"
            persons.append((pid, nm, dob, g, f"XXXX-XXXX-{n}{k:03d}", occ, inc, caste, alive, mob))
            members.append((f[0], pid, rel))
        out.append((f, persons, members))
    return out


def emit(o, fam, persons, members):
    o.write(f"INSERT INTO family (id, address, village, taluka, district, state) VALUES ('{fam[0]}', {s(fam[1])}, {s(fam[2])}, {s(fam[3])}, {s(fam[4])}, 'Telangana');\n")
    for p in persons:
        o.write("INSERT INTO person (id, name, dob, gender, aadhaar_ref, occupation, annual_income, caste_category, is_alive, mobile) VALUES "
                f"('{p[0]}', {s(p[1])}, '{p[2].isoformat()}', {s(p[3])}, {s(p[4])}, {s(p[5])}, {p[6]}, {s(p[7])}, {b(p[8])}, {s(p[9])});\n")
    for m in members:
        o.write(f"INSERT INTO family_member (family_id, person_id, relationship_to_head) VALUES ('{m[0]}', '{m[1]}', {s(m[2])});\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=1000, help="total families including 5 heroes")
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    g, o = Gen(a.seed), sys.stdout
    o.write("-- Telangana synthetic families (invented people). Generated by seed_data/telangana/generate_families_tg.py\n")
    o.write("SELECT set_config('app.state_code', 'TG', false);\nSET search_path TO family_registry;\n")
    o.write("DELETE FROM family_member;\nDELETE FROM person;\nDELETE FROM family;\n\n")
    for h in heroes():
        emit(o, *h)
    for _ in range(a.count - 5):
        emit(o, *g.family())
    print(f"-- {a.count} families ({len(heroes())} hero)", file=sys.stderr)


if __name__ == "__main__":
    main()
