#!/usr/bin/env python3
"""Generate family_registry seed SQL: 5 hero families + 995 random families."""

from __future__ import annotations

import random
import sys
import uuid
from datetime import date, timedelta

random.seed(42)

GEOGRAPHY = [
    ("Ahmedabad", "Dholka", ["Bavla", "Dholka", "Bagodara", "Dhandhuka"]),
    ("Ahmedabad", "Sanand", ["Sanand", "Bol", "Itola", "Chandrala"]),
    ("Ahmedabad", "Viramgam", ["Viramgam", "Kanpur", "Charada"]),
    ("Surat", "Katargam", ["Katargam", "Sarthana", "Kosad"]),
    ("Surat", "Choryasi", ["Bhatha", "Utran", "Sachin"]),
    ("Surat", "Olpad", ["Olpad", "Limbachha", "Hansot"]),
    ("Vadodara", "Waghodia", ["Waghodia", "Padra", "Savli"]),
    ("Vadodara", "Dabhoi", ["Dabhoi", "Sinor", "Bodeli"]),
    ("Rajkot", "Rajkot", ["Rajkot City", "Gondal", "Jetpur"]),
    ("Rajkot", "Morbi", ["Morbi", "Tankara", "Wankaner"]),
    ("Banaskantha", "Deesa", ["Deesa", "Dhanera", "Palanpur"]),
    ("Banaskantha", "Palanpur", ["Palanpur", "Radhanpur", "Kankrej"]),
    ("Kutch", "Bhuj", ["Bhuj", "Mandvi", "Anjar"]),
    ("Kutch", "Gandhidham", ["Gandhidham", "Adipur", "Mundra"]),
    ("Patan", "Patan", ["Patan", "Sidhpur", "Harij"]),
    ("Anand", "Anand", ["Anand", "Vallabh Vidyanagar", "Khambhat"]),
    ("Mehsana", "Mehsana", ["Mehsana", "Visnagar", "Unjha"]),
    ("Junagadh", "Junagadh", ["Junagadh", "Veraval", "Keshod"]),
]

CASTE_WEIGHTS = [
    ("SC", 0.20),
    ("ST", 0.15),
    ("OBC", 0.40),
    ("NT", 0.10),
    ("GENERAL", 0.15),
]

NAMES = {
    "SC": {
        "M": ["Ramesh", "Mahesh", "Suresh", "Dinesh", "Naresh", "Bharat", "Kamlesh", "Haresh", "Yogesh", "Rakesh"],
        "F": ["Ramilaben", "Savitaben", "Hansaben", "Kantaben", "Manjula", "Lata", "Geeta", "Pushpa", "Usha", "Rekha"],
        "last": ["Parmar", "Chamar", "Makwana", "Vankar", "Bhangi", "Rohit", "Bhambhi", "Rathod", "Makvana", "Vaghela"],
    },
    "ST": {
        "M": ["Manubhai", "Bhikabhai", "Ravjibhai", "Jethabhai", "Natubhai", "Somabhai", "Valabhai", "Devjibhai"],
        "F": ["Savitaben", "Ratanben", "Dhanliben", "Kesharben", "Maniben", "Bhavnaben", "Taraben", "Champaben"],
        "last": ["Gamit", "Vasava", "Rathwa", "Chaudhary", "Tadvi", "Baria", "Patel", "Dungri", "Nayka", "Khant"],
    },
    "OBC": {
        "M": ["Ramesh", "Pankaj", "Nilesh", "Jitendra", "Bhavesh", "Vimal", "Rajesh", "Umesh", "Paresh", "Hitesh"],
        "F": ["Priya", "Hetal", "Kinjal", "Riddhi", "Nisha", "Bharti", "Minal", "Archana", "Sejal", "Komal"],
        "last": ["Patel", "Koli", "Thakor", "Suthar", "Darji", "Soni", "Prajapati", "Luhar", "Mali", "Kadva"],
    },
    "NT": {
        "M": ["Raju", "Bhura", "Kana", "Mena", "Deva", "Bhura", "Vala", "Rupa", "Jetha", "Mohan"],
        "F": ["Kavita", "Jamna", "Rupa", "Deva", "Mena", "Bhura", "Hansa", "Vimla", "Kamla", "Sona"],
        "last": ["Rathod", "Banjara", "Vaghri", "Nayak", "Dhangar", "Garodi", "Sansi", "Bavri", "Dhed", "Tadi"],
    },
    "GENERAL": {
        "M": ["Ahmed", "Faruk", "Ismail", "Salim", "Amir", "Rajan", "Sanjay", "Amit", "Rahul", "Vijay"],
        "F": ["Fatima", "Ayesha", "Zara", "Ruhi", "Anita", "Sunita", "Rekha", "Pooja", "Neha", "Divya"],
        "last": ["Shaikh", "Pathan", "Desai", "Shah", "Mehta", "Trivedi", "Joshi", "Modi", "Bhatt", "Pandya"],
    },
}

