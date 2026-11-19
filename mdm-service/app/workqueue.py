"""Officer work queue and Flow board (slice 1).

Every open proposal is classified into a reason_code and risk_class. Officers see groups by
reason, claim items, and batch-approve class B groups through events.decide_proposal.

Flow board definitions:
- received_24h: deliveries created in the last 24 hours for that department (kind EVENT).
- delivered: status DELIVERED in the last 24 hours.
- waiting_citizen: status PENDING_CONSENT (all time).
- retrying: RETRYING. failed: DEAD_LETTER (a delivery attempt that went wrong).
- stopped: BLOCKED_EXPIRED / BLOCKED_REFUSED / BLOCKED_REVOKED (consent ended, refused or withdrawn).
- needs_person: open proposals (PROPOSED) for that system (= routine + decision).
- routine: open items in batchable groups (class B).
- decision: open class C items.
- oldest_waiting_hours: the oldest of the open proposals and PENDING_CONSENT deliveries.
- on_time_pct: of items decided or delivered in the last 7 days, the share inside the
  applicable response time (default 30 days, per-use overrides from Policy).
- overdue: open items older than the applicable response time, and open unclaimed items
  older than 30 days (each item counted once).

UC1 identity linkage joins the same queue. An item is {kind: PROPOSAL|REVIEW|ISSUE, id} with the string key
p-<id> / r-<id> / i-<id>; a bare number is a proposal (slice 1 routes keep working). REVIEW items are open
mdm.review_task rows (reason LINK_NEAR, LINK_AMBIGUOUS, LINK_LOW_SEPARATE); ISSUE items are open dq_issue rows
where departments disagree (SOURCE_CONFLICT). They belong to MDM stewards: a department-scoped officer never
sees them. The Flow board "Identity linkage (MDM)" row counts exactly the items of those four reasons:
- received_24h: source records loaded in the last 24 hours. linked_automatically: of those, AUTO_LINKED.
- in_review: open review tasks plus open SOURCE_CONFLICT issues (the same items the four groups list).
- decided_today: review tasks decided today plus correction requests sent today.
- oldest_waiting_hours: oldest open identity item. on_time_pct: review tasks decided in the last 7 days inside the response time.
"""
from __future__ import annotations
import hashlib, hmac, json, logging, os, random, re, secrets, time
from datetime import datetime, timezone

from . import audit, exchange, events, feed, messages, stewardship
from .matching import MatchConfig
from .names import name_key, skeleton, tokens, has_telugu, telugu_to_latin
from .stewardship import Refused

log = logging.getLogger("mdm.workqueue")

# Kind → classification. Conditional kinds use classify() for the final reason.
KIND_BASE = {
    "ADD_TO_RATION_CARD": None,  # conditional
    "REVIEW_PARENTS": ("PARENT_REVIEW", "C"),
    "REQUEST_IDENTITY_REFERENCE": ("IDREF_REQUEST", "B"),
    "CONFIRM_DEATH": None,  # conditional
    "MARK_DECEASED_PDS": ("PDS_DECEASED", "C"),
    "STOP_PENSION": ("PENSION_STOP", "C"),
    "CLOSE_SCHOLARSHIP": ("SCHOLARSHIP_CLOSE", "C"),
    "NOTIFY_SPOUSE": ("DEATH_NOTICE", "B"),
    "NOTIFY_NOMINEE": ("DEATH_NOTICE", "B"),
    "NOTE_NEW_NAME": ("NAME_NOTE", "B"),
    "CONFIRM_MARRIAGE": ("MARRIAGE_CONFIRM", "C"),
    "REFER_UNDERAGE": ("UNDERAGE_REFERRAL", "C"),
    "REVIEW_DEPARTMENT_REJECTION": ("DEPT_REJECTION", "C"),
    "CITIZEN_CONFIRM": ("CITIZEN_CONFIRM", "C"),
    # Present in events.py; class C until slice 2 policy moves them.
    "FLAG_LAND_SUCCESSION": ("LAND_SUCCESSION", "C"),
    "FLAG_CONNECTION": ("CONNECTION_FLAG", "C"),
    "REVIEW_NEXT_OF_KIN": ("NEXT_OF_KIN", "C"),
    # UC4: a scholarship check that could not be answered becomes one item for a person.
    "RENEW_CERTIFICATE": ("CERT_EXPIRED", "B"),
    "SETTLE_SOURCE_CONFLICT": ("CERT_CONFLICT", "C"),
    "MANUAL_ROUTE": ("OTHER_STATE", "B"),
    # UC5: a housing check that shows a duplicate, a dead person on the card, a disagreement or no household.
    "REVIEW_DUPLICATE_BENEFIT": ("DUPLICATE_BENEFIT", "C"),
    "REVIEW_CARD_MEMBER": ("CARD_DEAD_ACTIVE", "C"),
    "SETTLE_HOUSEHOLD_CONFLICT": ("HOUSEHOLD_CONFLICT", "C"),
    "HOUSEHOLD_NOT_FOUND": ("NO_HOUSEHOLD", "B"),
}

LABELS = {
    "BIRTH_CLEAN": ("Add child to ration card: parents matched", "రేషన్ కార్డుకు బిడ్డను చేర్చండి: తల్లిదండ్రులు సరిపోయారు"),
    "BIRTH_LATE": ("Late birth registration", "ఆలస్య పుట్టిన నమోదు"),
    "BIRTH_PARENT_MINOR": ("Parent is under 18: a guardian must act", "తల్లి లేదా తండ్రి 18 ఏళ్ల లోపు వారు: సంరక్షకుడు చర్య తీసుకోవాలి"),
    "BIRTH_PARENT_UNSURE": ("Parent not confidently matched", "తల్లిదండ్రులు నమ్మకంగా సరిపోలలేదు"),
    "MARRIAGE_RATION": ("Add spouse to ration card after marriage", "వివాహం తర్వాత జీవిత భాగస్వామిని రేషన్ కార్డుకు చేర్చండి"),
    "PARENT_REVIEW": ("Parent match needs a person", "తల్లిదండ్రుల సరిపోలికకు వ్యక్తి అవసరం"),
    "IDREF_REQUEST": ("Request an identity reference", "గుర్తింపు సూచన కోరండి"),
    "DEATH_SINGLE": ("Death: one clear match", "మరణం: ఒక స్పష్టమైన సరిపోలిక"),
    "DEATH_AMBIGUOUS": ("Death: more than one possible person", "మరణం: ఒకటి కంటే ఎక్కువ వ్యక్తులు"),
    "PDS_DECEASED": ("Mark deceased in civil supplies", "సివిల్ సప్లైలలో మరణించినట్లు గుర్తించండి"),
    "PENSION_STOP": ("Stop pension", "పింఛన్ ఆపండి"),
    "SCHOLARSHIP_CLOSE": ("Close scholarship", "స్కాలర్‌షిప్ మూసివేయండి"),
    "DEATH_NOTICE": ("Notify spouse or nominee", "జీవిత భాగస్వామి లేదా నామినీకి తెలియజేయండి"),
    "NAME_NOTE": ("Note a new name after marriage", "వివాహం తర్వాత కొత్త పేరు నమోదు చేయండి"),
    "MARRIAGE_CONFIRM": ("Marriage: confirm the two people", "వివాహం: ఇద్దరు వ్యక్తులను నిర్ధారించండి"),
    "UNDERAGE_REFERRAL": ("Underage marriage referral", "అల్పవయస్క వివాహం రిఫరల్"),
    "DEPT_REJECTION": ("Department rejected a delivery", "శాఖ డెలివరీని తిరస్కరించింది"),
    "CITIZEN_CONFIRM": ("Citizen-confirmed correction", "పౌరుడు నిర్ధారించిన సవరణ"),
    "LAND_SUCCESSION": ("Note death against a land record", "భూమి రికార్డుపై మరణం నమోదు"),
    "CONNECTION_FLAG": ("Flag a utility connection after death", "మరణం తర్వాత యుటిలిటీ కనెక్షన్ ఫ్లాగ్"),
    "NEXT_OF_KIN": ("Find next of kin", "తదుపరి బంధువును కనుగొనండి"),
    "LINK_NEAR": ("Probably the same person", "బహుశా ఒకే వ్యక్తి"),
    "LINK_AMBIGUOUS": ("More than one possible person", "ఒకటి కంటే ఎక్కువ మంది వ్యక్తులు అయ్యే అవకాశం"),
    "LINK_LOW_SEPARATE": ("Unlikely to be the same person", "ఒకే వ్యక్తి అయ్యే అవకాశం తక్కువ"),
    "SOURCE_CONFLICT": ("Two departments disagree", "రెండు శాఖలు ఏకీభవించడం లేదు"),
    "CERT_EXPIRED": ("Certificate expired: ask the citizen to renew", "ధ్రువపత్రం గడువు ముగిసింది: పునరుద్ధరించమని పౌరుడిని కోరండి"),
    "CERT_CONFLICT": ("Certificates disagree", "ధ్రువపత్రాలు ఏకీభవించడం లేదు"),
    "OTHER_STATE": ("Applicant from another state: route manually", "మరో రాష్ట్ర దరఖాస్తుదారు: చేతితో పంపండి"),
    "DUPLICATE_BENEFIT": ("Household may already have housing assistance", "ఈ కుటుంబానికి ఇప్పటికే గృహ సహాయం ఉండవచ్చు"),
    "CARD_DEAD_ACTIVE": ("Deceased person still active on the ration card", "మరణించిన వ్యక్తి ఇంకా రేషన్ కార్డులో చురుకుగా ఉన్నారు"),
    "HOUSEHOLD_CONFLICT": ("Ration card and housing record disagree", "రేషన్ కార్డు మరియు గృహ రికార్డు ఏకీభవించడం లేదు"),
    "NO_HOUSEHOLD": ("No household on record: tell the applicant", "కుటుంబ రికార్డు లేదు: దరఖాస్తుదారుకు తెలియజేయండి"),
    "OTHER": ("Other — needs a person", "ఇతరం — వ్యక్తి అవసరం"),
}

