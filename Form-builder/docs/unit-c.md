# Unit C — Form Definition Service (FB-C0 / C0.1 / C1 / C2 / C3 / C4 / C4.1 / C5)

## Sequencing exception (2026-07-24)

Unit C is **explicitly authorized** despite pending design-spec §5 live
real-service acceptance. This is an **external-dependency sequencing
exception** dated **2026-07-24**:

| Item                                                        | Status                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Unit B package-level technical acceptance (FB-B6.1)         | **Complete**                                                           |
| §5 live real-service / portal / backend acceptance          | **Remains open**                                                       |
| Unit C foundation (FB-C0 / C0.1)                            | **Accepted**                                                           |
| Unit C pure validator (FB-C1)                               | **Accepted**                                                           |
| Unit C draft create/read REST (FB-C2)                       | **Accepted**                                                           |
| Unit C draft replace + ETag (FB-C3)                         | **Accepted**                                                           |
| Unit C lifecycle + new-draft versions (FB-C4)               | **Accepted**                                                           |
| Unit C clone/lifecycle lock hotfix (FB-C4.1)                | **Accepted**                                                           |
| Unit C published-lookup + version list + acceptance (FB-C5) | **Complete**                                                           |
| Unit D / Builder SPA                                        | **FB-D0 authorized** (read-only shell); §5/auth/DST/deploy remain open |
| Unit E / governance wiring / portal nginx                   | **FB-E1 foundation done** (portal UI pending E2+)                      |

Do not treat this exception as §5 completion. Unit D remains blocked.

## FB-C5 — published lookup, version listing, package acceptance

FB-C5 adds two **citizen/consumer-facing read APIs** on top of the FB-C4/C4.1
technical lifecycle, plus a consolidated package-level acceptance suite for
`services/form-definition-service`.

| Method | Path                                                                | Behavior                                        |
| ------ | ------------------------------------------------------------------- | ----------------------------------------------- |
| GET    | `/api/v1/form-definitions/published/latest?serviceId=`              | Release-head policy lookup; 200 + ETag, or 404  |
| GET    | `/api/v1/form-definitions/versions?serviceId=&afterVersion=&limit=` | Bounded ascending version metadata listing; 200 |

Both are read-only, `@Transactional(readOnly = true)`, and never mutate state.

### Release-head policy (technical; requires final governance confirmation)

Implemented by `FormDefinitionPublishedQueryService.getLatestPublished`:

1. Find the highest-version row whose status is `published` or `retired`
   (`FormDefinitionRepository.findReleaseHeads`, backed by the Flyway V3
   partial index — see below).
2. Higher `draft` / `submitted` / `approved` versions for the same service are
   **ignored** — they can never be the release head.
3. No `published`/`retired` row at all → 404 `published_form_definition_not_found`.
4. Release head is `retired` → 404 `published_form_definition_not_found`.
   **There is no fallback to an older `published` version.** Once the highest
   release-eligible row is retired, the service has no citizen-visible
   published content, even if an earlier version is still `published`.
5. Release head is `published` → re-verify the document's own `status` field
   agrees with the status column, then re-run the full FB-C1 five-stage
   validator before returning. Either check failing throws
   `StoredDefinitionCorruptException` (500 `stored_definition_corrupt`), never
   a partially-trusted document.

**This policy is a technical implementation decision, not a governed product
rule.** It requires product/governance confirmation before being treated as
final DG 2.0 publish semantics (see `docs/integration-assumptions.md`).

### Version listing

Implemented by `FormDefinitionVersionQueryService.listVersions` /
`FormDefinitionPaginationParser`:

- Ascending order by `version`; exclusive `afterVersion` cursor (`0` /
  omitted = start before the first version).
- `limit` defaults to 50, maximum 100. Both `afterVersion` and `limit`, when
  present, must be canonical positive decimal text `[1-9][0-9]*` — no signs,
  whitespace, decimal points, exponents, or leading zeroes. Otherwise 400
  `invalid_pagination`.
