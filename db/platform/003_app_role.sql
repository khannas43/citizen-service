-- 003_app_role.sql  (run as superuser, last; idempotent)
-- Row-level security does not apply to superusers. The services must therefore connect as an ordinary
-- role. This creates it and hands it the service schemas.
-- Usage: psql -d citizen_db -v app_password="$APP_PW" -f 003_app_role.sql

SELECT format('CREATE ROLE citizenuser LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'citizenuser') \gexec

ALTER ROLE citizenuser NOSUPERUSER NOBYPASSRLS;

GRANT CONNECT ON DATABASE citizen_db TO citizenuser;
GRANT USAGE ON SCHEMA platform TO citizenuser;
GRANT SELECT ON ALL TABLES IN SCHEMA platform TO citizenuser;
GRANT EXECUTE ON FUNCTION platform.current_state() TO citizenuser;

-- own the service schemas and everything in them (owned sequences follow their table) (Hibernate ddl-auto=update needs to alter tables)
SELECT format('ALTER SCHEMA %I OWNER TO citizenuser', schema_name) FROM platform.managed_schema
WHERE EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = schema_name) \gexec

SELECT format('ALTER %s %s OWNER TO citizenuser',
              CASE c.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,
              c.oid::regclass)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN (SELECT schema_name FROM platform.managed_schema) AND c.relkind IN ('r','p','S','v','m')
  AND NOT (c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('a','i'))) \gexec

-- read access for reporting schemas that are not managed
SELECT format('GRANT USAGE ON SCHEMA %I TO citizenuser', nspname) FROM pg_namespace
WHERE nspname IN ('reference','analytics','public') \gexec
SELECT format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO citizenuser', nspname) FROM pg_namespace
WHERE nspname IN ('reference','analytics','public') \gexec
