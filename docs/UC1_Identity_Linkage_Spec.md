# UC1 Identity linkage: officer and citizen sides

Spec for Cursor. 5 Nov 2026. Build after slice 1 of `Officer_Scale_Slice1_Spec.md` has been reviewed (this spec changes `workqueue.py` and `work_api.py`). Claude reviews the result as before. Same rules as earlier specs: no git commit or push, no DG2.0, no real identity numbers or client names, Telugu for every new string, nothing outside the files named.

## 1. The question UC1 answers

"Is this the same person across departments?" Today the matching engine links records automatically at a score of 0.76 or more (`matching.MatchConfig.auto`), and puts the doubtful ones (0.56 to 0.76, `review`) in a steward review queue (`mdm.review_task`, screens: Review queue, Person detail, Discrepancies). That works one record at a time. This spec makes it work at volume and gives the citizen a safe way to correct their own details.

## 2. What exists today (read from the code, 5 Nov)

- `stewardship.decide(task, LINK|SEPARATE, person_id, actor, note)` is the only write path for a review decision. It rebuilds the golden records, derives relationships and writes the audit entry. `stewardship.unlink` undoes a link.
- Review tasks are **not proposals**. They live in `mdm.review_task` with `candidates` (jsonb) and the record's `score`. Slice 1's Work queue reads only `mdm.proposal`, so these tasks are invisible to it.
- `mdm.discrepancy` (kind DISCREPANCY or DECLARATION, status ROUTED, CORRECTED_AT_SOURCE, CONFIRMED_AS_IS, REJECTED, DECLARED) records "a value is wrong" and routes it to the department that owns the value (`ops.ATTR_AUTH`). The master record is never changed here; it changes when the department corrects its own record.
- The citizen request kind `CONFIRM_DETAILS` exists (`citizen.raise_request`, `answer_request`) but nothing raises it automatically, and a DISPUTE only marks the request DISPUTED. It does not create a discrepancy, so a dispute goes nowhere.
- There is no citizen screen for reporting a wrong detail in the new sign-in portal. The older token-based `my_report` exists (F3 in the inventory).

## 3. Decisions that shape this spec (to confirm; each has a recommendation)

- **X1.** A wrong merge is the worst identity error: it puts one person's entitlements and consents on another. So every LINK is a person's decision, never batch approved in this release. A rule that auto-links near-threshold records waits for slice 2 (hold, undo, sampling, circuit breaker). Recommendation: yes.
- **X2.** The citizen is asked to confirm details **only about records already linked to them with confidence (score at or above the automatic threshold)**. A citizen is never asked "is this record yours?" about a doubtful candidate: that record may belong to someone else (a father and son with the same name) and showing it would expose another person's data. Recommendation: yes.
- **X3.** Batch approve is allowed for one group only: low-score candidates where the steward keeps the records separate (SEPARATE), because a wrong SEPARATE leaves two records that can still be linked later and sends nothing anywhere. Recommendation: yes, with the same sample, reason and batch id as slice 1.

## 4. Officer side

### 4.1 Review tasks join the Work queue

Generalise the Work queue so an item is `{kind: "PROPOSAL"|"REVIEW"|"ISSUE", id}` and its key is a string (`p-123`, `r-45`, `i-9`). Slice 1 keys become `p-<id>`; keep the old numeric routes working for one release. Tests from slice 1 must still pass.

New reason codes (added to `workqueue.classify`; same rule: a kind without a code fails the coverage test):

| Reason code | Condition (config values are read, never copied) | Class | Group label | Batchable |
|---|---|---|---|---|
| LINK_NEAR | exactly one candidate, score from `auto − 0.06` up to below `auto`, lead over the runner-up at least `margin`, no date-of-birth or gender conflict | C | Probably the same person | no (X1) |
| LINK_AMBIGUOUS | two or more candidates within `margin` of each other (same name, similar age) | C | More than one possible person | no |
| LINK_LOW_SEPARATE | best score below `auto − 0.06` and at or above `review`, suggestion SEPARATE | B | Unlikely to be the same person | yes (X3) |
| SOURCE_CONFLICT | open `dq_issue` where sources disagree on date of birth, name or gender for one linked person | C | Two departments disagree | no |

The `auto − 0.06` offset becomes a policy value `link_near_margin` (default 0.06) so it is visible and versioned, not hard-coded.

### 4.2 Evidence for a link decision

