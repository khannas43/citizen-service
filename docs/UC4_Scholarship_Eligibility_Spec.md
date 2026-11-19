# UC4 Turning 18 and scholarship eligibility: officer and citizen sides

Spec for Cursor. 5 Nov 2026. Build after slice 1 has been reviewed (it adds proposal kinds that use the slice 1 Work queue). Claude reviews the result as before. Same rules as earlier specs: no git commit or push, no DG2.0, no real identity numbers or client names, Telugu for every new string, nothing outside the files named.

## 1. The question UC4 answers

"Who is about to become an adult, and what do they need to claim what they are entitled to?" The Education department asks yes-or-no eligibility questions (income band, category, residence, age) about a student, with the student's consent, **without any document moving**. Before 18 a parent consents. At 18 the parent's consent ends and the student is asked afresh. Nothing is ever enrolled automatically.

## 2. What exists today (read from the code, 5 Nov)

- Purpose `SCHOLARSHIP_ELIGIBILITY` (system education, consent required, elements income_band, category, residence, age). `exchange.verify` answers one question per call and returns one of: ANSWERED, DENIED_NO_CONSENT, DENIED_POLICY, NO_RECORD, EXPIRED_SOURCE (certificate expired), CONFLICT (certificates disagree). It never picks a value when sources disagree.
- `exchange.handover_at_majority` ends a guardian's consent at the adult age (policy `adult_age`, 18) and asks the individual afresh. It is **manual, per person** (`POST /api/x/persons/{pid}/handover`). `exchange.sweep` (expiry) is also manual (`POST /api/x/consents/sweep`, admin).
- `GET /api/worklists/turning-18` lists people aged 17 to 19 with a to-do list (identity reference, income certificate none or expired, not on the scholarship portal).
- The scholarship consent has no event and no `subject_person_id`. In the citizen portal a consent is found by `_consent_rows_for_me`: the principal sees it; a parent sees it only through an event or through `subject_person_id`. So **a parent cannot see or answer a minor's scholarship consent in the citizen portal today**, and the approvals list and detail are shaped around event groups. (Cursor: write the test that shows what a parent and a student see today before changing anything.)
- EXPIRED_SOURCE, CONFLICT and NO_RECORD (another state) are returned to the asking department and logged in the ledger. Nothing is raised for a person to act on, so a clerk at the issuing office never hears about them.
- `ops.withdraw_and_purge` and `citizen.withdraw` exist; the citizen portal has a withdraw action on consents.

## 3. Decisions (to confirm; each has a recommendation)

- **Y1.** Under 18 only a recorded parent can answer; the student sees "waiting for your parent" and cannot answer. At 18 only the student can answer. Recommendation: yes (this is what the engine already enforces).
- **Y2.** Consent is asked **when the student starts an application** (the Education system calls `request_consent`), not in bulk to everyone aged 17 to 19. A bulk ask would create consent requests with no purpose in use. The turning-18 list instead supports a plain **invitation to apply** (a notice, not a consent request). Recommendation: yes.
- **Y3.** Eligibility consent length: one global default today (365 days). A scholarship check needs weeks, not a year. Allow a per-purpose override `consent_expiry_days_by_purpose` (suggest 90 days for scholarship). Recommendation: yes.

## 4. What to build

### 4.1 A daily job instead of three manual steps

- `POST /api/x/jobs/daily` (admin; also callable by a scheduler with a service credential), idempotent, writes one `mdm.job_run` row with counts. It runs: (a) consent sweep (expiry); (b) majority handover for every person at or over `adult_age` who still has an active guardian consent (catch-up included, not only birthdays); (c) invitations to apply for people turning 18 within 30 days with no scholarship record (notice only, once per person, through `notify.py`); (d) the expiry reminder for income certificates ending within 30 days (notice to the citizen only).
- `mdm-service/k8s-cronjob.yaml`: a CronJob that calls the endpoint once a day. Sameer applies it. The endpoint also takes `as_of` so the demo clock can move forward (as `sweep` already does).
- Officer Consent screen: "Run daily checks now" (admin), showing the last run and counts.

