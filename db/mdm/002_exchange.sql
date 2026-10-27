-- 002_exchange.sql  (run as superuser after 001_mdm.sql; idempotent)
-- Data exchange core: consent, policy, per-subscriber delivery and the exchange ledger (clearing house).
-- Nothing here stores an identity number. People are referred to by their MDM id and, where one exists, the identity reference token.

CREATE TABLE IF NOT EXISTS mdm.consent (
    id bigserial PRIMARY KEY,
    person_id bigint REFERENCES mdm.person(id) ON DELETE CASCADE,        -- the data principal: the person whose consent is needed
    subject_person_id bigint REFERENCES mdm.person(id) ON DELETE SET NULL, -- whose data is used (the child, when a parent consents)
    given_by_person_id bigint REFERENCES mdm.person(id) ON DELETE SET NULL, -- set when a guardian answers for the principal
    purpose text NOT NULL,
    system text,                                                          -- the department that will use the data
    status text NOT NULL DEFAULT 'PENDING',  -- PENDING | GRANTED | REFUSED | EXPIRED | REVOKED | ENDED
    scope jsonb NOT NULL DEFAULT '{}',        -- data elements covered
    requested_at timestamptz NOT NULL DEFAULT now(),
    respond_by timestamptz,
    responded_at timestamptz,
    expires_at timestamptz,
    revoked_at timestamptz,
    channel text,                             -- PORTAL | ASSISTED | API
    operator text,                            -- the operator who acted with the citizen present
    event_id bigint REFERENCES mdm.event(id) ON DELETE SET NULL,
    reminders int NOT NULL DEFAULT 0,
    last_reminder_at timestamptz,
    ended_reason text,
    policy_version int
);
CREATE INDEX IF NOT EXISTS consent_person_ix ON mdm.consent (person_id, purpose, status);
CREATE INDEX IF NOT EXISTS consent_event_ix ON mdm.consent (event_id);

CREATE TABLE IF NOT EXISTS mdm.consent_log (
    id bigserial PRIMARY KEY,
    consent_id bigint NOT NULL REFERENCES mdm.consent(id) ON DELETE CASCADE,
    ts timestamptz NOT NULL DEFAULT now(),
    action text NOT NULL, actor text, channel text, note text, detail jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS consent_log_ix ON mdm.consent_log (consent_id, ts);

-- sharing and eligibility policy. One active version per key; a change adds a version and never edits an old one.
CREATE TABLE IF NOT EXISTS mdm.policy (
    id bigserial PRIMARY KEY,
    key text NOT NULL, version int NOT NULL, value jsonb NOT NULL,
    active boolean NOT NULL DEFAULT false,
    changed_by text, changed_at timestamptz NOT NULL DEFAULT now(), note text
);
CREATE UNIQUE INDEX IF NOT EXISTS policy_key_ver ON mdm.policy (key, version);

-- what happened to each event for each subscribing department
CREATE TABLE IF NOT EXISTS mdm.delivery (
    id bigserial PRIMARY KEY,
    event_id bigint REFERENCES mdm.event(id) ON DELETE CASCADE,
    consent_id bigint REFERENCES mdm.consent(id) ON DELETE SET NULL,
    person_id bigint REFERENCES mdm.person(id) ON DELETE SET NULL,
    purpose text, system text,
    kind text NOT NULL DEFAULT 'EVENT',      -- EVENT | REVOCATION
    status text NOT NULL,                    -- DELIVERED | PENDING_CONSENT | BLOCKED_REFUSED | BLOCKED_REVOKED | BLOCKED_EXPIRED | BLOCKED_NO_PARENT | RETRYING | DEAD_LETTER
    attempts int NOT NULL DEFAULT 1,
    detail jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_event_ix ON mdm.delivery (event_id);
CREATE INDEX IF NOT EXISTS delivery_status_ix ON mdm.delivery (status);

-- clearing house: every exchange, whether answered or refused
CREATE TABLE IF NOT EXISTS mdm.exchange (
    id bigserial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    kind text NOT NULL,                      -- VERIFY | QUERY | EVENT | PROPOSAL
    requester text, requester_actor text, purpose text,
    person_id bigint REFERENCES mdm.person(id) ON DELETE SET NULL,
    consent_id bigint REFERENCES mdm.consent(id) ON DELETE SET NULL,
    policy_versions jsonb NOT NULL DEFAULT '{}',
    question text,
    outcome text NOT NULL,                   -- ANSWERED | DENIED_NO_CONSENT | DENIED_POLICY | NO_RECORD | CONFLICT | EXPIRED_SOURCE | ERROR
    answer jsonb NOT NULL DEFAULT '{}',
    elapsed_ms int
);
CREATE INDEX IF NOT EXISTS exchange_ts_ix ON mdm.exchange (ts DESC);
CREATE INDEX IF NOT EXISTS exchange_person_ix ON mdm.exchange (person_id);

ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS rationale text;
ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS policy_version jsonb NOT NULL DEFAULT '{}';

SELECT platform.scope_all();

SELECT 'ALTER SCHEMA mdm OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER TABLE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'r' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER SEQUENCE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