SUGGESTIONS = {
    "BIRTH_CLEAN": ("Approve if the household and consent look right", "ఇంటి మరియు అనుమతి సరిగా ఉంటే ఆమోదించండి"),
    "BIRTH_LATE": ("Approve if documents for the late registration are present", "ఆలస్య నమోదు పత్రాలు ఉంటే ఆమోదించండి"),
    "BIRTH_PARENT_MINOR": ("A parent under 18 cannot consent; ask for a guardian or check the records", "18 ఏళ్ల లోపు తల్లిదండ్రులు సమ్మతి ఇవ్వలేరు; సంరక్షకుడిని కోరండి లేదా రికార్డులను పరిశీలించండి"),
    "BIRTH_PARENT_UNSURE": ("Confirm the parent first", "ముందుగా తల్లిదండ్రులను నిర్ధారించండి"),
    "MARRIAGE_RATION": ("Approve if the spouse card change is correct", "జీవిత భాగస్వామి కార్డు మార్పు సరిగా ఉంటే ఆమోదించండి"),
    "PARENT_REVIEW": ("Review each pair", "ప్రతి జంటను సమీక్షించండి"),
    "IDREF_REQUEST": ("Approve the identity reference request", "గుర్తింపు సూచన అభ్యర్థనను ఆమోదించండి"),
    "DEATH_SINGLE": ("Approve the clear match", "స్పష్టమైన సరిపోలికను ఆమోదించండి"),
    "DEATH_AMBIGUOUS": ("Choose from the list", "జాబితా నుండి ఎంచుకోండి"),
    "PDS_DECEASED": ("Confirm before marking the card", "కార్డుపై గుర్తించే ముందు నిర్ధారించండి"),
    "PENSION_STOP": ("Two people; held in a later release", "ఇద్దరు వ్యక్తులు; తర్వాతి విడుదలలో"),
    "SCHOLARSHIP_CLOSE": ("Confirm before closing", "మూసివేతకు ముందు నిర్ధారించండి"),
    "DEATH_NOTICE": ("Approve the notice", "నోటీసును ఆమోదించండి"),
    "NAME_NOTE": ("Approve the name note", "పేరు నోటును ఆమోదించండి"),
    "MARRIAGE_CONFIRM": ("Confirm the two people", "ఇద్దరు వ్యక్తులను నిర్ధారించండి"),
    "UNDERAGE_REFERRAL": ("Refer to the authorised officer", "అధికారికి రిఫర్ చేయండి"),
    "DEPT_REJECTION": ("Fix data or re-send", "డేటా సరిచేయండి లేదా మళ్లీ పంపండి"),
    "CITIZEN_CONFIRM": ("Review the citizen's confirmation", "పౌరుని నిర్ధారణను సమీక్షించండి"),
    "LAND_SUCCESSION": ("Note for succession", "వారసత్వం కోసం నమోదు"),
    "CONNECTION_FLAG": ("Ask the household to transfer", "ఇంటివారిని బదిలీ చేయమని అడగండి"),
    "NEXT_OF_KIN": ("Find the next of kin", "తదుపరి బంధువును కనుగొనండి"),
    "LINK_NEAR": ("Compare the records side by side; link only if you are sure it is one person", "రికార్డులను పక్కపక్కన పోల్చండి; ఒకే వ్యక్తి అని ఖచ్చితంగా తెలిస్తేనే అనుసంధానించండి"),
    "LINK_AMBIGUOUS": ("Choose the right person, or keep the record separate, and give a reason", "సరైన వ్యక్తిని ఎంచుకోండి లేదా రికార్డును వేరుగా ఉంచండి, కారణం చెప్పండి"),
    "LINK_LOW_SEPARATE": ("Keep separate; open the sample before approving the group", "వేరుగా ఉంచండి; సమూహాన్ని ఆమోదించే ముందు నమూనాను తెరవండి"),
    "SOURCE_CONFLICT": ("Ask the department that owns the value to correct its record", "ఆ విలువ కలిగిన శాఖను తన రికార్డును సరిచేయమని కోరండి"),
    "CERT_EXPIRED": ("Approve to send the citizen one notice to renew; the certificate itself is never changed", "పునరుద్ధరించమని పౌరుడికి ఒక నోటీసు పంపడానికి ఆమోదించండి; ధ్రువపత్రం ఎప్పుడూ మారదు"),
    "CERT_CONFLICT": ("Record which certificate the issuing office should re-check, and why. No value is chosen here", "జారీ చేసిన కార్యాలయం ఏ ధ్రువపత్రాన్ని మళ్లీ పరిశీలించాలో, ఎందుకో నమోదు చేయండి. ఇక్కడ ఏ విలువనూ ఎంచుకోరు"),
    "OTHER_STATE": ("Route the applicant to the other state's process by hand", "దరఖాస్తుదారును ఆ రాష్ట్ర ప్రక్రియకు చేతితో పంపండి"),
    "DUPLICATE_BENEFIT": ("The automatic answer already refuses the duplicate. Look into it as a possible fraud signal and say why in your reason", "స్వయంచాలక సమాధానం ఇప్పటికే నకిలీని తిరస్కరిస్తుంది. దీనిని మోసం సూచనగా పరిశీలించి, మీ కారణంలో రాయండి"),
    "CARD_DEAD_ACTIVE": ("Ask Civil supplies to review the card; nothing is changed here", "కార్డును సమీక్షించమని పౌర సరఫరాలను కోరండి; ఇక్కడ ఏదీ మారదు"),
    "HOUSEHOLD_CONFLICT": ("Record which record the departments should re-check, and why. No value is chosen here", "ఏ రికార్డును శాఖలు మళ్లీ పరిశీలించాలో, ఎందుకో నమోదు చేయండి. ఇక్కడ ఏ విలువనూ ఎంచుకోరు"),
    "NO_HOUSEHOLD": ("Approve to send the applicant one notice and tell Housing; no record is changed", "దరఖాస్తుదారుకు ఒక నోటీసు పంపి గృహ శాఖకు తెలియజేయడానికి ఆమోదించండి; ఏ రికార్డూ మారదు"),
    "OTHER": ("Review individually", "విడివిడిగా సమీక్షించండి"),
}

BATCHABLE = {
    "BIRTH_CLEAN", "BIRTH_LATE", "MARRIAGE_RATION", "IDREF_REQUEST",
    "DEATH_SINGLE", "DEATH_NOTICE", "NAME_NOTE",
    "LINK_LOW_SEPARATE",           # UC1 X3: a wrong SEPARATE can still be linked later and sends nothing anywhere
    "CERT_EXPIRED",               # UC4: sends the citizen one notice and the issuing office one delivery; edits no certificate
    "OTHER_STATE",                # UC4: a manual routing note
    "NO_HOUSEHOLD",               # UC5: one notice to the applicant and one delivery to Housing; edits nothing
}

# UC1 identity linkage. REVIEW items come from mdm.review_task, ISSUE items from mdm.dq_issue.
REVIEW_REASONS = ("LINK_NEAR", "LINK_AMBIGUOUS", "LINK_LOW_SEPARATE", "SOURCE_CONFLICT")
REVIEW_TASK_REASONS = ("LINK_NEAR", "LINK_AMBIGUOUS", "LINK_LOW_SEPARATE")       # review_task.reason_code values
SOURCE_CONFLICT_CODES = frozenset({"DOB_CONFLICT", "GENDER_CONFLICT", "NAME_CONFLICT"})   # survivorship.derive_dq codes
REVIEW_CLASS = {"LINK_NEAR": "C", "LINK_AMBIGUOUS": "C", "LINK_LOW_SEPARATE": "B", "SOURCE_CONFLICT": "C"}
# These always need a reason, whatever the stored policy list says (the policy default lists them too).
REVIEW_REASON_REQUIRED = frozenset({"LINK_AMBIGUOUS", "SOURCE_CONFLICT", "CERT_CONFLICT", "DUPLICATE_BENEFIT", "HOUSEHOLD_CONFLICT"})
IDENTITY_SYSTEM = "mdm"
IDENTITY_ROW_NAME = "Identity linkage (MDM)"

UNCLAIMED_ESCALATE_DAYS = 30
DEFAULT_RESPONSE_DAYS = 30
TOKEN_TTL_SEC = 15 * 60

_env_secret = os.environ.get("BATCH_TOKEN_SECRET")
if _env_secret:
    _TOKEN_SECRET = _env_secret.encode() if isinstance(_env_secret, str) else _env_secret
else:
    _TOKEN_SECRET = secrets.token_hex(32).encode()
    log.warning("BATCH_TOKEN_SECRET unset; using a random secret for this process (batch tokens will not survive a restart)")


def match_threshold() -> float:
    return MatchConfig().auto


def label_for(reason_code: str, lang: str = "en") -> str:
    pair = LABELS.get(reason_code) or LABELS["OTHER"]
    return pair[1] if (lang or "en").startswith("te") else pair[0]


def suggestion_for(reason_code: str, lang: str = "en") -> str:
    pair = SUGGESTIONS.get(reason_code) or SUGGESTIONS["OTHER"]
    return pair[1] if (lang or "en").startswith("te") else pair[0]


def is_batchable(reason_code: str) -> bool:
    return reason_code in BATCHABLE


def _birth_parents_confident(detail: dict) -> bool:
    """Change 3: every named parent is confident (stored flag, or computed from defaults on read)."""
    parents = detail.get("parents") or {}
    if "confident" in parents and parents["confident"] is not None:
        return bool(parents["confident"])
    bar = float(exchange.DEFAULTS["parent_confirm_score"])
    require = bool(exchange.DEFAULTS["parent_confirm_requires_couple"])
    return exchange.parents_block_confident(parents, bar, require)


def classify(proposal_row: dict, threshold: float | None = None, parent_minor: bool = False) -> tuple[str, str]:
    """Return (reason_code, risk_class) for a proposal row (kind, uc, detail, options)."""
    thr = match_threshold() if threshold is None else threshold
    kind = proposal_row.get("kind") or ""
    detail = proposal_row.get("detail") or {}
    if isinstance(detail, str):
        detail = json.loads(detail)
    options = proposal_row.get("options") or []
    if isinstance(options, str):
        options = json.loads(options)
    uc = proposal_row.get("uc") or ""

    if kind == "ADD_TO_RATION_CARD":
        if uc == "UC6":
            return "MARRIAGE_RATION", "B"
        # Review 1 item 1 / Change 3: unsure unless every named parent is confident.
        # Stays unsure after REVIEW_PARENTS approve (stored confident=false is kept).
        if not _birth_parents_confident(detail):
            return "BIRTH_PARENT_UNSURE", "C"
        if parent_minor:                      # a named parent is under the adult age: they cannot give the consent this needs
            return "BIRTH_PARENT_MINOR", "C"
        if detail.get("late_registration"):
            return "BIRTH_LATE", "B"
        return "BIRTH_CLEAN", "B"

    if kind == "CONFIRM_DEATH":
        opts = options if isinstance(options, list) else []
        if len(opts) == 1 and float(opts[0].get("score") or 0) >= thr:
            return "DEATH_SINGLE", "B"
        return "DEATH_AMBIGUOUS", "C"

    base = KIND_BASE.get(kind)
    if base is None:
        return "OTHER", "C"
    return base


def known_kinds_in_events_source(src: str) -> set[str]:
    """Proposal kind string literals used when calling _propose / add() in events.py."""
    kinds = set()
    for m in re.finditer(r'_propose\((.*?)\)', src, flags=re.S):
        args = [a for a in re.findall(r'["\']([A-Z][A-Z0-9_]{2,})["\']', m.group(1)) if not re.fullmatch(r'UC\d', a)]
        if args:
            kinds.add(args[0])  # kind is the first non-UC string arg
    kinds |= set(re.findall(r'add\(\s*["\']([A-Z][A-Z0-9_]+)["\']', src))
    kinds.add("CITIZEN_CONFIRM")  # raised from citizen.py via _propose
    kinds.add("REVIEW_DEPARTMENT_REJECTION")  # raised from feed
    kinds |= {"RENEW_CERTIFICATE", "SETTLE_SOURCE_CONFLICT", "MANUAL_ROUTE"}  # UC4, raised from uc4.py via _propose
    kinds |= {"REVIEW_DUPLICATE_BENEFIT", "REVIEW_CARD_MEMBER", "SETTLE_HOUSEHOLD_CONFLICT", "HOUSEHOLD_NOT_FOUND"}  # UC5, raised from uc5.py via _propose
    return kinds


