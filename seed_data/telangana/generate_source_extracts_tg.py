#!/usr/bin/env python3
"""Synthetic department extracts for the Telangana MDM / data-exchange demo.

Takes the invented family registry (same generator, same seed, so the person ids match the database) and
re-creates the same people as nine separate "department systems", each with its own format, coverage and
realistic dirt: spelling / transliteration variants, Telugu-script names, date-of-birth slips, address
variants, stale rows, expired certificates, shared ration cards, late / duplicate / out-of-order events.

    python3 seed_data/telangana/generate_source_extracts_tg.py --out /tmp/tg_sources [--count 1000 --seed 42 --dirt 1.0]

Outputs (one folder, all invented data):
    identity_reference.csv   REST identity service: reference token + limited attributes
    crs_events.jsonl         civil registration event feed (births, deaths, amendments, withdrawals)
    revenue_certificates.csv income / caste certificates (with validity)       revenue_land.csv  land holdings
    pds_view.csv             read-only legacy ration-card views (age, not date of birth)
    pension_batch.csv        daily batch file, as of the previous night (up to 24h old)
    electricity.csv          legacy SOAP service: connection holder (not the household)
    student_portal.csv       web portal only (operator-keyed in the demo)
    housing.jsonl            housing benefits and applications
    marriage_register.csv    partial coverage by design
    truth_links.csv          ANSWER KEY: source, source_record_id -> person_id / family_id
    scenario_cases.csv       planted cases mapped to the plan's scenario ids (1.3, 1.4, 2.5, ...)
    live_events.jsonl        scripted events to inject during the session (UC2, UC3, UC6)
    SUMMARY.txt              counts and dirt statistics

Everything is approximate and for demonstration only. Telugu-script names are rough transliterations.
"""
from __future__ import annotations
import argparse, csv, hashlib, json, random, re, sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_families_tg as G  # noqa: E402

TODAY = G.TODAY                      # 2026-06-21, same "today" as the registry
EXTRACT_AS_OF = "2026-06-20T23:00:00+05:30"   # batch files are produced the night before
LEGAL_MIN_AGE = 18                   # configuration default for UC6, to be confirmed


# ----------------------------------------------------------------------------- Telugu script (approximate)
_CONS = {"kh": "ఖ", "gh": "ఘ", "chh": "ఛ", "ch": "చ", "jh": "ఝ", "th": "త", "dh": "ధ", "ph": "ఫ", "bh": "భ", "sh": "శ",
         "k": "క", "g": "గ", "j": "జ", "t": "ట", "d": "డ", "n": "న", "p": "ప", "b": "బ", "m": "మ", "y": "య", "r": "ర",
         "l": "ల", "v": "వ", "w": "వ", "s": "స", "h": "హ", "f": "ఫ", "z": "జ", "q": "క", "c": "క", "x": "క్స"}
# names favour dental t/d in Telugu spelling (Venkat, Ramulu): ట/డ only for a doubled letter
_DENTAL = {"t": "త", "d": "ద"}
_VOW = {"aa": ("ఆ", "ా"), "ee": ("ఈ", "ీ"), "oo": ("ఊ", "ూ"), "ai": ("ఐ", "ై"), "au": ("ఔ", "ౌ"), "ou": ("ఔ", "ౌ"),
        "a": ("అ", ""), "i": ("ఇ", "ి"), "u": ("ఉ", "ు"), "e": ("ఎ", "ె"), "o": ("ఒ", "ొ")}
_VIRAMA = "్"


def _tok(s: str):
    i, out = 0, []
    while i < len(s):
        for ln in (3, 2, 1):
            part = s[i:i + ln]
            if ln == 3 and part in ("chh",):
                out.append(("c", part)); i += ln; break
            if ln == 2 and (part in _VOW):
                out.append(("v", part)); i += ln; break
            if ln == 2 and part in _CONS:
                out.append(("c", part)); i += ln; break
            if ln == 1 and part in _VOW:
                out.append(("v", part)); i += ln; break
            if ln == 1 and part in _CONS:
                out.append(("c", part)); i += ln; break
        else:
            i += 1
            continue
    return out


def _cons_char(c: str, doubled: bool) -> str:
    if c in _DENTAL and doubled:
        return {"t": "ట", "d": "డ"}[c]
    return _DENTAL.get(c) or _CONS[c]


def _is_double(cluster, k) -> bool:
    return (k > 0 and cluster[k - 1] == cluster[k]) or (k + 1 < len(cluster) and cluster[k + 1] == cluster[k])


def telugu_word(w: str) -> str:
    toks, out, i = _tok(w.lower()), [], 0
    while i < len(toks):
        kind, val = toks[i]
        if kind == "v":
            out.append(_VOW[val][0]); i += 1; continue
        cluster = []
        while i < len(toks) and toks[i][0] == "c":
            cluster.append(toks[i][1]); i += 1
        vowel = toks[i][1] if i < len(toks) else None
        if vowel is not None:
            i += 1
        parts = []
        for k, c in enumerate(cluster):
            nxt = cluster[k + 1] if k + 1 < len(cluster) else None
            if c == "n" and nxt in ("k", "g", "j", "t", "d", "ch", "s") and k + 1 < len(cluster):
                parts.append("ం"); continue          # Venkat -> వెంకట్ (anusvara before a consonant)
            parts.append(_cons_char(c, _is_double(cluster, k)))
        # build the cluster with virama between consonants, skipping doubled-letter duplicates handled below
        s_out, prev = "", None
        for k, c in enumerate(cluster):
            if parts[k] == "ం":
                s_out += "ం"; prev = None; continue
            ch = parts[k]
            if prev is not None:
                s_out += _VIRAMA
            s_out += ch
            prev = ch
        if vowel is None:
            if w.lower().endswith("y") and cluster and cluster[-1] == "y" and len(cluster) > 1:
                s_out = s_out[:-1 - len(_VIRAMA)] + "ి" if s_out.endswith("య") else s_out   # Reddy -> రెడ్డి
            else:
                s_out += _VIRAMA                       # word-final consonant: Goud -> గౌడ్
        else:
            s_out += _VOW[vowel][1]
        out.append(s_out)
    return "".join(out)


