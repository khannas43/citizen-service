# DG 2.0 Form Builder

Custom Form Builder and Form Renderer for Digital Gujarat 2.0, replacing Form.io
with an open-standard **JSON Schema (Draft 2020-12)** + controlled government
widget palette.

Design source of truth:
[`DG20_FormBuilder_Design_Spec_v1.md`](./DG20_FormBuilder_Design_Spec_v1.md)

## Purpose

Departments compose service forms from an **approved, non-extensible palette**.
Citizens and Builder live-preview share **one Renderer** (“render once”).
Published Form Definitions are **immutable** and stored as portable JSON.

## Packages (current and planned)

| Package / deployable                           | Role                                        | Status                                                             |
| ---------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `@citizen/form-contract`                          | Canonical `FormDefinition` TypeScript types | **FB-0 done**                                                      |
| `@citizen/form-widgets`                           | Palette registry + RJSF widget library      | **Unit A complete (FB-A12.1)** (30/30)                             |
| `@citizen/form-renderer`                          | Unit B — RJSF renderer of a Form Definition | **Unit B package acceptance complete (FB-B6.1)**                   |
| `services/form-definition-service` (Maven)     | Unit C + E1 governance boundary             | **FB-C5 + FB-E1 governance foundation** (**not** an npm workspace) |
| `@citizen/form-builder-app` (`apps/form-builder`) | Unit D — palette-constrained Builder SPA    | **Unit D package-level COMPLETE (FB-D22)**                         |

See [`docs/architecture.md`](./docs/architecture.md),
[`docs/renderer.md`](./docs/renderer.md),
[`docs/unit-b-acceptance.md`](./docs/unit-b-acceptance.md),
[`docs/unit-c.md`](./docs/unit-c.md),
[`docs/unit-c-acceptance.md`](./docs/unit-c-acceptance.md),
[`docs/unit-d.md`](./docs/unit-d.md),
[`docs/unit-d-acceptance.md`](./docs/unit-d-acceptance.md),
[`docs/unit-e.md`](./docs/unit-e.md),
[`docs/unit-e-acceptance.md`](./docs/unit-e-acceptance.md),
[`docs/fds-containerization.md`](./docs/fds-containerization.md),
[`docs/fds-image-supply-chain.md`](./docs/fds-image-supply-chain.md),
[`docs/fds-helm-chart.md`](./docs/fds-helm-chart.md),
[`docs/fds-portal-proxy.md`](./docs/fds-portal-proxy.md),
[`docs/widget-authoring.md`](./docs/widget-authoring.md), and
[`docs/integration-assumptions.md`](./docs/integration-assumptions.md).

## Prerequisites

- **Node.js 20+** (see `.nvmrc`)
- npm 10+ (comes with Node 20)
- For Unit C: **Java 17**, **Maven 3.9+**, Docker/Rancher Desktop (Testcontainers)

## Commands (from `Form-builder/`)

```bash
npm install
npm run build
npm run typecheck
npm test
npm run lint
npm run format
npm run format:check
npm run storybook
npm run storybook:build
npm run clean

# Unit D Builder SPA
npm run dev:builder
npm run build:builder
npm run preview:builder

# Unit C (Maven — not npm)
mvn -f services/form-definition-service/pom.xml clean verify
```

## Design constraints (locked)

- **JSON Schema Draft 2020-12** is the canonical data shape and validation format.
- The **controlled palette is not user-extensible** (no custom-field / raw-JSON).
- **Published Form Definitions are immutable** (DR-023).
- **uiSchema** is limited to widget/field selection and order; bilingual copy and
  business config live in Form Definition meta / `x-dg20`, not `ui:options`.

## Current increment

**FB-E5.5.1 — FDS image supply-chain hardening**

Immutable `tag@sha256` base pins, Docker Scout SPDX SBOM + CVE verification,
architecture evidence, and deterministic cleanup. **No push, no deploy, no Helm
edits, no waivers.** See [`docs/fds-image-supply-chain.md`](./docs/fds-image-supply-chain.md).

```bash
export DOCKER_HOST=unix://$HOME/.rd/docker.sock
npm run e5.5.1:verify
npm run e5.1:verify
```

**FB-E5.4.3B — Officer Builder FDS nginx allowlist**

Officer portal nginx exact-path allowlist adds authenticated Builder FDS routes
(validation, draft create/get/replace, versions, `/builder/…` clone+submit)
alongside existing governance routes. Technical clone/lifecycle, actuator, and
published/latest remain blocked. Offline `npm run e5.3a:verify`. **No React/Java
behavior changes, no deploy, no IAM, no citizen proxy changes.**
See [`docs/fds-portal-proxy.md`](./docs/fds-portal-proxy.md).

