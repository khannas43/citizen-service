# Change 1: a low-confidence parent match waits for an officer (5 Nov 2026)

Decision by Sameer: a parent whose match to the birth is below the automatic threshold must not see or answer the child's approval until an officer confirms the parent. (This replaces the "one-line setting" left open in Review 1, item 3.)

Same rules as before: no git commit or push, no DG2.0, no real data, nothing outside the files named here, Telugu for every new string.

## Behaviour
1. The threshold is the matching engine's automatic threshold (`matching.Config.auto`, 0.76). Read it from there; do not copy the number. Keep `MIN_MATCH_SCORE_TO_ANSWER` in `citizen.py` but set it from that value.
2. For a birth event, each named parent in the proposal detail has a score (`detail->'parents'->'mother'|'father'->'score'`).
   - Score at or above the threshold: behaves as today.
   - Score below the threshold: that person cannot see the approval in the list, cannot open it (404), cannot answer (403), and gets **no notification**, until the officer approves the parent review (`REVIEW_PARENTS` or the `ADD_TO_RATION_CARD` proposal that records the parents, whichever the engine uses to confirm them). After approval the person is treated as confirmed: they see it, can answer, and the notification is sent then (once).
   - If the officer rejects the match, the person never gets access (Review 1 item 3 rule stays).
3. The consent's own principal (`mdm.consent.person_id`) is also subject to this when the principal was chosen from a below-threshold match: the consent exists but is held, and nobody can answer it until the officer confirms.
4. Officer Consent screen: the Citizen column shows a new state, "Waiting for officer to confirm the parent", for these rows; the Remind button is disabled for them with the reason. Telugu for the new text in `te.decisions.js`.
5. Citizen Approvals list: no change in appearance; held items simply do not appear.

## Tests to add (backend, `test_citizen_approvals.py`)
- `test_a_below_threshold_parent_cannot_see_open_or_answer_until_the_officer_confirms`
- `test_no_notification_is_sent_for_a_held_parent_and_one_is_sent_on_confirmation`
- `test_an_above_threshold_parent_is_unaffected`
- `test_a_rejected_low_score_match_never_gets_access`
- `test_the_consent_screen_shows_waiting_for_officer_to_confirm_the_parent` (officer portal, with Telugu coverage)

Report back with the test counts. Claude will re-run its probes.
