# Integration assumptions (FB-A12)

This document records what `@citizen/form-widgets` **does and does not** assume about
host services. Exact adapter ownership remains unresolved at the monorepo level.

## Ports only

The widget library defines **optional service ports** including
`ESignAdapter`, `FeeComputationAdapter`, `ConsentLoggingAdapter`,
`BankAccountVerificationAdapter`, `MasterDataAdapter`, `FileStorageAdapter`,
`DigiLockerAdapter`, `CafPrefillAdapter`, `GeographyAdapter`,
`PincodeLookupAdapter`, identity/OTP ports, and earlier email/name/clock ports.
It:

- never performs HTTP;
- never reads Rancher/URL configuration;
- never imports code from outside `Form-builder`;
- never logs raw Aadhaar/VID, mobile numbers, OTP values, CAF confidence, file
  bytes, DigiLocker tokens, authorization codes, full bank account numbers,
  consent ledger payloads, fee-engine payloads, eSign provider payloads, or
  master-data option payloads into logs or status UI;
- never uses client `Date` / clock time as proof of consent or signature;
- never receives or hashes the whole form/application payload for fee calculation
  or eSign;
- never opens popups, redirects, OAuth flows, or browser SDKs for DigiLocker/eSign.

Unit B (Renderer) wraps host-injected ports (CAF, autosave, resume). Adapter
implementations and live platform endpoints remain host-owned. Package-level
acceptance (FB-B6) uses synthetic in-memory adapters only — see
[`unit-b-acceptance.md`](./unit-b-acceptance.md).

## Unresolved / host-owned (FB-A12)

| Topic                                        | Status                                                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Family-repeater row ceiling (20)             | **Provisional** — `FAMILY_REPEATER_GLOBAL_MAX_ROWS`; product confirmation + Unit C publish gate                                                                       |
| Nested field identity (FB-B3)                | **Done in widgets + C1** — `definitionFieldId` (`[]`) vs `instanceFieldId` (`[n]`); never parse RJSF/HTML ids. C1 validates nested bilingual/binding/provenance paths |
| Authoritative eSign CBB API                  | **Unresolved** — provisional `ESignAdapter` only; invocation/callback contract open                                                                                   |
| Signer identity / authentication             | **Host ownership** — widget never invents signer identity                                                                                                             |
| Signed payload construction                  | **Host ownership** — widget only sees opaque `eSignContextRevision`                                                                                                   |
| Provider transaction / audit refs            | **Host ownership** — widget persists opaque `signedArtefactRef` only                                                                                                  |
| Timestamp / certificate validation           | **Host ownership** — widget must not generate proof timestamps                                                                                                        |
| Cancellation semantics                       | **Unresolved** — widget treats `CANCELLED` as no emission; host defines UX/ledger                                                                                     |
| Server-side verification / preservation      | **Unresolved** — submission must revalidate artefacts                                                                                                                 |
| Authoritative fee-engine API                 | **Unresolved** — provisional `FeeComputationAdapter` only                                                                                                             |
| Rule inputs / context build                  | **Host/Unit B** — widget only sees opaque `feeContextRevision`                                                                                                        |
| Quote expiry                                 | **Host ownership**                                                                                                                                                    |
| Tax / rounding policy                        | **Host ownership** — widget persists integer `amountMinor` only                                                                                                       |
| Informational vs payable auth                | **Unresolved** — whether quote authorizes payment                                                                                                                     |
| Server revalidation                          | **Unresolved** — submission/payment must revalidate quotes                                                                                                            |
| Authoritative DPDP/consent API               | **Unresolved** — provisional `ConsentLoggingAdapter` only; not full legal compliance                                                                                  |
| Actor / session binding                      | **Host ownership** — widget never invents actor identity                                                                                                              |
| Server timestamp / retention                 | **Host ownership** — widget must not generate audit timestamps                                                                                                        |
| Withdrawal semantics                         | **Unresolved** — `accepted:false` is a receipt-backed decline/withdrawal record                                                                                       |
| Legal-text version governance                | Changing declaration copy requires a **new** `declarationId`                                                                                                          |
| Per-service `accepted:true`                  | Palette `supportsRequired:false`; later schema/governance may require acceptance                                                                                      |
| Bank verification API                        | **Provisional v1** — host supplies `BankAccountVerificationAdapter`; design spec does not define API                                                                  |
| Account-number length policy                 | **Provisional** — 6–20 ASCII digits; requires product/bank-integration confirmation                                                                                   |
| Master-data list API                         | **Unresolved** — host supplies `MasterDataAdapter`; widgets store codes only                                                                                          |
| Dependent list `parentCode`                  | Host interprets optional `parentCode` on child list requests                                                                                                          |
| Object-store reference format                | **Unresolved** — widgets accept opaque non-URL refs only (`isSafeObjectStoreRef`)                                                                                     |
| Malware / virus scanning                     | **Host ownership** — adapters return `CLEAN` \| `REJECTED`; widgets never fake a scan                                                                                 |
| DigiLocker contract                          | **Unresolved** — host supplies `DigiLockerAdapter`; no OAuth/popup/HTTP in this package                                                                               |
| Photo capture policy                         | **Provisional baseline** (JPEG/PNG, ≤5 MiB, 300–4096 px) — requires product/security confirmation                                                                     |
| Release-head / publish-lookup policy (FB-C5) | **Provisional** — highest published/retired wins, no fallback past a retired head; requires product/governance confirmation before final DG 2.0 semantics             |

