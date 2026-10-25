# Handover: Expenditure Integrity (UC1 beneficiary payments, UC4 payroll and pension) — state as of 2026-10-08

Repo: `/Users/sameerkhanna/Documents/Projects/Citizen-Services` (branch `main`). Only UC1 and UC4 of `docs/uc1.pdf` are in scope. Stakeholders never answered the open questions, so the working answers are in `docs/EXPENDITURE_INTEGRITY_ASSUMPTIONS.md` (read it first). Loading data: `docs/EXPENDITURE_INTEGRITY_DATA_LOADING.md`.

## What it is
- `expenditure-integrity-service` (Spring Boot 3.3, Java 17, port 8092, context path `/expenditure-integrity-service`, Postgres schema `expenditure_integrity`, Hibernate `ddl-auto=update`). Image-based deployment (`cs-expenditure-integrity-service:dev`, namespace `egov`), unlike scheme-engine which runs a hostPath jar.
- Officer portal screens (all in `officer-portal/src/screens`): Expenditure integrity (`ExpenditureIntegrity.jsx`: Beneficiary, Payroll & pension, Pre-payment gate tabs), Money overview (`MoneyOverview.jsx`), Load data (`ImportData.jsx`), and the legacy scheme-overlap screen (`FraudSignals.jsx`, served through this service).
- Reaches scheme-engine (eligibility) and family-registry (names), both in-cluster.

## Rules (all in `DetectionEngineService`)
| Rule | Meaning |
|---|---|
| 801 | Repeated enrolment |
| 802 | Over-settlement, or two mutually exclusive schemes at once |
| 803 | Payment after a verified death or termination, past a per-scheme grace |
| 804 | Bank account shared by several people or families |
| 805 | Many unexplained bank changes by one operator (`BATCH-` approvals are excluded) |
| 806 | Income or age on record fails the scheme's own tests |
| 807 | Employee on payroll whose pay breaks a scheme's income limit (employee linked by `person_id`; evidence is a pay band, never a salary) |
| S01 to S06 | Overlapping salary, post-event pay, excess allowance, duplicate arrears, pension mismatch, record-verification risk |

Detection is run from the portal (Run detection) or `POST /v1/admin/run-detection`. Alerts already present are not repeated. A first run on the bulk demo data adds about 13 rule-804 and 9 rule-806 alerts.

## Workflow
Alert → case (Open) → assign → decision (classification and reason) → outcome (master correction, payment adjustment, recovery, or dismiss) → **verify closed** (a note on how the fix was checked). Alerts leave the inbox (Resolved) once the case has an outcome. Server rules (`IntegrityCaseService`): blank assignee, classification or reason is 400; closed case, outcome before decision, or recovery without a confirmed overpayment is 409.

## Features added 2026-10-07/08
- **Pre-payment gate** (`PaymentGateService`, `/v1/payment-gate/*`): upload a payment CSV, each line is Hold, Review or Clear; an officer confirms or releases with a reason. It advises only; nothing moves money.
- **Rule 807** and the `person_id` column on employees; demo in `seed_data/seed_rule807_demo.sql`.
- **Money overview** (`OverviewService`, `GET /v1/overview`): totals by district and by rule, **last 12 months (`byMonth`)**, optional **state projection** (`officer.integrity.projection.pilot-share-percent`), **safeguard metrics** (notices, appeals, overturn rate), recurrence, days to master correction, verified and waiting counts. Totals only, safe for `SENIOR_MGMT`. Alerts with no district fall back to the employee's district.
- **Notices and appeals** (`NoticeService`, `GET/POST /v1/cases/{id}/notice/*`, `POST /v1/cases/{id}/reopen`): bilingual draft templates, issue/response recording, DEPT_ADMIN reopen on appeal; overview tracks overturns.
- **Verify closed** (`POST /v1/cases/{id}/verify-closed`).
- **Load data screen** for the seven CSV imports.
- **Case timeline** (`CaseTimelineService`, `components/CaseTimeline.jsx`): one visual line per case in the case detail.
- **What-if panel** (`WhatIfService`, `DetectionSettings`, `WhatIfPanel.jsx`, `POST /v1/admin/what-if`): dry-run thresholds without saving.
- **Case file export** (`CaseFileService`, `GET /v1/cases/{id}/export`): print-ready audit file per case.
- **Guided story** (`StoryService`, `screens/StoryMode.jsx`, `/story`): three real cases and a one-page pilot summary for the demo.
- **Rule health** (`OverviewService.ruleHealth`): per-check precision from reviewers' rulings, on the Money overview.
- Rule 806 fixed: the scheme engine's guest check needs a district and limits callers to 60 a minute; the integrity service now sends `X-Internal-Key` (env `INTERNAL_SERVICE_KEY`, secret `internal-service-key`) to skip that limit, and 806 reads only the income and age tests.

