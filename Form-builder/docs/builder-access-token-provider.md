# Builder access-token provider (FB-E5.4.2A / E5.4.2B / E5.4.3A)

> **Package foundation only.** No Builder login, no token storage, no production-ready claim.
> Host owns token acquisition, refresh, and logout.

## Host embed (FB-E5.4.3A)

Stable package entry for officer (and future) hosts:

| Export                                    | Purpose                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `@citizen/form-builder-app/embed`            | `BuilderShell` + `AccessTokenProvider` / `BuilderShellProps` types |
| `@citizen/form-builder-app/styles/embed.css` | Bundled Builder + widget + renderer CSS (no document chrome)       |

Packaging:

```bash
npm run pack:builder-embed    # → dist/vendor-packs/*.tgz + manifest
npm run verify:builder-embed  # sha256 / version drift (+ officer vendor when present)
```

Importing `./embed` must not mount React, read Vite actor env, or touch storage.
Standalone `main.tsx` remains separate (may use `VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID` for local non-prod only).

Officer-portal consumes the tarball via `file:vendor/dg20/…` and injects
`accessTokenProvider` only — never production `lifecycleActorId`.
See `officer-portal/docs/form-builder-hosting.md`.

## Public contract

| Export                                   | Purpose                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `AccessTokenProvider`                    | `() => string \| null \| Promise<string \| null>` |
| `admitAccessToken`                       | Admit raw credential (no `Bearer ` prefix)        |
| `resolveAccessTokenAuthorizationHeaders` | Request-time resolve → `{ Authorization }`        |
| `AccessTokenUnauthenticatedError`        | Typed local failure (`code: 'unauthenticated'`)   |

Module: `apps/form-builder/src/auth/`

## Admission rules

- nonblank, bounded length
- no whitespace / control / CR/LF
- no supplied `Bearer ` prefix
- no JWT decode or claim inspection

Missing, unsafe, or throwing provider → local unauthenticated, **zero fetch**.

## Adapter wiring

Optional `accessTokenProvider` on:

- `createHttpFormDefinitionValidationAdapter`
- `createHttpFormDefinitionDraftPersistenceAdapter`
- `createHttpFormDefinitionLifecycleAdapter`
- `createHttpFormDefinitionVersionManagementAdapter`

Resolve **at request time** immediately before `fetch`. Preserve `If-Match`, AbortSignal, response admission.

### Authenticated clone / submit (FB-E5.4.2B)

Default HTTP adapters call:

| Operation | Path                                   | Body                            |
| --------- | -------------------------------------- | ------------------------------- |
| Clone     | `POST …/builder/drafts/from-version`   | `{}`                            |
| Submit    | `POST …/builder/lifecycle-transitions` | `{ targetStatus: 'submitted' }` |

Production HTTP bodies never include `createdBy` or `actorId`. `lifecycleActorId` / Vite technical actor remain for injected non-OIDC acceptance adapters only.

## BuilderShell

Optional prop `accessTokenProvider`. **No default.** Default HTTP adapters rebuild when provider identity changes. Explicitly injected domain adapters are never wrapped.

Local authoring/preview remains available without a provider. Remote Validate/Save/Load/Versions/Clone/Submit fail closed.

`VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID` remains non-production technical actor only — **not authentication**.

## FDS under `governance-oidc`

Protected with dedicated Builder capabilities (see `docs/fds-governance-oidc.md`):

- validation, draft create/read/replace, version list
- authenticated `/builder/…` clone + submit (E5.4.2B)

**Denied** (technical identity-bearing paths):

- `POST …/drafts/from-version`
- `POST …/lifecycle-transitions`

## Explicit non-claims

- No Builder login / PKCE in package
- No Vite token environment variable
- Real Keycloak client, role grants, issuer, and hosting remain external
- Safe rollback = fail closed (never restore production body `actorId` / `createdBy`)
