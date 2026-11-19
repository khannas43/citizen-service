-- Translations that a native-speaker reviewer has checked or corrected. They are never aged out and always win over machine output.
CREATE TABLE IF NOT EXISTS mdm.translation_memory (
    src_lang    text NOT NULL,
    tgt_lang    text NOT NULL,
    text_sha    text NOT NULL,
    source_text text NOT NULL,
    translated  text NOT NULL,
    reviewed_by text NOT NULL,
    reviewed_at timestamptz NOT NULL DEFAULT now(),
    origin      text NOT NULL DEFAULT 'corrected',      -- corrected: the reviewer wrote it; approved: the reviewer accepted the machine text
    PRIMARY KEY (src_lang, tgt_lang, text_sha)
);
