# Unit B package-level acceptance (FB-B6 / B6.1)

## Service / fixture

| Item        | Value                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| Name        | Representative Income Certificate acceptance fixture                     |
| `serviceId` | `income-certificate-representative-acceptance`                           |
| `version`   | `1`                                                                      |
| `status`    | `published`                                                              |
| Location    | `packages/form-renderer/acceptance/representative-income-certificate.ts` |
| Public API  | **Not exported** from `@dg20/form-renderer`                              |
| Kind        | **Representative** (not authoritative)                                   |
| Runtime     | **Deeply frozen** JSON-safe singleton (`deepFreezeJsonSafe`)             |

## Authoritative vs representative

**Representative.** A read-only search of `/Users/sameerkhanna/Documents/Projects/DG2.0`
found **no** authoritative, versioned DG Service Catalogue / DST-approved
`FormDefinition` with traceable production provenance suitable for §5 live
acceptance.

Existing `income-certificate-sample` test fixtures elsewhere are **not** treated
as authoritative.

This fixture is **not** an approved production DG form. Package-level technical
acceptance of `@dg20/form-renderer` is complete only after **FB-B6.1**. Design-spec
**§5 live real-service acceptance remains pending**.

### Provenance

| Claim                                         | Status                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| Service Catalogue / DST production definition | **Absent**                                                               |
| Portal / backend published JSON artefact      | **Absent** in this monorepo                                              |
| Authoritative version lineage                 | **None**                                                                 |
| Fixture author                                | Form-builder acceptance harness (`audit.approvedBy: not-a-dst-approval`) |

## Definition summary

### Steps (3 progressive)

| Index | `stepId`      | EN label    | GU label | Fields                                                                               |
| ----- | ------------- | ----------- | -------- | ------------------------------------------------------------------------------------ |
| 0     | `identity`    | Identity    | ઓળખ      | `section_identity`, `applicant_name`, `gender`, `caf_father_name`, `caf_mother_name` |
| 1     | `household`   | Household   | પરિવાર   | `section_household`, `household_size`, `contact_email`, `annual_income`              |
| 2     | `declaration` | Declaration | ઘોષણા    | `section_declaration`, `purpose_statement`, `agree_terms`                            |

Every root `jsonSchema.properties` key is assigned to exactly one step.

### Fields, widgets, constraints

| Field                 | Widget / field ID | Schema notes                                                                            |
| --------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `section_identity`    | `section-header`  | Empty object chrome (not data-producing)                                                |
| `applicant_name`      | `text-short`      | required; `minLength` 1; `maxLength` 120                                                |
| `gender`              | `gender`          | required; enum `M` \| `F` \| `OTHER`                                                    |
| `caf_father_name`     | `caf-prefill`     | required `{ value` (nonblank), `source: CAF\|OVERRIDE` }; `additionalProperties: false` |
| `caf_mother_name`     | `caf-prefill`     | same CAF object schema                                                                  |
| `section_household`   | `section-header`  | Empty object chrome (not data-producing)                                                |
| `household_size`      | `number`          | required; integer 1–30                                                                  |
| `contact_email`       | `email`           | required; `format: email`; `maxLength` 254                                              |
| `annual_income`       | `number`          | required; integer 0–10_000_000                                                          |
| `section_declaration` | `section-header`  | Empty object chrome (not data-producing)                                                |
| `purpose_statement`   | `text-long`       | required; `minLength` 10; `maxLength` 500                                               |
| `agree_terms`         | `yesno`           | required; `const: true`                                                                 |

**Required list note:** these are **representative acceptance constraints** for the
technical journey (core applicant, household/income, purpose, declaration). They
are **not** approved Income Certificate business policy.

JSON Schema root/property `title` values are **omitted** so RJSF cannot surface
English-only schema titles in Gujarati mode. Visible field/section copy comes
from `meta.bilingual` only.

No `ui:options` business configuration. No backend/provider-specific payloads.
Palette provenance is complete. The published object is deeply frozen at module
load.

### CAF bindings

