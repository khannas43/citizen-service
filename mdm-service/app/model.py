from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

REF_YEAR = 2026          # "today" of the synthetic data (the registry uses 2026-06-21)


@dataclass
class Rec:
    pk: int
    source: str
    rid: str
    rtype: str
    name: str
    gender: Optional[str] = None
    dob: Optional[date] = None
    age: Optional[int] = None            # reported age (PDS, death records) - birth year is only approximate
    byear: Optional[int] = None          # reported birth year (identity service)
    district: Optional[str] = None
    mandal: Optional[str] = None
    village: Optional[str] = None
    address: Optional[str] = None
    ration_card: Optional[str] = None
    household_id: Optional[str] = None
    relation: Optional[str] = None
    parents: list = field(default_factory=list)
    as_of: Optional[str] = None
    raw: dict = field(default_factory=dict)
    # filled by prepare()
    toks: list = field(default_factory=list)
    keys: list = field(default_factory=list)
    ylo: Optional[int] = None
    yhi: Optional[int] = None

    def display(self) -> str:
        return self.name or ""