- The store fetches at most `limit + 1` rows in one bounded query
  (`FormDefinitionRepository.findVersionsAfter`) — **no `COUNT(*)`/total is
  ever computed**. If the fetch returns more than `limit` rows, the response
  emits exactly `limit` items plus `nextAfterVersion` (the last emitted
  version); otherwise `nextAfterVersion` is omitted from the JSON entirely
  (`@JsonInclude(NON_NULL)`), not emitted as `null`.
- Response projection is intentionally minimal: `{ serviceId, items[].version,
items[].status, nextAfterVersion? }`. No audit, timestamps, full document,
  or revision/ETag data is exposed by this endpoint.
- A corrupt row (coordinate mismatch or otherwise inadmissible) fails the
  **entire** request with 500 `stored_definition_corrupt` — never a partial
  list.

### Flyway V3 — release-head index

`V3__form_definitions_release_head_idx.sql` adds a partial index (V1/V2
unchanged, no checksum rewrite):

```sql
CREATE INDEX form_definitions_release_head_idx
    ON form_definition.form_definitions (service_id, version DESC)
    WHERE status IN ('published', 'retired');
```

This supports both the release-head lookup (`ORDER BY version DESC LIMIT 1`
with a `status IN (...)` predicate) and future release-scoped queries.

### C5 ProblemDetail codes

| Code                                  | HTTP |
| ------------------------------------- | ---- |
| `published_form_definition_not_found` | 404  |
| `invalid_pagination`                  | 400  |

Plus all existing C2/C3/C4 codes.

### Package-level acceptance (FB-C5)

`FormDefinitionUnitCAcceptanceIT` is a consolidated Testcontainers/MockMvc
suite covering all fifteen FB-C5 package-acceptance points (C1 stage
rejection, draft CRUD/ETag, full lifecycle, published-lookup policy and
immutability, clone-to-draft, version listing, retire-without-fallback,
append-only events, absence of DST/network integration, strict JSON,
`ProblemDetail` safety, JSONB/Unicode) against an **illustrative technical
fixture** (`valid-single-page.json`) — **not** an authoritative DG Service
Catalogue / DST-approved `FormDefinition`. See
[`unit-c-acceptance.md`](./unit-c-acceptance.md) for the completion statement
and explicitly open items.

### Deferred (beyond C5)

Authenticated authorization, DST governance workflow integration, deployment,
design-spec §5 live real-service acceptance, Unit D / Builder SPA, Unit E.

## FB-C4 — technical lifecycle + immutable new-draft versions

C4 provides a **technical state machine** only. It does **not** integrate DST
approval, authenticated authorization, or production governance.

`actorId` / `createdBy` are **provisional unauthenticated assertions**. Production
must derive identity from an authenticated principal.

Forward-only transitions:

`draft → submitted → approved → published → retired`

| Method | Path                                                                     | Behavior                                 |
| ------ | ------------------------------------------------------------------------ | ---------------------------------------- |
| POST   | `/api/v1/form-definitions/lifecycle-transitions?serviceId=&version=`     | If-Match + transition; 200 + ETag        |
| POST   | `/api/v1/form-definitions/drafts/from-version?serviceId=&sourceVersion=` | Clone published/retired → new draft; 201 |

### Canonical audit mutations

Governed `audit` keys only: `createdBy`, `createdAt`, `submittedBy`, `approvedBy`,
`publishedAt`. Unexpected keys → `structure.audit_unexpected_key`.

| Transition  | Document mutation                          |
| ----------- | ------------------------------------------ |
| → submitted | `submittedBy = actorId`                    |
| → approved  | `approvedBy = actorId`                     |
| → published | `publishedAt = Clock.instant()` (ISO-8601) |
| → retired   | no new FormDefinition.audit property       |

Lifecycle **event log** (Flyway V2, append-only) records actor/time for every
transition including publish/retire. Events are **not** exposed via REST in C4.