def _parent_is_minor(cur, row: dict) -> bool:
    """True when a named parent of a birth item is younger than the adult age (policy), so cannot consent."""
    if row.get("kind") != "ADD_TO_RATION_CARD" or row.get("uc") == "UC6":
        return False
    detail = row.get("detail") or {}
    if isinstance(detail, str):
        detail = json.loads(detail)
    adult = int(exchange.current(cur).get("adult_age") or 18)
    for side in ("mother", "father"):
        v = (detail.get("parents") or {}).get(side)
        pid = v.get("person_id") if isinstance(v, dict) else None
        if pid:
            age = exchange.person_age(cur, pid)
            if age is not None and age < adult:
                return True
    return False


def apply_classification(cur, prop_id: int | None = None) -> tuple[str, str]:
    """Classify one proposal, or re-classify every open proposal when prop_id is None."""
    thr = match_threshold()
    if prop_id is None:
        cur.execute("SELECT id, kind, uc, detail, options, reason_code, risk_class FROM mdm.proposal WHERE status='PROPOSED'")
        for row in cur.fetchall():
            code, cls = classify(row, thr, _parent_is_minor(cur, row))
            if row.get("reason_code") != code or row.get("risk_class") != cls:
                cur.execute("UPDATE mdm.proposal SET reason_code=%s, risk_class=%s WHERE id=%s", (code, cls, row["id"]))
        return "", ""
    cur.execute("SELECT id, kind, uc, detail, options FROM mdm.proposal WHERE id=%s", (prop_id,))
    row = cur.fetchone()
    if not row:
        raise Refused("Proposal not found", 404)
    code, cls = classify(row, thr, _parent_is_minor(cur, row))
    cur.execute("UPDATE mdm.proposal SET reason_code=%s, risk_class=%s WHERE id=%s", (code, cls, prop_id))
    return code, cls


def backfill_system_codes(cur) -> int:
    """Set system_code from the display name (or code) on every proposal missing it or out of date."""
    cur.execute("SELECT id, system, system_code FROM mdm.proposal")
    n = 0
    for row in cur.fetchall():
        code = exchange.system_code(row["system"])
        if row.get("system_code") != code:
            cur.execute("UPDATE mdm.proposal SET system_code=%s WHERE id=%s", (code, row["id"]))
            n += 1
    return n


def backfill(cur) -> None:
    """One-shot after migration / at start-up: system_code + re-classify open proposals and open review tasks. Reads must not write."""
    backfill_system_codes(cur)
    apply_classification(cur)
    apply_review_classification(cur)


# ------------------------------------------------------------------ UC1: keys
_KEY_PREFIX = {"PROPOSAL": "p", "REVIEW": "r", "ISSUE": "i"}
_PREFIX_KIND = {v: k for k, v in _KEY_PREFIX.items()}


def format_key(kind: str, item_id: int) -> str:
    """('REVIEW', 45) -> 'r-45'. The prefix keeps proposal, review-task and issue ids from colliding."""
    try:
        return f"{_KEY_PREFIX[kind]}-{int(item_id)}"
    except KeyError:
        raise Refused("Not a valid work item kind", 422)


def parse_key(key) -> tuple[str, int]:
    """'p-123' / 'r-45' / 'i-9' -> (kind, id). A bare number (slice 1) is a proposal."""
    if isinstance(key, bool):
        raise Refused("Not a valid work item key", 422)
    if isinstance(key, int):
        return "PROPOSAL", key
    text = str(key).strip().lower()
    if text.isdigit():
        return "PROPOSAL", int(text)
    m = re.fullmatch(r"([pri])-(\d+)", text)
    if not m:
        raise Refused("Not a valid work item key", 422)
    return _PREFIX_KIND[m.group(1)], int(m.group(2))


def _norm_key(key) -> str:
    return format_key(*parse_key(key))


def _public_id(key: str):
    """Proposal ids stay plain numbers in responses (slice 1 clients); review and issue ids are string keys."""
    kind, i = parse_key(key)
    return i if kind == "PROPOSAL" else format_key(kind, i)


def _split_keys(ids) -> dict[str, list[int]]:
    by: dict[str, list[int]] = {"PROPOSAL": [], "REVIEW": [], "ISSUE": []}
    for k in ids or []:
        kind, i = parse_key(k)
        if i not in by[kind]:
            by[kind].append(i)
    return by


def identity_visible(scope: str | None) -> bool:
    """Identity linkage items belong to MDM stewards. A department code (pds, health, ...) never sees them."""
    return not scope or scope == IDENTITY_SYSTEM


# ------------------------------------------------------------------ UC1: classification of review tasks
def link_near_margin(cur=None) -> float:
    """Policy value link_near_margin (default 0.06): how far below the automatic score still counts as 'probably the same person'."""
    pol = exchange.current(cur) if cur is not None else exchange.DEFAULTS
    return float(pol.get("link_near_margin", exchange.DEFAULTS["link_near_margin"]))


def _cand_scores(row: dict) -> list[float]:
    cands = row.get("candidates") or []
    if isinstance(cands, str):
        cands = json.loads(cands)
    return sorted((float(c.get("score") or 0) for c in cands if isinstance(c, dict)), reverse=True)


def classify_review(row: dict, cur=None, near_margin: float | None = None, threshold: float | None = None) -> tuple[str, str]:
    """Return (reason_code, risk_class) for an open review task.

    row: candidates [{person_id, score}], score (the record's best score), dob_conflict, gender_conflict.
    Config values (auto, review, margin, link_near_margin) are read, never copied.
    - two or more candidates within margin of each other: LINK_AMBIGUOUS (C)
    - best score from auto - link_near_margin up: LINK_NEAR (C), unless the dates of birth or genders conflict
      (then a person must look at it with a reason: LINK_AMBIGUOUS)
    - best score from review up to below auto - link_near_margin: LINK_LOW_SEPARATE (B)
    - anything else (no usable score): LINK_AMBIGUOUS, one by one
    """
    cfg = MatchConfig()
    auto = match_threshold() if threshold is None else threshold
    near = link_near_margin(cur) if near_margin is None else near_margin
    scores = _cand_scores(row)
    best = scores[0] if scores else float(row.get("score") or 0)
    if len(scores) >= 2 and scores[0] - scores[1] < cfg.margin:
        return "LINK_AMBIGUOUS", REVIEW_CLASS["LINK_AMBIGUOUS"]
    if best >= auto - near:
        if row.get("dob_conflict") or row.get("gender_conflict"):
            return "LINK_AMBIGUOUS", REVIEW_CLASS["LINK_AMBIGUOUS"]
        return "LINK_NEAR", REVIEW_CLASS["LINK_NEAR"]
    if best >= cfg.review:
        return "LINK_LOW_SEPARATE", REVIEW_CLASS["LINK_LOW_SEPARATE"]
    return "LINK_AMBIGUOUS", REVIEW_CLASS["LINK_AMBIGUOUS"]


_REVIEW_CLASSIFY_SQL = """
    SELECT t.id, t.candidates, t.reason_code, t.risk_class, r.score,
           (r.dob IS NOT NULL AND p.dob IS NOT NULL AND r.dob <> p.dob)
             OR (r.dob IS NULL AND r.birth_year IS NOT NULL AND p.birth_year IS NOT NULL AND abs(r.birth_year - p.birth_year) > 1) AS dob_conflict,
           (r.gender IS NOT NULL AND p.gender IS NOT NULL AND r.gender <> p.gender) AS gender_conflict
    FROM mdm.review_task t
    JOIN mdm.source_record r ON r.id=t.record_id
    LEFT JOIN mdm.person p ON p.id = (
        SELECT (c->>'person_id')::bigint FROM jsonb_array_elements(t.candidates) c
         ORDER BY (c->>'score')::float DESC NULLS LAST LIMIT 1)
"""


def apply_review_classification(cur, task_id: int | None = None) -> tuple[str, str]:
    """Classify one review task, or re-classify every open one when task_id is None."""
    near = link_near_margin(cur)
    thr = match_threshold()
    if task_id is None:
        cur.execute(_REVIEW_CLASSIFY_SQL + " WHERE t.status='OPEN'")
        for row in cur.fetchall():
            code, cls = classify_review(row, None, near, thr)
            if row.get("reason_code") != code or row.get("risk_class") != cls:
                cur.execute("UPDATE mdm.review_task SET reason_code=%s, risk_class=%s WHERE id=%s", (code, cls, row["id"]))
        return "", ""
    cur.execute(_REVIEW_CLASSIFY_SQL + " WHERE t.id=%s", (task_id,))
    row = cur.fetchone()
    if not row:
        raise Refused("Review task not found", 404)
    code, cls = classify_review(row, None, near, thr)
    cur.execute("UPDATE mdm.review_task SET reason_code=%s, risk_class=%s WHERE id=%s", (code, cls, task_id))
    return code, cls


def needs_reason(pol: dict, reason_code: str) -> bool:
    """A link decision or a conflict request needs a typed reason: always for LINK_AMBIGUOUS / SOURCE_CONFLICT, or when the policy says so."""
    return reason_code in REVIEW_REASON_REQUIRED or exchange.needs_reason(pol, reason_code)


def _age_hours(ts) -> float:
    if not ts:
        return 0.0
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return max(0.0, (datetime.now(timezone.utc) - ts).total_seconds() / 3600.0)


def _response_days(cur, purpose: str | None = None) -> int:
    pol = exchange.current(cur)
    return int(pol.get("department_response_days") or DEFAULT_RESPONSE_DAYS)


def _overdue(row, response_days: int) -> bool:
    age_h = _age_hours(row.get("created_at"))
    if age_h > response_days * 24:
        return True
    if not row.get("claimed_by") and age_h > UNCLAIMED_ESCALATE_DAYS * 24:
        return True
    return False


def _lang(header: str | None) -> str:
    return messages.pick_language(header or "en")


def _system_filter_code(system) -> str | None:
    return exchange.system_code(system) if system else None


def _review_filters(claimed, actor, q) -> tuple[list[str], list]:
    where, p = ["t.status='OPEN'", "t.reason_code = ANY(%s)"], [list(REVIEW_TASK_REASONS)]
    if claimed == "me" and actor:
        where.append("t.claimed_by=%s"); p.append(actor)
    elif claimed == "none":
        where.append("t.claimed_by IS NULL")
    if q:
        where.append("(r.name ILIKE %s OR r.source_rid ILIKE %s OR t.reason_code ILIKE %s OR pe.name ILIKE %s OR pe.mdm_id ILIKE %s)")
        p += [f"%{q}%"] * 5
    return where, p


