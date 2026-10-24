"""Speech engine: which Whisper model serves which language, decoding settings, and the loop guard."""
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import speech_engine
from app.config import settings


class FakeWhisper:
    def __init__(self, text):
        self.text = text
        self.calls = []

    def transcribe(self, path, **kwargs):
        self.calls.append(kwargs)
        return [SimpleNamespace(text=self.text)], SimpleNamespace(language=kwargs["language"])


@pytest.fixture(autouse=True)
def isolated_models(monkeypatch):
    monkeypatch.setattr(speech_engine, "_whisper_models", {})
    monkeypatch.setattr(speech_engine, "_to_wav", lambda src: Path(src))
    monkeypatch.setattr(settings, "WHISPER_MODEL", "base-test")
    monkeypatch.setattr(settings, "WHISPER_MODEL_GU", "medium-test")


def test_english_uses_the_small_model_and_gujarati_the_large_one():
    assert speech_engine.model_for_language("en") == "base-test"
    assert speech_engine.model_for_language("gu") == "medium-test"
    assert speech_engine.model_for_language("hi") == "base-test"      # anything else falls back


def test_each_language_is_transcribed_by_its_own_model(monkeypatch):
    en, gu = FakeWhisper("I am 36 years old"), FakeWhisper("मारी उम्मर 36 वर्श छे")
    speech_engine._whisper_models.update({"base-test": en, "medium-test": gu})

    assert speech_engine.transcribe_local(b"x", "a.wav", "en")["text"] == "I am 36 years old"
    assert speech_engine.transcribe_local(b"x", "a.wav", "gu")["text"] == "मारी उम्मर 36 वर्श छे"
    assert len(en.calls) == 1 and len(gu.calls) == 1


def test_decoding_settings_that_made_gujarati_usable():
    gu = FakeWhisper("मारी उम्मर 36 वर्श छे")
    speech_engine._whisper_models["medium-test"] = gu
    speech_engine.transcribe_local(b"x", "a.wav", "gu-IN")

    call = gu.calls[0]
    assert call["language"] == "gu"
    assert call["beam_size"] == 5            # greedy decoding (beam 1) produced garbage for Gujarati
    assert call["temperature"] == 0.0        # no random-temperature retries
    assert call["condition_on_previous_text"] is False
    assert call["vad_filter"] is True


@pytest.mark.parametrize("text", [
    "मरी उम्मर चत्रीस वर्ष्" + "च्" * 40,
    "ha " * 30,
    "x" * 60,
])
def test_a_repetition_loop_is_discarded(text):
    assert speech_engine.is_degenerate(text)
    speech_engine._whisper_models["medium-test"] = FakeWhisper(text)
    assert speech_engine.transcribe_local(b"x", "a.wav", "gu")["text"] == ""


@pytest.mark.parametrize("text", [
    "I am a 36 year old widow from Ahmedabad, OBC category, and my family income is 1.2 lakh rupees.",
    "मारी उम्मर चत्रीस वर्श चे, हो विद्वा चू, अमदावाद मा रहूचू",
    "ooh that is a very very good scheme",          # ordinary repeated words are not a loop
    "",
])
def test_normal_speech_is_not_flagged(text):
    assert not speech_engine.is_degenerate(text)


def test_warm_up_loads_both_models_and_survives_a_failure(monkeypatch):
    loaded = []

    def fake_get(name=None):
        loaded.append(name)
        if name == "medium-test":
            raise RuntimeError("download failed")

    monkeypatch.setattr(speech_engine, "_get_whisper", fake_get)
    speech_engine.warm_up()                   # must not raise: the service stays up and retries lazily
    assert loaded == ["base-test", "medium-test"]


def test_remote_worker_is_used_when_configured(monkeypatch):
    from app import stt_remote

    monkeypatch.setattr(settings, "STT_REMOTE_URL", "http://worker")
    monkeypatch.setattr(stt_remote, "transcribe_remote", lambda d, f, l: {"text": "remote", "language": l})
    monkeypatch.setattr(speech_engine, "transcribe_local", lambda *a: pytest.fail("local must not run"))
    assert speech_engine.transcribe_audio(b"x", "a.wav", "gu")["text"] == "remote"


def test_falls_back_to_local_when_worker_is_down(monkeypatch):
    from app import stt_remote

    def down(*a):
        raise stt_remote.RemoteSttUnavailable("down")

    monkeypatch.setattr(settings, "STT_REMOTE_URL", "http://worker")
    monkeypatch.setattr(stt_remote, "transcribe_remote", down)
    monkeypatch.setattr(speech_engine, "transcribe_local", lambda d, f, l: {"text": "local", "language": l})
    assert speech_engine.transcribe_audio(b"x", "a.wav", "en")["text"] == "local"