## Roles
Properties are `officer.integrity.*` in `application.properties`.
- Read beneficiary cases: SCHEME_DEPT, DEPT_ADMIN, REVENUE_OFFICER, IT_ADMIN, FINANCE_OFFICER. Decide: SCHEME_DEPT, DEPT_ADMIN, REVENUE_OFFICER.
- Payroll cases (show salaries): DEPT_ADMIN, PAYROLL_REVIEWER, FINANCE_OFFICER, HR_OFFICER.
- Record outcomes, verify closed, gate upload and decide: DEPT_ADMIN, FINANCE_OFFICER.
- Detection, imports: IT_ADMIN, DEPT_ADMIN. Money overview: the case readers plus SENIOR_MGMT.
- Only DEPT_ADMIN of the payroll roles exists in Keycloak. PAYROLL_REVIEWER, FINANCE_OFFICER and HR_OFFICER are recognised by the code but not created; the user chose not to create them.

## Demo data
- Seeds in `seed_data/`: `seed_expenditure_integrity.sql`, `seed_expenditure_integrity_taluka_bulk.sql`, `seed_payroll_resolved_recoveries.sql` (regenerate with the `generate_*` scripts; `demo_loop_seed_helpers.py` gives realistic action times and the verified/awaiting mix). Entitlement ages are kept inside scheme limits (`AGE_BAND`).
- One-off fixes already applied to the live database: `fix_demo_action_timestamps.sql` and `fix_demo_verification_mix.sql`; undo data is in `seed_data/backups/`.
- Live state: 447 open alerts (184 beneficiary, 263 payroll), 128 cases verified closed, 15 awaiting verification (all payroll).
- Detection runs add alerts to this data. After a trial run, delete what it created (alerts and their cases with `detected_at` after the run) to get back to 447.
- Synthetic sample data stays flagged as such. Do not echo demo credentials in docs or chat.

## Tests
- Service: `cd expenditure-integrity-service && JAVA_HOME=$(/usr/libexec/java_home -v 17) mvn test` (153 tests; Java 25 breaks Mockito). Rule scenarios are in `DetectionRulesTest`, roles in `IntegrityEndpointSecurityTest`.
- Portal: run from a clean copy because the repo is in iCloud: `rsync -a --exclude node_modules --exclude dist --exclude .git officer-portal/ <scratch>/op/ && cd <scratch>/op && npx vitest run` (152 tests).

## Deploy
- Service: `mvn -DskipTests package`, copy `Dockerfile` and `target/*.jar` into a clean scratch folder and `docker build -t cs-expenditure-integrity-service:dev .` there (building inside the repo hangs on iCloud), then `kubectl -n citizen rollout restart deploy/expenditure-integrity-service`. Use `DOCKER_HOST=unix://$HOME/.rd/docker.sock`.
- Portal: `bash officer-portal/build_with_superset.sh`; after a rollout the local port-forwards flap for about a minute.
- scheme-engine runs a hostPath jar (see `HANDOVER_voice_gujarati.md`): build, swap the jar with `mv`, restart.
- Live checks: Keycloak at `127.0.0.1:8090` (client `officer-portal`), APIs through `http://127.0.0.1:31173/<service>`. Demo users are in `docs/PROJECT_PLAN.md`.
- Git: if `index.lock` or `HEAD.lock` exists and no git process runs, the lock is stale (iCloud makes git slow, and a timed-out commit leaves one). Stage explicit paths. Never commit `videos/` or any `.pptx`.

## Further work
Cursor commands for the next ideas are in `.cursor/commands/` (`eis-00-working-rules.md` first, then `eis-01` to `eis-09`).

## Known gaps and decisions
- **Security is deliberately light.** The demo runs only on the presenter's laptop with synthetic data, so other services' write endpoints (caste, marriage, pension, grievance, family, notifications, chatbot) and scheme-engine beneficiary dashboards are left unauthenticated. Lock them down (as scheme-engine was) before any shared or hosted use.
- Rule 805 peer-relative and pre-payment versions were closed as not doing. A real expected split of days for S01 needs HR transfer dates the platform lacks.
- Detection reads whole tables (`findAll`); fine for the demo (about 700 units) but not for production volumes.
- Verify closed does not require a different person from the one who recorded the outcome (one DEPT_ADMIN exists); the audit log shows both.
- The gate and imports carry no file-size or row limits beyond 20 MB.
- Seeded cases were created in 2024. Any new seed that records actions must use `demo_loop_seed_helpers.py`, or days to master correction will be far too large.
- Other open items: real-voice test of the voice assistant, Kafka image-pull error, repo sits in iCloud.
