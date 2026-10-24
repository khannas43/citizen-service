# Working rules for every Expenditure Integrity task (read this first)

Repo `/Users/sameerkhanna/Documents/Projects/DG2.0` (Digital Gujarat DG 2.0). Module `expenditure-integrity-service` (Spring Boot 3.3, Java 17, port 8092, schema `expenditure_integrity`) and the officer portal `officer-portal` (React/Vite, vitest). Read `docs/handover/HANDOVER_expenditure_integrity.md` and `docs/EXPENDITURE_INTEGRITY_ASSUMPTIONS.md` before you start. Match the style of the code around you (comment density, naming, idiom).

## Hard rules
- **Do not commit or push.** Leave changes in the working tree.
- Never touch `videos/` or any `.pptx`.
- Demo credentials: take them from `docs/PROJECT_PLAN.md`; never print them or any token in files, tests or your reply.
- The live demo database is shared. Any rows you create for testing use obvious fake ids (prefix `TEST-`), and you delete them afterwards. A detection run adds alerts to the live data: after any trial run, delete the alerts and cases it created so the open-alert count is back to **447** (check `GET /v1/overview` totals `openAlerts`). Do not rewrite or delete existing demo history unless the task says so.
- Detection stays rule-based and explainable. No machine learning in the decision path.
- Roles are checked on the server (`OfficerSecurityConfig` matchers and `DomainAccess`), then mirrored in the portal (`officer-portal/src/auth.js`). Payroll cases show individual salaries: only DEPT_ADMIN, PAYROLL_REVIEWER, FINANCE_OFFICER and HR_OFFICER may read them. SENIOR_MGMT gets totals only, never names. Do not create new Keycloak roles.
- Security hardening of other services is out of scope (local demo).

## Tests (write them first, as the project does)
- Service: `cd expenditure-integrity-service && JAVA_HOME=$(/usr/libexec/java_home -v 17) mvn test` (Java 25 breaks Mockito). 164 pass today; all must still pass. Add role tests to `IntegrityEndpointSecurityTest` for every new endpoint.
- Portal: the repo is in iCloud and in-repo test runs hang. Run from a clean copy: `rsync -a --exclude node_modules --exclude dist --exclude .git officer-portal/ <scratch>/op/ && cd <scratch>/op && npx vitest run`. 162 pass today. Run `npm ci --legacy-peer-deps` in the copy once if `node_modules` is missing.
- Update the expected sidebar lists in `officer-portal/src/auth-queue.test.js` if you add a menu entry.

## Build and deploy
- `DOCKER_HOST=unix://$HOME/.rd/docker.sock`, tag `arm64-local`, namespace `egov`.
- Service: `mvn -DskipTests package`, then copy `Dockerfile` and `target/*.jar` into a clean scratch folder and `docker build -t expenditure-integrity-service:arm64-local .` there (building inside the repo hangs on iCloud), then `kubectl -n egov rollout restart deploy/expenditure-integrity-service`.
- Portal: `bash officer-portal/build_with_superset.sh`. Local port-forwards flap for about a minute after a rollout.
- Live checks: Keycloak `127.0.0.1:8090` (client `officer-portal`), APIs at `http://127.0.0.1:30073/<service>/...`, portal at `http://127.0.0.1:30073`.
- If git complains about `index.lock` or `HEAD.lock` and no git process is running, the lock is stale; remove it.

## Report back
Files added or changed, test counts, what you saw live (API and browser), test data created and removed, the open-alert count at the end, and anything you did not do or are unsure about.
