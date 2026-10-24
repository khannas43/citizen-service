# Expenditure Integrity (UC1 and UC4): assumptions

Stakeholders have not answered the open questions in `docs/uc1.pdf`, so the system runs on the working answers below.
They are our best judgement, not policy. Each one says where it lives and how to change it. Revisit them when a
scheme owner, Finance or HR answers.

Last reviewed: 2026-10-07.

## 1. Mutually exclusive schemes (rule 802)

Three pairs, chosen from scheme category and benefit type:

| Pair | Reason |
|---|---|
| Old Age Pension and Widow Pension | Both are monthly social-security pensions: one per person |
| MYSY and Post-Matric OBC Scholarship | Both support the same course fees |
| PM Awas Yojana (Gramin) and Mukhyamantri Gruh Sudhara | Both support the same house |

Where: table `expenditure_integrity.mutual_exclusion_scheme_pair` (seeded in `seed_data/seed_expenditure_integrity.sql`).
To change: edit the rows, no code change. A pair only counts when both entitlements are active and their periods overlap.
The use case also asks the scheme owner to name policy exceptions; none are encoded.

## 2. Grace period after a death or termination (rule 803)

| Payment type | Days | Schemes |
|---|---|---|
| Monthly pensions and allowances | 30 | Old Age Pension, Widow Pension, Matru Shakti Yojana, Tribal Student Hostel Allowance |
| Annual grants and scholarships | 90 | MYSY, Post-Matric OBC, Pre-Matric SC/ST, CM Girl Child Education Grant, PM Kisan Samman Nidhi, Skill Development Grant, Kishori Shakti Yojana, PM Awas (Gramin), Mukhyamantri Gruh Sudhara |
| Anything else | 30 | The service default (`integrity.pilot.grace-days-after-death`). In-kind, insurance and loan schemes are not part of the pilot data. |

Where: table `expenditure_integrity.scheme_grace_config`. Finance should still confirm which arrears and survivor
entitlements are legitimate, since the use case excludes those.

## 3. Pilot scope