OCCUPATION_INCOME = {
    "farmer": (60_000, 180_000),
    "daily wage": (40_000, 120_000),
    "teacher": (240_000, 480_000),
    "government employee": (360_000, 600_000),
    "shopkeeper": (120_000, 360_000),
    "auto driver": (90_000, 180_000),
    "ASHA worker": (48_000, 84_000),
    "weaver": (60_000, 120_000),
    "private job": (180_000, 420_000),
    "businessman": (480_000, 1_200_000),
    "homemaker": (0, 0),
    "student": (0, 0),
    "retired": (0, 0),
}

WORKING_OCCUPATIONS = [
    "farmer", "daily wage", "teacher", "government employee", "shopkeeper",
    "auto driver", "ASHA worker", "weaver", "private job", "businessman",
]

STREETS = [
    "Gandhi Nagar", "Nehru Road", "Patel Colony", "Ambedkar Nagar", "Tribal Nagar",
    "Kisan Nagar", "Station Road", "Market Area", "Old Town", "New Colony",
    "Ram Nagar", "Shiv Nagar",
]

STRUCTURES = [
    ("nuclear_small", 0.30, lambda: (1, random.randint(1, 2), False, False)),
    ("nuclear_large", 0.20, lambda: (1, random.randint(3, 4), False, False)),
    ("joint_3gen", 0.25, lambda: (1, random.randint(1, 2), True, False)),
    ("single_parent", 0.10, lambda: (0, random.randint(2, 3), False, False)),
    ("extended", 0.15, lambda: (1, random.randint(2, 3), True, True)),
]


def esc(value: str) -> str:
    return value.replace("'", "''")


def sql_str(value: str | None) -> str:
    if value is None:
        return "NULL"
    return f"'{esc(value)}'"


def sql_bool(value: bool) -> str:
    return "true" if value else "false"


def sql_date(d: date) -> str:
    return f"'{d.isoformat()}'"


def hero_person_id(prefix: int, seq: int) -> str:
    return f"{prefix:08d}-0000-0000-0000-{seq:012d}"


def pick_caste() -> str:
    r = random.random()
    cumulative = 0.0
    for caste, weight in CASTE_WEIGHTS:
        cumulative += weight
        if r <= cumulative:
            return caste
    return "OBC"


def random_name(caste: str, gender: str) -> str:
    pool = NAMES[caste]
    first = random.choice(pool[gender])
    last = random.choice(pool["last"])
    return f"{first} {last}"


def income_for(occupation: str) -> int:
    low, high = OCCUPATION_INCOME[occupation]
    if low == high == 0:
        return 0
    return random.randint(low, high)


def age_from_dob(dob: date) -> int:
    today = date(2026, 6, 21)
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def dob_from_age(age: int) -> date:
    return date(2026 - age, random.randint(1, 12), random.randint(1, 28))


def mobile_for(dob: date, occupation: str, seq: int) -> str | None:
    if occupation == "student" or age_from_dob(dob) < 18:
        return None
    return str(9876540000 + seq)


def write_family(out, family_id: str, address: str, village: str, taluka: str, district: str):
    out.write(
        "INSERT INTO family (id, address, village, taluka, district, state) VALUES "
        f"('{family_id}', {sql_str(address)}, {sql_str(village)}, {sql_str(taluka)}, "
        f"{sql_str(district)}, 'Gujarat');\n"
    )


def write_person(
    out,
    person_id: str,
    name: str,
    dob: date,
    gender: str,
    aadhaar: str,
    occupation: str,
    income: int,
    caste: str,
    is_alive: bool,
    mobile: str | None,
):
    out.write(
        "INSERT INTO person (id, name, dob, gender, aadhaar_ref, occupation, "
        "annual_income, caste_category, is_alive, mobile) VALUES "
        f"('{person_id}', {sql_str(name)}, {sql_date(dob)}, {sql_str(gender)}, "
        f"{sql_str(aadhaar)}, {sql_str(occupation)}, {income}, {sql_str(caste)}, "
        f"{sql_bool(is_alive)}, {sql_str(mobile)});\n"
    )


