# Unit E — Governance wiring (FB-E0 / FB-E1)

## FB-E0 audit decision (2026-07-26)

Read-only audit across Form-builder, citizen-portal, officer-portal, auth-service,
Digit-Core, and DIGIT-DevOps. Decision:

- Proceed with **Form-builder-scoped** governance backend foundation first (FB-E1)
- Do **not** invent a DST queue HTTP API
- Do **not** modify portals or DevOps in E1
- Existing technical `POST …/lifecycle-transitions` remains backward-compatible and
  **unauthenticated**
- Production IAM role mapping, real JWT/Keycloak validation, DST contract,
  deployment, and §5 remain **external/open**

## FB-E1 — Technical governance boundary

FB-E1 adds a **separate secured** officer-governance API under:

`/api/v1/form-definitions/governance/*`

### Capability model (provisional — not IAM)

| Capability                        | Use                    |
| --------------------------------- | ---------------------- |
| `READ_FORM_DEFINITION_GOVERNANCE` | Queue + detail         |
| `APPROVE_FORM_DEFINITION`         | `submitted → approved` |
| `PUBLISH_FORM_DEFINITION`         | `approved → published` |

Approve does **not** imply publish. Capabilities are application-layer enums, not
Keycloak roles.

### Principal port

`GovernancePrincipalProvider.currentPrincipal()` → optional
`GovernancePrincipal(actorId, capabilities)`.

- `actorId` admitted via existing `ActorIdAdmission`
- Default runtime bean: **fail-closed** (empty → `401 governance_unauthenticated`)
- No request-body `actorId` on secured transitions
- Principal/capabilities never appear in response bodies, ProblemDetail, or logs

### Optional profile `governance-technical` (NON-PRODUCTION)

May supply an exact configured technical principal for local E2 development.
Disabled by default. Prefer test `@Bean` injection for automated tests.
**Prohibited in production.**

### Endpoints

| Method | Path                                                               | Authz              |
| ------ | ------------------------------------------------------------------ | ------------------ |
| GET    | `/governance/queue?afterServiceId&afterVersion&limit`              | READ               |
| GET    | `/governance/detail?serviceId&version`                             | READ               |
| POST   | `/governance/lifecycle-transitions?serviceId&version` + `If-Match` | APPROVE or PUBLISH |

**Queue** returns metadata only (`serviceId`, `version`, `status` ∈ submitted|approved),
keyset pagination by `(service_id, version)`, default limit 50 / max 100, `limit+1`,
no `COUNT(*)`. Not a DST inbox.

**Detail** returns detached FormDefinition + strong ETag + `Cache-Control: no-store`
for submitted|approved only; C1 validated; generic
`governance_definition_not_found` otherwise.

**Lifecycle body:** `{ "targetStatus": "approved" | "published" }` only.
Actor derived from principal. Reuses `FormDefinitionLifecycleService` mutation /
locking / ETag / events.

### Explicit non-claims

- Queue is **derived from Form Definition Service status** — **not** the DST inbox
- Publish is a **technical local path** only
- Production must introduce the externally governed DST contract (§11.4)
- No outbox / retry / dead-letter / DST enqueue is claimed
- Existing `/lifecycle-transitions` remains technical/backward-compatible

### Flyway

`V4__form_definitions_governance_queue_idx.sql` — partial index on
`(service_id, version)` where status ∈ submitted|approved. V1–V3 unchanged.

### Authentication order (FB-E1.1)

Governance lifecycle must authenticate **before** If-Match or body admission:

1. `requireAuthenticated()` (single provider resolution)
2. validate If-Match
3. admit exact transition body
4. determine APPROVE vs PUBLISH capability
5. `require(principal, capability)` against the same principal
6. `transitionWithAdmittedActor(…, principal.actorId())`

Unauthenticated callers always receive `401 governance_unauthenticated`, even when
If-Match is missing or the body is invalid / contains `actorId`.

## Remaining open

| Item                                | Status                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Package-level Unit E (FB-E4)        | **COMPLETE (technical only)** — see [`unit-e-acceptance.md`](./unit-e-acceptance.md)                    |
| Real JWT/Keycloak validation        | **FB-E5.4.1 / E5.4.2A / E5.4.2B foundation** — see [`fds-governance-oidc.md`](./fds-governance-oidc.md) |
| IdP role assignment / issuer        | **External** (IAM/Keycloak owner)                                                                       |
| DST approval-queue contract         | **External**                                                                                            |
| Deployment / §5                     | **External**                                                                                            |
| Builder draft/validation IAM        | **FB-E5.4.2A foundation**                                                                               |
| Authenticated clone/submit          | **FB-E5.4.2B** — `/builder/…` paths; technical identity paths remain denyAll                            |
| Officer-hosted Builder UX           | **FB-E5.4.3A** — `/form-builder` + request-time provider                                                |
| Officer Builder FDS proxy allowlist | **FB-E5.4.3B** — exact Builder + governance paths; technical/actuator/published blocked                 |
| Retirement / reject / notifications | **Out of Unit E package scope**                                                                         |

**Package-level Unit E technical acceptance is COMPLETE.** Officer-governance OIDC
is FB-E5.4.1; Builder capability + token-provider foundation is FB-E5.4.2A;
authenticated Builder clone/submit is FB-E5.4.2B; officer-hosted Builder foundation
is FB-E5.4.3A.
Do not start FB-E5.4.3B (nginx), Builder login, DST, or §5 from this increment.