## eSign (provisional FB-A11)

Runtime context:

- `eSignContextRevision?: string` on `WidgetRuntimeProvider` — host-owned opaque
  revision for the exact application/document payload to sign; **not**
  FormDefinition / `x-dg20` / `ui:options`. Missing revision is a runtime
  unavailable state, not invalid configuration.

`ESignAdapter.requestSignature({ fieldId, contextRevision, locale, signal })`
returns:

- `{ status: "SIGNED", contextRevision, signedArtefactRef }` — `contextRevision`
  must **exactly** match the request; `signedArtefactRef` is trimmed nonblank
  (`isSafeSignedArtefactRef`). Exact `fieldId` / `contextRevision` echoes alone
  are rejected; composite refs that embed them are allowed.
  `data:` / `blob:` / `http://` / `https://` refs are rejected.
- `{ status: "CANCELLED", contextRevision }` — matching revision; must not
  include a signed reference.

Persisted `SignatureESignValue`:

- `contextRevision`, `signedArtefactRef` only
- `emitSignatureESignValue` resolves/trims `contextRevision` first, validates the ref
  against that canonical revision, and returns the trimmed revision
- Never persist signature image/bytes/base64/PDF/blob, tokens, auth codes,
  callback URLs, provider payloads, client timestamps, AbortSignal, or adapter errors
- Stale signatures (wrong revision) are not presented as current and are not
  cleared until a new validated signing success
- A current valid signature remains signed even if the adapter is absent; adapter
  absence only blocks Sign/Replace/Retry
- After replacement cancel/failure, only Retry is shown (not Replace); prior value retained
- Explicit Sign / Retry / Replace only; native `FormData` has no signature entry

## Family repeater (FB-A12)

Configuration (JSON Schema on the array field — not `x-dg20` / `ui:options`):

- `type: "array"`
- `items`: one object schema with ≥1 `properties` and `additionalProperties: false`
- `minItems`: optional non-negative safe integer (default `0`)
- `maxItems`: required positive safe integer, `minItems <= maxItems`,
  `maxItems <= FAMILY_REPEATER_GLOBAL_MAX_ROWS` (**provisional 20**)

Persisted value:

- `Array<Record<string, unknown>> | undefined`
- Never persist React keys, internal row IDs, UI state, errors, or metadata
- Malformed / oversized incoming values are not rewritten
- Explicit Add/Remove only; no auto-fill to satisfy `minItems`

Nested rendering uses host RJSF `SchemaField` / `schemaUtils`. Nested field
identity (FB-B3 / B3.1) is composed via `NestedFieldIdentityScope`:

- **definitionFieldId** — FormDefinition bilingual / `prefillBindings` keys
  (`family_members[].member_name`, or a resolver-renamed `dependants[].…`)
- **instanceFieldId** — adapter request `fieldId`
  (`family_members[0].member_name`, or resolver-renamed `householdMembers[0].…`)
- A repeater row scope **extends the repeater’s already-resolved
  FieldIdentity** (`appendArrayTemplateToResolvedPath` /
  `appendArrayIndexToResolvedPath`). It does **not** rebuild the repeater
  segment from raw RJSF `name`.
- Never derive either by splitting `idSchema.$id`, DOM ids, or underscore
  delimiters
- Row removal may reindex instance paths; adapters must tolerate abort /
  stale-result ignore
- Unit C must later validate nested metadata and binding paths against the
  `[]` definition grammar

## Fee computation (provisional FB-A10)

Runtime context:

- `feeContextRevision?: string` on `WidgetRuntimeProvider` — host-owned opaque
  invalidation key; **not** FormDefinition / `ui:options`

`FeeComputationAdapter.computeFee({ fieldId, feeRuleId, contextRevision, signal })`
returns:

- `{ feeRuleId, contextRevision, currency: "INR", amountMinor, quoteRef }` —
  `feeRuleId` / `contextRevision` must **exactly** match the request;
  `amountMinor` is a non-negative safe integer (paise); `quoteRef` is trimmed
  nonblank (`isSafeFeeQuoteRef`). Exact `feeRuleId` / `contextRevision` echoes
  alone are rejected; composite refs that embed them are allowed.
  `data:` / `blob:` / `http://` / `https://` quote refs are rejected.

Persisted `FeeFieldValue`:

- `feeRuleId`, `contextRevision`, `currency: "INR"`, `amountMinor`, `quoteRef`
- Never persist formatted currency text
- Stale quotes (wrong rule/revision) are not presented as current and are not
  cleared until a new validated computation succeeds
- No editable/hidden native control; native `FormData` has no fee entry

## Consent logging (provisional FB-A9)

`ConsentLoggingAdapter.recordDecision({ fieldId, declarationId, accepted, locale,
signal })` returns:

