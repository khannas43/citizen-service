# Slice 1: Flow board, Work queue, batch approve

Spec for Cursor. 5 Nov 2026. Design and reasons: `docs/Officer_Scale_Design.md` (read it first). Claude reviews the result as before.
Repo: `Citizen-Services`, namespace `citizen`. Telugu required for every new officer-portal string.

## 1. Outcome

A department officer sees, on one screen, how many items each department has received, delivered, is waiting on citizens for, and needs a person for. They open the "needs a person" items grouped by reason, review a sample, and approve a whole group with one reason, instead of opening records one by one. Every record approved this way carries the batch id, reason and approver in the ledger.

Demo scale (decision D6): 210 births and 70 deaths a day, one tenth of real volume. Everything must still work, and be indexed, for 10 times that.

## 2. Decisions that apply (all answered by Sameer)

- D1 confirmed: "a person approves the rule, each use is recorded, exceptions go to a person." Slice 1 has no automatic rules, so every batch is approved by a person; nothing here contradicts the brief.
- D2: single approvals take effect immediately, as today. The hold-and-undo window applies to batches and automatic actions and arrives in slice 2, with the length set per rule (0 means immediate; proposed default 30 minutes; demo 1 minute). Not in slice 1.
- D3: sampling at 5% of automatic decisions: slice 3. Not in slice 1.
- D4: second approver is a Supervisor; for the demo an Admin may act as level 1 and level 2, but the level 1 approver is an officer and the level 2 approver a supervisor. Slice 1 has **no second approver**, so **class C groups cannot be batch approved in slice 1** (single and triage only). The supervisor role is added in slice 2.
- D5: department response time defaults to 30 days; an item unclaimed for 30 days is flagged "overdue" and shown first. The existing per-use response times in Policy (for example birth 7 calendar days) stay as overrides; only the default changes to 30 days. Flow board "on time" uses the response time that applies.
- D6: tenth scale, as above.

## 3. Out of scope

Standing rules and dry run, hold and undo, second approver and the supervisor role, circuit breaker, sampling and the Check queue, the in-portal volume simulator, registration-desk consent. Do not build any of them. Do not touch DG2.0, the citizen portal or the consent screens except where named.

## 4. Data changes

New `db/mdm/015_work_queue.sql` (idempotent, listed in `scripts/mdm_setup.sh` after 014, same ownership and `platform.scope_all()` tail as 014):

```sql
ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS reason_code text;
ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS risk_class  text;           -- 'B' | 'C' (A is consent, not a proposal)
ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS batch_id    bigint;
ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS claimed_by  text;
ALTER TABLE mdm.proposal ADD COLUMN IF NOT EXISTS claimed_at  timestamptz;

CREATE TABLE IF NOT EXISTS mdm.batch (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  reason_code text NOT NULL,
  rationale text NOT NULL,
  requested integer NOT NULL, approved integer NOT NULL DEFAULT 0, skipped integer NOT NULL DEFAULT 0,
  sample_ids jsonb NOT NULL DEFAULT '[]',
  skipped_detail jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_queue_ix ON mdm.proposal (status, reason_code, created_at) WHERE status='PROPOSED';
CREATE INDEX IF NOT EXISTS proposal_claim_ix ON mdm.proposal (claimed_by) WHERE status='PROPOSED';
CREATE INDEX IF NOT EXISTS proposal_batch_ix ON mdm.proposal (batch_id);
CREATE INDEX IF NOT EXISTS delivery_system_status_ix ON mdm.delivery (system, status, created_at);
```

Back-fill `reason_code` and `risk_class` for existing PROPOSED rows from the mapping below (a one-off UPDATE at the end of the file, or on first start of the module).

### 4.1 Reason codes (new module `mdm-service/app/workqueue.py`)

One function `classify(proposal_row) -> (reason_code, risk_class)`, called by `events._propose` for every new proposal and by the back-fill. The mapping is a dict in the module, with a test that every proposal kind in `events.py` is covered (a new kind without a reason code fails the test).