# common names written the way they are normally spelt in Telugu; the rule-based path handles the rest (approximately)
_TE_SPECIAL = {
    "rao": "రావు", "raju": "రాజు", "naidu": "నాయుడు", "goud": "గౌడ్", "reddy": "రెడ్డి", "yadav": "యాదవ్", "sharma": "శర్మ",
    "khan": "ఖాన్", "shaikh": "షేక్", "syed": "సయ్యద్", "mohammed": "మహమ్మద్", "abdul": "అబ్దుల్", "srinivas": "శ్రీనివాస్",
    "venkat": "వెంకట్", "lakshmi": "లక్ష్మి", "ramesh": "రమేష్", "suresh": "సురేష్", "ravi": "రవి", "padmavathi": "పద్మావతి",
    "rajender": "రాజేందర్", "ravinder": "రవీందర్", "yellamma": "ఎల్లమ్మ", "yellavva": "ఎల్లవ్వ", "erukala": "ఎరుకల",
    "madavi": "మడావి", "pagidipalli": "పగిడిపల్లి", "naik": "నాయక్", "meera": "మీరా", "ahmed": "అహ్మద్", "fatima": "ఫాతిమా",
    "imran": "ఇమ్రాన్", "zara": "జారా", "savitha": "సవిత", "bhimrao": "భీమ్‌రావ్", "pooja": "పూజ", "rohit": "రోహిత్",
    "arjun": "అర్జున్", "ananya": "అనన్య", "vikram": "విక్రమ్", "suma": "సుమ", "gopal": "గోపాల్", "kiran": "కిరణ్",
    "lata": "లత", "dinesh": "దినేష్", "praveen": "ప్రవీణ్", "naresh": "నరేష్", "mahesh": "మహేష్", "anil": "అనిల్",
    "swathi": "స్వాతి", "radhika": "రాధిక", "sridevi": "శ్రీదేవి", "kavitha": "కవిత", "anitha": "అనిత", "padma": "పద్మ",
    "ramulu": "రాములు", "yadaiah": "యాదయ్య", "narsimha": "నరసింహ", "anjaiah": "ఆంజనేయులు", "srikanth": "శ్రీకాంత్",
    "sandeep": "సందీప్", "krishna": "కృష్ణ", "prasad": "ప్రసాద్", "chowdary": "చౌదరి", "velama": "వెలమ", "varma": "వర్మ",
    "goud ": "గౌడ్", "mudiraj": "ముదిరాజ్", "gangaputra": "గంగపుత్ర", "munnuru": "మున్నూరు", "perka": "పెర్క",
    "komuraiah": "కొమురయ్య", "mallesh": "మల్లేష్", "dandu": "దండు", "gaddam": "గడ్డం", "bandari": "బండారి",
}


def telugu(name: str) -> str:
    return " ".join(_TE_SPECIAL.get(p.lower()) or telugu_word(p) for p in re.split(r"\s+", name.strip()) if p)


# ----------------------------------------------------------------------------- name / address dirt
_SPECIAL = {
    "Mohammed": ["Mohd", "Md", "Muhammad", "Mohamed"], "Srinivas": ["Srinivasa", "Sreenivas", "Srinivasulu"],
    "Venkat": ["Venkata", "Venkatesh"], "Venkatesh": ["Venkatesh", "Venkatesam"], "Lakshmi": ["Laxmi", "Lakshmy", "Laxmi"],
    "Laxman": ["Lakshman", "Laxmaiah"], "Swathi": ["Swati", "Swathy"], "Rajender": ["Rajendar", "Rajendra", "Rajinder"],
    "Ravinder": ["Ravindra", "Ravender", "Ravinder"], "Yadaiah": ["Yadayya", "Yadaiah"], "Padmavathi": ["Padmavati", "Padmawathi"],
    "Goud": ["Gowd", "Goud"], "Reddy": ["Reddi", "Reddy"], "Shaikh": ["Sheikh", "Shaik"], "Naik": ["Nayak", "Naik"],
    "Erukala": ["Yerukala", "Erukula"], "Yellamma": ["Ellamma", "Yellama"], "Yellavva": ["Ellavva", "Yellava"],
    "Pagidipalli": ["Pagidipally", "Pagidipalli"], "Narsimha": ["Narasimha", "Narasimhulu"], "Anjaiah": ["Anjayya", "Anjaiah"],
    "Ramulu": ["Ramulu", "Ramullu"], "Komuraiah": ["Komuraiah", "Komurayya"], "Hanumanthu": ["Hanumantu", "Hanumanthu"],
    "Sridevi": ["Sri Devi", "Sreedevi"], "Bhargavi": ["Bhargavi", "Bhargawi"], "Madavi": ["Madavi", "Maadavi"],
}
_RULES = [("th", "t"), ("v", "w"), ("ee", "i"), ("aa", "a"), ("sh", "s"), ("dd", "d"), ("ll", "l"), ("mm", "m"),
          ("i$", "y"), ("y$", "i"), ("a$", ""), ("^Y", "E"), ("^Sri", "Shri"), ("kk", "k"), ("nn", "n")]
_HONOR = ["Smt.", "Sri", "Mr.", "Mrs."]


def _typo(s: str, r: random.Random) -> str:
    if len(s) < 5:
        return s
    i = r.randint(1, len(s) - 2)
    return r.choice([s[:i] + s[i + 1:], s[:i] + s[i + 1] + s[i] + s[i + 2:] if i + 2 <= len(s) else s])


def name_variant(name: str, r: random.Random) -> str:
    """A plausible different spelling or format of the same name (never identical to the input)."""
    parts = name.split()
    for _ in range(6):
        p = list(parts)
        mode = r.random()
        if mode < 0.50:                       # spelling variants on one or two parts
            for idx in r.sample(range(len(p)), k=min(len(p), r.choice([1, 1, 2]))):
                w = p[idx]
                if w in _SPECIAL and r.random() < 0.7:
                    p[idx] = r.choice(_SPECIAL[w])
                else:
                    rules = [x for x in _RULES if re.search(x[0], w, re.I)]
                    if rules:
                        pat, rep = r.choice(rules)
                        p[idx] = re.sub(pat, rep, w, count=1, flags=re.I)
        elif mode < 0.68 and len(p) >= 2:       # initial for the first name
            p[0] = p[0][0] + "."
        elif mode < 0.80 and len(p) >= 2:       # surname first
            p = [p[-1]] + p[:-1]
        elif mode < 0.88:                       # case / honorific
            p = [x.upper() for x in p] if r.random() < 0.6 else [r.choice(_HONOR)] + p
        elif mode < 0.94:                       # typo
            idx = r.randrange(len(p)); p[idx] = _typo(p[idx], r)
        else:                                   # first name only
            p = p[:1]
        v = " ".join(p)
        if v != name:
            return v
    return name + " "


def maybe_name(name: str, r: random.Random, rate: float, tel_rate: float = 0.0) -> tuple[str, str]:
    """(value, kind) where kind is exact | variant | telugu."""
    x = r.random()
    if x < tel_rate:
        return telugu(name), "telugu"
    if x < tel_rate + rate:
        return name_variant(name, r), "variant"
    return name, "exact"


_ABBR = [("Colony", "Col."), ("Nagar", "Ngr"), ("Road", "Rd"), ("Street", "St")]


def address_variant(house: str, street: str, village: str, mandal: str, district: str, r: random.Random,
                    rate: float) -> tuple[str, str]:
    base = f"{house} {street}, {village}"
    if r.random() >= rate:
        return base, "exact"
    forms = [
        f"H.No {house}, {street}, {village} (V), {mandal} (M), {district} Dist",
        f"{house}-{street}, {village} Village, {mandal} Mandal",
        f"{street} {house}, {village}",
        f"{village}, {mandal}, {district}",
        f"{house} {street}, {name_variant(village, r).split()[0] if village else village}",
        base.upper(),
    ]
    v = r.choice(forms)
    for a, b in _ABBR:
        if r.random() < 0.3:
            v = v.replace(a, b)
    return v, "variant"


