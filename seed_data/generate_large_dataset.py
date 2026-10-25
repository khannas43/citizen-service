#!/usr/bin/env python3
"""
generate_large_dataset.py
Generates ~220,000 families / ~950,000 persons for DG 2.0 demo.

Usage:
  kubectl port-forward svc/postgres 5433:5432 -n citizen &
  python3.12 -m venv .venv-seed && .venv-seed/bin/pip install psycopg2-binary
  .venv-seed/bin/python seed_data/generate_large_dataset.py

Prerequisites: family_registry schema with family, person, family_member tables.
Does NOT overwrite hero families (aadhaar XXXX-XXXX-1001–1005, 2001, 5001).
After completion, run POST /v1/admin/run-identification to populate beneficiaries.
"""

from __future__ import annotations

import os
import random
import sys
import uuid
from dataclasses import dataclass
from datetime import date, timedelta

import psycopg2
import psycopg2.extras

TARGET_FAMILIES = int(os.getenv("TARGET_FAMILIES", "220_000").replace("_", ""))
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "5000"))
PROGRESS_EVERY = 10_000

DISTRICTS = [
    ("Ahmedabad", 16, ["Daskroi", "Bavla", "Sanand", "Dholka", "Viramgam", "Mandal", "Detroj", "Dhandhuka"]),
    ("Surat", 13, ["Surat City", "Chorasi", "Olpad", "Mangrol", "Bardoli", "Kamrej", "Mahuva", "Palsana"]),
    ("Vadodara", 8, ["Vadodara City", "Savli", "Padra", "Karjan", "Dabhoi", "Waghodiya", "Shinor", "Chhota Udaipur"]),
    ("Rajkot", 7, ["Rajkot City", "Lodhika", "Kotda Sangani", "Gondal", "Jetpur", "Paddhari", "Jasdan", "Vinchhiya"]),
    ("Mehsana", 5, ["Mehsana", "Kadi", "Visnagar", "Unjha", "Vijapur", "Becharaji", "Satlasana", "Kheralu"]),
    ("Banaskantha", 5, ["Palanpur", "Deesa", "Dhanera", "Vadgam", "Tharad", "Danta", "Amirgadh", "Bhabhar"]),
    ("Anand", 4, ["Anand", "Petlad", "Sojitra", "Tarapur", "Khambhat", "Umreth", "Borsad", "Anklav"]),
    ("Gandhinagar", 3, ["Gandhinagar", "Kalol", "Dehgam", "Mansa"]),
    ("Kutch", 3, ["Bhuj", "Anjar", "Gandhidham", "Mandvi", "Mundra", "Nakhatrana", "Rapar", "Abdasa"]),
    ("Bharuch", 3, ["Bharuch", "Ankleshwar", "Jambusar", "Vagra", "Amod", "Hansot", "Valia", "Jhagadia"]),
    ("Junagadh", 3, ["Junagadh", "Veraval", "Keshod", "Visavadar", "Mangrol", "Bhesan", "Mendarda", "Vanthali"]),
    ("Amreli", 2, ["Amreli", "Savarkundla", "Rajula", "Lathi", "Bagasara", "Dhari", "Khambha", "Liliya"]),
    ("Bhavnagar", 3, ["Bhavnagar", "Talaja", "Mahuva", "Palitana", "Sihor", "Gariadhar", "Ghogha", "Vallabhipur"]),
    ("Surendranagar", 3, ["Surendranagar", "Wadhwan", "Chotila", "Dhrangadhra", "Limbdi", "Chuda", "Halvad", "Muli"]),
    ("Patan", 2, ["Patan", "Radhanpur", "Harij", "Santalpur", "Sami", "Sidhpur", "Chanasma", "Saraswati"]),
    ("Kheda", 3, ["Nadiad", "Kapadvanj", "Balasinor", "Thasra", "Matar", "Mehmedabad", "Mahudha", "Vaso"]),
    ("Panchmahal", 2, ["Godhra", "Kalol", "Halol", "Lunawada", "Ghoghamba", "Morwa Hadaf", "Shehera", "Jambughoda"]),
    ("Dahod", 2, ["Dahod", "Garbada", "Limkheda", "Devgadh Baria", "Dhanpur", "Fatepura", "Zalod", "Sangita"]),
    ("Narmada", 1, ["Rajpipla", "Garudeshwar", "Sagbara", "Tilakwada", "Nandod", "Dediapada"]),
    ("Navsari", 2, ["Navsari", "Chikhli", "Gandevi", "Vansda", "Jalalpore", "Khergam"]),
    ("Valsad", 2, ["Valsad", "Pardi", "Bulsar", "Dharampur", "Umbergaon", "Kaprada"]),
    ("Tapi", 1, ["Vyara", "Songadh", "Nizar", "Uchchhal", "Valod", "Dolvan"]),
    ("Morbi", 2, ["Morbi", "Wankaner", "Tankara", "Maliya Miyana", "Halvad"]),
    ("Jamnagar", 3, ["Jamnagar", "Kalawad", "Dhrol", "Jodia", "Lalpur", "Jam Jodhpur"]),
    ("Porbandar", 1, ["Porbandar", "Ranavav", "Kutiyana"]),
    ("Gir Somnath", 2, ["Veraval", "Kodinar", "Una", "Talala", "Sutrapada"]),
    ("Botad", 1, ["Botad", "Barwala", "Gadhada", "Ranpur"]),
    ("Aravalli", 2, ["Modasa", "Malpur", "Dhansura", "Bayad", "Meghraj"]),
    ("Mahisagar", 1, ["Lunawada", "Kadana", "Khanpur", "Santrampur", "Balasinor", "Virpur"]),
    ("Chhota Udaipur", 1, ["Chhota Udaipur", "Naswadi", "Jetpur Pavi", "Kavant", "Sankheda", "Bodeli"]),
    ("Devbhumi Dwarka", 1, ["Khambhalia", "Okhamandal", "Kalyanpur", "Bhanvad"]),
    ("Sabarkantha", 2, ["Himmatnagar", "Talod", "Modasa", "Idar", "Prantij", "Khedbrahma", "Vadali", "Bayad"]),
]

