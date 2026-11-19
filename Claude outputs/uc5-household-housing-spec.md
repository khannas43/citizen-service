# UC5 Household and housing assistance: officer and citizen sides

Spec for Cursor. 7 Nov 2026. Draft 1, written from the project documents and from what we learned building UC1 and UC4. I could not read the repository when I wrote this, so section 2 is a list of things to PROVE before building, not a statement of fact. Same rules as earlier specs: no git commit or push, no DG2.0 and no port 8090, synthetic data only, no real identity numbers or client names, Telugu for every new string (officer: te.js, te.decisions.js or te.uc5.js; citizen: te.json), nothing outside the files named. Claude reviews the result.

## 1. The question UC5 answers

"Does this household qualify for housing assistance, and is anyone already getting it?" The Housing department asks yes-or-no questions about a **household** (income band, number of members, owns a house or not, ration card category, already receiving housing assistance) **with the applicant's consent, without any document moving**. A household is several people, so the new problem here, compared with UC4, is whose consent counts and whose data may be used. Nothing is ever enrolled automatically.

## 2. Step 0: find out what exists (Cursor does this first and reports before changing anything)

Write `test_what_a_household_applicant_sees_today` first, and put the answers to these in the report as a short table (question, answer, file and line):
1. Is there a housing purpose in `exchange.PURPOSES`? Its code, elements and `consent_required`. Is it asked through `request_consent` and answered through `verify`?
2. Which household questions does `verify` answer today (the wave 2 "household questions")? List each question name, its params, and the outcomes it can return (ANSWERED, DENIED_NO_CONSENT, DENIED_POLICY, NO_RECORD, EXPIRED_SOURCE, CONFLICT, anything else).
3. How is a household found: through `relationship` rows (SAME_HOUSEHOLD, PARENT_OF), through a shared ration card on `pds_view` records, or through the `housing` source? Which of these can disagree?
4. What does `/api/worklists/household` return today (`duplicate_benefit`, `multi_card`, `dead_active`), and which `mdm.dq_issue` codes feed it (`ON_MULTIPLE_RATION_CARDS`, `DEAD_ACTIVE_ON_RATION_CARD`)?
5. Can an adult household member, a head of household, or a child see or answer a housing consent in the citizen portal today? (Expected: today only the principal; `_card_view` and `CARD_PURPOSES` were built for scholarship only.) Show what each of these three sees.
6. Does anything raise work for a person when a housing check cannot be answered?

## 3. Decisions (each with a recommendation; Sameer confirms before build)

- **Z1. Whose consent.** Only the applicant answers, and the applicant must be an adult (at or over `adult_age`). The applicant is the head of the household or the adult applying on its behalf. Other adult members are **not** asked and **do not see the card** (a shared household is never enough, as in the birth rule). In return the Housing department may receive only **household-level yes-or-no answers**; no value, certificate or personal detail of another member is ever returned. A minor cannot be an applicant. Recommendation: yes.
- **Z2. When consent is asked.** When the applicant starts an application (the Housing system calls `request_consent`), not in bulk. Recommendation: yes (same as UC4 Y2).
- **Z3. Consent length.** Use `consent_expiry_days_by_purpose` (built in UC4) with 90 days for the housing purpose. Recommendation: yes.
- **Z4. One benefit per household.** If the household already receives housing assistance (or two applications exist for one household), this is never decided by the engine: it is class C, a person decides. Recommendation: yes.
- **Z5. Household composition is never edited by this use case.** A dead person still active on a ration card, or a household that looks like two, is raised as work for the owning department; the master record changes only when that department corrects its own record (the rule from UC1). Recommendation: yes.

## 4. What to build

### 4.1 Citizen portal: the housing consent card

Reuse the single-consent card (`consent-{id}`, `CARD_PURPOSES`, `_card_view`, `answer_consent`) built for scholarship; add the housing purpose and its wording. Do not copy the code: generalise it so a purpose supplies its text, its elements and its rule for who answers.
- **Visibility and answer.** Only the principal (the applicant, adult) sees and answers. Everyone else, including other household members and a child, gets 404. No declaration step is needed for an adult answering for themselves.
- **Wording (plain, Telugu too).** "The Housing department wants to check whether your household can get housing assistance. It will ask: is your household income below a limit, how many people live in the household, whether the household owns a house, which ration card category it holds, and whether anyone in it already gets housing assistance. It gets a yes or no. It does not get anyone's certificates or personal details, and other members of your household are not asked. This permission lasts until <date> and you can stop it any time."
- **Choices.** Allow, partly allow (choose from the elements), Not now. Withdraw later from the same card, with a receipt saying what stopped and what remains (`citizen.withdraw`).
- Receipt wording follows the answer (Allowed, Partly allowed, Not allowed); never "approved" after a refusal.

