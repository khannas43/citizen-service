-- 017_uc4.sql  (run as superuser after 016; idempotent)
-- UC4 turning 18 / scholarship: daily job runs, one invitation per person, one open proposal per UC4 kind.

CREATE TABLE IF NOT EXISTS mdm.job_run (
  id bigserial PRIMARY KEY, job text NOT NULL, actor text NOT NULL, as_of timestamptz,
  result jsonb NOT NULL DEFAULT '{}', ran_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS job_run_ix ON mdm.job_run (job, ran_at DESC);

CREATE TABLE IF NOT EXISTS mdm.invitation (
  id bigserial PRIMARY KEY, person_id bigint NOT NULL REFERENCES mdm.person(id) ON DELETE CASCADE,
  kind text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS invitation_once_ux ON mdm.invitation (person_id, kind);

CREATE UNIQUE INDEX IF NOT EXISTS proposal_open_uc4_ux ON mdm.proposal (person_id, kind)
  WHERE status='PROPOSED' AND kind IN ('RENEW_CERTIFICATE','SETTLE_SOURCE_CONFLICT','MANUAL_ROUTE');

SELECT platform.scope_all();

SELECT 'ALTER TABLE mdm.job_run OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT 'ALTER TABLE mdm.invitation OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER SEQUENCE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'S' AND c.relname IN ('job_run_id_seq','invitation_id_seq')
   AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
