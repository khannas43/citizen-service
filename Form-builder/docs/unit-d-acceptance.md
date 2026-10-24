# Unit D package-level acceptance (FB-D22)

## Service / fixture

| Item        | Value                                                                 |
| ----------- | --------------------------------------------------------------------- |
| Name        | Representative Builder acceptance FormDefinition                      |
| `serviceId` | `unit-d-builder-acceptance`                                           |
| Fixture     | `apps/form-builder/acceptance/unit-d-acceptance-definition.ts`        |
| Adapters    | `apps/form-builder/acceptance/in-memory-adapters.ts`                  |
| Kind        | **Illustrative technical fixture** (not authoritative DG policy)      |
| Runtime     | Vitest + jsdom + injectable in-memory ports; optional Playwright+mock |

Acceptance paths are **not** exported from the public Builder package surface.

## Authoritative vs illustrative

**Illustrative.** No authoritative, versioned DG Service Catalogue / DST-approved
`FormDefinition` with traceable production provenance is used. The frozen
representative draft exercises Builder authoring, validation, persistence,
lifecycle submit, versions/clone, progressive steps, family nested identity,
accessibility, and security boundaries end-to-end.

This fixture is **not** approved DG service policy.

### Provenance

| Claim                                         | Status                                 |
| --------------------------------------------- | -------------------------------------- |
| Service Catalogue / DST production definition | **Absent**                             |
| Portal / backend published JSON artefact      | **Absent** for this acceptance surface |
| Authoritative version lineage                 | **None**                               |
| Fixture author                                | Form-builder FB-D22 acceptance harness |

## Acceptance matrix

| Feature                              | Automated test                                                                 | Browser scenario (`d22-browser-verify.mjs`) | Result | Remaining external dependency     |
| ------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------- | ------ | --------------------------------- |
| Frozen representative draft          | `d22-acceptance-integrity` fixture integrity                                   | Uses illustrative SPA seed + HTTP mock      | Pass   | Catalogue/DST definition          |
| Palette 30/0                         | integrity + shell fresh authoring                                              | Palette exercised via Add Short text        | Pass   | —                                 |
| Fresh local authoring / dirty gates  | shell fresh authoring                                                          | Local edit before Validate/Create           | Pass   | —                                 |
| Validation + advisory                | shell validate/create/save                                                     | Validate                                    | Pass   | Production validation host wiring |
| Draft create + ETag memory-only      | shell + integrity adapters                                                     | Create (Save)                               | Pass   | Production persistence            |
| PUT If-Match save                    | shell edit → Validate → Save                                                   | Edit → Validate → Save                      | Pass   | Production persistence            |
| Open Draft discard Cancel            | shell open-draft discard                                                       | Covered in prior D7/D19 suites              | Pass   | —                                 |
| Lifecycle submit confirm             | shell submit Escape + confirm                                                  | Escape + confirm Submit                     | Pass   | Authn/z; DST                      |
| Submitted read-only                  | shell submit success                                                           | Readonly guidance + disabled palette        | Pass   | Approval/publication              |
| Version list pagination              | shell list after submit                                                        | Load versions (v2 published / v3 retired)   | Pass   | Production version API            |
| Clone Cancel / success               | shell clone cancel then confirm                                                | Clone Cancel then Confirm                   | Pass   | Production clone API              |
| Progressive Page Break (no field)    | integrity progressiveSteps; no literal page-break field                        | Prior D17 smoke                             | Pass   | —                                 |
| Within-step reorder                  | integrity `reorderFieldWithinStep`; browser Move Down when available           | Move Down when enabled                      | Pass   | Cross-step / palette drag         |
| Family nested identity               | integrity nested paths + remove scrub                                          | Fixture includes family + nested bindings   | Pass   | Live Hub/Workflow adapters        |
| A11y EN/GU + 390px                   | shell axe EN/GU; scrollWidth                                                   | EN/GU + 390px + desktop                     | Pass   | WCAG certification (not claimed)  |
| No fetch/storage / no ETag/actor DOM | integrity + shell                                                              | Actor/ETag leak checks                      | Pass   | —                                 |
| Failure/recovery matrix              | adapter duplicate/stale/not_found/clone stale; shell validation Retry + locale | —                                           | Pass   | Live transport semantics          |

## Defects closed by FB-D22

| Defect                                                                              | Fix                                                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Persistence admit rejected nested `root[].child` Integration/Workflow `fieldId`s    | `collectAdmittedBindingFieldIds` unions root properties with `paletteProvenance` field IDs |
| Acceptance lifecycle returned `submittedAt`, rejected by submitted-audit envelope   | Lifecycle adapter returns exact `createdBy` / `createdAt` / `submittedBy`                  |
| Immutable version seeds overwrote live draft-store entries for the same coordinates | Version adapter merge prefers live draft-store entries                                     |

## Browser verification

```bash
# Terminal A — mock
node apps/form-builder/scripts/d22-acceptance-mock.mjs

# Terminal B — Builder (explicit technical actor; not production identity)
# Use a free Vite port if 5173 is occupied by another app.
cd apps/form-builder && VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID=unit-d-d22-browser-actor npx vite --port 5174 --strictPort --host 127.0.0.1

# Terminal C — Playwright verify (NODE_PATH to a playwright install if needed)
NODE_PATH=/private/tmp/d7-pw/node_modules \
  VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID=unit-d-d22-browser-actor \
  D22_BUILDER_URL=http://127.0.0.1:5174/ \
  node apps/form-builder/scripts/d22-browser-verify.mjs
```

## Package-level vs §5 live acceptance

| Layer                                                  | Status after FB-D22 |
| ------------------------------------------------------ | ------------------- |
| **Package-level Unit D technical acceptance**          | **COMPLETE**        |
| **§5 live real-service / portal / backend acceptance** | **Remains open**    |

## Explicitly open / external (do NOT claim resolved)

- §5 authoritative service acceptance
- Authentication / authorization
- DST integration
- Production adapters (validation, persistence, lifecycle, versions, Hub, CAF, documents, eSign, …)
- Deployment / Kubernetes
- Unit E portal integration
- Governance approval of provisional policies
- submitted → approved → published UI
- Retirement UI
- Cross-step / palette-to-canvas drag
- WCAG certification

STOP after FB-D22. Unit E is not started.
