# Published Form Application (FB-E3)

Citizen Portal package-level integration for the latest **published** Form
Definition via `@dg20/form-renderer`.

## Route

- Path: `/apply/:serviceId` (authenticated)
- Lazy-loaded so existing Citizen Portal bundles are not forced to load RJSF
  until this route is opened

### Legacy hard-coded routes (unchanged)

These continue to resolve to their existing screens and take precedence over
the dynamic route:

- `/apply/caf`
- `/apply/caste`
- `/apply/marriage`
- `/apply/pension`
- `/apply/family-member`
- `/apply/scheme`

## Package consumption

Local npm-pack tarballs (not a parent workspace, not published):

| Package | Path |
| --- | --- |
| `@dg20/form-contract` | `vendor/dg20/dg20-form-contract-0.1.0.tgz` |
| `@dg20/form-widgets` | `vendor/dg20/dg20-form-widgets-0.2.0.tgz` |
| `@dg20/form-renderer` | `vendor/dg20/dg20-form-renderer-0.1.0.tgz` |

### Refresh procedure

From **Form-builder** (read-only; do not build/clean/modify it for portal work):

1. Confirm package `dist/` outputs already exist.
2. From `citizen-portal/`, pack with scripts ignored and write only into this repo:

```bash
mkdir -p vendor/dg20
npm pack ../Form-builder/packages/form-contract --pack-destination vendor/dg20 --ignore-scripts
npm pack ../Form-builder/packages/form-widgets --pack-destination vendor/dg20 --ignore-scripts
npm pack ../Form-builder/packages/form-renderer --pack-destination vendor/dg20 --ignore-scripts
```

3. Point `package.json` `file:` dependencies at the new tarball names/versions.
4. `npm install --legacy-peer-deps` (React 19 peer conflict with some transitive deps).

Vite `resolve.dedupe` includes `react` and `react-dom` to avoid duplicate React
instances. Vite also aliases `@rjsf/core` and `@rjsf/validator-ajv8` to their ESM
builds so CJS default-export interop does not break FormRenderer under Vitest or
the production bundle. Import widget tokens CSS, widget CSS, and renderer CSS on
the published-form screen.

## Form Definition Service

| Setting | Env | Default |
| --- | --- | --- |
| Browser base URL | `VITE_FORM_DEFINITION_SERVICE_BASE_URL` | `/form-definition-service` |
| Vite proxy target | `VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET` | `http://localhost:8080` |

Default HTTP adapter:

`GET {base}/api/v1/form-definitions/published/latest?serviceId=…`

- `cache: "no-store"`
- `Accept: application/json`
- AbortSignal supported
- No retries
- No actorId / governance capabilities
- No citizen token unless a future FDS authentication contract requires it
- HTTP ETag is **ignored** (never rendered, persisted, or logged)

### Local mock

```bash
npm run e3:mock
# separate terminal
VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET=http://127.0.0.1:18081 \
  VITE_DG20_TECHNICAL_FORM_SERVICE_ID=dg20-technical-preview \
  npm run dev
```

## Technical preview tile

Optional development variable:

- `VITE_DG20_TECHNICAL_FORM_SERVICE_ID`

When it is an admitted serviceId, ApplyPage shows **Published Form — Technical
Preview** linking to `/apply/{encodedServiceId}`. When absent or invalid, no
tile is shown. Existing catalogue tiles and CAF are **not** remapped to FDS
service IDs — catalogue→FDS mapping remains external.

## Version pinning

Once loaded for an application session, the screen pins:

- `serviceId`
- published `version`
- the exact admitted definition object

Locale changes and ordinary form edits do **not** reload latest. A route
`serviceId` change starts a new session and clears previous form data.

Backend application-version persistence remains **external** and is required
before production rollout.

## Widget-service boundary

The default production screen does **not** invent adapters for CAF, master data,
geography, pincode, uploads/photo, DigiLocker, Aadhaar tokenization, OTP, bank
verification, consent logging, fee, eSign, or autosave/resume.

Widgets that need unavailable host services show their governed unavailable
state. Optional injected `widgetServices` / autosave / resume ports are allowed
for tests and future host integration only — no browser storage or fake network
APIs are wired by default.

## Integrity (FB-E3.1)

### Exact FormDefinition root

After clone-before-inspection, published definitions must own exactly:

`serviceId`, `version`, `status`, `jsonSchema`, `uiSchema`, `meta`, `audit`

Extras (`lockVersion`, `etag` / `ETag`, source metadata, unknown keys), symbols,
accessors, non-enumerables, custom prototypes, and hostile Proxy/`toJSON` inputs
are rejected with no silent repair. The detached definition is then admitted
through citizen-mode FormRenderer admission.

### Canonical adapter result

Public `loadLatestPublished` result is exactly:

```json
{ "serviceId": "…", "version": 1, "definition": { /* FormDefinition */ } }
```

- Bare FormDefinition results are rejected
- `plan` and other extras are rejected
- Envelope `serviceId` / `version` must match the requested serviceId and the
  definition coordinates
- Progressive plan is derived internally by FormRenderer — never trusted from
  an adapter

### Submission result

Only `{ "ok": true }` is a successful `CitizenFormSubmissionAdapter` result
(exact own enumerable data keys). All other payloads fail generically and are
never retained, displayed, logged, or exposed.

### Single in-flight submission

A synchronous busy ref guards double submit (adapter invoked once). Active
submission is invalidated/aborted on route change, published-adapter
replacement, submission-adapter replacement, and unmount. Stale
resolve/reject must not show success/failure or clear a newer session’s busy
state.

Replacing only `submissionAdapter` **must not** reload the published definition,
clear `formData`, or remount the FormRenderer session (FB-E3.1.1).

### StrictMode load

Exactly one live `loadLatestPublished` invocation; discarded StrictMode effects
must not change public state.

## Submission boundary

Optional port: `CitizenFormSubmissionAdapter.submitApplication(…)`.

There is no authoritative generic domain submission endpoint today. Therefore:

- the default route receives **no** submission adapter
- FormRenderer does **not** show a working Submit button by default
- localized guidance explains that online submission is not yet available
- formData is never sent to existing caste/pension/scheme APIs
- no serviceId→API mapping is inferred

Injected test adapters receive only detached `{ serviceId, formVersion, formData }`
after JSON-safe admission. Success requires admitted `{ ok: true }` only.

## Persistence policy

Do **not** persist definition, version, ETag, formData, OTP, Files/Blobs, or raw
identifiers to `localStorage`, `sessionStorage`, URL, analytics, or logs.

Existing `lang`, authentication, and profile storage remain unchanged.

## Verification

```bash
npm install --legacy-peer-deps
npm run lint
npm run test:run
npm run build
npm run e3:mock   # terminal 1
npm run e3:verify # mock contract; set E3_PORTAL_URL for optional Playwright UI
```

## Explicit non-claims

- Package-level technical integration only — not production submission
- Not authentication / DST / deployment / nginx / gateway / Kubernetes
- Design-spec §5 live-service acceptance remains **open**
- Acceptance fixture under `src/acceptance/` is illustrative and non-authoritative
- Hard-coded CAF and legacy `/apply/*` forms remain the production citizen paths
  for those services

STOP after FB-E3.1.
