# Unit D — Form Builder SPA (FB-D0 / FB-D1 / FB-D2 / FB-D3 / FB-D4)

## Sequencing exception (2026-07-24)

Unit D was **explicitly authorized** while external dependencies remained open.
**FB-D22** closes package-level Unit D technical acceptance. The following remain
external/open and are **not** claimed complete:

| Item                                              | Status                                         |
| ------------------------------------------------- | ---------------------------------------------- |
| §5 authoritative live-service / portal acceptance | **Remains open**                               |
| Authentication / authorization                    | **Remains open**                               |
| DST approval integration                          | **Remains open**                               |
| Deployment / Kubernetes                           | **Remains open**                               |
| Production adapters / live Hub/CAF/document/eSign | **Remains open**                               |
| Unit E portal integration                         | **Not started**                                |
| Unit C package-level technical acceptance (FB-C5) | **Complete**                                   |
| Unit B package-level acceptance (FB-B6.1)         | **Complete**                                   |
| **Package-level Unit D (FB-D22)**                 | **COMPLETE** — see `docs/unit-d-acceptance.md` |

Do not treat package-level Unit D completion as §5, authn/z, DST, deployment,
or Unit E completion. Do not claim production readiness.

## FB-D22 — Unit D package-level acceptance

FB-D22 adds a consolidated acceptance harness:

- Frozen representative draft at `apps/form-builder/acceptance/` (not a public export)
- Deterministic in-memory validation / persistence / lifecycle / version adapters
- Shell journeys covering authoring, Validate/Save, Submit, versions/clone, a11y,
  security/storage boundaries, and failure recovery
- Browser mock + verify: `scripts/d22-acceptance-mock.mjs`, `scripts/d22-browser-verify.mjs`

Defects proven by the harness and fixed in D22 are listed in
[`unit-d-acceptance.md`](./unit-d-acceptance.md).

**Verdict: Package-level Unit D: COMPLETE.** STOP after FB-D22.

## FB-D21 — Governed Integration Hub and Workflow binding authoring

FB-D21 replaces deferred Integration/Workflow copy in the Bindings tab with
governed authoring for `meta.integrationBindings` and `meta.workflowBindings`.
CAF Prefill authoring is unchanged and remains an independent draft surface.

Bindable targets come from `collectBindableFields` (data-producing roots in
`ui:order`, plus nested family members immediately after their parent). Display
and layout widgets (`producesData=false`) cannot be targets. Adapter IDs,
parameters, and stages are opaque identifiers — no live Hub calls, catalogues,
or existence claims.

Draft surfaces (`integrationBindingDraft`, `workflowBindingDraft`) use UI-only
row keys, participate in the global unsaved gate, mark canvas dirty roots via
baseline∪draft field IDs, and become stale when field removal scrubs committed
arrays. Each Apply mutates only its own binding array and invalidates D6
validation match; Cancel/no-op Apply do not.

Browser smoke: `apps/form-builder/scripts/d21-browser-verify.mjs`.

Historical; package-level acceptance closed by FB-D22.

## FB-D20.1 — Clone confirmation interaction guard

FB-D20.1 closes a stale `confirmClone` closure that omitted `uiState` from its
`useCallback` dependency list. Clone confirmation now derives
`authoringInteractionBlocked` on each render, exposes `canConfirmClone`, and
disables Confirm while D20 reorder or other blocking authoring interactions are
active. Cancel remains available; canceling the blocker restores eligibility
after prerequisites are rechecked.

Historical increment; superseded by FB-D21 for Bindings Integration/Workflow.

STOP: FB-D22 and later increments are out of scope.

## FB-D20 — Accessible canvas field reorder

FB-D20 adds native HTML drag-and-drop and keyboard reorder handles for root
canvas fields. Reorder targets are limited to the current progressive step (or
the whole single-page canvas); cross-step and touch-drag operations are out of
scope. The UI gesture is ephemeral and blocks validation, persistence, and
lifecycle actions without making the definition dirty until a successful drop.
At 390px, use the existing Move Up/Move Down controls.

Canonical pure operation: `reorderFieldWithinStep` (Move Up/Down delegates to
it). Targets: `getCanvasReorderTargets`. Browser smoke:
`apps/form-builder/scripts/d20-browser-verify.mjs`.

STOP: FB-D22 and later increments are out of scope.

## FB-D19 — Immutable version history and draft cloning

FB-D19 adds a version-history panel and a confirmation-gated clone flow. The
panel lists versions using bounded, cursor-based pagination; it opens `draft`
versions through persistence and allows only `published` or `retired` versions
to allocate a new `draft` version. Submitted and approved versions remain
visible but are not cloneable.

The clone confirmation renders service ID, source version, and source status
only. ETags, actor IDs, and definition content remain outside the UI. The
technical network boundary may carry service ID, version, and `createdBy`;
`createdBy` is not authentication or authorization and must not be treated as
an identity claim. No fallback actor is invented.

For local browser verification, start
`apps/form-builder/scripts/d19-versions-mock.mjs` on port 8080 and Vite with
`VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID`, then run
`apps/form-builder/scripts/d19-browser-verify.mjs`.

STOP: FB-D22 is out of scope.

## FB-D18 — Technical draft submission lifecycle

FB-D18 wires the existing Unit C lifecycle adapter into the Builder. A persisted,
clean, valid `draft` with an admitted technical actor can be submitted after an
explicit confirmation. The transition is `draft → submitted`; the submitted
definition becomes read-only and replaces the persistence baseline.

`VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID` is for local/non-production verification
only. It is never shown, logged, or persisted by the Builder. It is not an
authentication mechanism, and no default actor is fabricated. Technical submit
does not prove DST delivery or authentication.

**FB-E5.4.2A / E5.4.2B:** remote HTTP adapters require a host-owned `accessTokenProvider`
(Bearer at request time). Without a provider, Validate/Save/Load/Versions/Clone/Submit
fail closed locally. Default HTTP clone/submit call authenticated `/builder/…` paths
(empty/`targetStatus`-only bodies; JWT `sub` is the actor). Technical identity-bearing
clone/lifecycle remain denyAll under `governance-oidc`. See
[`builder-access-token-provider.md`](./builder-access-token-provider.md).

Historical increment; superseded by FB-D19.

## FB-D0 — visible read-only three-pane foundation

Package: `@citizen/form-builder-app` under `apps/form-builder/`.

D0 delivers a **runnable visual shell** only. Authoring (add/remove/reorder,
property editing, definition mutation, save/submit) begins in **FB-D1**.

### Visible surface

1. Builder header with illustrative service/version/`draft` status and a clear
   “Local technical preview” indicator
2. Searchable controlled palette — all **6** groups and **30** widget types from
   `@citizen/form-widgets` (no palette copy in app code)
3. Read-only ordered form canvas derived from an illustrative draft definition
4. Read-only selected-field inspector (palette metadata only; no JSON dump)
5. Embedded Unit B `FormRenderer` live preview (`mode="preview"`)
6. Tabs (Bindings / Bilingual / Steps) and action-bar placeholders
7. Controlled Builder EN/GU locale (owns the toggle; Renderer `showLocaleToggle={false}`)

### Explicitly out of scope (D0)

Drag/drop, add/remove/reorder, property editing, definition mutation, backend
HTTP, save/submit, lifecycle/validation API calls, authentication, DST,
browser storage, autosave/resume, raw JSON view/editor, custom fields, routing
framework, state-management library, Unit E.

### Run

```bash
npm run dev:builder      # Vite prints the local URL it bound to on startup
npm run build:builder
npm run preview:builder
```

Vite uses port `5173` when it is free and otherwise binds the next available
port, printing whichever URL it actually used. Do not assume the Builder is
always reachable at `5173`, and do not add code to force or kill a port —
always read the printed URL.

Vite aliases `@citizen/form-contract`, `@citizen/form-widgets`, and
`@citizen/form-renderer` to workspace **source** entry points so a clean checkout
does not require manually prebuilding package `dist/` folders.

### Illustrative definition

App-local deeply frozen draft singleton
(`apps/form-builder/src/definition/illustrative-draft-definition.ts`).
**Not** exported by any public package. **Not** an authoritative DG service.
Uses only implemented widgets suitable for offline preview (no host-service
adapters required).

### Next increment (delivered)

**FB-D1** introduces the authoring state model and controlled
add/remove/reorder — still without claiming §5/auth/DST/deployment completion.

## FB-D1 — controlled add / remove / reorder authoring

