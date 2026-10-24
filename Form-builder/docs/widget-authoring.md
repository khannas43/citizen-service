# Widget authoring guide (FB-A12)

Guidance for palette widgets in `@dg20/form-widgets` (Unit A complete at FB-A12).

## Widget versus field (RJSF)

| Kind       | RJSF registration           | Produces form data?                 | Palette examples                                                                                                                                                                                                                                                                                     |
| ---------- | --------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Widget** | `widgets` map / `ui:widget` | Yes                                 | `text-short`, `email`, `dob`, `gender`, `dropdown-master`, `radio`, `yesno`, `multiselect`                                                                                                                                                                                                           |
| **Field**  | `fields` map / `ui:field`   | Object composites or display/layout | `section-header`, `info-panel`, `page-break`, `full-name`, `aadhaar`, `mobile-otp`, `caf-prefill`, `address-block`, `pincode`, `doc-upload`, `digilocker-fetch`, `photo-capture`, `cascading-dropdown`, `bank-account`, `eligibility-declaration`, `fee-field`, `signature-esign`, `family-repeater` |

Use a **widget** for scalar/array controls. Use a **field** for object values
(`full-name`, `aadhaar`, `mobile-otp`, `caf-prefill`, `address-block`, `pincode`,
`doc-upload`, `digilocker-fetch`, `photo-capture`, `cascading-dropdown`,
`bank-account`, `eligibility-declaration`, `fee-field`, `signature-esign`,
`family-repeater`) or display/layout entries (`producesData: false`).

Export new implementations from `src/widgets/registry.ts` via `dg20Widgets` or
`dg20Fields`. Do **not** add `custom-field` or `raw-json` escape hatches.

## Localization contract

