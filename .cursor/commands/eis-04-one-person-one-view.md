# One person, one view: show beneficiary and payroll alerts together

First read `.cursor/commands/eis-00-working-rules.md` and follow it.

## Goal
When the same human appears both as a beneficiary and as an employee or pensioner, an officer opens one panel and sees every alert, case and entitlement for that person across both areas.

## The link that exists
`employee_identity.person_id` (nullable) holds the beneficiary `person_id` (family registry id) for an employee; it is loaded with the optional last column of the employees CSV and drives rule 807. Beneficiary alerts carry `personId` = the registry id; payroll alerts carry `personId` = the **employee code**, so to join them go through `EmployeeIdentityRepository` (employee code to `person_id`).

## Build
1. **Backend** `GET /v1/people/{personId}/overview` (`PersonViewService`): resolve the person (the registry id, or an employee code which maps to its `person_id` when set). Return `{ linked: boolean, beneficiary: { alerts[], entitlements[], totalAtStake }, payroll: { employeeCode, post, ddoCode, alerts[], totalAtStake } | null }`. Each alert has rule code, status, severity, amount, caseId, summary. Roles: the beneficiary part needs beneficiary read roles, the payroll part needs payroll read roles; a caller who may read only one side gets only that side and `linked` is still reported (no salary, post or DDO for a caller without payroll rights). Register the matchers in `OfficerSecurityConfig` and check with `DomainAccess` in the controller. SENIOR_MGMT: 403.
2. **Portal:** a "Person view" slide-over reachable from a person's name in the alert inbox, the case detail and the pre-payment gate lines. Two columns (Beneficiary payments, Payroll and pension) each with its alerts as links to open the case, a linked/not-linked badge, and the combined amount at stake. If not linked, say so and show only what exists.
3. Show a "Also appears in payroll" chip in the beneficiary inbox rows for linked people (cheap query: one call that returns the set of linked registry ids for the visible page).
4. **Demo link:** add `seed_data/seed_person_link_demo.sql` that links two existing demo employees to two beneficiaries who already have alerts, so the view has something to show. Do not reuse the person used by `seed_rule807_demo.sql` unless you also keep that file working. Provide an undo.

## Tests
Service: linked and unlinked people, a payroll-only caller, a beneficiary-only caller (payroll side hidden), employee-code lookup, SENIOR_MGMT 403. Portal: panel with both sides, with one side, with none.

## Live check
Open a linked person from the beneficiary inbox as DEPT_ADMIN and see both sides; open the same person as SCHEME_DEPT and confirm no payroll data appears anywhere in the response.
