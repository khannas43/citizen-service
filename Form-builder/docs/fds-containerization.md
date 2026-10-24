# Form Definition Service containerization (FB-E5.1 / FB-E5.5.1)

> **Local / non-production container foundation only.**
>
> - **No deployment occurred** and **no image was pushed**.
> - No Helm, DIGIT-DevOps, nginx, portal, IAM, or DST configuration changed in
>   the container increments.
> - Profile `governance-technical` remains **prohibited in production** and is
>   **not activated** by this image or the smoke verifier.
> - Base images are pinned by digest (FB-E5.5.1). Production registry names and
>   final image digests still require **platform-security approval** and an
>   approved CI push (none exists yet).

## Immutable base-image policy (FB-E5.5.1)

| Stage   | Pinned reference                                                                                         |
| ------- | -------------------------------------------------------------------------------------------------------- |
| Build   | `maven:3.9.9-eclipse-temurin-17@sha256:f58d59b6273e785ac0a4477f6e9b5ba1d7731c75b906c0f7b34076f1851318cc` |
| Runtime | `eclipse-temurin:17-jre-jammy@sha256:475d8e96b4b2bfe08999e5e854755c773af1581acdf959a4545d88f0696a2339`   |

Resolved **2026-07-29** from official Docker Hub library indexes (platforms
include `linux/amd64` and `linux/arm64`). Full SBOM/CVE/architecture policy:
[`fds-image-supply-chain.md`](./fds-image-supply-chain.md).

## Image boundary

- Multi-stage build under `services/form-definition-service/Dockerfile`
- Runtime contains only `/app/app.jar` (Spring Boot executable)
- No source tree, Maven cache, tests, credentials, or `node_modules`
- Non-root UID/GID **10001**
- `EXPOSE 8080`, `STOPSIGNAL SIGTERM`
- Entrypoint: `java -jar /app/app.jar` (exec form)
- No hard-coded DB credentials or Spring profiles
- Host may supply `JAVA_TOOL_OPTIONS`
- Read-only root requires a writable `/tmp` mount at run time

Local tags:

```text
dg20/form-definition-service:e5.1-local          # smoke verifier
dg20/form-definition-service:e5.5.1-local-<id>  # supply-chain verifier (run-scoped)
```

## Runtime environment variable names (values never documented here)

| Name                         | Purpose                            |
| ---------------------------- | ---------------------------------- |
| `SPRING_DATASOURCE_URL`      | JDBC URL                           |
| `SPRING_DATASOURCE_USERNAME` | DB user                            |
| `SPRING_DATASOURCE_PASSWORD` | DB password                        |
| `SERVER_PORT`                | Optional; default 8080             |
| `JAVA_TOOL_OPTIONS`          | Optional JVM options from the host |

Do **not** set `SPRING_PROFILES_ACTIVE=governance-technical` outside explicitly labeled local non-production experiments.

## Health endpoint

With the configured servlet context path:

```text
GET /form-definition-service/actuator/health
GET /form-definition-service/actuator/health/liveness
GET /form-definition-service/actuator/health/readiness
```

## PostgreSQL 16 + Flyway

The smoke verifier uses ephemeral `postgres:16-alpine` and generated test-only
credentials. Flyway applies migrations **V1–V4** into schema `form_definition`
on startup (`create-schemas: true`). No persistent volume is required for smoke.

## Local build / run (manual)

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export DOCKER_HOST=unix://$HOME/.rd/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock

cd services/form-definition-service
docker build -t dg20/form-definition-service:e5.1-local .
```

Do not push. Supply datasource variables only at `docker run` time.

## Bounded smoke verifier (FB-E5.1 / E5.1.1)

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export DOCKER_HOST=unix://$HOME/.rd/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock

npm run e5.1:verify
```

Script: `scripts/e5.1-fds-container-smoke.mjs`

It will:

1. Require Docker/Rancher (no mock fallback)
2. Build `dg20/form-definition-service:e5.1-local`
3. Create a uniquely named temporary network
4. Start ephemeral Postgres 16
5. Start FDS with non-root, read-only root, tmpfs `/tmp`, dropped capabilities,
   `no-new-privileges`, and **without** `governance-technical`
6. Poll health, assert Flyway V1–V4, validate Unit E fixture, assert governance
   queue `401 governance_unauthenticated`
7. Inspect non-root user and absence of embedded secrets
8. SIGTERM / bounded `docker stop`
9. Always remove **only** the temporary containers/network for that run
10. Await the full smoke lifecycle (FB-E5.1.1); do not exit early after starting FDS
11. Keep the overall timeout referenced until completion; cleanup runs in `finally`
12. Ordinary success/failure sets `process.exitCode` (no `process.exit` on that path)

## Supply-chain verifier (FB-E5.5.1)

```bash
export DOCKER_HOST=unix://$HOME/.rd/docker.sock
npm run e5.5.1:verify
```

Requires Docker Scout. Builds a run-scoped local tag, generates an SPDX SBOM and
SARIF CVE report for the **final runtime image**, fails on unwaived criticals,
reports highs, and cleans only run-scoped temp files/image (unless
`E551_KEEP_IMAGE=1`). CVE analysis requires a local Docker Hub login; the
verifier never takes credentials and never skips the CVE gate. Details:
[`fds-image-supply-chain.md`](./fds-image-supply-chain.md).

## Non-root / read-only verification

The smoke run asserts:

- Configured and effective UID `10001`
- `--read-only` root filesystem with writable `/tmp` tmpfs
- No Docker socket mount
- No host bind mounts into the application container
- Image history/environment do not contain the test DB password or
  `governance-technical` activation

## Cleanup guarantees

Temporary names are unique per run (`dg20-e51-*`, `dg20-e551-*`). Cleanup is
single-flight and idempotent and removes only the exact run-scoped resources.
The script never removes unrelated images, containers, networks, or volumes.
Local image tags are never pushed.

## Rancher Desktop socket

```bash
export DOCKER_HOST=unix://$HOME/.rd/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

The smoke script may auto-detect `$HOME/.rd/docker.sock` for its own Docker CLI
calls when `DOCKER_HOST` is unset. It does not modify global Docker config.

## Production non-claims

- Not a production deployment
- Not an approved production registry image digest
- Not Helm / gateway / portal wiring
- Not production IAM or DST
- Not §5 live-service acceptance
- Not image signing / provenance / promotion
- `governance-technical` is non-production and must stay off in shared/prod