CASTES = ["OBC"] * 48 + ["GENERAL"] * 22 + ["ST"] * 15 + ["NT"] * 8 + ["SC"] * 7

MALE_NAMES = [
    "Ramesh", "Mahesh", "Suresh", "Bhavesh", "Nilesh", "Dinesh", "Rajesh", "Umesh", "Mukesh",
    "Alpesh", "Hitesh", "Paresh", "Naresh", "Kamlesh", "Vipul", "Kishan", "Mohan", "Jayesh",
    "Kalpesh", "Manish", "Rakesh", "Girish", "Haresh", "Deepak", "Sandip", "Bhavin", "Pratik",
    "Dhruv", "Harsh", "Parth", "Yash", "Jeet", "Maulik", "Vijay", "Gopal", "Arjun", "Rajan",
    "Bharat", "Chirag", "Neel", "Ravi", "Sanjay", "Ajay", "Dilip", "Arvind", "Pravin",
    "Harish", "Nikhil", "Vishal", "Ashwin",
]
FEMALE_NAMES = [
    "Priya", "Kavita", "Meena", "Hina", "Nita", "Sita", "Gita", "Lata", "Asha", "Usha",
    "Rekha", "Geeta", "Radha", "Sonal", "Payal", "Kiran", "Sheela", "Manju", "Saroj",
    "Hetal", "Bhavna", "Tejal", "Komal", "Seema", "Rupa", "Mital", "Jalpa", "Bhumi",
    "Chhaya", "Puja", "Ankita", "Riya", "Nisha", "Disha", "Pooja", "Mansi", "Sneha",
    "Jyoti", "Savita", "Kamla", "Leela", "Shanta", "Vimla", "Madhu", "Anita", "Sunita",
    "Pushpa", "Bharti", "Reena",
]
SURNAMES = [
    "Patel", "Shah", "Modi", "Joshi", "Desai", "Mehta", "Trivedi", "Pandya", "Dave", "Bhatt",
    "Parmar", "Chaudhary", "Rathod", "Solanki", "Vaghela", "Thakor", "Makwana", "Prajapati",
    "Rabari", "Nayak", "Gameti", "Damor", "Baria", "Naik", "Vasava", "Tadvi", "Koli", "Ahir",
    "Suthar", "Darji", "Lohar", "Bhoi", "Rohit", "Chamar", "Vankar", "Dhobi", "Senva", "Bariya",
    "Yadav", "Kumhar", "Badhai", "Bhanghi", "Chauhan",
]
OCCUPATIONS = [
    "farmer", "daily wage", "ASHA worker", "shopkeeper", "auto driver", "construction worker",
    "government employee", "teacher", "nurse", "weaver", "fisherman", "retired", "homemaker",
    "student", "private job", "businessman",
]
STREETS = [
    "Gandhi Nagar", "Nehru Road", "Patel Colony", "Ambedkar Nagar", "Kisan Nagar",
    "Station Road", "Market Area", "Ram Nagar", "Shiv Nagar", "Tribal Nagar",
]