### New-draft version creation

- Source must be `published` or `retired`; source remains byte-for-byte unchanged
- Allocates `max(version)+1` safely; overflow → `version_exhausted`
- New audit is only `createdBy` + server `createdAt`

### FB-C4.1 — shared service mutation lock

Explicit draft **create**, **clone allocation**, and **lifecycle transitions**
share one PostgreSQL transaction-scoped advisory lock via
`FormDefinitionStore.acquireServiceMutationLock(serviceId)`:

`pg_advisory_xact_lock(hashtextextended(serviceId, 0))`

Requirements: active transaction; strict `serviceId` admission before SQL;
identical SQL/key on every participating path (not Java `String.hashCode`).

**Clone order:** admit → acquire lock → first source load → verify
published/retired + ETag → allocate → detached candidate → C1 validate → create.
There is no pre-lock source load. Source immutability is proven by detached
copying, the shared lock, and post-commit fresh reads in integration tests.

**Lifecycle order:** admit → acquire the same lock → load → verify ETag/transition
→ validate → atomic update + event.

Draft PUT continues to use `@Version` only (clone sources are never draft).

### C4 ProblemDetail codes

| Code                               | HTTP |
| ---------------------------------- | ---- |
| `invalid_transition_request`       | 400  |
| `invalid_actor`                    | 400  |
| `lifecycle_transition_not_allowed` | 409  |
| `source_not_cloneable`             | 409  |
| `version_exhausted`                | 409  |

Plus C2/C3 codes (`if_match_required`, `stale_revision`, `validation_failed`, …).

### Deferred (post-C5)

Production authn/z (JWT/Keycloak), DST governance workflow contract, deployment,
and design-spec §5 live real-service acceptance. FB-E1 adds a **separate**
fail-closed governance API for technical approve/publish — it does **not**
secure the existing technical lifecycle endpoint or implement DST. See
[`unit-e.md`](./unit-e.md).

List/latest-published APIs and Unit C package acceptance are delivered — see
the FB-C5 section above.

## FB-C3 — validation-gated draft replacement + optimistic concurrency

C3 adds **full document replacement** of existing drafts only. Clients must
retain and send the opaque ETag from create/read/update. Non-draft rows are
immutable through this API.

ETag parsing is canonical (FB-C4 hardening): exact unpadded Base64URL from
`format()`, reject padding/alternate encodings/negative revisions; snapshot
`definition()` returns a defensive deep copy.

| Method | Path                                           | Behavior                                            |
| ------ | ---------------------------------------------- | --------------------------------------------------- |
| POST   | `/api/v1/form-definitions/validation`          | Pure C1 validate; HTTP 200; never persists          |
| POST   | `/api/v1/form-definitions`                     | Validate → draft create; 201 + ETag + Location      |
| GET    | `/api/v1/form-definitions?serviceId=&version=` | Exact read; 200 + ETag                              |
| PUT    | `/api/v1/form-definitions?serviceId=&version=` | If-Match + validate → draft replace; 200 + new ETag |

Successful create/read/update responses include `ETag` (strong quoted opaque
token) and `Cache-Control: no-store`. `lockVersion` is never exposed in JSON.

### PUT ordering

1. Admit query coordinates
2. Parse If-Match (missing → 428; weak/wildcard/multiple/malformed/padded → 400)
3. Load snapshot + revision
4. Require stored `status=draft` (else 409 `definition_not_editable`)
5. Compare revision (mismatch → 412 `stale_revision`)
6. Deep-copy + full C1 pipeline (invalid → 422; **no write**)
7. Require body `status=draft`
8. Body `serviceId`/`version` must exactly match query/stored
9. `audit.createdBy` / `audit.createdAt` must exactly match stored
10. Managed-entity JSON replace + `@Version` flush
11. Return detached document + new ETag