def _issue_filters(claimed, actor, q) -> tuple[list[str], list]:
    # Issues are not claimed (dq_issue has no claim columns): a "mine" filter has none, "unclaimed" has all.
    where, p = ["i.status='OPEN'", "i.code = ANY(%s)"], [sorted(SOURCE_CONFLICT_CODES)]
    if claimed == "me":
        where.append("false")
    if q:
        where.append("(i.detail ILIKE %s OR i.code ILIKE %s OR pe.name ILIKE %s OR pe.mdm_id ILIKE %s OR 'SOURCE_CONFLICT' ILIKE %s)")
        p += [f"%{q}%"] * 5
    return where, p


_REVIEW_FROM = """FROM mdm.review_task t JOIN mdm.source_record r ON r.id=t.record_id
                  LEFT JOIN mdm.person pe ON pe.id=r.person_id"""
_ISSUE_FROM = "FROM mdm.dq_issue i LEFT JOIN mdm.person pe ON pe.id=i.person_id"


def identity_counts(cur, claimed=None, actor=None, q=None) -> dict[str, dict]:
    """{reason_code: {count, oldest, claimed, overdue_n}} for open review tasks and open source conflicts.
    The groups and the Flow board identity row both read this, so their numbers agree."""
    out: dict[str, dict] = {}
    where, p = _review_filters(claimed, actor, q)
    cur.execute(f"""
        SELECT t.reason_code, count(*) AS count, min(t.created_at) AS oldest,
               count(*) FILTER (WHERE t.claimed_by IS NOT NULL) AS claimed,
               count(*) FILTER (WHERE t.claimed_by IS NULL AND t.created_at < now() - interval '{UNCLAIMED_ESCALATE_DAYS} days') AS overdue_n
        {_REVIEW_FROM} WHERE {' AND '.join(where)} GROUP BY t.reason_code""", p)
    for r in cur.fetchall():
        out[r["reason_code"]] = dict(r)
    where, p = _issue_filters(claimed, actor, q)
    cur.execute(f"""
        SELECT count(*) AS count, min(i.created_at) AS oldest,
               count(*) FILTER (WHERE i.created_at < now() - interval '{UNCLAIMED_ESCALATE_DAYS} days') AS overdue_n
        {_ISSUE_FROM} WHERE {' AND '.join(where)}""", p)
    r = cur.fetchone()
    if r and r["count"]:
        out["SOURCE_CONFLICT"] = {**dict(r), "claimed": 0}
    return out


def groups(cur, system=None, risk_class=None, claimed=None, q=None, actor=None, accept_language=None) -> dict:
    where, p = ["pr.status='PROPOSED'", "pr.reason_code IS NOT NULL"], []
    code = _system_filter_code(system)
    if code:
        where.append("pr.system_code=%s"); p.append(code)
    if risk_class:
        where.append("pr.risk_class=%s"); p.append(risk_class)
    if claimed == "me" and actor:
        where.append("pr.claimed_by=%s"); p.append(actor)
    elif claimed == "none":
        where.append("pr.claimed_by IS NULL")
    if q:
        where.append("(pr.summary ILIKE %s OR pr.reason_code ILIKE %s OR pe.name ILIKE %s)")
        p += [f"%{q}%"] * 3
    w = " AND ".join(where)
    cur.execute(f"""
        SELECT pr.reason_code, pr.risk_class,
               count(*) AS count,
               min(pr.created_at) AS oldest,
               array_agg(DISTINCT pr.system_code) AS systems,
               count(*) FILTER (WHERE pr.claimed_by IS NOT NULL) AS claimed,
               count(*) FILTER (WHERE pr.claimed_by IS NULL AND pr.created_at < now() - interval '{UNCLAIMED_ESCALATE_DAYS} days') AS overdue_n
        FROM mdm.proposal pr
        LEFT JOIN mdm.person pe ON pe.id=pr.person_id
        WHERE {w}
        GROUP BY pr.reason_code, pr.risk_class
    """, p)
    rows = [dict(r) for r in cur.fetchall()]
    # UC1: identity groups (review tasks and source conflicts) for MDM stewards only; a department code omits them.
    if identity_visible(code):
        for reason, r in identity_counts(cur, claimed, actor, q).items():
            if risk_class and REVIEW_CLASS[reason] != risk_class:
                continue
            rows.append({"reason_code": reason, "risk_class": REVIEW_CLASS[reason], "count": r["count"], "oldest": r["oldest"],
                         "systems": [IDENTITY_SYSTEM], "claimed": r.get("claimed") or 0, "overdue_n": r.get("overdue_n") or 0})
    lang = _lang(accept_language)
    resp_days = _response_days(cur)
    out = []
    for r in rows:
        oldest_h = _age_hours(r["oldest"])
        overdue = bool(r["overdue_n"]) or oldest_h > resp_days * 24
        out.append({
            "reason_code": r["reason_code"],
            "label": label_for(r["reason_code"], lang),
            "risk_class": r["risk_class"],
            "count": r["count"],
            "oldest_hours": round(oldest_h, 1),
            "systems": [s for s in (r["systems"] or []) if s],
            "batchable": is_batchable(r["reason_code"]),
            "suggestion": suggestion_for(r["reason_code"], lang),
            "claimed": r["claimed"],
            "overdue": overdue,
        })
    out.sort(key=lambda g: (0 if g["overdue"] else 1, -g["oldest_hours"]))
    return {"groups": out, "total_items": sum(g["count"] for g in out)}


def _confidence(pr: dict) -> float:
    detail = pr.get("detail") or {}
    options = pr.get("options") or []
    scores = []
    if isinstance(options, list):
        for o in options:
            if isinstance(o, dict) and o.get("score") is not None:
                scores.append(float(o["score"]))
    parents = (detail.get("parents") or {}) if isinstance(detail, dict) else {}
    for side in ("mother", "father"):
        p = parents.get(side) or {}
        if p.get("score") is not None:
            scores.append(float(p["score"]))
    if not scores:
        return 1.0
    return min(scores)


def evidence(cur, pr: dict) -> dict:
    detail = pr.get("detail") or {}
    options = pr.get("options") or []
    reason = pr.get("reason_code") or ""
    out = {"summary": pr.get("summary"), "consent": None, "candidates": []}
    if reason in ("PARENT_REVIEW", "BIRTH_CLEAN", "BIRTH_LATE", "BIRTH_PARENT_UNSURE", "BIRTH_PARENT_MINOR",
                  "DEATH_SINGLE", "DEATH_AMBIGUOUS", "MARRIAGE_CONFIRM"):
        if isinstance(options, list):
            out["candidates"] = options[:5]
        elif isinstance(options, dict):
            out["candidates"] = options
        out["parents"] = detail.get("parents")
        out["fields_differ"] = detail.get("candidates")
    else:
        out["detail"] = {k: detail[k] for k in list(detail)[:8]} if isinstance(detail, dict) else detail
    try:
        info = feed.proposal_info(cur, pr)
        out["dept"] = info
    except Exception:  # noqa: BLE001
        out["dept"] = None
    if pr.get("kind") == "ADD_TO_RATION_CARD":
        cur.execute("""SELECT status FROM mdm.consent WHERE event_id=%s AND purpose='BIRTH_PDS' ORDER BY id DESC LIMIT 1""",
                    (pr.get("event_id"),))
        c = cur.fetchone()
        out["consent"] = c["status"] if c else None
    return out


# ------------------------------------------------------------------ UC1: evidence for a link decision
_FIELDS = ("name", "dob", "gender", "district", "mandal", "village", "address", "parents", "ration_card")


def _latin(name: str | None) -> str | None:
    return telugu_to_latin(name) if name and has_telugu(name) else None


def _name_block(name: str | None) -> dict:
    """The name as written, its transliteration (Telugu script only) and the phonetic skeleton per word from names.py."""
    toks = tokens(name or "")
    return {"name": name, "transliteration": _latin(name), "words": toks,
            "skeleton": [skeleton(t) for t in toks], "key": name_key(name or "")}


def _same(field: str, a, b) -> bool:
    if field == "name":
        return name_key(a or "") == name_key(b or "")
    if field == "parents":
        norm = lambda v: sorted(name_key(x) for x in (v or []) if isinstance(x, str))  # noqa: E731
        return norm(a) == norm(b)
    if field == "dob":
        return str(a)[:10] == str(b)[:10]
    return re.sub(r"[^a-z0-9]", "", str(a).lower()) == re.sub(r"[^a-z0-9]", "", str(b).lower())


def _differs(rec: dict, cand: dict) -> list[str]:
    """Fields where both sides state a value and the values differ. Shown with a word and a mark, not by colour alone."""
    out = []
    for f in _FIELDS:
        a, b = rec.get(f), cand.get(f)
        if f == "dob" and not (a and b):                       # no exact date on one side: compare the year when both give one
            ya, yb = rec.get("birth_year"), cand.get("birth_year")
            if ya and yb and abs(int(ya) - int(yb)) > 1:
                out.append("dob")
            continue
        if a in (None, "", []) or b in (None, "", []):
            continue
        if not _same(f, a, b):
            out.append(f)
    return out


def _source_name(src: str | None) -> str | None:
    from .sources import SOURCE_INFO
    return SOURCE_INFO[src][0] if src in SOURCE_INFO else src


def evidence_for_review(cur, row: dict) -> dict:
    """The record and each candidate side by side: name (script, transliteration, skeleton), date of birth, gender,
    district, mandal, village, address, parents, ration card, source department and as-of date, the stored per-attribute
    scores, and the fields that differ."""
    parents = row.get("parents") or []
    if isinstance(parents, str):
        parents = json.loads(parents)
    rec = {"record_id": row.get("record_id"), "source": row.get("source"), "source_name": _source_name(row.get("source")),
           "source_rid": row.get("source_rid"), "as_of": row.get("as_of"), "dob": row.get("dob"), "birth_year": row.get("birth_year"),
           "gender": row.get("gender"), "district": row.get("district"), "mandal": row.get("mandal"), "village": row.get("village"),
           "address": row.get("address"), "parents": list(parents), "ration_card": row.get("ration_card"),
           "scores": row.get("record_evidence"), **_name_block(row.get("name"))}
    cands = row.get("candidates") or []
    if isinstance(cands, str):
        cands = json.loads(cands)
    out_c = []
    for n, c in enumerate((c for c in cands if isinstance(c, dict) and c.get("person_id")), 1):
        cur.execute("""SELECT id, mdm_id, name, name_local, gender, dob, birth_year, district, mandal, village, address
                       FROM mdm.person WHERE id=%s""", (c["person_id"],))
        pe = cur.fetchone()
        if not pe:
            continue
        cur.execute("""SELECT source, ration_card, parents, as_of FROM mdm.source_record WHERE person_id=%s ORDER BY id LIMIT 8""",
                    (c["person_id"],))
        recs = cur.fetchall()
        cand = {"n": n, "person_id": pe["id"], "mdm_id": pe["mdm_id"], "score": c.get("score"), "scores": c.get("evidence"),
                "dob": pe["dob"], "birth_year": pe["birth_year"], "gender": pe["gender"], "district": pe["district"],
                "mandal": pe["mandal"], "village": pe["village"], "address": pe["address"],
                "ration_card": next((x["ration_card"] for x in recs if x["ration_card"]), None),
                "parents": next((list(x["parents"]) for x in recs if x["parents"]), []),
                "name_local": pe["name_local"],
                "sources": [{"source": x["source"], "source_name": _source_name(x["source"]), "as_of": x["as_of"]} for x in recs],
                **_name_block(pe["name"])}
        cand["differs"] = _differs(rec, cand)
        out_c.append(cand)
    return {"record": rec, "candidates": out_c, "own_person": row.get("own_person"),
            "decisions": ["LINK", "SEPARATE", "SKIP"],
            "reason_required": row.get("reason_code") in REVIEW_REASON_REQUIRED,
            "keys": {"A": "link to the first candidate", "1-9": "choose candidate", "S": "keep separate", "N": "next"}}


