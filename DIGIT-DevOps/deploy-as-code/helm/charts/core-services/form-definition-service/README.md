# form-definition-service (FB-E5.2)

Render-only Helm chart foundation for the DG 2.0 Form Definition Service.

## Status

- **Not deployed.** This increment only supports `helm lint` / `helm template`.
- **No image push.** Image repository/tag values are provisional placeholders.
- **No environment overlays** were modified for this chart.
- **No Zuul whitelist**, portal nginx, IAM, DST, or §5 work.

## Dependency

Uses the local DIGIT `common` chart (`0.0.5`) for name/label/image helpers and
the shared ingress template. The Deployment is **chart-local** so security
context, startup probe, `terminationGracePeriodSeconds`, and `/tmp` emptyDir
can be expressed without modifying `common`.

## Defaults (provisional)

| Item | Default |
| --- | --- |
| Replicas | `1` (non-production placeholder) |
| Port | `8080` |
| Context | `/form-definition-service` |
| Ingress | **disabled** |
| Zuul route annotation | **absent** unless `ingress.zuul=true` |
| UID/GID | `10001` |
| Root filesystem | read-only + `/tmp` emptyDir |
| DB | ConfigMap/Secret **references only** (no Secret objects) |
| Flyway | Application startup V1–V4 (no init migration container) |
| `JAVA_TOOL_OPTIONS` | empty |
| Profiles | **never** `governance-technical` |

## Governance

Governance endpoints remain **fail-closed** (`401 governance_unauthenticated`)
until production IAM and gateway policy exist. This chart must not:

- set `SPRING_PROFILES_ACTIVE=governance-technical`
- expose a governance actor setting
- whitelist public governance routes

## Database references

Overrideable existing references (no credential values in the chart):

- URL: ConfigMap `egov-config` / key `db-url`
- Username/password: Secret `db` / keys `username`, `password`
- Optional Flyway credentials: `db.flyway.enabled` + Secret key refs

PostgreSQL major version, DBA grants, and secret ownership remain **external
decisions** (see Form-builder `docs/fds-helm-chart.md`).

## Render verification

From Form-builder:

```bash
npm run e5.2:verify
```

Override DevOps root if needed:

```bash
export DIGIT_DEVOPS_ROOT=/path/to/DIGIT-DevOps
npm run e5.2:verify
```

## Explicit non-goals

Helm install/upgrade, kubectl apply, docker push, environment-overlay edits,
gateway/portal changes, production sizing, and approved image digests.