- `{ declarationId, accepted, locale, consentReceiptRef }` — fields must **exactly**
  match the request; `consentReceiptRef` is a trimmed nonblank opaque reference
  (`isSafeConsentReceiptRef`). Exact equality with `declarationId` or `fieldId` is
  rejected as an echo; composite refs that embed those identifiers are allowed.
  Content/location forms (`data:`, `blob:`, `http://`, `https://`) are rejected.

Host owns consent ledger persistence, timestamping, actor/session identity,
retention, withdrawal policy, and audit. Widgets never expose adapter exception
text and never persist `AbortSignal` or error details.

Persisted `EligibilityDeclarationValue`:

- `declarationId`, `accepted`, `locale`, `consentReceiptRef`
- `undefined` = no recorded decision yet
- Never emit a bare boolean or a decision without a validated receipt
- Preserve the locale in which the recorded decision was made
- Checkbox input has **no `name`** (excluded from native `FormData`)

Bilingual declaration text:

- `meta.bilingual.labels[fieldId]` = field heading
- `meta.bilingual.help[fieldId]` = full declaration text (visible next to the control)
- Must not come from `ui:options`
- Unit C must reject incomplete EN/GU legal text before publish
- Changing governed declaration text requires a new `declarationId`

## Bank account verification (provisional v1)

`BankAccountVerificationAdapter.verifyAccountName({ fieldId, accountNumber, ifsc,
accountHolderName, signal })` returns:

- `{ verified: true, verificationRef }` — opaque nonblank ref that must not equal
  or contain account number, IFSC, or account-holder name (`isSafeOpaqueReference`)
- `{ verified: false }` — governed mismatch; no reference persisted

Host owns banking-provider integration, rate limits, authorization, audit, and
production error mapping. Widgets never expose adapter exception text.

Persisted `BankAccountValue`:

- `accountNumber?`, `ifsc?`, `accountHolderName?`, `verified`, `verificationRef?`
- Empty widget → `undefined`
- Partial entry → object with `verified: false` (no `verificationRef`)
- `verified: true` requires all three valid inputs + safe `verificationRef`
- Any identifying edit aborts verification and clears verified state/reference
- Rejected typing characters preserve the last valid canonical account digits in
  emitted draft data; invalid raw strings are never written to formData
- Malformed external formData clears local sensitive inputs and shows the invalid
  value alert without calling `onChange`
- Persisted verified values remain verified when the adapter is absent; absence
  only prevents starting a new verification

Security UI:

- Account input: `type="password"`, `inputMode="numeric"`, **no `name`**
- Readonly: mask + last four only via `aria-labelledby` (never full account in DOM)
- One Verify / Retry control after mismatch or failure (not both)
- Never put full account numbers in error/status/DOM IDs

## Surrounding DG 2.0 findings (non-binding)

| Finding                             | Implication                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Family Registry geography endpoints | Incomplete; not bound — Unit B supplies geography/PIN adapters              |
| CAF / Golden Record HTTP            | Host supplies `CafPrefillAdapter` via `FormDefinition.meta.prefillBindings` |
| DigiLocker / document storage APIs  | Not bound from this package; synthetic adapters in Storybook/tests only     |
| Master-data list services           | Not bound; synthetic `MasterDataAdapter` in Storybook/tests only            |
| Bank verification providers         | Not bound; synthetic adapters in Storybook/tests only                       |
| Consent / DPDP ledger               | Not bound; synthetic `ConsentLoggingAdapter` in Storybook/tests only        |

## Master-data choice widgets (FB-A6 / FB-A7)

Unchanged: codes only; shared `useMasterDataOptions`; cascading child idle until
known parent; locale re-label without refetch.

## Documents / photo / DigiLocker

Unchanged from FB-A5.1.

## CAF / geography / PIN

Unchanged from FB-A4.1, except FB-B3 identity rules: CAF binding lookup uses
`definitionFieldId`; `CafPrefillAdapter.resolveAttribute({ fieldId, ... })`
receives `instanceFieldId`. Geography/PIN and all other service adapters likewise
receive `instanceFieldId`. An `instanceFieldId` change (row remove/reorder/
external replacement) must abort in-flight work and ignore stale results.

## Data that must never enter formData

| Widget                    | Never persisted                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `family-repeater`         | React keys, internal row IDs, UI state, errors, refs, metadata, identity paths         |
| `signature-esign`         | Signature bytes/base64/PDF/blob, tokens, auth codes, timestamps, AbortSignal, errors   |
| `fee-field`               | Formatted currency text, AbortSignal, adapter errors, floating rupees, full formData   |
| `eligibility-declaration` | AbortSignal, adapter errors, client timestamps, bare boolean decisions without receipt |
| `bank-account`            | AbortSignal, adapter errors, echoed account/IFSC/name inside `verificationRef`         |
| `dropdown-master`         | Option labels, full option objects, AbortSignal, adapter errors                        |
| `radio`                   | Option labels, full option objects, AbortSignal, adapter errors                        |
| `multiselect`             | Option labels, full option objects, AbortSignal, adapter errors                        |
| `cascading-dropdown`      | Option labels, full option objects, AbortSignal, adapter errors                        |
| `yesno`                   | String `"true"`/`"false"`, `"YES"`/`"NO"`, `1`/`0`                                     |
| `doc-upload`              | `File`/`Blob`/bytes/base64, AbortSignal, adapter error details                         |
| `photo-capture`           | `File`/`Blob`/bytes/base64/object URLs, AbortSignal, adapter errors                    |
| `digilocker-fetch`        | OAuth tokens, auth codes, identity payloads, AbortSignal, adapter errors               |