For a review item the drawer shows the record and each candidate side by side: name (original script and transliteration skeleton from `names.py`), date of birth, gender, district, mandal, village, address, parents, ration card, source department and as-of date, the per-attribute scores already stored in `source_record.evidence`, and the fields that differ highlighted (not by colour alone). Buttons: Link to candidate N, Keep separate, Skip. A reason is required when the policy says so (`rationale_required_kinds` gains `LINK_AMBIGUOUS` and `SOURCE_CONFLICT`). Keyboard: A (link to first candidate), 1 to 9 (choose candidate), S (separate), N (next); visible legend.

Each decision calls `stewardship.decide`, and for batch SEPARATE one savepoint per task, as in slice 1. The batch id is written to the review task and to the audit detail.

### 4.3 Flow board row

Add a row "Identity linkage (MDM)": received (records loaded in 24 hours), linked automatically, in review (open tasks), decided today, oldest waiting, on time. Definitions go in the help drawer. Numbers link to the Work queue filtered to those reasons.

### 4.4 Source conflicts

`SOURCE_CONFLICT` items are fed from `mdm.dq_issue` (codes for date of birth, name, gender conflict; confirm the exact code names in `quality.py` first and list them in the test). The steward chooses which department's value is right **only by sending a correction request to the owning department** (`stewardship.request_correction`); the master value is never edited by the steward. This keeps the rule "no silent choice" from the scenario catalogue (1.3).

## 5. Citizen side

Two screens, both under the existing Approvals area of the citizen portal and using `approvalsApi.js`. Telugu for every string (the coverage test must pass).

### 5.1 "Please confirm" a detail the departments disagree on

- **Trigger.** When two sources disagree on name spelling, date of birth or address for a person who has a signed-in link and whose records are linked at or above the automatic threshold (X2), the engine raises a `CONFIRM_DETAILS` request: summary "Your date of birth is recorded differently by two departments", detail carrying attribute, value A with department name, value B with department name. At most one open request per person and attribute. Notification through `notify.py` (still best effort, off unless `NOTIFY_ENABLED=true`).
- **Screen.** Shows both values and who holds each, and offers: "The first is right", "The second is right", "Neither: I will type the correct value" (typed value, required, with the reason). No identity documents are uploaded.
- **Outcome.**
  - "Right" for a value: creates a `CITIZEN_CONFIRM` proposal (class C, one by one) naming the chosen value and the department; the master record is **not** changed by the citizen's answer. Today's `answer_request` already works this way for CONFIRM.
  - "Neither" (a dispute): **new**: raises a discrepancy (`ops.raise_discrepancy`) routed to the owning department with the typed value, status ROUTED, channel PORTAL. Today a dispute raises nothing; fix that.
- **Receipt.** Plain words: "We have sent your correction to <department>. Your record changes when they correct their own. You will be told." No claim that anything was updated.

### 5.2 "Report a wrong detail" (citizen starts it)