### 4.2 Non-answers become work for a person

When `verify` returns one of the outcomes below for the housing purpose, raise **one open proposal per household (use the head person) and kind**, de-duplicated by a partial unique index, closed when the situation clears, visible in the Work queue. Raise it through `events._propose`, and approve only through `events.decide_proposal` (hooks for the follow-up go there, as UC4 did).

| Situation | Proposal kind | Reason code | Class | Batchable | Owning department |
|---|---|---|---|---|---|
| Household already receives housing assistance, or two applications for one household | REVIEW_DUPLICATE_BENEFIT | DUPLICATE_BENEFIT | C | no | Housing |
| A dead person is still active on the household's ration card | REVIEW_CARD_MEMBER | CARD_DEAD_ACTIVE | C | no | Civil supplies |
| The ration card and the housing record disagree on who is in the household | SETTLE_HOUSEHOLD_CONFLICT | HOUSEHOLD_CONFLICT | C | no | Housing |
| The applicant has no ration card or household on record | MANUAL_ROUTE (existing kind) or a new NO_HOUSEHOLD | NO_HOUSEHOLD | B | yes (sends the applicant one notice: "we could not find your household; please contact the Civil supplies office") | Housing |

- Approving any of these records a delivery to the owning department with the household head and references only (never a value) and, for NO_HOUSEHOLD, one notice to the applicant. It never edits a record and never chooses between two values.
- DUPLICATE_BENEFIT and HOUSEHOLD_CONFLICT need a written reason (add to the always-reason set).
- Add the kinds to `workqueue.classify`, its coverage test and `feed.USE_KEYS`, with Telugu labels.

### 4.3 Officer: Households screen and Housing view

- **Households** (`/dx/checks`, tab Households): build it on the table standard (see 4.5). Columns: household (head, ration card reference), members, housing record (yes or no), overlap kind (duplicate benefit, several cards, dead person active), consent state for the applicant (none, asked, allowed, refused, expired), open item. Filters: overlap kind, consent state, district, open item. A row opens the head in master data.
- **Flow board:** a "Housing" row under the departments with the housing check outcomes of the last 7 days (answered, no consent, policy, no household, conflict) from the ledger, each number linking to the Ledger filtered to it, plus the open items by reason. Counts only; no household value.
- Every number uses the standard definitions in the help drawer.

### 4.4 Daily job additions (reuse `uc4.daily_job` structure; do not fork it)

Add to the same daily job, in order, idempotent, counted in the same `job_run` row:
- housing consent sweep is already covered by `exchange.sweep`;
- close housing items whose situation cleared (the dead person no longer active, the second application withdrawn);
- no bulk invitations in this release.
The handover rule from UC4 does not apply here (an adult applicant has no guardian).

### 4.5 Standards every officer screen in this spec must meet

- Tables use `DataTable` from `screens/dx/dxKit.jsx` in server mode, with sortable headers, page size and paging, `SearchBox`, `FilterSelect`/`Segmented`, a Clear button, `EmptyState`, error with retry, and a summary strip (`Stats`). Routes take `q`, the filters, `sort`, `dir`, `limit`, `offset` and return `total`.
- Status is never shown by colour alone.

## 5. Data changes

`db/mdm/018_uc5.sql`, idempotent, added to `scripts/mdm_setup.sh` after 017:
- a partial unique index so only one open proposal exists per person and kind for the four new kinds (as `proposal_open_uc4_ux`);
- nothing else unless Step 0 shows a table is missing. Policy: add the housing purpose to `consent_expiry_days_by_purpose` (90).

## 6. API

- `GET /api/worklists/household` extended with `q`, filters, `sort`, `dir`, `limit`, `offset`, `total`. Department-scoped officers still get 403.
- `GET /api/x/housing/outcomes?days=` (read role, counts only).
- Citizen: the existing approvals routes handle the housing card; no new citizen route.