FB-D1 layers a pure, in-memory authoring session on top of the D0 shell. It
does **not** change the D0 sequencing exception: §5 authoritative live-service
acceptance, authentication/authorization, DST approval integration, and
deployment all **remain open**. FB-D1 is **not production-ready** — it is a
local, non-persisted technical preview of authoring mechanics only.

### What FB-D1 adds

1. **Pure authoring module** (`apps/form-builder/src/authoring/`):
   `createAuthoringSession` clones the source definition into a detached
   working copy using the strict, hostile-input-safe JSON cloning rules
   shared with autosave (`createAutosaveSnapshot` from `@citizen/form-renderer`)
   — the frozen `ILLUSTRATIVE_DRAFT_DEFINITION` singleton is never mutated.
   `addField`, `removeField`, `moveField`, `getMoveCapability`, and
   `getRemoveCapability` are pure functions that return a new immutable
   `BuilderAuthoringState` (or a typed `AuthoringError`) without side effects.
2. **Exactly 9 addable widget types** in this increment: `text-short`,
   `text-long`, `number`, `currency-inr`, `percentage`, `gender`, `yesno`,
   `section-header`, `info-panel`. The remaining **21 / 30** palette widgets
   stay visible and searchable but render as disabled "pending" entries — the
   palette registry itself is untouched and still reports all 30.
3. **Deterministic field IDs**: `allocateFieldId` derives an ASCII
   snake_case stem from the widget type and appends the lowest unused positive
   integer suffix found in the current definition (no global counters, no
   randomness).
