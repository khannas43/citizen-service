-- 008_quality_reasons.sql  (run as superuser after 007_quality_daily.sql; idempotent)
-- Why a feed check failed (what was found), and who to contact in each department.

ALTER TABLE mdm.quality_result ADD COLUMN IF NOT EXISTS found jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS mdm.feed_contact (
    source text PRIMARY KEY,
    name text NOT NULL, role text, email text, phone text,
    updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);

SELECT format('ALTER TABLE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'r' AND c.relname IN ('feed_contact') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
