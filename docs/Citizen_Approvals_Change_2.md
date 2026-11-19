# Change 2: a below-threshold parent can never get unstuck (5 Nov 2026)

Follow-up to `Citizen_Approvals_Change_1.md`. Same rules: no git commit or push, no DG2.0, no real data, Telugu for every new string. Do this together with `Officer_Scale_Slice1_Review_1.md` (item 1 there uses the same reason code).

## What I found

Change 1 holds a parent whose match is below `MatchConfig.auto` (0.76) until an officer confirms. The way it confirms is "any APPROVED proposal that names the parent" (`exchange._named_parent_approved`). That never happens for an ordinary demo couple.

Probe on my copy (a normal demo couple from `tests.test_feed.couple()`, both parents found at 0.714, a ration card found):
- The engine raised only `ADD_TO_RATION_CARD` (class BIRTH_CLEAN) and `REQUEST_IDENTITY_REFERENCE`. There is no `REVIEW_PARENTS`, because both parents were found and a card exists.
- The principal parent sees no approval (correct under Change 1).
- The officer cannot approve `ADD_TO_RATION_CARD`: 409 "Waiting for consent from the parent". The consent gate needs the parent to answer first.

So the parent waits for the officer, and the officer waits for the parent. Nothing can move. Your report says the happy-path test fixtures "now raise parent scores so demo couples (~0.71) clear the 0.76 bar". That hides the deadlock in the tests: real demo couples score about 0.71, so in the running demo every ordinary birth is stuck.

## Required behaviour

1. **A below-threshold parent always gets an officer step that is not gated by consent.** In `events` (birth handling), when any named parent has a `person_id` with a score below `matching.Config.auto`, also raise a `REVIEW_PARENTS` proposal (system `mdm`, class C, reason `PARENT_REVIEW`), even when the other parent was found and a card exists. Its summary says which parent and the score, for example "Confirm the match for the father (score 0.71) before asking him to approve". Its detail carries the same `parents` structure and the candidates considered. Avoid a duplicate when the existing "could not identify" `REVIEW_PARENTS` is raised: one `REVIEW_PARENTS` per event, whose summary lists both the unmatched and the low-score parents.
2. **Approving it means "confirm the parents as named".** `events.decide_proposal` for `REVIEW_PARENTS` with APPROVE confirms every parent that has a `person_id` in the detail (below-threshold included), writes nothing else that needs consent, and calls `notify_parents_confirmed` once. A reason is required (policy list `rationale_required_kinds` gains `REVIEW_PARENTS`). Rejecting it keeps the parent out (Change 1 rule stays).
3. **Confirmation is recorded only by this step.** `_named_parent_approved` and `parent_match_held` must treat a parent as confirmed when a `REVIEW_PARENTS` for the event is APPROVED. An approved `ADD_TO_RATION_CARD` also still counts (a strong-match parent), but it cannot be the way out for a weak one, since it is gated.
4. **The ration card step stays class C until the parent is confirmed.** (Review 1, item 1: `BIRTH_PARENT_UNSURE`.) After the officer approves `REVIEW_PARENTS` and the parent consents, the `ADD_TO_RATION_CARD` proposal is approved by the normal path. Keep it in `BIRTH_PARENT_UNSURE` (class C, one by one) because its parent was below the threshold; do not move it back to the batchable group.
5. **The Consent screen** still says "Waiting for officer to confirm the parent"; add a link from that row to the open `REVIEW_PARENTS` item (opens the Work queue group `PARENT_REVIEW`).
6. **Fixtures.** Undo the test fixture change that raises parent scores to clear the threshold. Tests must use real demo couples at about 0.71. Where a test needs a confirmed parent, it must get there by approving `REVIEW_PARENTS`, as an officer would.

## Tests (add to `test_citizen_approvals.py`; keep Change 1's five)

1. `test_a_normal_demo_couple_at_about_071_raises_a_parent_review_and_is_not_stuck`: real couple, no fixture edits; asserts a `REVIEW_PARENTS` exists; the parent sees nothing; the officer approves it with a reason; the parent now sees the approval; exactly one notification; the parent answers; the officer can then approve `ADD_TO_RATION_CARD`.
2. `test_the_officer_can_confirm_one_weak_parent_while_the_other_is_strong`
3. `test_rejecting_the_parent_review_keeps_the_weak_parent_out_but_the_strong_parent_proceeds`
4. `test_only_one_parent_review_exists_per_event_when_a_parent_is_also_unmatched`
5. `test_a_confirmed_weak_parent_birth_stays_out_of_the_batchable_group`
6. `test_the_consent_screen_row_links_to_the_parent_review` (officer portal)

## Report back

Test counts, and the output of a run with an unmodified demo couple end to end. Claude will re-run the probe (`probe_c1`) and the Change 1 probes.
