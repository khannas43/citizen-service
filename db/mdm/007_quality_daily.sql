-- 007_quality_daily.sql  (run as superuser after 006_quality.sql; idempotent)
-- Feed quality by the day records were received in the system, and officer-editable rule settings.
-- Counts only: nothing here holds a person's details.

-- 1. when each record reached the system. New records take the time they are inserted; existing ones take the time of the load that
--    brought them (or now, for the few created by live events).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='mdm' AND table_name='source_record' AND column_name='received_at') THEN
    ALTER TABLE mdm.source_record ADD COLUMN received_at timestamptz NOT NULL DEFAULT now();
    UPDATE mdm.source_record s SET received_at = l.started_at FROM mdm.load_run l WHERE l.id = s.load_id;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS source_record_received ON mdm.source_record (source, received_at);

-- 2. the rule settings: one set for all feeds, every change a numbered version with who and why
CREATE TABLE IF NOT EXISTS mdm.quality_rule_set (
    version serial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    actor text NOT NULL, reason text NOT NULL,
    settings jsonb NOT NULL
);
INSERT INTO mdm.quality_rule_set (actor, reason, settings)
SELECT 'system', 'Initial settings', '{}'::jsonb WHERE NOT EXISTS (SELECT 1 FROM mdm.quality_rule_set);

-- 3. what each run recorded, per feed, rule and day (days on which at least one record was received)
ALTER TABLE mdm.quality_run ADD COLUMN IF NOT EXISTS rule_version integer;
ALTER TABLE mdm.quality_result ADD COLUMN IF NOT EXISTS rule_key text;
ALTER TABLE mdm.quality_result ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'record';      -- record | feed
ALTER TABLE mdm.quality_result ADD COLUMN IF NOT EXISTS tolerance numeric(7,5) NOT NULL DEFAULT 0;   -- share of records allowed to fail

CREATE TABLE IF NOT EXISTS mdm.quality_daily (
    run_id bigint NOT NULL REFERENCES mdm.quality_run(id) ON DELETE CASCADE,
    source text NOT NULL, rule_key text NOT NULL, day date NOT NULL,
    checked integer NOT NULL, failed integer NOT NULL,
    PRIMARY KEY (run_id, source, rule_key, day)
);
CREATE INDEX IF NOT EXISTS quality_daily_day ON mdm.quality_daily (run_id, day);

SELECT format('ALTER TABLE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'r' AND c.relname IN ('quality_rule_set','quality_daily') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER SEQUENCE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'S' AND c.relname IN ('quality_rule_set_version_seq') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