1. Form-specific labels/help/**errors** come from `FormDefinition.meta.bilingual`
   via `WidgetRuntimeProvider` + `resolveLocalizedText` /
   `resolveFieldErrorMessages`.
2. Widget-owned chrome (counters, currency hint, gender labels, async status)
   comes from the governed message catalogue (`resolveWidgetMessage`).
3. Do not import application `i18next` configs.
4. Machine IDs (`widgetType`, field keys) stay English.
5. Missing Gujarati may fall back to English for draft preview — that is **not**
   bilingual completeness.
6. Field identity (FB-B3 / B3.1):
   - `definitionFieldId` — stable FormDefinition metadata / bilingual / CAF
     binding key (`[]` for array segments).
   - `instanceFieldId` — row-specific runtime identity for service adapters
     (`[n]` for array segments).
   - Top-level fields: both equal the exact RJSF `name` (underscores, hyphens,
     dots, brackets preserved; never split HTML/`idSchema.$id`).
   - Repeater child example: `family_members[].member_name` /
     `family_members[0].member_name`.
   - Nested repeaters compose scopes: `households[].members[].name` /
     `households[1].members[2].name`.
   - **Repeater row scopes extend the repeater’s already-resolved
     `FieldIdentity`** (`chrome.definitionFieldId` /
     `chrome.instanceFieldId`) via `appendArrayTemplateToResolvedPath` /
     `appendArrayIndexToResolvedPath`. They do **not** reconstruct the
     repeater identity from raw `name` (so legacy/structured `resolveFieldId`
     renames propagate to children).
   - Path segments escape `\`, `.`, `[`, `]` when joining raw property names
     (`escapeFieldPathSegment`). Do **not** re-escape an already composed path.
   - `useFieldChrome().fieldId` is a **compatibility alias of `instanceFieldId`**.
   - Bilingual labels/help/governed errors resolve with **definitionFieldId**.
   - DOM control/help/error IDs use RJSF-generated ids only.
   - Optional `resolveFieldId` may return a legacy string (normalized to both
     ids equal) or structured `{ definitionFieldId, instanceFieldId }`.
   - `resolveCanonicalFieldId` remains available and returns **definitionFieldId**.
7. **uiSchema** may only carry `ui:widget` / `ui:field` / `ui:order`. Do **not**
   store bilingual copy, validation, or business config in `ui:options`.

## Configuration via `x-dg20`

Widget-specific annotations live on the field JSON Schema:

```json
{
  "x-dg20": {
    "verifyEmail": true,
    "minAge": 18,
    "maxAge": 60,
    "otpChannels": ["sms"],
    "defaultStateCode": "GJ",
    "allowedMimeTypes": ["application/pdf"],
    "maxFileSizeBytes": 1048576,
    "digiLockerDocumentTypeCode": "PAN",
    "masterListId": "LIST_CATEGORY",
    "parentMasterListId": "LIST_STATE",
    "childMasterListId": "LIST_DISTRICT"
  }
}
```

Parse with `parseDg20Extensions`. Unknown keys are ignored. Unit C validates
allowed keys server-side. Do not register custom AJV keywords that execute
arbitrary logic.

FB-A3 `otpChannels`: missing → `['sms']`; unknown channels filtered; unknown-only
lists are invalid configuration (`resolveOtpChannels`). Additional OTP channels
require a governed contract change — do not invent WhatsApp/email/voice support.

FB-A4 `defaultStateCode`: applied by `address-block` only when the current value
has no state and returned state options contain that code.

FB-A5 `allowedMimeTypes` / `maxFileSizeBytes`: required for `doc-upload`
(non-empty exact MIME list; positive safe integer ≤ `DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES`).

FB-A5 `digiLockerDocumentTypeCode`: required non-blank for `digilocker-fetch`.

FB-A6 `masterListId`: required non-blank for `dropdown-master`, `radio`, and
`multiselect` (`resolveMasterListId`). Never configure list IDs via `ui:options`.

FB-A7 `parentMasterListId` / `childMasterListId`: required non-blank for
`cascading-dropdown` (`resolveCascadingListIds`).

FB-A7 multiselect bounds: JSON Schema `minItems` / `maxItems` only (non-negative
safe integers; `maxItems >= minItems`). Invalid bounds → configuration alert.

## CAF prefill bindings

CAF attribute / confidence thresholds come **only** from
`FormDefinition.meta.prefillBindings` passed into `WidgetRuntimeProvider`
(`prefillBindings`). Do **not** duplicate `cafAttribute` or `confidenceMin` in
uiSchema or `x-dg20`.

`resolvePrefillBindingForField` requires exactly one binding per
**definitionFieldId** (`[]` path for repeater children). `confidenceMin` must be
finite and within **0..1** inclusive (Unit C should reject invalid bindings;
widgets show a safe configuration error). Adapter requests send
**instanceFieldId** (`[n]` path). Adapter results must also use confidence in
**0..1** and a non-blank `value`, or the
widget falls back to manual entry without CAF emission (`acceptCafPrefillResult`).

### Session orchestration (FB-B5)

Resolution is **lazy and field-owned**: `CafPrefillWidget` resolves when mounted
on the active step (later steps when first entered). The renderer wraps host
`services.cafPrefill` in a session coordinator that caches settled admitted
results across remounts. There is **no** central batch that mutates hidden-step
formData (custom `definitionFieldId` mappings are not safely invertible).

- Binding lookup: `definitionFieldId`
- Adapter / coordinator requests: `instanceFieldId`
- Nested repeater rows use distinct request identities; numeric `[n]` instance
  IDs are not durably cached (reindex reuses the same `[n]` string for a
  different row). Unresolved requests are lifecycle-isolated (no in-flight
  coalescing). Reindex changes `instanceFieldId` and must not reuse another
  row’s pending or durable result
- Resumed `{ source: "CAF" | "OVERRIDE" }` values skip the adapter
- StrictMode: one microtask deferral before the live adapter invoke
- The widget remains the only component that emits the field value
- Hosts own identity, auth, HTTP, and Golden Record access — never HTTP here

## Runtime service ports

Optional adapters on `WidgetRuntimeProvider` / `services`:

- `emailVerification` — never call HTTP inside this package
- `nameTransliteration` — never call HTTP inside this package
- `clock` — inject for deterministic DOB tests (`todayIso(): YYYY-MM-DD`)
- `identityTokenization` — Aadhaar/VID → opaque reference (never HTTP here)
- `mobileOtp` — SMS send/verify (never HTTP here)
- `cafPrefill` — CAF / Golden Record resolve (never HTTP here)
- `geography` — State→District→Taluka→Village options (never HTTP here)
- `pincodeLookup` — PIN → city/district enrichment (never HTTP here)
- `fileStorage` — document/photo object-store + scan (never HTTP here)
- `digiLocker` — issued-document fetch (never OAuth/HTTP here)
- `masterData` — master-list options for `dropdown-master` / `radio` /
  `multiselect` / `cascading-dropdown` (never HTTP here). Dependent child lists
  may pass `parentCode` on `MasterDataRequest`.
- `bankAccountVerification` — account-name verification for `bank-account`
- `consentLogging` — accept/decline receipt logging for `eligibility-declaration`
- `feeComputation` — fee quote calculation for `fee-field`
- `eSign` — signature ceremony for `signature-esign` (never HTTP/popup/SDK here)

Also pass host-owned `feeContextRevision` on `WidgetRuntimeProvider` (not
FormDefinition / `ui:options`) whenever `fee-field` is present.

Also pass host-owned `eSignContextRevision` on `WidgetRuntimeProvider` (not
FormDefinition / `x-dg20` / `ui:options`) whenever `signature-esign` is present.
(never HTTP here; provisional v1 contract)

See [`integration-assumptions.md`](./integration-assumptions.md).

Missing adapters must yield an accessible unavailable state. Family Registry
geography endpoints elsewhere in the monorepo are incomplete and are **not**
bound directly; Unit B supplies adapters.

### Async invalidation

Whenever the **source input** for an in-flight request changes (email address,
English or Gujarati name, Aadhaar digits, mobile number, CAF binding, parent
geography code, PIN digits, master-list id / adapter identity / parentCode /
enabled child loading), the widget must:

1. Abort the active request (`AbortController`)
2. Invalidate its sequence/token so a late resolve cannot update UI
3. Clear busy / sent / suggestion / error status as appropriate

A result for value A must never update status after the value becomes B.
Do not store request IDs, AbortSignals, adapters, `Date` objects, OTP,
`challengeId`, raw Aadhaar/VID, CAF confidence, translated geography/master-data
labels, or option arrays in FormDefinition or form data.

`dropdown-master`, `radio`, `multiselect`, and `cascading-dropdown` share
`useMasterDataOptions` so abort, sequence, recovery, and validation cannot drift.
Locale changes re-label from cached options and must not refetch. Cascading child
lists stay `idle` (no request) until a known parent is selected.

### Bank account (FB-A8)

- Field composite `bank-account` uses `BankAccountVerificationAdapter.verifyAccountName`
- **Provisional v1** account-number policy: 6–20 ASCII digits (spaces/hyphens as
  typing separators only). Requires product/bank-integration confirmation.
- IFSC: `^[A-Z]{4}0[A-Z0-9]{6}$` after uppercase normalization
- Account number editing input is `type="password"` **without** `name` (excluded
  from native `FormData`); readonly shows mask + last four only
- Persist `BankAccountValue`; never AbortSignal, adapter errors, or echoed
  sensitive values inside `verificationRef`
- `emitBankAccountValue` independently refuses `verified:true` unless inputs are
  valid and the ref is safe (`isSafeBankVerificationRef`)
- Rejected account characters keep the last valid canonical digits in draft data
  (invalid raw is never emitted); malformed external formData clears local inputs
  without rewriting host data
- Persisted `verified:true` presents as verified even without an adapter; adapter
  absence only blocks new verification
- Any edit to account number / IFSC / holder name aborts verification and clears
  `verified` / `verificationRef`
- Single Verify / Retry action (not both); readonly mask uses `aria-labelledby`

### Eligibility declaration (FB-A9 / FB-A9.1)

- Field composite `eligibility-declaration` uses `ConsentLoggingAdapter.recordDecision`
- **Provisional** consent-logging contract — not a claim of full DPDP compliance
- Configure `x-dg20.declarationId` (required nonblank trimmed); never `ui:options`
- Full declaration text from `meta.bilingual.help[fieldId]`; heading from labels
- Changing declaration text in governance requires a **new** `declarationId`
- Unit C must reject incomplete EN/GU legal text before publish
- Persist only receipt-backed `EligibilityDeclarationValue` (never bare boolean)
- `consentReceiptRef` may embed `declarationId`/`fieldId` in composite ledger refs;
  exact identifier echoes and `data:`/`blob:`/`http://`/`https://` forms are rejected
- Checkbox has **no `name`**; native FormData must not serialize unreceipted decisions
- Keep previous decision until host success; failure leaves persisted value unchanged
- Abort/invalidate on adapter, declarationId, locale-while-pending-or-failed,
  external formData, disabled/readonly-while-pending, and unmount
- Locale change after failure clears Retry intent without adapter/onChange calls
- Retry repeats only the last failed desired decision
- Palette `supportsRequired: false` — do not invent per-instance required

### Fee field (FB-A10 / FB-A10.1)

- Field composite `fee-field` uses `FeeComputationAdapter.computeFee`
- **Provisional** fee-engine contract — host owns rule inputs, tax/rounding, expiry
- Configure `x-dg20.feeRuleId` (required); never `ui:options`
- Host supplies opaque `feeContextRevision` via runtime provider
- Missing revision → runtime unavailable (distinct from invalid config)
- Persist only validated `FeeFieldValue` with integer `amountMinor` (INR/paise)
- Format for display with `en-IN` / `gu-IN`; never put formatted text in formData
- Auto-compute when no current matching quote; locale change reformats only
- Compute-effect deps use stable primitives only (not resolution-object identity)
- One microtask deferral before `computeFee` so StrictMode replay cancels the first invoke
- Failure/malformed results stay failed until explicit Retry or a real dependency change
- Stale quotes are not shown as current and are not cleared until replacement succeeds
- No editable/hidden inputs; native FormData has no fee entry

### Signature / eSign (FB-A11 / FB-A11.1)

- Field composite `signature-esign` uses `ESignAdapter.requestSignature`
- **Provisional** eSign CBB boundary — not a claim of live provider integration
- Host supplies opaque `eSignContextRevision` via runtime provider (not FormDefinition /
  `x-dg20` / `ui:options`)
- Missing revision → runtime unavailable (not invalid FormDefinition configuration)
- Explicit **Sign with eSign** only — never auto on mount, locale change, or external load
- Persist only `SignatureESignValue` (`contextRevision`, `signedArtefactRef`)
- `emitSignatureESignValue` trims and canonicalizes `contextRevision` before validating the ref
- Never persist signature image/bytes/base64/PDF/blob, tokens, auth codes, timestamps,
  AbortSignal, or adapter errors
- `signedArtefactRef` may be a composite opaque reference embedding fieldId/revision;
  exact fieldId/revision echoes and `data:`/`blob:`/`http://`/`https://` forms are rejected
- Current matching revision displays as signed without an adapter call — **including when the
  adapter is absent**; adapter absence only hides Sign/Replace/Retry
- Stale/malformed values are not cleared by effects; replace only after validated success
- CANCELLED / failure emit nothing; show a single Retry (never alongside Replace/Sign)
- After a failed/cancelled replacement, the previous current signature is retained and
  status/alert text says the new attempt failed/cancelled without exposing references
- Replace / Sign again only when editable with adapter + context and no Retry intent
- Abort/invalidate on adapter identity, `eSignContextRevision`, locale-while-pending,
  external current value, disabled/readonly-while-pending, and unmount
- Locale change after failure/cancel clears Retry intent; locale with no pending/Retry
  makes no request
- No editable/file/hidden/named inputs; native FormData has no signature entry

### Family repeater (FB-A12)

- Field composite `family-repeater` registered in `dg20Fields`
- **JSON Schema is authoritative**: `type: array`, single object `items`,
  `additionalProperties: false`, `minItems` (default 0), required `maxItems`
- Member fields = `items.properties`; child widgets/order from `uiSchema.items`
- Do **not** put member definitions, bounds, or business config in `ui:options`
- Do **not** introduce `x-dg20` for this widget
- Do **not** nest a separate RJSF `Form` per row — use `registry.fields.SchemaField`
- Resolve each row with `retrieveSchema(itemsSchema, row)` then
  `toIdSchema(resolved, parentId + separator + index, row, idPrefix, idSeparator)`
  (RJSF ArrayField argument order — never pass `rootSchema` as row formData)
- Defaults via `registry.schemaUtils.getDefaultFormState` only on explicit Add
- Persist `Array<Record<string, unknown>> | undefined` only — never React keys,
  row IDs, UI state, or metadata
- Local stable React keys outside formData; internal Add/Remove preserve survivors;
  genuine external replacement regenerates all keys (including same-length swaps)
- Invalid nested SchemaField emissions (null/array/primitive) are ignored
- Missing `SchemaField` fails closed with the configuration alert
- Malformed / oversized external arrays: one `role="alert"`, no partial render,
  no `onChange` rewrite
- Below `minItems`: guidance status, allow Add, never auto-fill
- At `maxItems`: hide/disable Add
- Remove last row with `minItems: 0` emits `undefined`
- Provisional `FAMILY_REPEATER_GLOBAL_MAX_ROWS = 20` — product confirmation and
  Unit C publish-time enforcement still required
- **FB-B3 / B3.1 nested identity:** wrap each row `SchemaField` in
  `NestedFieldIdentityScope` whose prefixes extend the repeater’s resolved
  `chrome.definitionFieldId` / `chrome.instanceFieldId` (not raw `name`).
  Composes for nested repeaters. Do **not** recreate `WidgetRuntimeProvider`
  per row. Do **not** derive identity by splitting RJSF/HTML IDs. React
  `rowKey` values are UI-only and must never enter formData or canonical
  paths. Removing a row may reindex `instanceFieldId` values; async children
  must abort and ignore stale work. Unit C must later validate nested
  metadata/binding paths using the `[]` definition grammar.

### Aadhaar / VID security

- Validate with dependency-free Verhoeff (`isValidVerhoeff`); 12 → AADHAAR, 16 → VID
- Emit only `AadhaarReferenceValue` (`referenceToken`, `identifierKind`, `lastFour`)
- Prefer uncontrolled `type="password"` input **without a `name` attribute** (excluded from native `FormData`)
- Clear DOM after every tokenize attempt; on failure show re-enter guidance (no Retry on empty input)
- Reject adapter results that echo the raw identifier or mismatch `lastFour` (`isSafeOpaqueReference`)
- Derive masks from kind + lastFour; never store the mask string

### Mobile OTP security

- Persist only `MobileOtpValue` (`mobileNumber`, `verified`, optional `verificationRef`)
- Keep `challengeId` and OTP in transient component/DOM state only; OTP input has **no `name`**
- Normalize spaces/hyphens only; reject letters instead of stripping them into a valid number/OTP
- Validate opaque `challengeId` / `verificationRef` so they never echo mobile, OTP, or each other
- SMS is the only FB-A3 channel; host enforces rate limits / expiry / attempts

### CAF / address / PIN / documents

- `CafPrefillValue` — `value` + `source` (`CAF` \| `OVERRIDE`); Edit required before overriding CAF
- `AddressBlockValue` / `PincodeValue` — **codes only**; validate master-data with `validateMasterDataOptions`
- Never free-type geography; cascade clears descendants; PIN is exactly six ASCII digits
- PIN lookup responds to adapter + pincode (including external formData); retain bilingual
  lookup labels and derive display from the active locale
- `DocumentReferenceValue` / `PhotoReferenceValue` — object-store refs only; file inputs have **no `name`**
- `DigiLockerDocumentValue` — issuer-signed ref + type code only; no tokens
- Photo policy constants (`PHOTO_CAPTURE_*`) are a **provisional** governed baseline

### Citizen-visible errors

Citizen-facing copy must not expose internal units, services, stack traces, or
implementation terminology (for example “Unit C”, adapter class names, or raw
exception messages). Documentation may still describe Unit C rejection rules.

## DOB civil-date boundaries

DOB values are `YYYY-MM-DD` strings only. Never emit or store JavaScript `Date`.
Do not use `new Date('YYYY-MM-DD')` for arithmetic (timezone-sensitive).

### Inclusive age gates

- DOB must never be after today (future DOB → accessible local error).
- `latestDobForMinAge(today, minAge)` — latest DOB whose completed age is at
  least `minAge` (inclusive). Example: today `2026-07-20`, minAge `18` →
  `2008-07-20`.
- `earliestDobForMaxAge(today, maxAge)` — earliest DOB whose completed age is
  at most `maxAge` (inclusive). Example: today `2026-07-20`, maxAge `60` →
  `1965-07-21` (`1965-07-20` is age 61 and rejected).
- If `minAge` is absent (or zero), HTML `max` remains today.
- If `maxAge` is absent, no artificial lower DOB bound (`min`) is required.

### Leap-day anniversary versus inverse cutoff

- **Anniversary (completed age):** a 29 February birthday has its anniversary
  on **1 March** in a non-leap year (`anniversaryInYear`).
- **Inverse cutoff (HTML min/max derivation):** when projecting today backwards
  into a year that lacks 29 February, clamp to **28 February** before applying
  the inclusive boundary (`subtractYearsForCutoff`). Do **not** reuse the
  anniversary → 1 March mapping for cutoff derivation.

Helpers: `nextCivilDay`, `latestDobForMinAge`, `earliestDobForMaxAge`.

## Accessibility checklist

- [ ] Visible label / legend associated with controls
- [ ] Help and errors wired through `aria-describedby`
- [ ] Errors use text (not colour alone) and `role="alert"`
- [ ] Async status uses a polite live region (not per keystroke)
- [ ] Keyboard focus ring visible
- [ ] Minimum practical target size (~44px)
- [ ] Disabled vs readonly visually distinct
- [ ] Currency / percentage not conveyed by symbol alone
- [ ] Automated axe check passes for EN and GU
- [ ] No duplicate DOM IDs in combined forms

## Validation ownership

JSON Schema Draft 2020-12 is the validation source. Widgets may constrain native
input and normalize empty/NaN safely. Widgets must not invent a second rule
engine or weaken baked-in constraints.

## Styling conventions

- Scope under `.dg20-form-widgets` with `--dg20-*` custom properties
- Tokens in `src/styles/tokens.css`; chrome in `src/styles/widgets.css`
- No Tailwind / MUI / global resets that harm host portals

## Test requirements

Before marking a widget `implemented`:

1. Component tests (localization, required/disabled/readonly, change propagation,
   empty-state, error association, async/adapters where applicable)
2. Accessibility tests (axe + association checks)
3. Storybook stories for EN/GU and relevant states
4. Palette `implementationStatus: 'implemented'`
5. All root quality gates pass

## Changing registry status to `implemented`

1. Ship the React/RJSF component with baked-in behaviour from the design spec
2. Add bilingual scaffolding and a11y attributes
3. Add stories + unit + a11y tests
4. Flip only that widget’s status
5. Update README implemented list

## Prohibitions

- No department-extensible registry
- No custom/raw JSON widget escape hatch
- No `any`, `@ts-ignore`, or lint-disable used only to silence type errors
- No real network calls from widget library code
