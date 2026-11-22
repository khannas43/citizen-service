-- 019_dept_entries.sql  (run as superuser after 018; idempotent)
-- Dated history that sits under a department record: bills, ration drawn, pension payments, instalments, benefits received.
-- Kept apart from mdm.source_record so matching, quality checks and record counts are not affected.

CREATE TABLE IF NOT EXISTS mdm.dept_entry (
    id         bigserial PRIMARY KEY,
    person_id  integer NOT NULL REFERENCES mdm.person(id) ON DELETE CASCADE,
    source     text NOT NULL,                 -- the department feed, e.g. water_board
    parent_rid text,                          -- the department's own key it belongs to: connection no, ration card, pension id
    kind       text NOT NULL,                 -- BILL | RATION_DRAW | PENSION_PAYMENT | INSTALMENT | SUPPORT_PAYMENT | MUTATION | BENEFIT
    period     text,
    entry_date date,
    amount     numeric,
    payload    jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dept_entry_person ON mdm.dept_entry (person_id, source);
CREATE INDEX IF NOT EXISTS dept_entry_parent ON mdm.dept_entry (source, parent_rid);

SELECT platform.scope_all();

SELECT 'ALTER TABLE mdm.dept_entry OWNER TO citizenuser' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
SELECT format('ALTER SEQUENCE %s OWNER TO citizenuser', c.oid::regclass) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'mdm' AND c.relkind = 'S' AND c.relname IN ('dept_entry_id_seq') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='citizenuser') \gexec
