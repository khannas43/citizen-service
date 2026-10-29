-- 004_wave3.sql  (run as superuser after 003_wave2.sql; idempotent)
-- Connectors, partner API keys, blocked users, and assisted-channel sessions.

CREATE TABLE IF NOT EXISTS mdm.connector (
    id bigserial PRIMARY KEY,
    source text NOT NULL,                         -- the feed name used in source records
    name text NOT NULL, system text,
    interface text, auth_method text, schedule text,
    mapping jsonb NOT NULL DEFAULT '{}',          -- department field -> standard element
    status text NOT NULL DEFAULT 'DRAFT',         -- DRAFT | TESTING | ACTIVE | SUSPENDED
    last_test jsonb,
    created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS connector_source ON mdm.connector (source);

CREATE TABLE IF NOT EXISTS mdm.connector_log (
    id bigserial PRIMARY KEY,
    connector_id bigint NOT NULL REFERENCES mdm.connector(id) ON DELETE CASCADE,
    ts timestamptz NOT NULL DEFAULT now(), actor text, action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS mdm.api_key (
    id bigserial PRIMARY KEY,
    key_id text NOT NULL, system text NOT NULL, label text,
    prefix text NOT NULL, secret_hash text NOT NULL,
    scopes jsonb NOT NULL DEFAULT '[]',           -- purposes this key may ask under
    status text NOT NULL DEFAULT 'ACTIVE',        -- ACTIVE | REVOKED
    created_by text, created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz, rotated_at timestamptz, revoked_at timestamptz, revoked_by text,
    last_used_at timestamptz, use_count bigint NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS api_key_id ON mdm.api_key (key_id);

CREATE TABLE IF NOT EXISTS mdm.access_block (
    id bigserial PRIMARY KEY,
    actor text NOT NULL, reason text NOT NULL,
    blocked_by text, blocked_at timestamptz NOT NULL DEFAULT now(),
    lifted_by text, lifted_at timestamptz, lift_note text
);
CREATE INDEX IF NOT EXISTS access_block_actor ON mdm.access_block (actor) WHERE lifted_at IS NULL;

CREATE TABLE IF NOT EXISTS mdm.assisted_session (
    id bigserial PRIMARY KEY,
    operator text NOT NULL, person_id bigint REFERENCES mdm.person(id) ON DELETE SET NULL,
    visit_reason text, started_by text, started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz, summary jsonb NOT NULL DEFAULT '{}'
);

SELECT platform.scope_all();

SELECT 'ALTER SCHEMA mdm OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER TABLE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'r' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER SEQUENCE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
