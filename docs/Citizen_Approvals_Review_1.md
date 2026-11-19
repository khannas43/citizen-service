# Review 1: citizen approvals (5 Nov 2026)

Reviewer: Claude. Scope: the 24 files changed after the spec was saved. Method: read the code, ran Cursor's backend tests on a separate database, and wrote probes for the security rules in spec section 11.

Fix items 1 to 5 before the demo. Items 6 to 8 can follow. After fixing, add the tests named below, run the suites, and hand back. Same rules as the spec: no git commit or push, no DG2.0, no real data.

## Must fix

### 1. A household member can see and answer a child's approval (HIGH)
- Cause: `exchange._guardian_ok` accepts `SAME_HOUSEHOLD` as well as `PARENT_OF`. The new D3 path (`citizen._can_see_consent`, `citizen._consent_rows_for_me`, and the `answerer_id` branch of `exchange.respond`) uses it for the child. The spec said a recorded parent.
- Probe result: an adult linked to the child only as `SAME_HOUSEHOLD` saw the approval and answered GRANT with HTTP 200. A minor household member also saw it.
- Fix:
  - For the citizen approval path, allow only (a) the consent's own `person_id`, (b) a person named as mother or father on the birth proposal (see item 3), (c) a person with `PARENT_OF` to the child. Not `SAME_HOUSEHOLD`.
  - In `respond`, when `answerer_id` differs from `person_id`, require the answerer to be an adult under policy `adult_age`.
  - Leave the old `given_by` (assisted, officer-present) behaviour as it is.
- Tests to add: `test_an_adult_who_is_only_in_the_same_household_cannot_see_or_answer`, `test_a_minor_cannot_see_or_answer`, `test_a_parent_of_relationship_can_answer`.

### 2. The old consent route skips the declaration (HIGH)
- Cause: `POST /api/citizen/consents/{cid}/respond` (`citizen.answer`) still grants any consent the caller owns with no declaration. Probe: GRANT returned 200 with `answered_as` and `declaration_version` empty, on a child's consent.
- Fix: in `citizen.answer`, if the consent has `event_id` or `subject_person_id`, refuse with 409 and the message "Answer this on the Approvals screen." Keep the route for consents that are about the citizen themselves. Withdraw stays as it is.
- Test: `test_the_old_respond_route_refuses_a_childs_consent`.

### 3. A parent match that a steward may reject can still answer (MEDIUM)
- Cause: `_named_parent_on_event` and the visibility SQL read any proposal with `detail ? 'parents'`, whatever its status. In my test database the matcher named a parent at score 0.714 (a same-name person).
- Fix: only proposals with status `PROPOSED` or `APPROVED` count; `REJECTED` and `WITHDRAWN` do not. Add a comment that a PROPOSED match is trusted only because the consent was already addressed to the matched mother or father.
- Decision for Sameer (not for Cursor): should a match below a score threshold wait for the steward before the parent sees the child's details? Leave a constant `MIN_MATCH_SCORE_TO_ANSWER = 0.0` in `citizen.py` so it is one line to change.
- Test: `test_a_rejected_parent_match_cannot_see_or_answer`.

### 4. A disputed correction stays live for the steward (MEDIUM)
- Cause: `citizen.raise_request` creates the steward proposal immediately (status PROPOSED), before the citizen answers. Probe: after DISPUTE the proposal was still PROPOSED. An officer could approve a correction the citizen said was wrong, or approve before the citizen answered. Spec D4 says confirming creates or advances the proposal.
- Fix: do not create the proposal at raise time for `CONFIRM_DETAILS`. On CONFIRM create it (kind `CITIZEN_CONFIRM`). On DISPUTE create nothing, or if the officer supplied a `proposal_id`, set it to `WITHDRAWN` with the citizen's note. The citizen answer must never edit `mdm.person`.
- Tests: `test_no_proposal_exists_until_the_citizen_confirms`, `test_a_dispute_creates_no_proposal_and_withdraws_a_supplied_one`, keep the existing no-edit assertion.

### 5. The receipt says "Approved" after a decline (MEDIUM)
- Cause: `ApprovalDetail.jsx` `Receipt` always shows `approvals.receiptTitle` ("Approved for {child}"). With Decline all, or every department toggled off, the lines say Declined under an "Approved" heading. Also "Approve selected" is enabled with zero departments selected (`canApprove` ignores `selected.length`).
- Fix: choose the title from the lines. All GRANTED: "Approved for {child}". Mixed: "Your answer for {child}". All REFUSED: "Declined for {child}". Disable "Approve selected" when nothing is selected.
- New keys in `en.json` and `te.json`: `receiptMixed`, `receiptDeclined`. Telugu is required.
- Tests: decline all shows the declined title; all toggled off disables Approve.

## Should fix

### 6. English left in the Telugu view
- Child's sex shows `F` or `M` raw (`detail.child.sex`). Map to Female and Male, with Telugu.
- Dates use `en-GB` fixed (`fmt`, `fmtDate`, in `ApprovalDetail.jsx` and `Approvals.jsx`). Use the active language (`te-IN` for Telugu) so month names are Telugu.
- `RequestForm` shows the raw `detail` keys as labels and `String(v)` for objects. Add a label map for the keys the officer can send (start with address, name, date of birth, relationship) with Telugu, and render a nested object as readable lines, never `[object Object]`.
- Notification title and message are English only (`exchange.birth_consents`, `exchange.remind`). Send both English and Telugu in the message text (Telugu first), or add a language field to the notification later. Pick the first and note it.

### 7. Two tests depend on the data
- `test_the_other_linked_parent_sees_it_and_can_answer` and `test_once_one_parent_answers_the_other_gets_409_with_the_name` fail on a database with duplicate parent names, because the test assumes the matched mother is `couple()["mid"]`. Derive the two parents from the birth proposal (`detail->'parents'`) instead. This is a test fix, not a code bug.

### 8. Dialog accessibility
- The confirm dialog moves focus in and closes on Esc, but Tab can leave it. Trap focus inside while open and return focus to "Approve selected" on close.

## What I checked and found good
- The new tables and columns are idempotent and follow the ownership pattern.
- Every citizen route uses the sign-in token; no route takes a person id.
- All-or-nothing validation of the answer lines before anything is written; the answer goes through `exchange.respond`, so audit, ledger and delivery release are unchanged.
- First answer wins, and a second parent gets 409 with the name. Expiry is handled.
- Notifications are off by default, and a failure cannot block a consent or a reminder. The URL path matches the notifications service context path.
- Officer Consent tab: Citizen column, filter and Remind with the limit are present; Telugu entries added.
- Telugu: all 57 `approvals.*` keys exist, none identical to English. Wording still needs the native-speaker review.
- Test results on my side: `test_citizen_approvals.py` 16 of 18 passed (the two data-dependent ones above), `test_api.py` and `test_citizen.py` 10 of 10 passed. I did not run the citizen portal or officer portal tests; run `npm run test:run` in both and report.

## Not yet done (from the spec)
- Screen inventory workbook and build-plan doc not updated. I will do these after the fixes.
- Hindi and Gujarati fall back to English for Approvals (D7, accepted).
