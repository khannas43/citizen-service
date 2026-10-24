# Form Definition Service same-origin proxy (FB-E5.3A / E5.3A.1)

> **Least-privilege proxy only.** No deployment, no image push, no IAM/gateway/§5 work.

## Runtime configuration

| Variable | Purpose | Non-production default |
| --- | --- | --- |
| `FORM_DEFINITION_SERVICE_UPSTREAM` | Upstream origin for FDS | `http://form-definition-service:8080` |

Substitution is limited by:

```text
NGINX_ENVSUBST_FILTER=^FORM_DEFINITION_SERVICE_UPSTREAM$
NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/form-definition-service
```

Template: `nginx/form-definition-service-location.conf.template`  
Included from `nginx.conf` as: `include /etc/nginx/form-definition-service/*.conf;`

## Allowed routes (FB-E5.3A.1)

Citizen portal proxies **only**:

| Method | Path |
| --- | --- |
| `GET` | `/form-definition-service/api/v1/form-definitions/published/latest` |

All other `/form-definition-service/*` paths and wrong HTTP methods are rejected
**locally** (403 / 405) and never reach FDS. Actuator, validation, draft CRUD,
versions, cloning, governance, and technical `actorId` lifecycle are not
proxied. Legacy `/apply/*` SPA routes are unchanged.

## Path preservation

Allowed browser calls stay same-origin. nginx proxies to the matching upstream
path under `${FORM_DEFINITION_SERVICE_UPSTREAM}` without stripping
`/form-definition-service`. Query strings (for example `serviceId`) are preserved.

## Validators and caching

On the allowed route:

- `Authorization` is forwarded when present (not interpreted by nginx)
- `If-Match` is forwarded exactly
- Upstream `ETag` is passed through unchanged
- Portal forces `Cache-Control: no-store`

## Authorization boundary

nginx does **not** authenticate or authorize Form Definition Service requests.
FDS remains authoritative for `401` / `403` on the allowed published-read route.
Governance stays fail-closed without a valid FDS principal provider and is **not**
exposed on the citizen portal. This proxy does **not** enable
`governance-technical`. Citizen published-read production IAM/policy remains
external.

## Rollback

Restore the prior portal image / nginx configuration (remove the include and
template, or roll back the portal container image).

## Non-claims

Not production IAM, not Zuul/DIGIT-DevOps changes, not DST, not §5 live-service
acceptance, not a deployment.
