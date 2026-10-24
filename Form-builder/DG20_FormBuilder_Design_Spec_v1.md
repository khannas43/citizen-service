# DG 2.0 — Form Builder & Renderer Design Specification

**Version:** 1.0 (baseline)
**Status:** Design locked for build. Palette locked as v1 baseline; refine during build.
**Owner:** Solution Architecture (MagicSword)
**Consumers:** Cursor + Claude CLI (implementation), TSD Section 3.2.3 (bid narrative)
**Supersedes:** Form.io (Community) — removed in TechStack v4.8 (OSL-3.0 copyleft + network-use trigger; also required MongoDB, now removed).

---

## 0. Purpose & scope

This document specifies the design for the DG 2.0 **Form Builder** (department-facing, design-time) and **Form Renderer** (citizen-facing, runtime), replacing the removed Form.io dependency with a custom build on **react-jsonschema-form (RJSF, Apache-2.0)**.

It is a build specification. It is deliberately precise enough to hand to an agentic coding tool as the source of truth. It does **not** cover: the Service Catalogue Service, the Workflow Designer (Camunda/bpmn-js), the Integration Hub, or the Payment/Notification config — those are separate 3.2.3 deliverables that the Form Builder *binds to* but does not implement.

### In scope
- Runtime form renderer (RJSF-based) serving all 500+ service forms.
- A library of ~28 government-specific form field widgets.
- A design-time Form Builder SPA (palette-constrained, no free-canvas).
- Schema persistence (PostgreSQL 16 JSONB), immutable versioning, server-side validation.
- Governance wiring: bindings to workflow / integration / CAF pre-fill, and DST approval-queue integration.

### Out of scope (bound, not built here)
- Workflow authoring (Camunda 8 + bpmn-js).
- Integration adapter implementation (Integration Hub).
- Fee calculation engine, notification templating.
- Master-data management (the Form Builder *reads* master-data lists; it does not manage them).

---

## 1. Architectural principles

1. **One contract, four units.** A single object — the **Form Definition** — is read and written by every unit. Renderer, builder-preview, validator, and approval queue all operate on it.
2. **Render once.** The runtime Renderer is embedded as the live-preview pane inside the Builder. There is exactly one rendering path. What a department designs is byte-identical to what a citizen sees.
3. **Controlled vocabulary, not free canvas.** Departments compose from ~28 approved field types. They cannot author arbitrary fields. This is the single most important scope-control decision — it converts a person-years generic-builder problem into an ~8–11 person-month assembly problem.
4. **Compliance by construction.** Each widget bakes in its own validation, masking, accessibility, and bilingual scaffolding. A department *cannot* misconfigure an Aadhaar field to be unmasked, because masking is a property of the widget type, not a per-instance setting.
5. **Open standard, no lock-in.** Form definitions are JSON Schema (draft 2020-12) + RJSF uiSchema — a published open standard, portable, human-auditable, government-owned. No proprietary vendor schema format.
6. **Client and server share one validation source.** The same JSON Schema validates in the browser (RJSF) and on the server (submission). No divergent validation logic.
7. **Immutable versions.** Form Definitions are versioned immutably (per DR-023). In-flight citizen applications retain their start version; new applications use the latest published version.

### Layout-control decision (v1)
**v1 scope: fields + order only.** Departments select fields from the palette and order them (including step boundaries for progressive profiling). They do **not** control columns/grid/tabs. Layouts are fixed, responsive, and accessibility-tested once, centrally. This is the smaller and safer build.
**Extension seam:** if layout control is later approved, it plugs into the *layout-primitives* palette group (§4.6) plus a grid-container widget, without touching the other 25 widgets.

---

## 2. The Form Definition contract

The canonical object. Stored as JSONB, keyed `(serviceId, version)`.

