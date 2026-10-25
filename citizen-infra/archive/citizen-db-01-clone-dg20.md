# Create the `citizen` database as a full replica of the DG 2.0 database (`egov_db`)

Fresh development starts from a copy of DG 2.0's data store. The copy is a separate database so tables and columns can be changed freely without touching the running DG 2.0 demo.

## Context
- DG 2.0 uses one PostgreSQL 16 instance (`pgvector/pgvector:pg16`) in the Rancher Desktop K3s cluster, namespace `egov`, pod label `app=postgres`, database `egov_db`, user `egovuser`. The `public` schema holds the DIGIT tables; other schemas (`analytics`, `auth`, `caste_cert`, `chatbot`, `family_member_svc`, `family_registry`, `grievance`, `marriage_cert`, `notifications`, `pension`, `reference`, `scheme_application`, `scheme_engine`, `expenditure_integrity`) belong to individual services. `demo_reset.sh` shows how the pod is found.
- The new database is named **`citizen`**, on the **same Postgres instance**, owned by `egovuser`.

## Hard rules
- **`egov_db` is read-only for this task.** Only `pg_dump` and `SELECT` against it. Never drop, truncate, rename or alter anything in it, and never run `demo_reset.sh` or any seed script against it.
- If a database named `citizen` already exists, **stop and ask**. Do not drop it or overwrite it unasked.
- Do not point any service, `application.properties`, Helm value, ConfigMap or `docs/DG20_Demo_local_env.yaml` at `citizen`. Repointing services is a separate task.
- Never print or write the Postgres password anywhere. If one is needed, read it from the pod environment (`kubectl exec ... -- printenv POSTGRES_PASSWORD`) into a shell variable only.
- Do not commit or push. Leave changes in the working tree.
- Keep dump files out of the repo. Write them to a scratch folder outside it.

## Steps

### 1. Preflight
```bash
kubectl config current-context            # expect rancher-desktop
kubectl -n egov get pods -l app=postgres  # must be Running 1/1
```
If the API server refuses the connection (`127.0.0.1:6443`), Rancher Desktop is not running. Tell me to start it and stop here.

```bash
PG_POD=$(kubectl get pods -n egov -l app=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec "$PG_POD" -n egov -- psql -U egovuser -d postgres -Atc \
  "select datname from pg_database where datname in ('egov_db','citizen');"
kubectl exec "$PG_POD" -n egov -- psql -U egovuser -d postgres -Atc \
  "select rolcreatedb or rolsuper from pg_roles where rolname='egovuser';"
```
- `egov_db` must be listed. `citizen` must **not** be listed.
- The second query must say `t`. If it says `f`, run the `CREATE DATABASE` in step 3 as the `postgres` superuser instead, with `OWNER egovuser`.

### 2. Baseline of the source (for the check in step 5)
Record, per schema, the number of tables and the total of exact row counts. Save the output to the scratch folder as `egov_db_baseline.txt`.
```bash
kubectl exec "$PG_POD" -n egov -- psql -U egovuser -d egov_db -Atc "
select table_schema, count(*) from information_schema.tables
where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema')
group by 1 order by 1;"
kubectl exec "$PG_POD" -n egov -- psql -U egovuser -d egov_db -Atc "
select schemaname||'.'||relname, n_live_tup from pg_stat_user_tables order by 1;" 
```
`n_live_tup` is an estimate. For the final comparison use exact `count(*)` per table, generated with `\gexec`.

### 3. Create the database
```bash
kubectl exec "$PG_POD" -n egov -- psql -U egovuser -d postgres -c \
  "CREATE DATABASE citizen OWNER egovuser ENCODING 'UTF8' LC_COLLATE 'en_US.utf8' LC_CTYPE 'en_US.utf8' TEMPLATE template0;"
```
`egov_db` is UTF8 / `en_US.utf8`, about 51 MB, with extensions `plpgsql` and `pg_trgm`. Install `pg_trgm` in `citizen` before the restore: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` (the dump also carries it, so `IF NOT EXISTS` keeps it harmless).

### 4. Copy schema and data
Stream the dump straight into the new database, inside the pod, so no file with PII leaves the cluster:
```bash
kubectl exec "$PG_POD" -n egov -- bash -c \
  "pg_dump -U egovuser -d egov_db --no-owner --no-acl --format=plain \
   | psql -U egovuser -d citizen -v ON_ERROR_STOP=1 --single-transaction -q"
```
- `--single-transaction` plus `ON_ERROR_STOP=1`: a failure leaves `citizen` empty, not half-copied. If it fails, report the exact error, then drop and recreate **only `citizen`** (it is ours) and retry after fixing the cause.
- This copies every schema, table, index, sequence (with current values), constraint, view, function and row, including the Flowable `ACT_*` tables and the encrypted PII columns exactly as they are.
- Do not use `pg_dump --schema=public`: that would miss all the service schemas.

### 5. Verify the copy
1. Same list of schemas and same table count per schema as the step-2 baseline.
2. Exact `count(*)` for every table in both databases. Generate the statements once, run them against each database, and diff the two outputs. Every table must match.
3. Sequences: `select schemaname, sequencename, last_value from pg_sequences order by 1,2;` must match in both.
4. Indexes and constraints: compare `select count(*) from pg_indexes` and `from pg_constraint` per schema.
5. Confirm `egov_db` is unchanged: re-run the step-2 counts against it.

### 6. Leave a record
Add `docs/CITIZEN_DB.md` (short) with: the database name, the Postgres instance it lives on, the exact commands used above (without any password), the date, the per-schema table counts, and the line "Created as a copy of `egov_db` (DG 2.0). `egov_db` is untouched. Schema changes for Citizen Services are made in `citizen` only."

For connecting from outside the cluster, give me the port-forward and URL, and leave services unchanged:
```bash
kubectl -n egov port-forward svc/postgres 5433:5432
# psql "postgresql://egovuser@127.0.0.1:5433/citizen"
```
In-cluster JDBC form, for later: `jdbc:postgresql://postgres.egov.svc.cluster.local:5432/citizen?currentSchema=<schema>`.

## Report back
Whether the cluster and pod were up, the `citizen` creation result, per-schema table counts and the total row count in both databases, any table whose count differed, any errors and how they were handled, the file added, and confirmation that `egov_db` was only read. Say plainly if any step was skipped or you are unsure.
