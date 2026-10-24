CREATE SCHEMA IF NOT EXISTS ai;

CREATE TABLE IF NOT EXISTS ai.service_embedding (
    id SERIAL PRIMARY KEY,
    service_key  VARCHAR(100) UNIQUE NOT NULL,
    service_name VARCHAR(200) NOT NULL,
    service_name_gu VARCHAR(200),
    description  TEXT,
    route        VARCHAR(200),
    synonyms     TEXT[],
    embedding    vector(384),
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS service_emb_cosine_idx
    ON ai.service_embedding USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10);

CREATE TABLE IF NOT EXISTS ai.search_log (
    id         SERIAL PRIMARY KEY,
    query      TEXT,
    aadhaar_ref VARCHAR(50),
    result_keys TEXT[],
    latency_ms  INTEGER,
    created_at  TIMESTAMP DEFAULT NOW()
);