```jsonc
FormDefinition {
  "serviceId": "string",          // FK to Service Catalogue
  "version": "integer",           // immutable once published (DR-023)
  "status": "draft | submitted | approved | published | retired",
  "jsonSchema": { /* JSON Schema draft 2020-12 — data shape + validation */ },
  "uiSchema":   { /* RJSF uiSchema — widget selection + field order ONLY */ },
  "meta": {
    "paletteProvenance": [        // enforces the controlled vocabulary, server-side
      { "fieldId": "string", "widgetType": "string" }  // widgetType MUST be in palette registry
    ],
    "bilingual": {                // EN + GU for every user-visible string
      "labels":  { "fieldId": { "en": "string", "gu": "string" } },
      "help":    { "fieldId": { "en": "string", "gu": "string" } },
      "errors":  { "fieldId": { "en": "string", "gu": "string" } }
    },
    "prefillBindings": [          // CAF / Golden Record pre-fill (SI-3.2.1-17)
      { "fieldId": "string", "cafAttribute": "string", "confidenceMin": "number" }
    ],
    "integrationBindings": [      // field value fed to / from an Integration Hub adapter
      { "fieldId": "string", "adapterId": "string", "param": "string", "direction": "in|out" }
    ],
    "workflowBindings": [         // field surfaced at a workflow stage
      { "fieldId": "string", "stage": "string" }
    ],
    "progressiveSteps": [         // ordered step boundaries for multi-step forms
      { "stepId": "string", "labelEn": "string", "labelGu": "string", "fieldIds": ["string"] }
    ]
  },
  "audit": {
    "createdBy": "string", "createdAt": "iso8601",
    "submittedBy": "string", "approvedBy": "string", "publishedAt": "iso8601"
  }
}
```

**Design Register entry (propose to add):**
> **DR-0xx:** The Form Definition is the single source of truth for a service's form (schema + UI + governance metadata). No form fields, validation, or field-level bindings exist anywhere outside it. Mirrors DR-019 (Service Catalogue as SSOT for service metadata).

---

## 3. Unit decomposition

| Unit | Name | Responsibility | Risk | Reused by |
|------|------|----------------|------|-----------|
| **A** | Widget Library | ~28 govt RJSF widgets; validation, bilingual, a11y baked in | Low | Renderer + Builder preview |
| **B** | Renderer | FormDefinition → working citizen form; CAF pre-fill; EN/GU toggle | Low | All 500+ forms; Builder preview |
| **C** | Store + Validator | JSONB persistence; immutable versioning; server-side validator + linter | Medium | — |
| **D** | Builder SPA | Palette → compose → live preview → emit FormDefinition | High (net-new) | — |
| **E** | Governance wiring | Bindings (workflow/integration/prefill); DST approval-queue integration | Medium | — |

**Critical dependency:** D embeds B as its preview pane. Build B before D.

---

## 4. Field palette (v1 baseline — LOCKED)

~28 widget types in 6 groups. Each is a pre-built RJSF widget. The **type's** behaviour (masking, validation rules, a11y) is fixed and not exposed to departments. Only **per-instance config** (label, required flag, help text, bindings, which master-data list) is department-configurable.

Notation per widget: `id` · behaviour/validation baked in · per-instance config exposed.

### 4.1 Identity & citizen data (CAF-linked)
| id | Baked-in behaviour | Per-instance config |
|----|--------------------|---------------------|
| `aadhaar` | 12-digit / VID; Verhoeff checksum; always masked; never stored raw (ref token) | label, required |
| `mobile-otp` | 10-digit; OTP verify via Notification service; verified-state stored | label, required, OTP channel(s) |
| `email` | RFC-5322; optional verify link | label, required, verify on/off |
| `full-name` | EN + GU transliteration pair | label, required |
| `dob` | Date; age derivation; min/max age gate | label, required, min/max age |
| `gender` | Fixed enum (M/F/Other per govt standard) | label, required |
| `caf-prefill` | Binds to a Golden Record attribute; renders pre-fill indicator + edit/override (SI-3.2.1-17) | label, cafAttribute, confidenceMin |

### 4.2 Address
| id | Baked-in behaviour | Per-instance config |
|----|--------------------|---------------------|
| `address-block` | State→District→Taluka→Village cascade from master-data | label, required, default state |
| `pincode` | 6-digit; auto-fills city/district | label, required |

### 4.3 Documents
| id | Baked-in behaviour | Per-instance config |
|----|--------------------|---------------------|
| `doc-upload` | Type-restricted, size-capped, virus-scan hook, object-store ref | label, required, allowed types, max size |
| `digilocker-fetch` | Pulls issued doc via DigiLocker; stores issuer-signed ref | label, required, doc type |
| `photo-capture` | Camera/upload; dimension + size constraints | label, required |

### 4.4 Choice & structured input
| id | Baked-in behaviour | Per-instance config |
|----|--------------------|---------------------|
| `dropdown-master` | Options from a referenced master-data list (NOT free-typed) | label, required, master-list id |
| `radio` | Single select | label, required, master-list id |
| `multiselect` | Multiple select | label, required, master-list id, min/max |
| `yesno` | Boolean | label, required |
| `cascading-dropdown` | Parent→child dependent lists from master-data | label, required, parent+child list ids |