def parse_address(addr: str):
    """registry address '12 Indiramma Colony, Chityal' -> (house, street)."""
    head = addr.split(",")[0].strip()
    m = re.match(r"(\d+)\s+(.*)", head)
    return (m.group(1), m.group(2)) if m else ("", head)


# ----------------------------------------------------------------------------- the registry as ground truth
class Truth:
    def __init__(self, count: int, seed: int):
        gen = G.Gen(seed)
        fams = list(G.heroes())
        for _ in range(count - 5):
            fams.append(gen.family())
        self.people: dict[str, dict] = {}
        self.families: dict[str, dict] = {}
        for fam, persons, members in fams:
            fid = fam[0]
            self.families[fid] = {"id": fid, "address": fam[1], "village": fam[2], "mandal": fam[3], "district": fam[4],
                                  "ration": fam[5], "members": [], "hero": fid.startswith("a") and fid[1:8] == "0000000"[:7]}
            rel = {m[1]: m[2] for m in members}
            for p in persons:
                age = G.Gen.age(p[2])
                self.people[p[0]] = {
                    "id": p[0], "name": p[1], "dob": p[2], "gender": p[3], "aadhaar": p[4], "occ": p[5], "income": p[6],
                    "caste": p[7], "alive": p[8], "mobile": p[9], "marital": p[11], "rel": rel[p[0]], "fid": fid, "age": age,
                    "registry": True,
                }
                self.families[fid]["members"].append(p[0])
        for f in self.families.values():
            f["head"] = next(m for m in f["members"] if self.people[m]["rel"] == "HEAD")
            f["hero"] = bool(re.fullmatch(r"a[1-5]000000-0000-0000-0000-00000000000[1-5]", f["id"]))
        self.extra = 0

    def by_rel(self, fid, rel):
        return [m for m in self.families[fid]["members"] if self.people[m]["rel"] == rel]

    def parents(self, pid):
        """(father_name, mother_name) from the household, else None."""
        p = self.people[pid]
        f = self.families[p["fid"]]
        head, spouse = self.people[f["head"]], None
        sp = self.by_rel(p["fid"], "SPOUSE")
        spouse = self.people[sp[0]] if sp else None
        if p["rel"] in ("SON", "DAUGHTER"):
            father = head if head["gender"] == "M" else spouse
            mother = head if head["gender"] == "F" else spouse
            return (father["name"] if father else None, mother["name"] if mother else None)
        if p["rel"] == "HEAD":
            fa, mo = self.by_rel(p["fid"], "FATHER"), self.by_rel(p["fid"], "MOTHER")
            if fa and mo:
                return (self.people[fa[0]]["name"], self.people[mo[0]]["name"])
        # parents who are not in the household: invent stable names with the same family name
        rr = random.Random(pid)
        pool = G.NAMES.get(p["caste"]) or G.GENERAL_HINDU
        last = p["name"].split()[-1]
        return (f"{rr.choice(pool['M'])} {last}", f"{rr.choice(pool['F'])} {last}")

    def new_extra(self, name, dob, gender, fid=None, caste="GENERAL"):
        self.extra += 1
        pid = f"x-{self.extra:05d}"
        self.people[pid] = {"id": pid, "name": name, "dob": dob, "gender": gender, "aadhaar": None, "occ": "", "income": 0,
                            "caste": caste, "alive": True, "mobile": None, "marital": "SINGLE", "rel": "", "fid": fid,
                            "age": G.Gen.age(dob), "registry": False}
        return pid


