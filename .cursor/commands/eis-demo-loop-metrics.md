# Fix the two demo figures on the Money overview "Whether fixes hold" row

Repo: `/Users/sameerkhanna/Documents/Projects/DG2.0` (Digital Gujarat DG 2.0). Module: `expenditure-integrity-service` (Spring Boot 3.3, Java 17) and `officer-portal` (React/Vite). Do not commit or push. Never touch `videos/` or any `.pptx`.

## What is wrong

The Money overview page (`officer-portal/src/screens/MoneyOverview.jsx`, data from `GET /v1/overview`, built in `OverviewService.loopMetrics`) shows four loop figures. Two of them are meaningless on the demo data:

1. **"Days to correct the source record" shows about 219.** It averages (first MASTER_CORRECTION action `created_at`) minus (case `created_at`). The seeded cases were created in 2024 (2024-05 and 2024-06) but their actions were inserted in 2026, so the gap is hundreds of days (300 days for the May 2024 cases, 183 for June).
2. **"Waiting to be verified" shows 142.** That is every case in status `ACTION_RECORDED` (39 beneficiary, 104 payroll). The "verify closed" step is new, so none of the seeded cases were ever verified. Only 1 case would show as verified.

The code is correct. The demo data is what needs fixing. Do not change the metric definitions.

## Task A: make the seeded action timestamps realistic

- Find where the seeded actions get their timestamps. Start with `seed_data/seed_payroll_resolved_recoveries.sql`, `seed_data/seed_expenditure_integrity.sql` and `seed_data/generate_expenditure_integrity_sql.py` (grep for `integrity_action`).
- Change the seed so each action's `created_at` is its case's `created_at` plus 2 to 12 days (deterministic, for example from `hashtext(id::text)`), never later than now.
- Also give the one-off fix for the already-loaded live database as a SQL file `seed_data/fix_demo_action_timestamps.sql`, idempotent (only rows where the action is more than 60 days after its case). Before running it, save the old values to a CSV so it can be undone (`select a.id, a.created_at from expenditure_integrity.integrity_action a ...`).
- Target result: average days to master correction between about 3 and 10.

## Task B: seed a believable verification mix

- In the seeds, close most of the older seeded cases that already have a recorded outcome as **verified closed**: `status = 'CLOSED'`, `verified_at` = action time plus 1 to 10 days, `verified_by` = a demo user subject (use the `dept.admin` Keycloak subject; look it up from a token claim `sub`, do not hard-code a password), `verification_note` = a short realistic sentence (vary a few, for example "Register shows the corrected record", "Recovery reached the treasury account").
- Add the matching `integrity_audit_log` row with `action = 'VERIFIED_CLOSED'` for each, as the service does in `IntegrityCaseService.verifyClosed`.
- Leave a small, deliberate set (around 10 to 15, mostly the most recent cases) in `ACTION_RECORDED` so the "waiting to be verified" figure is non-zero and a presenter can verify one live. Keep both domains represented.
- Provide the live-database one-off as `seed_data/fix_demo_verification_mix.sql`, idempotent, with the same backup-first approach (save the case ids and old statuses to a CSV).
- Do not change alert statuses: closing a case that is already `ACTION_RECORDED` must leave its alerts `RESOLVED`.
- Target result on `/v1/overview` totals: `verifiedClosedCases` roughly 100 to 130, `awaitingVerification` roughly 10 to 15, and `openAlerts` unchanged at 447.

## Optional (only if small)

Add an "Awaiting verification" filter to the inbox in `officer-portal/src/screens/ExpenditureIntegrity.jsx` next to Open / Resolved / Recoveries, so a presenter can find the cases to verify. Add a test in `ExpenditureIntegrity.test.jsx`. Skip it if it needs a backend change larger than one query parameter.

## Verify

1. Service tests: `cd expenditure-integrity-service && JAVA_HOME=$(/usr/libexec/java_home -v 17) mvn test` (Java 25 breaks Mockito). Currently 147 pass.
2. Portal tests: run from a clean copy because the repo is in iCloud and reads hang: `rsync -a --exclude node_modules --exclude dist --exclude .git officer-portal/ <scratch>/op/ && cd <scratch>/op && npx vitest run`. Currently 144 pass.
3. Apply the live SQL: `kubectl -n egov exec -i deploy/postgres -- psql -U egovuser -d egov_db < seed_data/<file>.sql` (schema `expenditure_integrity`).
4. Check the figures: get a token (`curl -s -X POST http://127.0.0.1:8090/realms/egov/protocol/openid-connect/token -d client_id=officer-portal -d grant_type=password -d username=senior.mgmt -d password=<demo password from docs/PROJECT_PLAN.md>`), then `curl -s http://127.0.0.1:30073/expenditure-integrity-service/v1/overview -H "Authorization: Bearer $T"` and read `totals`. Do not print the password or token in your reply.
5. Look at the page in a browser at `http://127.0.0.1:30073/money-overview` (log in as senior management).

## Deploy notes (this environment is awkward)

- Build images with `DOCKER_HOST=unix://$HOME/.rd/docker.sock`, tag `arm64-local`, namespace `egov`.
- `docker build` from inside the repo hangs at "load build context" (iCloud). Copy `Dockerfile` and `target/*.jar` into a clean scratch directory and build there.
- Portal: `bash officer-portal/build_with_superset.sh`. After a rollout the local port-forwards flap for about a minute.
- If git says `index.lock` or `HEAD.lock` exists and no git process is running, the lock is stale; remove it.
- Data-only changes (SQL files) need no rebuild.

## Report back

Say what changed in the seeds, paste the before and after `totals` figures (`avgDaysToMasterCorrection`, `verifiedClosedCases`, `awaitingVerification`, `openAlerts`), the path of each backup CSV, and what you did not do.
