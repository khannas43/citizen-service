# Maker-checker: large recoveries need a second approver

First read `.cursor/commands/eis-00-working-rules.md` and follow it.

## Goal
A recovery above a configured amount is recorded as a request and takes effect only when a different person approves it. Today `IntegrityCaseService.recordAction` records an outcome in one step and `verifyClosed` does not require a different person.

## Rules to implement
- New property `officer.integrity.recovery-approval-threshold` (default `100000`, in rupees). A `RECOVERY_RECORD` action whose payload `amount` is at or above it becomes a **pending approval**; below it behaves exactly as today. A recovery with no `amount` in the payload follows today's path.
- A pending recovery does not move the case to `ACTION_RECORDED`, does not resolve alerts, and does not count as a recovery in metrics until approved.
- `POST /v1/cases/{id}/actions/{actionId}/approve` (roles `DEPT_ADMIN`, `FINANCE_OFFICER`, same as outcomes) and `.../reject` with a required reason. The approver must be a **different Keycloak subject** from the requester; same subject is 409 with a clear message. Both write audit rows (`RECOVERY_REQUESTED`, `RECOVERY_APPROVED`, `RECOVERY_REJECTED`).
- Add `ActionStatus` (PENDING, APPROVED, REJECTED) to `IntegrityAction` with `requestedBy`, `decidedBy`, `decidedAt`, `decisionNote`; existing rows are APPROVED by default (the schema is created by Hibernate `ddl-auto=update`; give the column a default so old rows load).
- Also add the same "different person" check, off by default, for `verifyClosed` behind `officer.integrity.verify-needs-second-person=false`, because only one DEPT_ADMIN user exists today.

## Portal
- In the case detail, a pending recovery shows as "Waiting for approval — requested by <role>" with Approve and Reject (reject needs a reason). The requester sees "A second officer must approve" and no approve button.
- The Money overview gets one small count "Recoveries waiting for approval" (totals only).

## Demo needs a second user
Only `dept.admin` has DEPT_ADMIN. Create one extra Keycloak user for the demo (for example `dept.admin2`, realm role DEPT_ADMIN only, no new roles) through the Keycloak admin API or `setup-keycloak.sh` conventions, and document its name (not the password) in `docs/EXPENDITURE_INTEGRITY_ASSUMPTIONS.md`. Read the demo password convention from `docs/PROJECT_PLAN.md`.

## Tests
- Service: below the threshold unchanged; above it pending and nothing resolved; same subject cannot approve (409); a different subject can; reject needs a reason; metrics ignore pending; audit rows written.
- Security test for the two new endpoints; portal tests for the pending, requester and approver views.

## Live check
With two tokens: record a recovery above the threshold as user 1, confirm it is pending, fail to approve as user 1, approve as user 2, and see the case move to outcome recorded. Clean up any case you changed by restoring its backup (save the row first).
