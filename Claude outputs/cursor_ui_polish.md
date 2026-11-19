Task: UI polish across the officer portal and the citizen portal. Front end only. No backend changes, no git operations, no DG2.0, no port 8090. Synthetic data only. Telugu must keep working: every new or changed visible string needs its Telugu entry (te.js, te.decisions.js, te.uc4.js, te.uc5.js or the citizen te.json), or the coverage tests fail. Keep the existing colour palette (colours are not changing; the font is, see item 5). Do not change behaviour or logic, only layout, wording and styling.

Context: the owner is demoing these screens to senior government audiences. They must look sleek, calm and professional. Read the existing dxKit components first (officer-portal/src/screens/dx/dxKit.jsx, PageHeader, Drawer, Facts, Banner, DataTable) and reuse them; fix the shared component once rather than patching each screen.

ITEM 1: The side screens (drawers) that open from the scenario runner, /dx/scenarios (officer-portal/src/screens/dx/DxDemo.jsx and whatever it opens: the scenario detail, check lists, run results, the "Clear demo records" and "Run the group" panels)
 - Consistent spacing, headings, and alignment; no cramped or raw-looking blocks, no raw JSON or code-like dumps in the main reading flow (keep them behind a "Details" toggle if they are useful).
 - Read every English sentence on these screens. Fix grammar, capitalisation, full stops and commas; one idea per sentence; no run-on text; no developer wording ("payload", "rid", "ok: true"). Keep meaning exactly. Update the matching Telugu keys if a key text changes.
 - Pass/fail and info lines read as short plain sentences with a clear status label (text as well as colour).

ITEM 2: http://localhost:31173/mdm?tab=review (officer-portal/src/screens/mdm/ReviewQueue.jsx, review.css)
 - The "Review" button on each row looks plain. Make it a proper secondary-style button using the existing button classes (btn-primary small or btn-secondary small, same height as other table buttons, comfortable padding, hover and focus states). The accessible name must stay "Review" (and "Review <id>" where it is used), so Review.test.jsx keeps passing.

ITEM 3: The "Back to the queue" button in the review detail header, and every similar "Back to ..." button in the officer portal
 - grep for "Back to" and "Back" buttons across officer-portal/src (ReviewQueue.jsx, FormDefinitionGovernance.jsx, dx screens, mdm screens, Person360 and so on).
 - Replace each big back button with a small, quiet text link at the top right of the header box (for example "← Back to the queue", font-size about 0.85rem, link colour, no button chrome, underline on hover). Same wording, same behaviour, keyboard focusable.
 - Make the header banner of these detail pages shorter: less vertical padding, title and subtitle on fewer lines, the back link on the right in the same row. Do the same height reduction on the shared PageHeader if it is the cause, but check that no other page breaks.

ITEM 4: Review detail, the "Side by side" section (ReviewQueue.jsx, review.css)
 - Long values must wrap and never cause a horizontal scrollbar. Example: "IDENTITY REFERENCE SERVICE · IDR-CB9431FC5CC0" currently stretches a box. Use overflow-wrap:anywhere (or word-break: break-word), min-width:0 on grid and flex children, and let the columns share the width equally.
 - Check with very long names, addresses and identifiers, and at a narrow window width (about 1100 px). No horizontal scroll anywhere on the page.

ITEM 5: Font, both portals
 - The current font (Noto Sans from Google Fonts, loaded by link tags in both index.html files) is not liked. Use a calmer, more modern UI font: "Inter" for Latin text with "Noto Sans Telugu" kept for Telugu, and Noto Sans as the last fallback. Body text 15 to 16 px with a line height of about 1.5, slightly lighter weights for body (400) and 600 for headings and labels; keep tabular numbers for tables (font-variant-numeric: tabular-nums).
 - The demo machine may be offline. Do NOT rely on Google Fonts: self-host through the npm packages @fontsource-variable/inter (or @fontsource/inter) and @fontsource/noto-sans-telugu (weights 400, 600, 700), imported in each portal's main.jsx, and remove the Google Fonts link tags from both index.html files. Keep the Tabler icon link in citizen-portal/index.html as it is.
 - Set the family in one place per portal (the --font-body and --font-primary variables in index.css or App.css), not per component. Keep --font-mono as it is.
 - Check the Telugu text renders in the Telugu font and does not clip (Telugu needs more line height; use about 1.6 for Telugu pages).
 - If a package cannot be installed, say so and stop at that point; do not substitute another source.

ITEM 6: Citizen portal navigation (citizen-portal/src/components/Layout.jsx, App.jsx)
 - "My Approvals" (nav.approvals, /approvals) becomes the FIRST item in the menu, in the side menu and in the mobile or bottom menu if there is one.
 - After sign-in, and for the root path "/", the citizen lands on /approvals. Home stays available as the second menu item at its own path (add a /home route if it does not have one), so nothing is lost. Check every redirect that currently sends people to "/" (App.jsx has several Navigate to="/"): decide which should go to /approvals and which to /home, and say what you chose.
 - The pending approvals badge stays on the item. Notification links and the "Approval" deep links must still work.

TESTS: update or add vitest tests for the changed behaviour: Review button name; the back link position and name; the side-by-side wrapping classes are present; nav order and the landing redirect; Telugu coverage. Run both full suites (officer-portal and citizen-portal). The known CAF-widget citizen-portal failure is DG2.0 area; say if it is the only one.

REPORT by file: what changed, in plain words; the font packages added (name and version); both suite counts; how to rebuild (officer: bash officer-portal/build_portal.sh; citizen: docker build -t cs-citizen-portal:dev citizen-portal then kubectl -n citizen rollout restart deploy/citizen-portal) and which URLs to open to check: /dx/scenarios, /mdm?tab=review (open one task), and the citizen portal after sign-in. Mention anything you chose to leave alone and why.