4. **Atomic add**: inserts the new field's JSON Schema property, `ui:order`
   entry, `ui:widget`/`ui:field` uiSchema entry, palette provenance, and
   bilingual EN/GU label together; display fields (`section-header`,
   `info-panel`) are never added to `required`, and previewFormData is never
   seeded for them. Adding without a canvas selection appends to the end (and
   to the last progressive step); adding with a selection inserts immediately
   after it (and into that field's progressive step).
5. **Atomic remove**: removes the field from `jsonSchema.properties`,
   `required`, `uiSchema` (including `ui:order`), `paletteProvenance`,
   bilingual labels/help/errors, `prefillBindings`/`integrationBindings`/
   `workflowBindings`, every `progressiveSteps[].fieldIds`, and preview
   `formData` in one pass. Removing the last remaining field on the form is
   rejected (`cannot_remove_last_field`); removing the last remaining field of
   a progressive step is rejected (`cannot_empty_progressive_step` — see
   FB-D1.1 below; steps are never silently emptied, merged, or deleted).
   Selection moves to the nearest remaining field.
6. **Constrained reorder**: `moveField`/`getMoveCapability` only allow moving
   a field up/down **within its own progressive step**; moves at a step's
   first/last position or across a step boundary are disabled in the UI and
   rejected by the authoring function. Reordering never touches
   `jsonSchema.properties` or preview `formData`.
7. **Builder UI wiring**: the palette shows "Add {label}" buttons for the 9
   addable widgets and a disabled "pending" badge for the other 21; the canvas
   shows a progressive-step chip per row; the field inspector gains
   Move up / Move down / Remove field buttons (still no property editing, no
   raw JSON); an `aria-live="polite"` region announces every add/remove/move
   outcome (and safe, generic text on failure) in the active Builder locale.
   Switching Builder locale (EN ⇄ GU) never resets the authoring session or
   the live preview's formData — locale is tracked independently of authoring
   state.
8. After a successful add, the newly created field is selected and its canvas
   row receives keyboard focus.

### Explicitly still out of scope (D1)

Drag/drop reordering, property editing (label/required/regex/etc. inspector
controls), raw JSON view/editor, custom fields, the remaining 21 palette
widget types as addable, cross-step moves, adding/removing progressive steps
themselves, backend HTTP, save/submit, lifecycle/validation API calls,
authentication, DST, browser storage, autosave/resume, routing framework,
state-management library, Unit E.

### Tests

- `tests/builder-d1-authoring.test.ts` — pure unit coverage of the authoring
  module (purity/no-mutation, detached clone, deterministic IDs, all 9
  templates, step membership/order sync, exhaustive remove-cleanup,
  cannot-remove-last, in-step move + boundary rejection, malformed-input
  safety, and the exact 9/21/30 counts).
- `tests/builder-d1-ui.test.tsx` — React Testing Library coverage of the
  wired Builder shell (add/remove/move via the UI, locale-preserves-state,
  pending widgets cannot be added, all 30 remain searchable, focus-after-add,
  EN/GU announcements, axe accessibility, unique DOM IDs, and exact
  addable/pending button counts).
- `tests/builder-d0.test.tsx` remains green (updated only where the D0
  read-only inspector copy changed).

### Next increment (delivered)

**FB-D1.1** hardens the D1 authoring mechanics below — still without
claiming §5/auth/DST/deployment completion, and still without starting D2
(property editing, the remaining 21 widgets, drag/drop, progressive-step
authoring, save/submit, or lifecycle API wiring).

## FB-D1.1 — authoring integrity hotfixes

FB-D1.1 fixes confirmed defects in the D1 authoring mechanics without adding
any new authoring capability (no D2 scope). It does not change the D0/D1
sequencing exception.

1. **Empty progressive steps are rejected, not repaired.** `removeField`
   rejects removing the last remaining field of any progressive step with
   `AuthoringError` code `cannot_empty_progressive_step`; it never silently
   deletes or merges the step, and never mutates state on rejection.
   `getRemoveCapability(state, fieldId)` reports `canRemove` plus a
   `blockingReason` of `'final_form_field'` or `'final_step_field'` so the
   UI can disable the Remove button and show distinct EN/GU guidance for
   each case. The Builder shell and field inspector are wired to this
   capability instead of a plain field count.
2. **Strict JSON cloning.** `apps/form-builder/src/authoring/clone.ts` no
   longer uses `structuredClone`. It is built on the same hostile-input-safe
   rules as autosave — the public `createAutosaveSnapshot` from
   `@citizen/form-renderer` — rejecting cycles, accessor properties, symbol
   keys, sparse arrays, non-finite numbers, and values beyond the documented
   depth/node bounds. Own keys named `__proto__`, `constructor`, and
   `prototype` are preserved as ordinary data properties on null-prototype
   result objects (they are not rejected and do not mutate
   `Object.prototype`). `cloneJsonSafeObject` returns a `CloneJsonSafeResult`
   for call sites that report failure via `AuthoringResult`
   (`addField`/`removeField`/`moveField`); the throwing `cloneJsonSafe`
   wrapper is used where failure is surfaced by throwing an
   `AuthoringError` (`createAuthoringSession`, `setPreviewFormData`).
   `AuthoringError` optionally carries a machine-readable `reason` (an
   `AutosaveSnapshotFailureReason`) — never a stringified hostile value.
3. **Strengthened `assertDefinitionIntegrity`.** Still detection-only, never
   repairs: non-empty properties; palette provenance covering every property
   exactly once _and_ restricted to the controlled palette registry
   (`isApprovedWidgetType`); every property's `uiSchema` entry declaring the
   correct binding key (`ui:widget` for `data`-category widgets, `ui:field`
   for `display`/`layout`) matching its provenance widget type, with the
   other key absent; `required` limited to unique, existing field ids whose
   widget type has `supportsRequired: true`; `bilingual.labels` keys exactly
   equal to the property keys; `bilingual.help`/`bilingual.errors` with no
   orphan keys and, where present, exactly non-blank, unpadded EN+GU pairs;
   and progressive steps (when used) with non-blank unique `stepId`s,
   non-blank EN/GU labels, at least one field each, and an exact one-time
   cover of every property.
4. **Bilingual info-panel help.** Adding an `info-panel` field atomically
   sets both `bilingual.labels[fieldId]` and `bilingual.help[fieldId]` with
   non-blank EN/GU (sourced from the controlled palette description).
   Removal continues to clean both. The illustrative draft definition's
   `info_guidance` field now carries a help entry and passes the
   strengthened integrity check.
5. **Reducer for UI serialisation.** `apps/form-builder/src/authoring/reducer.ts`
   exports a pure `authoringReducer(state, action)` over `add` / `remove` /
   `move` / `select` / `setPreviewFormData` actions, returning the next
   `AuthoringUiState` (authoring state, derived `announcement`, derived
   `pendingFocusFieldId`) with no side effects. `BuilderShell` drives this
   with `useReducer`, so dispatch always observes the latest state
   (eliminating stale-closure risk from the previous per-handler
   `useCallback([authoringState])` pattern) and rapid sequential dispatches
   (e.g. add → add) apply correctly in order. Focus is applied by an effect
   that reads `pendingFocusFieldId` once via a ref guard — it never
   re-dispatches — so a React 18 StrictMode dev double-invoke cannot produce
   duplicate operations or duplicate announcements.
6. **Action-bar copy fix.** `actionsDeferredNote` no longer says actions are
   disabled "in D0" (add/remove/reorder are not disabled) — it says
   validate/save/submit remain deferred after D1 and that DST approval is
   not connected.

### Tests (FB-D1.1 additions)

`tests/builder-d1-authoring.test.ts` and `tests/builder-d1-ui.test.tsx` add:
empty-step rejection with unchanged state; `getRemoveCapability` for both
blocking reasons; a disabled Remove button (with step-specific guidance) for
a step's final field; direct `cloneJsonSafeObject`/`cloneJsonSafe` coverage
of every prohibited shape (functions, symbol keys, `Map`/`Set`/`Date`,
getters/accessor properties, `Proxy` traps, prototype-pollution-shaped own
keys, cyclic references, excess depth) alongside accepted Unicode content;
the strengthened integrity cases above (one per rule); info-panel label+help
add/remove and the illustrative baseline passing integrity; rapid sequential
`add` → `add` dispatch via the reducer producing `text_short_1` then
`text_short_2`; and a reducer-purity test (identical output for two calls
with identical arguments) in place of a StrictMode double-render assertion.

### Next increment (delivered)

**FB-D1.2** closes remaining integrity/announcement contract gaps before D2 —
still without claiming §5/auth/DST/deployment completion, and still without
starting D2.

## FB-D1.2 — exact runtime-shape and repeated-announcement hotfix

FB-D1.2 makes only focused contract corrections on top of D1.1. It does not
add templates, property editors, drag/drop, HTTP, or Unit E.

1. **Exact localized-pair validation.** Shared `isExactLocalizedPair` accepts
   only a plain/null-prototype object whose exact own enumerable keys are
   `{en, gu}`, both nonblank and unpadded strings. Applied to every entry in
   `meta.bilingual.labels` / `help` / `errors`. Extra keys (`hi`, `__extra`),
   missing keys, arrays, null, and primitives are rejected as typed
   `AuthoringError` `inconsistent_definition` — never repaired.
2. **Exact governed entry shapes.** `paletteProvenance` entries must have
   exact keys `fieldId` + `widgetType`; `progressiveSteps` entries must have
   exact keys `stepId`, `labelEn`, `labelGu`, `fieldIds`. Blank/padded
   property IDs, provenance fieldIds, required IDs, and step fieldIds are
   rejected; unexpected keys and non-array runtime values fail safely.
   Existing exact coverage/uniqueness checks are preserved. Per-field
   `uiSchema` presentation keys beyond the required matching `ui:widget` /
   `ui:field` binding are not over-restricted.
3. **Typed integrity failure containment.** `assertDefinitionIntegrity` never
   leaks `TypeError` or hostile inspection exceptions: missing/null/wrong-type
   `jsonSchema`, `uiSchema`, `meta`, bilingual buckets, `paletteProvenance`,
   `progressiveSteps`, and `required` become `AuthoringError`
   `inconsistent_definition`. Error messages do not serialize hostile input;
   accessors are not invoked. Strict JSON admission in `createAuthoringSession`
   is unchanged.
4. **Repeated identical live-region announcements.** The Builder shell
   remounts the polite live region keyed by `announcement.id` with
   `aria-atomic="true"`, so two successive identical "Added Short text"
   strings still produce a new accessible update. No timers in the reducer;
   StrictMode still performs exactly two requested adds, not four.
5. **Clone documentation accuracy.** `clone.ts` comments now match B2.1
   behaviour: `__proto__` / `constructor` / `prototype` own keys are
   preserved as data on null-prototype clones — not rejected.

### Tests (FB-D1.2 additions)

Focused regressions for exact localized pairs, exact provenance/step shapes,
typed containment on malformed sections, and repeated identical live-region
updates (EN + GU) under StrictMode with selection remaining on
`text_short_2`.

### Next increment (delivered)

**FB-D2** adds governed property editing for the existing 9-widget authoring
batch — still without claiming §5/auth/DST/deployment completion.

## FB-D2 — governed property editing (9-widget batch)

FB-D2 replaces the read-only D1 inspector for the nine addable widgets with
form-based property editors. It does **not** add the remaining 21 templates,
drag/drop, backend HTTP, save/submit, authentication, DST, or deployment.

### Property surface

| Widget           | Editable                                                          | Preserved / baked                         |
| ---------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| `text-short`     | label EN/GU, optional help pair, required, maxLength, pattern     | unrelated schema keys (e.g. `minLength`)  |
| `text-long`      | label EN/GU, optional help, required, maxLength                   | unrelated schema keys                     |
| `number`         | label EN/GU, optional help, required, min, max, step→`multipleOf` | —                                         |
| `currency-inr`   | label EN/GU, optional help, required, min (≥0), max               | `multipleOf: 0.01`; blank min → baked `0` |
| `percentage`     | label EN/GU, optional help, required                              | `minimum: 0`, `maximum: 100`              |
| `gender`         | label EN/GU, optional help, required                              | enum `M`/`F`/`OTHER`                      |
| `yesno`          | label EN/GU, optional help, required                              | boolean schema                            |
| `section-header` | label EN/GU, optional help                                        | display object schema; never required     |
| `info-panel`     | label EN/GU (primary content), **mandatory** help EN/GU           | display object schema; never required     |

No error-message editor in D2. No raw JSON. Field ID and widgetType remain
read-only.

### Authoring contract

- Pure modules: `readFieldConfiguration`, `validateFieldConfigurationDraft`,
  `updateFieldConfiguration` (→ `AuthoringResult`), dirty helpers.
- Discriminated TypeScript configurations by `widgetType` — never `any` or
  arbitrary property bags.
- Typed errors: `unsupported_property_editor`, `configuration_widget_mismatch`,
  `configuration_invalid`, `stale_editor_draft`.
- Apply runs integrity before/after, strict-clones, preserves selection and
  `previewFormData`, and never partially mutates on failure.

### UI drafts (not FormDefinition)

Editor drafts live in `AuthoringUiState.editorDrafts` only:

- Keystrokes do not mutate `FormDefinition`; live preview updates **after Apply**
- Cancel resets that field’s draft to committed values
- Selecting another row does not discard a dirty draft; returning restores it
- Locale switching preserves drafts; remove cleans that field’s draft;
  add/reorder preserve unrelated drafts
- Canvas rows show an “Unsaved changes” chip when dirty

### Constraint invariants

Apply never changes fieldId, widgetType/provenance, `ui:order`, progressive-step
membership, or bindings; never deletes unrelated bilingual/schema entries;
never inserts non-JSON values; never weakens baked widget invariants. When
tighter constraints make existing preview data invalid, the value is preserved
and a localized non-blocking inspector warning is shown — the embedded Renderer
remains the validation authority.

### Remaining deferred

The remaining **21** palette widgets stay pending (not addable). If a fixture
ever contains one, the inspector shows “Property editor not available in this
increment”. Server validation remains authoritative once HTTP wiring arrives.
§5 / auth / DST / deployment remain open.

### Tests (FB-D2)

`builder-d2-property-editing.test.ts` and `builder-d2-property-ui.test.tsx`
cover round-trips, bilingual/required/constraint rules, draft lifecycle,
preview warnings, typed failures, EN/GU axe, and StrictMode purity.

### Next increment

Remaining 21 palette widget templates/editors, drag-and-drop reordering,
progressive-step authoring, save/submit and validation/lifecycle API wiring —
still without claiming §5/auth/DST/deployment completion.

## FB-D2.1 — currency range, strict decimals, and stale drafts

FB-D2.1 is a focused hotfix on top of D2. It does not start D3.

1. **Currency effective range.** Blank `minimum` means the governed effective
   minimum is **0**. When `maximum` is present it must be
   `>= effectiveMinimum`, so `minimum="" maximum="-1"` and
   `minimum="5" maximum="4"` are rejected. The `range_invalid` issue is
   associated with the **Maximum** control. Impossible currency ranges cannot
   be committed. Fixed `type: number`, `minimum >= 0`, and `multipleOf: 0.01`
   remain.
2. **Strict JSON-decimal lexical admission.** Number/currency `minimum`,
   `maximum`, and `step` accept only a finite JSON-decimal grammar
   (`0`, `-1`, `0.5`, `10.25`, `1e3`, `-2.5E-2`) and reject `0x10`, `0b10`,
   `1_000`, `NaN`, `Infinity`, padded, and partial input. Step remains `> 0`.
3. **Genuine `stale_editor_draft`.** Every `EditorDraftEntry` carries an
   immutable committed `baseline` seeded on first draft creation. Apply
   supplies the accepted configuration plus that baseline; if the live
   committed configuration differs, Apply returns `stale_editor_draft` with
   no mutation. The UI retains the dirty draft, shows localized guidance, and
   Cancel rebases both draft and baseline. Ordinary add/reorder does not
   falsely stale unrelated drafts.

### Tests (FB-D2.1)

Unit and UI regressions for currency blank-min/`-1` maximum, strict decimal
lexemes, and the baseline/stale Apply → Cancel → re-Apply path.

### Next increment

**FB-D3** activates the Bilingual tab as a governed EN/GU workspace — still
without claiming §5/auth/DST/deployment completion.

## FB-D3 — governed Bilingual workspace

FB-D3 activates the existing Bilingual tab as a side-by-side EN/GU authoring
workspace. It does not start remaining templates, drag/drop, HTTP, auth, DST,
deployment, or Unit E.

### Coverage

Every currently governed user-visible string is editable in Bilingual order:

| Surface      | Location                                      | Rules                                |
| ------------ | --------------------------------------------- | ------------------------------------ |
| Field labels | `meta.bilingual.labels[fieldId]`              | Mandatory EN/GU                      |
| Field help   | `meta.bilingual.help[fieldId]`                | Optional pair (info-panel mandatory) |
| Field errors | `meta.bilingual.errors[fieldId]`              | Optional pair                        |
| Step labels  | `meta.progressiveSteps[].labelEn` / `labelGu` | Both mandatory                       |

Fields follow canonical `ui:order`. Steps follow `progressiveSteps` order.
No editing of fieldId, stepId, widgetType, schema, bindings, audit, or raw JSON.

### Shared draft architecture

One logical field draft (`editorDrafts[fieldId]`) holds label/help/error **and**
constraint strings. Property Inspector and Bilingual share that draft:

- Inspector label/help edits appear immediately in Bilingual
- Bilingual label/help/error edits appear in the Inspector
- Unsaved constraints (e.g. `maxLength`) survive Bilingual Apply
- Bilingual Apply commits only bilingual content via
  `updateFieldBilingualContent` — it does not apply or discard constraint drafts

Step label drafts live in a separate `stepEditorDrafts[stepId]` map. All drafts
remain outside `FormDefinition` and `previewFormData`, survive selection / tab /
locale / add / reorder, and are cleaned on field remove. Newly added fields
appear in Bilingual with their governed default pairs.

### Pure authoring contracts

Exported from `apps/form-builder/src/authoring/index.ts`:

- `readFieldBilingualContent` / `validateFieldBilingualDraft` /
  `updateFieldBilingualContent`
- `readStepBilingualContent` / `validateStepBilingualDraft` /
  `updateStepBilingualContent`
- `computeBilingualCompleteness` / `collectVisibleBilingualDrafts`

Rules: exact typed shapes; nonblank unpadded mandatory strings; optional
help/error pairs (both blank removes; one-sided invalid); info-panel help
mandatory; strict clone before mutation; integrity before and after; no silent
trim/repair/coercion; accessors must not escape as untyped exceptions.

### Completeness meter

Calculated from **visible draft state** (so incomplete unsaved work counts):

**Required pairs:** one label pair per field; info-panel help pair; one label
pair per progressive step.

**Optional help/error pairs:** ignored when both blank; active+incomplete when
one-sided; active+complete when both clean/nonblank.

Display: complete-pair count, active-pair total, and percentage
(`round(complete/active*100)`, or 100% when active is 0).

### Stale baselines

Field and step bilingual Apply use genuine D2.1-style baselines. If committed
bilingual content changed after draft creation, Apply returns
`stale_editor_draft`, retains the user draft, shows localized guidance, and
commits nothing. Cancel reloads current committed content into draft + baseline.
Add / reorder / selection / locale / unrelated field or constraint Apply do not
false-stale.

### UI and accessibility

`BilingualWorkspace` replaces the bilingual placeholder: heading, guidance,
completeness meter, field and step sections, side-by-side EN/GU columns,
per-row Apply/Cancel, Dirty/Complete/Incomplete chips, validation/stale alerts.
Unapplied values do not update canvas, preview, or step navigation. Builder
EN/GU locale changes chrome only.

Tabs: `tablist`/`tab`/`tabpanel`, roving `tabIndex`, ArrowLeft/Right, Home/End,
focus follows activation, unique IDs, ~44px targets, `aria-invalid` /
`aria-describedby`, `role="alert"` only for actionable validation/stale,
polite Apply/Cancel announcements.

### Tests (FB-D3)

`builder-d3-bilingual.test.ts` and `builder-d3-bilingual-ui.test.tsx` cover
admission, completeness, shared drafts, constraint survival, Apply/Cancel,
stale/false-stale, locale preservation, tab keyboard, axe EN/GU, and
announcements.

### Counts and remaining deferred

- **9** addable / **21** pending / **30** total
- Remaining 21 widget templates/editors, drag/drop, HTTP save/submit, auth,
  DST, deployment, Unit E, and §5 remain open

## FB-D3.1 — cross-editor isolation hotfix

FB-D3.1 corrects a blocking defect where one-sided Bilingual error drafts made
Property Inspector Apply fail on an invisible `errorGu` control. It does not
start D4.

### Corrected state model

- `FieldConfiguration` / `FieldConfigurationDraft` hold labels, help, required,
  and widget constraints only — **not** `errorEn`/`errorGu`
- `validateFieldConfigurationDraft` does not validate error pairs
- `updateFieldConfiguration` never writes or removes `meta.bilingual.errors`
- `EditorDraftEntry` adds typed `errorDraft` / `errorBaseline` plus independent
  `propertyShowValidation` / `propertyShowStaleGuidance` /
  `bilingualShowValidation` / `bilingualShowStaleGuidance`
- `patchFieldBilingual` routes labels/help to the shared property draft and
  errors to the separate error draft; `patchEditorDraft` cannot alter errors

### Isolation rules

- Invalid Property Apply affects only property validation/guidance
- Invalid Bilingual Apply affects only bilingual validation/guidance
- Bilingual Apply/Cancel preserves property constraint drafts and property
  validation state
- Property Apply/Cancel preserves incomplete bilingual error drafts and
  bilingual validation state
- Labels/help remain synchronized; focus targets always exist in the active
  surface (summary fallback otherwise)
- Tablist and locale group `aria-label` values use governed EN/GU messages

### Tests (FB-D3.1)

`builder-d3.1-isolation.test.ts` and `builder-d3.1-isolation-ui.test.tsx`

## FB-D3.1.1 — dirty-state isolation hotfix

FB-D3.1.1 splits dirty selectors so PropertyEditor no longer stays “Unsaved”
solely because of an incomplete Bilingual error draft.

| Selector                      | Meaning                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `isPropertyEditorDirty`       | Property draft vs baseline + property stale only           |
| `isFieldBilingualEditorDirty` | Labels/help/errors vs bilingual baseline + bilingual stale |
| `isFieldAnyDraftDirty`        | Union for canvas / overall field indication                |
| `isFieldEditorDirty`          | Deprecated alias of `isFieldAnyDraftDirty`                 |

Property Apply/Cancel enablement uses property dirty. Bilingual/step Apply/Cancel
use their surface-specific dirty. When only Bilingual work remains, the inspector
shows informational status (not `role="alert"`): “This field has unsaved changes
in the Bilingual tab.”

### Tests (FB-D3.1.1)

`builder-d3.1.1-dirty-isolation.test.ts` and
`builder-d3.1.1-dirty-isolation-ui.test.tsx`

## FB-D4 — progressive step-boundary authoring

FB-D4 activates the Steps tab for governed progressive-step structure authoring.
Progressive steps are ordered, contiguous boundaries over canonical `ui:order`.

### Builder integrity (contiguous-boundary rule)

When `progressiveSteps` is nonempty:

- every `ui:order` field appears exactly once across steps
- every step is nonempty
- concatenating `progressiveSteps[].fieldIds` exactly equals `ui:order`
- step IDs are unique, nonblank, and unpadded
- EN/GU step labels are complete
- no silent repair of inconsistent definitions

Violation of the concatenation rule throws `AuthoringError` with code
`inconsistent_step_boundaries`. Unit B public renderer admission rules and Unit C
are unchanged in this increment.

### Pure boundary operations

Exported from `authoring/index.ts` (implemented in `step-boundaries.ts`):

| Operation                     | Behaviour                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `enableProgressiveSteps`      | From `progressiveSteps=[]`, creates one step covering all `ui:order` fields (`step_N` + collision-safe suffix; governed EN/GU defaults) |
| `splitStepAfterField`         | Splits after an interior field; new step inserted immediately after; original labels/ID preserved                                       |
| `moveStepBoundary`            | Moves boundary earlier/later without emptying either step; identities/labels unchanged                                                  |
| `mergeStepBoundary`           | Previous absorbs next; previous identity/labels survive; blocks when removed step has unsaved bilingual draft                           |
| `getStepBoundaryCapabilities` | Capability matrix for UI disabled states                                                                                                |

All operations strict-clone JSON-safe state, run integrity before/after, return
`AuthoringResult`, preserve `previewFormData` / schema / uiSchema field entries /
provenance / bindings / audit, never partially mutate, never create empty steps,
never duplicate/drop fields, and never expose raw JSON.

Disable-progressive remains deferred (would need safe step-label draft preservation).

### Field authoring regressions

- Add inserts into the selected field’s step (or last step)
- Remove cannot empty a step
- Up/down field movement stays within its step
- Boundary authoring is the only D4 path for transferring fields between steps
- No pointer drag/drop

### Draft lifecycle

- Boundary movement preserves both step-label drafts (no false stale when labels unchanged)
- Split preserves the original step’s draft; creates no conflicting draft for the new step
- Merge blocks on dirty/stale/validation-visible removed-step draft (`step_has_unsaved_bilingual_changes`)
- Successful merge cleans removed step UI draft state
- Completeness meter gains/loses a required step-label pair when steps are added/removed

### Steps workspace UI

Replaces the Steps placeholder with ordered step cards, split-after controls on
eligible interior fields, and boundary controls (move earlier/later, merge).
Step labels remain edited in Bilingual; Steps provides a deep-link that activates
Bilingual and focuses the step label control.

### Preview remount

`PreviewPane` keys the embedded `FormRenderer` with `progressiveStructureKey`
(step IDs + field assignments only — not labels or form values). Structural
changes reset navigation predictably to step 1 while preserving `previewFormData`.
Label-only Bilingual Apply does not remount via this key.

### Typed errors

`progressive_steps_not_enabled`, `progressive_steps_already_enabled`,
`step_not_found`, `field_not_in_step`, `split_after_last_field`,
`boundary_not_found`, `boundary_move_would_empty_step`,
`step_has_unsaved_bilingual_changes`, `inconsistent_step_boundaries` — mapped to
localized EN/GU Builder copy without exposing definition content.

### Scope / counts (historical FB-D5; superseded by D8)

- At D5 completion: **13 addable / 17 pending / 30 total**
- At D9 completion: **18 addable / 12 pending / 30 total**
- At D10 completion: **20 addable / 10 pending / 30 total**
- At D12 completion: **24 addable / 6 pending / 30 total**
- Current (FB-D15): **28 addable / 2 pending / 30 total**
- Current (FB-D16): **29 addable / 1 pending / 30 total**
- Current (FB-D17): **30 addable / 0 pending / 30 total**
- At D8 completion: **16 addable / 14 pending / 30 total**
- No drag/drop, lifecycle Submit, auth, DST, deployment, or Unit E
- §5 remains open
- Palette pending closed at D17 (`page-break` is structural, not a field template)

### Tests (FB-D4)

`builder-d4-steps.test.ts` and `builder-d4-steps-ui.test.tsx`

## FB-D4.1 — progressive-step focus integrity and structure-key hotfix

FB-D4.1 corrects three defects without starting D5:

1. **Focus request identity.** `pendingFocusStep` is `{ requestId, stepId } | null`
   so repeating Split/Merge with the same surviving `stepId` still focuses.
2. **Preview focus arbitration.** Steps card focus is deferred with a cancellable
   `setTimeout(0)` so it wins after FormRenderer remount/heading effects.
   `document.activeElement` must be `dg20-builder-steps-card-${stepId}`.
   FormRenderer standalone heading-focus behaviour is unchanged.
3. **Collision-free `progressiveStructureKey`.** JSON serialization of ordered
   `[stepId, fieldIds]` tuples (or `{ kind: "single-page" }`) — unambiguous for
   IDs containing `:`, `,`, or `|`. Label-only changes do not alter the key.

English summary copy uses singular “1 step” / plural “N steps”.

### Tests (FB-D4.1)

`builder-d4.1-focus-preview.test.tsx` — StrictMode focus after remount;
PreviewPane remount/data/onChange; structure-key collisions.

## FB-D4.1.1 — monotonic focus sequence and boundary-move focus

FB-D4.1.1 fixes a sequence defect where clearing `pendingFocusStep` (e.g. after a
boundary move that previously left it null, or after a failure) caused the next
`requestId` to reuse `1`, so StepsWorkspace skipped focus while FormRenderer kept
the preview heading.

1. **`stepFocusRequestSequence`** — session-monotonic counter independent of
   `pendingFocusStep` nullability. Every successful Enable / Split / Move / Merge
   allocates `requestId = sequence + 1` and advances the sequence. Failures and
   clears never reset it.
2. **Boundary-move focus** — successful Move Earlier/Later focuses
   `previousStepId` via the same deferred authoring-focus path.
3. **Strict remount emission** — structural remount with unchanged controlled
   `formData` must emit exactly zero `onChange` calls.

### Tests (FB-D4.1.1)

Extended `builder-d4-steps.test.ts` (monotonic sequence) and
`builder-d4.1-focus-preview.test.tsx` (split→move→merge focus; zero remount
emissions).

## FB-D5 — citizen-field templates and property editors

FB-D5 extends the governed addable contract and Property/Bilingual draft model
for four core citizen fields. It does **not** start the remaining 17 templates,
Bindings workspace, drag/drop, HTTP, auth, DST, deployment, Unit E, or §5.

### Generalized addable registry

Authoritative symbols (single set — no duplicate registries):

- `ADDABLE_WIDGET_TYPES` / `AddableWidgetType`
- `ADDABLE_COUNT` / `PENDING_COUNT`
- `isAddableWidgetType`

Compatibility aliases `D1_*` remain. Counts after D5 were **13 addable / 17 pending /
30 total**; after D8: **16 addable / 14 pending / 30 total**; after D9:
**18 addable / 12 pending / 30 total**. All 30 palette
entries stay visible and searchable.

Builder integrity resolves `ui:widget` vs `ui:field` from the RJSF registry maps
(`dg20Widgets` / `dg20Fields`), matching C1 `rjsfKind` (not palette category alone).

### Exact templates

| Widget      | Binding     | Schema notes                                                                                   |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `email`     | `ui:widget` | `string` + `format: email`; no default `x-dg20`                                                |
| `full-name` | `ui:field`  | object `{en,gu}` required, `minLength: 1`, `additionalProperties: false`                       |
| `dob`       | `ui:widget` | `string` + `format: date`; no default ages                                                     |
| `pincode`   | `ui:field`  | object; `pincode` pattern `^[0-9]{6}$`; optional city/district members; required `["pincode"]` |

No schema titles; visible copy in `meta.bilingual`. No `ui:options` business
config. No add-time `formData` seeding.

### Property editors

- **email:** labels, optional help, required, “Require email verification”
  (default false). Apply writes `x-dg20.verifyEmail: true` or removes the key
  (and empty `x-dg20`).
- **dob:** labels, optional help, required, optional Minimum/Maximum age.
  Canonical nonnegative safe-integer strings only; blank = absent; `minAge <=
maxAge` (range error on Maximum age). Apply writes integer `x-dg20` ages.
- **full-name / pincode:** labels, optional help, required only. Apply
  preserves baked schema invariants. No service-provider / adapter config in
  FormDefinition.

Draft/stale behaviour reuses the D2/D3/D3.1 model (shared label/help drafts,
isolated error drafts, immutable baselines, `stale_editor_draft`).

### Preview boundary

Builder injects no HTTP, fetch, storage, or real adapters. Email verification,
full-name transliteration, and PIN enrichment may honestly show unavailable
without blocking authoring. Persisted preview shapes: email string; full-name
`{en,gu}`; dob `YYYY-MM-DD`; pincode `{pincode, cityCode?, districtCode?}`.

### Tests

- `builder-d5-citizen-fields.test.ts`
- `builder-d5-citizen-fields-ui.test.tsx`

Prior D1–D4 suites remain green with updated 13/17/30 counts.

### Explicitly still out of scope (D5)

Remaining 17 palette templates/editors, Bindings workspace, drag/drop, HTTP
save/validate/lifecycle, auth, DST, deployment, Unit E, §5 live-service work.

## FB-D5.1 — strict citizen-schema admission (no silent repair)

FB-D5.1 hardens email / full-name / dob / pincode without starting D6:

1. **`assertDefinitionIntegrity`** admits baked schema invariants per provenance
   widgetType (type/format/object shapes, PIN pattern, inner required,
   `additionalProperties: false`).
2. **`x-dg20` admission** distinguishes `absent` | `valid` | `invalid` with
   exact key sets (`verifyEmail` only for email; `minAge`/`maxAge` only for DOB).
   Malformed is never mapped to false/blank.
3. **Property Apply** rejects malformed citizen schemas with
   `inconsistent_definition` (no repair). Email/DOB Apply only writes canonical
   `x-dg20`; full-name/PIN Apply preserve the admitted schema structure.
4. Compatible unrelated JSON Schema keywords survive valid Apply.

Tests: `builder-d5.1-citizen-admission.test.ts` plus corrected Full-name/PIN
preview control assertions in `builder-d5-citizen-fields-ui.test.tsx`.

## FB-D5.1.1 — Full-name sibling emissions + exact composite membership

1. **FullNameWidget** EN/GU handlers emit using `enSnapshot`/`guSnapshot` (not
   lagging `current` props) so rapid sequential typing preserves both sides.
   Transliteration request/apply and auto-apply also use snapshots; manual edits
   still cancel pending suggestions.
2. **Composite admission** requires exact `properties` and `required` member sets
   for full-name `{en,gu}` and pincode `{pincode,cityCode,districtCode}` —
   nested data-model extras are rejected (not “compatible keywords”).
3. Unit A harness regressions cover rapid EN↔GU typing, clear-one/clear-both,
   external remount, stale transliteration, and StrictMode.

## FB-D6 — server-backed Form Definition validation

FB-D6 wires the Builder **Validate** action to the Unit C five-stage validation
endpoint. At D6 it did **not** yet implement Save draft, load, ETag, lifecycle
submission, authentication, remaining templates, Bindings authoring, or
drag/drop. (Save/load/ETag arrived in FB-D7.)

### Contract

- Port: `FormDefinitionValidationAdapter` under `apps/form-builder/src/validation/`
  (not `WidgetServicePorts`)
- HTTP: `POST ${baseUrl}/api/v1/form-definitions/validation`
- Default base URL: same-origin `/form-definition-service`
- Override: `VITE_FORM_DEFINITION_SERVICE_BASE_URL`
- Vite **dev** proxy: `/form-definition-service` →
  `VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET` (default `http://localhost:8080`)

### Security boundaries

- Integrity admission + strict JSON-safe clone before every adapter call
- Validation targets the **committed** `FormDefinition` only (not
  `previewFormData` or unsaved UI drafts)
- Strict `ValidationResult` admission (exact keys, ≤200 issues, severity
  consistency); malformed results become a generic failure
- No auth token invention, no browser storage, no transport retries
- Never display raw network/exception/HTTP-body text

### UI / state

- Explicit Validate only (`idle` → `validating` → `valid` | `invalid` | `failed`)
- One in-flight request; AbortController + monotonic sequence; stale ignored
- Unsaved Property/Bilingual/Step drafts (and validation-visible incomplete
  drafts) block Validate with localized guidance
- At D6, Save draft / Submit for approval remained disabled (Save enabled in D7)
- Issue `message` values are server-authored technical text; Builder chrome is EN/GU

Tests: `builder-d6-validation.test.ts`, `builder-d6-validation-ui.test.tsx`.

## FB-D6.1 — validation presentation, admission, and HTTP bounds

FB-D6.1 hardens D6 without Save/lifecycle/auth/templates:

1. **Valid advisories:** `valid:true` with warning/info issues shows a polite
   success+counts region and every issue in server order (not `role=alert`; no
   focus steal). Invalid keeps alert + focus and lists all severities.
2. **Exact admission:** dense `Array.prototype` issues only; reject extras,
   symbols, accessors, custom prototypes; return detached result objects.
3. **UTF-8 byte cap:** stream read with `Uint8Array.byteLength`; Content-Type
   must be JSON-compatible; Content-Length is early-reject only.
4. **Cancellation:** semantic definition equality preserves settled results;
   reference-unequal but deep-equal replacements do not abort.
5. Vite `loadEnv` loads `VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET` from the
   Builder app env files (dev proxy only).

## FB-D7 / D7.1 / D7.1.1 — draft persistence

FB-D7 enables Builder **Save draft** and **Load** against Unit C draft APIs.
It does **not** implement lifecycle Submit, authentication, DST, remaining
templates, Bindings authoring, or drag/drop.

### Completed

- Draft **create** (`POST`) and exact **load** (`GET`)
- Optimistic draft **PUT** with opaque in-memory **ETag** / If-Match
- Clone-first request/response admission (no hostile serialization)
- Operation-specific failure UX and retry surfaces
- Validation-match Save gate (`resultMatchesCurrentDefinition`)
- D7.1 / D7.1.1 hardenings: port-result re-admission, load races, draft-preserving
  save ack, HTTP zero-fetch for invalid requests

### Boundaries

- ETag stays opaque session binding — never stored in `FormDefinition`, DOM
  chrome, or browser storage
- Persistence targets the committed `FormDefinition` only
- No auth token invention; transport invents no credentials

Tests: `builder-d7-persistence*.ts(x)`, `builder-d7.1*.ts(x)`,
`builder-d7.1.1-persistence.test.ts`.

## FB-D8 — Aadhaar, Mobile OTP, Bank Account (accepted)

FB-D8 adds three controlled palette addables: `aadhaar`, `mobile-otp`,
`bank-account` (all `ui:field`). Counts at D8: **16 addable / 14 pending / 30 total**.

### Canonical templates

| Widget         | Binding    | Persisted shape (summary)                                                                                       |
| -------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| `aadhaar`      | `ui:field` | `{ referenceToken, identifierKind: AADHAAR\|VID, lastFour }`; no raw Aadhaar/VID; no `x-dg20`                   |
| `mobile-otp`   | `ui:field` | `{ mobileNumber, verified, verificationRef? }`; `x-dg20.otpChannels: ["sms"]` or absent                         |
| `bank-account` | `ui:field` | `{ accountNumber, ifsc, accountHolderName, verified, verificationRef? }`; required `verified` only; no `x-dg20` |

Never store OTP, challenge IDs, raw Aadhaar/VID, or adapter status in the
Form Definition.

### Schema admission

Dedicated citizen-schema admission (D5.1 pattern): inspect without accessors;
reject arrays/hostile prototypes/symbols/sparse required/duplicates/extra
governed members/malformed `x-dg20`; throw only typed
`AuthoringError("inconsistent_definition")`. Aadhaar and bank-account reject any
`x-dg20`. Mobile OTP admits absent `x-dg20` or exact `{ otpChannels: ["sms"] }`.

### OTP contract (client + Unit C)

Authoritative: `OtpChannel = "sms"` (lowercase JSON literal). Runtime defaults
missing channels to `["sms"]`; present values must be exactly dense `["sms"]`.
Unit C `StructuralSanityValidator` requires the same when `otpChannels` is
present on `mobile-otp`.

### Property editors

EN/GU label, optional paired help, required toggle. Mobile OTP shows SMS-only
informational copy (not an editable channel selector). Apply uses immutable
baseline / `stale_editor_draft`; preserves admitted schema and `previewFormData`.

### Preview

No real adapters in BuilderShell. Widgets may show governed unavailable states;
must not crash or leak sensitive values into Builder chrome.

### Remaining deferred

Lifecycle Submit, auth, DST, deployment, remaining 12 templates, Bindings,
drag/drop, Unit E, §5.

Tests: `builder-d8-identity-fields.test.ts`, `builder-d8-identity-fields-ui.test.tsx`,
plus OTP assertions in Unit A `a3-widgets.test.tsx` and Unit C
`FormDefinitionValidationPipelineTest`.

## FB-D9 — configured-add + dropdown-master / radio

FB-D9 introduces a **safe configured-add** workflow and adds `dropdown-master`
and `radio` (`ui:widget`). Counts: **18 addable / 12 pending / 30 total**.

### Configured-add contract

- Palette click opens an accessible dialog; FormDefinition is unchanged until Confirm
- Collects exact `masterListId` (nonblank, unpadded; never silently trimmed; never fetched)
- Cancel / Escape: zero definition mutations; focus returns to the palette control
- Confirm: atomic add with canonical `x-dg20: { masterListId }`
- Pending configured-add is UI-only (not FormDefinition / previewFormData / storage / URL)
- Blocks Validate/Save via `hasAnyUnsavedAuthoringDraft`; blocks conflicting
  add/remove/reorder/step mutations; Open Draft uses discard confirmation;
  session replacement clears pending state

### Templates / admission / editors

- Schema: `type: string`, no `enum`, exact `x-dg20.masterListId`
- Immediate-add widgets keep one-click behavior
- Property editors: labels, help, required, masterListId
- Unit C requires `masterListId` for `dropdown-master`, `radio`, and `multiselect`
  (Builder multiselect landed in FB-D10)

### Deferred (at D9)

multiselect, cascading-dropdown, Bindings, master-data HTTP, drag/drop,
lifecycle Submit, auth, DST, Unit E, §5.

Tests: `builder-d9-master-list.test.ts`, `builder-d9-master-list-ui.test.tsx`,
Unit C pipeline masterListId cases.

## FB-D9.1 — configured-add focus / modal containment hotfix

FB-D9.1 corrects typing focus loss, implements true modal containment
(`aria-modal` + background `inert` + Tab wrap), and preserves an active
configured-add draft when a second begin/add is attempted.

- Sequenced `pendingFocusConfiguredAdd` requests — patches never steal focus
- Invalid Confirm allocates a new focus request (repeatable)
- Second `beginConfiguredAdd` is ignored with `announceConfiguredAddBlocked`
- Open Draft remains gated by `hasAnyUnsavedAuthoringDraft`; the modal itself
  is not user-operable in the background (no evaluate/force-click bypass)

Counts at D9.1: **18 / 12 / 30**. **FB-D9.1 accepted** before FB-D10.

Tests: `builder-d9.1-configured-add-ui.test.tsx` (+ D9 reducer updates).

## FB-D10 — governed multiselect + cascading-dropdown

FB-D10 extends the D9/D9.1 configured-add architecture with `multiselect`
(`ui:widget`) and `cascading-dropdown` (`ui:field`). Counts:
**20 addable / 10 pending / 30 total**.

### Discriminated pending configured-add

- `dropdown-master` / `radio`: `masterListId`
- `multiselect`: `masterListId`, optional `minItems` / `maxItems` draft strings
- `cascading-dropdown`: `parentMasterListId`, `childMasterListId`
- Pending values remain UI-only; second begin stays blocked; Tab containment
  covers every new control; Cancel/Escape restores palette focus; Confirm adds
  atomically and focuses the new field; locale preserves drafts; session
  replacement clears pending; Validate/Save stay blocked while pending

### Canonical schemas / admission

- Multiselect: `type: array`, `items: { type: "string" }`, `uniqueItems: true`,
  `x-dg20: { masterListId }`, optional nonnegative safe-integer bounds (blank
  means absent; min ≤ max); no `enum`. **FB-D10.1:** when root-required, the
  schema must serialize an explicit `minItems >= 1` — JSON Schema, Builder
  validation/integrity, widget UX, and Unit C all enforce the same constraint;
  there is no virtual client-only minimum.
- Cascading: object with `parentCode` / `childCode` (`minLength: 1`),
  `required: ["parentCode"]`, `additionalProperties: false`,
  `x-dg20: { parentMasterListId, childMasterListId }` (IDs may be equal);
  no option labels in schema/formData
- List IDs: nonblank, exactly unpadded strings; never URLs; never network-checked
- Strict admission detects only (`AuthoringError("inconsistent_definition")`);
  never silently repairs

### Property editors / Unit C / preview

- Multiselect editor: labels, help, required, masterListId, minItems, maxItems
- Cascading editor: labels, help, required, parentMasterListId, childMasterListId
- Unit C: required list IDs; multiselect shape (`items` / `uniqueItems`) and
  required explicit `minItems >= 1`; cascading parent/child required; no HTTP lookup
- Without MasterDataAdapter: governed unavailable preview; zero fetch/storage;
  no invented options

### FB-D10.1 — required multiselect minItems alignment (accepted)

Required multiselect fields must carry an explicit JSON Schema `minItems >= 1`.
Missing `minItems` is invalid when root-required (Apply focuses `minItems` with
localized guidance). Configured-add remains `required=false`, so blank bounds
stay valid. Toggling required on requires the author to enter a valid minimum;
toggling required off does not silently remove an existing minimum.

**FB-D10.1 accepted** before FB-D11. Counts at D10/D10.1:
**20 addable / 10 pending / 30 total**.

Tests: `builder-d10-master-data.test.ts`, `builder-d10-master-data-ui.test.tsx`,
`builder-d10.1-multiselect-bounds.test.ts`, Unit C pipeline multiselect/cascading
cases.

## FB-D11 — address-block + photo-capture (accepted)

**FB-D11 accepted** before FB-D12. Immediate-add `ui:field` templates for
`address-block` and `photo-capture`. Counts at D11:
**22 addable / 8 pending / 30 total**.

### Address block (codes only)

- Schema: object with `stateCode` / `districtCode` / `talukaCode` /
  `villageCode` (`minLength: 1`); `required: ["stateCode"]`;
  `additionalProperties: false`
- Optional exact `x-dg20: { defaultStateCode }` (nonblank, unpadded; blank
  Apply removes `x-dg20`)
- Persists geography **codes only** — never labels, adapter status, or HTTP
- Property editor: labels, optional help, required, optional defaultStateCode
- Without `GeographyAdapter`: governed unavailable preview; zero fetch/storage

### Photo capture (reference only)

- Schema baked from Unit A constants: `objectRef`, MIME enum
  (`PHOTO_CAPTURE_ALLOWED_MIME_TYPES`), `sizeBytes` ≤ `PHOTO_CAPTURE_MAX_BYTES`,
  width/height within `PHOTO_CAPTURE_MIN_DIMENSION`–
  `PHOTO_CAPTURE_MAX_DIMENSION`, `scanStatus: "CLEAN"` only
- No `x-dg20`; MIME / size / dimensions / scan status are **not** editable
- Persists a CLEAN object-store **reference only** — never `File` / `Blob` /
  bytes / base64 / object URLs
- Policy copy is **provisional** (pending product/security confirmation)
- Without `FileStorageAdapter`: governed unavailable preview; zero fetch/storage;
  no file-upload invention in Builder

### Deferred (at D11; superseded by D12 counts)

Remaining 8 palette templates, Bindings, master-data / geography / object-store
HTTP, drag/drop, lifecycle Submit, auth, DST, Unit E, §5 — unchanged in kind
from prior increments (host adapters remain external).

Tests: `builder-d11-address-photo.test.ts`,
`builder-d11-address-photo-ui.test.tsx`.

## FB-D12 — doc-upload + digilocker-fetch (accepted)

**FB-D12 accepted** before FB-D13. Configured-add for `doc-upload` and
`digilocker-fetch` (`ui:field`). Counts at D12:
**24 addable / 6 pending / 30 total**.

### Document upload (configured-add)

- Dialog collects allowed MIME types (exact, one MIME per line; no silent
  trim/repair; trailing newline empty line ignored) and max file size bytes
  (`≤ DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES`)
- Confirm atomically adds with synchronized schema MIME enum /
  `sizeBytes.maximum` and `x-dg20: { allowedMimeTypes, maxFileSizeBytes }`
- Property Apply rewrites MIME enum, size max, and `x-dg20` together
- Persists CLEAN object-store **reference only** — never `File` / `Blob` /
  bytes / base64; no real file upload in Builder

### DigiLocker fetch (configured-add)

- Dialog requires an exact, nonblank, unpadded `digiLockerDocumentTypeCode`
- Confirm synchronizes schema `documentTypeCode.const` with
  `x-dg20.digiLockerDocumentTypeCode`
- Property Apply keeps const and `x-dg20` in lockstep; desync fails admission

### Adapters / production boundary

`FileStorageAdapter`, object-store, malware scanning, and `DigiLockerAdapter`
remain **external host ports**. Builder injects none, performs zero
fetch/storage, and does **not** claim production object-store, virus-scan, or
DigiLocker integration.

### Deferred (at D12; superseded by D13 counts)

Remaining 6 palette templates, Bindings, master-data / geography / object-store /
DigiLocker HTTP, drag/drop, lifecycle Submit, auth, DST, Unit E, §5 — unchanged
in kind from prior increments (host adapters remain external).

Tests: `builder-d12-doc-digilocker.test.ts`,
`builder-d12-doc-digilocker-ui.test.tsx`.

## FB-D13 — fee-field + signature-esign

FB-D13 extends configured-add with `fee-field` and immediate-add
`signature-esign` (`ui:field`). Current (FB-D13):
**26 addable / 4 pending / 30 total**.

### Fee field (configured-add)

- Dialog collects an exact, nonblank, unpadded `feeRuleId`
- Confirm atomically adds with synchronized schema `feeRuleId.const` and
  `x-dg20: { feeRuleId }`
- Property Apply keeps const and `x-dg20` in lockstep; desync fails admission
- Persisted quote shape requires `feeRuleId`, `contextRevision`, `currency`,
  `amountMinor`, `quoteRef` — never formatted currency text

### Signature / eSign (immediate-add)

- One-click add; no configured-add dialog; no `x-dg20`
- Property editor: labels, optional help, required toggle
- Persists opaque `contextRevision` + `signedArtefactRef` only — never
  signature bytes/base64/PDF/blob, tokens, or provider payloads
- Authoritative eSign CBB contract remains **provisional**

### Adapters / production boundary

`FeeComputationAdapter`, `ESignAdapter`, and host runtime contexts
(`feeContextRevision`, `eSignContextRevision`) remain **external**. Builder
injects none, performs zero fetch/storage, and does **not** claim production
fee-engine or eSign integration.

### Deferred (at D13; superseded by D14 counts)

Remaining 4 palette templates (`caf-prefill`, `family-repeater`,
`eligibility-declaration`, `page-break`), Bindings, master-data / geography /
object-store / DigiLocker / fee / eSign HTTP, drag/drop, lifecycle Submit,
auth, DST, Unit E, and §5. Fee/eSign adapters remain external — deferred work
in kind from prior increments (host adapters remain external).

Tests: `builder-d13-fee-esign.test.ts`, `builder-d13-fee-esign-ui.test.tsx`.

## FB-D14 — eligibility-declaration

**FB-D13 accepted** before FB-D14. Configured-add for `eligibility-declaration`
(`ui:field`). At FB-D14 completion: **27 addable / 3 pending / 30 total**
(superseded by FB-D15 counts).

### Eligibility declaration (configured-add)

- Dialog collects exact nonblank unpadded `declarationId` plus mandatory EN/GU
  declaration text (also nonblank/unpadded)
- Confirm atomically adds schema/uiSchema, provenance, bilingual labels, and
  mandatory bilingual help containing the declaration text
- Pending draft stays UI-only — never FormDefinition, previewFormData, URL,
  storage, or DOM attributes
- Property Apply synchronizes `declarationId.const` and `x-dg20.declarationId`;
  preserves exact governed four-property reference schema
- No root required toggle (`supportsRequired: false`); no receipt, locale,
  accepted, or provider controls in the editor
- Bilingual completeness treats eligibility help as mandatory (with info-panel)

### Adapters / production boundary

`ConsentLoggingAdapter` remains **external**. Builder preview shows the
declaration but keeps interaction unavailable without the adapter — no receipt
generation, no fabricated consent `onChange`, no HTTP/storage/timestamps.
Does **not** claim production DPDP/consent logging readiness.

### Deferred (at D14; superseded by D15 counts)

Remaining 3 palette templates (`caf-prefill`, `family-repeater`, `page-break`),
Bindings, master-data / geography / object-store / DigiLocker / fee / eSign /
consent HTTP, drag/drop, lifecycle Submit, auth, DST, Unit E, and §5 —
unchanged in kind from prior increments (host adapters remain external).

Tests: `builder-d14-eligibility.test.ts`,
`builder-d14-eligibility-ui.test.tsx`.

## FB-D15 — caf-prefill + Bindings workspace

**FB-D14 accepted** before FB-D15. Configured-add for `caf-prefill` (`ui:field`)
plus Bindings workspace authoring. Current (FB-D15):
**28 addable / 2 pending / 30 total**.

### CAF prefill (configured-add)

- Dialog collects exact nonblank unpadded `cafAttribute` plus strict
  JSON-decimal `confidenceMin` in `[0, 1]` (rejects hex, separators, NaN,
  Infinity, padding, out of range)
- Confirm atomically adds schema/uiSchema, provenance, bilingual labels, and
  exactly one `PrefillBinding` `{ fieldId, cafAttribute, confidenceMin }` in
  `meta.prefillBindings`
- Attribute/confidence live only in bindings meta — never schema, uiSchema, or
  `x-dg20`
- Canonical object schema: `{ value` (string minLength 1), `source: CAF|OVERRIDE` };
  `additionalProperties: false`; no `x-dg20`

