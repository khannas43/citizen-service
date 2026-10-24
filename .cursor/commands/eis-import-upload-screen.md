# Build an upload screen for the seven Expenditure Integrity CSV imports

Repo: `/Users/sameerkhanna/Documents/Projects/DG2.0` (Digital Gujarat DG 2.0). This is a **portal-only** task in `officer-portal` (React/Vite, vitest + testing-library). The backend already exists and must not change. Do not commit or push. Never touch `videos/` or any `.pptx`.

## Goal

Today the seven imports can only be loaded with curl. Give `DEPT_ADMIN` and `IT_ADMIN` a simple page to pick a CSV, upload it, and see the result or the exact line that was refused.

## The backend contract (already built)

`POST {INTEGRITY_API}/v1/admin/import/<name>` with `multipart/form-data`, field name `file`, header `Authorization: Bearer <officer_token>` (from `localStorage.officer_token`). Do **not** set `Content-Type` yourself; the browser must add the multipart boundary. See `integrityAuthHeaders()` in `officer-portal/src/api.js` (it sets JSON content type, so build the headers separately, as `screenPaymentFile` in the same file already does).

| `<name>` | Columns (`?` optional) | Needs first |
|---|---|---|
| `units` | `id?, scheme_id, scheme_name, person_id, person_name, district, taluka, village?, authorized_amount, period_start, period_end?, family_id?` | none |
| `settlements` | `unit_id, period_start, period_end, amount, status, bank_token, transaction_ref?, reversal_of?` | units |
| `employees` | `employee_code, person_name, ddo_code, post_title, pay_level, status, status_since?, district?, taluka?, person_id?` | none |
| `service-events` | `employee_code, event_type, effective_date, order_ref?` | employees |
| `payroll` | `employee_code, component, ddo_code, period_start, period_end, gross_amount, net_amount, transaction_ref, reversal_of_ref?` | employees |
| `pensions` | `ppo_id, employee_code, monthly_rate, effective_from, commutation_amount?, recipient_name?` | employees |
| `life-certificates` | `employee_code, received_date, reference?` | employees |

Authoritative details (allowed values, re-upload behaviour) are in `docs/EXPENDITURE_INTEGRITY_DATA_LOADING.md`. Read it and reuse its wording on the page; do not invent rules.

Responses:
- Success `200`: `{ "imported": n, "skipped": n, "updated": n }`.
- Refused file `400`: `{ "message": "Line 7: amount 'lots' is not a number" }`. **Nothing from a refused file is loaded.** Show the message verbatim and say plainly that nothing was loaded.
- `401` session expired, `403` role not allowed, `413` or similar for a file over 20 MB. `integrityError(res, fallback)` in `api.js` already turns 401/403 and `{message}` bodies into readable text; reuse it (it is not exported today; export it or add a small exported wrapper).

## What to build

1. **API helper** in `officer-portal/src/api.js`: `uploadIntegrityImport(name, file)` returning the JSON, throwing `Error(message)` on failure. Add `INTEGRITY_IMPORTS`, a list describing each import: `{ name, label, columns, needs, hint }`, used by the page.
2. **Screen** `officer-portal/src/screens/ImportData.jsx` (+ `ImportData.css`, follow the look of `PaymentGate.jsx` / `MoneyOverview.jsx`; use the existing CSS variables):
   - Title "Load data", a short intro, and the load order ("units before settlements; employees before service events, payroll, pensions and life certificates").
   - One card per import, in two groups: "Beneficiary payments" (units, settlements) and "Payroll and pensions" (employees, service events, payroll, pensions, life certificates). Each card shows the label, the columns (mark optional ones), what it needs first, a **Download template** button (client-side: a CSV with just the header row, filename `<name>-template.csv`), a file picker (`accept=".csv,text/csv"`), and an **Upload** button, disabled until a file is chosen and while uploading.
   - Check on the client before sending: the file ends in `.csv` and is at most 20 MB; otherwise show a message and do not call the server.
   - After an upload show, inside that card: success as "Loaded: N new, N updated, N already there (skipped)", or the error message with "Nothing was loaded." Keep the last result visible until the next upload in that card. Use `role="status"` for success and `role="alert"` for errors.
   - After any success, show a hint linking to `/expenditure-integrity` : "Now run detection from Expenditure integrity."
   - Accessible labels on every control; works at phone width (16px gutters, no horizontal page scroll).
