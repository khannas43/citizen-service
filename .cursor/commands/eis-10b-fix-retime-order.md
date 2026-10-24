# Fix the ordering and future dates left by the re-timing (follow-up to eis-10)

First read `.cursor/commands/eis-00-working-rules.md` and follow it. Same backup-first and undo rules as eis-10; add your changes to `seed_data/build_fix_demo_retime_history.py` and its generated SQL so `--apply` and `--undo` still work, and regenerate the seeds the same way.

## What is wrong (counts measured on the live database on 2026-10-08, DB clock `now()` = 09:57 UTC)
Database times are UTC; compute "now" in UTC, not local time.
1. **Dates in the future**: 14 `integrity_action.created_at` (latest 2026-10-16), 8 cases with `created_at`, `updated_at` or `verified_at` after now (latest 2026-10-08 14:00), 8 alerts with `detected_at` after now (latest 2026-10-08 15:24), and `integrity_audit_log.created_at` as late as 2026-10-27. Nothing may be later than now minus one hour.
2. **Verified before the outcome**: 30 cases have `verified_at` earlier than their latest action. Example `0d710203-6b72-503a-a7ef-52af655a3e77`: verified 2026-07-15 14:00, last action 2026-07-16 20:46. Verification must come after the case's last action (1 to 10 days after it, capped at now minus one hour).
3. **Case updated before created**: 1 case (`8859ce1a-c782-54bf-91cc-61109af4f1e0`: created 2026-10-07 10:07, updated 2026-10-06 15:24). `updated_at` must be the latest of the case's own dates (created, decision, actions, verification, audit).
4. **Alert before its case**: 4 alerts have `detected_at` more than a minute earlier than their case's `created_at`. Set `detected_at` equal to the case's `created_at` for those.

## Rules
- Fix by moving the fewest rows the least distance: clamp future times back to just under now (keeping their order), and where a verification or update is earlier than the thing it follows, move it to just after.
- Do not change which month a case, outcome or verification sits in unless the row is in the future; the monthly chart totals (confirmed and recovered 965000 each, stopped 68000) must stay the same, and so must `openAlerts` 447, `verifiedClosedCases` 124, `awaitingVerification` 19, `recurrenceRate` within one point of 14.8 and `avgDaysToMasterCorrection` between 6 and 9.
- Case-level order after the fix, for every case: alert `detected_at` ≥ case `created_at` (equal is fine) ≤ decision ≤ every action ≤ `verified_at` ≤ `updated_at` ≤ now minus one hour; each audit row between the case's `created_at` and `updated_at`.

## Verify
Run this and paste the result; every count must be 0:
```sql
select 'future alerts', count(*) from expenditure_integrity.integrity_alert where detected_at > now() - interval '1 hour'
union all select 'future cases', count(*) from expenditure_integrity.integrity_case where created_at > now() - interval '1 hour' or updated_at > now() - interval '1 hour' or verified_at > now() - interval '1 hour'
union all select 'future actions', count(*) from expenditure_integrity.integrity_action where created_at > now() - interval '1 hour'
union all select 'future audit', count(*) from expenditure_integrity.integrity_audit_log where created_at > now() - interval '1 hour'
union all select 'updated before created', count(*) from expenditure_integrity.integrity_case where updated_at < created_at
union all select 'verified before an action', count(*) from expenditure_integrity.integrity_case c where c.verified_at is not null and exists (select 1 from expenditure_integrity.integrity_action a where a.case_id = c.id and a.created_at > c.verified_at)
union all select 'action before case', count(*) from expenditure_integrity.integrity_action a join expenditure_integrity.integrity_case c on c.id = a.case_id where a.created_at < c.created_at
union all select 'alert before its case', count(*) from expenditure_integrity.integrity_alert a join expenditure_integrity.integrity_case c on c.id = a.case_id where a.detected_at < c.created_at
union all select 'audit outside the case life', count(*) from expenditure_integrity.integrity_audit_log l join expenditure_integrity.integrity_case c on c.id = l.case_id where l.created_at < c.created_at or l.created_at > c.updated_at;
```
Then re-check `GET /v1/overview` totals and `byMonth` sums against the numbers above, and `GET /v1/story` plus one old case's `GET /v1/cases/{id}/timeline`. Service tests (239) and portal tests (185) must still pass; you add no code to the service or portal.

## Report back
The counts before and after, the files you changed, and the backup paths.