INCOME_SCENARIOS = [
    ("DESTITUTE", 0, 50_000, 10),
    ("BPL", 50_001, 150_000, 25),
    ("LOWER", 150_001, 250_000, 20),
    ("LOWER_MID", 250_001, 400_000, 20),
    ("MIDDLE", 400_001, 700_000, 15),
    ("UPPER_MID", 700_001, 1_200_000, 7),
    ("HIGH", 1_200_001, 5_000_000, 3),
]

FAMILY_STRUCTURES = [(2, 10), (3, 15), (4, 25), (5, 25), (6, 15), (7, 7), (8, 3)]


@dataclass
class ScenarioQuotas:
    old_age_pension: int = 30_000
    widow_pension: int = 8_000
    fraud_overlap: int = 500
    income_cliff: int = 2_000
    birthday_18: int = 200
    bpl_ration: int = 55_000
    obc_scholarship: int = 20_000
    ineligible: int = 40_000

    old_age_done: int = 0
    widow_done: int = 0
    fraud_done: int = 0
    income_cliff_done: int = 0
    birthday_done: int = 0
    bpl_done: int = 0
    obc_done: int = 0
    ineligible_done: int = 0


@dataclass
class FamilyPlan:
    total_income: int
    caste: str
    num_members: int
    head_gender: str
    head_age: int
    elder_for_pension: bool = False
    widow_scenario: bool = False
    fraud_scenario: bool = False
    birthday_daughter: bool = False
    scholarship_child: bool = False
    force_ineligible: bool = False


def connect():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5433")),
        dbname=os.getenv("DB_NAME", "citizen_db"),
        user=os.getenv("DB_USER", "citizenuser"),
        password=os.getenv("DB_PASS", "egovpassword"),
    )


def inspect_schema(cur) -> set[tuple[str, str]]:
    cur.execute(
        """
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'family_registry'
          AND table_name IN ('family', 'person', 'family_member')
        ORDER BY table_name, ordinal_position
        """
    )
    schema = {(r[0], r[1]) for r in cur.fetchall()}
    required = {
        ("family", "id"), ("family", "village"), ("family", "taluka"), ("family", "district"),
        ("person", "id"), ("person", "name"), ("person", "dob"), ("person", "gender"),
        ("person", "aadhaar_ref"), ("person", "occupation"), ("person", "annual_income"),
        ("person", "caste_category"), ("person", "is_alive"),
        ("family_member", "family_id"), ("family_member", "person_id"),
        ("family_member", "relationship_to_head"),
    }
    missing = required - schema
    if missing:
        raise RuntimeError(f"Schema missing expected columns: {sorted(missing)}")
    return schema