### 4.5 Free & numeric input
| id | Baked-in behaviour | Per-instance config |
|----|--------------------|---------------------|
| `text-short` | Single line; regex-constrained | label, required, regex, max len |
| `text-long` | Multi-line | label, required, max len |
| `number` | Numeric; min/max/step | label, required, min, max, step |
| `currency-inr` | ₹; 2-decimal; non-negative | label, required, min, max |
| `percentage` | 0–100; step | label, required |

### 4.6 Government-specific composites & layout primitives
| id | Baked-in behaviour | Per-instance config |
|----|--------------------|---------------------|
| `bank-account` | IFSC-validated; account-name verify hook | label, required |
| `family-repeater` | Add-N dependents; each row is a sub-form | label, member fields, min/max rows |
| `eligibility-declaration` | Consent-linked checkbox; DPDP-logged | label, declaration text (EN/GU) |
| `fee-field` | Binds to fee engine; read-only computed | label, fee rule id |
| `signature-esign` | Triggers eSign flow; stores signed artefact ref | label, required |
| `section-header` | Groups fields visually; no data | label (EN/GU) |
| `info-panel` | Static help/notice; no data | content (EN/GU) |
| `page-break` | Progressive-profiling step boundary | step label (EN/GU) |

> **Palette count is a v1 baseline.** Locked for build start. Expected to move as it is pressure-tested against real DG service forms during build. Heavier items (`family-repeater`, `cascading-dropdown`) may split or merge. Any change to the palette registry is a governed change (new widget must ship with validation + bilingual + a11y + tests before it enters the registry).

---

## 5. Renderer design (Unit B)

- **Input:** a published `FormDefinition`.
- **Engine:** RJSF with a custom widget/field/template registry mapping each palette `widgetType` → its widget component.
- **Bilingual:** EN/GU toggle; all strings resolved from `meta.bilingual`; no hard-coded user-visible text.
- **CAF pre-fill:** on load, `prefillBindings` resolved against Golden Record; pre-filled fields show the pre-fill indicator with edit/override (SI-3.2.1-17); confidence below `confidenceMin` → field left blank + flagged for entry.
- **Progressive profiling:** `meta.progressiveSteps` drives multi-step rendering with per-step validation; auto-save between steps.
- **Validation:** RJSF validates against `jsonSchema` client-side. The identical schema re-validates server-side on submit.
- **Accessibility:** WCAG 2.1 AA. Tested once per widget, centrally (fixed layouts make this tractable).

**Acceptance:** one real DG service form (chosen from the 500+) renders end-to-end — bilingual, CAF-prefilled, multi-step, validating, submitting — before the Builder is started.

---

## 6. Store + Validator design (Unit C)

**Persistence**
- `FormDefinition` stored as JSONB in PostgreSQL 16, keyed `(serviceId, version)`.
- Published versions immutable (DR-023). Edits create a new draft version.
- In-flight applications reference the version they started under.

**Server-side validation pipeline (on every save/submit)**
1. **JSON Schema meta-validation** — `jsonSchema` is itself valid draft 2020-12.
2. **Palette-provenance check** — every field's `widgetType` exists in the server-side palette registry. Rejects any field not from the approved vocabulary (this is what stops a tampered client injecting arbitrary fields).
3. **Bilingual completeness** — every user-visible field has both EN and GU strings.
4. **Binding integrity** — every `prefill/integration/workflow` binding references a field that exists; no orphans.
5. **Structural sanity** — required-field logic coherent; progressive steps cover all fields exactly once; no duplicate fieldIds.

**Publish gate:** draft → submitted → (DST approval queue) → approved → published. Only `published` definitions are renderable to citizens.

---

## 7. Builder SPA design (Unit D)

Single-screen, three-pane. No JSON is ever shown to the department user — JSON is the *output*, emitted on save.

```
┌──────────────┬──────────────────────┬─────────────────┐
│   PALETTE    │     FORM CANVAS      │  LIVE PREVIEW    │
│ 28 types,    │ ordered field list;  │ embedded         │
│ grouped,     │ drag to reorder;     │ Renderer (Unit B)│
│ searchable   │ click a field to     │ of current def;  │
│              │ open config panel    │ EN/GU toggle;    │
│              │                      │ fill-test mode   │
└──────────────┴──────────────────────┴─────────────────┘
 Tabs below canvas:
 [Bindings] [Bilingual] [Steps]   Actions: [Validate] [Save draft] [Submit for DST approval]
```

