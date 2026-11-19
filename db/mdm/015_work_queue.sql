-- 015_work_queue.sql  (run as superuser after 014; idempotent)
-- Officer work queue: reason/risk on proposals, claim fields, batch receipts, system_code, indexes for the Flow board.

ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS reason_code text;
ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS risk_class  text;           -- 'B' | 'C' (A is consent, not a proposal)
ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS batch_id    bigint;
ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS claimed_by  text;
ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS claimed_at  timestamptz;
ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS system_code text;           -- department code (pds, health, …); system stays the display name

CREATE TABLE IF NOT EXISTS mdm.batch (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  reason_code text NOT NULL,
  rationale text NOT NULL,
  requested integer NOT NULL, approved integer NOT NULL DEFAULT 0, skipped integer NOT NULL DEFAULT 0,
  sample_ids jsonb NOT NULL DEFAULT '[]',
  skipped_detail jsonb NOT NULL DEFAULT '[]',
  token_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mdm.batch ADD COLUMN IF NOT EXISTS token_id text;

CREATE INDEX IF NOT EXISTS proposal_queue_ix ON mdm.proposal (status, reason_code, created_at) WHERE status='PROPOSED';
CREATE INDEX IF NOT EXISTS proposal_claim_ix ON mdm.proposal (claimed_by) WHERE status='PROPOSED';
CREATE INDEX IF NOT EXISTS proposal_batch_ix ON mdm.proposal (batch_id);
CREATE INDEX IF NOT EXISTS proposal_system_code_ix ON mdm.proposal (status, system_code) WHERE status='PROPOSED';
CREATE INDEX IF NOT EXISTS delivery_system_status_ix ON mdm.delivery (system, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS batch_token_id_uq ON mdm.batch (token_id) WHERE token_id IS NOT NULL;

SELECT platform.scope_all();

SELECT 'ALTER TABLE mdm.batch OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER SEQUENCE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'S' AND c.relname IN ('batch_id_seq') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