### Bindings workspace

- Visible CAF rows follow canvas/`ui:order`; draft Apply / Cancel / Remove with
  stale-baseline protection
- Property / Bilingual / Binding drafts are isolated; unsaved binding drafts
  set `hasAnyUnsavedAuthoringDraft` and block Validate
- Field removal and session replace clear obsolete binding drafts

### Adapters / production boundary

CAF / Golden Record adapters remain **external**. Builder preview renders the
caf-prefill chrome from definition + bindings but does not invent CAF values,
fetch, or claim production prefill readiness.

### Deferred

Remaining 2 palette templates (`family-repeater`, `page-break`), drag/drop,
lifecycle Submit, auth, DST, Unit E, and §5 — host adapters remain external
(superseded by FB-D16 for `family-repeater`).

Tests: `builder-d15-caf-prefill.test.ts`,
`builder-d15-caf-prefill-ui.test.tsx`.

## FB-D16 — Family Repeater authoring

**FB-D15 accepted** before FB-D16. Governed nested member authoring for
`family-repeater`. Current (FB-D16): **29 addable / 1 pending / 30 total**.

### Nested member palette (Builder-only)

`FAMILY_MEMBER_WIDGET_TYPES`: text-short, text-long, number, currency-inr,
percentage, email, dob, gender, yesno. Not inferred from palette category.
Server does **not** impose this whitelist.