No-op semantic equality: still validates; does **not** bump revision or
`updated_at`. Concurrent PUTs with the same ETag: exactly one winner.

### C3 ProblemDetail codes

| Code                               | HTTP |
| ---------------------------------- | ---- |
| `if_match_required`                | 428  |
| `invalid_if_match`                 | 400  |
| `stale_revision`                   | 412  |
| `definition_not_editable`          | 409  |
| `definition_coordinate_mismatch`   | 409  |
| `update_requires_draft`            | 422  |
| `immutable_creation_audit_changed` | 409  |

Plus existing C2 codes. Never expose submitted JSON, ETag internals,
`lockVersion`, SQL, stacks, or stored field values.

## FB-C2 — validation-wired draft create/read REST

C2 exposed validate + draft create + exact read. C3 extends it with PUT/ETag.
Create remains create-only; the validation endpoint remains pure.

Deployed under context path `/form-definition-service`.

### Validation-before-persistence

- External creates/updates go through `FormDefinitionCommandService`
- C1 `FormDefinitionValidationPipeline` runs **before** any store write
- Only `status=draft` may be created or replaced externally
- `FormDefinitionStore` remains **unwired** to the validator (internal tests OK)

### Application layer

- `FormDefinitionValidationService` — deep-copy + pure pipeline
- `FormDefinitionCommandService` — validate-before-create/replace ordering
- `FormDefinitionQueryService` — strict query coordinates + detached snapshot
- Controllers never call repositories / `EntityManager` directly
- `FormDefinitionSnapshot` carries definition + opaque revision for ETags

### Error contract (RFC 9457 ProblemDetail)

| Code                        | HTTP |
| --------------------------- | ---- |
| `malformed_json`            | 400  |
| `invalid_coordinates`       | 400  |
| `validation_failed`         | 422  |
| `create_requires_draft`     | 422  |
| `form_definition_not_found` | 404  |
| `duplicate_form_definition` | 409  |
| `stored_definition_corrupt` | 500  |

`application/problem+json` only. Never stack traces, SQL, submitted definitions,
field values, or exception detail. Issues appear only for `validation_failed`.

### Strict JSON / coordinates

- Duplicate JSON keys rejected (`STRICT_DUPLICATE_DETECTION`) → 400
- GET `version` must be canonical `[1-9][0-9]*` (no leading zeroes, signs,
  decimals, exponents, padding, overflow)
- `serviceId` admission without trim/coercion

## FB-C1 — five-stage pure validator

`FormDefinitionValidationPipeline.validate(JsonNode)` is a **pure**,
deterministic server-side pipeline. It never mutates the input, never throws for
malformed user documents, never persists, never logs form content, and never
performs network retrieval.

### Stages (always 1 → 2 → 3 → 4 → 5)

| Stage | Validator                        | Issue namespace |
| ----- | -------------------------------- | --------------- |
| 1     | `JsonSchemaMetaValidator`        | `schema.*`      |
| 2     | `PaletteProvenanceValidator`     | `palette.*`     |
| 3     | `BilingualCompletenessValidator` | `bilingual.*`   |
| 4     | `BindingIntegrityValidator`      | `binding.*`     |
| 5     | `StructuralSanityValidator`      | `structure.*`   |

`valid` is true only when there are no `error`-severity issues. Issue output is
capped (200) with a deterministic limit issue. Traversal depth ≤ 64 and JSON
nodes ≤ 10,000.

### Stage 1 — offline Draft 2020-12

- `$schema` must be exactly `https://json-schema.org/draft/2020-12/schema` (or
  trailing `#`)
- Validates against the library-bundled Draft 2020-12 meta-schema
- Local `$defs` / JSON Pointer `$ref` only; remote/file/classpath/custom-scheme
  refs rejected without outbound calls
- `format` annotations are **not** the meta-validation gate
- Dependency: `com.networknt:json-schema-validator:2.0.1` (Jackson 2; YAML
  excluded). Do **not** introduce 3.x (Jackson 3).
