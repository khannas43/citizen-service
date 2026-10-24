# Officer-hosted Form Builder (FB-E5.4.3A)

Mounts the DG2.0 Form Builder package at authenticated route **`/form-builder`**.

## Ownership

| Concern | Owner |
| --- | --- |
| Officer session / `officer_token` | officer-portal (existing password-grant + localStorage model) |
| Request-time Bearer callback | `provideOfficerBuilderAccessToken` → `BuilderShell.accessTokenProvider` |
| JWT validation / capabilities | Form Definition Service (`governance-oidc`) |
| UX nav/route gate | `officerHasBuilderUxAccess` (Builder `FDS_*` roles only) |

Builder does **not** store tokens, decode JWTs, or receive `lifecycleActorId` from this host.

## Route and navigation

- Path: `/form-builder`
- Sidebar label: **Form Builder** (shown only when UX admission passes)
- Unauthenticated visitors hit the existing officer login gate
- Authenticated users without Builder roles see access-denied guidance (no role/token leakage)

Approved UX roles (any one):

`FDS_DEFINITION_VALIDATOR`, `FDS_DRAFT_CREATOR`, `FDS_DEFINITION_READER`,
`FDS_DRAFT_EDITOR`, `FDS_VERSION_READER`, `FDS_DRAFT_CLONER`, `FDS_FORM_SUBMITTER`

Governance roles and portal roles such as `IT_ADMIN` alone do **not** grant Builder UX access.
Builder roles do **not** imply governance navigation.

## Package consumption

| Package | Path |
| --- | --- |
| `@dg20/form-builder-app` | `vendor/dg20/dg20-form-builder-app-0.1.0.tgz` |

Refresh from Form-builder:

```bash
# in Form-builder
npm run pack:builder-embed
cp dist/vendor-packs/dg20-form-builder-app-0.1.0.tgz ../officer-portal/vendor/dg20/
npm run verify:builder-embed

# in officer-portal
npm install --legacy-peer-deps
```

Imports:

```js
import { BuilderShell } from '@dg20/form-builder-app/embed'
import '@dg20/form-builder-app/styles/embed.css'
```

## Explicit limitations

- Officer nginx allowlists governance **and** authenticated Builder FDS paths
  (FB-E5.4.3B). Technical clone/lifecycle and citizen published/latest remain
  blocked on this proxy.
- Inherited debt: password grant, localStorage session, no refresh — not solved here.
- No production-readiness, IAM client, or deployment claim.

## Related

- Form-builder: `docs/builder-access-token-provider.md`, `docs/fds-governance-oidc.md`
- Governance screen: `docs/form-definition-governance.md` (unchanged behaviour)
