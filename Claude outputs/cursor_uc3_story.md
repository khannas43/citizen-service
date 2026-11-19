Task: tests and checks for the UC3 story. Same rules as before: no git operations, no DG2.0, no port 8090, synthetic data only, no family-registry-service changes, Telugu for any visible string, tests against citizen_db_test only.

Claude has already built and tested the UC3 backend and the citizen notice on a scratch database. Read first: mdm-service/app/demo_uc3_story.py (new), the hook at the end of events.decide_proposal, citizen._shape_death_notice and _death_notices, demo.py (uc3_plant, s_3_6 to s_3_10, reset line n["uc3_story"]), demo_catalogue.py (3.6 to 3.10, type step). Story: uc3-story-spec.md.

1. Backend tests
 - Add mdm-service/tests/test_uc3_story.py: plant (people exist, Sarojini linked to XXXX-XXXX-2701); run 3.6 live step; confirm the death via events.decide_proposal (CONFIRM_DEATH, with person_id); assert four follow-up proposals (STOP_PENSION, MARK_DECEASED_PDS, FLAG_LAND_SUCCESSION, NOTIFY_SPOUSE) all PROPOSED; approve STOP_PENSION (a reason is required); approve NOTIFY_SPOUSE; assert citizen.list_approvals(cur, "XXXX-XXXX-2701") contains one item kind DEATH_NOTICE, can_answer False, stage STOP_APPROVED, deceased_name "Ramaiah Goud"; before approving NOTIFY_SPOUSE the list has no such item; a second NOTIFY_SPOUSE approval does not create a second notice; clear leaves no source_rid starting DEMO-UC3- and no person named Ramaiah Goud, Sarojini Goud, Narsimha Chary. If family_registry or scheme_engine are missing in the test database, assert plant still succeeds and returns notes; if you can create them in the fixture, also assert Ramaiah's beneficiary row is REMOVED with a removal_reason after the stop is approved, and Sarojini gets an IDENTIFIED row after the contact is approved.
 - Update the catalogue tests (test_wave4.py): new ids 3.6 to 3.10 with type step; UC3 count; total count.
 - Run test_uc3_story.py, test_wave4.py, test_uc4.py, test_uc4_story.py and the scenario/catalogue tests; report counts. The earlier 3.1 to 3.5 scenarios now start by planting the cast (3.1), so also check that 3.2 to 3.5 still pass when run in order and when 3.6 to 3.10 have already run.

2. Citizen portal
 - Approvals.jsx and ApprovalDetail.jsx now handle kind DEATH_NOTICE (row label, detail text by item.stage CONTACTED or STOP_APPROVED, deceased_name, read-only). Add vitest tests: the list shows the notice row with "Notice" status and no "answer by" line; the detail page shows the STOP_APPROVED text with the name; with no deceased_name the fallback "your family member" is used; Telugu renders. Run the full citizen suite; the earlier unrelated failure in published-form/renderer-a11y can be left.
 - Login.jsx and LandingPage.jsx have a new demo user, Sarojini Goud, XXXX-XXXX-2701. Update any test that counts demo users or checks the demo hint text. The demoHint line in en.json and te.json now ends with 2701.

3. Officer portal
 - Nothing new is expected: the scenario page already shows type "step" items in the live-steps block for every use case. Add one Dx4.test.jsx assertion that the UC3 group run skips 3.6 to 3.10. Run the full officer suite and report counts (the two form-builder failures can be left).

REPORT by file with all suite counts, anything you chose to leave alone and why, and the URLs to check: /dx/scenarios, /beneficiaries, /families, Decisions > Approvals, and the citizen portal as XXXX-XXXX-2701.
