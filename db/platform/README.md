# Platform database layer (multi-state, step 1)

Run against `citizen_db` as the Postgres superuser, in this order (all idempotent):

```
psql -d citizen_db -v ON_ERROR_STOP=1 -f db/platform/001_platform.sql
psql -d citizen_db -v ON_ERROR_STOP=1 -f db/platform/002_state_scoping.sql
psql -d citizen_db -v ON_ERROR_STOP=1 -v app_password="$APP_PW" -f db/platform/003_app_role.sql
```

Run 002 again whenever you restore data or add a service schema (add the schema name to
`platform.managed_schema` first). Tables created later by Hibernate are scoped automatically.

## How it works
- `platform.current_state()` returns the session's `app.state_code`, or the default state (TG) when unset.
  Code that does not know about states therefore behaves exactly as before.
- Every table in a managed schema gets `state_code char(2) NOT NULL DEFAULT platform.current_state()`, an index,
  and a forced row-level-security policy `state_code = platform.current_state()` (reads and writes).
- Services connect as `citizenuser`, an ordinary role (not superuser, no BYPASSRLS). Superusers bypass row-level
  security, so the app must never connect as one.
- `platform-tenancy` (Java) reads the `state` claim of the login token and runs
  `select set_config('app.state_code', ?, false)` on every connection it hands out.

## Not covered yet (known limits)
- Unique constraints and keys are not yet state-aware (two states cannot reuse the same natural key). Fix per table when the
  Telangana data is loaded.
- Kafka listeners and schedulers have no request, so they run as the default state. They need the state in the event.
- Calls between services must carry the user's token (or `X-State-Code` with `citizen.tenancy.trust-state-header=true`).
- Not scoped on purpose: `public` (DIGIT), `reference`, `analytics`, Flowable `act_*` tables. Superset sees the default state only.
- The state claim is read from the token payload; signature checking stays with each service's own security.

## Build order
`platform-tenancy` is a library the ten database services depend on:
```
mvn -f platform-tenancy install          # once, and after changing it
mvn -f scheme-engine-service package     # then each service, then docker build
```
