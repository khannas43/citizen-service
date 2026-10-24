# Death and status records feed (rule 803 and the pre-payment gate)

First read `.cursor/commands/eis-00-working-rules.md` and follow it.

## Goal
Rule 803 (payment after a verified death or termination) and the pre-payment gate read `verification_event` rows (`VerificationEvent`: `personId`, `familyId`, `eventType` DEATH / STATUS_TERMINATION / LIFE_CERT_EXPIRED, `eventDate`, `source`, `confidence`). Today there is **no way to load them** except SQL. Add a proper import and a visible "last loaded" so a death registered this week stops next month's payment.

## Build
1. **Import** `verification-events` in `ImportService` (follow `importLifeCertificatesCsv` and `CsvSupport`): columns `person_id, event_type, event_date, source?, confidence?, family_id?`; whole-or-nothing with line-numbered 400s; `event_type` must be one of the enum values; `confidence` HIGH, MEDIUM or LOW (default MEDIUM); the same person, type and date is skipped (re-upload safe); a date in the future is refused. Endpoint `POST /v1/admin/import/verification-events` in `AdminIntegrityController`, same roles as the other imports.
2. **Portal:** add the import to `INTEGRITY_IMPORTS` in `officer-portal/src/api.js` and to the "Beneficiary payments" group on `ImportData.jsx` (needs: nothing). Update `docs/EXPENDITURE_INTEGRITY_DATA_LOADING.md` (columns, re-upload behaviour).
3. **Act on new events straight away.** After a successful import that added events, return `{ imported, skipped, updated, newlyAtRisk }`, where `newlyAtRisk` is the number of people with an **active entitlement and a payment settled after the event date plus grace** (reuse the rule 803 logic without saving). Show it on the import card: "3 people have payments after a recorded death. Run detection to raise alerts." Do not run detection automatically.
4. **Gate check already uses events;** add a test that a payment line for a person whose death was imported a minute ago is held with `AFTER_VERIFIED_EVENT`.
5. **Freshness:** add a nullable `createdAt` column (default now) to `VerificationEvent`, and show "Last loaded" on the verification-events card of the Load Data page, using the most recent `createdAt` returned by a small `GET /v1/admin/import/verification-events/last` (roles as the imports). Old rows have no `createdAt` and are ignored for this.

## Tests
Import happy path, bad type, bad date, future date, duplicate skip, whole-or-nothing, `newlyAtRisk` arithmetic, gate integration, role test, portal card.

## Live check
Upload a one-row file for a person who has settled payments (look one up with psql), see `newlyAtRisk`, then delete the test event row with SQL and confirm `openAlerts` is still 447. Never run detection while the test event exists.