### 4.2 Citizen portal: the scholarship consent

Uses the existing Approvals list and detail, with a **single-consent card** (key `consent-{id}`) for consents that have no event.

- **Visibility.** The principal (the student) and a recorded parent see the card. To make this work set `subject_person_id` to the student when the scholarship consent is requested (so `PARENT_OF` finds the parent), and extend `_consent_rows_for_me`, `get_approval` and the answer route for non-event consents. An unrelated person gets 404.
- **Who answers.** Under 18: a recorded adult parent, with the same declaration step as the birth consent (who is answering, declaration version). The student sees the card read-only with "waiting for your parent". At or over 18: only the student. Household members are never enough (already the rule).
- **Wording (plain, Telugu too).** "The Education department wants to check if you can get a scholarship. It will ask: is your family income below a limit, which category you belong to, where you live, your age. It gets a yes or no. It does not get your certificates. This permission lasts until <date> and you can stop it any time."
- **Choices.** Allow, partly allow (choose from the four elements), or Not now. Withdraw later from the same card, with a receipt that says what stopped and what remains (calls `citizen.withdraw`, which purges temporary results).
- **The handover notice (age 18).** When the job ends a guardian consent, the student gets "You are now 18. Your parent's permission has ended. If you still want the check, please decide for yourself." The new consent is PENDING and nothing is enrolled.
- **Receipt wording** follows the answer (Allowed, Partly allowed, Not allowed), never "approved" after a refusal.

### 4.3 Non-answers become work for a person

When `verify` returns one of the outcomes below for the scholarship purpose, the engine raises **one open proposal per person and outcome** (de-duplicated; closed when the situation clears), visible in the slice 1 Work queue for the owning department.

| Outcome | Proposal kind | Reason code | Class | Group label | Batchable | Owning department |
|---|---|---|---|---|---|---|
| EXPIRED_SOURCE | RENEW_CERTIFICATE | CERT_EXPIRED | B | Certificate expired: ask the citizen to renew | yes (sends one notice each) | Revenue |
| CONFLICT | SETTLE_SOURCE_CONFLICT | CERT_CONFLICT | C | Certificates disagree | no | Revenue |
| NO_RECORD, known other-state applicant | MANUAL_ROUTE | OTHER_STATE | B | Applicant from another state: route manually | yes | Education |

- Approving CERT_EXPIRED sends a notice to the citizen ("your income certificate has expired; renew it with the issuing office") and records a delivery to the Revenue department with the person and certificate reference. It never edits a certificate.
- CERT_CONFLICT never chooses a value; the officer records which certificate they will ask the issuing office to re-check (a reason is required) and the case stays open until a certificate changes.
- The three kinds are added to `workqueue.classify` and its coverage test, with Telugu labels.

### 4.4 Officer: Turning 18 worklist and Education view

- Turning 18 screen: add a "Consent" column (none, parent asked, parent allowed, handover pending, student allowed, refused, ended) and an "Invite to apply" action (bulk, with a count preview and confirmation; one notice per person; blocked if already invited).
- Flow board: an "Education" row already comes from deliveries; add under it the verify outcomes of the day (answered, no consent, expired, conflict, no record) from the ledger via `GET /api/x/eligibility/outcomes?days=7`, each number linking to the Ledger filtered to it.
- Every number shown to an officer about a student uses the standard definitions in the help drawer. No student value (income, category) is displayed to the Education officer: only the answers the engine already allows.

## 5. Data changes

`db/mdm/017_uc4.sql` (idempotent; add to `scripts/mdm_setup.sh` after 016):

```sql
CREATE TABLE IF NOT EXISTS mdm.job_run (
  id bigserial PRIMARY KEY, job text NOT NULL, actor text NOT NULL, as_of timestamptz,
  result jsonb NOT NULL DEFAULT '{}', ran_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS job_run_ix ON mdm.job_run (job, ran_at DESC);
CREATE TABLE IF NOT EXISTS mdm.invitation (
  id bigserial PRIMARY KEY, person_id bigint NOT NULL REFERENCES mdm.person(id) ON DELETE CASCADE,
  kind text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS invitation_once_ux ON mdm.invitation (person_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS proposal_open_uc4_ux ON mdm.proposal (person_id, kind)
  WHERE status='PROPOSED' AND kind IN ('RENEW_CERTIFICATE','SETTLE_SOURCE_CONFLICT','MANUAL_ROUTE');
```