### Canonical repeater shape

- Root: `type: array`, `items` object with nonempty `properties`,
  `additionalProperties: false`, required `maxItems` 1..20, optional `minItems`
  0..max; no root `x-dg20`; `ui:field: "family-repeater"` + `uiSchema.items`
  exact child coverage
- Nested paths: `root[].member` with FieldPathEscaper-compatible escaping

### Authoring

- Configured-add: min/max + initial member widget/labels/required
- Pure ops: `addFamilyMember` / `removeFamilyMember` / `moveFamilyMember` /
  `updateFamilyRepeaterConfiguration` with stale baselines
- Last member cannot be removed; lowering max below preview row count blocked;
  raising min does not autofill rows

### Unit C

Strengthened `StructuralSanityValidator.validateFamilyRepeaters` + pipeline
tests. No DB migration.

### Deferred

Remaining at D16: 1 palette entry (`page-break`), drag/drop, lifecycle Submit,
auth, DST, Unit E, and §5 (superseded by FB-D17 for `page-break`).

Tests: `builder-d16-family-repeater.test.ts`,
`builder-d16-family-repeater-ui.test.tsx`, `builder-d16-smoke.test.ts`.

## FB-D17 — Page Break as progressive-step boundary action

FB-D17 closes palette pending. **page-break is not a field template** — it is a
structural create-boundary action that mutates only `meta.progressiveSteps`.

