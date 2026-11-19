# Translation service (IndicTrans2, English to Telugu)

Self-hosted machine translation for free text that arrives from departments. It runs inside the cluster, so the text never leaves it.

- Model: `ai4bharat/indictrans2-en-indic-dist-200M` (MIT licence). The weights are gated on Hugging Face: request access once and give the token to `scripts/translation_setup.sh`.
- Languages: Telugu now (`MT_LANGS=te`). Tamil, Hindi and Gujarati are one entry each in `app/main.py` and `app/translate.py` in the MDM service.
- Used for: rejection reasons and notes in the officer portal's Telugu view, marked "machine translated". Names, numbers and identifiers are never sent.
- Off by default: `MT_ENABLED=false` in the MDM service. The portal then shows the original English text.
- Cache: `mdm.translation_cache`, entries expire after `MT_CACHE_DAYS` (30).
- Engine `echo` returns the text unchanged; it is what the tests use.
- First request downloads the model (about 1 GB) into the `translation-models` volume, then loads it into memory (about 1.5 GB).
