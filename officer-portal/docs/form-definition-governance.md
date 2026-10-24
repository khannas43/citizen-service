# Form Definition Governance (FB-E2)

Technical Officer Portal integration for Form Definition Service governance APIs
introduced in Form-builder FB-E1 / FB-E1.1.

## Route

- Path: `/form-definitions`
- Sidebar label: **Form Definitions**
- Available to all authenticated Officer Portal users in this technical increment
- Backend authorization remains authoritative (`401` / `403` from FDS)

This screen is **not** the Task Queue and does not use `/tasks`.

## Local development proxy

Vite proxies:

| Browser path | Target env | Default |
| --- | --- | --- |
| `/form-definition-service` | `VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET` | `http://localhost:8080` |

Optional base URL override:

- `VITE_FORM_DEFINITION_SERVICE_BASE_URL` (default: `/form-definition-service`)

Example with the Officer Portal mock:

```bash
npm run e2:mock
# separate terminal
VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET=http://127.0.0.1:18080 npm run dev
```

Then open `/form-definitions` after Officer Portal login.

## Bearer token (FB-E5.4.1)

The HTTP governance adapter sends `Authorization: Bearer <token>` on queue,
detail, and transition requests. The default provider reads `officer_token` from
`localStorage` **at request time** (via `getOfficerAccessToken()`). Tokens are
admitted locally (nonblank, bounded, no whitespace/CRLF) before any fetch.
Missing/unsafe tokens fail as `unauthenticated` with **zero** network calls.

The adapter does **not** decode JWT claims. FDS validates RS256 JWTs under
profile `governance-oidc` (audience `form-definition-service`, actor=`sub`,
roles from `realm_access.roles`: `FDS_GOVERNANCE_READER` /
`FDS_FORM_APPROVER` / `FDS_FORM_PUBLISHER`). Portal UI roles do not grant FDS
capabilities.

Issuer URI remains an external runtime value on FDS (`FDS_OIDC_ISSUER_URI`).
This increment does not deploy IAM or claim production readiness.

## Explicit non-claims

- Queue rows are **Form Definition Service status-derived** (`submitted` / `approved`) — **not** a DST inbox
- Publish is the **technical local lifecycle path** only — not DST acknowledgement
- `governance-technical` Form-builder profile is **non-production only**
- Capabilities (`READ` / `APPROVE` / `PUBLISH`) are enforced by FDS — portal role names do not grant authority
- This increment does **not** include nginx, Kubernetes, gateway, or DIGIT-DevOps changes
- Do not claim the Officer Portal is production-authorized without FDS `governance-oidc` + IdP role assignment

## Related: Form Builder host (FB-E5.4.3A)

Authenticated `/form-builder` mounts the Form Builder package embed with a
request-time token provider. See [`form-builder-hosting.md`](./form-builder-hosting.md).
Governance route/navigation behaviour is unchanged. Nginx Builder FDS allowlist
is **not** included in E5.4.3A.

## Adapter

Injectable port: `FormDefinitionGovernanceAdapter`

- `listQueue`
- `loadDetail`
- `transition`

Default HTTP adapter calls:

- `GET …/api/v1/form-definitions/governance/queue`
- `GET …/api/v1/form-definitions/governance/detail`
- `POST …/api/v1/form-definitions/governance/lifecycle-transitions` with `If-Match` and body `{ "targetStatus": "approved" | "published" }` only

ETags are admitted and retained in memory only — never rendered or persisted to `localStorage`.

## Integrity (FB-E2.1)

- Injected adapter results are **cloned before inspection** (depth ≤ 64, ≤ 10 000 nodes)
- Exact adapter envelopes: queue `{ items, nextCursor }`; detail/transition `{ definition, etag, fieldOrder }`
- `fieldOrder` must match recomputed `ui:order` exactly
- Lifecycle audit keys are exact per status (submitted / approved / published)
- Load More rejects overlapping/replayed pages (no silent dedupe)
- Mutation results are ignored after Back, detail switch, adapter replacement, or unmount

## Verification

```bash
npm run test:run
npm run e2:mock
# optional UI:
# E2_PORTAL_URL=http://127.0.0.1:5173 E2_MOCK_URL=http://127.0.0.1:18080 npm run e2:verify
npm run e2:verify
```

STOP after FB-E2 — citizen-portal FB-E3 is out of scope.
