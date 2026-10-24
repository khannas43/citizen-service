# Form Definition Service — Officer-governance + Builder OIDC

> **Foundation only.** No live IAM calls, no deployment, no production-ready claim.
> Issuer remains externally supplied at runtime.

## Approved non-secret contract

| Item            | Value                                                   |
| --------------- | ------------------------------------------------------- |
| Model           | OAuth2 Resource Server (Bearer JWT)                     |
| Algorithm       | **RS256 only**                                          |
| Audience        | `form-definition-service`                               |
| Actor           | JWT `sub` (immutable `actorId`)                         |
| Role claim path | `realm_access.roles` (Keycloak officer realm structure) |
| Profile         | `governance-oidc`                                       |

### Governance roles → capabilities (FB-E5.4.1)

| Keycloak realm role     | Capability                        |
| ----------------------- | --------------------------------- |
| `FDS_GOVERNANCE_READER` | `READ_FORM_DEFINITION_GOVERNANCE` |
| `FDS_FORM_APPROVER`     | `APPROVE_FORM_DEFINITION`         |
| `FDS_FORM_PUBLISHER`    | `PUBLISH_FORM_DEFINITION`         |

Approve does **not** imply publish. Officer UI roles (`IT_ADMIN`, etc.) are ignored.

### Builder roles → capabilities (FB-E5.4.2A / E5.4.2B)

| Keycloak realm role        | Capability / Spring authority     |
| -------------------------- | --------------------------------- |
| `FDS_DEFINITION_VALIDATOR` | `VALIDATE_FORM_DEFINITION`        |
| `FDS_DRAFT_CREATOR`        | `CREATE_FORM_DEFINITION_DRAFT`    |
| `FDS_DEFINITION_READER`    | `READ_FORM_DEFINITION_COORDINATE` |
| `FDS_DRAFT_EDITOR`         | `REPLACE_FORM_DEFINITION_DRAFT`   |
| `FDS_VERSION_READER`       | `LIST_FORM_DEFINITION_VERSIONS`   |
| `FDS_DRAFT_CLONER`         | `CLONE_FORM_DEFINITION_DRAFT`     |
| `FDS_FORM_SUBMITTER`       | `SUBMIT_FORM_DEFINITION`          |

No implied grants. Governance roles grant **zero** Builder authorities and vice versa.

## Runtime properties (names only)

| Property / env                                                                     | Purpose                                         | Default                   |
| ---------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------- |
| `form-definition.security.oidc.issuer-uri` / `FDS_OIDC_ISSUER_URI`                 | OIDC issuer (mandatory under `governance-oidc`) | _(none)_                  |
| `form-definition.security.oidc.audience` / `FDS_OIDC_AUDIENCE`                     | Exact audience                                  | `form-definition-service` |
| `form-definition.security.oidc.clock-skew-seconds` / `FDS_OIDC_CLOCK_SKEW_SECONDS` | Bounded skew (0–300)                            | `60`                      |
| `form-definition.security.production` / `FDS_SECURITY_PRODUCTION`                  | Production-safety flag                          | `false`                   |

Missing/blank issuer (or explicit blank audience) under `governance-oidc` **fails startup**.

## Filter-chain policy

Under `governance-oidc`:

| Matcher                                | Rule                                             |
| -------------------------------------- | ------------------------------------------------ |
| `GET …/published/latest`               | Anonymous                                        |
| Actuator health/info                   | Application-layer permit                         |
| `/governance/**`                       | Authenticated; app-layer governance capabilities |
| `POST …/validation`                    | `VALIDATE_FORM_DEFINITION`                       |
| `POST …/form-definitions`              | `CREATE_FORM_DEFINITION_DRAFT`                   |
| `GET …/form-definitions`               | `READ_FORM_DEFINITION_COORDINATE`                |
| `PUT …/form-definitions`               | `REPLACE_FORM_DEFINITION_DRAFT`                  |
| `GET …/versions`                       | `LIST_FORM_DEFINITION_VERSIONS`                  |
| `POST …/builder/drafts/from-version`   | `CLONE_FORM_DEFINITION_DRAFT` (E5.4.2B)          |
| `POST …/builder/lifecycle-transitions` | `SUBMIT_FORM_DEFINITION` (E5.4.2B)               |
| `POST …/drafts/from-version`           | **denyAll** (technical `createdBy` body)         |
| `POST …/lifecycle-transitions`         | **denyAll** (technical `actorId` body)           |

Trailing-slash variants are matched explicitly.

### Authenticated Builder clone / submit (FB-E5.4.2B)

| Endpoint                               | Body (exact)                   | Actor                         |
| -------------------------------------- | ------------------------------ | ----------------------------- |
| `POST …/builder/drafts/from-version`   | `{}`                           | `createdBy` = JWT `sub`       |
| `POST …/builder/lifecycle-transitions` | `{"targetStatus":"submitted"}` | `submittedBy` + event = `sub` |

Client `createdBy` / `actorId` / unexpected properties → generic `400` `invalid_transition_request`.
Order: auth → capability → If-Match → body admit → mutate. ETag / locking / audit contracts unchanged.

### Error codes

| Condition                                 | Code                         |
| ----------------------------------------- | ---------------------------- |
| Missing/invalid JWT on governance path    | `governance_unauthenticated` |
| Missing governance capability (app layer) | `governance_forbidden`       |
| Missing/invalid JWT on Builder path       | `builder_unauthenticated`    |
| Missing Builder authority                 | `builder_forbidden`          |
| denyAll technical clone/lifecycle         | `forbidden`                  |

All carry `Cache-Control: no-store`. No token/claim/role/capability leakage.

## Profile guards

Rejected at startup:

- `governance-oidc` + `governance-technical`
- production / `form-definition.security.production=true` + `governance-technical`

Safe rollback = deactivate OIDC → default **fail-closed** governance principal + non-OIDC package technical behavior.  
Rollback must **never** enable `governance-technical` or restore production body `actorId` / `createdBy`.

## Explicit non-claims

- Not deployed; issuer not shipped in-repo
- Not citizen IAM; published/latest remains anonymous
- Not Builder login / PKCE
- Not DST / §5
- Not DIGIT-DevOps / Zuul / nginx changes
