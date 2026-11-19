# Department users for the demo: Civil supplies (PDS) and Health

Spec for Cursor. 5 Nov 2026. Build after `Officer_Scale_Slice1_Review_1.md` is fixed and reviewed: item 0 of that review (one `system_code` per department) is a prerequisite. Claude reviews the result as before.

Same rules as earlier specs, with one change that Sameer has asked for: **add two new officer users and two new roles. Do not change, delete or reset any existing user, role, password or realm setting** (DG2.0 / `egov` stays untouched). No git commit or push. Telugu for every new string.

## 1. What Sameer asked for

For the demo, two department users who can see **only their own department's data**: one for Civil supplies (PDS) and one for Health.

Assumption to confirm: "Civil Registration (PDS)" means the department called **Civil supplies (PDS)** in the system (code `pds`). "Civil registration" (`crs`) is a different system: it is where birth and death events come from, and it has no officer user in this spec.

## 2. The two users

| Username | Password | Realm role | Department code | Sees |
|---|---|---|---|---|
| `pds.officer` | `officer123` (same demo convention as the other demo users) | `PDS_OFFICER` | `pds` | Civil supplies (PDS) only |
| `health.officer` | `officer123` | `HEALTH_OFFICER` | `health` | Health only |

- Created in the `citizen` Keycloak realm with the same attributes as the other demo users (`state_code`, e-mail `<username>@demo.gov.in`, no required actions).
- New idempotent script `scripts/add_dept_users.sh`: creates the two roles and two users if missing, **never deletes or recreates anything else**. Also add the same two roles and users to `setup-keycloak.sh` (its `create_user` list and role list) so a fresh install has them. If `citizen-realm.json` is the file actually imported on a fresh install, add them there too; check how the realm is loaded and keep the two in step. Do not alter existing entries.
- The department of a user is derived in `mdm-service/app/auth.py` from the role, not from anything the browser sends:
  `DEPT_ROLES = {"PDS_OFFICER": "pds", "HEALTH_OFFICER": "health"}`; `auth.scope(user)` returns the department code or `None`.
- A user is **department-scoped** only if they hold a department role and none of `MDM_STEWARD`, `MDM_ADMIN`, `ADMIN`, `DEPT_ADMIN`, `IT_ADMIN`. Anyone else behaves exactly as today.
- Add both roles to `MDM_WRITE_ROLES` (default in `auth.py` and in `mdm-service/k8s-manifest.yaml`) so these officers can approve their own department's items. They are not added to `MDM_ADMIN_ROLES`.

## 3. What a department user can see and do (server side, deny by default)

The browser menu hides screens, but **the server must enforce the limit**: a department user calling the API directly must get the same result as through the screen.

A department-scoped user may call only the routes below. Every other route returns 403 "Your role is limited to your department." (an unknown route also returns 403, not 404, so the list of routes does not leak). Implement this once, as a single check applied to every request (middleware or a dependency on every router), driven by an allowlist table in `auth.py`, not by sprinkling checks through the endpoints.

| Route | Scope rule |
|---|---|
| `GET /api/x/flow-board` | Only the user's own row; the totals row is that row alone. A `system` parameter for another department is ignored (not an error) and replaced by the user's own |
| `GET /api/x/work/groups`, `GET /api/x/work/items`, `POST /api/x/work/claim`, `POST /api/x/work/unclaim`, `POST /api/x/work/batch/preview`, `POST /api/x/work/batch/approve`, `GET /api/x/work/batches/{id}` | Only proposals whose `system_code` is the user's department; the filter is applied inside the query, and a batch that contains an id from another department skips it with "Not in your department" and approves none of them. A batch receipt is visible only if its items belong to the user's department |
| `GET /api/x/approvals` and the single-proposal decide route | Own department's proposals only. Deciding another department's proposal returns **404** (not 403), so it does not confirm that the id exists |
| `GET /api/x/consents`, `GET /api/x/consents/{id}`, `POST /api/x/consents/{id}/remind` | Only consents whose `system` is the user's department (the consent purposes that department owns). Other ids return 404. No respond, revoke, sweep or create |
| `GET /api/x/deliveries`, and the redeliver route | Only deliveries to the user's department; others return 404 |

Not available to a department user (all return 403): the control overview (`/api/x/control`), events and trail, person and golden-record screens, review queue, discrepancies, quality, policy, ledger, audit, query and verify, catalogue, registry, connectors, keys, access, scenarios, injection, evidence, retention, assisted channel, demo routes, translation, citizen-link and citizen-request routes.

What the department sees inside its own items: the proposal summary, the child's and parents' names and match scores, the consent state and the delivery state. No drill-down into a person's other-department records, and no cross-department record lists. (The evidence drawer in the Work queue already shows only the proposal's own detail; keep it that way and add a test.)