_CONFLICT_ATTR = {"DOB_CONFLICT": "dob", "GENDER_CONFLICT": "gender", "NAME_CONFLICT": "name"}


def evidence_for_issue(cur, row: dict) -> dict:
    """Each department's value for the disputed detail. The steward can only send a correction request to the owner."""
    from .ops import ATTR_AUTH, SOURCE_SYSTEM
    attr = _CONFLICT_ATTR.get(row.get("code"), "")
    out = {"code": row.get("code"), "detail": row.get("detail"), "attribute": attr, "values": [],
           "owner": ATTR_AUTH.get("date_of_birth" if attr == "dob" else attr),
           "action": "REQUEST_CORRECTION", "reason_required": True}
    if row.get("person_id"):
        cur.execute("""SELECT source, name, dob, gender, as_of FROM mdm.source_record WHERE person_id=%s ORDER BY id""", (row["person_id"],))
        seen = set()
        for r in cur.fetchall():
            v = r.get({"dob": "dob", "gender": "gender", "name": "name"}.get(attr, "name"))
            if v in (None, "") or (r["source"], str(v)) in seen:
                continue
            seen.add((r["source"], str(v)))
            out["values"].append({"value": v, "source": r["source"], "source_name": _source_name(r["source"]),
                                  "department": SOURCE_SYSTEM.get(r["source"]), "as_of": r["as_of"]})
    return out


def _best_score(candidates) -> float:
    s = _cand_scores({"candidates": candidates})
    return s[0] if s else 0.0


_REVIEW_SELECT = """
    SELECT t.id, t.record_id, t.candidates, t.status, t.reason_code, t.risk_class, t.claimed_by, t.claimed_at, t.batch_id, t.created_at,
           r.source, r.source_rid, r.rtype, r.name, r.gender, r.dob, r.age, r.birth_year, r.district, r.mandal, r.village,
           r.address, r.ration_card, r.parents, r.as_of, r.score, r.evidence AS record_evidence, r.person_id AS own_person,
           pe.name AS person_name, pe.mdm_id
"""


def _review_item(cur, r: dict, pol: dict, resp_days: int) -> dict:
    cands = r["candidates"] or []
    best = _best_score(cands) or float(r.get("score") or 0)
    cand_name = None
    if cands:
        cur.execute("SELECT name FROM mdm.person WHERE id=%s", (cands[0].get("person_id"),))
        x = cur.fetchone()
        cand_name = x["name"] if x else None
    item = {k: r[k] for k in ("id", "record_id", "reason_code", "risk_class", "status", "claimed_by", "claimed_at", "batch_id",
                              "created_at", "source", "source_rid", "own_person", "person_name", "mdm_id")}
    age = _age_hours(r["created_at"])
    item.update({
        "key": format_key("REVIEW", r["id"]), "kind": "REVIEW", "proposal_kind": None,
        "summary": f"{r['name'] or 'A record'} ({_source_name(r['source'])}) may be the same person as {cand_name or 'a candidate'}"
                   if cands else f"{r['name'] or 'A record'} ({_source_name(r['source'])}) waits for a person to decide",
        "person_id": r.get("own_person"), "system_code": IDENTITY_SYSTEM, "score": float(r["score"]) if r.get("score") is not None else None,
        "candidate_count": len(cands), "gate": None, "dept": None,
        "needs_rationale": needs_reason(pol, r["reason_code"] or ""),
        "age_hours": round(age, 1), "overdue": _overdue(r, resp_days),
        "evidence": evidence_for_review(cur, r), "confidence": best,
    })
    return item


def _issue_item(cur, r: dict, pol: dict, resp_days: int) -> dict:
    age = _age_hours(r["created_at"])
    return {
        "key": format_key("ISSUE", r["id"]), "kind": "ISSUE", "id": r["id"], "proposal_kind": None,
        "reason_code": "SOURCE_CONFLICT", "risk_class": REVIEW_CLASS["SOURCE_CONFLICT"], "code": r["code"], "severity": r["severity"],
        "status": r["status"], "summary": r["detail"], "detail": r["detail"], "person_id": r["person_id"],
        "person_name": r.get("person_name"), "mdm_id": r.get("mdm_id"), "created_at": r["created_at"], "claimed_by": None,
        "system_code": IDENTITY_SYSTEM, "gate": None, "dept": None, "needs_rationale": needs_reason(pol, "SOURCE_CONFLICT"),
        "age_hours": round(age, 1), "overdue": _overdue({"created_at": r["created_at"]}, resp_days),
        "evidence": evidence_for_issue(cur, r), "confidence": 1.0,
    }


def items(cur, reason, system=None, q=None, claimed=None, actor=None, limit=50, after=None, accept_language=None,
          min_age_hours=None, sort=None, dir="desc", offset=None) -> dict:
    """Open items for a reason group. Prefer offset+limit paging; `after` remains for older clients.

    claimed: any (default) | me | none — default lists every waiting item, claimed or not.
    Sortable: action (summary), person, department (system), claimed, age.
    """
    limit = max(1, min(int(limit or 50), 200))
    use_offset = offset is not None
    offset = max(0, int(offset or 0)) if use_offset else 0
    if after is not None and not isinstance(after, int) and not use_offset:
        after = parse_key(after)[1]
    elif use_offset:
        after = None
    resp_days = _response_days(cur)
    pol = exchange.current(cur)
    lang = _lang(accept_language)
    code = _system_filter_code(system)
    sort_dir = "ASC" if str(dir or "desc").lower() == "asc" else "DESC"
    min_age = float(min_age_hours) if min_age_hours not in (None, "",) else None

    def envelope(out_items, risk, total=None):
        next_after = out_items[-1]["id"] if out_items and len(out_items) == limit and not use_offset else None
        body = {
            "reason": reason,
            "label": label_for(reason, lang),
            "batchable": is_batchable(reason),
            "risk_class": risk,
            "items": out_items,
            "limit": limit,
            "offset": offset if use_offset else None,
            "total": total if total is not None else len(out_items),
            "after": after,
            "next_after": next_after,
            "next_after_key": out_items[-1]["key"] if next_after else None,
            "rationale_min_chars": pol.get("rationale_min_chars", 10),
            "sort": sort, "dir": sort_dir.lower(),
        }
        # Group-level stats for the detail header (whole filtered set when total is known).
        if total is not None:
            mine = sum(1 for it in out_items if it.get("claimed_by") and actor and it["claimed_by"] == actor)
            body["stats"] = {
                "items": total,
                "claimed_by_me": mine,   # page-local; filled better below when we query
                "oldest_hours": max((it.get("age_hours") or 0) for it in out_items) if out_items else 0,
            }
        return body

    if reason in REVIEW_REASONS:
        if not identity_visible(code):
            return envelope([], REVIEW_CLASS[reason], total=0)
        if reason == "SOURCE_CONFLICT":
            where, p = _issue_filters(claimed, actor, q)
            if min_age is not None:
                where.append("i.created_at <= now() - (%s || ' hours')::interval"); p.append(str(min_age))
            cur.execute(f"SELECT count(*) AS n {_ISSUE_FROM} WHERE {' AND '.join(where)}", p)
            total = cur.fetchone()["n"]
            order = {"action": "i.detail", "person": "pe.name", "department": "i.source",
                     "claimed": "i.id", "age": "i.created_at"}.get((sort or "age").lower(), "i.created_at")
            # age desc = oldest first = created_at ASC; flip for created_at
            if order == "i.created_at":
                ord_sql = f"i.created_at {'ASC' if sort_dir == 'DESC' else 'DESC'}"
            else:
                ord_sql = f"{order} {sort_dir} NULLS LAST, i.id DESC"
            page = []
            if use_offset:
                page = ["LIMIT %s OFFSET %s", [limit, offset]]
            else:
                if after is not None:
                    where.append("i.id < %s"); p.append(after)
                page = ["LIMIT %s", [limit]]
            cur.execute(f"""SELECT i.*, pe.name AS person_name, pe.mdm_id {_ISSUE_FROM}
                            WHERE {' AND '.join(where)} ORDER BY {ord_sql} {page[0]}""", p + page[1])
            return envelope([_issue_item(cur, r, pol, resp_days) for r in cur.fetchall()], REVIEW_CLASS[reason], total=total)
        where, p = _review_filters(claimed, actor, q)
        where.append("t.reason_code=%s"); p.append(reason)
        if min_age is not None:
            where.append("t.created_at <= now() - (%s || ' hours')::interval"); p.append(str(min_age))
        cur.execute(f"SELECT count(*) AS n {_REVIEW_FROM} WHERE {' AND '.join(where)}", p)
        total = cur.fetchone()["n"]
        order = {"action": "t.reason_code", "person": "pe.name", "department": "t.id",
                 "claimed": "t.claimed_by", "age": "t.created_at"}.get((sort or "age").lower(), "t.created_at")
        if order == "t.created_at":
            ord_sql = f"t.created_at {'ASC' if sort_dir == 'DESC' else 'DESC'}"
        else:
            ord_sql = f"{order} {sort_dir} NULLS LAST, t.id DESC"
        filter_w, filter_p = list(where), list(p)
        page_where, page_p_vals = list(where), list(p)
        if use_offset:
            page_sql, page_args = "LIMIT %s OFFSET %s", [limit, offset]
        else:
            if after is not None:
                page_where.append("t.id < %s"); page_p_vals.append(after)
            page_sql, page_args = "LIMIT %s", [limit]
        cur.execute(f"{_REVIEW_SELECT} {_REVIEW_FROM} WHERE {' AND '.join(page_where)} ORDER BY {ord_sql} {page_sql}",
                    page_p_vals + page_args)
        items_out = [_review_item(cur, r, pol, resp_days) for r in cur.fetchall()]
        env = envelope(items_out, REVIEW_CLASS[reason], total=total)
        cur.execute(f"""
            SELECT count(*) FILTER (WHERE t.claimed_by = %s) AS mine,
                   EXTRACT(EPOCH FROM (now() - min(t.created_at)))/3600 AS oldest
            {_REVIEW_FROM} WHERE {' AND '.join(filter_w)}
        """, [actor or ""] + filter_p)
        st = cur.fetchone()
        env["stats"] = {
            "items": total,
            "claimed_by_me": st["mine"] or 0,
            "oldest_hours": round(float(st["oldest"] or 0), 1),
        }
        return env

    where, p = ["pr.status='PROPOSED'", "pr.reason_code=%s"], [reason]
    if code:
        where.append("pr.system_code=%s"); p.append(code)
    if claimed == "me" and actor:
        where.append("pr.claimed_by=%s"); p.append(actor)
    elif claimed == "none":
        where.append("pr.claimed_by IS NULL")
    # claimed "any" / None / "" → no claim filter: every waiting item stays listed
    if q:
        where.append("(pr.summary ILIKE %s OR pe.name ILIKE %s OR pe.mdm_id ILIKE %s)")
        p += [f"%{q}%"] * 3
    if min_age is not None:
        where.append("pr.created_at <= now() - (%s || ' hours')::interval"); p.append(str(min_age))
    filter_w = " AND ".join(where)
    filter_p = list(p)
    join = "FROM mdm.proposal pr LEFT JOIN mdm.person pe ON pe.id=pr.person_id"
    cur.execute(f"SELECT count(*) AS n {join} WHERE {filter_w}", filter_p)
    total = cur.fetchone()["n"]
    order = {
        "action": "pr.summary", "summary": "pr.summary",
        "person": "pe.name", "department": "pr.system_code", "system": "pr.system_code",
        "claimed": "pr.claimed_by", "age": "pr.created_at",
    }.get((sort or "age").lower(), "pr.created_at")
    if order == "pr.created_at":
        ord_sql = f"pr.created_at {'ASC' if sort_dir == 'DESC' else 'DESC'}, pr.id DESC"
    else:
        ord_sql = f"{order} {sort_dir} NULLS LAST, pr.id DESC"
    page_where, page_p = list(where), list(p)
    if use_offset:
        page_sql, page_args = "LIMIT %s OFFSET %s", [limit, offset]
    else:
        if after is not None:
            page_where.append("pr.id < %s"); page_p.append(after)
        page_sql, page_args = "LIMIT %s", [limit]
    cur.execute(f"""
        SELECT pr.*, pe.name AS person_name, pe.mdm_id
        {join}
        WHERE {' AND '.join(page_where)}
        ORDER BY {ord_sql}
        {page_sql}
    """, page_p + page_args)
    rows = cur.fetchall()
    out_items = []
    for r in rows:
        age = _age_hours(r["created_at"])
        item = dict(r)
        item["proposal_kind"] = r["kind"]
        item["key"] = format_key("PROPOSAL", r["id"])
        item["kind"] = "PROPOSAL"
        item["gate"] = exchange.gate_for(cur, r)
        item["needs_rationale"] = exchange.needs_reason(pol, r["kind"])
        item["dept"] = feed.proposal_info(cur, r)
        item["age_hours"] = round(age, 1)
        item["overdue"] = _overdue(r, resp_days)
        item["evidence"] = evidence(cur, r)
        item["confidence"] = _confidence(r)
        out_items.append(item)
    risk = out_items[0]["risk_class"] if out_items else ("B" if is_batchable(reason) else "C")
    env = envelope(out_items, risk, total=total)
    cur.execute(f"""
        SELECT count(*) FILTER (WHERE pr.claimed_by = %s) AS mine,
               EXTRACT(EPOCH FROM (now() - min(pr.created_at)))/3600 AS oldest
        {join} WHERE {filter_w}
    """, [actor or ""] + filter_p)
    st = cur.fetchone()
    env["stats"] = {
        "items": total,
        "claimed_by_me": st["mine"] or 0,
        "oldest_hours": round(float(st["oldest"] or 0), 1),
    }
    return env