- Menu entry under Approvals ("My requests"). Form: which detail (list limited to `ops.ATTR_AUTH` keys, shown in plain words), what is recorded now (read-only, from the person's own golden record), what it should be, optional reason.
- Calls `ops.raise_discrepancy` with channel PORTAL and the signed-in person. One open report per attribute (409 with a friendly message).
- "My reports" list with status trail: Sent to the department, Corrected at the source, Kept as it was (with the department's note), Not accepted. When the department resolves it, `notify.send` tells the citizen once.
- **Not built:** a citizen screen for doubtful matches (X2).

## 6. Data changes

`db/mdm/016_uc1.sql` (idempotent; add to `scripts/mdm_setup.sh` after 015):

```sql
ALTER TABLE mdm.review_task ADD COLUMN IF NOT EXISTS reason_code text;
ALTER TABLE mdm.review_task ADD COLUMN IF NOT EXISTS risk_class  text;
ALTER TABLE mdm.review_task ADD COLUMN IF NOT EXISTS batch_id    bigint;
ALTER TABLE mdm.review_task ADD COLUMN IF NOT EXISTS claimed_by  text;
ALTER TABLE mdm.review_task ADD COLUMN IF NOT EXISTS claimed_at  timestamptz;
CREATE INDEX IF NOT EXISTS review_task_queue_ix ON mdm.review_task (status, reason_code, id) WHERE status='OPEN';
ALTER TABLE mdm.citizen_request ADD COLUMN IF NOT EXISTS attribute text;
CREATE UNIQUE INDEX IF NOT EXISTS citizen_request_open_attr_ux ON mdm.citizen_request (person_id, attribute, kind) WHERE status='PENDING' AND attribute IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS discrepancy_open_attr_ux ON mdm.discrepancy (person_id, attribute) WHERE status='ROUTED' AND kind='DISCREPANCY';
```

Back-fill `reason_code` and `risk_class` for open tasks. Policy gains `link_near_margin` (default 0.06) with its text in `POLICY_TEXT` and Telugu.

## 7. API

- Work queue endpoints from slice 1 accept `p-`, `r-` and `i-` keys; `GET /api/x/work/groups` includes the four new reasons.
- `POST /api/x/work/review/{id}/decide` `{decision: LINK|SEPARATE, person_id?, note}` calls `stewardship.decide`; refuses 409 on an already decided task, 403 for a read-only role.
- Batch preview and approve accept only batchable groups; for `LINK_LOW_SEPARATE` the action is SEPARATE.
- Citizen: `POST /api/citizen/reports` `{attribute, reported_value, reason}`, `GET /api/citizen/reports`; the `/req-{id}/answer` route accepts `choice` (`A`, `B`, `OTHER`) and `reported_value` for CONFIRM_DETAILS.
- Officer: `POST /api/x/citizen-requests/auto-confirm` (admin only, idempotent) scans for disagreements and raises requests, so the demo can trigger it without waiting for a feed.

## 8. Tests (Cursor writes these first)

Backend `mdm-service/tests/test_uc1.py`:
1. `test_every_review_reason_is_covered_and_a_new_kind_fails_the_coverage_test`
2. `test_a_single_candidate_just_below_auto_is_link_near_and_class_c`
3. `test_two_close_candidates_are_link_ambiguous_and_never_batchable`
4. `test_a_low_score_task_is_link_low_separate_and_batchable`
5. `test_link_near_cannot_be_batch_approved_in_this_release`
6. `test_batch_separate_goes_through_stewardship_decide_audit_and_rebuild_still_happen`
7. `test_a_decided_task_cannot_be_decided_again`
8. `test_source_conflict_is_fed_from_dq_issue_and_the_steward_can_only_request_a_correction`
9. `test_work_queue_keys_p_r_i_do_not_collide_and_the_old_numeric_route_still_works`
10. `test_link_decision_requires_a_reason_for_ambiguous_and_conflict`
11. `test_a_citizen_is_never_asked_about_a_doubtful_candidate`
12. `test_confirm_details_is_raised_once_per_person_and_attribute`
13. `test_a_citizen_dispute_raises_a_discrepancy_routed_to_the_owning_department_and_changes_nothing_in_the_master`
14. `test_a_citizen_confirm_creates_a_citizen_confirm_proposal_and_does_not_edit_the_person`
15. `test_citizen_report_is_limited_to_known_attributes_and_one_open_per_attribute`
16. `test_a_citizen_sees_only_their_own_reports_and_requests`
17. `test_the_citizen_is_notified_once_when_the_department_resolves_a_report`
18. `test_flow_board_identity_row_matches_the_filtered_queue_counts`
19. `test_a_volume_day_of_2100_births_and_700_deaths_lands_review_tasks_in_a_few_groups` (slow; uses the slice 1 seed tool; asserts at most about 10 groups and that no class C group is batchable)

Citizen portal (vitest): the Please confirm screen shows both values and departments, requires a typed value for Neither, and the receipt never says "updated"; the report form lists only allowed details; My reports shows the status trail; Telugu coverage passes.

Officer portal (vitest): link evidence drawer highlights differing fields and the keyboard legend is present; LINK_NEAR shows no Approve all; LINK_LOW_SEPARATE batch dialog behaves as in slice 1; menu and tour tests updated.

## 9. Setup and review

`bash scripts/mdm_setup.sh` applies 016; rebuild both portals. No new environment variables. Cursor stops when the tests pass and reports counts.

Claude checks: no write path other than `stewardship.decide` for links; a citizen can never see another person's record through these screens (probe with a father and son pair); a dispute really creates a discrepancy; the master record is unchanged by any citizen answer; counts agree between Flow board and queue; Telugu complete.

## 10. Decisions recorded (Sameer, 5 Nov 2026)

X1, X2 and X3 are accepted as written in section 3. They are now requirements, not options.
