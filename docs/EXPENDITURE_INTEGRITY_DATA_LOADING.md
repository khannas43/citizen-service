# Expenditure Integrity: loading data

All loads are CSV files posted as `multipart/form-data` (field `file`) to `/expenditure-integrity-service/v1/admin/import/<name>`
with an officer token for `DEPT_ADMIN` or `IT_ADMIN`. Dates are `YYYY-MM-DD`. The first line is a header (a file without
one also works). Quote a field that contains a comma. Excel's byte-order mark and Windows line endings are fine.

**A file is accepted whole or refused whole.** A refused file answers HTTP 400 with the line and the reason, for example
`Line 7: amount 'lots' is not a number`, and nothing from it is loaded. A good file answers
`{"imported": n, "skipped": n, "updated": n}`. Uploading the same file twice is safe: rows already loaded are skipped.

Load in this order, because later files refer to earlier ones.

## Beneficiary payments (UC1)

| Endpoint | Columns (`?` = optional) | Re-upload |
|---|---|---|
| `units` | `id?, scheme_id, scheme_name, person_id, person_name, district, taluka, village?, authorized_amount, period_start, period_end?, family_id?` | A unit whose `id` exists is skipped. Give your own `id` so settlements can refer to the unit. Taluka is required for taluka-level pilot reporting. |
| `settlements` | `unit_id, period_start, period_end, amount, status, bank_token, transaction_ref?, reversal_of?` | A `transaction_ref` already loaded is skipped. `status`: SETTLED, PENDING, REJECTED, FAILED. A reversal has a negative `amount` and `reversal_of` (the id of the payment it reverses). |
| `verification-events` | `person_id, event_type, event_date, source?, confidence?, family_id?` | The same person, `event_type` and `event_date` is skipped. `event_type`: DEATH, STATUS_TERMINATION, LIFE_CERT_EXPIRED. `confidence`: HIGH, MEDIUM (default), LOW. Future dates are refused. A successful load may include `newlyAtRisk`: people with an active entitlement and a settled payment whose period ends after the event date plus grace (rule 803 logic; run detection to raise alerts). `GET /v1/admin/import/verification-events/last` returns `{ lastLoadedAt }` from the newest import row (seed rows without a load timestamp are ignored). |

## Payroll and pensions (UC4)

| Endpoint | Columns | Re-upload |
|---|---|---|
| `employees` | `employee_code, person_name, ddo_code, post_title, pay_level, status, status_since?, district?, taluka?, person_id?` | An existing `employee_code` is updated: load a transfer or a retirement by uploading the new status. `status`: ACTIVE, TRANSFERRED, SUSPENDED, RETIRED, DECEASED. `person_id` links the employee to a beneficiary for rule 807. |
| `service-events` | `employee_code, event_type, effective_date, order_ref?` | The same employee, type, date and order is skipped. `event_type`: JOINING, POSTING, TRANSFER, PROMOTION, SUSPENSION, REINSTATEMENT, RETIREMENT, DEATH. |
| `payroll` | `employee_code, component, ddo_code, period_start, period_end, gross_amount, net_amount, transaction_ref, reversal_of_ref?` | `transaction_ref` is **required**: it is what lets a file be loaded twice without hiding a payment that really was made twice (rules S01 and S04). `component`: BASIC, DA, HRA, TA, ARREARS, PENSION, OTHER. A reversal has negative amounts and `reversal_of_ref` (the `transaction_ref` it reverses). |
| `pensions` | `ppo_id, employee_code, monthly_rate, effective_from, commutation_amount?, recipient_name?` | An existing `ppo_id` is updated (a revised rate). An employee has one authorisation. |
| `life-certificates` | `employee_code, received_date, reference?` | The same employee and date is skipped. Rule S06 treats a pensioner as overdue after 365 days without one. |

Employees must be loaded before service events, payroll, pensions and life certificates, and units before settlements.

After loading, run detection from the Expenditure Integrity screen (or `POST /v1/admin/run-detection`). Alerts that already
exist are not repeated, and a payment that has since been reversed no longer counts.

**Demo seed:** `seed_data/seed_expenditure_integrity.sql` (regenerate taluka bulk via
`python3 seed_data/generate_expenditure_integrity_sql.py`, after `seed_families.sql` is loaded) loads **≥20 entitlement units and ≥20 employees per pilot taluka**
with **person id, name and family id taken from family_registry** so the officer portal citizen profile modal resolves.
across Banaskantha, Ahmedabad and Surat. The first rows in each taluka embed UC1 patterns (802, 801, 803, 804, 806) so a
**full detection run** (all districts, no taluka filter) can raise on the order of **80+ open beneficiary alerts**, not only
the three hero narratives at the top of the seed file. Verify volume with `GET /v1/admin/taluka-coverage` (officer admin token).
Re-applying the seed updates existing generated unit rows; run detection again to create any missing alerts (existing ones are not duplicated).

If an older database still shows demo placeholders in the inbox (for example `Pilot PostDeath (...)`), run
`seed_data/sync_expenditure_integrity_person_names.sql` against Postgres after `seed_families.sql` is loaded, and redeploy
expenditure-integrity-service so the API resolves display names from the family registry on list and case detail.

If the inbox still lists the same person three times for rule **803** (legacy one-alert-per-payment runs), run
`seed_data/dedupe_open_803_alerts.sql` once, then redeploy so new detection raises **one 803 case per person and scheme**
with all violating payments listed in evidence.

The seed also includes **50 pre-closed sample cases** (`-- BEGIN RESOLVED CASES SAMPLE` in the SQL, generated with the same Python script) so the officer portal **Beneficiary** tab **Resolved** list shows realistic history (decisions, outcomes, audit) without manual triage.

For the **Payroll** tab, run `python3 seed_data/generate_payroll_resolved_recoveries_sql.py` and load
`seed_data/seed_payroll_resolved_recoveries.sql` (after employees exist from the main seed). This adds **44** mixed
closed payroll cases plus **78** confirmed-overpayment recovery cases (Recoveries tab and KPI), using real
`employee_identity` names and pilot district/taluka.

## Screening a payment file (pre-payment gate)

Officer portal, Expenditure integrity, "Pre-payment gate" tab: upload a CSV with the header
`payment_ref,unit_id,period_start,period_end,amount,bank_token` (bank_token optional). A file is accepted whole or refused
whole with the line of the first problem. Or by API: `POST /v1/payment-gate/screen` (multipart `file`) with a DEPT_ADMIN or
FINANCE_OFFICER token.
