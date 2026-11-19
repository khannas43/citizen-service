-- Cache of machine translations of department free text (never of names, numbers or identifiers).
-- Entries expire (MT_CACHE_DAYS, default 30) and are removed when new ones are written.
CREATE TABLE IF NOT EXISTS mdm.translation_cache (
    src_lang    text NOT NULL,
    tgt_lang    text NOT NULL,
    text_sha    text NOT NULL,
    source_text text NOT NULL,
    translated  text NOT NULL,
    engine      text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (src_lang, tgt_lang, text_sha)
);
CREATE INDEX IF NOT EXISTS translation_cache_age ON mdm.translation_cache(created_at);
