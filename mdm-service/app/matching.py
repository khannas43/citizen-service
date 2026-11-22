"""Explainable record linkage.

Pair scoring: weighted components (name, date of birth, gender, district/mandal/village, address, parents).
A component that cannot be compared (a field is missing on either side) is left out, and the total is capped when
too little evidence is available, so thin matches land in review instead of being linked silently.

Clustering: records are processed in source-trust order and attached to the best existing cluster. A confident, clear
winner is linked automatically; an ambiguous or middling match becomes a review task for a steward; the rest start a new
cluster. Every decision keeps the score breakdown as evidence.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field, asdict
from datetime import date
from itertools import combinations
from typing import Optional

from rapidfuzz import fuzz

from .model import Rec, REF_YEAR
from .names import tokens, skeleton
from .sources import SOURCE_ORDER


@dataclass
class MatchConfig:
    auto: float = 0.76
    review: float = 0.56
    margin: float = 0.08
    info_needed: float = 0.70
    weights: dict = field(default_factory=lambda: dict(name=0.40, dob=0.25, gender=0.05, district=0.05, mandal=0.05,
                                                       village=0.05, address=0.15, parents=0.10))
    dob_mismatch_factor: float = 0.45
    gender_mismatch_factor: float = 0.30
    district_mismatch_factor: float = 0.60
    same_source_conflict_factor: float = 0.60
    version: int = 1

    def to_json(self):
        return asdict(self)

    @staticmethod
    def from_json(d: dict) -> "MatchConfig":
        base = MatchConfig()
        for k, v in d.items():
            if hasattr(base, k):
                setattr(base, k, v)
        return base


# ----------------------------------------------------------------------------- preparation
def prepare(r: Rec) -> Rec:
    r.toks = tokens(r.name)
    r.keys = [skeleton(t) for t in r.toks]
    if r.dob:
        r.ylo = r.yhi = r.dob.year
    elif r.byear:
        r.ylo = r.yhi = r.byear
    elif r.age is not None:
        r.ylo, r.yhi = REF_YEAR - r.age - 1, REF_YEAR - r.age
    return r


# ----------------------------------------------------------------------------- components
def _tok_sim(ta: str, ka: str, tb: str, kb: str) -> tuple[float, str]:
    if len(ta) == 1 or len(tb) == 1:
        return (0.70, "initial") if ta[0] == tb[0] else (0.0, "")
    if ka == kb:
        return (1.0, "exact" if ta == tb else "phonetic")
    s = fuzz.ratio(ka, kb) / 100.0
    return (round(0.9 * s, 3), "fuzzy") if s >= 0.75 else (0.0, "")


def name_sim(a: Rec, b: Rec) -> tuple[Optional[float], str]:
    if not a.toks or not b.toks:
        return None, "name missing"
    pairs = []
    for i, (ta, ka) in enumerate(zip(a.toks, a.keys)):
        for j, (tb, kb) in enumerate(zip(b.toks, b.keys)):
            s, how = _tok_sim(ta, ka, tb, kb)
            if s > 0:
                pairs.append((s, i, j, how))
    pairs.sort(reverse=True)
    ui, uj, total, hows = set(), set(), 0.0, []
    for s, i, j, how in pairs:
        if i in ui or j in uj:
            continue
        ui.add(i); uj.add(j); total += s; hows.append(how)
    score = total / max(len(a.toks), len(b.toks))
    note = "+".join(hows) if hows else "no common token"
    if len(a.toks) != len(b.toks):
        note += f" ({len(a.toks)} vs {len(b.toks)} tokens)"
    # a bride's surname usually changes: same first name + same date of birth + both female
    if a.gender == "F" and b.gender == "F" and a.dob and a.dob == b.dob and a.keys and b.keys and a.keys[0] == b.keys[0]:
        if score < 0.85:
            score, note = 0.85, "first name matches, surname differs (change after marriage)"
    return round(score, 3), note


def _near_dob(a: date, b: date) -> bool:
    if abs((a - b).days) <= 31:
        return True
    if a.year == b.year and a.month == b.day and a.day == b.month:
        return True
    return a.month == b.month and a.day == b.day and abs(a.year - b.year) <= 2


def dob_sim(a: Rec, b: Rec) -> tuple[Optional[float], str, bool]:
    if a.dob and b.dob:
        if a.dob == b.dob:
            return 1.0, "exact date", False
        if _near_dob(a.dob, b.dob):
            return 0.45, f"near ({a.dob} vs {b.dob})", False
        return 0.0, f"differs ({a.dob} vs {b.dob})", True
    if a.ylo is None or b.ylo is None:
        return None, "date of birth not comparable", False
    if a.yhi < b.ylo or b.yhi < a.ylo:
        gap = max(a.ylo - b.yhi, b.ylo - a.yhi)
        if gap <= 2 and (a.ylo != a.yhi or b.ylo != b.yhi):
            return 0.25, f"reported age is {gap} year(s) off (ages in registers are often stale)", False
        return 0.0, f"birth year differs ({a.ylo}-{a.yhi} vs {b.ylo}-{b.yhi})", True
    exact_year = a.ylo == a.yhi and b.ylo == b.yhi
    if exact_year:
        return 0.70, "birth year matches", False
    one_exact = (a.ylo == a.yhi) != (b.ylo == b.yhi)
    return (0.60, "birth year within reported age", False) if one_exact else (0.45, "age consistent", False)


def _flat(x: str) -> str:
    return re.sub(r"[^a-z0-9]", "", x.lower())


def _eq(a: Optional[str], b: Optional[str], fuzzy: float = 0.0) -> Optional[float]:
    """Equal after ignoring case, spaces and punctuation; mandals and villages may also match approximately.
    Districts never match approximately (Ranga Reddy and Sangareddy are different districts)."""
    if not a or not b:
        return None
    a, b = _flat(a), _flat(b)
    if a == b:
        return 1.0
    if fuzzy and fuzz.ratio(a, b) / 100.0 >= fuzzy:
        return 0.8
    return 0.0


_ADDR_DROP = re.compile(r"\b(h\.?no|dist|district|mandal|village|v|m)\b|[().,\-]")


def addr_norm(s: str) -> tuple[str, str]:
    s = (s or "").lower()
    for a, b in (("col.", "colony"), ("ngr", "nagar"), ("rd", "road"), (" st", " street")):
        s = s.replace(a, b)
    m = re.search(r"\b(\d+)\b", s)
    house = m.group(1) if m else ""
    s = _ADDR_DROP.sub(" ", s)
    s = re.sub(r"\d+", " ", s)
    return house, re.sub(r"\s+", " ", s).strip()


def addr_sim(a: Rec, b: Rec) -> tuple[Optional[float], str]:
    if not a.address or not b.address:
        return None, ""
    ha, sa = addr_norm(a.address)
    hb, sb = addr_norm(b.address)
    text = fuzz.token_set_ratio(sa, sb) / 100.0
    if ha and hb:
        house = 1.0 if ha == hb else 0.0
        return round(0.4 * house + 0.6 * text, 3), f"house {'same' if house else 'differs'}, text {text:.2f}"
    return round(0.8 * text, 3), f"text {text:.2f}"


def parents_sim(a: Rec, b: Rec) -> tuple[Optional[float], str]:
    if not a.parents or not b.parents:
        return None, ""
    best = 0.0
    for pa in a.parents:
        for pb in b.parents:
            s, _ = name_sim(Rec(0, "", "", "", pa, toks=tokens(pa), keys=[skeleton(t) for t in tokens(pa)]),
                            Rec(0, "", "", "", pb, toks=tokens(pb), keys=[skeleton(t) for t in tokens(pb)]))
            best = max(best, s or 0)
    return round(best, 3), "parent name " + ("matches" if best >= 0.8 else "similar" if best >= 0.5 else "differs")


# Transgender (T) and not disclosed (N) say nothing about whether two records are one person, so they neither support nor count against a match.
NEUTRAL_GENDER = ("T", "N")


def _components(a: Rec, b: Rec) -> dict:
    d, dnote, dbad = dob_sim(a, b)
    n, nnote = name_sim(a, b)
    ad, anote = addr_sim(a, b)
    pr, pnote = parents_sim(a, b)
    return {
        "name": (n, nnote), "dob": (d, dnote), "gender": (None if not a.gender or not b.gender or a.gender in NEUTRAL_GENDER or b.gender in NEUTRAL_GENDER else (1.0 if a.gender == b.gender else 0.0), ""),
        "district": (_eq(a.district, b.district), ""), "mandal": (_eq(a.mandal, b.mandal, 0.88), ""),
        "village": (_eq(a.village, b.village, 0.88), ""), "address": (ad, anote), "parents": (pr, pnote),
    }


def combine(comps: dict, cfg: MatchConfig) -> tuple[float, dict]:
    """comps: component -> (score or None, note, source_pk). Returns (total, evidence)."""
    w = cfg.weights
    wsum = sum(w[k] for k, c in comps.items() if c[0] is not None)
    if wsum == 0 or comps["name"][0] is None:
        return 0.0, {"components": _fmt(comps, w), "total": 0.0, "note": "nothing to compare"}
    raw = sum(w[k] * c[0] for k, c in comps.items() if c[0] is not None) / wsum
    cap = min(1.0, wsum / cfg.info_needed)
    factors = []
    if comps["dob"][0] == 0.0:
        raw *= cfg.dob_mismatch_factor; factors.append("date of birth mismatch")
    if comps["gender"][0] == 0.0:
        raw *= cfg.gender_mismatch_factor; factors.append("gender mismatch")
    if comps["district"][0] == 0.0:
        raw *= cfg.district_mismatch_factor; factors.append("district mismatch")
    total = round(raw * cap, 4)
    return total, {"components": _fmt(comps, w), "info_weight": round(wsum, 3), "cap": round(cap, 3), "penalties": factors, "total": total}


def score_pair(a: Rec, b: Rec, cfg: MatchConfig) -> tuple[float, dict]:
    comps = {k: (v[0], v[1], b.pk) for k, v in _components(a, b).items()}
    return combine(comps, cfg)


def score_cluster(r: Rec, members: list, cfg: MatchConfig) -> tuple[float, dict]:
    """A cluster is a profile: take the best evidence per component across its member records.
    A mismatch counts only when no member agrees (for example every date of birth on file differs)."""
    best: dict = {}
    for m in members:
        for k, (v, note) in _components(r, m).items():
            cur = best.get(k)
            if v is None:
                continue
            if cur is None or v > cur[0]:
                best[k] = (v, note, m.pk)
    comps = {k: best.get(k, (None, "", None)) for k in ("name", "dob", "gender", "district", "mandal", "village", "address", "parents")}
    return combine(comps, cfg)


def _fmt(comps, w):
    return {k: {"score": None if c[0] is None else round(c[0], 3), "weight": w[k], "note": c[1],
                "from": c[2] if len(c) > 2 else None} for k, c in comps.items()}


# ----------------------------------------------------------------------------- clustering
def _rank(r: Rec) -> tuple:
    try:
        s = SOURCE_ORDER.index(r.source)
    except ValueError:
        s = len(SOURCE_ORDER)
    return (s, 0 if r.rtype == "BIRTH" else 1, r.pk)


def block_keys(r: Rec) -> set:
    ks = set()
    real = [k for t, k in zip(r.toks, r.keys) if len(t) > 1 and k]
    for a, b in combinations(sorted(set(real)), 2):
        ks.add(("pair", a, b))
    if r.ylo is not None:
        for y in range(r.ylo, r.yhi + 1):
            for k in set(real):
                ks.add(("ty", k, y))
    if r.dob:
        ks.add(("dob", r.dob.isoformat(), real[0] if real else ""))
    return ks


@dataclass
class Decision:
    pk: int
    status: str                 # AUTO_LINKED | IN_REVIEW | NEW
    cluster: int
    score: float = 0.0
    evidence: dict = field(default_factory=dict)
    candidates: list = field(default_factory=list)      # [(cluster, score, evidence)] best first (max 3)
    reason: str = ""


def cluster_records(recs: list[Rec], cfg: MatchConfig) -> tuple[dict[int, Decision], dict[int, list[int]]]:
    for r in recs:
        prepare(r)
    order = sorted(recs, key=_rank)
    members: dict[int, list[int]] = {}
    index: dict = {}
    by_pk = {r.pk: r for r in recs}
    decisions: dict[int, Decision] = {}
    next_cluster = 0

    def sources_in(cl, r):
        return any(by_pk[m].source == r.source and by_pk[m].rtype == r.rtype and
                   not (by_pk[m].raw.get("duplicate_of") or r.raw.get("duplicate_of")) for m in members[cl])

    ckeys: dict[int, set] = {}
    redirect: dict[int, int] = {}

    def merge(into: int, other: int, ev: dict):
        for k in ckeys.get(other, ()):
            index[k].discard(other)
            index[k].add(into)
        ckeys.setdefault(into, set()).update(ckeys.pop(other, set()))
        for m in members[other]:
            d = decisions[m]
            d.cluster = into
            if d.status != "AUTO_LINKED":
                d.status, d.reason, d.evidence = "AUTO_LINKED", "two clusters of the same person merged", ev
        redirect[other] = into
        members[into].extend(members.pop(other))

    for r in order:
        keys = block_keys(r)
        cands: set[int] = set()
        for k in keys:
            cands |= index.get(k, set())
        scored = []
        for cl in cands:
            mem = sorted(members[cl], key=lambda m: _rank(by_pk[m]))[:12]
            best, best_ev = score_cluster(r, [by_pk[m] for m in mem], cfg)
            if best >= 0 and sources_in(cl, r):
                best = round(best * cfg.same_source_conflict_factor, 4)
                best_ev["penalties"] = best_ev.get("penalties", []) + ["same source already in cluster"]
                best_ev["total"] = best
            scored.append((best, cl, best_ev))
        scored.sort(key=lambda x: -x[0])
        top = scored[0] if scored else None
        second = scored[1][0] if len(scored) > 1 else 0.0
        cand_list = [(cl, s, ev) for s, cl, ev in scored[:3] if s >= cfg.review * 0.8]
        attach = None
        if top and top[0] >= cfg.auto:
            if (top[0] - second) >= cfg.margin:
                attach = top[1]
            elif second >= cfg.auto:
                # two strong candidates: are they simply two fragments of the same person?
                c1, c2 = top[1], scored[1][1]
                m1 = [by_pk[m] for m in sorted(members[c1], key=lambda m: _rank(by_pk[m]))[:12]]
                s12 = max((score_cluster(by_pk[m], m1, cfg) for m in sorted(members[c2], key=lambda m: _rank(by_pk[m]))[:4]),
                          key=lambda x: x[0])
                ev12 = s12[1]["components"]
                compatible = (ev12["name"]["score"] or 0) >= 0.85 and ev12["dob"]["score"] != 0.0 and ev12["gender"]["score"] != 0.0 \
                    and ev12["district"]["score"] != 0.0
                if s12[0] >= cfg.auto or compatible:
                    merge(c1, c2, s12[1])
                    attach = c1
        if attach is not None:
            members[attach].append(r.pk)
            decisions[r.pk] = Decision(r.pk, "AUTO_LINKED", attach, top[0], top[2], cand_list)
            cl = attach
        else:
            cl = next_cluster
            next_cluster += 1
            members[cl] = [r.pk]
            if top and top[0] >= cfg.review:
                reason = "two plausible candidates" if (top[0] >= cfg.auto) else "possible match below the automatic threshold"
                decisions[r.pk] = Decision(r.pk, "IN_REVIEW", cl, top[0], top[2], cand_list, reason)
            else:
                decisions[r.pk] = Decision(r.pk, "NEW", cl, top[0] if top else 0.0, top[2] if top else {}, cand_list)
        ckeys.setdefault(cl, set()).update(keys)
        for k in keys:
            index.setdefault(k, set()).add(cl)
    def resolve(c: int) -> int:
        while c in redirect:
            c = redirect[c]
        return c

    for d in decisions.values():
        d.cluster = resolve(d.cluster)
        d.candidates = [(resolve(c), sc, ev) for c, sc, ev in d.candidates]
    return decisions, members