Health today has deliveries and consents but **no proposals**, so the Health officer's Work queue is empty and its Flow board row shows received, delivered, waiting for the citizen, retrying and failed. Do not invent work items for Health. The empty Work queue must say "Nothing needs a person in Health right now".

## 4. Officer portal

- Add `PDS_OFFICER` and `HEALTH_OFFICER` to `OFFICER_ROLES`, `ROLE_ALIASES` (also `PDS` and `HEALTH` aliases like the other roles), and `ROLE_FEATURES`. Give them `home` and a new narrow feature `mdmDept`; do not give them `mdm`.
- Screens a department role may open (menu entries and route guard, `officerCanAccessPath`): Control Tower (**Flow board tab only**; the Overview tab and its route variant `?tab=overview` are hidden and blocked), Decisions (Work queue, Approvals, Consent, Notices). Nothing else, including nothing from Operations, Schemes, Reports or Demo. Because `officerCanAccessPath` allows unknown paths, make sure a department role cannot reach any of the other `/dx/*` or `/mdm` paths by typing the address.
- Show the department name in the page header and the top bar for these users (for example "Civil supplies (PDS)"); the department filter on the Flow board and Work queue is hidden (fixed to their own).
- The role name appears in Telugu in the top bar and the language tests (`te.js`, coverage test).
- The tour (`DxTour`) is not shown to department roles.
- Landing page after login: the Work queue for `PDS_OFFICER`, the Flow board for `HEALTH_OFFICER` (since Health has no queue items). Update `officerLandingPath` and its test.

## 5. Tests (Cursor writes these first)

Backend `mdm-service/tests/test_dept_scope.py` (use the test-mode user injection that already exists for `MDM_AUTH_DISABLED`, extended so a test can set roles; production behaviour must not change):
1. `test_pds_officer_flow_board_shows_one_row_pds_only`
2. `test_health_officer_flow_board_shows_one_row_health_only`
3. `test_a_system_parameter_for_another_department_is_ignored`
4. `test_pds_officer_work_groups_and_items_only_pds` (count equals the admin count filtered to pds)
5. `test_pds_officer_cannot_open_decide_claim_or_batch_a_health_or_mdm_item` (404 for decide; skipped with a reason in batch)
6. `test_health_officer_sees_only_health_consents_and_deliveries`
7. `test_a_department_user_gets_403_on_every_route_outside_the_allowlist` (walk the app's routes and assert each non-allowlisted route returns 403; this fails when someone adds a route and forgets the list)
8. `test_an_unknown_route_returns_403_for_a_department_user`
9. `test_a_user_with_a_department_role_and_an_admin_role_is_not_scoped`
10. `test_existing_roles_behave_exactly_as_before` (steward, admin, dept admin see everything)
11. `test_the_work_queue_evidence_for_a_department_user_has_no_other_department_records`
12. `test_batch_receipt_for_another_department_returns_404`

Setup script: a test or a dry-run mode of `scripts/add_dept_users.sh` that checks it is idempotent and touches only the two new users and roles (describe how it was checked in the report if it cannot run without Keycloak).

Officer portal (vitest): the menu for each department role contains only Control Tower and Decisions; typing another `/dx/*` address redirects; the Overview tab is not offered; the department filter is hidden; the header shows the department; landing path for both roles; Telugu coverage passes; `auth-queue.test.js` and `navTree.test.js` updated; existing role tests unchanged and passing.

## 6. Setup and Sameer's run

`bash scripts/add_dept_users.sh` (creates the two users and roles in the running Keycloak), `bash scripts/mdm_setup.sh` (applies the manifest with the new write roles), `bash officer-portal/build_portal.sh`. No other changes to the cluster.

Demo script to include in the report: sign in as `pds.officer`, see only the PDS row, open the Work queue, approve a clean group by batch; sign out, sign in as `health.officer`, see only the Health row and Health's consents and notices; try to open the Master data address and see it refused.

## 7. What Claude checks in review

- Probes through the API with a real department token or the test-mode roles: another department's proposal id (404), a batch that mixes departments, every non-allowlisted route (403), the flow board with `system=health` as the PDS officer.
- The Flow board has one row per department and its numbers match the queue (Review 1, item 0).
- Existing users, roles and passwords are unchanged (compare `setup-keycloak.sh` and the realm file before and after).
- The script is idempotent and creates nothing else.
- Screens and Telugu.

## 8. Known gaps (stated, not fixed here)

- Other existing roles (Talati, revenue officer, scheme department and so on) can still read every Data Exchange route directly through the API, because read access is open to any signed-in user (`MDM_READ_ROLES="*"`). Only the two new department roles are restricted by the allowlist. Tightening the read roles for everyone else is a separate decision.
- A department user's citizen-facing data (citizen approvals) is unaffected; citizens use a different sign-in.
- Department identity comes from the role. A real deployment would map users to departments in the directory with an attribute and an approval workflow.