## Production claims

Unit A (palette widgets) is complete at FB-A12. This does **not** claim live
eSign CBB, fee-engine, DPDP/consent-ledger, bank-provider, master-data,
DigiLocker, object-store, virus-scan, Form Renderer (Unit B), Builder SPA, or
form-definition-service integration. Storybook and tests use **synthetic**
adapters and fixtures only.

## Progressive autosave (FB-B2)

`@citizen/form-renderer` defines `ProgressiveAutosaveAdapter` as a **Renderer-level**
host port (not part of `WidgetServicePorts`). The host owns application/session
identity, authentication, HTTP, persistence, encryption, audit logging, server
timestamps, and idempotency/rate limits. The renderer:

- never calls `fetch` / `localStorage` / `sessionStorage` / IndexedDB;
- never stores or emits AbortSignal, credentials, or adapter error text;
- only snapshots JSON-safe form data between progressive steps.

## Progressive resume (FB-B4 / B4.1)

`ProgressiveResumeAdapter` is likewise a **Renderer-level** host port. Ownership
split matches autosave: host owns identity/auth/HTTP/storage/encryption/expiry/
audit; renderer owns lifecycle, admission, controlled acknowledgement, and UI.

- `resumeContextRevision` is an opaque host revision (trim once, ≤256 chars).
  The **canonical** revision controls session identity; raw whitespace-only
  differences do not remount. Invalid revisions share a stable non-sensitive
  sentinel and never place over-length raw text in keys/DOM/status
- Public `loading` corresponds one-to-one with an actual `loadProgress`
  invocation (after StrictMode microtask and stale/abort checks)
- The full adapter result envelope is inspected through the hardened
  `createAutosaveSnapshot` boundary before any property read; unexpected
  envelope/checkpoint keys are rejected
- Never expose the revision in DOM, formData, status payloads, or errors
- Checkpoint → target: `null` ⇒ step 0; else `completedStepIndex + 1` after
  validating claimed completed steps only (partial drafts OK)
- Resume then autosave: resume never saves; subsequent Next autosave uses
  restored complete data
- No renderer HTTP or browser storage

## CAF session orchestration (FB-B5 / B5.1)

`services.cafPrefill` remains the host surface. The renderer wraps it in a
**session-scoped coordinator** (lazy field-owned resolution — not a central
hidden-step batch mutator):

- Cache keys: exact `instanceFieldId` → exact `cafAttribute` (nested Maps)
- Cache only admitted **settled** results (`{ found: false }` or
  `{ value, confidence }` via `createAutosaveSnapshot`); never thrown/malformed
- Unresolved requests are lifecycle-isolated — no cross-caller in-flight
  coalescing; each call owns an internal AbortController linked to the caller
  signal; dispose/abort is rechecked before any cache write
- Indexed `[n]` instance IDs are never durably cached (reindex-safe)
- StrictMode duplication is prevented by widget microtask deferral, not by
  sharing unresolved promises
- Reset on session remount, host adapter swap, unmount — not locale / step nav /
  unrelated rerenders
- Progressive resume settles before CAF widgets mount; CAF/OVERRIDE resume
  values skip resolution
- Hosts own identity, auth, HTTP, and Golden Record access

## Unit B package acceptance (FB-B6 / B6.1)

Package-level technical acceptance uses a **representative**, deeply frozen
Income Certificate fixture and synthetic in-memory adapters only. See
[`unit-b-acceptance.md`](./unit-b-acceptance.md).

- No authoritative DST/catalogue FormDefinition was found in the DG2.0 monorepo
- The fixture is **not** an approved production DG form and is **not** part of
  the `@citizen/form-renderer` public exports
- Representative `required` fields are technical acceptance constraints, not
  approved service policy
- CAF object schemas require nonblank `value` + `CAF|OVERRIDE` `source`
- Live real-service / portal / backend acceptance (design-spec §5) remains
  **pending** — hosts still own HTTP, storage, CAF endpoints, and submission
- Unit C through FB-C4.1 (technical lifecycle + new-draft versions + shared
  service mutation lock) is authorized under the **2026-07-24 sequencing
  exception** while §5 remains open — see [`unit-c.md`](./unit-c.md)
- Unit D / Builder remains gated

## Unit C persistence foundation (FB-C0 / C0.1)

`services/form-definition-service/` stores complete FormDefinition documents as
PostgreSQL `jsonb`. Coordinate admission rejects blank/mismatched
serviceId/version/status before create-only insert.

## Unit C pure validator (FB-C1)

