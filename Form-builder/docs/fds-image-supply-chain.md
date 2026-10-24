# Form Definition Service image supply chain (FB-E5.5.1)

> **Local verification only.** No image push, no registry promotion, no Helm
> install, no kubectl, and no production digest claim.

## Immutable base-image policy

Official Docker Hub **library** manifest-list (index) digests were resolved with
`docker buildx imagetools inspect` on **2026-07-29** and pinned in
`services/form-definition-service/Dockerfile` as `tag@sha256:…`:

| Stage   | Reference                        | Index digest                                                              | Platforms observed                         |
| ------- | -------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| Build   | `maven:3.9.9-eclipse-temurin-17` | `sha256:f58d59b6273e785ac0a4477f6e9b5ba1d7731c75b906c0f7b34076f1851318cc` | `linux/amd64`, `linux/arm64` (plus others) |
| Runtime | `eclipse-temurin:17-jre-jammy`   | `sha256:475d8e96b4b2bfe08999e5e854755c773af1581acdf959a4545d88f0696a2339` | `linux/amd64`, `linux/arm64` (plus others) |

Java **17** and Maven **3.9.9** were not changed. Re-resolve and update the
Dockerfile + this document together when bases must be refreshed.

Base-index multi-arch support is **not** proof that the FDS application image
is multi-architecture.

## Runtime hardening retained

- Multi-stage jar-only runtime (`/app/app.jar`)
- Non-root `USER 10001:10001`
- Exec-form `ENTRYPOINT ["java","-jar","/app/app.jar"]`
- `STOPSIGNAL SIGTERM`, `EXPOSE 8080`
- No embedded credentials, Spring profiles, or OIDC env
- Read-only-root compatible; writable `/tmp` supplied at run time (tmpfs/emptyDir)
- No curl/shell/package-manager additions for health checks
- OCI labels: title, description, vendor/project, increment; no fabricated
  timestamps or VCS revisions

## Local verifier

```bash
export DOCKER_HOST=unix://$HOME/.rd/docker.sock
npm run e5.5.1:verify
```

Requires Docker engine, `docker buildx`, and **Docker Scout**.

- If the `docker scout` CLI is missing, verification **fails** (scans are never
  silently skipped; Scout is not auto-installed).
- **CVE analysis** additionally requires a local Docker Hub login
  (`docker login` or Docker Desktop). The verifier never accepts credentials as
  arguments and never stores secrets. SBOM generation may succeed without login;
  CVE cannot be skipped when auth is missing.

| Env               | Default   | Meaning                                         |
| ----------------- | --------- | ----------------------------------------------- |
| `E551_KEEP_IMAGE` | `0`       | When `1`, retain the run-scoped local image tag |
| `E551_OUTPUT_DIR` | OS temp   | Parent directory for temporary SBOM/CVE files   |
| `E551_TIMEOUT_MS` | `1200000` | Overall referenced timeout                      |

Scripts:

- `scripts/e5.5.1-image-supply-chain-core.mjs`
- `scripts/e5.5.1-image-supply-chain.mjs`
- `scripts/e5.5.1-image-supply-chain.test.mjs`

Lifecycle: build run-scoped tag `dg20/form-definition-service:e5.5.1-local-<id>`
→ inspect → Java probe → Scout SPDX SBOM → Scout SARIF CVEs → SUMMARY →
`finally` deletes only the temp output directory and (unless kept) that image
tag. Never pushes. Never removes unrelated images/containers/networks/builders.

Generated SBOM/CVE files are **evidence for the run** and are deleted afterward;
do not commit them unless explicitly requested.

## SBOM / CVE policy

- SBOM covers the **final runtime image** (base OS packages + application jar /
  packaged dependencies as reported by Scout).
- Maven/build-stage tooling is **not** part of the runtime image.
- **Critical** findings block acceptance unless a later increment explicitly
  reviews and waives them. **No waiver is authorized in FB-E5.5.1.**
- **High/medium** findings are reported and require ownership; highs are not
  silently omitted from the SUMMARY (`PASS_WITH_HIGH_FINDINGS` when critical=0).
- Scanner results depend on Scout’s vulnerability database freshness and network
  access to that database.
- An SBOM is evidence of inventory, **not** a guarantee of absence of
  vulnerabilities.
- Application dependency patches are out of scope unless a directly exploitable
  critical forces a stop-and-report before expanding scope.

## Architecture policy

| Claim                                              | Status                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Pinned bases support `linux/amd64` + `linux/arm64` | Verified via registry index metadata                                                                    |
| Local FDS image multi-arch                         | **Not claimed** unless both platform images are built and inspected                                     |
| Future CI                                          | Must build/test/scan `linux/amd64` and `linux/arm64`, then publish a manifest list only after both pass |
| Production cluster arch                            | External platform-owner decision                                                                        |

## Digest and tag policy

| Item                             | Policy                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Local verification tags          | `dg20/form-definition-service:e5.5.1-local-<runId>` (and smoke `e5.1-local`)  |
| Base images                      | Immutable `tag@sha256` pins in Dockerfile                                     |
| Production image                 | Must later be referenced by **registry digest** after approved CI build/push  |
| Helm chart                       | Still provisional (`e5.2-render-only`); **intentionally untouched** in E5.5.1 |
| Signing / provenance / promotion | External / later increments                                                   |
| Production digest today          | **None** — no approved push has occurred                                      |

## Remaining work (do not start here)

- **FB-E5.5.2+** Helm runtime contract (OIDC env wiring, digest field, overlays)
- Image signing, provenance attestations, registry promotion
- CI multi-arch matrix and production digest publication
- Vulnerability waivers (only under explicit later authorization)
