-- 001_mdm.sql  (run as superuser, after db/platform/001-002; idempotent)
-- Master Data Management: a linkage index over department records plus a derived golden record.
-- Departments stay authoritative; nothing here is written back to them.
CREATE SCHEMA IF NOT EXISTS mdm;
INSERT INTO platform.managed_schema (schema_name) VALUES ('mdm') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS mdm.load_run (
    id bigserial PRIMARY KEY,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    rule_version int,
    stats jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS mdm.person (
    id bigserial PRIMARY KEY,
    mdm_id text NOT NULL,
    name text, name_local text, gender char(1), dob date, birth_year int,
    district text, mandal text, village text, address text,
    life_status text NOT NULL DEFAULT 'NO_DEATH_RECORD',  -- DECEASED | NO_DEATH_RECORD
    source_count int NOT NULL DEFAULT 0,
    record_count int NOT NULL DEFAULT 0,
    confidence numeric(4,3),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS person_mdm_id ON mdm.person (mdm_id);

CREATE TABLE IF NOT EXISTS mdm.source_record (
    id bigserial PRIMARY KEY,
    source text NOT NULL, source_rid text NOT NULL, rtype text,
    name text, gender char(1), dob date, age int, birth_year int,
    district text, mandal text, village text, address text,
    ration_card text, household_id text, relation text, as_of text,
    payload jsonb,
    parents jsonb NOT NULL DEFAULT '[]',
    person_id bigint REFERENCES mdm.person(id) ON DELETE SET NULL,
    link_status text NOT NULL DEFAULT 'NEW',          -- AUTO_LINKED | ANCHOR | NEW | IN_REVIEW | STEWARD_LINKED | STEWARD_SEPARATE
    score numeric(5,4), reason text, evidence jsonb,
    load_id bigint REFERENCES mdm.load_run(id)
);
ALTER TABLE mdm.source_record ADD COLUMN IF NOT EXISTS parents jsonb NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX IF NOT EXISTS source_record_key ON mdm.source_record (source, source_rid);
CREATE INDEX IF NOT EXISTS source_record_person ON mdm.source_record (person_id);
CREATE INDEX IF NOT EXISTS source_record_status ON mdm.source_record (link_status);
CREATE INDEX IF NOT EXISTS source_record_card ON mdm.source_record (ration_card);

CREATE TABLE IF NOT EXISTS mdm.review_task (
    id bigserial PRIMARY KEY,
    record_id bigint NOT NULL REFERENCES mdm.source_record(id) ON DELETE CASCADE,
    candidates jsonb NOT NULL DEFAULT '[]',          -- [{person_id, score, evidence}]
    status text NOT NULL DEFAULT 'OPEN',             -- OPEN | RESOLVED
    decision text,                                   -- LINK | SEPARATE
    chosen_person_id bigint, note text, decided_by text, decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS review_task_record ON mdm.review_task (record_id);
CREATE INDEX IF NOT EXISTS review_task_status ON mdm.review_task (status);

CREATE TABLE IF NOT EXISTS mdm.golden_attribute (
    id bigserial PRIMARY KEY,
    person_id bigint NOT NULL REFERENCES mdm.person(id) ON DELETE CASCADE,
    attribute text NOT NULL, value text,
    chosen_source text, rule text, alternatives jsonb NOT NULL DEFAULT '[]', conflict boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS golden_attr_key ON mdm.golden_attribute (person_id, attribute);

CREATE TABLE IF NOT EXISTS mdm.relationship (
    id bigserial PRIMARY KEY,
    person_a bigint NOT NULL REFERENCES mdm.person(id) ON DELETE CASCADE,
    person_b bigint NOT NULL REFERENCES mdm.person(id) ON DELETE CASCADE,
    kind text NOT NULL,                              -- SPOUSE | PARENT_OF | SAME_HOUSEHOLD
    basis text, source text, ref text
);
CREATE INDEX IF NOT EXISTS relationship_a ON mdm.relationship (person_a);
CREATE INDEX IF NOT EXISTS relationship_b ON mdm.relationship (person_b);

CREATE TABLE IF NOT EXISTS mdm.dq_issue (
    id bigserial PRIMARY KEY,
    person_id bigint REFERENCES mdm.person(id) ON DELETE CASCADE,
    record_id bigint REFERENCES mdm.source_record(id) ON DELETE CASCADE,
    code text NOT NULL, severity text NOT NULL DEFAULT 'MEDIUM', detail text,
    status text NOT NULL DEFAULT 'OPEN',             -- OPEN | CORRECTION_REQUESTED | RESOLVED
    correction_note text, requested_by text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dq_issue_code ON mdm.dq_issue (code, status);
CREATE INDEX IF NOT EXISTS dq_issue_person ON mdm.dq_issue (person_id);

CREATE TABLE IF NOT EXISTS mdm.rule_set (
    version int PRIMARY KEY, config jsonb NOT NULL, active boolean NOT NULL DEFAULT false,
    created_by text, created_at timestamptz NOT NULL DEFAULT now(), note text
);

-- hash-chained audit log (append only)
CREATE TABLE IF NOT EXISTS mdm.audit (
    seq bigserial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    actor text NOT NULL, action text NOT NULL, subject text, detail jsonb NOT NULL DEFAULT '{}',
    prev_hash text NOT NULL, hash text NOT NULL
);

-- scope the new tables to the serving state (the event trigger does this for tables created after 002; this covers re-runs)
SELECT platform.scope_all();

SELECT 'ALTER SCHEMA mdm OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER TABLE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'r' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER SEQUENCE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