| Kind | Condition | reason_code | class | Group label (English) | Batchable in slice 1 |
|---|---|---|---|---|---|
| ADD_TO_RATION_CARD (UC2) | both parents matched at or above the match threshold, not late | BIRTH_CLEAN | B | Add child to ration card: parents matched | yes |
| ADD_TO_RATION_CARD (UC2) | late registration (over the late-event days) | BIRTH_LATE | B | Late birth registration | yes |
| ADD_TO_RATION_CARD (UC6) | marriage follow-up | MARRIAGE_RATION | B | Add spouse to ration card after marriage | yes |
| REVIEW_PARENTS | any | PARENT_REVIEW | C | Parent match needs a person | no |
| REQUEST_IDENTITY_REFERENCE | any | IDREF_REQUEST | B | Request an identity reference | yes |
| CONFIRM_DEATH | exactly one option and its score at or above the threshold | DEATH_SINGLE | B | Death: one clear match | yes |
| CONFIRM_DEATH | otherwise | DEATH_AMBIGUOUS | C | Death: more than one possible person | no |
| MARK_DECEASED_PDS | any | PDS_DECEASED | C | Mark deceased in civil supplies | no |
| STOP_PENSION | any | PENSION_STOP | C | Stop pension | no |
| CLOSE_SCHOLARSHIP | any | SCHOLARSHIP_CLOSE | C | Close scholarship | no |
| NOTIFY_SPOUSE, NOTIFY_NOMINEE | any | DEATH_NOTICE | B | Notify spouse or nominee | yes |
| NOTE_NEW_NAME | any | NAME_NOTE | B | Note a new name after marriage | yes |
| CONFIRM_MARRIAGE | any | MARRIAGE_CONFIRM | C | Marriage: confirm the two people | no |
| REFER_UNDERAGE | any | UNDERAGE_REFERRAL | C | Underage marriage referral | no |
| REVIEW_DEPARTMENT_REJECTION | any | DEPT_REJECTION | C | Department rejected a delivery | no |
| CITIZEN_CONFIRM | any | CITIZEN_CONFIRM | C | Citizen-confirmed correction | no |

The match threshold is `matching.Config.auto` (0.76); read it, do not copy it. Class and batchable come from this table now; slice 2 moves them into versioned policy. Any kind not in the table gets `OTHER`, class C, not batchable, and the test fails so someone adds it.

## 5. API (mdm-service)

New file `app/work_api.py` registered like the other routers; logic in `workqueue.py`. Reads use `auth.can_read`; claim and batch use `auth.can_write`. A department officer sees only their own system's items if the existing department scoping applies to approvals; follow whatever `exchange.approvals` does today for `system`, and add a test.