def claim(cur, actor: str, ids: list | None = None, reason: str | None = None, system: str | None = None,
          dept_scope: str | None = None) -> dict:
    """Claim items by key (p-1, r-2, or a bare number for a proposal) or a whole reason group.
    Returns ids (proposal ids, as before) and keys (every claimed key). Source conflicts cannot be claimed."""
    if not actor:
        raise Refused("Sign in to claim items", 401)
    scope = dept_scope or _system_filter_code(system)
    got_p: list[int] = []
    got_r: list[int] = []
    if ids:
        by = _split_keys(ids)
        if by["PROPOSAL"]:
            if scope:
                cur.execute("""
                    UPDATE mdm.proposal SET claimed_by=%s, claimed_at=now()
                    WHERE id = ANY(%s) AND status='PROPOSED' AND system_code=%s
                      AND (claimed_by IS NULL OR claimed_by=%s)
                    RETURNING id
                """, (actor, by["PROPOSAL"], scope, actor))
            else:
                cur.execute("""
                    UPDATE mdm.proposal SET claimed_by=%s, claimed_at=now()
                    WHERE id = ANY(%s) AND status='PROPOSED' AND (claimed_by IS NULL OR claimed_by=%s)
                    RETURNING id
                """, (actor, by["PROPOSAL"], actor))
            got_p = [r["id"] for r in cur.fetchall()]
        if by["REVIEW"] and identity_visible(scope):
            cur.execute("""
                UPDATE mdm.review_task SET claimed_by=%s, claimed_at=now()
                WHERE id = ANY(%s) AND status='OPEN' AND (claimed_by IS NULL OR claimed_by=%s)
                RETURNING id
            """, (actor, by["REVIEW"], actor))
            got_r = [r["id"] for r in cur.fetchall()]
    elif reason:
        if reason in REVIEW_TASK_REASONS:
            if identity_visible(scope):
                cur.execute("""
                    UPDATE mdm.review_task SET claimed_by=%s, claimed_at=now()
                    WHERE id IN (SELECT id FROM mdm.review_task WHERE status='OPEN' AND reason_code=%s AND claimed_by IS NULL
                                 FOR UPDATE SKIP LOCKED)
                    RETURNING id
                """, (actor, reason))
                got_r = [r["id"] for r in cur.fetchall()]
        elif reason != "SOURCE_CONFLICT":
            where, p = ["status='PROPOSED'", "reason_code=%s", "claimed_by IS NULL"], [reason]
            if scope:
                where.append("system_code=%s"); p.append(scope)
            cur.execute(f"""
                UPDATE mdm.proposal SET claimed_by=%s, claimed_at=now()
                WHERE id IN (SELECT id FROM mdm.proposal WHERE {' AND '.join(where)} FOR UPDATE SKIP LOCKED)
                RETURNING id
            """, [actor] + p)
            got_p = [r["id"] for r in cur.fetchall()]
    else:
        raise Refused("Give ids or a reason to claim", 422)
    keys = [format_key("PROPOSAL", i) for i in got_p] + [format_key("REVIEW", i) for i in got_r]
    return {"claimed": len(keys), "ids": got_p, "keys": keys}


def unclaim(cur, actor: str, ids: list | None = None, reason: str | None = None,
            dept_scope: str | None = None) -> dict:
    if not actor:
        raise Refused("Sign in to release items", 401)
    got_p: list[int] = []
    got_r: list[int] = []
    if ids:
        by = _split_keys(ids)
        if by["PROPOSAL"]:
            if dept_scope:
                cur.execute("""
                    UPDATE mdm.proposal SET claimed_by=NULL, claimed_at=NULL
                    WHERE id = ANY(%s) AND status='PROPOSED' AND claimed_by=%s AND system_code=%s
                    RETURNING id
                """, (by["PROPOSAL"], actor, dept_scope))
            else:
                cur.execute("""
                    UPDATE mdm.proposal SET claimed_by=NULL, claimed_at=NULL
                    WHERE id = ANY(%s) AND status='PROPOSED' AND claimed_by=%s
                    RETURNING id
                """, (by["PROPOSAL"], actor))
            got_p = [r["id"] for r in cur.fetchall()]
        if by["REVIEW"] and identity_visible(dept_scope):
            cur.execute("""
                UPDATE mdm.review_task SET claimed_by=NULL, claimed_at=NULL
                WHERE id = ANY(%s) AND status='OPEN' AND claimed_by=%s
                RETURNING id
            """, (by["REVIEW"], actor))
            got_r = [r["id"] for r in cur.fetchall()]
    elif reason:
        if reason in REVIEW_TASK_REASONS:
            if identity_visible(dept_scope):
                cur.execute("""
                    UPDATE mdm.review_task SET claimed_by=NULL, claimed_at=NULL
                    WHERE reason_code=%s AND status='OPEN' AND claimed_by=%s
                    RETURNING id
                """, (reason, actor))
                got_r = [r["id"] for r in cur.fetchall()]
        elif reason != "SOURCE_CONFLICT":
            if dept_scope:
                cur.execute("""
                    UPDATE mdm.proposal SET claimed_by=NULL, claimed_at=NULL
                    WHERE reason_code=%s AND status='PROPOSED' AND claimed_by=%s AND system_code=%s
                    RETURNING id
                """, (reason, actor, dept_scope))
            else:
                cur.execute("""
                    UPDATE mdm.proposal SET claimed_by=NULL, claimed_at=NULL
                    WHERE reason_code=%s AND status='PROPOSED' AND claimed_by=%s
                    RETURNING id
                """, (reason, actor))
            got_p = [r["id"] for r in cur.fetchall()]
    else:
        raise Refused("Give ids or a reason to release", 422)
    keys = [format_key("PROPOSAL", i) for i in got_p] + [format_key("REVIEW", i) for i in got_r]
    return {"released": len(keys), "ids": got_p, "keys": keys}