Policy gains `consent_expiry_days_by_purpose` (object; default `{"SCHOLARSHIP_ELIGIBILITY": 90}`), validated like the other policy values, with text in `POLICY_TEXT` and Telugu. `request_consent` and `respond` use it when present.

## 6. API

- `POST /api/x/jobs/daily` `{as_of?}` (admin) and `GET /api/x/jobs/last`.
- `POST /api/x/turning-18/invite` `{person_ids | filter, preview?: true}` (write role).
- `GET /api/x/eligibility/outcomes?days=`.
- Citizen: `GET /api/citizen/approvals` includes `consent-{id}` cards; `GET /api/citizen/approvals/consent-{id}`; `POST /api/citizen/approvals/consent-{id}/answer` (decision, elements, relationship and declaration when under 18).

## 7. Tests (Cursor writes these first)

Backend `mdm-service/tests/test_uc4.py`:
1. `test_what_a_parent_and_a_student_see_for_a_scholarship_consent_today` (written first, documents the starting point)
2. `test_a_parent_sees_and_answers_a_minors_scholarship_consent_through_the_citizen_api`
3. `test_a_student_under_18_sees_it_read_only_and_cannot_answer`
4. `test_an_unrelated_person_and_a_household_member_get_404_or_403`
5. `test_at_18_only_the_student_can_answer`
6. `test_the_daily_job_ends_guardian_consent_at_18_and_asks_the_student_and_enrols_nothing`
7. `test_the_daily_job_catches_up_someone_who_turned_18_last_month`
8. `test_the_daily_job_is_idempotent_and_writes_one_job_run_row`
9. `test_the_invitation_is_sent_once_per_person`
10. `test_expired_certificate_raises_one_open_proposal_per_person_and_closes_when_renewed`
11. `test_conflicting_certificates_raise_a_class_c_proposal_and_no_value_is_chosen`
12. `test_other_state_applicant_raises_a_manual_route_item`
13. `test_approving_cert_expired_sends_one_notice_and_one_delivery_and_edits_nothing`
14. `test_the_new_kinds_have_reason_codes_class_and_telugu_labels`
15. `test_per_purpose_expiry_overrides_the_global_default`
16. `test_withdraw_stops_the_answers_and_returns_what_stopped_and_what_remains`
17. `test_the_education_officer_never_receives_an_income_or_category_value`
18. `test_eligibility_outcome_counts_match_the_ledger`
19. `test_a_volume_day_of_students_applying_lands_non_answers_in_a_few_groups` (slow; seed 500 students aged 17 to 19 with about 8% expired certificates, 2% conflicts, 3% other state)

Citizen portal (vitest): single-consent card for the parent (declaration required), read-only card for the under-18 student, the handover notice, partial allow, withdraw receipt, wording never says "approved" after a refusal, Telugu coverage.

Officer portal (vitest): Consent column and Invite to apply with preview and confirmation, Education outcomes row linking to the Ledger, "Run daily checks now", the three new groups in the Work queue (CERT_CONFLICT shows no Approve all), menu and tour tests updated.

## 8. Setup and review

Sameer runs: `bash scripts/mdm_setup.sh`, both portal builds, `kubectl apply -f mdm-service/k8s-cronjob.yaml`. No git operations by Cursor.

Claude checks: a parent really can answer from the citizen portal and an unrelated person cannot; the handover enrols nobody; the daily job is safe to run twice; no new route reveals an income or category value; the three new proposal kinds cannot be approved without passing through `events.decide_proposal`; Flow board and queue counts agree; Telugu complete.

## 9. Decisions recorded (Sameer, 5 Nov 2026)

Y1, Y2 and Y3 are accepted as written in section 3. They are now requirements, not options.