| Method and path | Purpose |
|---|---|
| `GET /api/x/flow-board` | One row per department plus a totals row. Fields: `system`, `name`, `received_24h`, `delivered`, `waiting_citizen`, `retrying`, `failed`, `needs_person`, `oldest_waiting_hours`, `on_time_pct`, `overdue`. Optional `system` filter |
| `GET /api/x/work/groups` | Groups of open items: `reason_code`, `label`, `risk_class`, `count`, `oldest_hours`, `systems`, `batchable`, `suggestion`, `claimed` (count claimed). Filters: `system`, `risk_class`, `claimed` (`me`, `none`, `any`), `q`. Sorted: overdue first, then oldest |
| `GET /api/x/work/items` | Items in one group: `reason`, plus `system`, `q`, `claimed`, `limit` (default 50, max 200), `after` (keyset on id, descending). Each item: the existing `approvals()` item shape plus `reason_code`, `risk_class`, `claimed_by`, `age_hours`, `overdue`, and `evidence` |
| `POST /api/x/work/claim` | `{ids: [...]}` or `{reason, system?}` claims unclaimed open items for the caller; returns the count; never steals an item claimed by someone else. `POST /api/x/work/unclaim` releases the caller's own |
| `POST /api/x/work/batch/preview` | `{reason, ids?}` (ids omitted means the whole group for the caller's filters). Returns `{token, count, by_system, sample: {random: [ids], lowest_confidence: [ids], outliers: [ids]}, items_in_sample: [...]}`; the token is a signed hash of the id list and expires in 15 minutes. Refuses a group that is not batchable (409 with the reason) |
| `POST /api/x/work/batch/approve` | `{token, rationale, sample_opened: [ids]}`. Checks: token valid and unexpired; `sample_opened` contains every id in the preview's sample; rationale at least `rationale_min_chars` (policy); group still batchable; each item still PROPOSED. Approves each item through the existing `events.decide_proposal` (never a shortcut), in one request, using a savepoint per item: an item that fails its own checks (for example the gate in `exchange.require_gate`) is **skipped and listed**, not allowed to fail the batch. Writes one `mdm.batch` row, sets `batch_id` on each approved proposal, and adds `batch_id` to the ledger and audit detail of each. Returns the receipt: `{batch_id, requested, approved, skipped, skipped_detail, actor, reason, rationale}` |
| `GET /api/x/work/batches/{id}` | The receipt again, with the approved ids |

`evidence` for an item: for parent and death and marriage reasons, the candidate people with score and the fields that differ (reuse `feed.proposal_info` and the proposal `options`); for the clean reasons, the one-line summary and the consent state.

Flow board definitions (write them in the docstring and in the screen's help text):
- received_24h: deliveries created in the last 24 hours for that department (kind EVENT).
- delivered: status DELIVERED in the last 24 hours. waiting_citizen: status PENDING_CONSENT (all time). retrying: RETRYING. failed: DEAD_LETTER.
- needs_person: open proposals (PROPOSED) for that system.
- oldest_waiting_hours: the oldest of the open proposals and PENDING_CONSENT deliveries.
- on_time_pct: of items decided or delivered in the last 7 days, the share inside the applicable response time (default 30 days, per-use overrides from Policy).
- overdue: open items older than the applicable response time, and open unclaimed items older than 30 days.

Performance target on the laptop with 20,000 deliveries and 5,000 proposals in the database: flow board under 2 seconds, groups under 1 second, a page of 50 items under 1 second, batch approve of 200 items under 10 seconds. Use the indexes above; no OFFSET paging for items.

## 6. Officer portal screens

Use the shared kit (`dxKit.jsx`, `dxKit.css`, classes `dxk-`), the `tr()` system and a Telugu entry for every string in `te.decisions.js` (the coverage test must pass).

1. **Control Tower becomes two tabs** (`navTree.js` HUBS): "Flow board" (new, default) and "Overview" (the current page, unchanged). Routes `/dx/control` (Flow board) and `/dx/control?tab=overview`. Update `navTree.test.js` and the tour menu names (`menuName`).
   - Flow board: the table in the design (section 3.2), a totals row, department filter for supervisors, auto-refresh every 30 s with a "last updated" time, and a red mark on overdue and failed. Every number is a link: `needs a person` goes to the Work queue filtered by that department; `waiting for the citizen`, `retrying` and `failed` go to Events filtered accordingly if that filter exists, otherwise to the existing Notices screen.
   - Show the definitions in a help drawer.
2. **Work queue** as the first tab of the Decisions hub, before Approvals (the single-record Approvals tab stays, unchanged). Routes `/dx/work` and `/dx/work/:reason`.
   - Group list as in the design (section 3.3) with columns: reason, count, oldest, class, claimed, suggestion. Filters: department, class, claimed by me, search.
   - Group page: table of items (keyset "Load more"), evidence beside each row (open a drawer), row checkboxes, "Select all in group", Assign to me and Release, and the batch action.
   - **Triage mode**: a button "Review one by one" opens the first unclaimed item in a drawer with Approve (reason if required), Reject, Skip and Next; keyboard shortcuts A, R, S, N, with a visible legend. Works for class C too (uses the existing single decision call and its rationale rule).
   - **Batch approve**: only on batchable groups for class B. Steps in one dialog: preview counts and by-department summary; sample table (10 random, 5 lowest-confidence, outliers) where the officer must open each sample row (the row marks "seen"); one reason box with the minimum length shown; the Approve button stays disabled until every sample row is opened and the reason is long enough; a confirm step stating the number and the group; then the receipt (batch id, approved, skipped with reasons, who, when) with a link to Events › Trail.
   - A class C group shows "Needs two people: arrives with the next release" next to a disabled Approve all, with the one-by-one route available.
3. **Trail and ledger**: show the batch id (a link to the receipt) in Events › Trail and the ledger row for a batched decision.
4. Telugu: all new strings; group labels come from the backend, so the backend sends a Telugu label too when `Accept-Language: te` (follow how `exchange` and the Telugu refusal catalogue in `app/i18n/te.json` already do this).
5. Accessibility and layout: keyboard-only use of the queue, the triage drawer and the batch dialog; focus trap and Esc in the dialog (as in the citizen approvals dialog); works at laptop width; status never by colour alone.

## 7. Volume seed tool

`mdm-service/tools/volume_seed.py` (standard library plus the existing client helpers): `--births 210 --deaths 70 --exception-rate 0.05 --base http://localhost:31173/mdm-service --token ...`. It posts synthetic birth and death events through `POST /api/events` with `DEMO-` registration numbers (so Clear demo records removes them), picks parents and deceased from existing people, and makes about the given share of events ambiguous (a parent name slightly different, two same-name candidates, a late registration). It prints how many items landed in each group. Tests import its generator function with small numbers (40 births, 12 deaths) so they run in seconds; one test marked `slow` runs the tenth-scale day (210 and 70).

## 8. Tests (Cursor writes these first)

Backend, `mdm-service/tests/test_work_queue.py`:
1. `test_every_proposal_kind_has_a_reason_code_and_class`
2. `test_a_clean_birth_is_class_b_and_a_low_score_parent_goes_to_parent_review_class_c`
3. `test_a_death_with_one_clear_match_is_batchable_and_with_two_is_not`
4. `test_groups_count_open_items_by_reason_and_sort_overdue_then_oldest`
5. `test_items_page_by_keyset_not_offset_and_never_repeat_or_skip`
6. `test_claim_does_not_steal_and_release_only_frees_my_own`
7. `test_preview_returns_the_lowest_confidence_rows_in_the_sample`
8. `test_batch_approve_refused_until_every_sample_row_is_opened`
9. `test_batch_approve_needs_the_minimum_reason_length`
10. `test_a_class_c_group_cannot_be_batch_approved`
11. `test_a_token_expires_and_a_changed_id_list_is_refused`
12. `test_batch_approve_uses_decide_proposal_so_audit_ledger_and_follow_ups_still_happen`
13. `test_an_item_that_fails_its_gate_is_skipped_and_listed_and_the_rest_are_approved`
14. `test_every_approved_item_carries_the_batch_id_in_proposal_ledger_and_audit`
15. `test_a_second_batch_cannot_re_approve_an_already_decided_item`
16. `test_flow_board_counts_match_the_filtered_queue_counts`
17. `test_flow_board_on_time_uses_the_response_time_that_applies`
18. `test_a_department_officer_sees_only_their_own_department` (if scoping applies; otherwise assert and document that it does not)
19. `test_a_volume_day_at_tenth_scale_lands_in_a_small_number_of_groups` (slow; 210 births, 70 deaths, 5% ambiguous: needs-a-person items at most about 30 and at most 10 groups)
20. `test_performance_flow_board_groups_items_and_a_200_item_batch_within_the_targets` (slow, with 20,000 deliveries seeded)

Officer portal (vitest): Flow board renders rows, totals and links; numbers link to the filtered queue; Work queue group list and group page; Select all and Assign to me; triage shortcuts; batch dialog keeps Approve disabled until the sample is opened and the reason is long enough; class C shows the two-people note; receipt shows skipped reasons; menu tests updated for the two Control Tower tabs and the new Decisions tab; `i18n/coverage.test.js` passes with Telugu for every new string; Dx tour `menuName` test updated.

## 9. Setup

`scripts/mdm_setup.sh` applies 015. No new environment variables. No image rebuilds, cluster changes or git operations from Cursor. Sameer's run afterwards: `bash scripts/mdm_setup.sh`, `bash officer-portal/build_portal.sh`, then `python3 mdm-service/tools/volume_seed.py ...` to fill the board.

## 10. Rules for Cursor

Same as the citizen approvals work: read this file and `docs/Officer_Scale_Design.md` first; follow the existing patterns; no new libraries; do not touch DG2.0, Keycloak realms, seed users or demo passwords; never write real identity numbers, real client names or the firm's name; no `git commit` or `git push`; every batch decision goes through `events.decide_proposal`; no debug output left in; stop and hand back for review when the tests pass.

## 11. What Claude checks in review

- Every test above exists and fails without the change; older suites still pass; the volume tests run on a clean database.
- Batch approve cannot skip the sample, the reason, the class rule or the gate; it cannot approve an item twice; the batch id reaches proposal, ledger and audit.
- No new write path bypasses `decide_proposal`.
- Flow board numbers and queue counts agree; definitions in the help match the SQL.
- Query plans use the new indexes (read `EXPLAIN` on the group and item queries at 20,000 rows).
- Department scoping, and read-only roles, behave as the tests claim; probes written by Claude try a wrong-department id and a stale token.
- Telugu complete, keyboard use, laptop width.
