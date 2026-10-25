-- 002_state_scoping.sql  (run as superuser after 001; idempotent)
-- Gives every business table a state_code column and row-level security, so one database can hold
-- several states and each session sees only the state it serves (app.state_code).
-- Existing rows are tagged with the default state (TG). Hibernate tables created later are scoped
-- automatically by the event trigger at the bottom.

INSERT INTO platform.managed_schema (schema_name) VALUES
 ('auth'),('caste_cert'),('chatbot'),('family_member_svc'),('family_registry'),('grievance'),
 ('marriage_cert'),('notifications'),('pension'),('scheme_application'),('scheme_engine'),
 ('expenditure_integrity')
ON CONFLICT DO NOTHING;
-- Not managed on purpose: public (DIGIT services have their own tenantid), reference, analytics.

CREATE OR REPLACE FUNCTION platform.scope_table(tbl regclass) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, platform AS $$
DECLARE
    dflt char(2);
    rel  text;
BEGIN
    SELECT code INTO dflt FROM platform.state WHERE is_default;
    SELECT c.relname INTO rel FROM pg_class c WHERE c.oid = tbl;

    IF NOT EXISTS (SELECT 1 FROM pg_attribute
                   WHERE attrelid = tbl AND attname = 'state_code' AND NOT attisdropped) THEN
        -- constant default first: instant, no table rewrite
        EXECUTE format('ALTER TABLE %s ADD COLUMN state_code char(2) NOT NULL DEFAULT %L', tbl, dflt);
    END IF;
    EXECUTE format('ALTER TABLE %s ALTER COLUMN state_code SET DEFAULT platform.current_state()', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (state_code)', left(rel, 52) || '_state_ix', tbl);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS state_scope ON %s', tbl);
    EXECUTE format('CREATE POLICY state_scope ON %s USING (state_code = platform.current_state()) '
                   'WITH CHECK (state_code = platform.current_state())', tbl);
END $$;

CREATE OR REPLACE FUNCTION platform.scope_all() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, platform AS $$
DECLARE r record; n integer := 0;
BEGIN
    FOR r IN
        SELECT c.oid::regclass AS tbl
        FROM pg_class c
        JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND ns.nspname IN (SELECT schema_name FROM platform.managed_schema)
          AND c.relname !~ '^(act_|flw_)'          -- workflow engine tables are handled separately
    LOOP
        PERFORM platform.scope_table(r.tbl);
        n := n + 1;
    END LOOP;
    RETURN n;
END $$;

CREATE OR REPLACE FUNCTION platform.on_create_table() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, platform AS $$
DECLARE r record;
BEGIN
    FOR r IN SELECT * FROM pg_event_trigger_ddl_commands()
             WHERE object_type = 'table'
               AND command_tag IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
    LOOP
        IF r.schema_name IN (SELECT schema_name FROM platform.managed_schema)
           AND split_part(r.object_identity, '.', 2) !~ '^(act_|flw_)' THEN
            PERFORM platform.scope_table(r.objid::regclass);
        END IF;
    END LOOP;
END $$;

DROP EVENT TRIGGER IF EXISTS platform_scope_new_tables;
CREATE EVENT TRIGGER platform_scope_new_tables ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
    EXECUTE FUNCTION platform.on_create_table();

SELECT platform.scope_all() AS tables_scoped;