### Capability model

- `FIELD_ADDABLE_WIDGET_TYPES` (29) — schema/provenance templates
- `STRUCTURAL_ADDABLE_WIDGET_TYPES` (`page-break` only)
- `ADDABLE_COUNT = 30`, `PENDING_COUNT = 0`, `PALETTE_WIDGET_COUNT = 30`
- `isAddableWidgetType('page-break') === true`
- `getAuthoringTemplate('page-break') === undefined`
- `addField(state, 'page-break')` → `structural_widget_requires_boundary_action`

### Authoring contract

- Eligible boundaries: every `ui:order` field except the last (single-page), or
  every field except the last of each progressive step
- Single-page: atomic enable + split (initial step uses governed “Step 1” /
  “પગલું 1”; new step uses user EN/GU)
- Progressive: split existing step; preserve existing label; new step uses
  user EN/GU
- Zero mutation of jsonSchema / uiSchema / provenance / bilingual / bindings /
  audit / previewFormData
- Pending dialog blocks Validate / Save / Open Draft; Cancel/Escape zero mutation
- Successful creation invalidates prior validation match and focuses the new
  Steps card (Steps tab)

### Legacy compatibility

Externally loaded definitions with a literal `ui:field: "page-break"` field
remain readable via Unit A `PageBreakField`. Builder does **not** mint new
literal page-break fields and does **not** auto-convert them into
`progressiveSteps`. Inspector shows localized legacy guidance.

### Deferred

Drag/drop, lifecycle Submit, auth, DST, Unit E, and §5.

Tests: `builder-d17-page-break.test.ts`, `builder-d17-page-break-ui.test.tsx`;
browser script `scripts/d17-browser-verify.mjs`.
