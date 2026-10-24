# Re-time the demo data so the monthly chart tells a 12-month story

First read `.cursor/commands/eis-00-working-rules.md` and follow it.

## The problem
The Money overview "By month" chart (`OverviewService.byMonth`, `GET /v1/overview`, `MoneyOverview.jsx`) shows twelve calendar months (2025-11 to 2026-10 today). On the demo database it is almost empty:
- **Flagged** (by alert `detected_at`): all ₹5,20,000 sits in the current month, because the 447 open alerts were all raised in one detection run.
- **Confirmed** (by the case's `updated_at`) and **Recovered** (by the approved recovery action's `created_at`): ₹0 in every month, because the seeded confirmed cases and recoveries are dated May and June 2024, outside the window. Totals say ₹9,65,000 confirmed and recovered.
- **Stopped** (pre-payment gate): ₹0, because no payment file has been screened.
The code is right; the data's dates are wrong for a demo. Do not change `OverviewService`.

## Goal
Spread the seeded history over the last 12 months so each series has activity in most months and grows plausibly toward the present, without changing any total, count or relationship.

## Tables and columns you may re-time (schema `expenditure_integrity`)
`integrity_alert.detected_at`, `integrity_case.created_at` and `updated_at`, `integrity_case.verified_at`, `integrity_action.created_at`, `integrity_audit_log.created_at`. Nothing else: do not touch entitlement periods, payment or payroll periods, `payment_settlement`, evidence JSON, ids, amounts, statuses, classifications or counts.

## Rules for the new dates
1. Keep each case's life in order: alert detected = case created, then decision (+1 to 5 days), outcome action (+2 to 12 days), verification (+1 to 10 days after the action), with `updated_at` at the last of these. Audit rows keep their order and spacing relative to the case. All dates must be earlier than now.
2. Choose each case's start date deterministically (a hash of its id, no randomness, so a re-run gives the same result) across the last 12 months, weighted so recent months have somewhat more cases than older ones. Cases that are still open spread across the 12 months as well (their alerts' `detected_at`), so "flagged" has a bar in most months.
3. Alerts that belong to the same check, person and scheme (a repeat finding) must keep their order: a later alert stays later than the case it repeats. The recurrence figure on the overview (`recurrenceRate`, currently 14.8%) must stay within one point of today's value.
4. Cases whose resolution falls in the last two months should be the ones still waiting for verification (`awaitingVerification` stays 19, `verifiedClosedCases` stays 124).
5. The average days to the first master correction (`avgDaysToMasterCorrection`, 7.6) must stay between 6 and 9.

## Part B (optional but recommended): a small "stopped before payment" history
Using the real pre-payment gate tables (`payment_batch`, `payment_batch_line`, see `PaymentGateService` and the entities), create 4 demo payment files over the last 4 months, clearly named "Demo payment file <month>", built from real entitlement unit ids, each with a few HOLD lines that an officer confirmed (`decision = HOLD_CONFIRMED`, `decided_by`, `decided_at` inside that month, a reason) and a couple RELEASED or CLEAR lines. Total stopped about ₹40,000 to ₹90,000. Do not create alerts or cases for them. If it needs a one-off SQL file, make it idempotent (skip if batches named "Demo payment file%" exist).

## Deliverables
1. `seed_data/fix_demo_retime_history.sql` (idempotent: it only moves rows whose dates are older than 6 months or all in the current month, and never moves a row twice) and, if Part B, `seed_data/seed_demo_gate_history.sql`.
2. **Backups first**: save the old values of every column you change to `seed_data/backups/retime_*_before.csv` (id and the old timestamps), plus an undo script `seed_data/fix_demo_retime_history_undo.sql` that restores from those CSVs.
3. Update the seed generators (`seed_data/generate_expenditure_integrity_sql.py`, `generate_payroll_resolved_recoveries_sql.py`, `demo_loop_seed_helpers.py`) so that regenerated seeds produce the same spread, and say in `docs/EXPENDITURE_INTEGRITY_ASSUMPTIONS.md` that the seeded history is spread over the 12 months before the load date.
4. Apply the SQL to the live database.

## Verify (all must hold; paste the before and after numbers)
- `GET /v1/overview` totals unchanged: `openAlerts` 447, `confirmedAmount` 965000, `recoveredAmount` 965000, `flaggedAmount` 520000, `verifiedClosedCases` 124, `awaitingVerification` 19, `recurrenceRate` within one point of 14.8, `avgDaysToMasterCorrection` between 6 and 9.
- `byMonth`: flagged non-zero in at least 10 of 12 months and the months sum to `flaggedAmount`; confirmed and recovered non-zero in at least 9 months and their months sum to the totals; if Part B, stopped non-zero in 4 months.
- The guided story (`GET /v1/story`) still returns three scenarios, and the case timeline of one old case still renders (`GET /v1/cases/{id}/timeline`).
- Service tests (211) and portal tests (178) still pass; add no code, so this is a regression check.
- Look at Money overview in the browser as senior management and describe what the chart shows.

## Report back
The distribution you chose, before and after figures, the files created, the backup paths, and anything you could not keep unchanged.