3. **Route and access**:
   - `officer-portal/src/App.jsx`: add `<Route path="/data-import" element={<RoleRoute><ImportData /></RoleRoute>} />` next to the other integrity routes.
   - `officer-portal/src/auth.js`: add feature `dataImport` to `DEPT_ADMIN` and `IT_ADMIN` in `ROLE_FEATURES`, and a nav entry in `OFFICER_NAV_CATALOG` (`{ to: '/data-import', label: '📥 Load Data', feature: 'dataImport' }`) placed after Expenditure Integrity. No other role gets it. The backend enforces this too (`/v1/admin/**` is `IT_ADMIN` and `DEPT_ADMIN`).
   - Update `officer-portal/src/auth-queue.test.js`: the expected sidebar lists for `DEPT_ADMIN` and `IT_ADMIN` change; keep every other role's list unchanged.
4. **Tests** `officer-portal/src/screens/ImportData.test.jsx` (mock `../api` as `MoneyOverview.test.jsx` does):
   - all seven cards render with their columns and "needs" text;
   - the Upload button is disabled until a file is chosen; a non-`.csv` file and a file over 20 MB are refused on the client without calling the API;
   - a successful upload shows the three counts and the detection hint;
   - a refused upload shows the line message and "Nothing was loaded.";
   - the template download produces the right header row for one import (assert the generated Blob text or the function that builds it);
   - a second upload in the same card replaces the first result.

## Do not

- Change anything in `expenditure-integrity-service`. If you think the backend needs a change, stop and say why instead.
- Add libraries. Use the existing stack.
- Put tokens or passwords in code, tests or your reply.
- Send the file anywhere except the integrity API.

## Verify

1. Portal tests from a clean copy (the repo is in iCloud and in-repo test runs hang): `rsync -a --exclude node_modules --exclude dist --exclude .git officer-portal/ <scratch>/op/ && cd <scratch>/op && npx vitest run`. Currently 144 pass; all must still pass.
2. Rebuild and deploy the portal: `DOCKER_HOST=unix://$HOME/.rd/docker.sock bash officer-portal/build_with_superset.sh` (image tag `arm64-local`, namespace `egov`). After the rollout the local port-forwards flap for about a minute.
3. In a browser at `http://127.0.0.1:30073/data-import`, log in as a department admin (demo users are listed in `docs/PROJECT_PLAN.md`) and check, using small throwaway CSVs: a good `employees` file loads; the same file again reports it as skipped; a file with a bad date is refused with `Line N:` and nothing loaded; a non-CSV file is refused on the client; a scheme officer or senior management user cannot see the menu entry and gets "not allowed" if they open the URL.
4. **Clean up after yourself:** any test rows you load go into the live demo database (schema `expenditure_integrity`). Use clearly fake codes (for example `TEST-IMPORT-001`), then delete them with SQL via `kubectl -n egov exec deploy/postgres -- psql -U egovuser -d egov_db` and confirm `GET /v1/overview` still shows 447 open alerts. Do not run detection while test rows exist.

## Environment notes

- Docker builds from inside the repo can hang at "load build context" (iCloud); `build_with_superset.sh` has worked for the portal, but if it hangs, copy the portal to a clean scratch folder and build there.
- If git reports a stale `index.lock` or `HEAD.lock` and no git process is running, remove the lock.

## Report back

List the files you added or changed, the test counts, what you saw in the browser, which test rows you created and removed, and anything you did not do.