`FormDefinitionValidationPipeline` implements the five-stage §6 pipeline
offline. `FormDefinitionStore` is intentionally **not** wired to the pipeline.

## Unit C draft create/read REST (FB-C2)

External boundary for validate + draft create + exact read. All external creates
are validation-gated.

## Unit C draft replace + ETag (FB-C3)

`PUT` performs full draft replacement with If-Match optimistic concurrency.
Non-drafts are immutable through PUT.

## Unit C lifecycle + new-draft versions (FB-C4 / C4.1)

Technical state machine only (`draft → submitted → approved → published →
retired`). `actorId` remains an unauthenticated provisional assertion — DST is
not integrated. Published content is immutable; edits create a new draft version
via `/drafts/from-version`. Append-only lifecycle events are not REST-exposed.

Explicit draft create, clone allocation, and lifecycle transitions share one
PostgreSQL transaction-scoped advisory lock
(`pg_advisory_xact_lock(hashtextextended(serviceId, 0))`) acquired before the
first source/definition load. Draft PUT uses `@Version` only.

## Unit C published-lookup + version-list + package acceptance (FB-C5)

`GET /api/v1/form-definitions/published/latest` and
`GET /api/v1/form-definitions/versions` are now implemented (Flyway V3
partial index on `(service_id, version DESC) WHERE status IN ('published',
'retired')`). The **release-head policy** — highest `published`/`retired`
version wins, no fallback to an older `published` version once the head is
retired, higher `draft`/`submitted`/`approved` versions never shadow a
published one — is a **technical implementation decision**, not yet a
governance-confirmed DG 2.0 publish rule. It requires product/governance
sign-off before being treated as final (see the unresolved-items table below).

`FormDefinitionUnitCAcceptanceIT` provides package-level acceptance across all
fifteen FB-C5 points using the same **illustrative** technical fixture as
other Unit C tests (`valid-single-page.json`) — not an authoritative DG
Service Catalogue / DST-approved form. See
[`unit-c-acceptance.md`](./unit-c-acceptance.md) for the completion statement
and explicitly open items. Authn/z, DST governance workflow, deployment, and
design-spec §5 live real-service acceptance remain **post-C5**.

## Unit D Builder SPA foundation (FB-D0)

Unit D is **explicitly authorized** under a **2026-07-24 sequencing exception**
while §5 live acceptance, authentication/authorization, DST approval
integration, and deployment/Kubernetes remain open. See [`unit-d.md`](./unit-d.md).

FB-D0 delivers `@citizen/form-builder-app` — a visible **read-only** three-pane
Builder shell with an embedded Unit B FormRenderer preview. It does **not**
author definitions, call Unit C APIs, persist to browser storage, or claim
production readiness. FB-D1 will introduce the authoring state model and
controlled add/remove/reorder.

## Unit D Builder citizen fields (FB-D5)

FB-D5 adds governed Builder templates/editors for `email`, `full-name`, `dob`,
and `pincode`. Email verification (`EmailVerificationAdapter`), full-name
transliteration, and PIN city/district enrichment (`PincodeLookupAdapter`)
remain **host ports**. Preview may honestly show unavailable/status copy without
blocking authoring. FormDefinition stores only governed schema/`x-dg20` flags
and citizen value shapes; adapter status and UI drafts are never persisted into
the definition.

## Unit D Builder Form Definition validation (FB-D6)

FB-D6 connects explicit **Validate** to Unit C
`POST /form-definition-service/api/v1/form-definitions/validation`.

- Server validation is **authoritative** and **non-persisting**
- Builder owns `FormDefinitionValidationAdapter` (HTTP or injectable test double)
- Production base URL defaults to same-origin `/form-definition-service`;
  `VITE_FORM_DEFINITION_SERVICE_BASE_URL` overrides; gateway wiring remains
  deployment-owned
- Vite **development** may proxy `/form-definition-service` to a local Spring
  origin (localhost only in Vite config, not application code)
- Authentication remains **external** — the transport invents no tokens
- Save draft / Submit for approval remain **disabled** at D6 (Save arrives in D7)
- Issue technical `message` strings are currently **server-authored**; Builder
  chrome (buttons, summaries, severity labels) stays EN/GU localized
- Widget service ports remain separate; citizen-field adapters are still not
  injected by the Builder SPA

## Unit D Builder draft persistence (FB-D7 / D7.1 / D7.1.1)

FB-D7 wires Builder **Save draft** / **Load** to Unit C draft create, exact read,
and optimistic PUT:

- Opaque in-memory ETag only (never in `FormDefinition`, DOM chrome, or browser storage)
- Clone-first request/response admission; operation-specific failure UX
- Validation-match Save gate (committed definition must still match last successful Validate)
- Lifecycle Submit, authentication, DST, deployment remain **deferred**

## Unit D Builder identity fields (FB-D8)

FB-D8 adds governed Builder templates/editors for `aadhaar`, `mobile-otp`, and
`bank-account`. Identity tokenization, Mobile OTP, and bank verification remain
**host ports**. Preview may show unavailable/status copy without adapters.
`x-dg20.otpChannels` admits only exact lowercase `["sms"]` (absent → runtime
defaults to SMS). Counts at D8: **16 addable / 14 pending / 30 total**.

