"""Translation service: English to Telugu (other Indian languages are one line each to add) with IndicTrans2.

Runs inside the cluster, so department text never leaves it. It answers only to the MDM service.
MT_ENGINE=indictrans2 loads the model on first use; MT_ENGINE=echo returns the text unchanged (tests, and a safe default).
"""
from __future__ import annotations
import logging, os, threading
from typing import Protocol

from fastapi import FastAPI, HTTPException

from . import glossary
from pydantic import BaseModel, Field

log = logging.getLogger("translation")

# BCP-47 short code -> FLORES-200 code used by IndicTrans2. Only the languages listed in MT_LANGS are served.
FLORES = {"en": "eng_Latn", "te": "tel_Telu", "ta": "tam_Taml", "hi": "hin_Deva", "gu": "guj_Gujr"}
LANGS = [x.strip() for x in os.getenv("MT_LANGS", "te").split(",") if x.strip()]
MAX_BATCH = int(os.getenv("MT_MAX_BATCH", "16"))
MAX_CHARS = int(os.getenv("MT_MAX_CHARS", "1000"))
MODEL_ID = os.getenv("MT_MODEL", "ai4bharat/indictrans2-en-indic-dist-200M")


class Engine(Protocol):
    name: str
    loaded: bool
    def translate(self, texts: list[str], target: str) -> list[str]: ...


class EchoEngine:
    name = "echo"
    loaded = True

    def translate(self, texts, target):
        return list(texts)


class IndicTrans2Engine:
    """ai4bharat/indictrans2-en-indic-dist-200M (MIT). The weights are gated on Hugging Face: set HF_TOKEN once access is granted."""
    name = "indictrans2"

    def __init__(self):
        self.loaded = False
        self._lock = threading.Lock()
        self._use_cache = True

    def _load(self):
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        from IndicTransToolkit.processor import IndicProcessor
        token = os.getenv("HF_TOKEN") or None
        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.tok = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True, token=token)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_ID, trust_remote_code=True, token=token).to(self.device).eval()
        self.proc = IndicProcessor(inference=True)
        self.loaded = True
        log.info("IndicTrans2 loaded on %s", self.device)

    def translate(self, texts, target):
        with self._lock:                       # one batch at a time keeps memory flat on a small node
            if not self.loaded:
                self._load()
            batch = self.proc.preprocess_batch(texts, src_lang=FLORES["en"], tgt_lang=FLORES[target])
            enc = self.tok(batch, truncation=True, padding="longest", return_tensors="pt", return_attention_mask=True).to(self.device)
            with self.torch.inference_mode():
                try:
                    out = self.model.generate(**enc, use_cache=self._use_cache, min_length=0, max_length=256, num_beams=4, num_return_sequences=1)
                except AttributeError:
                    if not self._use_cache:
                        raise
                    self._use_cache = False      # remote code does not match this transformers version; slower but correct
                    out = self.model.generate(**enc, use_cache=False, min_length=0, max_length=256, num_beams=4, num_return_sequences=1)
            dec = self.tok.batch_decode(out, skip_special_tokens=True, clean_up_tokenization_spaces=True)
            return self.proc.postprocess_batch(dec, lang=FLORES[target])


def make_engine() -> Engine:
    return IndicTrans2Engine() if os.getenv("MT_ENGINE", "echo") == "indictrans2" else EchoEngine()


app = FastAPI(title="translation-service")
engine: Engine = make_engine()
GLOSS = glossary.load()


def match_ending(src: str, out: str) -> str:
    """The model adds a full stop to short fragments such as names, places and labels. Drop it when the source had none."""
    if out and out[-1] in ".।" and src.rstrip()[-1:] not in ".!?:":
        return out[:-1].rstrip()
    return out


def translate_protected(texts: list[str], target: str) -> tuple[list[str], int]:
    """Translate with protected terms; a text whose terms did not survive is translated again as plain text. Returns (results, how many fell back)."""
    prot = [glossary.protect(t, GLOSS) for t in texts]
    out = engine.translate([p[0] for p in prot], target)
    res, redo = [], []
    for i, (o, (_, m)) in enumerate(zip(out, prot)):
        text, ok = glossary.restore(o, m)
        res.append(match_ending(texts[i], text))
        if not ok:
            redo.append(i)
    if redo:
        again = engine.translate([texts[i] for i in redo], target)
        for i, a in zip(redo, again):
            res[i] = match_ending(texts[i], a)
    return res, len(redo)


class In(BaseModel):
    texts: list[str] = Field(min_length=1)
    source: str = "en"
    target: str = "te"


@app.get("/health")
def health():
    return {"ok": True, "engine": engine.name, "model": MODEL_ID if engine.name != "echo" else None, "loaded": engine.loaded, "languages": LANGS}


@app.post("/translate")
def translate(body: In):
    if body.source != "en":
        raise HTTPException(400, "Only English as the source language is supported")
    if body.target not in LANGS:
        raise HTTPException(400, f"Language not enabled: {body.target}")
    if len(body.texts) > MAX_BATCH:
        raise HTTPException(400, f"At most {MAX_BATCH} texts per request")
    if any(len(t) > MAX_CHARS for t in body.texts):
        raise HTTPException(400, f"Each text may have at most {MAX_CHARS} characters")
    try:
        out, fell_back = translate_protected(body.texts, body.target)
    except Exception:
        log.exception("translation failed")
        raise HTTPException(503, "The translation model is not available")
    return {"translations": out, "engine": engine.name, "target": body.target, "unprotected": fell_back}
