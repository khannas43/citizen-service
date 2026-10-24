# What-if panel: see what a threshold change would have raised, before applying it

First read `.cursor/commands/eis-00-working-rules.md` and follow it.

## Goal
Let a DEPT_ADMIN or IT_ADMIN change a detection threshold and see, on the data already loaded, how many alerts each rule would raise compared with today's settings, without creating any alert or case and without changing the live configuration.

## Tunable settings (today in `application.properties`, read with `@Value` in `DetectionEngineService`)
- `integrity.rule804.bank-token-min-units` (default 4): people sharing a bank account before 804 fires.
- `integrity.rule805.operator-change-threshold` (default 5): bank changes by one operator in 30 days.
- `integrity.pilot.grace-days-after-death` (default 30) and the per-scheme rows in table `scheme_grace_config` (`graceDaysAfterTermination`): grace for rule 803.
- `integrity.s06.life-certificate-max-age-days` (365) and `integrity.s06.bank-change-window-days` (90) for S06.

## Build
1. **Backend dry run.** Refactor `DetectionEngineService` so each rule can run against explicit parameters and report what it would raise instead of saving. Keep the real run's behaviour and all 164 service tests unchanged. A clean way: an internal parameters record (`DetectionSettings`) passed to the rule methods and a "sink" that either saves alerts (today) or only collects `{ruleCode, personId, schemeId, amountDelta}` (what-if). Do not call the scheme engine in the what-if (806 and 807 are not tunable here; say so in the response).
2. **Endpoint** `POST /v1/admin/what-if` (so it falls under the existing `/v1/admin/**` rule, roles IT_ADMIN and DEPT_ADMIN) with body `{ rule804MinUnits?, rule805Threshold?, graceDaysDefault?, s06LifeCertificateDays?, s06BankChangeWindowDays? }`; omitted values mean "as today". Response: per rule `{ ruleCode, today, withChange, added, dropped, amountToday, amountWithChange }`, and for each rule up to 10 sample people (`personName` only for beneficiary rules; for payroll rules return counts only, no names). It must create nothing in `integrity_alert` or `integrity_case`.
3. **Portal.** On the Expenditure integrity screen, add a "What if" tab visible to DEPT_ADMIN and IT_ADMIN. Inputs for the five settings (prefilled with today's values from a `GET /v1/admin/what-if/defaults`), a "Run" button, and a table of today versus with-change per rule with the difference highlighted. A plain sentence per changed rule, for example "Raising the bank-change threshold from 5 to 8 would drop 805 from 8 alerts to 3."
4. Note in the page that the change is not applied; applying means editing the property or the grace table.

## Tests
- Service: a what-if with no changes equals what a real run would raise; with a stricter threshold the count drops; nothing is saved (verify with the repository mocks); the endpoint is 403 for SCHEME_DEPT, REVENUE_OFFICER, SENIOR_MGMT.
- Portal: the form, the result table and the sentence.

## Live check
Run a what-if with 804 at 6 and 805 at 8 and compare with today's counts from `GET /v1/overview` `byRule`. Confirm `openAlerts` is still 447 and no new rows exist.
