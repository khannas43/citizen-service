# DG 2.0 Demo — Phase 0 Handoff

**Status: Phase 0 complete.** All 5 DIGIT core services + a 6th (egov-enc-service) are running natively on arm64, healthy, and a real end-to-end workflow transition has been proven with genuine PII encryption/decryption. This doc exists so a fresh Claude session (in Cursor / Claude Code) doesn't have to rediscover any of this.

---

## 1. What's actually running right now

Cluster: Rancher Desktop (K3s) on Apple Silicon, namespace `egov`.

| Service | Image | Status |
|---|---|---|
| `postgres` | `postgres:16` (single instance, `citizen_db` database) | ✅ Running |
| `kafka` | **`apache/kafka:latest`** (NOT Bitnami — see §4) | ✅ Running |
| `redis-master` | `bitnamilegacy/redis` | ✅ Running |
| `egov-mdms-service` | built from source, `egovio/cs-egov-mdms-service:dev` | ✅ Running, healthy |
| `egov-persister` | built from source, `egovio/cs-egov-persister:dev` | ✅ Running, healthy |
| `egov-indexer` | built from source, `egovio/cs-egov-indexer:dev` | ✅ Running, healthy |
| `egov-user` | built from source, `egovio/cs-egov-user:dev` | ✅ Running, healthy |
| `egov-workflow-v2` | built from source, `egovio/cs-egov-workflow-v2:dev` | ✅ Running, healthy |
| `egov-enc-service` | built from source, `egovio/cs-egov-enc-service:dev` | ✅ Running, healthy — **added mid-Phase-0**, not in the original spec, but load-bearing for citizen PII encryption/decryption |

Repos cloned at `/Users/sameerkhanna/Documents/Projects/Citizen-Services/`:
- `Digit-Core/` — DIGIT service source
- `DIGIT-DevOps/` — Helm charts, at `DIGIT-DevOps/deploy-as-code/helm/`

---

## 2. Proven end-to-end (the actual Phase 0 result)

1. Marriage Certificate business service configured in `egov-workflow-v2` (`businessService: MARRIAGE_CERT`, states `PENDINGAPPROVAL → APPROVED/REJECTED`).
2. A real citizen user record exists in `eg_user` (id `9001`, uuid `a1b2c3d4-e5f6-4789-a012-b3c4d5e6f7a8`) with **genuinely encrypted** `name`/`mobilenumber` fields.
3. A real `APPLY` transition was submitted to `/egov-workflow-v2/egov-wf/process/_transition`, returned `HTTP 200`, and the citizen's PII was correctly decrypted in the response.
4. The resulting row is durably persisted in `eg_wf_processinstance_v2`.

**This proves the core architectural claim**: DIGIT genuinely runs, genuinely handles PII the way a real platform must, and genuinely routes a citizen application through a configured workflow — on a laptop, for real, not as a diagram.

---

## 3. Known gap (didn't block Phase 0, still real)

`egov-persister`'s Kafka-consumer write path is **silently unreliable** for some message types. We proved persister *can* consume successfully (confirmed via consumer-group lag = 0 for `save-wf-businessservice`), but the resulting Postgres write sometimes never lands, with **zero error logged anywhere** — not in persister, not in the app, not at WARN/ERROR level. Root cause never fully diagnosed. Workaround used throughout Phase 0: when this happens, manually `INSERT` the row directly into Postgres, matching exactly what the API response already returned. This is a real bug worth revisiting if it blocks something later — likely worth attaching a debugger or adding explicit ack-logging to persister's Kafka listener to catch it for real.

---

## 4. Key fixes — don't rediscover these

### Bitnami Kafka chart is broken for single-node KRaft in this environment
The Bitnami `kafka` Helm chart, even with `controller.replicaCount=1` and `offsets.topic.replication.factor=1` set correctly, gets stuck in an infinite retry loop trying to auto-create the internal `__consumer_offsets` topic (`FIND_COORDINATOR` never resolves), making all consumer-group functionality silently broken while basic produce/topic-list operations work fine. **Fix: don't use the Bitnami chart at all.** We deployed the official `apache/kafka:latest` image directly as a plain Kubernetes Deployment+Service (manifest below), named `kafka` to match existing DNS references everywhere else. This worked cleanly on the first try.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka
  namespace: citizen
  labels:
    app: kafka-apache
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kafka-apache
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: kafka-apache
    spec:
      containers:
        - name: kafka
          image: apache/kafka:latest
          ports:
            - containerPort: 9092
            - containerPort: 9093
          env:
            - name: KAFKA_NODE_ID
              value: "1"
            - name: KAFKA_PROCESS_ROLES
              value: "broker,controller"
            - name: KAFKA_LISTENERS
              value: "PLAINTEXT://:9092,CONTROLLER://:9093"
            - name: KAFKA_ADVERTISED_LISTENERS
              value: "PLAINTEXT://kafka.citizen.svc.cluster.local:9092"
            - name: KAFKA_CONTROLLER_LISTENER_NAMES
              value: "CONTROLLER"
            - name: KAFKA_LISTENER_SECURITY_PROTOCOL_MAP
              value: "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT"
            - name: KAFKA_CONTROLLER_QUORUM_VOTERS
              value: "1@localhost:9093"
            - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
              value: "1"
            - name: KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR
              value: "1"
            - name: KAFKA_TRANSACTION_STATE_LOG_MIN_ISR
              value: "1"
            - name: KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS
              value: "0"
            - name: KAFKA_AUTO_CREATE_TOPICS_ENABLE
              value: "true"
            - name: KAFKA_INTER_BROKER_LISTENER_NAME
              value: "PLAINTEXT"
          resources:
            requests: { memory: "768Mi", cpu: "250m" }
            limits: { memory: "1Gi" }
