# Form Renderer (`@citizen/form-renderer`)

Shared RJSF runtime used by the **citizen portal** and **Builder live preview**
(“render once”).

## Status

**FB-B6 / B6.1** package-level acceptance is documented in
[`unit-b-acceptance.md`](./unit-b-acceptance.md). It uses a **representative**,
deeply frozen Income Certificate fixture (not an authoritative production form).
Package-level Unit B technical acceptance is complete after B6.1; design-spec §5
live real-service acceptance remains pending.

**FB-B5 / B5.1** adds session-scoped CAF prefill orchestration on top of FB-B4.1:

- Lazy, field-owned resolution via `CafPrefillWidget` (active step only; later
  steps when first entered) — **no** central hidden-step formData mutation
- Renderer wraps host `services.cafPrefill` in a per-session coordinator that
  caches settled admitted results (`found:false` or `{ value, confidence }`)
  keyed by exact `instanceFieldId` → `cafAttribute`
- Unresolved requests are lifecycle-isolated (per-call AbortController; no
  cross-caller coalescing). Indexed `[n]` paths are never durably cached
- Cache resets on session remount (service/version/control-mode/canonical resume
  revision), host adapter swap, and unmount — not on locale, step nav, or equal
  controlled echoes
- Progressive resume commits before CAF widgets mount; stored CAF/OVERRIDE skip
  the adapter; unanswered fields resolve after resume settle
- Binding lookup uses `definitionFieldId`; adapter/coordinator requests use
  `instanceFieldId`
- The widget remains the only emitter of `{ value, source: "CAF" | "OVERRIDE" }`

**FB-B4 / B4.1** progressive resume remains:

- Optional `resumeAdapter` + `resumeContextRevision` load before first step mount
- Applies only to valid progressive plans (single-page never calls the adapter)
- No adapter → immediate step 0 (B3.1 behavior)
- Detached JSON via the same B2.1 `createAutosaveSnapshot` path — the **full**
  adapter result envelope (and checkpoint) is snapshotted before any property
  read; unexpected keys are rejected
- Canonical trimmed revision controls React session identity; raw whitespace-only
  differences do not remount; invalid revisions use a stable non-sensitive
  sentinel (never place over-length raw text in keys/DOM/status)
- Checkpoint `null` → step 0; non-null completed non-final step → resume at
  `completedStepIndex + 1` after validating claimed completed steps only
  (partial drafts are not full-form validated)
- Controlled hosts must echo resumed data (or equal clone) before Form mounts;
  internal `awaiting_host` never appears in public status
- Public statuses: `loading` | `loaded` | `not_found` | `failed` | `discarded`
  (never formData / revision / adapter errors). Public `loading` is emitted
  **one-to-one** with an actual `loadProgress` call (after StrictMode microtask
  and stale/abort checks); UI may show loading earlier
- Resume never emits `onStepChange` and never autosaves; after commit, B1/B2.1
  navigation and autosave behave unchanged

**FB-B2** progressive autosave remains:

- Optional `autosaveAdapter` — save between validated Next steps before advance
- Per-step validation on Next; full JSON Schema validation on Finish

Still deferred outside package-level Unit B:

- Live real-service / portal / backend acceptance (design-spec §5) — see
  [`unit-b-acceptance.md`](./unit-b-acceptance.md)
- Backend submission / application persistence

**FB-B3 / B3.1** (widgets) supply schema-aware nested field identity. Progressive
steps still list **root property fieldIds only**.

Unit C validation / publish gate is **out of scope** for this package.

## Install / import

```ts
import { FormRenderer } from '@citizen/form-renderer'
import '@citizen/form-widgets/styles/tokens.css'
import '@citizen/form-widgets/styles/widgets.css'
import '@citizen/form-renderer/styles/renderer.css'
```

## Public API