## Unit D Builder configured-add master lists (FB-D9 / D9.1 / D10)

FB-D9 adds `dropdown-master` and `radio` via a configured-add dialog that
requires an exact `masterListId` before the field enters the FormDefinition.
FB-D9.1 (accepted) hardens dialog focus sequencing and modal containment.
FB-D10 extends configured-add to `multiselect` and `cascading-dropdown` with
discriminated pending drafts, optional multiselect bounds, and cascading
parent/child list IDs. FB-D10.1 (accepted) requires that a root-required
multiselect serialize an explicit JSON Schema `minItems >= 1` (Builder, Unit C,
and AJV agree; no virtual client-only minimum). The Builder still does not fetch
or resolve master-list existence. Master-list **existence** remains an external
master-data dependency — the Builder does **not** perform HTTP lookup, option
management, or invent options. Counts at D10: **20 addable / 10 pending /
30 total**.

## Unit D Builder address + photo (FB-D11)

FB-D11 (accepted) adds governed Builder templates/editors for `address-block`
and `photo-capture` (`ui:field`). Counts at D11:
**22 addable / 8 pending / 30 total**.

- **GeographyAdapter** and **FileStorageAdapter** remain **host-owned**
  external ports — the Builder SPA does not inject them and performs no
  geography or object-store HTTP
- Address persists geography **codes only** (optional exact
  `x-dg20.defaultStateCode`); never labels or adapter payloads
- Photo persists a CLEAN object-store **reference only**; MIME/size/dimension/
  scan policy follows Unit A constants and is **provisional** (pending
  product/security confirmation) — not editable in the Property Inspector
- Preview may honestly show unavailable copy without adapters; no file-upload
  invention, fetch, or browser storage
- This does **not** claim production geography, object-store, virus-scan, or
  live-service readiness

## Unit D Builder document upload + DigiLocker (FB-D12)

FB-D12 (accepted) adds configured-add templates/editors for `doc-upload` and
`digilocker-fetch` (`ui:field`). Counts at D12:
**24 addable / 6 pending / 30 total**.

- **Object-store**, **malware scanning**, and **DigiLocker provider** remain
  **external** host responsibilities (`FileStorageAdapter` /
  `DigiLockerAdapter`) — the Builder SPA does not inject them and performs no
  upload, OAuth, popup, or DigiLocker HTTP
- Document Upload persists a CLEAN object-store **reference only**; MIME
  one-per-line and max bytes ≤ `DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES` stay
  synchronized with schema/`x-dg20`
- DigiLocker persists an opaque issuer-signed **reference** plus exact
  document type code (`const` + `x-dg20`); never tokens, auth codes, or
  identity payloads
- Preview may honestly show unavailable copy without adapters; no real file
  upload, fetch, or browser storage
- This does **not** claim production object-store, virus-scan, DigiLocker, or
  live-service readiness

## Unit D Builder fee + eSign (FB-D13)

FB-D13 adds a configured-add template/editor for `fee-field` and an
immediate-add template/editor for `signature-esign` (`ui:field`). Counts:
**26 addable / 4 pending / 30 total**.

- **FeeComputationAdapter**, **ESignAdapter**, and host runtime contexts
  (`feeContextRevision`, `eSignContextRevision`) remain **external** — the
  Builder SPA does not inject them and performs no fee-engine or eSign HTTP
- Fee persists exact `feeRuleId` (`const` + `x-dg20`) plus opaque quote fields
  only; never formatted currency text or full application payloads
- Signature/eSign persists opaque `contextRevision` + `signedArtefactRef`
  only; never signature bytes/base64/PDF/blob, tokens, or provider payloads
- Authoritative eSign CBB contract remains **provisional**
- Preview may honestly show unavailable copy without adapters; no fetch or
  browser storage
- This does **not** claim production fee-engine, eSign, or live-service
  readiness

Remaining 4 templates (`caf-prefill`, `family-repeater`,
`eligibility-declaration`, `page-break`), Bindings, drag/drop, lifecycle
Submit, auth, DST, Unit E, and §5 remain deferred.

## Unit D Builder eligibility declaration (FB-D14)

FB-D14 adds a configured-add template/editor for `eligibility-declaration`
(`ui:field`). Counts at D14: **27 addable / 3 pending / 30 total**
(superseded by FB-D15).

- **ConsentLoggingAdapter** remains **external** — the Builder SPA does not
  inject it and performs no consent-ledger HTTP
- Persists exact `declarationId` (`const` + `x-dg20`) plus opaque
  `accepted` / `locale` / `consentReceiptRef` shapes only; never bare boolean
  consent, invented receipts, timestamps, or legal/audit claims
- Declaration copy lives in mandatory bilingual help EN/GU (seeded on Confirm)
- Preview may honestly show unavailable interaction without the adapter; no
  fetch, storage, or fabricated receipt
- This does **not** claim production DPDP/consent logging readiness