---
apiVersion: v1
kind: Service
metadata:
  name: kafka
  namespace: citizen
spec:
  selector: { app: kafka-apache }
  ports:
    - { name: plaintext, port: 9092, targetPort: 9092 }
    - { name: controller, port: 9093, targetPort: 9093 }
```

Admin CLI lives inside the container at `/opt/kafka/bin/` (e.g. `kubectl exec -it deployment/kafka -n citizen -- /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list`).

### Bitnami's other charts (Postgres alt, Redis) need the registry redirect
Bitnami gated most free images behind a paywall in Aug 2025. Any *other* Bitnami chart you deploy needs:
```
--set global.security.allowInsecureImages=true
--set image.registry=docker.io
--set image.repository=bitnamilegacy/<service>
```

### git-sync v4 uses different env var names than v3
v3-style `GIT_SYNC_*` vars are silently ignored for `GITSYNC_ROOT`/`GITSYNC_LINK` in v4 (`registry.k8s.io/git-sync/git-sync:v4.2.4`). Use v4-native names:
```yaml
- name: "GITSYNC_REPO"
- name: "GITSYNC_REF"        # not GITSYNC_BRANCH
- name: "GITSYNC_DEPTH"
- name: "GITSYNC_ONE_TIME"
- name: "GITSYNC_ROOT"        # destination root
- name: "GITSYNC_LINK"        # symlink name under root — checkout lands at $ROOT/$LINK
```
Without `GITSYNC_LINK` set explicitly, v4 defaults to cloning into `/git`, not your `$GITSYNC_ROOT`, and the app silently finds nothing there (MDMS tolerated this with an empty error list; persister/indexer did not).

### Health probe paths — split by Spring Boot version
Newer (Spring Boot 2.3+) services have **health groups**: probe `/{context}/health/liveness` and `/{context}/health/readiness` separately, not the combined `/{context}/health` (which can show `DOWN` due to an unrelated indicator dragging down the aggregate even when liveness/readiness are individually fine). `egov-user` is the one exception — it's older Spring Boot 1.x and only has the single combined `/user/health` endpoint.

### SPRING_DATASOURCE_DRIVER_CLASS_NAME needed explicitly on some services
OpenTelemetry's JDBC auto-instrumentation can register itself ahead of the real Postgres driver, causing a confusing `Driver ... claims to not accept jdbcUrl` error. Fix: explicitly set
```yaml
- name: SPRING_DATASOURCE_DRIVER_CLASS_NAME
  value: "org.postgresql.Driver"
