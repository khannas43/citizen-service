Addendum to the UC4 task (same rules: no git operations, no DG2.0, no port 8090, synthetic data, no family-registry-service changes, Telugu for any visible string).

Claude has finished the UC2 backend and citizen-portal work (see uc2-story-spec.md). Front-end and test items for you:

1. DxDemo.jsx: the "Live demo steps" block and the rule "group run skips catalogue type step" must apply to every use case, not only UC4. UC2 now has live steps 2.8 to 2.13, UC4 has 4.7 and 4.8. Same block title and explanation text for all.
2. Tests: update catalogue tests for the new ids 2.8 to 2.13, 4.7, 4.8 (counts change). DxDemo test: UC2 group run does not call steps 2.8 to 2.13.
3. Citizen portal: run the full vitest suite. Two new tests were added to citizen-portal/src/screens/__tests__/Approvals.test.jsx ("Never says shared..." and "A card whose time ran out reads Expired"); they have not been run. Fix the tests, not the code, unless the code is wrong, and tell me which.
4. Check ApprovalDetail.jsx receipt: a line with delivery RETRYING or DEAD_LETTER shows "Approved, not shared yet" (en and te), DELIVERED shows "Shared", no delivery field falls back to the old wording. mdm-service/app/citizen.py now adds "delivery" to each consent line.
5. Backend: run the scenario and catalogue tests; run test_citizen_household.py (age field) and report counts. Do not run against the live database.

Report by file with counts, as before.