```bash
export DOCKER_HOST=unix://$HOME/.rd/docker.sock
npm run e5.3a:verify
npm run format && npm run format:check && npm run lint && npm run typecheck
npm test && npm run build
```

**FB-E5.4.3A — Officer-hosted Form Builder foundation**

Stable `@citizen/form-builder-app/embed` package entry + CSS for host SPAs.
Officer-portal mounts Builder at `/form-builder` with request-time
`accessTokenProvider` (no `lifecycleActorId`). Builder-role UX gate only;
FDS remains authoritative. **Nginx still blocks Builder FDS routes until
FB-E5.4.3B.** No IAM/deploy/live Keycloak.
See [`docs/builder-access-token-provider.md`](./docs/builder-access-token-provider.md)
and `officer-portal/docs/form-builder-hosting.md`.

```bash
npm run pack:builder-embed && npm run verify:builder-embed
npm run format && npm run format:check && npm run lint && npm run typecheck
npm test && npm run build && npm run build:builder
```

**FB-E5.4.2B — Authenticated Builder clone + submit**

FDS `governance-oidc` exposes `POST …/builder/drafts/from-version` (`{}`, JWT `sub`
→ `createdBy`) and `POST …/builder/lifecycle-transitions`
(`{"targetStatus":"submitted"}`, JWT `sub` → `submittedBy` / event actor). Technical
identity-bearing clone/lifecycle remain **denyAll**. Builder SPA default HTTP adapters
use the `/builder/…` paths with Bearer from host `accessTokenProvider` and never send
client `createdBy`/`actorId`. **No live IAM, no deploy, no portal/DIGIT changes.**
See [`docs/fds-governance-oidc.md`](./docs/fds-governance-oidc.md) and
[`docs/builder-access-token-provider.md`](./docs/builder-access-token-provider.md).

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
mvn -f services/form-definition-service/pom.xml clean verify
npm run format && npm run format:check && npm run lint && npm run typecheck
npm test && npm run build && npm run build:builder
```

**FB-E5.4.2A — Builder/operator IAM package foundation**

FDS `governance-oidc` enforces dedicated Builder capability authorities on
validation / draft create-read-replace / version-list. Builder SPA adds host-owned
`accessTokenProvider` Bearer forwarding (no login, no token storage).
**No live IAM, no deploy, no portal/DIGIT changes.**
See [`docs/fds-governance-oidc.md`](./docs/fds-governance-oidc.md) and
[`docs/builder-access-token-provider.md`](./docs/builder-access-token-provider.md).

**FB-E5.4.1 — Officer-governance OAuth2/JWT foundation**

FDS profile `governance-oidc` (RS256 Resource Server, audience
`form-definition-service`, actor=`sub`, roles from `realm_access.roles`).
Officer Portal governance adapter sends Bearer from `officer_token` at request
time. **No live IAM, no deploy, no citizen/auth-service/DIGIT changes.**
See [`docs/fds-governance-oidc.md`](./docs/fds-governance-oidc.md).

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
mvn -f services/form-definition-service/pom.xml clean verify
```

**FB-E5.3A.1 — Portal least-privilege FDS proxy hardening**

Citizen nginx allows only `GET …/published/latest`. Officer allows only the three
governance routes. All other `/form-definition-service/*` requests are rejected
locally. Form-builder: `npm run e5.3a:verify`.
**No deploy, no push, no IAM/Zuul/DIGIT-DevOps changes.**
See [`docs/fds-portal-proxy.md`](./docs/fds-portal-proxy.md).

```bash
export DOCKER_HOST=unix://$HOME/.rd/docker.sock
npm run e5.3a:verify
```

**FB-E5.2 — Render-only FDS Helm chart foundation**

DIGIT-DevOps chart under `core-services/form-definition-service` + Form-builder
`npm run e5.2:verify` (helm lint/template only). **No install, no kubectl, no
push, no overlay/Zuul/portal edits.** See
[`docs/fds-helm-chart.md`](./docs/fds-helm-chart.md).

**FB-E5.1 — Form Definition Service containerization foundation**

Local multi-stage FDS image + bounded smoke verifier (ephemeral Postgres 16).
**No deploy, no push.**
See [`docs/fds-containerization.md`](./docs/fds-containerization.md).

**Non-claims:** production base-image approval, gateway production policy, IAM, DST, §5.

**FB-E4 — Unit E package-level technical acceptance** (complete)

See [`docs/unit-e-acceptance.md`](./docs/unit-e-acceptance.md). `npm run e4:verify`.

**FB-D22 — Unit D package-level acceptance**

Consolidated acceptance harness for Unit D. **Package-level Unit D: COMPLETE.**
See [`docs/unit-d-acceptance.md`](./docs/unit-d-acceptance.md).

Still external/open: §5, production auth/IAM, DST contract, deployment, E2 portal UI.

