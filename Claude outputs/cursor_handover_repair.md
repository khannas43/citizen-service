Task: the first live "Run daily checks now" ended 40 birth consents it should not have touched. Fix is partly in already; please test it, repair the data, and report. No git operations. Synthetic data only. Do not touch DG2.0 or port 8090.

What happened (live, job_run id 1, 2026-11-07 05:41 UTC): handover {"asked": 40, "ended": 40, "persons": 1}. The consents ended with reason ATTAINED_MAJORITY are for person 18000 and about newborn subjects (for example consent 4001 to 4004 about subject 23692 given by 20961; 3947 and 3948 about subject 23678 given by 17999). Person 18000 is an adult PARENT who was the consent principal; another parent answered. The handover query matched on "given_by_person_id differs from person_id" and treated every such consent as a guardian's consent about the principal. It is not: the subject is a child. A parent's consent about a child must never end because the parent is an adult.

Already changed by me (please review and keep): in app/exchange.py handover_at_majority and app/uc4.py _handover_catch_up first query, added  AND (subject_person_id IS NULL OR subject_person_id = person_id).  Only consents about the person themselves are ended at 18. The second block in _handover_catch_up (scholarship consent addressed to a parent about a student) is correct and stays.

1. Tests (test_uc4.py or test_exchange.py, wherever handover tests live)
   - a parent aged 18 or over who is the principal of birth consents about a newborn, answered by the other parent: the daily job ends nothing, asks nothing, persons 0.
   - a person who turned 18 with a guardian's consent about themselves (subject null or themselves): still ended and asked, once.
   - the explicit handover call (exchange.handover_at_majority) behaves the same on both.
   Check the existing handover tests still pass, and if one of them built its data in a way that relied on the old wrong query, say so and fix the data in the test, not the rule.

2. Repair the live data, as a script mdm-service/tools/repair_wrong_handover.py (dry run by default, --apply to write), run inside the pod like the other tools.
   Find every consent with ended_reason='ATTAINED_MAJORITY' whose subject_person_id is not null and different from person_id (these are the wrongly ended ones). For each:
   - put it back to the status it had before (use the consent log: GRANTED if it was answered with a grant, PENDING if it was never answered; if the log cannot tell, say so and use responded_at: not null means GRANTED);
   - clear ended_reason;
   - find the consent that handover raised for the same person, purpose, subject and event (created at the same time or later, status PENDING, given_by_person_id null, no responded_at) and withdraw or delete it so there is one consent again, not two;
   - un-block deliveries that handover blocked with BLOCKED_REVOKED for this consent, back to WAITING (or the state the consent log implies), only for deliveries blocked by this handover run;
   - write an audit row CONSENT_HANDOVER_REPAIRED per consent.
   Print counts: found, restored to GRANTED, restored to PENDING, duplicate requests removed, deliveries released. Print no income or personal values.
   Also correct mdm.job_run id 1 is left as it is (it is history), but add the repair to the audit.

3. Then run the daily job again from the officer portal's button (I will do that) and confirm: handover persons 0 on the second run.

Report: the diagnostic (how many consents, which purposes, which subjects' ages), the dry-run output, the --apply output from the cluster pod with the exact kubectl exec command, and file-by-file counts for test_uc4, test_exchange, test_uc1, test_work_queue, test_dept_scope, test_separate, test_feed.