Remaining 3 templates (`caf-prefill`, `family-repeater`, `page-break`),
Bindings, drag/drop, lifecycle Submit, auth, DST, Unit E, and §5 remain
deferred (superseded by FB-D15 for CAF/Bindings).

## Unit D Builder CAF prefill + Bindings (FB-D15)

FB-D15 adds configured-add for `caf-prefill` (`ui:field`) and Bindings workspace
authoring for `meta.prefillBindings`. Counts: **28 addable / 2 pending / 30 total**.

- Confirm creates exactly one `PrefillBinding`
  `{ fieldId, cafAttribute, confidenceMin }`; attribute/confidence never enter
  schema, uiSchema, or `x-dg20`
- Canonical CAF object schema `{ value, source: CAF|OVERRIDE }` only
- CAF / Golden Record adapters remain **external** — Builder does not invent
  values, fetch, or claim production prefill readiness
- Unsaved binding drafts block Validate; Property/Bilingual isolation preserved

Remaining 2 templates (`family-repeater`, `page-break`), drag/drop, lifecycle
Submit, auth, DST, Unit E, and §5 remain deferred (superseded by FB-D16 for
`family-repeater`).

## Unit D Builder Family Repeater (FB-D16)

FB-D16 makes `family-repeater` addable with governed nested member authoring.
Counts at D16: **29 addable / 1 pending / 30 total**. Remaining pending at D16:
`page-break` only (superseded by FB-D17).

- Builder-only `FAMILY_MEMBER_WIDGET_TYPES` (server does not whitelist)
- Canonical array/items shape; root `x-dg20` forbidden; `maxItems` 1..20
- Nested paths use FieldPathEscaper-compatible escaping
- No DB migration; Unit C `validateFamilyRepeaters` strengthened

Remaining deferred after D16: `page-break` structural authoring, drag/drop,
lifecycle Submit, auth, DST, Unit E, and §5 (superseded by FB-D17 for
`page-break`).

## Unit D Builder Page Break boundary (FB-D17)

FB-D17 closes the palette pending set. Counts: **30 addable / 0 pending / 30 total**.

- `page-break` is a **structural** boundary action (`STRUCTURAL_ADDABLE_COUNT = 1`),
  not a field template (`getAuthoringTemplate('page-break')` is undefined;
  `addField` fails with `structural_widget_requires_boundary_action`)
- Create-boundary dialog mutates **only** `meta.progressiveSteps`
  (atomic single-page enable+split, or progressive split with user EN/GU labels)
- Does not create jsonSchema / uiSchema / provenance / bilingual / formData entries
- Legacy literal `ui:field: "page-break"` definitions remain readable and are not
  auto-converted into `progressiveSteps`

Deferred after FB-D20: cross-step / palette-to-canvas drag, lifecycle approval/publication, auth, DST, Unit E, and §5.

## Unit D package-level acceptance (FB-D22)

**Package-level Unit D: COMPLETE.**

FB-D22 consolidates representative Builder acceptance under
`apps/form-builder/acceptance/` (fixture + in-memory ports; not public exports)
with shell/browser journeys documented in [`unit-d-acceptance.md`](./unit-d-acceptance.md).

Still external/open (do not claim resolved):

- §5 authoritative service acceptance
- Authentication / authorization
- DST integration
- Production adapters (including Hub / CAF / document / eSign / geography / object-store)
- Deployment
- Unit E portal integration
- Governance approval of provisional policies
- submitted → approved → published and retirement UI

No Unit E work is started by FB-D22.

## Unit E governance foundation (FB-E1)

FB-E0 audit decided Form-builder-scoped backend first. FB-E1 adds:

- Fail-closed `GovernancePrincipalProvider` (default 401)
- Provisional capabilities (not IAM role mapping)
- `GET …/governance/queue` (submitted|approved metadata; not DST)
- `GET …/governance/detail` (ETag + C1)
- `POST …/governance/lifecycle-transitions` (approve/publish; actor from principal)
- Flyway V4 governance queue partial index

Existing technical `POST …/lifecycle-transitions` remains unauthenticated /
backward-compatible. Optional profile `governance-technical` is **non-production
only**.

Still open: real JWT/Keycloak, DST contract, deployment, §5.
See [`unit-e.md`](./unit-e.md).

## Unit E package-level technical acceptance (FB-E4)

**Package-level Unit E: COMPLETE (technical only).**

Proves Builder draft → technical submit → governance queue/detail → approve →
publish → citizen published/latest → FormRenderer using real E1–E3 contracts.
Representative fixture SHA-256 drift-checked across Form-builder and portals.
See [`unit-e-acceptance.md`](./unit-e-acceptance.md).

Non-claims unchanged: production IAM, DST inbox, deployment, §5, catalogue
mapping. STOP after FB-E4 — do not treat this as production readiness.

## FB-E5.1 Form Definition Service containerization (Form-builder only)

Local multi-stage image + smoke verifier under Form-builder. **No image push, no
Helm/DevOps/nginx/portal changes, no IAM/DST.** See
[`fds-containerization.md`](./fds-containerization.md).

## FB-E5.5.1 FDS image supply-chain hardening (Form-builder only)

