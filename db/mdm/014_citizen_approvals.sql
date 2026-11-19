-- 014_citizen_approvals.sql  (run as superuser after 013; idempotent)
-- Seen tracking, guardian declaration fields on consent, and citizen_request for other approvals
-- (confirm details / link child / link family). Confirming a request raises a steward proposal;
-- it never edits master data.

ALTER TABLE mdm.consent ADD COLUMN IF NOT EXISTS seen_at timestamptz;
ALTER TABLE mdm.consent ADD COLUMN IF NOT EXISTS answered_as text;          -- mother | father | guardian
ALTER TABLE mdm.consent ADD COLUMN IF NOT EXISTS declaration_version text;  -- e.g. 'parent-v1'
ALTER TABLE mdm.consent ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE TABLE IF NOT EXISTS mdm.citizen_request (
  id          bigserial PRIMARY KEY,
  person_id   integer NOT NULL REFERENCES mdm.person(id),         -- who must answer
  subject_person_id integer REFERENCES mdm.person(id),            -- whose record it is about
  kind        text NOT NULL,        -- CONFIRM_DETAILS | LINK_CHILD | LINK_FAMILY_MEMBER
  summary     text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}',   -- what is proposed, in plain fields the screen can show
  proposal_id bigint REFERENCES mdm.proposal(id),
  status      text NOT NULL DEFAULT 'PENDING',  -- PENDING | CONFIRMED | DISPUTED | EXPIRED
  respond_by  timestamptz,
  responded_at timestamptz,
  seen_at     timestamptz,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS citizen_request_person_ix ON mdm.citizen_request (person_id, status);

SELECT platform.scope_all();

SELECT 'ALTER TABLE mdm.citizen_request OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER SEQUENCE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'S' AND c.relname IN ('citizen_request_id_seq') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