def write_member(out, family_id: str, person_id: str, relationship: str):
    out.write(
        "INSERT INTO family_member (family_id, person_id, relationship_to_head) VALUES "
        f"('{family_id}', '{person_id}', {sql_str(relationship)});\n"
    )


def emit_family_batch(out, family_row, persons, members):
    write_family(out, *family_row)
    for person in persons:
        write_person(out, *person)
    for member in members:
        write_member(out, *member)


def hero_families():
    batches = []

    # Hero 1 — Priya Patel
    fid = "a1000000-0000-0000-0000-000000000001"
    family = (fid, "12 Gandhi Nagar, Bavla", "Bavla", "Dholka", "Ahmedabad")
    persons = [
        (hero_person_id(10000001, 1), "Priya Patel", date(1985, 3, 15), "F", "XXXX-XXXX-1001", "farmer", 95000, "OBC", True, "9876541001"),
        (hero_person_id(10000002, 1), "Ramesh Patel", date(1982, 7, 20), "M", "XXXX-XXXX-1002", "daily wage", 45000, "OBC", True, "9876541002"),
        (hero_person_id(10000003, 1), "Arjun Patel", date(2008, 1, 10), "M", "XXXX-XXXX-1003", "student", 0, "OBC", True, None),
        (hero_person_id(10000004, 1), "Ananya Patel", date(2012, 5, 22), "F", "XXXX-XXXX-1004", "student", 0, "OBC", True, None),
        (hero_person_id(10000005, 1), "Kantaben Patel", date(1955, 11, 3), "F", "XXXX-XXXX-1005", "homemaker", 0, "OBC", True, "9876541005"),
    ]
    members = [
        (fid, hero_person_id(10000001, 1), "HEAD"),
        (fid, hero_person_id(10000002, 1), "SPOUSE"),
        (fid, hero_person_id(10000003, 1), "SON"),
        (fid, hero_person_id(10000004, 1), "DAUGHTER"),
        (fid, hero_person_id(10000005, 1), "MOTHER"),
    ]
    batches.append((family, persons, members))

    # Hero 2 — Rajan Nair
    fid = "a2000000-0000-0000-0000-000000000002"
    family = (fid, "45 Udhna Darwaja, Katargam", "Katargam", "Katargam", "Surat")
    persons = [
        (hero_person_id(20000001, 1), "Rajan Nair", date(1978, 9, 12), "M", "XXXX-XXXX-2001", "shopkeeper", 180000, "SC", True, "9876542001"),
        (hero_person_id(20000002, 1), "Suma Nair", date(1980, 4, 18), "F", "XXXX-XXXX-2002", "ASHA worker", 60000, "SC", True, "9876542002"),
        (hero_person_id(20000003, 1), "Vikram Nair", date(2005, 8, 30), "M", "XXXX-XXXX-2003", "student", 0, "SC", True, None),
        (hero_person_id(20000004, 1), "Gopal Nair", date(1948, 2, 14), "M", "XXXX-XXXX-2004", "retired", 0, "SC", False, "9876542004"),
    ]
    members = [
        (fid, hero_person_id(20000001, 1), "HEAD"),
        (fid, hero_person_id(20000002, 1), "SPOUSE"),
        (fid, hero_person_id(20000003, 1), "SON"),
        (fid, hero_person_id(20000004, 1), "FATHER"),
    ]
    batches.append((family, persons, members))

    # Hero 3 — Meera Solanki
    fid = "a3000000-0000-0000-0000-000000000003"
    family = (fid, "7 Tribal Nagar, Waghodia", "Waghodia", "Waghodia", "Vadodara")
    persons = [
        (hero_person_id(30000001, 1), "Meera Solanki", date(1975, 6, 8), "F", "XXXX-XXXX-3001", "teacher", 320000, "ST", True, "9876543001"),
        (hero_person_id(30000002, 1), "Dinesh Solanki", date(1972, 12, 25), "M", "XXXX-XXXX-3002", "government employee", 480000, "ST", True, "9876543002"),
        (hero_person_id(30000003, 1), "Pooja Solanki", date(2000, 3, 14), "F", "XXXX-XXXX-3003", "student", 0, "ST", True, "9876543003"),
        (hero_person_id(30000004, 1), "Rohit Solanki", date(2003, 7, 19), "M", "XXXX-XXXX-3004", "student", 0, "ST", True, None),
        (hero_person_id(30000005, 1), "Bhikabhai Solanki", date(1942, 1, 30), "M", "XXXX-XXXX-3005", "retired", 0, "ST", True, "9876543005"),
        (hero_person_id(30000006, 1), "Savitaben Solanki", date(1945, 8, 11), "F", "XXXX-XXXX-3006", "homemaker", 0, "ST", True, "9876543006"),
    ]
    members = [
        (fid, hero_person_id(30000001, 1), "HEAD"),
        (fid, hero_person_id(30000002, 1), "SPOUSE"),
        (fid, hero_person_id(30000003, 1), "DAUGHTER"),
        (fid, hero_person_id(30000004, 1), "SON"),
        (fid, hero_person_id(30000005, 1), "FATHER"),
        (fid, hero_person_id(30000006, 1), "MOTHER"),
    ]
    batches.append((family, persons, members))

    # Hero 4 — Ahmed Shaikh
    fid = "a4000000-0000-0000-0000-000000000004"
    family = (fid, "23 Jubilee Garden, Rajkot", "Rajkot City", "Rajkot", "Rajkot")
    persons = [
        (hero_person_id(40000001, 1), "Ahmed Shaikh", date(1970, 11, 5), "M", "XXXX-XXXX-4001", "businessman", 850000, "GENERAL", True, "9876544001"),
        (hero_person_id(40000002, 1), "Fatima Shaikh", date(1974, 3, 22), "F", "XXXX-XXXX-4002", "homemaker", 0, "GENERAL", True, "9876544002"),
        (hero_person_id(40000003, 1), "Zara Shaikh", date(1998, 9, 10), "F", "XXXX-XXXX-4003", "private job", 240000, "GENERAL", True, "9876544003"),
        (hero_person_id(40000004, 1), "Imran Shaikh", date(2001, 12, 15), "M", "XXXX-XXXX-4004", "student", 0, "GENERAL", True, None),
    ]
    members = [
        (fid, hero_person_id(40000001, 1), "HEAD"),
        (fid, hero_person_id(40000002, 1), "SPOUSE"),
        (fid, hero_person_id(40000003, 1), "DAUGHTER"),
        (fid, hero_person_id(40000004, 1), "SON"),
    ]
    batches.append((family, persons, members))

    # Hero 5 — Kavita Rathod
    fid = "a5000000-0000-0000-0000-000000000005"
    family = (fid, "3 Patel Faliya, Deesa", "Deesa", "Deesa", "Banaskantha")
    persons = [
        (hero_person_id(50000001, 1), "Kavita Rathod", date(1980, 8, 17), "F", "XXXX-XXXX-5001", "daily wage", 72000, "NT", True, "9876545001"),
        (hero_person_id(50000002, 1), "Suresh Rathod", date(1977, 5, 30), "M", "XXXX-XXXX-5002", "daily wage", 0, "NT", False, "9876545002"),
        (hero_person_id(50000003, 1), "Kiran Rathod", date(2006, 2, 14), "M", "XXXX-XXXX-5003", "student", 0, "NT", True, None),
        (hero_person_id(50000004, 1), "Lata Rathod", date(2009, 11, 8), "F", "XXXX-XXXX-5004", "student", 0, "NT", True, None),
    ]
    members = [
        (fid, hero_person_id(50000001, 1), "HEAD"),
        (fid, hero_person_id(50000002, 1), "SPOUSE"),
        (fid, hero_person_id(50000003, 1), "SON"),
        (fid, hero_person_id(50000004, 1), "DAUGHTER"),
    ]
    batches.append((family, persons, members))

    return batches


