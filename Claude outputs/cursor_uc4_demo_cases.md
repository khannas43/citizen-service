Task: a demo-case script for UC4, and one daily-job check. No git operations. Synthetic data only. Do not touch DG2.0 or port 8090. Telugu for any new officer-visible string. Report results by test name.

A. mdm-service/tools/demo_uc4_cases.py (new, in the style of tools/grant_demo_consents.py: dry-run by default, --apply to write, --remove to delete exactly what it created)
Plant four synthetic students, tagged with source_rid prefix DEMO-UC4- so they can be found and removed, each aged 17 with a linked citizen sign-in reference, each with a scholarship consent already GRANTED by a recorded parent (so the check is allowed):
  1. expired income certificate (valid_until in the past)
  2. two income certificates that disagree (different amounts, both active)
  3. an applicant from another state (district starting "Other State", no certificate)
  4. a clean student with one valid certificate (the control)
Then, with --apply, run the scholarship INCOME_AT_MOST check once for each through the normal exchange verify path (not by writing proposals directly), so the three items are raised by the real hook. Print, per student, the outcome and the proposal id and reason code raised (CERT_EXPIRED, CERT_CONFLICT, OTHER_STATE; none for the control). Running --apply twice must raise nothing new (one open item per person and kind). --remove withdraws their proposals and deletes their source records, consents and links.
Use only reference ids and states in the output: never print an income value.

B. Daily job idempotency, mdm-service/tests/test_uc4.py
On the live demo the second "Run daily checks now" shows "Handed over at 18: 1 people" again, the same as the first run. The count looks inflated: _handover_catch_up does persons += 1 for every person it visits even when handover_at_majority ended nothing. Find out why the same person is picked up on both runs (check which consent rows match the first query: given_by_person_id set and different from person_id, status GRANTED or PENDING) and whether the new request raised by the handover itself matches the query again. Then:
  - make "persons" count only people for whom at least one consent was ended or one request raised;
  - make sure a second run on the same day finds nothing (persons 0, ended 0, asked 0);
  - add a test that runs the daily job twice on a person who turned 18 with a guardian's consent and asserts the second run's handover is all zeros and that no second notice is sent.
If the cause is something other than the counting, say what it is and fix it.

Finish with: the four DEMO-UC4 results printed from a dry run and from --apply on the cluster pod (give me the exact kubectl exec command to run), and the file-by-file test counts for test_uc4, test_uc1, test_work_queue, test_dept_scope, test_separate.