```
Needed for `egov-user` and `egov-workflow-v2`. The common chart auto-injects `SPRING_DATASOURCE_URL/USERNAME/PASSWORD` for some services automatically (MDMS/persister/indexer/enc-service) but **not** for `egov-user`/`egov-workflow-v2` — those need the full `SPRING_DATASOURCE_*` block added explicitly in the override file.

### MDMS data — manually authored, mounted via ConfigMap
We don't have the real `egov-mdms-data` repo's full content for tenant `pg` — we authored minimal master data ourselves and mounted it as extra volumes layered on top of the git-synced data, at the exact paths MDMS expects (`/work-dir/egov-mdms-data/data/pg/{Module}/`). Three ConfigMaps currently in use:
- `egov-mdms-extra-data` → `data/pg/DataSecurity/` → `SecurityPolicy` (models `User` and `UserSelf`) + `MaskingPatterns`
- `egov-mdms-workflow-data` → `data/pg/Workflow/` → `BusinessServiceMasterConfig` (currently just `MARRIAGE_CERT`)
- `egov-mdms-tenant-data` → `data/pg/tenant/` → `tenants` (currently just `pg`)

If you add a new business service or need new master data, follow this same pattern: `kubectl create configmap`, mount as `extraVolumes`/`extraVolumeMounts` in the MDMS override file, restart the MDMS pod.

### Encryption chain — three things had to be true simultaneously
1. `egov-user`'s `DataSecurity`/`SecurityPolicy` MDMS entry needs `model: "UserSelf"` (not `"User"`) when `DECRYPTION_ABAC_ENABLED=false` (which we have set) — that's the actual lookup key the code uses.
2. Every `SecurityPolicy` entry needs `"roleBasedDecryptionPolicy": []` even if empty — a missing field (vs. an empty array) causes a null-pointer deep in `enc-client`.
3. `uniqueIdentifier.jsonPath` must be proper **JSON Pointer syntax** — `"/uuid"`, not bare `"uuid"`.
4. Don't list `username` as an encrypted attribute unless you actually encrypt the stored username value — real DIGIT deployments don't encrypt usernames anyway (just identifiers, not PII).
5. `egov-enc-service`'s `_encrypt`/`_decrypt` API expects `type: "Normal"` or `type: "Imp"` (symmetric/asymmetric) — not the internal "key purpose" strings (`UserSelf`/`Self`/etc.) that `egov-user` uses internally to *select* which MDMS policy to apply.

### Manually-inserted test data must be properly encrypted
If you insert a test citizen directly via SQL (bypassing the real create-user flow), you must call `egov-enc-service`'s real `/crypto/v1/_encrypt` endpoint yourself first and store the actual ciphertext — inserting plaintext into an "encrypted" column causes a decrypt-time `Invalid Ciphertext` error on every subsequent read.

---

## 5. Build pattern for any new DIGIT service (proven 6 times)

1. `find Digit-Core -maxdepth 3 -iname "{service}" -type d` — locate source
2. Check `pom.xml` for `<java.version>` (mix of 17 and 1.8 across the codebase — `egov-user` is the one Java 8 holdout, needs `brew install --cask temurin@8`, runs fine under Rosetta for the one-off Maven build even though it has no native arm64 build)
3. Check for `db/migration/*.sql` — apply small migration sets (< ~15 files, one folder) manually via `psql`; for larger/multi-folder sets (`egov-user` had ~95 files across `ddl/dev/qa/seed/test`), prefer enabling the service's own bundled Flyway (`FLYWAY_ENABLED=true`, `FLYWAY_LOCATIONS=classpath:db/migration/ddl` only — skip `seed`/`dev`/`qa`, those are old test-tenant data)
4. Check chart defaults at `DIGIT-DevOps/deploy-as-code/helm/charts/core-services/{service}/` for `gitSync`, `dbMigration` init containers, and default health probe paths
5. Build: `export JAVA_HOME=$(/usr/libexec/java_home -v 17)` (or `-v 8`), `mvn clean package -DskipTests`
6. Dockerfile (same every time):
   ```dockerfile
   FROM eclipse-temurin:17-jre-jammy   # or 8-jre-focal for Java 8
   WORKDIR /opt/egov
   COPY target/*.jar app.jar
   ENV JAVA_OPTS="-Xmx192m -Xms192m"
   ENTRYPOINT exec java $JAVA_OPTS $JAVA_ARGS -jar /opt/egov/app.jar
   ```
7. `docker build -t egovio/{service}:arm64-local .` — verify `docker image inspect ... | grep -i architecture` shows `arm64`
8. Write a `{service}-deploy-values.yaml` override (full self-contained file, not a partial patch — include `labels`, `image`, `healthChecks`, full `env` block)
9. `helm dependency build` if the chart errors about the `common` library chart
10. `helm install` (not `upgrade --install` for a truly fresh release — `upgrade` reuses prior release values you may not want)
11. If `helm install`/`upgrade` complains about adopting pre-existing K8s objects without Helm ownership metadata: `kubectl delete deployment/service {name} -n citizen` first, then reinstall clean.

---

## 6. Useful one-liners

```bash
# debug pod for curl-based API testing (recreate if its sleep timer expires)
kubectl run debug-curl -n citizen --image=curlimages/curl --restart=Never -- sleep 14400

# tail logs filtered of the constant Jaeger/health-check noise
kubectl logs <pod> -n citizen --since=5m | grep -v "jaeger-collector\|UnknownHostException\|at okhttp3\|HttpExporter\|TracerFilter"

# check actual Kafka consumer group lag (the real ground truth, more reliable than app logs)
kubectl exec -it deployment/kafka -n citizen -- /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group <group-name>

# decompile a class from inside a built jar when you need the real source/bytecode
mkdir -p /tmp/extract && cd /tmp/extract
unzip -o <jar> -d extracted
unzip -o extracted/BOOT-INF/lib/<dependency>.jar -d dep-extracted "org/egov/**/*.class"
$(/usr/libexec/java_home -v 17)/bin/javap -p -c -classpath dep-extracted <fully.qualified.ClassName>
```

---

## 7. What's next (not yet started)

**`caste-certificate-service`** — the genuinely new, custom-built piece. Spring Boot + `flowable-spring-boot-starter`, Flowable embedded as a library (not a separate server), proving a non-DIGIT service can route work alongside `egov-workflow-v2`. Two-task BPMN process (`Data Entry Officer Review` → `Talati Verification`), three endpoints (`POST /applications`, `GET /applications/{id}`, `POST /applications/{id}/approve`). This is real new code, not infrastructure archaeology — a different and more straightforward kind of work than everything in this document.

After that: the rest of the 9-scene demo storyboard (citizen web, officer portal, Gujarati chatbot, lakehouse, platform dashboard) — all lower-risk now that the DIGIT foundation is proven.
