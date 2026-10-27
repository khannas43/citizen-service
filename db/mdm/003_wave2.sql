-- 003_wave2.sql  (run as superuser after 002_exchange.sql; idempotent)
-- Subscriber availability (for retry and dead-letter), discrepancies and citizen declarations,
-- temporary query results (so purge has something real to remove), and load-test evidence.

CREATE TABLE IF NOT EXISTS mdm.subscriber (
    id bigserial PRIMARY KEY,
    system text NOT NULL,
    available boolean NOT NULL DEFAULT true,
    note text, changed_by text, changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriber_system ON mdm.subscriber (system);

CREATE TABLE IF NOT EXISTS mdm.discrepancy (
    id bigserial PRIMARY KEY,
    kind text NOT NULL DEFAULT 'DISCREPANCY',     -- DISCREPANCY | DECLARATION
    person_id bigint REFERENCES mdm.person(id) ON DELETE CASCADE,
    attribute text NOT NULL,
    current_value text, reported_value text,
    reason text,
    authoritative_system text,                    -- where the correction must be made
    status text NOT NULL DEFAULT 'ROUTED',        -- ROUTED | CORRECTED_AT_SOURCE | CONFIRMED_AS_IS | REJECTED | DECLARED
    raised_by text, channel text, operator text,
    raised_at timestamptz NOT NULL DEFAULT now(),
    resolved_by text, resolved_at timestamptz, resolution_note text,
    informed jsonb NOT NULL DEFAULT '[]'          -- departments told once the source corrected it
);
CREATE INDEX IF NOT EXISTS discrepancy_person_ix ON mdm.discrepancy (person_id);
CREATE INDEX IF NOT EXISTS discrepancy_status_ix ON mdm.discrepancy (status);

CREATE TABLE IF NOT EXISTS mdm.temp_result (
    id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    requester text, actor text, purpose text,
    subjects bigint[] NOT NULL DEFAULT '{}',
    rows jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS temp_result_exp_ix ON mdm.temp_result (expires_at);

CREATE TABLE IF NOT EXISTS mdm.loadtest_run (
    id bigserial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    requests int NOT NULL, seconds numeric(8,2) NOT NULL, ok int NOT NULL, errors int NOT NULL,
    p50_ms int, p95_ms int, rps numeric(8,1), note text, actor text
);

SELECT platform.scope_all();

SELECT 'ALTER SCHEMA mdm OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER TABLE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'r' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER SEQUENCE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
