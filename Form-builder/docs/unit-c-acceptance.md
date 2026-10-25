# Unit C package-level acceptance (FB-C5)

## Service / fixture

| Item        | Value                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Name        | Illustrative single-page technical acceptance fixture                                                               |
| `serviceId` | Per-test synthetic IDs, e.g. `c5-acc-draft-roundtrip`, `c5-acc-published-only`, etc.                                |
| Fixture     | `services/form-definition-service/src/test/resources/validation/valid-single-page.json`                             |
| Location    | `services/form-definition-service/src/test/java/org/citizen/formdefinition/FormDefinitionUnitCAcceptanceIT.java` |
| Kind        | **Illustrative technical fixture** (not authoritative)                                                              |
| Runtime     | Testcontainers PostgreSQL 16-alpine + full Spring MVC context + `FixedClock`                                        |

## Authoritative vs illustrative

**Illustrative.** As with the Unit B representative fixture, no authoritative,
versioned DG Service Catalogue / DST-approved `FormDefinition` with traceable
production provenance was found in this monorepo. `valid-single-page.json` is
a synthetic, single-page document used purely to exercise the REST /
persistence / validation machinery end-to-end.

This fixture is **not** an approved production DG form. It carries no
special-case logic in production code — every acceptance point is proven
through the real `FormDefinitionValidationPipeline`, real `FormDefinitionStore`
/ JPA persistence, and real MockMvc HTTP calls against the Spring Boot context
(no service/repository mocking in `FormDefinitionUnitCAcceptanceIT`).

### Provenance

| Claim                                         | Status                                                            |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Service Catalogue / DST production definition | **Absent**                                                        |
| Portal / backend published JSON artefact      | **Absent** in this monorepo                                       |
| Authoritative version lineage                 | **None**                                                          |
| Fixture author                                | Form-builder acceptance harness (per-test synthetic `serviceId`s) |

## Acceptance matrix (fifteen FB-C5 points)

All fifteen points are proven by `FormDefinitionUnitCAcceptanceIT`, one test
method per point (see file for exact method names), against a live
Testcontainers PostgreSQL instance and the full Spring MVC stack.

| #   | Point                                                | Test method                                                             | Proven by                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Invalid example for each C1 stage rejected           | `invalidExampleForEachC1StageIsRejectedByValidationEndpoint`            | One malformed document per stage (`schema.*`, `palette.*`, `bilingual.*`, `binding.*`, `structure.*`); `/validation` reports the issue and `POST` create returns 422 for each                                                                                                  |
| 2   | Valid draft create/read round-trip                   | `validDraftCreateReadRoundTrip`                                         | 201 create with `ETag`; `GET` exact returns byte-identical document + same `ETag`                                                                                                                                                                                              |
| 3   | ETag-based draft replacement + stale rejection       | `etagDraftReplacementSucceedsWithMatchingIfMatchAndRejectsStale`        | Matching `If-Match` PUT succeeds with a new `ETag`; reusing the stale `ETag` afterward returns 412 `stale_revision`                                                                                                                                                            |
| 4   | Full lifecycle to published                          | `fullLifecycleDraftToPublishedSucceedsThroughRealEndpoints`             | `draft → submitted → approved → published` driven entirely through the real `/lifecycle-transitions` REST endpoint                                                                                                                                                             |
| 5   | Published lookup returns only published              | `publishedLookupReturnsOnlyPublishedNeverDraftSubmittedApprovedRetired` | `/published/latest` returns 404 at `draft`/`submitted`/`approved`/`retired`, 200 only at `published`                                                                                                                                                                           |
| 6   | Published content is immutable                       | `publishedContentIsImmutableThroughPutAndLifecycle`                     | PUT against a published version returns 409 `definition_not_editable`; stored row unchanged                                                                                                                                                                                    |
| 7   | Clone published → new draft                          | `clonePublishedProducesNewDraftVersion`                                 | `/drafts/from-version` clones version 1 (`published`) into version 2 (`draft`) via real endpoint                                                                                                                                                                               |
| 8   | New draft editable without changing published source | `newDraftIsEditableWithoutChangingThePublishedSource`                   | Editing cloned draft (v2) leaves published v1 byte-for-byte unchanged in the store                                                                                                                                                                                             |
| 9   | Version list shows published + draft                 | `versionListShowsBothPublishedAndDraftVersions`                         | `/versions` lists both v1 (`published`) and v2 (`draft`) ascending                                                                                                                                                                                                             |
| 10  | Retire prevents fallback                             | `retirePreventsFallbackToOlderPublishedVersion`                         | Retiring the higher published version returns 404 `published_form_definition_not_found` — no fallback to the older still-`published` v1                                                                                                                                        |
| 11  | Lifecycle events atomic + append-only                | `lifecycleEventsAreAtomicAndAppendOnly`                                 | Direct JDBC row counts: 0 before any transition, +1 per successful transition, unchanged (no partial row) after a rejected transition                                                                                                                                          |
| 12  | No fetch / external network / DST in governed shape  | `noDstOrExternalNetworkIntegrationIsAcceptedIntoTheGovernedShape`       | A `dstApprovalId` audit key is rejected by C1 (422 `validation_failed`); a structurally valid published document's `audit` object contains no DST-related key. The service performs no outbound HTTP by construction (Spring MVC + JPA/JDBC to the configured datasource only) |
| 13  | Strict JSON duplicate handling                       | `strictJsonDuplicateKeyHandling`                                        | Duplicate top-level and nested JSON keys both return 400 `malformed_json` (create and validation endpoints)                                                                                                                                                                    |
| 14  | Safe `ProblemDetail` responses                       | `problemDetailResponsesNeverLeakInternalsAcrossDistinctFailureModes`    | Across `validation_failed`, `form_definition_not_found`, `stale_revision`, `published_form_definition_not_found`, `invalid_pagination`: no `Exception`/SQL/stack/`Caused by`/`lockVersion`, and an embedded secret value never appears in the response body                    |
| 15  | PostgreSQL JSONB + Unicode preservation              | `postgresqlJsonbStorageAndUnicodePreservation`                          | `pg_typeof(definition)` is `jsonb`; Gujarati text round-trips byte-identical through direct SQL projection and the REST read                                                                                                                                                   |