def random_dob_age(min_age: int, max_age: int, today: date) -> date:
    age = random.randint(min_age, max_age)
    return today - timedelta(days=age * 365 + random.randint(0, 364))


def random_dob_year_range(start_year: int, end_year: int) -> date:
    return date(random.randint(start_year, end_year), random.randint(1, 12), random.randint(1, 28))


def gen_aadhaar(seq: int) -> str:
    return f"GEN-{seq:010d}"


def pick_relationship(member_index: int, head_age: int, head_gender: str):
    if member_index == 0:
        spouse_gender = "F" if head_gender == "M" else "M"
        return "SPOUSE", spouse_gender, (max(18, head_age - 8), min(75, head_age + 5))
    if member_index <= 2:
        child_gender = random.choice(["M", "F"])
        rel = "SON" if child_gender == "M" else "DAUGHTER"
        return rel, child_gender, (5, max(6, head_age - 18))
    if member_index == 3:
        parent_gender = random.choice(["M", "F"])
        rel = "FATHER" if parent_gender == "M" else "MOTHER"
        return rel, parent_gender, (head_age + 18, min(95, head_age + 45))
    sib_gender = random.choice(["M", "F"])
    return "OTHER", sib_gender, (max(10, head_age - 15), head_age + 10)


def occupation_for(age: int, rel: str) -> str:
    if age < 18 or rel in ("SON", "DAUGHTER"):
        return "student"
    if rel in ("MOTHER", "FATHER") and age >= 60:
        return random.choice(["retired", "homemaker", "farmer"])
    if rel == "HEAD" and random.random() < 0.15:
        return "homemaker"
    return random.choice(OCCUPATIONS)


def mobile_for(age: int, seq: int) -> str | None:
    if age < 18:
        return None
    return str(9800000000 + (seq % 900_000_000))


def plan_family(quotas: ScenarioQuotas, today: date) -> FamilyPlan:
    caste = random.choice(CASTES)
    scenario = random.choices(INCOME_SCENARIOS, weights=[s[3] for s in INCOME_SCENARIOS])[0]
    total_income = random.randint(scenario[1], scenario[2])
    num_members = random.choices([s[0] for s in FAMILY_STRUCTURES], weights=[s[1] for s in FAMILY_STRUCTURES])[0]
    head_gender = random.choice(["M", "F"])
    head_age = random.randint(28, 70)

    plan = FamilyPlan(total_income, caste, num_members, head_gender, head_age)

    if quotas.ineligible_done < quotas.ineligible:
        plan.force_ineligible = True
        plan.total_income = random.randint(520_000, 2_000_000) if caste == "GENERAL" else random.randint(550_000, 1_500_000)
        quotas.ineligible_done += 1
        return plan

    if quotas.fraud_done < quotas.fraud_overlap and caste == "OBC":
        plan.fraud_scenario = True
        plan.total_income = random.randint(80_000, 190_000)
        plan.elder_for_pension = True
        plan.caste = "OBC"
        quotas.fraud_done += 1
        return plan

    if quotas.widow_done < quotas.widow_pension and caste in ("NT", "SC", "ST"):
        plan.widow_scenario = True
        plan.head_gender = "F"
        plan.total_income = random.randint(20_000, 95_000)
        plan.caste = caste
        quotas.widow_done += 1
        return plan

    if quotas.birthday_done < quotas.birthday_18 and caste in ("ST", "OBC"):
        plan.birthday_daughter = True
        plan.total_income = min(plan.total_income, random.randint(60_000, 280_000))
        plan.caste = caste
        quotas.birthday_done += 1
        return plan

    if quotas.obc_done < quotas.obc_scholarship and caste == "OBC":
        plan.scholarship_child = True
        plan.total_income = min(plan.total_income, random.randint(80_000, 240_000))
        quotas.obc_done += 1
        return plan

    if quotas.bpl_done < quotas.bpl_ration:
        plan.total_income = random.randint(20_000, 145_000)
        quotas.bpl_done += 1
        return plan

    if quotas.old_age_done < quotas.old_age_pension and caste != "GENERAL":
        plan.elder_for_pension = True
        plan.total_income = min(plan.total_income, random.randint(30_000, 195_000))
        quotas.old_age_done += 1
        return plan

    if quotas.income_cliff_done < quotas.income_cliff:
        plan.total_income = random.randint(170_000, 199_000)
        plan.elder_for_pension = True
        quotas.income_cliff_done += 1

    return plan