def pick_structure():
    r = random.random()
    cumulative = 0.0
    for _, weight, fn in STRUCTURES:
        cumulative += weight
        if r <= cumulative:
            return fn()
    return STRUCTURES[0][2]()


def generate_random_family(aadhaar_seq: int, mobile_seq: int):
    caste = pick_caste()
    district, taluka, villages = random.choice(GEOGRAPHY)
    village = random.choice(villages)
    address = f"{random.randint(1, 200)} {random.choice(STREETS)}, {village}"

    family_id = str(uuid.uuid4())
    family_row = (family_id, address, village, taluka, district)

    has_spouse, child_count, has_father, has_mother = pick_structure()
    head_female = random.random() < 0.30
    head_gender = "F" if head_female else "M"
    head_age = random.randint(30, 55)
    head_dob = dob_from_age(head_age)
    head_name = random_name(caste, head_gender)
    head_occ = random.choice(WORKING_OCCUPATIONS)
    head_income = income_for(head_occ)

    persons = []
    members = []

    head_id = str(uuid.uuid4())
    aadhaar = f"XXXX-XXXX-{aadhaar_seq:04d}"
    aadhaar_seq += 1
    mobile = mobile_for(head_dob, head_occ, mobile_seq)
    if mobile:
        mobile_seq += 1
    persons.append((head_id, head_name, head_dob, head_gender, aadhaar, head_occ, head_income, caste, True, mobile))
    members.append((family_id, head_id, "HEAD"))

    if has_spouse:
        spouse_gender = "F" if head_gender == "M" else "M"
        spouse_age = head_age + random.randint(-5, 5)
        spouse_dob = dob_from_age(max(spouse_age, 22))
        spouse_name = random_name(caste, spouse_gender)
        spouse_occ = random.choice(WORKING_OCCUPATIONS + ["homemaker"])
        spouse_income = income_for(spouse_occ)
        spouse_alive = True
        if head_female:
            spouse_alive = False
            spouse_occ = "daily wage"
            spouse_income = 0
        spouse_id = str(uuid.uuid4())
        aadhaar = f"XXXX-XXXX-{aadhaar_seq:04d}"
        aadhaar_seq += 1
        mobile = mobile_for(spouse_dob, spouse_occ, mobile_seq) if spouse_alive else None
        if mobile:
            mobile_seq += 1
        persons.append((spouse_id, spouse_name, spouse_dob, spouse_gender, aadhaar, spouse_occ, spouse_income, caste, spouse_alive, mobile))
        members.append((family_id, spouse_id, "SPOUSE"))

    eldest_child_age = max(5, head_age - random.randint(15, 20))
    for i in range(child_count):
        child_age = max(3, eldest_child_age - i * random.randint(2, 4))
        child_dob = dob_from_age(child_age)
        child_gender = random.choice(["M", "F"])
        child_name = random_name(caste, child_gender)
        child_occ = "student" if child_age < 22 else random.choice(WORKING_OCCUPATIONS)
        child_income = income_for(child_occ)
        child_id = str(uuid.uuid4())
        aadhaar = f"XXXX-XXXX-{aadhaar_seq:04d}"
        aadhaar_seq += 1
        mobile = mobile_for(child_dob, child_occ, mobile_seq)
        if mobile:
            mobile_seq += 1
        rel = "SON" if child_gender == "M" else "DAUGHTER"
        persons.append((child_id, child_name, child_dob, child_gender, aadhaar, child_occ, child_income, caste, True, mobile))
        members.append((family_id, child_id, rel))

    if has_father:
        father_age = head_age + random.randint(25, 35)
        father_dob = dob_from_age(father_age)
        father_id = str(uuid.uuid4())
        aadhaar = f"XXXX-XXXX-{aadhaar_seq:04d}"
        aadhaar_seq += 1
        mobile = mobile_for(father_dob, "retired", mobile_seq)
        if mobile:
            mobile_seq += 1
        father_name = random_name(caste, "M")
        persons.append((father_id, father_name, father_dob, "M", aadhaar, "retired", 0, caste, True, mobile))
        members.append((family_id, father_id, "FATHER"))

    if has_mother:
        mother_age = head_age + random.randint(25, 35)
        mother_dob = dob_from_age(mother_age)
        mother_id = str(uuid.uuid4())
        aadhaar = f"XXXX-XXXX-{aadhaar_seq:04d}"
        aadhaar_seq += 1
        mobile = mobile_for(mother_dob, "homemaker", mobile_seq)
        if mobile:
            mobile_seq += 1
        mother_name = random_name(caste, "F")
        persons.append((mother_id, mother_name, mother_dob, "F", aadhaar, "homemaker", 0, caste, True, mobile))
        members.append((family_id, mother_id, "MOTHER"))

    return (family_row, persons, members), aadhaar_seq, mobile_seq


def main():
    out = sys.stdout
    out.write("SET search_path TO family_registry;\n")
    out.write("TRUNCATE family_member, person, family RESTART IDENTITY CASCADE;\n\n")

    out.write("-- Hero families\n")
    for batch in hero_families():
        emit_family_batch(out, *batch)
        out.write("\n")

    out.write("-- Random families\n")
    aadhaar_seq = 6000
    mobile_seq = 6000
    for _ in range(995):
        batch, aadhaar_seq, mobile_seq = generate_random_family(aadhaar_seq, mobile_seq)
        emit_family_batch(out, *batch)

    print("-- Generated 1000 families (5 hero + 995 random)", file=sys.stderr)


if __name__ == "__main__":
    main()