## Coverage by other FB-C5 test classes

| Area                                                           | Test class                                       |
| -------------------------------------------------------------- | ------------------------------------------------ |
| Pagination parsing (limits, canonical decimals, invalid input) | `FormDefinitionPaginationParserTest` (unit)      |
| Release-head policy service logic (Mockito)                    | `FormDefinitionPublishedQueryServiceTest` (unit) |
| Version listing service logic (`limit+1` cursor, Mockito)      | `FormDefinitionVersionQueryServiceTest` (unit)   |
| Published-lookup REST behavior (Testcontainers + MockMvc)      | `FormDefinitionPublishedLookupIT`                |
| Version-list REST behavior (Testcontainers + MockMvc)          | `FormDefinitionVersionListIT`                    |
| Flyway V3 migration + release-head index + planner usage       | `FormDefinitionFlywayV3IT`                       |

## Known limitations

- Fixture is illustrative only — not DST/catalogue-approved
- `actorId` remains an unauthenticated provisional assertion throughout all
  acceptance tests; no real authentication/authorization is exercised
- No live portal, backend, DST governance workflow, or real network
  integration is exercised — the acceptance suite structurally proves the
  service never performs outbound HTTP and that no DST-related field can
  enter the governed document shape, which is **not** the same as a
  governance-confirmed DST integration
- The release-head publish-lookup policy (highest `published`/`retired` wins;
  no fallback past a retired head) is a **technical implementation decision**
  validated by this suite, not yet a product/governance-confirmed DG 2.0
  publish rule (see `docs/integration-assumptions.md`)
- EXPLAIN-based index-usage assertions in `FormDefinitionFlywayV3IT` are
  intentionally soft (plan text / scan-type checks), not brittle exact-plan
  assertions

## Package-level vs §5 live acceptance

| Layer                                                                   | Status after FB-C5                                                                                  |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **1. Package-level technical acceptance**                               | **Complete** — all fifteen FB-C5 points proven end-to-end against the illustrative fixture          |
| **2. Live real-service / portal / backend acceptance (design-spec §5)** | **Remains pending** until an authoritative published service definition and host integrations exist |

## Explicitly open items (do NOT claim resolved)

This completion statement covers **package-level technical acceptance of
`services/form-definition-service` through FB-C5 only**. The following remain
**open** and are **not** claimed as production-ready by this increment:

- **Authentication / authorization** — `actorId` / `createdBy` remain
  unauthenticated provisional assertions across create, PUT, lifecycle
  transitions, and cloning
- **DST (Departmental Standards Team) governance workflow** — no approval
  queue, external review, or governance sign-off is integrated; C5's
  release-head policy is a technical decision pending governance confirmation
- **Deployment** — no CI/CD, container image, Rancher/Kubernetes manifests,
  or production configuration are in scope
- **Design-spec §5 live real-service acceptance** — requires an authoritative
  published service definition plus host/portal/backend wiring; remains
  pending exactly as under FB-B6.1
- **Unit D (Builder SPA)** — remains gated / blocked, not started
- **Unit E (governance wiring / portal nginx)** — not started

Do not claim §5 completion, DST integration, authenticated production
readiness, or Unit D/E completion from this increment.
