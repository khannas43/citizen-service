# Change 3: a calibrated bar for parents named on a birth (5 Nov 2026)

Amends `Citizen_Approvals_Change_1.md`, `Citizen_Approvals_Change_2.md` and item 1 of `Officer_Scale_Slice1_Review_1.md`. Decision by Sameer (5 Nov): "separate bar, plus couple check". Same rules as before: no git commit or push, no DG2.0, no real data, Telugu for every new string. Apply Change 2 first, then this.

## Why

Changes 1 and 2 judge a parent named on a birth against `matching.Config.auto` (0.76). That bar was built for record-to-record matching where date of birth is known. A birth record carries only the parent's name and place, so the best score a name match can reach is about 0.714. Measured on my scratch database: of 796 test births, 792 had their weakest parent at exactly 0.714, 4 at about 0.63, and none at 0.76. With 0.76, every birth needs an officer parent review (about 210 a day at the demo volume), which defeats the batch design.

## The rule

Each parent named on a birth is **confident** when both hold:
1. The parent matched exactly one person and the score is at least `parent_confirm_score` (new policy value, default **0.70**).
2. When both parents are named and both matched, they are **linked as a couple**: a SPOUSE relationship between them, or a shared ration card (the engine already computes this as `linked` when it pairs candidates).

A parent is **not confident** when unmatched, below the bar, ambiguous, or when two matched parents are not linked as a couple (both are then held, because the pairing is the doubtful part). A single named parent skips the couple test.

Not confident → the rules of Changes 1 and 2 apply: the parent cannot see or answer until an officer approves the parent review; the ration card item is `BIRTH_PARENT_UNSURE` (class C). Confident → the parent sees the approval at once, no parent review is raised, and the ration card item is `BIRTH_CLEAN` or `BIRTH_LATE` (batchable).

## Changes

1. **Policy.** `exchange.DEFAULTS` gains `parent_confirm_score` (0.70, validated 0.5 to 0.95) and `parent_confirm_requires_couple` (true). Both appear in `POLICY_TEXT` (plain words, Telugu too) and are versioned with the usual impact preview, which for `parent_confirm_score` reports how many open birth items would change group.
2. **One flag, set once.** When the birth event is processed (`events`), compute and store `detail.parents.confident` (boolean), `detail.parents.couple_linked` and `detail.parents.bar` (the bar used). Everything downstream reads this flag: `workqueue.classify`, `citizen.py` visibility (`MIN_MATCH_SCORE_TO_ANSWER` goes away), `exchange.parent_match_held`, `_named_parent_on_event`, the Consent screen state, and the raising of `REVIEW_PARENTS`. For proposals created before this change, compute the flag on read from the stored scores using the current policy; do not rewrite history.
3. **Remove the use of `MatchConfig().auto`** for parent decisions in `workqueue`, `citizen` and `exchange`. It stays for record linking.
4. **Review 1 item 1** reads "every named parent is confident", not "score at or above `matching.Config.auto`".
5. **Reason wording.** The `REVIEW_PARENTS` summary states why the parent is held: "score 0.66 is below the bar 0.70", "the two parents are not linked as a couple", or "not found".
6. **Seed tool.** Seeded exceptions must include: a parent just below the bar, two matched parents who are not a couple, and an unmatched parent; the ordinary seeded births use real linked couples and so come out confident.

## Tests (add to `test_citizen_approvals.py` and `test_work_queue.py`)

1. `test_a_normal_demo_couple_at_071_is_confident_and_the_parent_sees_the_approval_at_once`: real couple from `tests.test_feed.couple()`, no fixture edits; no `REVIEW_PARENTS`; the ration card item is `BIRTH_CLEAN` and appears in a batchable group; the parent sees the approval and gets the notice.
2. `test_a_parent_below_the_bar_is_held_and_gets_a_parent_review`
3. `test_two_matched_parents_who_are_not_a_couple_are_both_held`
4. `test_a_single_named_parent_at_071_is_confident`
5. `test_raising_the_bar_to_080_changes_what_is_held_and_the_impact_preview_counts_it`
6. `test_lowering_parent_confirm_requires_couple_to_false_releases_the_non_couple_case`
7. `test_old_proposals_without_the_flag_are_judged_by_current_policy_on_read`
8. `test_the_review_parents_summary_says_why`
9. `test_a_seeded_tenth_scale_day_has_most_births_in_the_batchable_group_and_the_exceptions_in_parent_review` (slow)

## Report back

Test counts and, for an unmodified demo couple, the end-to-end result (confident, no review, parent sees it, batchable). Also report a seeded tenth-scale day: how many births land in `BIRTH_CLEAN`, `BIRTH_LATE`, `BIRTH_PARENT_UNSURE` and `PARENT_REVIEW`. Claude will re-run its probes.
