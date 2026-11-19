-- 006_quality.sql  (run as superuser after 005_wave4.sql; idempotent)
-- Feed quality: Great Expectations runs against each department feed, and what it found.

CREATE TABLE IF NOT EXISTS mdm.quality_run (
    id bigserial PRIMARY KEY,
    actor text, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
    gx_version text, trigger text NOT NULL DEFAULT 'MANUAL',      -- MANUAL | JOB
    summary jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS mdm.quality_result (
    id bigserial PRIMARY KEY,
    run_id bigint NOT NULL REFERENCES mdm.quality_run(id) ON DELETE CASCADE,
    source text NOT NULL,
    expectation text NOT NULL,                    -- the Great Expectations type, e.g. expect_column_values_to_not_be_null
    column_name text, severity text NOT NULL,     -- critical | advisory
    description text,
    success boolean NOT NULL,
    element_count integer, unexpected_count integer, unexpected_percent numeric(7,3),
    observed jsonb, samples jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS quality_result_run ON mdm.quality_result (run_id, source);

-- the service connects as citizenuser; the files are applied as the superuser, so hand the new tables over
SELECT format('ALTER TABLE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'r' AND c.relname IN ('quality_run','quality_result') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER SEQUENCE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'S' AND c.relname IN ('quality_run_id_seq','quality_result_id_seq') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