## 7. Lessons from UC4 that apply here (these each cost us a round trip)

1. A consent about someone else is not the person's own. Any query that finds "guardian or other-person consents" must restrict to consents whose subject is the person themselves (`subject_person_id IS NULL OR = person_id`). A birth consent answered by the other parent must never be ended or touched by anything in UC5.
2. Counts reported by a job must count real changes only; a second run the same day returns all zeros. Test that.
3. Tests make their own data (letters-only names, own couple or household, own certificates); never depend on the shared demo data or on seeded history.
4. The sample-rows rule and the reason box in the Work queue stay as they are.
5. No income, category, certificate or personal value in any officer route, delivery, ledger row or audit row. Only references, counts and states.
6. A demo-case script `mdm-service/tools/demo_uc5_cases.py` (dry-run default, `--apply`, `--remove`; tag `DEMO-UC5-`) plants one household for each situation in 4.2 plus one clean household, runs the real housing check for each, and prints the outcome and the proposal raised. Running `--apply` twice raises nothing new.
7. When you change a screen, update its existing tests rather than deleting them; Telugu coverage must pass.

## 8. Tests (Cursor writes these first)

Backend `mdm-service/tests/test_uc5.py`:
1. `test_what_a_household_applicant_sees_today` (documents the starting point from Step 0)
2. `test_the_applicant_sees_and_answers_the_housing_consent_and_nobody_else_does`
3. `test_a_household_member_and_a_child_get_404`
4. `test_a_minor_cannot_be_an_applicant`
5. `test_partial_allow_returns_only_the_allowed_household_answers`
6. `test_a_housing_answer_never_contains_a_member_value`
7. `test_duplicate_benefit_raises_one_class_c_item_per_household_and_is_not_batchable`
8. `test_dead_person_on_the_card_raises_one_item_for_civil_supplies`
9. `test_household_conflict_raises_a_class_c_item_and_chooses_no_value`
10. `test_no_household_raises_a_batchable_item_and_approval_sends_one_notice_and_one_delivery`
11. `test_approving_any_of_them_goes_through_decide_proposal_and_edits_nothing`
12. `test_each_open_item_is_one_per_household_and_kind_and_closes_when_cleared`
13. `test_the_new_kinds_have_reason_codes_class_and_telugu_labels` (coverage test)
14. `test_per_purpose_expiry_applies_to_housing`
15. `test_withdraw_stops_the_answers_and_says_what_stopped_and_what_remains`
16. `test_the_daily_job_second_run_changes_nothing_and_does_not_touch_birth_consents`
17. `test_the_housing_officer_never_receives_a_household_member_value`
18. `test_housing_outcome_counts_match_the_ledger`
19. `test_the_household_worklist_sorts_filters_searches_and_pages` and `test_a_department_scoped_officer_gets_403_on_the_household_worklist`
20. (slow) `test_a_volume_day_of_household_applications_lands_non_answers_in_a_few_groups` (500 applications; about 6% duplicate, 3% dead person on card, 2% conflict, 4% no household)

Citizen portal (vitest): the housing card (applicant only), partial allow, withdraw receipt, wording never says "approved" after a refusal, Telugu coverage.

Officer portal (vitest): Households table (search, filter, sort, paging, Clear, empty state), Housing row on the Flow board linking to the Ledger, the four new groups in the Work queue (class C groups show no Approve all), menu and tour tests updated.

## 9. Setup and review

Sameer runs: `bash scripts/mdm_setup.sh`, the mdm-service image rebuild and restart, both portal builds. No git operations by Cursor. Cursor reports: the Step 0 table, test counts by file, the routes added, the exact commands to run, and the `demo_uc5_cases.py` output from the cluster pod.

Claude checks: only the applicant can see and answer; no other member's value reaches any route; the four kinds cannot be approved except through `events.decide_proposal`; one open item per household and kind; a second daily run is all zeros and birth consents are untouched; Flow board Housing numbers match the queue; the Households table standard; Telugu complete.

## 10. Open for Sameer

Z1 to Z5 above. One more to decide later: when the head of a household dies (UC3), should the household consent end and the household be asked again? Not built here; it belongs with UC3.
