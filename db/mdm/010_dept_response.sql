-- 010_dept_response.sql  (run as superuser after 009; idempotent)
-- Department feed: every notice a department must answer, its response, the time allowed, and each department's channel.

-- How long a department has to answer, per event type, with optional overrides per use or action. Versioned like policy.
CREATE TABLE IF NOT EXISTS mdm.response_rule (
    id bigserial PRIMARY KEY,
    scope text NOT NULL,                       -- DEFAULT | EVENT | USE
    key text NOT NULL,                         -- '*' | an event type | a purpose or action kind
    days int NOT NULL CHECK (days BETWEEN 1 AND 90),
    day_kind text NOT NULL DEFAULT 'CALENDAR', -- CALENDAR | WORKING (Monday to Friday)
    version int NOT NULL DEFAULT 1,
    active boolean NOT NULL DEFAULT true,
    changed_by text, changed_at timestamptz NOT NULL DEFAULT now(), note text
);
CREATE UNIQUE INDEX IF NOT EXISTS response_rule_active ON mdm.response_rule (scope, key) WHERE active;
CREATE INDEX IF NOT EXISTS response_rule_key ON mdm.response_rule (scope, key, version);

INSERT INTO mdm.response_rule (scope, key, days, day_kind, changed_by, note)
SELECT v.scope, v.key, v.days, v.day_kind, 'system', 'Default'
FROM (VALUES ('DEFAULT', '*', 7, 'CALENDAR'),
             ('EVENT', 'BIRTH_REGISTERED', 7, 'CALENDAR'),
             ('EVENT', 'BIRTH_AMENDED', 7, 'CALENDAR'),
             ('EVENT', 'BIRTH_WITHDRAWN', 2, 'WORKING'),
             ('EVENT', 'DEATH_REGISTERED', 2, 'WORKING'),
             ('EVENT', 'MARRIAGE_REGISTERED', 7, 'CALENDAR'),
             ('USE', 'STOP_PENSION', 2, 'WORKING'),
             ('USE', 'CONSENT_WITHDRAWN', 2, 'WORKING')) AS v(scope, key, days, day_kind)
WHERE NOT EXISTS (SELECT 1 FROM mdm.response_rule r WHERE r.scope = v.scope AND r.key = v.key);

-- Each department can be reached by feed, by portal, or both.
ALTER TABLE mdm.subscriber ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'BOTH';   -- FEED | PORTAL | BOTH

CREATE SEQUENCE IF NOT EXISTS mdm.feed_seq;

-- One row per notice to a department. source is a delivery (data released under consent, or a withdrawal)
-- or a proposal (an action a person approved for that department).
CREATE TABLE IF NOT EXISTS mdm.dept_response (
    id bigserial PRIMARY KEY,
    feed_seq bigint NOT NULL DEFAULT nextval('mdm.feed_seq'),   -- the feed cursor: grows as notices are released
    source text NOT NULL,                      -- DELIVERY | PROPOSAL
    ref_id bigint NOT NULL,
    revision int NOT NULL DEFAULT 1,           -- a rejected notice that is approved again is a new revision
    event_id bigint REFERENCES mdm.event(id) ON DELETE CASCADE,
    person_id bigint REFERENCES mdm.person(id) ON DELETE SET NULL,
    system text NOT NULL, purpose text,        -- department key; purpose or action kind
    kind text NOT NULL DEFAULT 'EVENT',        -- EVENT | REVOCATION
    statutory boolean NOT NULL DEFAULT false,  -- acknowledged, never rejected
    issued_at timestamptz NOT NULL DEFAULT now(),
    respond_by timestamptz NOT NULL,
    rule jsonb NOT NULL DEFAULT '{}',          -- the rule that set the deadline, with its version
    outcome text,                              -- ACCEPTED | APPLIED | REJECTED | ACKNOWLEDGED; null while unanswered
    reason text, department_ref text,
    route text,                                -- FEED | PORTAL | SIMULATED
    actor text, responded_at timestamptz,
    reopened_proposal bigint,
    fetch_count int NOT NULL DEFAULT 0, first_fetched_at timestamptz, last_fetched_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS dept_response_ref ON mdm.dept_response (source, ref_id, revision);
CREATE INDEX IF NOT EXISTS dept_response_feed ON mdm.dept_response (system, feed_seq);
CREATE INDEX IF NOT EXISTS dept_response_event ON mdm.dept_response (event_id);

-- A proposal sent back by a department keeps the department's reason beside the decision it overturns.
ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS dept_return jsonb;

SELECT platform.scope_all();

SELECT 'ALTER TABLE mdm.response_rule OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT 'ALTER TABLE mdm.dept_response OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT 'ALTER SEQUENCE mdm.feed_seq OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER SEQUENCE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec

-- answers recorded through a batch call or an uploaded file share a batch reference
ALTER TABLE mdm.dept_response ADD COLUMN IF NOT EXISTS batch_ref text;
