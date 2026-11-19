Task: clear the remaining non-UC4 test failures. Tests and test data only. Do not change app behaviour unless a test proves a real bug, and say so if it does. No git operations. Synthetic data only. Do not touch DG2.0 or port 8090. Backend tests run against citizen_db_test.

Work one failure at a time. After each, run only that test, then its whole file, and report the result by test name.

1. mdm-service/tests/test_feed.py
   - test_the_screens_connect_a_delivery_to_the_departments_answer_and_the_consent_page_finds_it_by_child_or_parent (StopIteration)
   - test_an_action_cannot_be_approved_over_a_department_rejection_until_a_person_decides_the_review (StopIteration)
   Cause: the test finds no usable couple or child. Pick couples with the existing helper (_couple_match_ok) and Latin-letter names (name ~ '^[A-Za-z]+( [A-Za-z]+)+$'); only about 16 usable couples exist, so do not assume more. Create the child and event inside the test if no suitable one exists.

2. mdm-service/tests/test_lineage.py::test_a_repeat_delivery_is_about_the_same_citizen_as_the_first
   Same kind of lookup problem. Fix the query the same way.

3. mdm-service/tests/test_quality.py::test_demo_history_has_incident_days_that_stand_out_from_the_allowed_share (assert 60 <= 8)
   The test depends on seeded history that clean-up changed. Make the test seed its own history inside the test and remove it afterwards. Do not read the shared demo data.

4. mdm-service/tests/test_citizen.py::test_citizen_sees_and_answers_only_their_own_requests (IndexError)
   The lookup returns an empty list. Create the citizen link and request inside the test.

5. mdm-service/tests/test_wave2.py
   - test_marriage_needs_both_consents_and_underage_goes_to_an_officer
   - test_marriage_follow_ups_wait_for_both_people_to_consent
   Both fail on a clean HEAD, so they are flaky or data dependent. Find the cause (couple choice, ages, leftover consents) and make each test pick or create its own couple, with both people 18 or over and an under-18 case built explicitly.

6. mdm-service/tests/test_api.py::test_dq_and_rules (timeout over 60s)
   Find what is slow (profile it). If it scans the whole table, limit it to the rows the test creates. If it is a real slow query in app code, tell me which one and do not change it.

7. citizen-portal NearbyOfficesDirections.test.jsx (4 tests)
   The expected text still says Taluka but the screen now says Mandal. Update the tests to the Mandal wording. Check te.json already has the Telugu for it.

8. mdm-service/tests/test_work_queue.py::test_a_seeded_tenth_scale_day_has_most_births_in_the_batchable_group_and_the_exceptions_in_parent_review
   Known failing before UC4. Report why it fails (seed day size, consent gate now holding births, or the new BIRTH_PARENT_MINOR group) and fix the test to match the current rules, not the other way round.

New in this round (check, do not rewrite):
- mdm-service/tests/test_separate.py is new and should pass.
- app/uc4_api.py: the invite route now passes require_notice=notify.enabled() and returns notifications_on. Add one test in test_uc4.py: with notifications off the invitation is recorded and the result has notifications_on false and notified 0; with notify.enabled patched to True and notify.send patched to return False, nobody is recorded as invited and a later call with send returning True invites them.

Finish by running, file by file, with -m "not slow": test_api, test_citizen, test_feed, test_lineage, test_quality, test_wave2, test_uc1, test_uc4, test_work_queue, test_dept_scope, test_separate, then the full officer portal and citizen portal suites. Report counts and any failing test by name, with the one-line cause.