- UC1: one cash scheme, MYSY (an annual cash grant, and the use case's own example). If the main concern is payments to
  people who have died, Old Age Pension is the better pilot (monthly, high volume).
- Districts: Banaskantha, Ahmedabad and Surat (the screen's default, and where the demo families are). The platform has
  no district breakdown for these schemes, so this is a placeholder for the department to replace.
- Period: 12 months of settlement history.
- UC4: one department with several DDOs and frequent transfers, 12 months of payroll, plus transfer and retirement
  orders and PPO records. No department has been identified.

## 4. Roles

Payroll and pension cases show individual salaries, so they are open only to payroll and finance roles.

| Role | Beneficiary cases | Payroll cases |
|---|---|---|
| SCHEME_DEPT, REVENUE_OFFICER | read, decide | no access |
| IT_ADMIN | read, run detection, import | no access to cases (can run detection) |
| DEPT_ADMIN | read, decide, record outcomes | read, decide, record outcomes |
| PAYROLL_REVIEWER (new) | none | read, decide |
| FINANCE_OFFICER (new) | read, record outcomes | read, record outcomes |
| HR_OFFICER (new) | none | read only (confirms transfer dates outside the system) |

The person who decides a case is not meant to be the only person who records the recovery. Today `DEPT_ADMIN` can do
both; once `PAYROLL_REVIEWER` and `FINANCE_OFFICER` exist, that is split.

**Not done:** the three new roles do not exist in Keycloak yet and no users have them. The service and the officer
portal already recognise them. To switch them on, create the realm roles `PAYROLL_REVIEWER`, `FINANCE_OFFICER` and
`HR_OFFICER` and assign them to the right people. Where: `officer.integrity.*-roles` in
`expenditure-integrity-service/src/main/resources/application.properties`, and `ROLE_FEATURES` in
`officer-portal/src/auth.js`.

## Conventions used by the rules

- 805: a bank change whose approval reference starts with `BATCH-` is an approved batch migration and is left out. An
  individual approval reference does not excuse a change. Peer-relative and "immediately before payment" versions of the
  rule were closed as not doing. Setting: `integrity.rule805.batch-approval-prefix`.
- S06: a pensioner's life certificate is a `master_change_log` row with field `life_certificate`, dated when received.
  It is overdue after 365 days; a bank change with no approval reference counts for 90 days. There is no import path
  for life certificates yet.
- S01: the possible excess is the overlapping days at the lower of the two daily rates. A real expected split of days
  between the two DDOs needs the transfer date from HR data, which the platform does not have.
- CSV imports: units and settlements accept the columns described in `ImportService`; a file is accepted whole or
  refused whole, with the line of the first problem.

## Pre-payment gate

- A payment file (CSV: `payment_ref, unit_id, period_start, period_end, amount, bank_token`) is screened before release.
  HOLD = breaks a rule (unknown or inactive entitlement, outside its period, duplicate reference, period already paid,
  total over the entitlement counted in file order, later of two mutually exclusive schemes, paid beyond the grace
  after a verified death). REVIEW = risky but may be fine (open 801/802/803/806 alert, shared bank account, no bank reference).
- The gate only advises. An officer confirms a hold or releases it with a written reason; nothing moves money.
- Roles: upload and decide = `officer.integrity.gate-roles` (DEPT_ADMIN, FINANCE_OFFICER); view = anyone who reads beneficiary cases.
- Bank tokens are stored masked (last 4 characters). Endpoints: `/v1/payment-gate/*`.

## Rule 807: salaried beneficiary

- Needs a link: an employee row carries the beneficiary's `person_id` (optional last column of the employees CSV). No link, no check.
- Annual pay = gross pay over the latest 12 months of payroll on file, scaled up to a year when fewer months exist (at least 30 days needed).
- The alert fires when the scheme engine reports that scheme's own income test as failed at that pay. Other reasons
  (exam, caste, age) are not counted. A person already flagged by 806 is left to 806.
- Beneficiary-tab roles may not see salaries, so evidence holds a one-lakh pay band, the post and DDO, never the amount.
  The amount at stake is what the scheme paid while the person was on payroll.
- The scheme engine limits public guest checks to 60 a minute per caller. The integrity service sends the shared
  `X-Internal-Key` (`INTERNAL_SERVICE_KEY`) so a detection run is not cut short.
- Demo: `seed_data/seed_rule807_demo.sql` links a demo employee and loads a year of pay; run detection afterwards.

## Money overview (senior management)

- Screen `/money-overview`, API `GET /v1/overview`. Roles: `officer.integrity.overview-roles` (SCHEME_DEPT, DEPT_ADMIN, REVENUE_OFFICER, IT_ADMIN, FINANCE_OFFICER, SENIOR_MGMT). Senior management sees totals only and cannot open cases or alerts.
- Flagged = amount on open alerts. Confirmed = alerts of cases classed as confirmed overpayment. Recovered = confirmed cases with a recovery recorded. Stopped = holds confirmed at the pre-payment gate.
- **`byMonth`:** the last twelve calendar months (including the current month), always twelve rows with zeros where nothing happened. Flagged uses each alert's `detectedAt`. Confirmed uses the case's decision time; there is no separate "decided at" field yet, so **`IntegrityCase.updatedAt`** is used when the classification is confirmed overpayment. Recovered uses the approved recovery action's `createdAt`. Stopped uses the gate line's `decidedAt` when the decision is hold confirmed.
- **State projection:** `officer.integrity.projection.pilot-share-percent` (default `0` = off) is the pilot's share of statewide beneficiary spend. When above zero, the overview adds `projection` with pilot confirmed, estimated statewide confirmed (`pilot confirmed ÷ share`), and a fixed caveat that it is an estimate, not a finding. When zero, only DEPT_ADMIN sees a hint to set the share; other roles see nothing.
- Alerts with no district (mostly payroll) are grouped as "Unspecified" and are not on the map.
- "Review these alerts" opens the inbox on that district (`?domain=beneficiary&district=`) for roles that may read cases.

## Rule 806 (eligibility mismatch)

- Reads only the scheme's income and age tests (as the scheme engine words them) for the income and age on record. Gender, caste and exam result are not held on an entitlement, so they are never used to call something a mismatch. A failed or unreachable scheme-engine call raises nothing.
- Evidence lists the failed tests. Generated demo data has many age snapshots outside scheme limits, so a first run on it raises many 806 alerts.

## Maker-checker (large recoveries)

- Property `officer.integrity.recovery-approval-threshold` (default ₹1,00,000). A `RECOVERY_RECORD` whose payload includes an `amount` at or above that value stays **pending** until a different officer approves it (`POST /v1/cases/{id}/actions/{actionId}/approve` or `.../reject` with a reason). Below the threshold, or with no amount, behaviour is unchanged. Pending recoveries do not resolve alerts or count in recovery metrics until approved.
- Approve and reject are limited to `DEPT_ADMIN` and `FINANCE_OFFICER` (same as recording outcomes). The approver must be a different Keycloak subject from the requester (409 if the same person tries).
- Audit actions: `RECOVERY_REQUESTED`, `RECOVERY_APPROVED`, `RECOVERY_REJECTED`.
- Demo second approver: Keycloak user **`dept.admin2`** (realm role `DEPT_ADMIN` only). Password follows the same convention as other demo officers in `docs/PROJECT_PLAN.md`.
- Optional `officer.integrity.verify-needs-second-person=false` by default so verify-closed still works with a single demo admin; set true in production if verification must be by someone other than the outcome recorder.

## Closing the loop

- **Verify closed:** a case with a recorded outcome (status ACTION_RECORDED) can be closed by a DEPT_ADMIN or FINANCE_OFFICER with a note on how the fix was checked (`POST /v1/cases/{id}/verify-closed`). It records who and when. A dismissed case is closed without verification. When `verify-needs-second-person` is true, the verifier must differ from whoever recorded the outcome; otherwise the audit log alone shows who did what.
- **Recurrence:** of the confirmed, resolved findings (same check, same person and scheme), the share flagged again after the case was last updated.
- **Days to master correction:** case opened to the first master correction recorded on it. Seeded demo cases were created in 2024 but their actions were recorded in 2026, so the demo figure is far larger than real use would give.
- Shown on the Money overview page for senior management; counts only.

## Case timeline

- `GET /v1/cases/{id}/timeline` (case readers only, not senior management): lanes for entitlement or service orders, payments or pay, verified events or pension, and record changes, each with dates. Items the alert's evidence names are outlined. A bank change with no approval reference is outlined too. Bank accounts are masked. A payment is drawn over the period it paid for, because no paid-on date is held.

## Rule health

- On the Money overview: per check, alerts raised, ruled on, and how the rulings fell (real overpayment, legitimate exception, data error, dismissed). Precision is real overpayments divided by ruled-on alerts; "suspected" is not a ruling. Under 10 rulings the figure is marked "few rulings". Seeded demo rulings give illustrative numbers only.

## Guided story

- `/story` walks through three real cases picked from the live data (an over-settled MYSY payment, a double salary, pay after a status change) with their timelines, then a printable "What the pilot found" page of totals. An open case is preferred so a presenter can act on it. Payroll cases are left out for roles that cannot read payroll; senior management has no access because the cases name people.

## What-if panel

- Expenditure integrity, "What if" tab (DEPT_ADMIN and IT_ADMIN): change the shared-bank minimum (804), the bank-change threshold (805), the default grace days (803) and the two S06 limits, and see per check how many alerts today's settings would raise against the loaded data and how many the new settings would. Nothing is saved and nothing is applied; applying means editing the property or the grace table.
- "Today" is a full dry run of the check on the loaded data, not a copy of the open alerts, so it can differ from the open count (open alerts also reflect earlier runs and de-duplication). 806 and 807 call the scheme engine and are not part of it.
- A dry run keeps its state per thread (`DetectionEngineService.currentRun`), so a what-if and a real detection run at the same time cannot touch each other.

## Data readiness

- `GET /v1/admin/readiness` (DEPT_ADMIN and IT_ADMIN): per-feed completeness checks on entitlement units, settlements, verification events, master changes, employees, service events, payroll and pensions. Counts and percentages only; no names or salaries. Each check names which rules are weakened and what to ask stakeholders to supply.

## One person, one view

- `employee_identity.person_id` links an employee code to the family-registry person id (rule 807 and the person overview). Beneficiary alerts use the registry id; payroll alerts use the employee code.
- `GET /v1/people/{personId}/overview` (or an employee code that maps to a linked registry id) returns beneficiary and payroll slices according to the caller's domain read roles; senior management cannot call it. `GET /v1/people/linked-registry-ids?personIds=` supports the inbox chip on beneficiary rows.
- Demo links: `seed_data/seed_person_link_demo.sql` (undo: `seed_person_link_demo_undo.sql`). Does not change `GJ-BAN-DEESA-01` used by the rule 807 demo.

## Inbox priority ("Work on these first")

- Expected recovery for each **open** alert is **amount at stake × precision**, where precision is that rule's share of ruled-on alerts that were confirmed overpayments (same numbers as Rule health on the Money overview). If a rule has fewer than 10 rulings or no precision yet, the **overall** precision across all rules is used and the score is marked estimated. Alerts with no amount use **`officer.integrity.priority.no-amount-weight`** (default ₹5,000) so checks like 805 still surface. It is a simple heuristic, not a model; it improves as reviewers decide more cases.

## Notices and appeals

- When a decision sets **`noticeRequired`**, officers can draft a bilingual notice from fixed templates (`notices/{en,gu}/{beneficiary,payroll}.txt`). Gujarati wording is plain official Gujarati for the demo and **needs a language review before real use**. Beneficiary notices never include salary, bank account or Aadhaar.
- **`officer.integrity.notice-response-days`** (default 15): response due date = decision date + this many days.
- **`POST .../notice/issue`** and **`.../notice/response`** record what happened outside the system; nothing is posted to the citizen. Roles: issue/response = outcome recorders (`DEPT_ADMIN`, `FINANCE_OFFICER`); draft = case deciders (`review-roles`).
- **`POST /v1/cases/{id}/reopen`** (`DEPT_ADMIN` only) puts a decided or closed case back to **UNDER_REVIEW** for an appeal; verification is cleared if the case was verified closed. A new decision after reopen can change the classification; moving away from **CONFIRMED_OVERPAYMENT** counts as **overturned** once in overview safeguards.
- Money overview totals include **adverseDecisions**, **overturned**, **overturnRate**, **noticesIssued**, **noticesAwaitingResponse**, **appealsOpen** (totals only).

## Demo history timeline (Money overview chart)

Closed cases, recoveries and open alerts in the seeded demo use **synthetic timestamps spread across the 12 calendar months before the load date**, not a single batch date. The spread is deterministic (hash of each case or alert id, weighted toward recent months) so re-running `seed_data/fix_demo_retime_history.sql` or regenerating seeds with `generate_expenditure_integrity_sql.py` / `generate_payroll_resolved_recoveries_sql.py` produces the same shape. All lifecycle timestamps are capped at **database UTC now minus one hour** and kept in order (alert ≥ case created ≤ actions ≤ verification ≤ updated; audits stay inside the case window). Use `python3 seed_data/build_fix_demo_retime_history.py --order-only [--apply]` to repair ordering on an existing database; backups land in `seed_data/backups/retime_*_order_before.csv`. Pre-payment gate demo files named `Demo payment file YYYY-MM` add a small **stopped before payment** series on the chart. Totals (open alerts, confirmed and recovered amounts, recurrence and verification counts) are unchanged; only `detected_at`, case lifecycle timestamps, audit rows and gate decisions move.

## Case file export

- `GET /v1/cases/{id}/export?format=html|json` (same read rule as the case detail). The HTML is one standalone, print-ready A4 page (no scripts, no external files): alerts with evidence, timeline table, decision, outcomes, verification, audit trail, and a "Demo data" line for cases created before 2026. Bank accounts are masked and Aadhaar is never included. All text is escaped. Senior management cannot export.
