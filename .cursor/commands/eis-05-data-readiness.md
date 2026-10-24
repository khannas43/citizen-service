# Data readiness page: how complete is each feed, and what should stakeholders supply

First read `.cursor/commands/eis-00-working-rules.md` and follow it.

## Goal
A page for IT_ADMIN and DEPT_ADMIN that shows, per data feed, how complete the loaded data is, so stakeholders know which data to provide. Counts and percentages only; no names or salaries.

## Checks to implement (each: feed, check, rows affected, total, percent, why it matters, which rule it weakens)
Beneficiary side (`entitlement_unit`, `payment_settlement`, `verification_event`, `master_change_log`):
- Units with no taluka or no village (taluka-level reporting).
- Units with no `income_snapshot` or `age_snapshot` (rule 806).
- Settlements with no `bank_token` (rules 804 and 805 and the gate's bank check), and with no `transaction_ref` (cannot be told apart from a duplicate).
- Active units that have no settlement at all in the last 12 months.
- People with no verification event on file at all, as "no death or status feed for these people" (rule 803), reported as a coverage figure, not an error.
- Bank changes with no approval reference (805).
Payroll side (`employee_identity`, `service_event`, `payroll_settlement`, `pension_authorisation`):
- Employees with no service event (S01 cannot check transfers).
- Employees with no `person_id` link (rule 807 cannot run) and with no district.
- Payroll rows with no `transaction_ref`.
- Pensioners with no life certificate on file (S06), and PENSION payroll rows with no pension authorisation (S05).
Feed freshness: for each table, the most recent period or date loaded.

## Build
- `ReadinessService` with one repository count query per check (do not load whole tables where a `count` query will do; add the repository methods). `GET /v1/admin/readiness` (existing `/v1/admin/**` roles IT_ADMIN and DEPT_ADMIN).
- Portal: new screen `DataReadiness.jsx` at `/data-readiness` (feature `dataReadiness` for DEPT_ADMIN and IT_ADMIN, nav entry after "Load Data"), grouped by feed with a progress bar per check, red under 80 percent, amber under 95, plus a "What to ask for" sentence per failing check (for example "Ask the payment system for the bank reference on every settlement"). Link to the Load Data page for the relevant import.
- Add the expected sidebar changes to `auth-queue.test.js`.

## Tests
One service test per check with a small fixture (including empty tables, no divide by zero); role test; portal rendering of a failing and a passing check.

## Live check
Open the page as DEPT_ADMIN, compare three of the figures with `psql` counts (`kubectl -n egov exec deploy/postgres -- psql -U egovuser -d egov_db`), and confirm SCHEME_DEPT cannot open it.