- Unknown-keyword warnings for governed `x-dg20` from NetworkNT are harmless;
  Stage 5 validates `x-dg20` separately.

### Controlled palette manifest + drift

Classpath resource:

`validation/controlled-palette-v1.json` — exactly **30** implemented widget
types with `widgetType`, `category`, `producesData`, `supportsRequired`,
`rjsfKind`.

Loaded by immutable `ControlledPaletteRegistry`.

Vitest drift test (npm side only):

`packages/form-widgets/tests/controlled-palette-server-drift.test.ts`

Maven never runs npm; npm never runs Maven.

### Canonical nested field paths

Server field-path collector mirrors FB-B3 / B3.1:

- Top-level property ID stays exact
- Nested segments escape `\ . [ ]`
- Array templates use `[]` (e.g. `family_members[].member_name`)
- Only `family-repeater` children are expanded; other composites stay one field

### Governed `x-dg20`

Unknown `x-dg20` keys rejected. Known keys validated against the owning widget.
Family-repeater structural rules enforced (`maxItems` 1..20, etc.).

## FB-C0.1 hotfix summary

- Shared strict `FormDefinitionCoordinateParser` for create, load, and find
- Create path uses `EntityManager.persist` + `flush` only (no Spring Data
  `save`/`merge`, no `existsById` TOCTOU preflight)
- Duplicate classification is SQLSTATE `23505` only
- Load verifies stored JSON with the same strict parser (no coercion shortcuts)
- Concurrency race: exactly one winner, one `DuplicateFormDefinitionException`

## C0 / C0.1 scope

`services/form-definition-service/` is a standalone **Maven / Spring Boot 3.3.4**
service (Java 17). It is **not** part of npm workspaces.

Package namespace: `org.magicsword.formdefinition`

### Delivered

- PostgreSQL 16 `egov_db`, schema `form_definition`, table `form_definitions`
- PK `(service_id, version)`, native `jsonb`, Flyway V1, `ddl-auto=validate`
- Optimistic locking via `lock_version`
- Create-only `FormDefinitionInsertAdapter`
- Testcontainers PostgreSQL 16 integration tests (including concurrency)
- FB-C1 pure five-stage validator + unit tests (no Spring context)
- FB-C2 validate / draft-create / exact-read REST + ProblemDetail
- FB-C3 draft PUT replacement with opaque ETag / If-Match optimistic concurrency
- FB-C4 technical lifecycle + Flyway V2 event log + new-draft version allocation
- FB-C4.1 shared service mutation lock (create / clone / lifecycle) before first load
- FB-C5 published-lookup + version-list REST, Flyway V3 release-head index,
  package-level acceptance suite (see `docs/unit-c-acceptance.md`)

### Strict coordinate rules

| Field       | Rules                                                                       |
| ----------- | --------------------------------------------------------------------------- |
| `serviceId` | JSON string; nonblank; no pad; ≤256 Unicode code points; never trim         |
| `version`   | Exact integral JSON number; positive; int range; reject `1.0`/`1.5`/strings |
| `status`    | Exact lowercase textual enum; no whitespace/coercion                        |

## Maven verification (Java 17 runtime)

```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
export DOCKER_HOST=unix://$HOME/.rd/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
mvn -f services/form-definition-service/pom.xml clean verify
```

Confirm dependency tree:

```bash
mvn -f services/form-definition-service/pom.xml dependency:tree
```

Expect `json-schema-validator:2.0.1` and Jackson **2** only (no Jackson 3).

Report the **runtime** Java version from the Spring Boot test log (e.g. Temurin
17.0.18), not only the compiler `--release 17` target.

## Flyway

V1 unchanged in C0.1 / C1 / C2 (no checksum rewrite). Hibernate never creates
production schema.

## Illustrative documents

Draft JSON in tests is **illustrative only** — not an authoritative catalogue
form. Do not copy Excel catalogues into Form-builder.
