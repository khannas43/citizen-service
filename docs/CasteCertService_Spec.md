# caste-certificate-service — Build Spec

Goal: prove a **custom-built, non-DIGIT service can route work too** — the other half of the "two engines, one queue" claim. This is genuinely new code, built by you and Cursor/Claude Code, not infrastructure archaeology like Phase 0.

---

## 1. Definition of done

1. A real Maven project, `caste-certificate-service`, with `flowable-spring-boot-starter` as a dependency — Flowable embedded directly in the app, no separate Flowable server.
2. A BPMN process (`caste-certificate-approval.bpmn20.xml`) with two sequential human tasks, deployed automatically at startup via Flowable's resource auto-deployment.
3. Three REST endpoints: start an application, check its status, approve the current task.
4. Builds to a native arm64 Docker image (same pattern as every DIGIT service this week), runs in the `egov` namespace, shares the existing Postgres instance (its own schema).
5. One submitted application genuinely creates a process instance, advances through both tasks, and reaches an end state — provable via the API, same as the `egov-workflow-v2` test.

---

## 2. Project setup

```bash
cd /Users/sameerkhanna/Documents/Projects/DG2.0
mkdir -p caste-certificate-service/src/main/java/org/magicsword/caste/{config,model,controller,service}
mkdir -p caste-certificate-service/src/main/resources/processes
```

### `pom.xml` — key dependencies
```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.4</version>
</parent>

<properties>
    <java.version>17</java.version>
</properties>

<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.flowable</groupId>
        <artifactId>flowable-spring-boot-starter</artifactId>
        <version>8.0.0</version>
    </dependency>
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
    </dependency>
</dependencies>
```

Flowable 8.0.0 targets Spring Boot 3.x — use a current Spring Boot 3.3.x parent, not the older 2.x line several DIGIT services use. This means standard `jakarta.*` imports throughout, not `javax.*`.

### `application.properties`
```properties
server.port=8080
server.servlet.context-path=/caste-certificate-service

spring.datasource.url=jdbc:postgresql://postgres.egov.svc.cluster.local:5432/egov_db?currentSchema=caste_cert
spring.datasource.username=${SPRING_DATASOURCE_USERNAME}
spring.datasource.password=${SPRING_DATASOURCE_PASSWORD}
spring.datasource.driver-class-name=org.postgresql.Driver

flowable.database-schema-update=true
```
`flowable.database-schema-update=true` lets Flowable create its own ~30-odd ACT_* tables automatically on first boot — no manual migration needed, unlike every DIGIT service this week. Genuinely simpler.

The dedicated `currentSchema=caste_cert` keeps Flowable's tables out of the `public` schema where all the DIGIT tables live — create it once:
```bash
kubectl exec -it postgres-6d77874b49-nk7p8 -n egov -- psql -U egovuser -d egov_db -c "CREATE SCHEMA IF NOT EXISTS caste_cert;"
```

---

## 3. The BPMN process

Design this visually first in Flowable's standalone BPMN modeler (a separate desktop/web tool, not part of the embedded engine) — export as `caste-certificate-approval.bpmn20.xml`, drop into `src/main/resources/processes/`. Shape:

```
Start → [Data Entry Officer Review] → [Talati Verification] → End
```

Both tasks are **user tasks** with a 24-hour SLA timer boundary event (matching the same pattern as `egov-workflow-v2`'s configured states, so the comparison stays apples-to-apples). Process key: `casteCertificateApproval`.

If hand-authoring the XML is faster than the modeler for a first pass, a minimal two-user-task BPMN looks like:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:flowable="http://flowable.org/bpmn"
             targetNamespace="org.magicsword.caste">
  <process id="casteCertificateApproval" name="Caste Certificate Approval" isExecutable="true">
    <startEvent id="start"/>
    <userTask id="dataEntryReview" name="Data Entry Officer Review" flowable:assignee="${assignee}"/>
    <userTask id="talatiVerification" name="Talati Verification" flowable:candidateGroups="talati"/>
    <endEvent id="end"/>
    <sequenceFlow sourceRef="start" targetRef="dataEntryReview"/>
    <sequenceFlow sourceRef="dataEntryReview" targetRef="talatiVerification"/>
    <sequenceFlow sourceRef="talatiVerification" targetRef="end"/>
  </process>
</definitions>
```
(Add the SLA timer boundary events once the basic two-task flow is proven working — don't add everything at once.)

---

## 4. The service's own API

```java
POST /caste-certificate-service/v1/applications
  body: { "applicantName": "...", "casteCode": "...", "tenantId": "pg" }
  → starts the process via RuntimeService.startProcessInstanceByKey("casteCertificateApproval", variables)
  → returns { "engineRef": "FLW-{processInstanceId}", "status": "PENDING" }

GET /caste-certificate-service/v1/applications/{id}
  → query TaskService for the current active task on that process instance
  → returns current task name + assignee/candidate group

POST /caste-certificate-service/v1/applications/{id}/approve
  → TaskService.complete(taskId) on the current task
  → advances to the next task or end state
```

The `FLW-` prefix on `engineRef` is deliberate — matches the prefix-based routing convention from the bid PPT (`DGT-` for DIGIT-engine references), which the eventual officer merged-queue screen will use to tell the two engines' tasks apart in one list.

---

## 5. Build & deploy (same pattern as every DIGIT service this week)

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
cd caste-certificate-service
mvn clean package -DskipTests

cat > Dockerfile << 'EOF'
FROM eclipse-temurin:17-jre-jammy
WORKDIR /opt/app
COPY target/*.jar app.jar
ENTRYPOINT ["java", "-Xmx256m", "-Xms256m", "-jar", "/opt/app/app.jar"]
EOF

docker build -t caste-certificate-service:arm64-local .
docker image inspect caste-certificate-service:arm64-local | grep -i architecture
```

No Helm chart needed for this one — it's not part of the egov DIGIT charts, write a plain Kubernetes Deployment+Service manifest (same style as the `kafka` one in the handoff doc), referencing the `db` Secret already in the namespace for Postgres credentials.

---

## 6. The actual proof test

```bash
# start an application
curl -X POST http://caste-certificate-service.egov.svc.cluster.local:8080/caste-certificate-service/v1/applications \
  -d '{"applicantName":"Aarav Patel","casteCode":"OBC","tenantId":"pg"}'
# → note the engineRef / process instance id

# check current task
curl http://.../v1/applications/{id}

# approve through both tasks
curl -X POST http://.../v1/applications/{id}/approve   # Data Entry Officer Review → Talati Verification
curl -X POST http://.../v1/applications/{id}/approve   # Talati Verification → End

# confirm process completed
curl http://.../v1/applications/{id}   # should show no active task / COMPLETED status
```

When this works, both halves of Phase 0's original claim are proven for real: `egov-workflow-v2` (DIGIT-native) and `caste-certificate-service` (custom-built, Flowable-embedded) both genuinely route work, side by side, on the same cluster.
