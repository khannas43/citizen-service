"""Machine translation of free text that arrives from departments (a rejection reason, a note), for the officer portal's Telugu view.

Off unless MT_ENABLED=true. Text is sent only to the translation service inside the cluster. Names, numbers and identifiers are never sent:
only text that has words in it, in English, up to a length limit. Results are cached, marked as machine translated, and never stored as the record.
"""
from __future__ import annotations
import hashlib, json, logging, os, re, urllib.request

log = logging.getLogger("translate")
LANGS = {"te"}                       # Telugu first; add "ta" here and in the service's MT_LANGS when Tamil is taken up
MAX_TEXTS = 30
MAX_CHARS = 1000


def enabled() -> bool:
    return os.getenv("MT_ENABLED", "false").lower() == "true" and bool(os.getenv("MT_URL"))


def status() -> dict:
    return {"enabled": enabled(), "languages": sorted(LANGS) if enabled() else []}


def norm(text: str) -> str:
    """Whitespace-insensitive form of a text, so a stray space or line break does not defeat a reviewed entry."""
    return " ".join((text or "").split())


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:40]


_TELUGU = re.compile(r"[\u0C00-\u0C7F]")


def remember(cur, source: str, translated: str, reviewer: str, target: str = "te", origin: str = "corrected") -> None:
    """Store a reviewer-checked translation. It overrides machine output from now on and never expires."""
    source, translated = norm(source), translated.strip()
    if target not in LANGS:
        raise ValueError("That language is not available")
    if not source or not translated:
        raise ValueError("Both the English text and the translation are needed")
    if target == "te" and worth_translating(source) and not _TELUGU.search(translated):
        raise ValueError("The translation has no Telugu letters in it")
    if len(source) > MAX_CHARS or len(translated) > MAX_CHARS * 3:
        raise ValueError("Text is too long")
    cur.execute("INSERT INTO mdm.translation_memory(src_lang, tgt_lang, text_sha, source_text, translated, reviewed_by, origin) VALUES ('en', %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (src_lang, tgt_lang, text_sha) DO UPDATE SET translated=EXCLUDED.translated, reviewed_by=EXCLUDED.reviewed_by, reviewed_at=now(), origin=EXCLUDED.origin",
                (target, sha(source), source, translated, reviewer, origin))
    cur.execute("DELETE FROM mdm.translation_cache WHERE src_lang='en' AND tgt_lang=%s AND text_sha=%s", (target, sha(source)))


def forget(cur, source: str, target: str = "te") -> bool:
    cur.execute("DELETE FROM mdm.translation_memory WHERE src_lang='en' AND tgt_lang=%s AND text_sha=%s", (target, sha(norm(source))))
    return cur.rowcount > 0


def import_rows(cur, rows: list[dict], reviewer: str, target: str = "te") -> dict:
    """Rows from the reviewer's CSV (english, machine_telugu, reviewer_telugu, verdict). ok keeps the machine text; fix/wrong take the reviewer's text."""
    done = {"approved": 0, "corrected": 0, "skipped": [], "rejected": []}
    for r in rows:
        en = (r.get("english") or "").strip()
        mt, rv = (r.get("machine_telugu") or "").strip(), (r.get("reviewer_telugu") or "").strip()
        verdict = ((r.get("verdict (ok / fix / wrong)") or r.get("verdict") or "").strip().lower())
        if not en:
            continue
        if rv:
            text, origin = rv, "corrected"
        elif verdict == "ok" and mt:
            text, origin = mt, "approved"
        else:
            done["skipped"].append(en)                  # no verdict, or "fix/wrong" with no replacement written
            continue
        try:
            remember(cur, en, text, reviewer, target, origin)
            done[origin] += 1
        except ValueError as e:
            done["rejected"].append({"english": en, "why": str(e)})
    return done


_WORDS = re.compile(r"[A-Za-z]{3,}")


def worth_translating(text: str) -> bool:
    """English prose only: needs words, and must not already be in an Indian script."""
    if not _WORDS.search(text):
        return False
    non_latin = sum(1 for ch in text if ord(ch) > 0x2FF)
    return non_latin * 3 < len(text)


def _call_service(texts: list[str], target: str) -> list[str]:
    req = urllib.request.Request(os.environ["MT_URL"].rstrip("/") + "/translate", method="POST",
                                 data=json.dumps({"texts": texts, "source": "en", "target": target}).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=float(os.getenv("MT_TIMEOUT", "60"))) as r:
        out = json.loads(r.read())
    if len(out.get("translations", [])) != len(texts):
        raise ValueError("translation count mismatch")
    return out["translations"]


def translate(cur, texts: list[str], target: str) -> dict:
    """One result per input, same order: {text, translated, machine}. Any failure returns the original with machine=false."""
    res = [{"text": t, "translated": t, "machine": False, "reviewed": False} for t in texts]
    if not enabled() or target not in LANGS:
        return {"items": res, "enabled": enabled()}
    todo = {}
    for i, t in enumerate(texts):
        t2 = norm(t)
        if t2 and worth_translating(t2):
            todo.setdefault(t2, []).append(i)
    if not todo:
        return {"items": res, "enabled": True}
    cur.execute("SELECT source_text, translated FROM mdm.translation_memory WHERE src_lang='en' AND tgt_lang=%s AND text_sha = ANY(%s)", (target, [sha(t) for t in todo]))
    memo = {r["source_text"]: r["translated"] for r in cur.fetchall()}
    for t, g in memo.items():                           # reviewer-checked text wins and is never sent to the service
        for i in todo.get(t, []):
            res[i] = {"text": texts[i], "translated": g, "machine": False, "reviewed": True}
    todo = {t: v for t, v in todo.items() if t not in memo}
    if not todo:
        return {"items": res, "enabled": True}
    days = int(os.getenv("MT_CACHE_DAYS", "30"))
    cur.execute("SELECT source_text, translated FROM mdm.translation_cache WHERE src_lang='en' AND tgt_lang=%s AND text_sha = ANY(%s) AND created_at > now() - make_interval(days => %s)",
                (target, [sha(t) for t in todo], days))
    hit = {r["source_text"]: r["translated"] for r in cur.fetchall()}
    miss = [t for t in todo if t not in hit]
    if miss:
        engine = os.getenv("MT_ENGINE_NAME", "indictrans2")
        size = max(1, int(os.getenv("MT_BATCH", "16")))            # the service takes at most 16 texts per request
        for i in range(0, len(miss), size):
            chunk = miss[i:i + size]
            try:
                got = _call_service(chunk, target)
            except Exception as e:                  # those texts stay in English; the other batches still go ahead. A translation is never required
                log.warning("translation unavailable for %d text(s): %s", len(chunk), e)
                continue
            for t, g in zip(chunk, got):
                if g and g.strip():
                    hit[t] = g
                    cur.execute("INSERT INTO mdm.translation_cache(src_lang, tgt_lang, text_sha, source_text, translated, engine) VALUES ('en', %s, %s, %s, %s, %s) "
                                "ON CONFLICT (src_lang, tgt_lang, text_sha) DO UPDATE SET translated=EXCLUDED.translated, created_at=now()", (target, sha(t), t, g, engine))
        cur.execute("DELETE FROM mdm.translation_cache WHERE created_at < now() - make_interval(days => %s)", (days,))
    for t, idx in todo.items():
        if t in hit and hit[t] != t:
            for i in idx:
                res[i] = {"text": texts[i], "translated": hit[t], "machine": True, "reviewed": False}
    return {"items": res, "enabled": True}