def build_family_rows(plan: FamilyPlan, district: str, taluka: str, village: str, aadhaar_seq: int, today: date):
    family_id = str(uuid.uuid4())
    address = f"{random.randint(1, 200)} {random.choice(STREETS)}, {village}"
    surname = random.choice(SURNAMES)
    head_name = (
        random.choice(MALE_NAMES if plan.head_gender == "M" else FEMALE_NAMES) + " " + surname
    )

    if plan.widow_scenario:
        head_age = random.randint(35, 58)
    else:
        head_age = plan.head_age

    head_dob = random_dob_age(head_age, head_age, today)
    if plan.elder_for_pension or plan.fraud_scenario:
        head_dob = random_dob_year_range(1960, 1985)

    head_income = max(0, int(plan.total_income * random.uniform(0.35, 0.65)))
    remaining = max(0, plan.total_income - head_income)
    other_count = max(1, plan.num_members - 1)

    persons: list[dict] = []
    members: list[tuple] = []

    aadhaar_seq += 1
    head_id = str(uuid.uuid4())
    head_occ = occupation_for(head_age, "HEAD")
    persons.append({
        "id": head_id,
        "name": head_name,
        "dob": head_dob,
        "gender": plan.head_gender,
        "caste": plan.caste,
        "occupation": head_occ,
        "income": head_income,
        "alive": True,
        "aadhaar": gen_aadhaar(aadhaar_seq),
        "mobile": mobile_for(head_age, aadhaar_seq),
        "rel": "HEAD",
    })
    members.append((family_id, head_id, "HEAD"))

    spouse_dead = plan.widow_scenario
    elder_added = False
    birthday_added = False
    scholarship_added = False

    for j in range(plan.num_members - 1):
        rel, gender, age_range = pick_relationship(j, head_age, plan.head_gender)
        aadhaar_seq += 1
        person_id = str(uuid.uuid4())

        if j == 0 and spouse_dead:
            rel, gender = "SPOUSE", "M"
            age_range = (head_age - 3, head_age + 3)
            alive = False
        else:
            alive = random.random() > 0.03

        if plan.elder_for_pension and not elder_added and j >= max(0, plan.num_members - 3):
            rel = "FATHER" if gender == "M" else "MOTHER"
            gender = "M" if rel == "FATHER" else "F"
            age_range = (62, 78)
            elder_added = True
            alive = True

        if plan.birthday_daughter and not birthday_added and gender == "F" and rel in ("DAUGHTER", "OTHER"):
            dob = today - timedelta(days=18 * 365 + random.randint(-7, 7))
            age = 18
            birthday_added = True
        elif plan.scholarship_child and not scholarship_added and rel in ("SON", "DAUGHTER"):
            age = random.randint(15, 24)
            dob = random_dob_age(age, age, today)
            scholarship_added = True
        elif plan.fraud_scenario and not elder_added and j == plan.num_members - 2:
            rel = "MOTHER"
            gender = "F"
            dob = random_dob_year_range(1944, 1964)
            age = (today - dob).days // 365
            elder_added = True
            alive = True
        else:
            age = random.randint(*age_range)
            dob = random_dob_age(age, age, today)

        member_income = int(remaining / other_count) if other_count else 0
        occ = occupation_for(age, rel)
        if not alive or occ in ("student", "homemaker", "retired"):
            member_income = 0

        last = head_name.split()[-1]
        name = random.choice(MALE_NAMES if gender == "M" else FEMALE_NAMES) + " " + last

        persons.append({
            "id": person_id,
            "name": name,
            "dob": dob,
            "gender": gender,
            "caste": plan.caste,
            "occupation": occ,
            "income": member_income,
            "alive": alive,
            "aadhaar": gen_aadhaar(aadhaar_seq),
            "mobile": mobile_for(age, aadhaar_seq),
            "rel": rel,
        })
        members.append((family_id, person_id, rel))

    # Reconcile income sum
    actual = sum(p["income"] for p in persons)
    if actual != plan.total_income and persons:
        delta = plan.total_income - actual
        persons[0]["income"] = max(0, persons[0]["income"] + delta)

    family_row = (family_id, address, village, taluka, district)
    return family_row, persons, members, aadhaar_seq


