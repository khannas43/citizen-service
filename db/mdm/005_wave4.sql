-- 005_wave4.sql  (run as superuser after 004_wave3.sql; idempotent)
-- Demo layer: scenario runs and results, unscripted-event log, written-evidence register.

CREATE TABLE IF NOT EXISTS mdm.demo_run (
    id bigserial PRIMARY KEY,
    kind text NOT NULL DEFAULT 'ALL',             -- ALL | one scenario id | UC1..UC6 | CC
    actor text, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
    summary jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS mdm.demo_result (
    id bigserial PRIMARY KEY,
    run_id bigint NOT NULL REFERENCES mdm.demo_run(id) ON DELETE CASCADE,
    scenario text NOT NULL, uc text, title text,
    status text NOT NULL,                         -- PASS | PARTIAL | FAIL | SKIPPED | ERROR
    checks jsonb NOT NULL DEFAULT '[]',           -- each: {ok, text, data}
    gaps jsonb NOT NULL DEFAULT '[]',             -- things the brief shows that this build does not do yet
    ms integer, ran_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demo_result_run ON mdm.demo_result (run_id, scenario);

CREATE TABLE IF NOT EXISTS mdm.demo_injection (
    id bigserial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(), actor text,
    category text NOT NULL, params jsonb NOT NULL DEFAULT '{}', result jsonb NOT NULL DEFAULT '{}', expected text, observed text
);

CREATE TABLE IF NOT EXISTS mdm.demo_document (
    id bigserial PRIMARY KEY,
    item text NOT NULL,                           -- stable key
    title text NOT NULL, requirement text NOT NULL,
    mode text NOT NULL DEFAULT 'WRITTEN',         -- LIVE | WRITTEN
    status text NOT NULL DEFAULT 'NOT_STARTED',   -- NOT_STARTED | DRAFT | READY
    reference text, notes text, owner text,
    updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS demo_document_item ON mdm.demo_document (item);

INSERT INTO mdm.demo_document (item, title, requirement, mode) VALUES
 ('hosting',     'Production hosting and data residency', 'Where the platform runs in production, who operates it, and confirmation that data stays within the state or country as required.', 'WRITTEN'),
 ('encryption',  'Encryption at rest and in transit',     'How stored data, backups and connections are encrypted, and who holds and rotates the keys.', 'WRITTEN'),
 ('dr',          'High availability and disaster recovery', 'Recovery time and recovery point targets, backup schedule, failover design and the last recovery test.', 'WRITTEN'),
 ('capacity',    'Capacity and scalability',              'Expected volumes and how the platform scales. The load smoke test in this build is indicative only and does not stand in for this.', 'WRITTEN'),
 ('security',    'Security certifications and test reports', 'Certifications held and recent penetration or vulnerability test reports.', 'WRITTEN'),
 ('references',  'Comparable public-sector deployments',  'Named comparable deployments the firm can cite, as the brief allows.', 'WRITTEN')
ON CONFLICT (item) DO NOTHING;

SELECT platform.scope_all();

SELECT 'ALTER SCHEMA mdm OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER TABLE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'r' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER SEQUENCE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