**FB-D21 — Governed Integration Hub and Workflow binding authoring**

Bindings tab authors CAF Prefill, Integration Hub, and Workflow stage bindings
as independent draft surfaces. Integration/Workflow targets are data-producing
fields from `collectBindableFields` (including nested family members). Adapter,
parameter, and stage identifiers are opaque — no live catalogues or Hub calls.
Browser smoke: `apps/form-builder/scripts/d21-browser-verify.mjs`.

Historical; superseded by FB-D22 for package-level acceptance.

**FB-D20.1 — Clone confirmation interaction guard**

`confirmClone` tracks a render-derived `authoringInteractionBlocked` primitive
(and exposes `canConfirmClone`) so Confirm cannot POST after a newer blocking
authoring interaction such as an active D20 canvas reorder.

Historical; superseded by FB-D21 for Bindings Integration/Workflow scope.

**FB-D20 — Accessible canvas field reorder**

Canvas root fields can be reordered within their current progressive step with
native HTML drag-and-drop or keyboard lift/move/drop. Reorder gestures are
ephemeral and block server actions until dropped or cancelled; touch drag and
cross-step movement are intentionally out of scope. At 390px, use Move Up/Down.
Canonical operation: `reorderFieldWithinStep` / `getCanvasReorderTargets`.
Browser smoke: `apps/form-builder/scripts/d20-browser-verify.mjs`.

STOP — FB-D22 and later increments are not included.

**FB-D19 — Immutable version history and draft cloning**

- The Builder lists a service's draft, submitted, approved, published, and
  retired versions. Drafts can be opened; published or retired versions can
  explicitly create the next draft version.
- `createdBy` is a technical request field only. Network requests may include
  service ID, version, and `createdBy`; none of those fields constitutes
  authentication or authorization, and the actor is never rendered.
- Local verification: run `node apps/form-builder/scripts/d19-versions-mock.mjs`
  and start Vite with `VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID`.

**FB-D17 — Page Break as progressive-step boundary action**

- `page-break` is a **structural** palette capability (not a field template):
  `isAddableWidgetType('page-break') === true`,
  `getAuthoringTemplate('page-break') === undefined`,
  `addField(..., 'page-break')` fails with
  `structural_widget_requires_boundary_action`
- Create-boundary dialog mutates **only** `meta.progressiveSteps`
  (single-page atomic enable+split, or progressive split with user EN/GU labels)
- Legacy literal `ui:field: "page-break"` definitions remain readable; Builder does
  not mint new literal page-break fields
- Counts: **30 addable / 0 pending / 30 total**
  (`FIELD_ADDABLE_COUNT` 29 + `STRUCTURAL_ADDABLE_COUNT` 1)
- See [`docs/unit-d.md`](./docs/unit-d.md)

**FB-D16 (accepted):** Family Repeater authoring; Unit C repeater strengthenings.

**FB-D15 (accepted):** caf-prefill + Bindings workspace; CAF adapters external.

**FB-D14 (accepted):** eligibility-declaration configured-add; ConsentLoggingAdapter
remains external.

**FB-D13 (accepted):** fee-field + signature-esign (fee/eSign adapters and
runtime contexts remain external; eSign contract provisional).

**FB-D12 (accepted):** doc-upload + digilocker-fetch (MIME/size + DigiLocker
type code; object-store / DigiLocker remain external).

**FB-D11 (accepted):** address-block + photo-capture (geography codes only;
photo CLEAN object-store reference only).

**FB-D10 / D10.1 (accepted):** governed multiselect + cascading-dropdown;
required multiselect serializes explicit `minItems >= 1`.

**FB-D9 / D9.1 (accepted):** configured-add foundation for `dropdown-master` /
`radio`; focus sequencing and modal containment.

**FB-D8 (accepted):** governed Aadhaar / Mobile OTP / Bank Account templates.

**FB-D7 / D7.1 / D7.1.1 (completed):** draft create, exact load, optimistic PUT,
opaque in-memory ETag, clone-first request/response admission, operation-specific
failure UX, validation-match Save gate.

**Sequencing exception (2026-07-24):** Unit D authorized while §5, authn/z, DST,
and deployment remain open. Do not claim production readiness.

**Unit A** remains complete: **30 / 0 / 30** widgets.

## Next planned increment

- Cross-step field movement, palette-to-canvas drag, lifecycle approval/publication
- Authenticated authorization and DST governance workflow integration
- **§5 live real-service acceptance** remains **pending**
- **Unit E** governance wiring / portal shell not started
- Geography / object-store / DigiLocker / fee / eSign / consent / master-data
  adapters remain external host dependencies (not claimed by the Builder)

**Package-level Unit D is COMPLETE (FB-D22).** Do not start Unit E from this increment.
