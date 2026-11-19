Task: front-end and test work for the UC4 story. No git operations, no DG2.0, no port 8090, synthetic data only, no family-registry-service code changes. Telugu for every new or changed visible string (te.js, te.uc4.js and the citizen te.json), or the coverage tests fail. Read mdm-service/app/demo_uc4_story.py first (new, written by Claude, backend already done and tested on a scratch database).

Context: one story, one cohort. Scenario page items 4.7 and 4.8 are new "live steps" (catalogue type "step"). The scheme "Higher Education Scholarship (turning 18)" is a new row in the scheme engine, seeded by demo_uc4_story.plant. Beneficiary rows for the cohort carry a plain note in eligibility_reason (and removal_reason after a withdrawal). The story path is in uc4-story-spec.md.

ITEM 1: Scenario page (officer-portal/src/screens/dx/DxDemo.jsx)
 - The catalogue now returns items with type "step" (4.7, 4.8). "Run the UC4 group" must run only items whose type is not "step". Show the steps in a separate, clearly labelled block under the group buttons, "Live demo steps (run these one at a time during the demo)", each with its own Run button and last result, using the existing result display. Do not run them from "Run all".
 - Plain English and Telugu for the block title and a one-line explanation: "These steps change the demo on purpose, for example making the student turn 18. Run each one when the story reaches it."

ITEM 2: Scheme Simulator (officer-portal/src/screens/SchemeSimulator.jsx)
 - The new scheme appears in the Base scheme list by itself. Check that choosing it pre-fills min age 17, max age 18, income ceiling 250000 and the categories, and that running it lists the cohort when the district filter is Medak. Do not change simulation logic.
 - Add one small link under the result, shown only when the selected base scheme name is "Higher Education Scholarship (turning 18)": "Check these students against the sources" linking to /dx/checks (tab Turning 18 if a query parameter for the tab exists, otherwise just the route). English and Telugu.

ITEM 3: Beneficiaries (officer-portal/src/screens/BeneficiaryDashboard.jsx) and Families (FamilyRegistry.jsx)
 - The note column already shows the beneficiary's eligibility reason; make sure a REMOVED row shows the removal reason (the withdrawal text) in the same column, and that the status badge for REMOVED, CONFIRMED and IDENTIFIED is unchanged.
 - Families, Citizen 360, enrolled schemes: show the scheme name, the status and the note (eligibility_reason or removal_reason) for each enrolment, in the same style as the other fields. Reuse the fetch that already loads each scheme's beneficiaries (line near 614); do not add a new endpoint.
 - Do not display any income figure that is not already on the page.

ITEM 4: Control Tower daily result
 - After "Run daily checks now" the result must show the handover count in plain words, for example "1 person turned 18: their parent's permission ended and they were asked for their own." Zero case: "Nobody has turned 18 since the last check." Keep existing labels where they already read well.

ITEM 5: Citizen portal
 - Nothing new is needed for Lakshmi's cards (they are the existing single-consent cards). Check that a parent with two children sees two cards with the child's name on each (item.student.name) and that an ENDED card reads clearly (status text "Ended" in English and Telugu). Fix only if it does not.

TESTS
 - Backend: update the catalogue tests for the two new scenario ids; add mdm-service/tests/test_uc4_story.py: plant, applies, a parent grants, turn_kavya_18, handover, clear leaves no DEMO-UC4- rows. The test database has no family_registry or scheme_engine schema, so assert that plant still succeeds and returns notes about the registry rows it could not write (the registry writes are best effort); if the schemas can be created in the test fixture, also assert the beneficiary note after each step: no permission asked yet, waiting for the parent, permission given, waiting for the student, and Removed after a withdrawal.
 - Run test_uc4.py and the scenario/catalogue tests; report counts. Do not run against the live database.
 - Officer portal vitest: DxDemo (live steps block, group run skips them), SchemeSimulator link, Beneficiaries removed note, FamilyRegistry enrolment note, Control Tower handover text, Telugu coverage. Citizen portal: the My Applications menu rename is already done in Layout and Layout.test.jsx; run the full suites.
 - Also update the earlier open items if cheap: test_citizen_household.py and MyFamily.test.jsx for the age field; confirm whether the two form-builder route-navigation failures exist without these changes.

REPORT by file, with both suite counts, what you chose to leave alone and why, and the URLs to check: /dx/scenarios, /scheme-simulator, /beneficiaries, /families, Control Tower, and the citizen portal as 2602 and 2601.