# ----------------------------------------------------------------------------- the generator
class Extracts:
    def __init__(self, truth: Truth, seed: int, dirt: float):
        self.t, self.r, self.dirt = truth, random.Random(seed + 1000), dirt
        self.links: list[tuple] = []     # (source, record_id, person_id, family_id)
        self.cases: list[tuple] = []     # (case_type, scenario, person_id, source, record_id, detail)
        self.stats: dict[str, int] = {}
        self.tel = self._telugu_villages()
        self.live: list[dict] = []
        self.live_death_ids: set[str] = set()
        self.seq = {}

    # -- helpers
    def rate(self, base: float) -> float:
        return min(0.95, base * self.dirt)

    def nid(self, prefix, width=6):
        self.seq[prefix] = self.seq.get(prefix, 0) + 1
        return f"{prefix}{self.seq[prefix]:0{width}d}"

    def link(self, source, rid, pid, fid=None):
        self.links.append((source, rid, pid, fid if fid else (self.t.people[pid]["fid"] if pid in self.t.people else None)))

    def case(self, ctype, scenario, pid, source, rid, detail=""):
        self.cases.append((ctype, scenario, pid, source, rid, detail))
        self.stats[ctype] = self.stats.get(ctype, 0) + 1

    @staticmethod
    def _telugu_villages():
        out = {}
        with open(G.LGD / "villages.csv", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                n, loc = row["Village Name (In English)"].strip(), row["Village Name (In Local)"].strip()
                if n and loc:
                    out[(row["District Name (In English)"].strip(), row["Sub-District Name (In English)"].strip(), n)] = loc
        return out

    def p(self, pid):
        return self.t.people[pid]

    def f(self, fid):
        return self.t.families[fid]

    def addr(self, fid, rate):
        fam = self.f(fid)
        house, street = parse_address(fam["address"])
        return address_variant(house, street, fam["village"], fam["mandal"], fam["district"], self.r, self.rate(rate))

    def dob_slip(self, d: date):
        k = self.r.random()
        if k < 0.35 and d.day <= 12:                       # day/month transposed
            return date(d.year, d.day, d.month) if d.month != d.day else d + timedelta(days=1)
        if k < 0.7:
            return d + timedelta(days=self.r.choice([-1, 1, 30, -30]))
        return date(d.year + self.r.choice([-1, 1, 2]), d.month, d.day)

    # ------------------------------------------------------------------ identity reference service
    def identity_reference(self):
        rows, r = [], self.r
        for pid, p in self.t.people.items():
            if not p["registry"] or not p["aadhaar"]:
                continue
            if r.random() < self.rate(0.12) and not (self.f(p["fid"])["hero"] and p["rel"] == "HEAD"):
                if r.random() < 0.6:
                    self.case("NO_IDENTITY_REF", "1.5", pid, "identity_reference", "", "no reference token issued")
                continue
            rid = "IDR-" + hashlib.sha256(("tg-demo-salt|" + p["aadhaar"]).encode()).hexdigest()[:12].upper()
            nm, kind = maybe_name(p["name"], r, self.rate(0.08), 0.28)
            rows.append({"reference_token": rid, "name": nm, "name_script": "te" if kind == "telugu" else "en",
                         "birth_year": p["dob"].year, "gender": p["gender"], "district": self.f(p["fid"])["district"],
                         "assurance": "HIGH" if kind == "exact" else "MEDIUM"})
            self.link("identity_reference", rid, pid)
            if kind != "exact":
                self.case("NAME_VARIANT", "1.1", pid, "identity_reference", rid, f"{p['name']} -> {nm}")
        return rows

    # ------------------------------------------------------------------ civil registration
    def _birth_cover(self, year):
        return 0.97 if year >= 2000 else 0.85 if year >= 1980 else 0.60 if year >= 1960 else 0.40

    def crs(self):
        r, ev, seqno = self.r, [], 0
        t0 = date(2026, 6, 1)

        def event(kind, pid, payload, event_date, lag_days=0, **extra):
            nonlocal seqno
            seqno += 1
            eid = f"CRS-EVT-{seqno:07d}"
            e = {"event_id": eid, "event_type": kind, "subject_record": payload.get("registration_no"),
                 "event_time": event_date.isoformat() + "T10:00:00+05:30",
                 "published_time": (event_date + timedelta(days=lag_days)).isoformat() + "T10:00:00+05:30",
                 "payload": payload}
            e.update(extra)
            ev.append(e)
            self.link("crs", eid, pid)
            return e

        for pid, p in list(self.t.people.items()):
            if not p["registry"]:
                continue
            if self.f(p["fid"])["hero"] or r.random() < self._birth_cover(p["dob"].year):
                reg = f"CRS-B-{p['dob'].year}-{self.nid('b', 6)[1:]}"
                father, mother = self.t.parents(pid)
                nm, kind = maybe_name(p["name"], r, self.rate(0.12))
                late = r.random() < 0.06
                reg_date = p["dob"] + timedelta(days=r.randint(150, 2200) if late else r.randint(1, 25))
                e = event("BIRTH_REGISTERED", pid,
                          {"registration_no": reg, "child_name": nm, "gender": p["gender"], "date_of_birth": p["dob"].isoformat(),
                           "father_name": father, "mother_name": mother, "registration_date": reg_date.isoformat(),
                           "place": self.f(p["fid"])["district"]},
                          reg_date, 0, record_kind="HISTORICAL")
                if kind != "exact":
                    self.case("NAME_VARIANT", "1.1", pid, "crs", e["event_id"], f"{p['name']} -> {nm}")
                if late:
                    self.case("LATE_REGISTRATION", "2.5", pid, "crs", e["event_id"],
                              f"registered {(reg_date - p['dob']).days} days after birth")
            if not p["alive"]:
                reg = f"CRS-D-{self.nid('d', 6)[1:]}"
                hero_recent = p["fid"] in ("a2000000-0000-0000-0000-000000000002", "a5000000-0000-0000-0000-000000000005")
                dd = TODAY - timedelta(days=r.randint(20, 70)) if hero_recent else TODAY - timedelta(days=r.randint(30, 700))
                outside = (not hero_recent) and r.random() < 0.10
                if r.random() < 0.08 and not hero_recent:
                    self.case("DEATH_NOT_REGISTERED", "3.3", pid, "crs", "", "no death record in civil registration")
                    continue
                nm, kind = maybe_name(p["name"], r, self.rate(0.12))
                e = event("DEATH_REGISTERED", pid,
                          {"registration_no": reg, "name": nm, "age_at_death": p["age"], "date_of_death": dd.isoformat(),
                           "place_of_death": ("Karnataka" if r.random() < 0.5 else "Maharashtra") if outside else "Telangana",
                           "district": self.f(p["fid"])["district"], "registration_date": (dd + timedelta(days=r.randint(2, 20))).isoformat()},
                          dd + timedelta(days=r.randint(2, 20)), 0, record_kind="HISTORICAL")
                if outside:
                    self.case("DEATH_OUTSIDE_STATE", "3.3", pid, "crs", e["event_id"], e["payload"]["place_of_death"])
        # recent births not yet in the registry (UC2): children of young households
        cands = [f for f in self.t.families.values() if self.p(f["head"])["age"] <= 40 and self.t.by_rel(f["id"], "SPOUSE")
                 and self.p(self.t.by_rel(f["id"], "SPOUSE")[0])["alive"]]
        r.shuffle(cands)
        kinds = (["PLAIN"] * 8 + ["NO_NAME"] * 3 + ["LATE"] * 3 + ["PARENT_MISMATCH"] * 3 + ["DUPLICATE"] * 2 + ["OUT_OF_ORDER"] * 2 +
                 ["WITHDRAWN"] * 1)
        for fam, k in zip(cands, kinds):
            fid = fam["id"]
            head, sp = self.p(fam["head"]), self.p(self.t.by_rel(fid, "SPOUSE")[0])
            mother, father = (head, sp) if head["gender"] == "F" else (sp, head)
            gender = r.choice("MF")
            dob = TODAY - timedelta(days=r.randint(3, 50))
            caste = head["caste"]
            pool = G.NAMES.get(caste) or G.GENERAL_HINDU
            nm = f"{r.choice(pool[gender] if gender in pool else pool['M'])} {father['name'].split()[-1]}"
            while nm == father["name"] or nm == mother["name"]:
                nm = f"{r.choice(pool[gender])} {father['name'].split()[-1]}"
            cid = self.t.new_extra(nm, dob, gender, fid, caste)
            reg = f"CRS-B-{dob.year}-N{self.nid('n', 5)[1:]}"
            reg_date = dob + timedelta(days=r.randint(2, 12))
            payload = {"registration_no": reg, "child_name": nm, "gender": gender, "date_of_birth": dob.isoformat(),
                       "father_name": father["name"], "mother_name": mother["name"], "registration_date": reg_date.isoformat(),
                       "place": fam["district"]}
            scen = {"PLAIN": "2.1", "NO_NAME": "2.4", "LATE": "2.5", "PARENT_MISMATCH": "2.6", "DUPLICATE": "2.7", "OUT_OF_ORDER": "2.7",
                    "WITHDRAWN": "2.7"}[k]
            lag = 0
            if k == "NO_NAME":
                payload["child_name"] = None
            if k == "LATE":
                payload["date_of_birth"] = (TODAY - timedelta(days=r.randint(150, 320))).isoformat()
                payload["registration_date"] = (TODAY - timedelta(days=r.randint(1, 6))).isoformat()
                lag = 0
            if k == "PARENT_MISMATCH":
                payload["mother_name"] = name_variant(mother["name"], r) if r.random() < 0.5 else mother["name"].split()[0] + " " + r.choice(pool["last"])
            self.live.append({"order": len(self.live) + 1, "scenario": scen, "use_case": "UC2", "case_kind": k, "person_id": cid,
                              "family_id": fid, "event_type": "BIRTH_REGISTERED", "payload": payload})
            self.links.append(("live_events", f"live-{len(self.live):04d}", cid, fid))
            self.case({"PLAIN": "NEW_BIRTH", "NO_NAME": "BIRTH_NAME_PENDING", "LATE": "LATE_REGISTRATION", "PARENT_MISMATCH": "PARENT_MISMATCH",
                       "DUPLICATE": "DUPLICATE_EVENT", "OUT_OF_ORDER": "OUT_OF_ORDER_EVENT", "WITHDRAWN": "WITHDRAWN_EVENT"}[k], scen,
                      cid, "live_events", f"live-{len(self.live):04d}", f"{k}: family {fid}")
            if k == "NO_NAME":   # the amendment that adds the name arrives later
                self.live.append({"order": len(self.live) + 1, "scenario": "2.4", "use_case": "UC2", "case_kind": "AMENDMENT",
                                  "person_id": cid, "family_id": fid, "event_type": "BIRTH_AMENDED",
                                  "payload": {"registration_no": reg, "child_name": nm}})
            if k == "DUPLICATE":
                self.live.append(dict(self.live[-1], order=len(self.live) + 1, case_kind="DUPLICATE_OF_PREVIOUS"))
            if k == "WITHDRAWN":
                self.live.append({"order": len(self.live) + 1, "scenario": "2.7", "use_case": "UC2", "case_kind": "WITHDRAWAL",
                                  "person_id": cid, "family_id": fid, "event_type": "BIRTH_WITHDRAWN",
                                  "payload": {"registration_no": reg, "reason": "entered in error"}})
        # a recent death to inject live: demo family grandfather, plus no-spouse / dispute / in-flight variants (UC3)
        elders = [p for p in self.t.people.values() if p["registry"] and p["alive"] and p["rel"] in ("FATHER", "MOTHER") and p["age"] >= 60]
        r.shuffle(elders)
        hero3 = [p for p in elders if p["fid"] == "a3000000-0000-0000-0000-000000000003" and p["rel"] == "FATHER"]
        picks = hero3 + [p for p in elders if p not in hero3]
        d_kinds = ["PLAIN", "OUTSIDE_STATE", "NO_SPOUSE", "DISPUTE", "IN_FLIGHT"]
        for p, k in zip(picks, d_kinds):
            dd = TODAY - timedelta(days=r.randint(1, 9))
            reg = f"CRS-D-N{self.nid('nd', 5)[1:]}"
            self.live.append({"order": len(self.live) + 1, "scenario": {"PLAIN": "3.1", "OUTSIDE_STATE": "3.3", "NO_SPOUSE": "3.4",
                              "DISPUTE": "3.4", "IN_FLIGHT": "3.5"}[k], "use_case": "UC3", "case_kind": k, "person_id": p["id"],
                              "family_id": p["fid"], "event_type": "DEATH_REGISTERED",
                              "payload": {"registration_no": reg, "name": p["name"], "age_at_death": p["age"], "date_of_death": dd.isoformat(),
                                          "place_of_death": "Karnataka" if k == "OUTSIDE_STATE" else "Telangana"}})
            self.links.append(("live_events", f"live-{len(self.live):04d}", p["id"], p["fid"]))
            self.live_death_ids.add(p["id"])
            self.case("LIVE_DEATH_" + k, self.live[-1]["scenario"], p["id"], "live_events", f"live-{len(self.live):04d}", f"family {p['fid']}")
        # shuffle part of the feed so a few events are out of order, and duplicate a couple
        for i in range(len(ev) - 1):
            if r.random() < 0.01:
                ev[i], ev[i + 1] = ev[i + 1], ev[i]
        for e in r.sample(ev, k=max(1, len(ev) // 150)):
            ev.append(dict(e, duplicate_of=e["event_id"], event_id=e["event_id"] + "-DUP"))
            self.link("crs", e["event_id"] + "-DUP", self.links[[l[1] for l in self.links].index(e["event_id"])][2])
        return ev

    # ------------------------------------------------------------------ revenue
    def revenue(self):
        r, rows, land = self.r, [], []
        for fid, fam in self.t.families.items():
            head = self.p(fam["head"])
            who = [fam["head"]] if r.random() < 0.8 else []
            who += [m for m in fam["members"] if self.p(m)["alive"] and 15 <= self.p(m)["age"] <= 22 and r.random() < 0.5]
            for pid in who:
                p = self.p(pid)
                for ctype in (["INCOME"] + (["CASTE"] if r.random() < 0.6 else [])):
                    rid = self.nid("RV-IC-" if ctype == "INCOME" else "RV-CC-", 7)
                    holder = head if ctype == "INCOME" and p["rel"] != "HEAD" and False else p
                    nm, kind = maybe_name(p["name"], r, self.rate(0.22))
                    father, mother = self.t.parents(pid)
                    guardian = father or (self.p(fam["head"])["name"] if p["rel"] != "HEAD" else None)
                    dob = p["dob"] if r.random() < 0.5 else None
                    if dob and r.random() < self.rate(0.06):
                        dob = self.dob_slip(dob)
                        self.case("DOB_CONFLICT", "1.3", pid, "revenue", rid, f"{p['dob']} vs {dob}")
                    issued = TODAY - timedelta(days=r.randint(10, 420))
                    valid_until = issued + timedelta(days=365) if ctype == "INCOME" else None
                    expired = bool(valid_until and valid_until < TODAY)
                    income, caste = p["income"], p["caste"]
                    if ctype == "INCOME" and r.random() < self.rate(0.10) and income:
                        income = int(income * r.choice([0.6, 0.75, 1.3, 1.5]))
                        self.case("INCOME_CONFLICT", "4.4", pid, "revenue", rid, f"registry {p['income']} vs certificate {income}")
                    if ctype == "CASTE" and r.random() < self.rate(0.04):
                        caste = r.choice([c for c in ("SC", "ST", "OBC", "NT", "GENERAL") if c != caste])
                        self.case("CASTE_CONFLICT", "4.4", pid, "revenue", rid, f"registry {p['caste']} vs certificate {caste}")
                    if expired:
                        self.case("CERT_EXPIRED", "4.3", pid, "revenue", rid, f"valid until {valid_until}")
                    a, _ = self.addr(fid, 0.25)
                    rows.append({"certificate_no": rid, "type": ctype, "holder_name": nm, "father_or_husband": guardian, "dob": dob.isoformat() if dob else "",
                                 "category": caste if ctype == "CASTE" else "", "annual_income": income if ctype == "INCOME" else "",
                                 "issued_on": issued.isoformat(), "valid_until": valid_until.isoformat() if valid_until else "",
                                 "status": "EXPIRED" if expired else "ACTIVE", "address": a, "mandal": fam["mandal"], "district": fam["district"]})
                    self.link("revenue_certificates", rid, pid)
                    if kind != "exact":
                        self.case("NAME_VARIANT", "1.1", pid, "revenue_certificates", rid, f"{p['name']} -> {nm}")
            # land: farmers and a few others
            if head["occ"] == "farmer" or r.random() < 0.08:
                owner = fam["head"]
                dead = [m for m in fam["members"] if not self.p(m)["alive"]]
                stale = r.random() < self.rate(0.15)
                if dead and r.random() < 0.5:
                    owner, stale = dead[0], True
                rid = self.nid("RV-LR-", 7)
                nm, _ = maybe_name(self.p(owner)["name"], r, self.rate(0.2))
                mut = TODAY - timedelta(days=r.randint(2900, 5500) if stale else r.randint(30, 1500))
                land.append({"record_no": rid, "survey_no": f"{r.randint(1, 800)}/{r.choice(['A', 'B', 'AA', ''])}".rstrip("/"),
                             "owner_name": nm, "village": fam["village"], "mandal": fam["mandal"], "district": fam["district"],
                             "extent_acres": round(r.uniform(0.4, 9.0), 2), "last_mutation_on": mut.isoformat(),
                             "last_updated": mut.isoformat()})
                self.link("revenue_land", rid, owner)
                if stale:
                    self.case("STALE_LAND_RECORD", "5.6", owner, "revenue_land", rid,
                              "owner deceased and not mutated" if not self.p(owner)["alive"] else f"last mutation {mut}")
        return rows, land

    # ------------------------------------------------------------------ PDS (read-only views)
    def pds(self):
        r, rows = self.r, []
        for fid, fam in self.t.families.items():
            if not fam["ration"]:
                continue
            card = fam["ration"]
            hh = self.nid("HH", 7)
            ctype = r.choices(["AAY", "PHH", "WHITE"], weights=[8, 62, 30])[0]
            a, kind = self.addr(fid, 0.35)
            mandal = fam["mandal"] if r.random() > self.rate(0.08) else name_variant(fam["mandal"], r)
            for pid in fam["members"]:
                p = self.p(pid)
                if not p["alive"] and r.random() < 0.6:
                    continue                                  # most dead members are removed...
                if p["alive"] and not fam["hero"] and r.random() < self.rate(0.10):
                    self.case("MISSING_IN_SOURCE", "5.4", pid, "pds_view", "", "member not listed on ration card")
                    continue
                rid = self.nid("PDS-", 8)
                nm, nk = maybe_name(p["name"], r, self.rate(0.30), 0.06)
                age = p["age"] + (r.choice([-2, -1, 1, 2]) if r.random() < self.rate(0.12) else 0)
                rows.append({"row_id": rid, "ration_card_no": card, "household_id": hh, "card_type": ctype, "member_name": nm,
                             "relation": p["rel"].title(), "gender": p["gender"], "age": age, "address_text": a, "mandal": mandal,
                             "village": fam["village"], "district": fam["district"], "member_status": "ACTIVE", "tenant": "N"})
                self.link("pds_view", rid, pid)
                if not p["alive"]:
                    self.case("STALE_DEAD_ON_CARD", "3.1", pid, "pds_view", rid, "deceased member still listed")
                if nk != "exact":
                    self.case("NAME_VARIANT", "1.1", pid, "pds_view", rid, f"{p['name']} -> {nm}")
        # shared ration cards: a household without a card of its own is listed on a neighbour's card (tenant)
        with_card = {}
        for f in self.t.families.values():
            if f["ration"]:
                with_card.setdefault((f["district"], f["mandal"]), []).append(f)
        tenants = [f for f in self.t.families.values() if not f["ration"] and with_card.get((f["district"], f["mandal"]))]
        r.shuffle(tenants)
        for tenant in tenants[:max(4, int(len(self.t.families) * 0.06 * self.dirt))]:
            owner = r.choice(with_card[(tenant["district"], tenant["mandal"])])
            for pid in tenant["members"]:
                p = self.p(pid)
                if not p["alive"]:
                    continue
                rid = self.nid("PDS-", 8)
                rows.append({"row_id": rid, "ration_card_no": owner["ration"], "household_id": "", "card_type": "PHH",
                             "member_name": p["name"], "relation": p["rel"].title(), "gender": p["gender"], "age": p["age"],
                             "address_text": owner["address"], "mandal": owner["mandal"], "village": owner["village"],
                             "district": owner["district"], "member_status": "ACTIVE", "tenant": "Y"})
                self.link("pds_view", rid, pid)
                self.case("SHARED_RATION_CARD", "5.4", pid, "pds_view", rid, f"tenant family {tenant['id']} listed on card of {owner['id']}")
        return rows

    # ------------------------------------------------------------------ pension MIS (daily batch)
    def pension(self):
        r, rows = self.r, []
        for pid, p in self.t.people.items():
            if not p["registry"]:
                continue
            scheme = None
            forced = (self.f(p["fid"])["hero"] and p["rel"] in ("FATHER", "MOTHER") and p["age"] >= 57) or pid in self.live_death_ids
            if forced or (p["age"] >= 57 and r.random() < (0.55 if p["alive"] else 0.8)):
                scheme = "OLD_AGE"
            elif p["gender"] == "F" and p["marital"] == "WIDOWED" and p["age"] >= 25 and r.random() < 0.7:
                scheme = "WIDOW"
            elif p["alive"] and 18 <= p["age"] < 57 and r.random() < 0.012:
                scheme = "DISABLED"
            if not scheme:
                continue
            fam = self.f(p["fid"])
            rid = self.nid("PN-", 7)
            nm, kind = maybe_name(p["name"], r, self.rate(0.18), 0.04)
            dob = p["dob"] if r.random() > 0.10 else None
            if dob and r.random() < self.rate(0.05):
                dob = self.dob_slip(dob)
                self.case("DOB_CONFLICT", "1.3", pid, "pension_batch", rid, f"{p['dob']} vs {dob}")
            status = "ACTIVE"
            if not p["alive"]:
                status = "ACTIVE" if r.random() < 0.35 else "STOPPED_DECEASED"
                if status == "ACTIVE":
                    self.case("STALE_DEAD_ACTIVE", "3.5", pid, "pension_batch", rid, "pension still active after death")
            nominee = None
            if r.random() < 0.2:
                sp = self.t.by_rel(p["fid"], "SPOUSE")
                nominee = self.p(sp[0])["name"] if sp and sp[0] != pid else None
            rows.append({"pensioner_id": rid, "name": nm, "dob": dob.isoformat() if dob else "", "scheme": scheme,
                         "mandal": fam["mandal"], "village": fam["village"], "district": fam["district"],
                         "monthly_amount": 4016 if scheme == "DISABLED" else 2016, "status": status, "nominee_name": nominee or "",
                         "last_payment_on": "2026-06-01", "next_payment_on": "2026-07-01", "extract_as_of": EXTRACT_AS_OF})
            self.link("pension_batch", rid, pid)
            if kind != "exact":
                self.case("NAME_VARIANT", "1.1", pid, "pension_batch", rid, f"{p['name']} -> {nm}")
        return rows

    # ------------------------------------------------------------------ electricity (SOAP)
    def electricity(self):
        r, rows = self.r, []
        for fid, fam in self.t.families.items():
            head = self.p(fam["head"])
            for conn in range(1 + (r.random() < 0.08)):
                rid = self.nid("ELEC-", 8)
                k = r.random()
                holder_pid, note = fam["head"], "head"
                if k < 0.10:
                    dead = [m for m in fam["members"] if not self.p(m)["alive"]]
                    if dead:
                        holder_pid, note = dead[0], "holder deceased"
                    else:
                        holder_pid = fam["head"]
                elif k < 0.22:
                    ad = [m for m in fam["members"] if self.p(m)["alive"] and self.p(m)["age"] >= 22 and m != fam["head"]]
                    if ad:
                        holder_pid, note = r.choice(ad), "other adult"
                elif k < 0.32:
                    holder_pid, note = None, "landlord"
                if holder_pid:
                    nm, kind = maybe_name(self.p(holder_pid)["name"], r, self.rate(0.35), 0.03)
                else:
                    nm, kind = G.Gen(r.randint(1, 10 ** 6)).name("OBC", "M"), "exact"
                a, _ = self.addr(fid, 0.55)
                units = [max(30, int(r.gauss(55 + 12 * len(fam["members"]), 25))) for _ in range(6)]
                rows.append({"service_no": rid, "consumer_name": nm, "category": "DOMESTIC", "address_text": a, "mandal": fam["mandal"],
                             "district": fam["district"], "load_kw": round(r.choice([0.5, 1, 1, 1.5, 2, 3]), 1),
                             "units_last_6_months": " ".join(str(u) for u in units), "connection_status": "ACTIVE"})
                self.link("electricity", rid, holder_pid, fid)
                if note != "head":
                    self.case("INDIRECT_HOUSEHOLD_LINK", "5.2", holder_pid, "electricity", rid, f"{note}; family {fid}")
                if kind != "exact":
                    self.case("NAME_VARIANT", "1.1", holder_pid, "electricity", rid, f"{nm}")
        return rows

    # ------------------------------------------------------------------ student portal (operator-keyed)
    def students(self):
        r, rows = self.r, []
        for pid, p in self.t.people.items():
            if not p["registry"] or not (15 <= p["age"] <= 25) or p["occ"] != "student" or not p["alive"] or r.random() < 0.25:
                continue
            fam = self.f(p["fid"])
            rid = self.nid("STU-", 7)
            father, mother = self.t.parents(pid)
            nm, kind = maybe_name(p["name"], r, self.rate(0.10))
            course = "Intermediate" if p["age"] <= 18 else r.choice(["B.Tech", "B.Sc", "B.Com", "Diploma", "B.A."])
            inst = (f"Govt Junior College, {fam['mandal']}" if course == "Intermediate" else
                    f"{fam['district']} Government Degree College" if course in ("B.Sc", "B.Com", "B.A.") else
                    f"{fam['district']} Polytechnic" if course == "Diploma" else f"{fam['district']} Institute of Engineering")
            rows.append({"student_id": rid, "name": nm, "dob": p["dob"].isoformat(), "course": course, "year": r.randint(1, 3),
                         "institution": inst, "father_name": father or "", "mother_name": mother or "", "scholarship_applied": r.choice(["Y", "N"])})
            self.link("student_portal", rid, pid)
            if kind != "exact":
                self.case("NAME_VARIANT", "1.1", pid, "student_portal", rid, f"{p['name']} -> {nm}")
        # near-18 applicants for UC4 (guardian consent hands over on the birthday)
        for pid, p in self.t.people.items():
            if p["registry"] and p["age"] == 17:
                nxt = date(TODAY.year, p["dob"].month, min(p["dob"].day, 28))
                if nxt < TODAY:
                    nxt = date(TODAY.year + 1, p["dob"].month, min(p["dob"].day, 28))
                if (nxt - TODAY).days <= 90:
                    self.case("TURNING_18_SOON", "4.2", pid, "student_portal", "", f"turns 18 on {p['dob'].replace(year=p['dob'].year + 18)}")
        return rows

    # ------------------------------------------------------------------ housing
    def housing(self):
        r, rows = self.r, []
        fams = list(self.t.families.values())
        r.shuffle(fams)
        for i, fam in enumerate(fams[:max(10, int(len(fams) * 0.07))]):
            head = self.p(fam["head"])
            sp = self.t.by_rel(fam["id"], "SPOUSE")
            rid = self.nid("HSG-", 7)
            sanctioned = TODAY - timedelta(days=r.randint(400, 2400))
            rows.append({"application_id": rid, "applicant_name": maybe_name(head["name"], r, self.rate(0.15))[0],
                         "household_ref": "", "scheme": "HOUSING_ASSISTANCE", "status": r.choice(["SANCTIONED", "COMPLETED"]),
                         "date": sanctioned.isoformat(), "village": fam["village"], "mandal": fam["mandal"], "district": fam["district"]})
            self.link("housing", rid, fam["head"])
            if i < 6 and sp:                      # second application by the spouse -> possible duplicate benefit
                rid2 = self.nid("HSG-", 7)
                s_p = self.p(sp[0])
                rows.append({"application_id": rid2, "applicant_name": s_p["name"], "household_ref": "", "scheme": "HOUSING_ASSISTANCE",
                             "status": "PENDING", "date": (TODAY - timedelta(days=r.randint(2, 40))).isoformat(), "village": fam["village"],
                             "mandal": fam["mandal"], "district": fam["district"]})
                self.link("housing", rid2, sp[0])
                self.case("POSSIBLE_DUPLICATE_BENEFIT", "5.5", sp[0], "housing", rid2, f"sanctioned {rid} to {head['name']}")
        return rows

    # ------------------------------------------------------------------ marriage register (partial coverage)
    def marriages(self):
        r, rows = self.r, []
        for fid, fam in self.t.families.items():
            sp = self.t.by_rel(fid, "SPOUSE")
            if not sp:
                continue
            a, b = self.p(fam["head"]), self.p(sp[0])
            if r.random() > 0.45:
                continue
            groom, bride = (a, b) if a["gender"] == "M" else (b, a)
            if r.random() < 0.12:
                self.case("MARRIAGE_OTHER_REGISTRAR", "6.3", bride["id"], "marriage_register", "", "marriage registered elsewhere, no digital record")
                continue
            rid = self.nid("MR-", 7)
            mdate = date(max(a["dob"].year, b["dob"].year) + r.randint(20, 27), r.randint(1, 12), r.randint(1, 28))
            maiden_last = r.choice(G.GENERAL_HINDU["last"] if bride["caste"] == "GENERAL" else G.NAMES.get(bride["caste"], G.GENERAL_HINDU)["last"])
            maiden = f"{bride['name'].split()[0]} {maiden_last}"
            rows.append({"registration_no": rid, "marriage_date": mdate.isoformat(), "groom_name": groom["name"], "groom_dob": groom["dob"].isoformat(),
                         "bride_name_at_marriage": maiden, "bride_dob": bride["dob"].isoformat(), "registrar_office": fam["district"],
                         "status": "REGISTERED"})
            self.link("marriage_register", rid, groom["id"], fid)
            self.links.append(("marriage_register", rid + ":bride", bride["id"], fid))
            if maiden.split()[-1] != bride["name"].split()[-1]:
                self.case("SURNAME_CHANGE", "6.5", bride["id"], "marriage_register", rid, f"{maiden} -> {bride['name']}")
        # under-age records (UC6.4): invented people outside the family registry
        for k in range(3):
            g = self.t.new_extra(G.Gen(900 + k).name("OBC", "M"), date(2001, 4, 10 + k), "M", None, "OBC")
            bride_dob = date(TODAY.year - LEGAL_MIN_AGE + 1, 3, 5 + k)
            b = self.t.new_extra(G.Gen(950 + k).name("OBC", "F"), bride_dob, "F", None, "OBC")
            rid = self.nid("MR-", 7)
            rows.append({"registration_no": rid, "marriage_date": (TODAY - timedelta(days=60 + k)).isoformat(),
                         "groom_name": self.p(g)["name"], "groom_dob": self.p(g)["dob"].isoformat(),
                         "bride_name_at_marriage": self.p(b)["name"], "bride_dob": bride_dob.isoformat(),
                         "registrar_office": "Hyderabad", "status": "REGISTERED"})
            self.link("marriage_register", rid, g, None)
            self.links.append(("marriage_register", rid + ":bride", b, None))
            self.case("UNDERAGE_MARRIAGE", "6.4", b, "marriage_register", rid, f"bride age {LEGAL_MIN_AGE - 1} at registration")
        # a live marriage for UC6.1 between two registry persons from different families (hero 3's daughter + an unmarried man)
        bride = self.p("a3000000-0000-0000-0000-000000000003") if False else None
        pool_b = [p for p in self.t.people.values() if p["registry"] and p["fid"].startswith("a3") and p["gender"] == "F" and p["occ"] == "student"]
        pool_g = [p for p in self.t.people.values() if p["registry"] and p["gender"] == "M" and 24 <= p["age"] <= 30 and p["marital"] == "SINGLE"
                  and not p["fid"].startswith("a")]
        if pool_b and pool_g:
            br, gm = pool_b[0], r.choice(pool_g)
            self.live.append({"order": len(self.live) + 1, "scenario": "6.1", "use_case": "UC6", "case_kind": "TWO_PARTY", "person_id": br["id"],
                              "family_id": br["fid"], "event_type": "MARRIAGE_REGISTERED",
                              "payload": {"groom_person": gm["id"], "bride_person": br["id"], "groom_name": gm["name"],
                                          "bride_name": br["name"], "marriage_date": (TODAY - timedelta(days=3)).isoformat(),
                                          "bride_name_after": br["name"].split()[0] + " " + gm["name"].split()[-1]}})
            self.case("LIVE_MARRIAGE", "6.1", br["id"], "live_events", f"live-{len(self.live):04d}", f"with {gm['id']}")
        return rows

    # ------------------------------------------------------------------ same-name father/son pairs (UC1.4)
    def same_name_pairs(self, revenue_rows):
        r, made = self.r, 0
        for fam in self.t.families.values():
            head = self.p(fam["head"])
            if made >= 12 or head["gender"] != "M":
                continue
            sons = [m for m in self.t.by_rel(fam["id"], "SON") if self.p(m)["age"] >= 18 and self.p(m)["alive"]]
            if not sons:
                continue
            rid = self.nid("RV-IC-", 7)
            son = self.p(sons[0])
            revenue_rows.append({"certificate_no": rid, "type": "INCOME", "holder_name": head["name"], "father_or_husband": "",
                                 "dob": son["dob"].isoformat(), "category": "", "annual_income": son["income"],
                                 "issued_on": (TODAY - timedelta(days=100)).isoformat(),
                                 "valid_until": (TODAY + timedelta(days=265)).isoformat(), "status": "ACTIVE",
                                 "address": fam["address"], "mandal": fam["mandal"], "district": fam["district"]})
            self.link("revenue_certificates", rid, son["id"])
            self.case("SAME_NAME_FATHER_SON", "1.4", son["id"], "revenue_certificates", rid,
                      f"certificate in the son's data carries the father's name {head['name']}; father is {head['id']}")
            made += 1


def write_csv(path: Path, rows: list[dict]):
    if not rows:
        path.write_text("")
        return
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def write_jsonl(path: Path, rows):
    with open(path, "w", encoding="utf-8") as f:
        for x in rows:
            f.write(json.dumps(x, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="/tmp/tg_sources")
    ap.add_argument("--count", type=int, default=1000, help="families, must match the registry load (default 1000)")
    ap.add_argument("--seed", type=int, default=42, help="must match the registry load (default 42)")
    ap.add_argument("--dirt", type=float, default=1.0, help="multiplier for data-quality problems (0 = clean, 2 = very dirty)")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    truth = Truth(a.count, a.seed)
    x = Extracts(truth, a.seed, a.dirt)

    idr = x.identity_reference()
    crs = x.crs()
    rev, land = x.revenue()
    x.same_name_pairs(rev)
    pds = x.pds()
    pen = x.pension()
    ele = x.electricity()
    stu = x.students()
    hsg = x.housing()
    mar = x.marriages()

    write_csv(out / "identity_reference.csv", idr)
    write_jsonl(out / "crs_events.jsonl", crs)
    write_csv(out / "revenue_certificates.csv", rev)
    write_csv(out / "revenue_land.csv", land)
    write_csv(out / "pds_view.csv", pds)
    write_csv(out / "pension_batch.csv", pen)
    write_csv(out / "electricity.csv", ele)
    write_csv(out / "student_portal.csv", stu)
    write_jsonl(out / "housing.jsonl", hsg)
    write_csv(out / "marriage_register.csv", mar)
    write_csv(out / "truth_links.csv", [dict(zip(("source", "source_record_id", "person_id", "family_id"), l)) for l in x.links])
    write_csv(out / "scenario_cases.csv", [dict(zip(("case_type", "scenario", "person_id", "source", "source_record_id", "detail"), c))
                                           for c in x.cases])
    write_jsonl(out / "live_events.jsonl", x.live)

    counts = {"identity_reference": len(idr), "crs_events": len(crs), "revenue_certificates": len(rev), "revenue_land": len(land),
              "pds_view": len(pds), "pension_batch": len(pen), "electricity": len(ele), "student_portal": len(stu), "housing": len(hsg),
              "marriage_register": len(mar), "live_events": len(x.live), "truth_links": len(x.links), "scenario_cases": len(x.cases)}
    lines = [f"Telangana synthetic department extracts (families={a.count}, seed={a.seed}, dirt={a.dirt})",
             f"persons in registry: {sum(1 for p in truth.people.values() if p['registry'])}; extra (outside registry): {truth.extra}", "",
             "records per source:"] + [f"  {k:22s}{v:>8,}" for k, v in counts.items()] + ["", "planted cases by type:"] + \
            [f"  {k:30s}{v:>6,}" for k, v in sorted(x.stats.items())]
    (out / "SUMMARY.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines), file=sys.stderr)
    print(f"written to {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
