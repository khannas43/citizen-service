# Notice letters, appeals, and the share of actions that get overturned

First read `.cursor/commands/eis-00-working-rules.md` and follow it.

## Goal
Safeguards for the person affected: when a case says a notice is required, give the officer a bilingual (Gujarati and English) draft to review; record the person's response or appeal; and report how often adverse decisions are overturned. This is one of the plan's own acceptance measures. Detection stays rule-based; the letter is a template, not generated text.

## What exists
`IntegrityCase.noticeRequired` (set on the decision), classifications in `CaseClassification` (CONFIRMED_OVERPAYMENT, SUSPECTED_OVERPAYMENT, LEGITIMATE_EXCEPTION, DATA_ERROR, DISMISSED), the dismissed count in the overview, `IntegrityAuditLog`, and the case file in `CaseTimelineService` / the case detail.

## Build
1. **Notice draft.** `NoticeService.draft(caseId, language)` returns text built from fixed templates with the case's own facts (person's name for beneficiaries or the employee's name for payroll, scheme or post, the period, the amount at stake, the reason text from the decision, the date to respond by = decision date plus a configurable `officer.integrity.notice-response-days`, default 15, and an appeal paragraph). Templates live in `expenditure-integrity-service/src/main/resources/notices/{en,gu}/{beneficiary,payroll}.txt` with `{{placeholders}}`; the Gujarati text must be written by you carefully in plain official Gujarati and flagged in the doc as needing a language review before real use. Never include a salary figure or bank account in a beneficiary notice, and never include Aadhaar. Endpoint `GET /v1/cases/{id}/notice?lang=en|gu`, readable by the roles that can decide the case; 409 if `noticeRequired` is false.
2. **Mark sent and response.** New entity `CaseNotice { caseId, issuedAt, issuedBy, language, responseDueOn, responseAt, responseKind (NONE, ACCEPTED, DISPUTED, APPEAL), responseNote }` with endpoints `POST /v1/cases/{id}/notice/issue` and `POST /v1/cases/{id}/notice/response` (roles DEPT_ADMIN, FINANCE_OFFICER, same as outcomes). Nothing is sent to anyone: "issue" only records that the officer issued it outside the system. Audit rows for both.
3. **Overturn.** Allow a decided or closed case to be **reopened by an appeal** (`POST /v1/cases/{id}/reopen` with a required reason, roles DEPT_ADMIN) that sets status back to UNDER_REVIEW, keeps the history, and lets a new decision change the classification. A later change from CONFIRMED_OVERPAYMENT to anything else counts as **overturned**. Make sure reopening does not break the verified-closed rules or double count money in `OverviewService` (a reopened case's old confirmed amount must stop counting once reclassified).
4. **Report.** In `OverviewService` totals add `adverseDecisions` (confirmed overpayments ever decided), `overturned`, `overturnRate`, `noticesIssued`, `noticesAwaitingResponse`, `appealsOpen`. Show them in a small "Safeguards" row on the Money overview (totals only).
5. **Portal.** In the case detail, when notice is required: "Draft notice" (English and Gujarati tabs, copy and print buttons, editable text area so the officer can adjust before printing), "Mark as issued", "Record response". "Reopen on appeal" for DEPT_ADMIN on closed or decided cases.

## Tests
Template fill with every placeholder replaced and none left over (for both languages and both domains); no salary, bank or Aadhaar in a beneficiary notice; 409 when notice not required; reopen rules; overturn counted once; metrics after reclassification; role tests; portal flows.

## Live check
Pick a case with `noticeRequired`, draft in both languages, issue, record a dispute, reopen, reclassify as DATA_ERROR, and watch the overview figures move. Restore the case afterwards from a saved copy of its rows (case, audit rows, notice rows) and confirm the overview is back to its earlier numbers.
