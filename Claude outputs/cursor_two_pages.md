Task: give two officer pages the same professional table treatment as the rest of the Data Exchange hub, and find one disappearing-item problem. Officer portal (and mdm-service routes if a page needs server sorting or search). No git operations. Telugu for every new string (te.js, te.decisions.js or te.uc4.js), or i18n/coverage.test.js fails. No new colours or fonts: use dxKit.css and mdm.css. Do not touch DG2.0 or port 8090.

Use the table standard that already exists in screens/dx/dxKit.jsx and is tested in TableStandard.test.jsx: DataTable (client and server mode), useServerTable, SearchBox, FilterSelect, Segmented, Toolbar (with Clear), EmptyState, Banner, Card, PageHeader, Stats. Look at DxAudit.jsx, DxApprovals.jsx and DxConsent.jsx for how they are used and copy that look. Do not hand-build tables.

PAGE 1: /dx/checks (DxChecks.jsx, Worklists.jsx, tabs Turning 18 and Households)

Turning 18
 - Top strip of Stats: Turning 18 in the next 30 days, Already 18, Not on the scholarship portal, Invited, Income certificate expired or none.
 - Toolbar: search box (name, ministry id, district), filters: District, Identity reference (Yes / No), Income certificate (Valid / Expired / None on file), Scholarship portal (On / Not there), Consent (none, parent asked, parent allowed, handover pending, student allowed, refused, ended), Invited (Yes / No), "Turns 18" date range (DateRange). A Clear button.
 - DataTable in server mode: sortable on Person, Born, Turns 18, Income certificate, Consent, Scholarship portal; page size choice (10, 25, 50, 100) and Previous/Next with "1-25 of N".
 - Server side: GET /api/worklists/turning-18 takes q, district, identity, income_state, on_portal, consent, invited, turns_from, turns_to, sort, dir, limit, offset, and returns total and the same items. Sorting and filtering by consent_status needs the status worked out in SQL or on a bounded set: if that is not practical for a column, say so and sort only the columns that are. The Stats come from a small summary route or from the same response (counts over the whole filtered set, not the page).
 - Keep: the "Invite to apply" action with the preview and confirmation, the greyed tick boxes for people already invited or already on the portal, "choose everyone on this page" (page only, say so). Add a "Select all that match the filter" link that sends the filter to the invite route (it already accepts a filter) after the preview.
 - Row: person name opens master data, small chips for state (Valid / Expired / None on file are text plus colour, never colour alone), the next step as one short line, not a stack of lines.
 - Empty and error states with EmptyState and a retry.

Households
 - Same toolbar pattern (search, filter "Same person: yes/no", filter by the kind of overlap) and DataTable with sorting and paging. Keep the data as it is.

PAGE 2: /dx/work (DxWork.jsx), both the group list and the group detail (/dx/work/CERT_EXPIRED and the others)
 - Group list: Stats strip (Open items, Person decides (class C), Batchable (class B), Oldest waiting), toolbar with search (reason or person), Department, Class, Claimed (Anyone / Mine / Unclaimed) and a Clear button. DataTable with sortable Reason, Count, Oldest, Class, Claimed, Batch, with page size choice. Each row keeps its one-line "what to do".
 - Group detail: breadcrumb "Back to groups", header with the reason, class and a one-line meaning, Stats (items in group, claimed by me, oldest). Toolbar: search (person, summary), Department, Claimed, age filter (older than 1 day, 3 days, 7 days). DataTable, server mode if the route supports it, sortable on Action, Person, Department, Claimed, Age, with row tick boxes and "Select all in group". Keep "Review one by one", "Approve all in group", the sample-rows rule and the reason box exactly as they behave now. Rows get an Evidence button as now.
 - Server side: the group items route takes q, department, claimed, min_age_hours, sort, dir, limit, offset and returns total. Only add what is missing.

THE DISAPPEARING ITEM (reproduce and fix)
 Sameer opened /dx/work/CERT_EXPIRED, ticked the one item (proposal 4753, Demo Ucfour), started "Approve all in group", opened the sample row with "Open", closed it, and later the item was no longer visible in the group. The proposal is still PROPOSED in the database (not approved, not rejected). Find out why it vanishes: check whether Review one by one claims the item (so the "Anyone" or "Unclaimed" filter then hides it), whether opening the sample row marks it as reviewed in a way that hides it, or whether the list is filtered by something left over in the page state or the URL. Fix it so an item that is still waiting is always listed in its group, a claimed item shows who claimed it, and there is a way to release a claim. Add a test for it. Report what the cause was.

TESTS
 - officer-portal: for each page, tests for search, one filter, sort by a header (aria-sort changes), page size and paging, Clear, the empty state, and the greyed invite tick box for someone on the portal. Update the existing DxChecks, DxWork, DxUc1 and DxUc4 tests to the new layout rather than deleting them.
 - mdm-service: route tests for the new query parameters (search, each filter, sort both ways, offset and total), and that a department-scoped officer still gets 403 on /api/worklists/turning-18.
 - Telugu coverage test passes.

Report by file: officer portal full suite counts, the mdm-service test files you touched, a short list of the routes and parameters added, and the cause of the disappearing item. Tell me how to rebuild (docker and portal commands) and which two URLs to open to check.
