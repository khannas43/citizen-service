# Form Definition Service same-origin proxy (FB-E5.3A / E5.3A.1 / E5.4.3B)

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

## Allowed routes

### Governance (FB-E5.3A.1)

| Method | Path |
| --- | --- |
| `GET` | `/form-definition-service/api/v1/form-definitions/governance/queue` |
| `GET` | `/form-definition-service/api/v1/form-definitions/governance/detail` |
| `POST` | `/form-definition-service/api/v1/form-definitions/governance/lifecycle-transitions` |

### Authenticated Builder (FB-E5.4.3B)

| Method | Path |
| --- | --- |
| `POST` | `/form-definition-service/api/v1/form-definitions/validation` |
| `POST` | `/form-definition-service/api/v1/form-definitions` |
| `GET` | `/form-definition-service/api/v1/form-definitions` |
| `PUT` | `/form-definition-service/api/v1/form-definitions` |
| `GET` | `/form-definition-service/api/v1/form-definitions/versions` |
| `POST` | `/form-definition-service/api/v1/form-definitions/builder/drafts/from-version` |
| `POST` | `/form-definition-service/api/v1/form-definitions/builder/lifecycle-transitions` |

All other `/form-definition-service/*` paths and wrong HTTP methods are rejected
**locally** (403 / 405) and never reach FDS. Actuator, technical
`…/drafts/from-version`, technical `…/lifecycle-transitions`, and
`published/latest` are not proxied on the officer portal.

## Path preservation

Allowed browser calls stay same-origin. nginx proxies to the matching upstream
path under `${FORM_DEFINITION_SERVICE_UPSTREAM}` without stripping
`/form-definition-service`. Query strings are preserved.

## Validators and caching

On allowed routes:

- `Authorization` is forwarded when present (not interpreted by nginx)
- `If-Match` is forwarded exactly
- Upstream `ETag` is passed through unchanged
- Portal forces `Cache-Control: no-store`
- Upstream `401` / `403` / `404` / `409` / `412` / `422` / `428` are preserved

## Authorization boundary

nginx does **not** authenticate or authorize Form Definition Service requests.
FDS remains authoritative for `401` / `403` on allowed routes.
This proxy does **not** enable `governance-technical` and does **not** grant
public governance or Builder exposure beyond the exact allowlist.

## Rollback

Restore the prior portal image / nginx configuration (remove Builder locations
from the template, or roll back the portal container image).

## Non-claims

Not production IAM, not Zuul/DIGIT-DevOps changes, not DST, not §5 live-service
acceptance, not a deployment.
