# FB-E5.5.1 — Form Definition Service multi-stage image (local / non-production).
#
# Immutable base references (official Docker Hub library indexes; resolved 2026-07-29):
#   Build:   maven:3.9.9-eclipse-temurin-17@sha256:f58d59b6273e785ac0a4477f6e9b5ba1d7731c75b906c0f7b34076f1851318cc
#            index platforms include linux/amd64 and linux/arm64/v8
#   Runtime: eclipse-temurin:17-jre-jammy@sha256:475d8e96b4b2bfe08999e5e854755c773af1581acdf959a4545d88f0696a2339
#            index platforms include linux/amd64 and linux/arm64/v8
#
# Base index multi-arch support is NOT proof that this FDS application image is
# multi-architecture. Local builds are host-native unless a CI matrix builds both.
#
# Never activate spring profile governance-technical in this image or in production.
# Do not push this image from local verification. Helm chart tags remain provisional.

# ---------- build ----------
FROM maven:3.9.9-eclipse-temurin-17@sha256:f58d59b6273e785ac0a4477f6e9b5ba1d7731c75b906c0f7b34076f1851318cc AS build
WORKDIR /build

COPY pom.xml .
# Warm dependency layer before sources (best-effort; offline fail is OK on first build).
RUN mvn -B -q -DskipTests dependency:go-offline --no-transfer-progress || true

COPY src ./src
# Compile and package the Spring Boot executable jar. Tests run outside the image
# (Maven verify / Testcontainers) to avoid Docker-in-Docker.
RUN mvn -B -DskipTests package --no-transfer-progress \
    && cp target/form-definition-service-*.jar /build/app.jar

# ---------- runtime ----------
FROM eclipse-temurin:17-jre-jammy@sha256:475d8e96b4b2bfe08999e5e854755c773af1581acdf959a4545d88f0696a2339

LABEL org.opencontainers.image.title="form-definition-service" \
      org.opencontainers.image.description="DG 2.0 Form Definition Service (local/non-production image)" \
      org.opencontainers.image.vendor="DG 2.0 Form Builder" \
      dg20.form-builder.project="form-definition-service" \
      dg20.form-builder.increment="FB-E5.5.1" \
      dg20.form-builder.governance-technical="prohibited-in-production"

# Non-root runtime identity (UID/GID 10001).
RUN groupadd --system --gid 10001 fds \
    && useradd --system --uid 10001 --gid fds --home-dir /app --shell /usr/sbin/nologin fds \
    && mkdir -p /app \
    && chown fds:fds /app

WORKDIR /app

COPY --from=build --chown=fds:fds /build/app.jar /app/app.jar

USER 10001:10001

EXPOSE 8080
STOPSIGNAL SIGTERM

# Host may supply JAVA_TOOL_OPTIONS. No hard-coded profiles, credentials, or shell interpolation.
# Read-only root: mount a writable /tmp at runtime (tmpfs/emptyDir); do not add curl/shell tooling.
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
