# Form Definition Service Helm chart (FB-E5.2)

> **Render-only foundation.** No Helm install/upgrade, no kubectl apply, no image
> push, and no shared-environment deployment occurred in this increment.

## Chart location

```text
DIGIT-DevOps/deploy-as-code/helm/charts/core-services/form-definition-service/
```

Depends on the local DIGIT `common` chart `0.0.5` (`file://../../common`) for
name/label/image helpers and the shared ingress template. The Deployment is
**chart-local** so security context, startup probe, grace period, and `/tmp`
emptyDir can be expressed without modifying `common`.

## Verify (Form-builder)

Requires a locally installed `helm` binary.

```bash
# Optional override (default: sibling ../DIGIT-DevOps)
export DIGIT_DEVOPS_ROOT=/path/to/DIGIT-DevOps

npm run e5.2:verify
```

The verifier copies **only** the FDS chart and `common` into a temporary
directory, then runs `helm dependency build`, `helm lint`, and `helm template`.
It never mutates the source chart and deletes the temp directory in `finally`.

## What the default render includes

- `Deployment` + ClusterIP `Service`
- **No Ingress** (disabled by default)
- Port **8080**
- Probes:
  - liveness `/form-definition-service/actuator/health/liveness`
  - readiness `/form-definition-service/actuator/health/readiness`
  - startup `/form-definition-service/actuator/health`
- Pod/container security: non-root **10001**, read-only root, no privilege
  escalation, drop `ALL`, `seccompProfile: RuntimeDefault`, `/tmp` emptyDir
- Datasource URL/username/password via existing ConfigMap/Secret **references**
- Application-startup Flyway V1–V4 (no init migration container)

## Explicit chart prohibitions

- No `SPRING_PROFILES_ACTIVE=governance-technical`
- No governance actor settings
- No Secret resources or credential literals
- No Docker socket / hostPath / privileged / PVC
- No Zuul whitelist or public governance policy

Governance remains **fail-closed** until production IAM exists.

## Ingress / Zuul (disabled by default)

When explicitly enabled for non-deploy render checks:

- path `/form-definition-service` (not rewritten / stripped)
- Zuul backend convention (`service: zuul`, port `8080`)
- Service annotation `zuul/route-path: form-definition-service` only when
  `ingress.zuul=true`

This increment does **not** edit Zuul charts, environment overlays, portal
nginx, or ingress-controller configuration.

## External decisions still blocking deployment

| Decision                                             | Why it blocks                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| Approved image registry + immutable digest           | Chart tag is provisional (`e5.2-render-only`)                   |
| PostgreSQL major version vs FDS PG16 baseline        | Platform postgres chart defaults to 9.6; RDS version undeclared |
| DBA schema/grants / secret ownership                 | Chart only references `egov-config` + `db`                      |
| IAM + gateway exposure policy                        | Draft/governance/technical APIs must stay closed                |
| Forward-only Flyway V1–V4                            | Image rollback ≠ DB rollback; no down migrations                |
| Common-chart securityContext wiring (optional later) | FDS uses chart-local Deployment for hardening today             |

## Related

- Container image: [`fds-containerization.md`](./fds-containerization.md)
- Architecture: [`architecture.md`](./architecture.md)
- Integration assumptions: [`integration-assumptions.md`](./integration-assumptions.md)
- Chart README: `DIGIT-DevOps/.../form-definition-service/README.md`