def _sign_token(payload: dict) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    sig = hmac.new(_TOKEN_SECRET, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def _parse_token(token: str) -> dict:
    try:
        body, sig = token.rsplit(".", 1)
    except ValueError as e:
        raise Refused("This batch preview has expired or is not valid", 409) from e
    expect = hmac.new(_TOKEN_SECRET, body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expect, sig):
        raise Refused("This batch preview has expired or is not valid", 409)
    payload = json.loads(body)
    if payload.get("exp", 0) < time.time():
        raise Refused("This batch preview has expired or is not valid", 409)
    return payload


def _sample_split(rows: list[dict], conf, riskiest_first: bool = False, outlier=None) -> tuple[list, list, list]:
    """Random 10, five lowest-confidence, up to five outliers. Each row has a 'key'."""
    pool = [r["key"] for r in rows]
    random.SystemRandom().shuffle(pool)
    scored = sorted(rows, key=conf, reverse=riskiest_first)
    return pool[:10], [r["key"] for r in scored[:5]], [r["key"] for r in scored if outlier and outlier(r)][:5]


def _preview_review(cur, reason: str, ids, actor: str | None, dept_scope: str | None) -> dict:
    """Batch preview for LINK_LOW_SEPARATE: the steward keeps each record separate. No consent gate applies."""
    if not identity_visible(dept_scope):
        raise Refused("Not in your department", 403)
    where = ["t.status='OPEN'", "t.reason_code=%s"]
    p: list = [reason]
    if ids:
        where.append("t.id = ANY(%s)"); p.append([i for i in _split_keys(ids)["REVIEW"]])
    cur.execute(f"{_REVIEW_SELECT} {_REVIEW_FROM} WHERE {' AND '.join(where)} ORDER BY t.id", p)
    rows = cur.fetchall()
    if not rows:
        raise Refused("No open items in this group", 404)
    pol = exchange.current(cur)
    near = link_near_margin(cur)
    for r in rows:
        r["key"] = format_key("REVIEW", r["id"])
        r["_best"] = _best_score(r["candidates"]) or float(r.get("score") or 0)
    # For SEPARATE the risky rows are the likeliest matches: highest score, several candidates, or just under the near band.
    ceiling = match_threshold() - near
    rand, lowest, outliers = _sample_split(
        rows, lambda r: r["_best"], riskiest_first=True,
        outlier=lambda r: len(r["candidates"] or []) > 1 or r["_best"] >= ceiling - 0.03)
    sample_ids = list(dict.fromkeys(rand + lowest + outliers))
    sample_set = set(sample_ids)
    resp_days = _response_days(cur)
    items_in_sample = []
    for r in rows:
        if r["key"] in sample_set:
            it = _review_item(cur, r, pol, resp_days)
            items_in_sample.append({"id": r["key"], "key": r["key"], "summary": it["summary"], "system": IDENTITY_SYSTEM,
                                    "confidence": r["_best"], "person_id": r.get("own_person"), "evidence": it["evidence"]})
    payload = {"tid": secrets.token_hex(16), "reason": reason, "ids": [r["key"] for r in rows], "sample": sample_ids,   # review ids are keys
               "exp": time.time() + TOKEN_TTL_SEC, "actor": actor}
    return {
        "token": _sign_token(payload),
        "count": len(rows),
        "held_for_consent": 0,                    # identity decisions have no consent gate
        "by_system": {IDENTITY_SYSTEM: len(rows)},
        "sample": {"random": rand, "lowest_confidence": lowest, "outliers": outliers},
        "items_in_sample": items_in_sample,
        "reason": reason,
        "batchable": True,
        "action": "SEPARATE",
    }


def preview(cur, reason: str, ids: list | None = None, system: str | None = None, actor: str | None = None,
            dept_scope: str | None = None) -> dict:
    if not is_batchable(reason):
        raise Refused(f"Group {reason} cannot be batch approved in this release (class C needs two people later)", 409)
    if reason in REVIEW_REASONS:
        return _preview_review(cur, reason, ids, actor, dept_scope)
    where, p = ["status='PROPOSED'", "reason_code=%s"], [reason]
    if ids:
        where.append("id = ANY(%s)"); p.append(_split_keys(ids)["PROPOSAL"])
    code = dept_scope or _system_filter_code(system)
    if code:
        where.append("system_code=%s"); p.append(code)
    cur.execute(f"SELECT * FROM mdm.proposal WHERE {' AND '.join(where)} ORDER BY id", p)
    rows = cur.fetchall()
    if not rows:
        raise Refused("No open items in this group", 404)
    # Items still waiting for the parent's consent (or held by a department refusal) cannot be approved:
    # leave them out of the batch and say how many, rather than let the whole batch be refused item by item.
    total_open = len(rows)
    ready = []
    for r in rows:
        try:
            exchange.require_gate(cur, r)
            ready.append(r)
        except Refused:
            pass
    rows = ready
    held_for_consent = total_open - len(rows)
    if not rows:
        raise Refused(f"None of the {total_open} items can be approved yet: each is waiting for the parent's consent. "
                      "They appear here once the consent is granted.", 409)
    id_list = [r["id"] for r in rows]
    by_system: dict[str, int] = {}
    for r in rows:
        key = r.get("system_code") or exchange.system_code(r["system"]) or r["system"]
        by_system[key] = by_system.get(key, 0) + 1
    scored = sorted(rows, key=_confidence)
    lowest = [r["id"] for r in scored[:5]]
    pool = list(id_list)
    random.SystemRandom().shuffle(pool)
    rand = pool[:10]
    outliers = [r["id"] for r in scored if _confidence(r) < match_threshold()][:5]
    sample_ids = list(dict.fromkeys(rand + lowest + outliers))
    sample_set = set(sample_ids)
    items_in_sample = []
    for r in rows:
        if r["id"] in sample_set:
            items_in_sample.append({
                "id": r["id"], "key": format_key("PROPOSAL", r["id"]), "summary": r["summary"],
                "system": r.get("system_code") or r["system"],
                "confidence": _confidence(r), "person_id": r["person_id"],
                "evidence": evidence(cur, r),
            })
    payload = {
        "tid": secrets.token_hex(16),
        "reason": reason,
        "ids": id_list,
        "sample": sample_ids,
        "exp": time.time() + TOKEN_TTL_SEC,
        "actor": actor,
    }
    token = _sign_token(payload)
    return {
        "token": token,
        "count": len(id_list),
        "held_for_consent": held_for_consent,
        "by_system": by_system,
        "sample": {"random": rand, "lowest_confidence": lowest, "outliers": outliers},
        "items_in_sample": items_in_sample,
        "reason": reason,
        "batchable": True,
    }


def _approve_review_separate(cur, tid: int, reason: str, actor: str, rationale: str, batch_id: int, dept_scope: str | None) -> None:
    """One review task of a LINK_LOW_SEPARATE batch: decide SEPARATE through stewardship.decide (audit, rebuild, batch id)."""
    if not identity_visible(dept_scope):
        raise Refused("Not in your department", 403)
    cur.execute("SELECT id, status, reason_code, claimed_by FROM mdm.review_task WHERE id=%s FOR UPDATE", (tid,))
    t = cur.fetchone()
    if not t or t["status"] != "OPEN":
        raise Refused("This task has already been decided", 409)
    if t["reason_code"] != reason:
        raise Refused("Item left this group", 409)
    if t.get("claimed_by") and t["claimed_by"] != actor:
        raise Refused(f"Claimed by {t['claimed_by']}", 409)
    stewardship.decide(cur, tid, "SEPARATE", None, actor, rationale, batch_id=batch_id)


def batch_approve(cur, token: str, rationale: str, sample_opened: list, actor: str,
                  dept_scope: str | None = None) -> dict:
    payload = _parse_token(token)
    if payload.get("actor") and actor != payload["actor"]:
        raise Refused("This batch preview belongs to another officer", 409)
    tid = payload.get("tid")
    if not tid:
        raise Refused("This batch preview has expired or is not valid", 409)
    cur.execute("SELECT id FROM mdm.batch WHERE token_id=%s", (tid,))
    if cur.fetchone():
        raise Refused("This batch preview has already been used", 409)

    reason = payload["reason"]
    keys = [_norm_key(k) for k in payload["ids"]]
    sample = [_norm_key(k) for k in (payload.get("sample") or [])]
    opened = {_norm_key(x) for x in (sample_opened or [])}
    missing = [i for i in sample if i not in opened]
    if missing:
        raise Refused("Open every sample row before approving the batch", 422)
    pol = exchange.current(cur)
    min_chars = int(pol.get("rationale_min_chars") or 10)
    if not rationale or len(rationale.strip()) < min_chars:
        raise Refused(f"Give a reason of at least {min_chars} characters", 422)
    if not is_batchable(reason):
        raise Refused(f"Group {reason} cannot be batch approved in this release", 409)

    cur.execute("""INSERT INTO mdm.batch (actor, reason_code, rationale, requested, sample_ids, token_id)
                   VALUES (%s,%s,%s,%s,%s::jsonb,%s) RETURNING id""",
                (actor, reason, rationale.strip(), len(keys), json.dumps([_public_id(k) for k in sample]), tid))
    batch_id = cur.fetchone()["id"]

    approved, skipped, skipped_detail = 0, 0, []
    for key in keys:
        kind, item_id = parse_key(key)
        cur.execute("SAVEPOINT batch_item")
        try:
            if kind == "REVIEW":
                _approve_review_separate(cur, item_id, reason, actor, rationale.strip(), batch_id, dept_scope)
            elif kind == "PROPOSAL":
                pid = item_id
                cur.execute("SELECT * FROM mdm.proposal WHERE id=%s FOR UPDATE", (pid,))
                pr = cur.fetchone()
                if not pr or pr["status"] != "PROPOSED":
                    raise Refused("This proposal has already been decided", 409)
                if pr["reason_code"] != reason:
                    raise Refused("Item left this group", 409)
                if dept_scope:
                    code = pr.get("system_code") or exchange.system_code(pr.get("system"))
                    if code != dept_scope:
                        raise Refused("Not in your department", 403)
                if pr.get("claimed_by") and pr["claimed_by"] != actor:
                    raise Refused(f"Claimed by {pr['claimed_by']}", 409)
                events.decide_proposal(cur, pid, "APPROVE", {}, actor, rationale.strip(), batch_id=batch_id)
                cur.execute("UPDATE mdm.proposal SET batch_id=%s WHERE id=%s", (batch_id, pid))
            else:
                raise Refused("This kind of item cannot be batch approved", 409)
            cur.execute("RELEASE SAVEPOINT batch_item")
            approved += 1
        except Refused as e:
            cur.execute("ROLLBACK TO SAVEPOINT batch_item")
            skipped += 1
            skipped_detail.append({"id": _public_id(key), "reason": str(e)})
        except Exception as e:  # noqa: BLE001
            cur.execute("ROLLBACK TO SAVEPOINT batch_item")
            skipped += 1
            skipped_detail.append({"id": _public_id(key), "reason": str(e)})

    cur.execute("""UPDATE mdm.batch SET approved=%s, skipped=%s, skipped_detail=%s::jsonb WHERE id=%s""",
                (approved, skipped, json.dumps(skipped_detail), batch_id))
    return {
        "batch_id": batch_id, "requested": len(keys), "approved": approved, "skipped": skipped,
        "skipped_detail": skipped_detail, "actor": actor, "reason": reason, "rationale": rationale.strip(),
    }


def batch_receipt(cur, batch_id: int, dept_scope: str | None = None) -> dict:
    cur.execute("SELECT * FROM mdm.batch WHERE id=%s", (batch_id,))
    b = cur.fetchone()
    if not b:
        raise Refused("Batch not found", 404)
    cur.execute("SELECT id, system_code, system FROM mdm.proposal WHERE batch_id=%s ORDER BY id", (batch_id,))
    props = cur.fetchall()
    cur.execute("SELECT id FROM mdm.review_task WHERE batch_id=%s ORDER BY id", (batch_id,))
    reviews = [r["id"] for r in cur.fetchall()]
    if dept_scope:
        codes = {(p.get("system_code") or exchange.system_code(p.get("system"))) for p in props}
        if reviews or not props or any(c != dept_scope for c in codes):
            raise Refused("Batch not found", 404)
    approved_ids = [r["id"] for r in props]
    return {
        "batch_id": b["id"], "actor": b["actor"], "reason": b["reason_code"], "rationale": b["rationale"],
        "requested": b["requested"], "approved": b["approved"], "skipped": b["skipped"],
        "skipped_detail": b["skipped_detail"] or [], "sample_ids": b["sample_ids"] or [],
        "approved_ids": approved_ids,
        "approved_keys": [format_key("PROPOSAL", i) for i in approved_ids] + [format_key("REVIEW", i) for i in reviews],
        "created_at": b["created_at"],
    }


def identity_row(cur, resp_days: int) -> dict:
    """The identity numbers for the Flow board row "Identity linkage (MDM)". in_review is the sum of the four identity groups
    (same query as groups()). flow_board folds them into the row for system "mdm", the steward's own row."""
    cur.execute("""SELECT count(*) AS received_24h, count(*) FILTER (WHERE link_status='AUTO_LINKED') AS linked_automatically
                   FROM mdm.source_record WHERE received_at >= now() - interval '24 hours'""")
    rec = cur.fetchone()
    counts = identity_counts(cur)
    in_review = sum(c["count"] for c in counts.values())
    low = (counts.get("LINK_LOW_SEPARATE") or {}).get("count", 0)
    oldest = [c["oldest"] for c in counts.values() if c.get("oldest")]
    oldest_h = max((_age_hours(t) for t in oldest), default=0.0)
    overdue = sum(int(c.get("overdue_n") or 0) for c in counts.values())
    cur.execute("""SELECT count(*) AS n FROM mdm.review_task
                   WHERE status='RESOLVED' AND decided_at >= date_trunc('day', now())""")
    decided = cur.fetchone()["n"]
    cur.execute("""SELECT count(*) AS n FROM mdm.audit
                   WHERE action='CORRECTION_REQUESTED' AND ts >= date_trunc('day', now())
                     AND detail->>'code' = ANY(%s)""", (sorted(SOURCE_CONFLICT_CODES),))
    decided += cur.fetchone()["n"]
    cur.execute("""SELECT count(*) AS n, count(*) FILTER (WHERE decided_at <= created_at + (%s || ' days')::interval) AS on_time
                   FROM mdm.review_task WHERE status='RESOLVED' AND decided_at >= now() - interval '7 days'""", (resp_days,))
    ot = cur.fetchone()
    return {
        "system": "identity", "kind": "IDENTITY", "name": IDENTITY_ROW_NAME,
        "received_24h": int(rec["received_24h"]), "linked_automatically": int(rec["linked_automatically"]),
        "in_review": in_review, "decided_today": decided,
        "oldest_waiting_hours": round(oldest_h, 1),
        "on_time_pct": round(100.0 * ot["on_time"] / ot["n"], 1) if ot["n"] else 100.0,
        "overdue": overdue,
        "needs_person": in_review, "routine": low, "decision": in_review - low,
        "on_time_n": int(ot["n"]), "on_time_ok": int(ot["on_time"]),
        "reasons": list(REVIEW_REASONS),
    }


def flow_board(cur, system: str | None = None) -> dict:
    """One row per department code plus totals. See module docstring for field definitions."""
    resp_days = _response_days(cur)
    code = _system_filter_code(system)
    systems_filter = ""
    p: list = []
    if code:
        systems_filter = " AND d.system=%s"
        p.append(code)

    cur.execute(f"""
        SELECT d.system,
          count(*) FILTER (WHERE d.created_at >= now() - interval '24 hours') AS received_24h,
          count(*) FILTER (WHERE d.status='DELIVERED' AND d.created_at >= now() - interval '24 hours') AS delivered,
          count(*) FILTER (WHERE d.status='PENDING_CONSENT') AS waiting_citizen,
          count(*) FILTER (WHERE d.status='RETRYING') AS retrying,
          count(*) FILTER (WHERE d.status='DEAD_LETTER') AS failed,
          count(*) FILTER (WHERE d.status IN ('BLOCKED_EXPIRED','BLOCKED_REFUSED','BLOCKED_REVOKED')) AS stopped,
          min(d.created_at) FILTER (WHERE d.status='PENDING_CONSENT') AS oldest_consent
        FROM mdm.delivery d
        WHERE true {systems_filter}
        GROUP BY d.system
    """, p)
    del_rows = {r["system"]: r for r in cur.fetchall()}

    prop_params: list = [resp_days, UNCLAIMED_ESCALATE_DAYS]
    prop_filter = ""
    if code:
        prop_filter = " AND system_code=%s"
        prop_params.append(code)
    cur.execute(f"""
        SELECT COALESCE(system_code, 'mdm') AS system,
          count(*) AS needs_person,
          count(*) FILTER (WHERE risk_class='B') AS routine,
          count(*) FILTER (WHERE risk_class='C' OR risk_class IS NULL) AS decision,
          min(created_at) AS oldest_prop,
          count(*) FILTER (
            WHERE created_at < now() - (%s || ' days')::interval
               OR (claimed_by IS NULL AND created_at < now() - (%s || ' days')::interval)
          ) AS overdue
        FROM mdm.proposal
        WHERE status='PROPOSED' {prop_filter}
        GROUP BY COALESCE(system_code, 'mdm')
    """, prop_params)
    prop_rows = {r["system"]: r for r in cur.fetchall()}

    cur.execute("""
        SELECT COALESCE(system_code, 'mdm') AS system,
          count(*) AS n,
          count(*) FILTER (WHERE decided_at <= created_at + (%s || ' days')::interval) AS on_time
        FROM mdm.proposal
        WHERE status IN ('APPROVED','REJECTED') AND decided_at >= now() - interval '7 days'
        GROUP BY COALESCE(system_code, 'mdm')
    """, (resp_days,))
    on_time_prop = {r["system"]: r for r in cur.fetchall()}

    cur.execute("""
        SELECT system,
          count(*) AS n,
          count(*) FILTER (WHERE updated_at <= created_at + (%s || ' days')::interval) AS on_time
        FROM mdm.delivery
        WHERE status='DELIVERED' AND created_at >= now() - interval '7 days'
        GROUP BY system
    """, (resp_days,))
    on_time_del = {r["system"]: r for r in cur.fetchall()}

    names = {}
    cur.execute("SAVEPOINT flow_names")          # a failed query must not abort the rest of the board
    try:
        cur.execute("SELECT system, name FROM mdm.subscriber")
        names = {r["system"]: r["name"] for r in cur.fetchall()}
        cur.execute("RELEASE SAVEPOINT flow_names")
    except Exception:  # noqa: BLE001
        cur.execute("ROLLBACK TO SAVEPOINT flow_names")

    # UC1: the steward's own row (system "mdm") carries the identity linkage numbers. A department code never sees them.
    identity = identity_row(cur, resp_days) if identity_visible(code) else None
    all_systems = sorted(set(del_rows) | set(prop_rows) | set(names) | ({IDENTITY_SYSTEM} if identity else set()))
    if code:
        all_systems = [s for s in all_systems if s == code]
    if identity and not code:
        all_systems.remove(IDENTITY_SYSTEM)
        all_systems.insert(0, IDENTITY_SYSTEM)       # first, so "Identity linkage (MDM)" reads before the departments

    rows = []
    totals = {k: 0 for k in ("received_24h", "delivered", "waiting_citizen", "retrying", "failed", "stopped",
                             "needs_person", "routine", "decision", "overdue")}
    tot_ot_n = tot_ot_ok = 0
    for sys in all_systems:
        d = del_rows.get(sys) or {}
        pr = prop_rows.get(sys) or {}
        oldest_candidates = [t for t in (d.get("oldest_consent"), pr.get("oldest_prop")) if t]
        oldest_h = max((_age_hours(t) for t in oldest_candidates), default=0.0)
        ot_n = (on_time_prop.get(sys) or {}).get("n", 0) + (on_time_del.get(sys) or {}).get("n", 0)
        ot_ok = (on_time_prop.get(sys) or {}).get("on_time", 0) + (on_time_del.get(sys) or {}).get("on_time", 0)
        tot_ot_n += ot_n
        tot_ot_ok += ot_ok
        overdue = int(pr.get("overdue") or 0)
        routine = int(pr.get("routine") or 0)
        decision = int(pr.get("decision") or 0)
        needs = int(pr.get("needs_person") or 0)
        extra = {}
        if identity and sys == IDENTITY_SYSTEM:
            ot_n += identity["on_time_n"]
            ot_ok += identity["on_time_ok"]
            tot_ot_n += identity["on_time_n"]
            tot_ot_ok += identity["on_time_ok"]
            oldest_h = max(oldest_h, identity["oldest_waiting_hours"])
            overdue += identity["overdue"]
            routine += identity["routine"]
            decision += identity["decision"]
            needs += identity["needs_person"]
            extra = {"kind": "IDENTITY", "identity_name": IDENTITY_ROW_NAME,
                     "received_24h": identity["received_24h"] + int(d.get("received_24h") or 0),
                     "linked_automatically": identity["linked_automatically"], "in_review": identity["in_review"],
                     "decided_today": identity["decided_today"]}
        row = {
            "system": sys,
            "name": names.get(sys) or exchange.SYSTEMS.get(sys, sys),
            "received_24h": int(d.get("received_24h") or 0),
            "delivered": int(d.get("delivered") or 0),
            "waiting_citizen": int(d.get("waiting_citizen") or 0),
            "retrying": int(d.get("retrying") or 0),
            "failed": int(d.get("failed") or 0),
            "stopped": int(d.get("stopped") or 0),
            "needs_person": needs,
            "routine": routine,
            "decision": decision,
            "oldest_waiting_hours": round(oldest_h, 1),
            "on_time_pct": round(100.0 * ot_ok / ot_n, 1) if ot_n else 100.0,
            "overdue": overdue,
            **extra,
        }
        if extra:
            row["name"] = IDENTITY_ROW_NAME
        rows.append(row)
        for k in totals:
            totals[k] += row[k]

    return {
        "rows": rows,
        "identity": identity,
        "totals": {
            "system": "_total", "name": "All departments", **totals,
            "oldest_waiting_hours": max((r["oldest_waiting_hours"] for r in rows), default=0),
            "on_time_pct": round(100.0 * tot_ot_ok / tot_ot_n, 1) if tot_ot_n else 100.0,
        },
        "definitions": {
            "received_24h": "Deliveries created in the last 24 hours for that department.",
            "delivered": "Status DELIVERED in the last 24 hours.",
            "waiting_citizen": "Status PENDING_CONSENT (all time).",
            "retrying": "Status RETRYING.",
            "failed": "Status DEAD_LETTER — a delivery attempt that went wrong.",
            "stopped": "Consent ended, refused or withdrawn (BLOCKED_EXPIRED, BLOCKED_REFUSED, BLOCKED_REVOKED).",
            "needs_person": "Open proposals (PROPOSED) for that system (routine + decision).",
            "routine": "Open items in batchable groups (class B).",
            "decision": "Open class C items that need a person to decide.",
            "oldest_waiting_hours": "Oldest open proposal or PENDING_CONSENT delivery.",
            "on_time_pct": "Of items decided or delivered in the last 7 days, the share inside the applicable response time.",
            "overdue": "Open items older than the applicable response time, and open unclaimed items older than 30 days (each counted once).",
            "identity.received_24h": "Records loaded from departments in the last 24 hours.",
            "identity.linked_automatically": "Of those, linked to a person automatically (score at or above the automatic threshold).",
            "identity.in_review": "Open review tasks plus open source conflicts: the items in the four identity groups of the Work queue.",
            "identity.decided_today": "Review tasks decided today plus correction requests sent today.",
            "identity.oldest_waiting_hours": "Oldest open identity item.",
            "identity.on_time_pct": "Of review tasks decided in the last 7 days, the share inside the response time.",
        },
        "response_days": resp_days,
        "scoping": "Auth is role-based only; department filter is a query parameter (same as /api/x/approvals).",
    }
