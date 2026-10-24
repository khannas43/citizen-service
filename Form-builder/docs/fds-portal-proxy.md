# Portal Form Definition Service proxy (FB-E5.3A / E5.3A.1 / E5.4.3B)

> **Least-privilege same-origin nginx proxy.** No deployment, no portal image
> push, no Helm/kubectl, no DIGIT-DevOps/Zuul/IAM/DST/§5 work.

## What changed

Officer and citizen portals each have:

- `nginx/form-definition-service-location.conf.template` (exact-path allowlist)
- one `include` in the existing `nginx.conf` server block
- runtime-stage Dockerfile envsubst settings for
  `FORM_DEFINITION_SERVICE_UPSTREAM`

Portal React/Vite application source is unchanged by the proxy increments.

## Runtime upstream

| Variable                           | Default (non-production)              |
| ---------------------------------- | ------------------------------------- |
| `FORM_DEFINITION_SERVICE_UPSTREAM` | `http://form-definition-service:8080` |

Override at container start without rebuilding portal assets.

## Least-privilege allowlists

| Portal  | Allowed                                                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Citizen | `GET …/published/latest` only                                                                                                                               |
| Officer | Governance queue/detail/lifecycle **plus** Builder validation, draft create/get/replace, versions, authenticated `/builder/…` clone and submit (FB-E5.4.3B) |

Officer still **blocks** actuator, technical `…/drafts/from-version`, technical
`…/lifecycle-transitions`, and `published/latest`. Wrong methods on allowlisted
paths return **405** locally.

## Contract (allowed routes)

- Path-preserving proxy (prefix not stripped); query strings preserved
- Forward `Authorization` and `If-Match` when present
- Preserve upstream `ETag`
- Force `Cache-Control: no-store`
- Preserve upstream `401` / `403` / `404` / `409` / `412` / `422` / `428`
- No CORS headers added by nginx
- Existing SPA and service proxy routes unchanged aside from the include

## Security boundary

nginx does not authenticate. FDS remains authoritative for authorization
failures on allowlisted routes. Governance remains fail-closed without a valid
FDS principal. This proxy does **not** enable `governance-technical`.

## Verify

Requires Docker/Rancher locally:

```bash
export DOCKER_HOST=unix://$HOME/.rd/docker.sock
npm run e5.3a:verify
```

## Related

- Portal docs: `officer-portal/docs/form-definition-service-proxy.md`,
  `citizen-portal/docs/form-definition-service-proxy.md`
- Officer Builder hosting: `officer-portal/docs/form-builder-hosting.md`
- Helm render-only chart: [`fds-helm-chart.md`](./fds-helm-chart.md)
- Container image: [`fds-containerization.md`](./fds-containerization.md)