```ts
<FormRenderer
  definition={formDefinition}
  mode="citizen" // or "preview"
  formData={data}
  onChange={({ formData }) => { ... }}
  onSubmit={({ formData }) => { ... }}
  onStepChange={({ stepId, stepIndex, totalSteps, direction }) => { ... }}
  autosaveAdapter={hostAutosave}
  onAutosaveStatusChange={({ status, serviceId, formVersion, stepId, stepIndex }) => { ... }}
  resumeAdapter={hostResume}
  resumeContextRevision={opaqueHostRevision}
  onResumeStatusChange={({ status, serviceId, formVersion, stepId, stepIndex }) => { ... }}
  locale="en"
  defaultLocale="en"
  onLocaleChange={(locale) => { ... }}
  showLocaleToggle
  disabled={false}
  readOnly={false}
  services={ports}
  messageOverrides={...}
  resolveFieldId={...}
  feeContextRevision={...}
  eSignContextRevision={...}
/>
```

There are **no** props for custom widgets, fields, registries, or validators.

## Progressive steps (FB-B1)

`buildProgressivePlan` validates `meta.progressiveSteps` during admission.

Rules (top-level fields only):

- Empty array → single-page plan
- Nonempty → every root `jsonSchema.properties` key in exactly one step
- Unique nonblank `stepId`; nonblank EN/GU labels; nonempty unique `fieldIds`
- Nested paths (`.`, `/`, `[`) rejected
- Invalid plan → admission reason `progressive_steps_invalid` (citizen-safe unavailable copy)

### Step schemas / uiSchemas

Derived immutably per step:

- Object schema with only that step’s properties + filtered `required`
- Complete root `$defs` / `definitions` bags retained (transitive local refs safe)
- Root `additionalProperties` / `unevaluatedProperties` copied when present
- Root cross-step `if`/`dependencies`/etc. **not** copied into step schemas
- Each derived step schema is compiled during admission

**Validation split:** field-local constraints on Next; original full schema
(including cross-step rules) on Finish.

uiSchema: only current field entries; root allow-list is `ui:order` only
(normalized: dedupe, ≤1 `*`, append missing fields when no wildcard).

Successful admission returns `{ definition, plan }`. FormRenderer reuses
`admission.plan` — it does not rebuild the plan.

### Navigation

- Ordered step indicator with `aria-current="step"`
- Back (no validation / no onChange) · Next (step validate) · Submit on last step
- `readOnly`: Next/Back usable for review without validation or data emit; Submit disabled
- Unchanged complete form data does not emit `onChange` (RJSF `deepEquals`)
- No jumping to arbitrary future steps
- Locale switch keeps active step + data
- Service/version remount returns to step 0
- Step Form remounts on navigation (aborts pending widget work)
- After successful Next/Back, focus moves to the step heading

### Progressive autosave (FB-B2 / B2.1)

Host injects `autosaveAdapter?: ProgressiveAutosaveAdapter`. The renderer never
calls `fetch` or browser storage.

When adapter is present, interactive, progressive, and the step is not final:

1. Merge + `onChange` when complete data changed
2. Controlled hosts must semantically echo merged data before save (equal clone OK)
3. Detached JSON snapshot (`createAutosaveSnapshot`) — never throws; rejects
   accessors/symbols/sparse arrays; preserves `__proto__` keys safely; depth/node limits apply
4. `saveProgress({ serviceId, formVersion, completedStepId, completedStepIndex, formData, signal })`
5. Advance + `onStepChange` only after success

Without an adapter, Next advances immediately (B1.1 behavior). No “saved” claim.

Status callbacks (`onAutosaveStatusChange`) emit only
`saving | saved | failed` plus service/version/step coordinates — never formData,
errors, stacks, or AbortSignal. Do not emit `idle` on mount. Public `saving`
emits only when `saveProgress` is invoked.

Successful order: onChange (if changed) → host acknowledgement (controlled) →
`saving` → adapter → `saved` → step change. Pending acknowledgement is internal
(`awaiting_host`) and never leaks through public callbacks.

