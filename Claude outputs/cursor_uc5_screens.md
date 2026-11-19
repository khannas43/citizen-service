Task: UC5 screens only. The UC5 backend is ALREADY BUILT and committed by Claude. Do not rewrite it. No git operations. Synthetic data only. Do not touch DG2.0 or port 8090. Telugu for every new string (te.js, te.decisions.js, te.uc4.js or a new te.uc5.js registered in te.js, and citizen-portal te.json), or the coverage tests fail. No new colours or fonts.

Read first: claude/uc5-household-housing-spec.md in the project (sections 4.1, 4.3, 4.5) and mdm-service/app/uc5.py (the docstring and function names).

Already done (do not redo):
 - mdm-service/app/uc5.py, uc5_api.py, db/mdm/018_uc5.sql, tools/demo_uc5_cases.py, tests/test_uc5.py (22 tests pass).
 - Hooks in exchange.py (household income question, duplicate by household, minor cannot be the applicant), events.py, workqueue.py (four new reasons: DUPLICATE_BENEFIT, CARD_DEAD_ACTIVE, HOUSEHOLD_CONFLICT, NO_HOUSEHOLD), feed.py, citizen.py (HOUSEHOLD_BENEFIT is now a single-consent card, CARD_PURPOSES).
 - Route: GET /api/x/housing/outcomes?days= returns answered, no_consent, denied_policy, expired, conflict, no_record, duplicates_found, total, open_items{reason: n}, ledger_filters. Counts only.
 - Do not edit app/uc5.py, exchange.py, workqueue.py, feed.py, events.py. If you find a backend defect, stop and report it with a failing test; do not patch it.

PART 1: Citizen portal housing consent card (ApprovalDetail.jsx and the approvals list)
 - The card is currently scholarship-specific (approvals.uc4.* keys). Make the single-consent card purpose-driven so HOUSEHOLD_BENEFIT shows its own wording, without breaking the scholarship card or its tests.
 - Wording (English and Telugu): who is asking (Housing department), what it checks (household income band, residence, whether the household already has housing assistance, electricity link, land holding), that the whole household is looked at but only the applicant answers, that no income figure or other member's detail is shared, that it lasts 90 days, and that the applicant can refuse or withdraw. Plain language, no jargon.
 - Only an adult applicant answers. A minor never sees an answerable card.
 - Reuse the existing answer route and elements; do not invent new ones. requests.purposeName.HOUSEHOLD_BENEFIT already exists in en.json and te.json.
 - Tests: card renders with housing wording, grant and refuse work, scholarship card unchanged.

PART 2: Officer Flow board: a "Housing" row
 - New DxHousing.jsx (and te.uc5.js, registered in te.js), rendered in DxFlowBoard.jsx the way the UC4 row is. Use GET /api/x/housing/outcomes.
 - Show: checks in the last N days (7 / 30 selector), by outcome (answered, no consent, expired, conflict, no record, denied by policy), duplicates found, and the four open-item counts by reason, each linking to /dx/work/<REASON> (and the ledger links from ledger_filters to the audit/ledger screen as UC4 does).
 - Use dxKit components only. Empty and error states with retry.

PART 3: Households screen (officer)
 - The Households tab on /dx/checks already uses the DataTable standard from the two-pages task. Do not redo it. Only add a "Housing" chip per row (open item reason if any) if it fits cleanly; skip it if it needs a new backend route and say so.

PART 4: Work queue screens
 - Check that the four new reasons render properly on /dx/work and /dx/work/<REASON> (label, one-line "what to do", class chip, Telugu). Batch approve is allowed only for NO_HOUSEHOLD. DUPLICATE_BENEFIT and HOUSEHOLD_CONFLICT need a reason in the box. Fix only front-end display problems.
 - Do not touch DxWork.jsx logic beyond what a display fix needs, and tell me if you did.

TESTS: update or add officer-portal tests for the Housing row and the work-queue labels; citizen-portal tests for the card. Full suites for both portals must pass (the known CAF-widget citizen-portal failure is DG2.0 area; say if it is the only one).

REPORT by file: officer-portal suite counts, citizen-portal suite counts, files touched, and how to rebuild (officer: bash officer-portal/build_portal.sh; citizen: the existing citizen portal build script) and which three URLs to open to check: http://localhost:31173/dx/flow, http://localhost:31173/dx/work, and the citizen approvals page after running the demo script on the pod.