Official base indexes pinned by digest (2026-07-29). `npm run e5.5.1:verify`
builds a run-scoped local image, generates runtime SPDX SBOM + SARIF CVEs via
Docker Scout, fails on unwaived criticals, reports highs, and cleans only
run-scoped temp artifacts. FDS application image is **not** claimed multi-arch
from base-index support alone. Helm chart tags remain provisional and untouched.
**No push, deploy, signing keys, or vulnerability waivers.** See
[`fds-image-supply-chain.md`](./fds-image-supply-chain.md).

## FB-E5.2 Form Definition Service Helm chart (render-only)

Chart scaffold lives in DIGIT-DevOps
`deploy-as-code/helm/charts/core-services/form-definition-service/`. Form-builder
owns `npm run e5.2:verify` (helm dependency/lint/template in a temp copy only).

Still open / blocking real deploy: approved image digest/registry, PostgreSQL
major + DBA grants, secret ownership, IAM + gateway exposure, forward-only
Flyway rollback limits, `governance-technical` prohibition. **No install,
kubectl, push, environment-overlay, Zuul whitelist, portal, or §5 work in this
increment.** See [`fds-helm-chart.md`](./fds-helm-chart.md).

## FB-E5.3A / E5.3A.1 Portal least-privilege FDS proxy

Officer and citizen nginx gain runtime-substituted exact-path allowlists
(`FORM_DEFINITION_SERVICE_UPSTREAM`). Citizen: `GET …/published/latest` only.
Officer: governance `queue` / `detail` / `lifecycle-transitions` only. All other
FDS paths and wrong methods are rejected locally. Form-builder owns
`npm run e5.3a:verify` (temporary nginx:alpine + mock upstream; no portal image
build/push). nginx does not authenticate; FDS remains authoritative; governance
stays fail-closed; not public governance exposure.
**No DIGIT-DevOps/Zuul/IAM/DST/§5.** See [`fds-portal-proxy.md`](./fds-portal-proxy.md).

## FB-E5.4.1 Officer-governance OAuth2/JWT foundation

FDS profile `governance-oidc` validates officer Keycloak RS256 JWTs (audience
`form-definition-service`, actor=`sub`, roles from `realm_access.roles` →
`FDS_GOVERNANCE_READER` / `FDS_FORM_APPROVER` / `FDS_FORM_PUBLISHER`). Default
profile remains fail-closed. Technical body-`actorId` lifecycle is denied under
OIDC. Officer Portal governance HTTP adapter sends Bearer from `officer_token`
at request time. Issuer is runtime-supplied (`FDS_OIDC_ISSUER_URI`). Synthetic
RSA tests only — **no live IAM**. Citizen published/latest remains anonymous.
**No auth-service/citizen-portal/DIGIT-DevOps/nginx/deploy.** See
[`fds-governance-oidc.md`](./fds-governance-oidc.md).

## FB-E5.4.2A Builder/operator IAM package foundation

Under `governance-oidc`, Builder endpoints require dedicated capability
authorities (`VALIDATE_*` / `CREATE_*` / `READ_*` / `REPLACE_*` / `LIST_*`).
Governance roles grant zero Builder authorities. Builder SPA: host-owned
`accessTokenProvider` on all four HTTP adapters; standalone remote ops fail
closed without a provider; no login/token storage/Vite token env. Synthetic RSA

- focused adapter tests only — **no live IAM**.
  See [`fds-governance-oidc.md`](./fds-governance-oidc.md) and
  [`builder-access-token-provider.md`](./builder-access-token-provider.md).

## FB-E5.4.2B Authenticated Builder clone + submit

Under `governance-oidc`, `POST …/builder/drafts/from-version` requires
`CLONE_FORM_DEFINITION_DRAFT` with exact body `{}` (JWT `sub` → `createdBy`).
`POST …/builder/lifecycle-transitions` requires `SUBMIT_FORM_DEFINITION` with
exact `{"targetStatus":"submitted"}` (JWT `sub` → `submittedBy` + event actor).
Technical identity-bearing `POST …/drafts/from-version` and
`POST …/lifecycle-transitions` remain **denyAll**. Default Builder HTTP adapters
call `/builder/…` and never send client `createdBy`/`actorId`. Synthetic RSA
tests only — **no live IAM**.
See [`fds-governance-oidc.md`](./fds-governance-oidc.md) and
[`builder-access-token-provider.md`](./builder-access-token-provider.md).

## FB-E5.4.3A Officer-hosted Form Builder foundation

Officer-portal hosts Builder at `/form-builder` using the package embed entry
and a request-time `accessTokenProvider` over the existing officer session.
UX visibility requires at least one Builder `FDS_*` role; governance/portal
roles alone do not. FDS remains authoritative. Officer nginx allowlists
Builder FDS routes alongside governance (FB-E5.4.3B); technical clone/lifecycle
and citizen published/latest stay blocked on the officer proxy. Inherited
password-grant / localStorage / no-refresh debt is unchanged.
See [`builder-access-token-provider.md`](./builder-access-token-provider.md) and
[`fds-portal-proxy.md`](./fds-portal-proxy.md).