**Interaction model**
1. Drag a palette item onto the canvas → appears as a configurable row.
2. Click the row → side config panel exposes only that widget's per-instance config (§4).
3. Preview pane re-renders live via the embedded Renderer.
4. `[Bindings]` tab: wire CAF pre-fill, integration params, workflow stages.
5. `[Bilingual]` tab: side-by-side EN/GU editor for all strings; completeness meter.
6. `[Steps]` tab: define progressive-profiling step boundaries.
7. `[Validate]` runs the same server-side pipeline (§6) and surfaces errors inline.
8. `[Submit for DST approval]` freezes the draft and pushes to the approval queue.

**Constraint enforced in UI:** the palette is the only way to add a field. There is no "custom field" / "raw JSON" escape hatch. This is intentional and must not be added.

---

## 8. Build sequence (for Cursor + Claude CLI)

Each increment is self-contained and independently testable. Do not start an increment before the previous one's acceptance passes.

1. **Widget Library (A)** — scaffold all 28 widgets from §4; each with baked-in validation, bilingual props, a11y attributes, and a Storybook + unit-test harness. *Acceptance:* every widget renders and validates in isolation; a11y checks pass.
2. **Renderer (B)** — FormDefinition loader, RJSF registry, theme, CAF pre-fill hooks, EN/GU toggle, progressive steps. *Acceptance:* one real service form renders end-to-end (§5).
3. **Store + Validator (C)** — JSONB persistence, immutable versioning, 5-stage server-side validation pipeline (§6). *Acceptance:* round-trip save/load; each validation stage rejects a crafted bad input.
4. **Builder SPA (D)** — three-pane UI embedding B as preview. *Acceptance:* a non-technical user builds a 10-field bilingual multi-step form from the palette and submits it, with zero JSON exposure.
5. **Governance wiring (E)** — bindings + DST approval-queue integration. *Acceptance:* a submitted form flows through approve → publish → renders to a citizen at the published version.

---

## 9. Effort estimate (revised line items)

Replaces the buried estimate (Form Builder was folded into SI-3.2.1-17 pre-fill components, which only covered renderer widgets).

| ID | Item | PD |
|----|------|-----|
| FB-1 | Widget library — 28 govt RJSF widgets (bilingual, a11y) | 45–60 |
| FB-2 | Renderer + FormDefinition contract + CAF pre-fill hooks | 25–35 |
| FB-3 | Schema store, immutable versioning, server-side validator + linter | 20–30 |
| FB-4 | Builder SPA (palette-constrained, 3-pane, live preview) | 55–75 |
| FB-5 | Governance wiring (bindings + DST approval integration) | 20–30 |
| | **Form Builder subtotal** | **165–230 PD (~8–11 person-months)** |

**Bid-defensible point:** 3.2.3 notes flagged a *generic* self-service form builder as a 6–12 person-year build. The palette constraint (§1.3, §4) is what closes the gap to ~8–11 person-months. That constraint is the number to defend.

---

## 10. Bid narrative framing (for TSD 3.2.3)

Frame the custom builder as a **deliberate sovereignty + compliance decision**, not a gap left by dropping Form.io:

- DG 2.0 uses **open-standard JSON Schema** — no proprietary vendor schema format, no lock-in.
- Government **owns the form definitions** in a portable, auditable format.
- The **constrained palette enforces data-standard compliance and accessibility by construction**, not by after-the-fact review — every Aadhaar field is masked, every field is bilingual, every field is WCAG-AA, because the widget type guarantees it.
- **One validation source** for client and server eliminates a whole class of divergence bugs.

This reframes net-new effort as an architectural advantage the incumbent's off-the-shelf builder could not claim.

---

## 11. Open items to resolve during build

1. **Palette pressure-test** — validate the 28-type v1 baseline against a sample of real DG service forms; expect the count to move. (Deferred to build per decision to lock v1 and refine.)
2. **Master-data dependency** — `dropdown-master` / `cascading-dropdown` / `address-block` depend on a master-data service. Confirm its API and ownership before FB-1 completes.
3. **eSign trigger contract** — `signature-esign` binds to the eSign CBB; confirm the invocation contract (§4.6) with the Integrations workstream.
4. **DST approval-queue interface** — confirm the queue's API (§8 increment 5) with the 3.2.3 Service Lifecycle owner.
5. **Object-store ref format** — `doc-upload` / `digilocker-fetch` store references, not blobs; confirm the ref schema against the citizen document-storage design.

```