def flush(cur, conn, families, persons, members):
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO family_registry.family (id, address, village, taluka, district, state)
        VALUES (%s, %s, %s, %s, %s, 'Gujarat')
        ON CONFLICT (id) DO NOTHING
        """,
        families,
        page_size=1000,
    )
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO family_registry.person
          (id, name, dob, gender, aadhaar_ref, occupation, annual_income, caste_category, is_alive, mobile)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (aadhaar_ref) DO NOTHING
        """,
        [
            (
                p["id"], p["name"], p["dob"], p["gender"], p["aadhaar"], p["occupation"],
                p["income"], p["caste"], p["alive"], p["mobile"],
            )
            for p in persons
        ],
        page_size=1000,
    )
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO family_registry.family_member (family_id, person_id, relationship_to_head)
        VALUES (%s, %s, %s)
        ON CONFLICT DO NOTHING
        """,
        members,
        page_size=1000,
    )
    conn.commit()


def apply_special_scenarios(cur, conn, today: date):
    print("Applying special scenarios (post-processing)...")

    cur.execute(
        """
        UPDATE family_registry.person p
        SET dob = '1915-06-15'
        FROM family_registry.family_member fm
        WHERE p.id = fm.person_id
          AND fm.relationship_to_head = 'FATHER'
          AND p.aadhaar_ref LIKE 'GEN-%'
          AND p.id IN (
            SELECT p2.id FROM family_registry.person p2
            JOIN family_registry.family_member fm2 ON p2.id = fm2.person_id
            WHERE p2.aadhaar_ref LIKE 'GEN-%' AND fm2.relationship_to_head = 'FATHER'
            ORDER BY RANDOM() LIMIT 50
          )
        """
    )

    birthday_18 = today - timedelta(days=18 * 365)
    cur.execute(
        """
        UPDATE family_registry.person p
        SET dob = %s, gender = 'F'
        FROM family_registry.family_member fm
        WHERE p.id = fm.person_id
          AND fm.relationship_to_head IN ('DAUGHTER', 'OTHER')
          AND p.aadhaar_ref LIKE 'GEN-%%'
          AND p.gender = 'F'
          AND p.id IN (
            SELECT p2.id FROM family_registry.person p2
            JOIN family_registry.family_member fm2 ON p2.id = fm2.person_id
            WHERE p2.aadhaar_ref LIKE 'GEN-%%'
              AND fm2.relationship_to_head IN ('DAUGHTER', 'OTHER')
              AND p2.gender = 'F'
            ORDER BY RANDOM() LIMIT 200
          )
        """,
        (birthday_18,),
    )

    # Income cliff: adjust head person income (family has no total_annual_income column)
    cur.execute(
        """
        WITH target_families AS (
          SELECT f.id AS family_id
          FROM family_registry.family f
          WHERE NOT EXISTS (
            SELECT 1 FROM family_registry.family_member fm
            JOIN family_registry.person p ON p.id = fm.person_id
            WHERE fm.family_id = f.id AND p.aadhaar_ref LIKE 'XXXX-%'
          )
          ORDER BY RANDOM()
          LIMIT 2000
        ),
        heads AS (
          SELECT fm.family_id, fm.person_id
          FROM family_registry.family_member fm
          JOIN target_families tf ON tf.family_id = fm.family_id
          WHERE fm.relationship_to_head = 'HEAD'
        )
        UPDATE family_registry.person p
        SET annual_income = 185000 + (RANDOM() * 14000)::int
        FROM heads h
        WHERE p.id = h.person_id
        """
    )
    cur.execute(
        """
        UPDATE family_registry.person p
        SET annual_income = 0
        FROM family_registry.family_member fm
        WHERE p.id = fm.person_id
          AND fm.relationship_to_head <> 'HEAD'
          AND p.aadhaar_ref LIKE 'GEN-%'
          AND fm.family_id IN (
            SELECT fm2.family_id FROM family_registry.family_member fm2
            JOIN family_registry.person hp ON hp.id = fm2.person_id
            WHERE fm2.relationship_to_head = 'HEAD'
              AND hp.annual_income BETWEEN 170000 AND 199000
              AND hp.aadhaar_ref LIKE 'GEN-%'
            LIMIT 2000
          )
        """
    )

    conn.commit()
    print("Special scenarios applied.")


def main():
    random.seed(int(os.getenv("SEED", "42")))
    today = date.today()

    conn = connect()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM family_registry.family")
    existing = cur.fetchone()[0]
    if existing > 150_000:
        print(f"Dataset already large enough ({existing:,} families). Exiting.")
        sys.exit(0)

    print(f"Existing: {existing:,} families. Generating {TARGET_FAMILIES:,} more...")
    schema = inspect_schema(cur)
    print(f"Schema OK ({len(schema)} columns across family/person/family_member).")

    quotas = ScenarioQuotas()
    aadhaar_seq = 100_000
    total_persons = 0

    family_batch: list[tuple] = []
    person_batch: list[dict] = []
    member_batch: list[tuple] = []

    for i in range(TARGET_FAMILIES):
        district_entry = random.choices(DISTRICTS, weights=[d[1] for d in DISTRICTS])[0]
        district = district_entry[0]
        taluka = random.choice(district_entry[2])
        village = f"{taluka} Village {random.randint(1, 50)}"

        plan = plan_family(quotas, today)
        family_row, persons, members, aadhaar_seq = build_family_rows(
            plan, district, taluka, village, aadhaar_seq, today
        )

        family_batch.append(family_row)
        person_batch.extend(persons)
        member_batch.extend(members)
        total_persons += len(persons)

        if len(family_batch) >= BATCH_SIZE:
            flush(cur, conn, family_batch, person_batch, member_batch)
            if (i + 1) % PROGRESS_EVERY == 0 or i + 1 == TARGET_FAMILIES:
                print(
                    f"  Inserted up to family {i + 1:,}/{TARGET_FAMILIES:,} "
                    f"— total persons so far: {total_persons:,}"
                )
            family_batch.clear()
            person_batch.clear()
            member_batch.clear()

    if family_batch:
        flush(cur, conn, family_batch, person_batch, member_batch)
        print(f"  Final batch — total persons: {total_persons:,}")

    apply_special_scenarios(cur, conn, today)

    cur.execute("SELECT COUNT(*) FROM family_registry.family")
    final_families = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM family_registry.person")
    final_persons = cur.fetchone()[0]

    cur.close()
    conn.close()

    print(f"Done. family_registry.family = {final_families:,}, person = {final_persons:,}")
    print("Next: POST /v1/admin/run-identification to identify beneficiaries.")


if __name__ == "__main__":
    main()