`disabled` blocks Next/Back/Retry/readOnly-Next (handlers guard even if invoked
programmatically). Failure: stay on step, one polite alert, one Retry. Cancel
pending intent and in-flight saves on unmount, service/version change, adapter
swap, disabled/readOnly. In-flight: only the acknowledged baseline is tolerated.
Equal controlled echoes and locale switches do not cancel.

### Progressive resume (FB-B4 / B4.1)

Host injects `resumeAdapter?: ProgressiveResumeAdapter` and
`resumeContextRevision?: string` (opaque, trimmed, ≤256 chars; never a citizen
ID/token). The renderer never calls `fetch` or browser storage.

- Progressive plans only; omit adapter for immediate step 0
- Invalid/missing revision with adapter present → configuration copy; recover
  when the prop becomes valid (no adapter call). All invalid revisions share a
  stable session sentinel; over-length raw text never enters React keys, DOM,
  or status payloads
- Canonical revision / service / version / control-mode remount re-enters the
  resume gate; raw whitespace-only revision differences and locale changes do not
- `loadProgress({ serviceId, formVersion, resumeContextRevision, signal })`
- Exact echo of serviceId / formVersion / canonical revision required
- The **entire** adapter result is admitted only via `createAutosaveSnapshot`
  before any property inspection; exact allow-listed envelope keys
  (`not_found`: status, serviceId, formVersion, resumeContextRevision;
  `found`: those plus formData, checkpoint) and checkpoint keys
  (`completedStepId`, `completedStepIndex`) — unexpected properties reject
- `checkpoint: null` → step 0; otherwise completed non-final step must match
  `stepId`/`stepIndex`, then target = index + 1; claimed completed steps are
  validated against admitted step schemas (not full-form)
- Uncontrolled: commit detached data, no `onChange` for load alone
- Controlled: equal host data → no `onChange`; otherwise one `onChange` then wait
  for semantic echo; missing `onChange` or newer host replacement → `discarded`
- No Form/widgets while UI `loading` / internal `awaiting_host`
- Public statuses: `loading | loaded | not_found | failed | discarded` with
  optional target step coords on `loaded` only — never revision/formData/errors.
  Public `loading` corresponds **one-to-one** with adapter invocation
- Resume never emits `onStepChange` and never autosaves; first later autosave
  includes the restored complete data

### CAF session orchestration (FB-B5)

Host keeps `services={{ cafPrefill: hostAdapter }}`. The renderer wraps it in a
per-session coordinator:

- Lazy active-step resolution only — no hidden-step formData mutation
- Durable cache for non-indexed `instanceFieldId`s; nested Maps keyed by
  `instanceFieldId` → `cafAttribute`
- Indexed `[n]` instance IDs are not durably cached (reindex-safe)
- Unresolved requests are lifecycle-isolated (no cross-caller coalescing);
  each call owns an internal AbortController linked to the caller signal
- Dispose/abort checks occur before any result admission or cache write
- StrictMode duplication is prevented by `CafPrefillWidget` microtask deferral
- Resume settles before CAF mounts; CAF/OVERRIDE skip the adapter
- Widget StrictMode microtask deferral before the live invoke
- Detached admission via `createAutosaveSnapshot`; never log values/confidence/
  attributes/errors/signals/cache contents

### Final submit

1. Merge current step data into complete application data
2. Validate complete data against original `jsonSchema`
3. Valid → `onSubmit({ formData })`
4. Invalid → no submit; navigate to earliest failing step (`validation_redirect`);
   inject step-filtered `extraErrors`; show full-form guidance

## Admission / validators / IDs

Unchanged from FB-B0.1: schema-scoped Ajv2020 WeakMap cache, instance-unique
`idPrefix`, keyed form-data sessions. See earlier B0.1 notes in git history /
architecture doc for detail.