| Field             | `cafAttribute`            | `confidenceMin` | Harness outcome                      |
| ----------------- | ------------------------- | --------------- | ------------------------------------ |
| `caf_father_name` | `goldenRecord.fatherName` | 0.8             | Accepted CAF (`source: "CAF"`)       |
| `caf_mother_name` | `goldenRecord.motherName` | 0.8             | Below confidence → manual `OVERRIDE` |

Synthetic in-memory adapters only — **no** real CAF endpoint.

## Acceptance matrix

| Area                                                     | Automated coverage                              |
| -------------------------------------------------------- | ----------------------------------------------- |
| CAF object schema admission/validation                   | `b6.1-acceptance-integrity.test.ts`             |
| Deep freeze / mutation resistance                        | `b6.1-acceptance-integrity.test.ts`             |
| No schema titles                                         | `b6.1-acceptance-integrity.test.ts`             |
| Fresh session E2E (exact autosave order + data boundary) | `b6-unit-b-acceptance.test.tsx` — fresh session |
| Resume session E2E                                       | same file — resume session                      |
| Validation / Finish redirect / edit clears guidance      | same file — validation and failure              |
| Autosave failure + Retry                                 | same file                                       |
| Stale resume ignored                                     | same file                                       |
| StrictMode single host operations                        | same file                                       |
| Axe EN/GU, unique IDs, `aria-current`, loading/failure   | same file — accessibility                       |
| Storybook surfaces (EN / GU / resumed)                   | `UnitBAcceptance.stories.tsx`                   |

### Fresh-session results (automated)

Proven by the fresh-session test:

1. Resume `not_found` before CAF widgets mount
2. CAF only after resume settles
3. Accepted CAF emits `{ value, source: "CAF" }`
4. Below-confidence permits manual `OVERRIDE` (not CAF-tagged)
5. EN→GU→EN: Gujarati labels/help present; representative English labels/help
   absent; citizen-entered values may remain Latin script; no CAF refetch /
   autosave / submit
6. Invalid Next stays on step; no autosave
7. Changed validated Next exact order:
   `onChange` → `host_echo` → `saving` → `saveProgress` → `saved` → `onStepChange`
   (no `saveProgress` before host echo; no navigation before save success)
8. Back preserves data; no autosave
9. Returning to resolved non-indexed CAF uses session cache
10. Submit only after full-schema validation
11. `onSubmit` payload has **exactly** the `formData` key
12. Submitted / autosaved `formData` contains **exactly** the data-producing
    field keys (no section-header fields); no confidence / CAF attributes /
    cache / navigation / signals / adapter errors / resume revision
13. Journey does not call `fetch` or `localStorage` / `sessionStorage`
    get/set/remove/clear

### Resume-session results (automated)

- Non-final checkpoint restores correct next step
- Restored data admitted through existing resume protections
- Restored CAF/OVERRIDE → zero CAF calls for those fields
- No load-time `onChange` when controlled data already equals restored data
- Next successful navigation autosaves complete restored-and-edited form with
  exact data-producing keys
- Journey finishes with one valid submission
- Resume never triggers autosave or `onStepChange`

### Security / data-minimization checks

- Harness spies prove no `fetch` and no Storage get/set/remove/clear
- Exact key equality for submit and autosave payloads
- Autosave failure UI does not surface raw adapter error text
- Acceptance fixture omitted from package `exports` / production `files`

## Known limitations

- Fixture is representative only — not DST/catalogue-approved
- No live portal, backend, or real CAF/provider integration
- Accessibility checks use axe + structural assertions; **not** a WCAG certification
- Storybook uses synthetic in-memory adapters only

## Package-level vs §5 live acceptance

| Layer                                                                   | Status after FB-B6.1                                                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **1. Package-level technical acceptance**                               | **Complete** (B6 + B6.1 integrity hotfix) against the representative frozen fixture                 |
| **2. Live real-service / portal / backend acceptance (design-spec §5)** | **Remains pending** until an authoritative published service definition and host integrations exist |

Do not claim the representative fixture is an approved production DG form.
Do not claim WCAG certification or production-service approval from this increment.
