# Unit E package-level technical acceptance (FB-E4)

> **Unit E package acceptance is technical only.**
>
> - The governance queue is **FDS status-derived — not DST**.
> - Profile `governance-technical` is **non-production**.
> - **§5** authoritative live-service acceptance remains **open**.
> - Production IAM, DST inbox integration, deployment, application submission
>   adapters, and catalogue mapping remain **external**.

## Exact technical sequence

1. Validate representative draft → `valid: true`
2. Create draft → `201` + strong `ETag`
3. Exact `GET` returns draft at the same `(serviceId, version)`
4. Technical submit `POST …/lifecycle-transitions` with
   `{ targetStatus: "submitted", actorId }` → submitted
5. Governance queue (admitted technical principal) lists submitted metadata
6. Governance detail returns submitted definition + strong `ETag` + `Cache-Control: no-store`
7. Governance approve with exact `{ targetStatus: "approved" }` (no `actorId`)
8. Submitted `If-Match` becomes stale (`412`) after approve
9. Queue shows approved
10. Governance publish with exact `{ targetStatus: "published" }` using approve `ETag`
11. `GET …/published/latest` returns the published version
12. Published body never exposes `lockVersion`, ETag, lifecycle event internals, or persistence metadata
13. Lifecycle events exactly: `draft→submitted`, `submitted→approved`, `approved→published`
14. Published audit keys only: `createdBy`, `createdAt`, `submittedBy`, `approvedBy`, `publishedAt`
15. No DST adapter, outbox, notification, or invented acknowledgement

## Acceptance evidence matrix

| Area                   | Evidence                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| FDS lifecycle A–O      | `FormDefinitionUnitEAcceptanceIT`                                        |
| Governance negatives   | Same IT (actor spoof, capability split, 401-before-body, stale 412)      |
| Default fail-closed    | IT + `FormDefinitionGovernanceFailClosedIT` (prior) + profile YAML check |
| Builder contracts      | `apps/form-builder/tests/e4-unit-e-acceptance.test.tsx`                  |
| Officer adapter/UI     | `officer-portal/src/acceptance/e4-unit-e-acceptance.test.jsx`            |
| Citizen adapter/render | `citizen-portal/src/acceptance/e4-unit-e-acceptance.test.jsx`            |
| Cross-repo drift       | `acceptance/unit-e/contract-manifest.json` + SHA-256 copies              |
| Live verifier          | `scripts/e4-technical-e2e.mjs`                                           |

## Representative fixture provenance

| Field       | Value                                                               |
| ----------- | ------------------------------------------------------------------- |
| `serviceId` | `unit-e-technical-acceptance`                                       |
| `version`   | `1`                                                                 |
| Initial     | `draft`                                                             |
| Canonical   | `acceptance/unit-e/unit-e-representative-definition.json`           |
| SHA-256     | `8847a0904c402b7b98822f96741234a0f93230d57f7ecf458f41b66e979c557e`  |
| Provenance  | Remapped from Unit D `unit-d-acceptance-definition.ts` via          |
|             | `acceptance/unit-e/export-representative-fixture.mjs`               |
| Label       | Illustrative / non-authoritative — **not** a production package API |

Java IT and portal copies must match the canonical SHA-256 (drift tests fail otherwise).

## Package versions

| Package               | Version |
| --------------------- | ------- |
| `@citizen/form-contract` | `0.1.0` |
| `@citizen/form-widgets`  | `0.2.0` |
| `@citizen/form-renderer` | `0.1.0` |

## FDS endpoints exercised

| Method | Path                                                        |
| ------ | ----------------------------------------------------------- |
| POST   | `/api/v1/form-definitions/validation`                       |
| POST   | `/api/v1/form-definitions`                                  |
| GET    | `/api/v1/form-definitions?serviceId&version`                |
| POST   | `/api/v1/form-definitions/lifecycle-transitions`            |
| GET    | `/api/v1/form-definitions/governance/queue`                 |
| GET    | `/api/v1/form-definitions/governance/detail`                |
| POST   | `/api/v1/form-definitions/governance/lifecycle-transitions` |
| GET    | `/api/v1/form-definitions/published/latest`                 |

## ETag flow

```
create → ETag₀
technical submit (If-Match: ETag₀) → ETag₁
governance detail returns ETag₁
approve (If-Match: ETag₁) → ETag₂
stale ETag₁ → 412 (no mutation)
publish (If-Match: ETag₂) → published
citizen published/latest ignores any ETag header
```

Officer portal keeps ETag **memory-only** (never DOM/storage/URL/status copy).
Citizen path never admits ETag into the adapter result.

## Principal / capability model

| Capability                        | Allows                      |
| --------------------------------- | --------------------------- |
| `READ_FORM_DEFINITION_GOVERNANCE` | Queue + detail              |
| `APPROVE_FORM_DEFINITION`         | `submitted → approved` only |
| `PUBLISH_FORM_DEFINITION`         | `approved → published` only |

Actor for governance transitions comes from the principal — never from the request body.
Default runtime is fail-closed (`401 governance_unauthenticated`).
`governance-technical` may supply a local technical principal and is **prohibited in production**.

## Lifecycle event evidence

Exact ordered rows for the representative service:

1. `draft` → `submitted` (technical actor)
2. `submitted` → `approved` (governance principal actor)
3. `approved` → `published` (governance principal actor)

## Portal adapter evidence

- **Officer:** real `createHttpFormDefinitionGovernanceAdapter` +
  `createAdmittingFormDefinitionGovernanceAdapter`; exact
  `{ targetStatus }` bodies; stale `412` mapping; Cancel/Escape zero transitions;
  queue described as FDS status-derived.
- **Citizen:** real published HTTP + admitting adapters; exact
  `{ serviceId, version, definition }` envelope; FormRenderer citizen mode;
  EN/GU; progressive navigation; CAF governed unavailable; no default Submit;
  StrictMode single live load; legacy `/apply/*` modules unchanged.

## Security / data-minimization checks

- No raw secrets, tokens, PII blobs, File/Blob/base64 in the representative fixture
- Published/latest omits lockVersion / ETag / event internals
- Governance responses do not echo principal/capabilities
- Unauthenticated governance returns 401 before body / If-Match validation

## Warnings

- Technical acceptance ≠ production readiness
- Queue ≠ DST inbox
- `governance-technical` ≠ production IAM
- Browser verification is optional when Playwright is unavailable; Maven IT +
  adapter/component acceptance remain mandatory

## External dependencies (explicit)

- PostgreSQL via Rancher Desktop / Docker Testcontainers
- Java 17 + Maven for FDS
- Node 20+ for Builder/portal acceptance
- Optional Playwright for browser UX checks

## How to run

```bash
# Form-builder gates (excerpt)
mvn -f services/form-definition-service/pom.xml clean verify
npm run format && npm run format:check && npm run lint && npm run typecheck
npm test && npm run build && npm run storybook:build && npm run build:builder

# Live technical verifier (requires Docker)
node scripts/e4-technical-e2e.mjs

# Portals (focused)
cd ../officer-portal && npm run test:run -- src/form-definition-governance src/acceptance/e4-unit-e-acceptance.test.jsx
cd ../citizen-portal && npm run test:run -- src/published-form src/acceptance/e4-unit-e-acceptance.test.jsx
```

## Verdict

**Package-level Unit E technical acceptance (FB-E4): COMPLETE** when all required
gates and the Maven Unit E IT pass.

STOP after FB-E4. Do not start FB-E5, production authentication, DST integration,
deployment, or §5 live-service work from this increment.
