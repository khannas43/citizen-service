"""Adapters: one function per department system, turning its native rows into the common Rec shape."""
from __future__ import annotations
import csv, json
from datetime import date
from pathlib import Path
from typing import Optional

from .model import Rec

# trust order used when building clusters: earlier sources anchor a person first
SOURCE_ORDER = ["crs", "identity_reference", "pension_batch", "revenue_certificates", "pds_view", "student_portal",
                "marriage_register", "revenue_land", "electricity", "housing"]

SOURCE_INFO = {
    "crs": ("Civil registration (CRS)", "REST API + event feed", 0),
    "identity_reference": ("Identity reference service", "REST API", 24 * 30),
    "revenue_certificates": ("Revenue: certificates", "REST API (rate limited)", 24 * 30),
    "revenue_land": ("Revenue: land records", "REST API (rate limited)", 24 * 365),
    "pds_view": ("Civil supplies (PDS)", "Read-only database views", 24 * 7),
    "pension_batch": ("Social security / pension MIS", "Daily batch file (SFTP, CSV)", 24),
    "electricity": ("Electricity distribution", "Legacy SOAP service", 24 * 30),
    "student_portal": ("Education / scholarship", "Web portal only (operator-keyed)", 24 * 90),
    "housing": ("Housing", "REST API", 24 * 30),
    "marriage_register": ("Marriage register", "REST API (partial coverage)", 24 * 30),
}


def _d(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _rows(path: Path):
    with open(path, encoding="utf-8", newline="") as f:
        yield from csv.DictReader(f)


def _jsonl(path: Path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def load_dir(folder: str | Path) -> list[Rec]:
    d = Path(folder)
    recs: list[Rec] = []

    def add(**kw):
        recs.append(Rec(pk=len(recs), **kw))

    for r in _rows(d / "identity_reference.csv"):
        add(source="identity_reference", rid=r["reference_token"], rtype="IDENTITY", name=r["name"], gender=r["gender"] or None,
            byear=int(r["birth_year"]) if r["birth_year"] else None, district=r["district"] or None, raw=r)
    for e in _jsonl(d / "crs_events.jsonl"):
        p, t = e["payload"], e["event_type"]
        if t == "BIRTH_REGISTERED":
            add(source="crs", rid=e["event_id"], rtype="BIRTH", name=p.get("child_name") or "", gender=p.get("gender"),
                dob=_d(p.get("date_of_birth")), district=p.get("place"), parents=[x for x in (p.get("father_name"), p.get("mother_name")) if x],
                as_of=e.get("published_time"), raw=e)
        elif t == "DEATH_REGISTERED":
            add(source="crs", rid=e["event_id"], rtype="DEATH", name=p.get("name") or "", age=p.get("age_at_death"),
                district=p.get("district"), as_of=e.get("published_time"), raw=e)
    for r in _rows(d / "revenue_certificates.csv"):
        add(source="revenue_certificates", rid=r["certificate_no"], rtype=r["type"], name=r["holder_name"], dob=_d(r["dob"]),
            district=r["district"] or None, mandal=r["mandal"] or None, address=r["address"] or None,
            parents=[r["father_or_husband"]] if r["father_or_husband"] else [], as_of=r["issued_on"], raw=r)
    for r in _rows(d / "revenue_land.csv"):
        add(source="revenue_land", rid=r["record_no"], rtype="LAND", name=r["owner_name"], district=r["district"] or None,
            mandal=r["mandal"] or None, village=r["village"] or None, as_of=r["last_updated"], raw=r)
    for r in _rows(d / "pds_view.csv"):
        add(source="pds_view", rid=r["row_id"], rtype="CARD_MEMBER", name=r["member_name"], gender=r["gender"] or None,
            age=int(r["age"]) if r["age"] else None, district=r["district"] or None, mandal=r["mandal"] or None,
            village=r["village"] or None, address=r["address_text"] or None, ration_card=r["ration_card_no"] or None,
            household_id=r["household_id"] or None, relation=r["relation"] or None, raw=r)
    for r in _rows(d / "pension_batch.csv"):
        add(source="pension_batch", rid=r["pensioner_id"], rtype="PENSIONER", name=r["name"], dob=_d(r["dob"]),
            district=r["district"] or None, mandal=r["mandal"] or None, village=r["village"] or None,
            as_of=r["extract_as_of"], raw=r)
    for r in _rows(d / "electricity.csv"):
        add(source="electricity", rid=r["service_no"], rtype="CONNECTION", name=r["consumer_name"], district=r["district"] or None,
            mandal=r["mandal"] or None, address=r["address_text"] or None, raw=r)
    for r in _rows(d / "student_portal.csv"):
        add(source="student_portal", rid=r["student_id"], rtype="STUDENT", name=r["name"], dob=_d(r["dob"]),
            parents=[x for x in (r["father_name"], r["mother_name"]) if x], raw=r)
    for e in _jsonl(d / "housing.jsonl"):
        add(source="housing", rid=e["application_id"], rtype="APPLICATION", name=e["applicant_name"], district=e["district"] or None,
            mandal=e["mandal"] or None, village=e["village"] or None, as_of=e["date"], raw=e)
    for r in _rows(d / "marriage_register.csv"):
        add(source="marriage_register", rid=r["registration_no"], rtype="MARRIAGE_GROOM", name=r["groom_name"], gender="M",
            dob=_d(r["groom_dob"]), district=r["registrar_office"] or None, as_of=r["marriage_date"], raw=r)
        add(source="marriage_register", rid=r["registration_no"] + ":bride", rtype="MARRIAGE_BRIDE", name=r["bride_name_at_marriage"],
            gender="F", dob=_d(r["bride_dob"]), district=r["registrar_office"] or None, as_of=r["marriage_date"], raw=r)
    return recs
