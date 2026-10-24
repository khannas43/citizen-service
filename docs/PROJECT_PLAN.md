# DG 2.0 — Full Platform Project Plan

**Last updated:** 2026-06-22  
**Status:** Phases 0–6c complete. Phase 6d (Scheme Coverage) cursor prompt ready. Phase 7 (Chatbot) + Phase 8 (Containerize) remaining.

---

## 1. Project Purpose

Prove that a modern governance platform can run **two workflow engines side by side** — DIGIT's native `egov-workflow-v2` and a custom Flowable-embedded service — sharing the same infrastructure, while delivering citizen-facing services with a proper UI, Gujarati language support, mobile-first design, automatic scheme management, and a 360-degree family profile.

This is a working demo built on a real cluster (not mockups), meant to be shown to government and investor stakeholders.

---

## 2. Current Infrastructure

**Cluster:** Rancher Desktop (K3s) on Apple Silicon, namespace `egov`

| Service | Image | Notes |
|---|---|---|
| `postgres` | `postgres:16` | Single instance, database `egov_db` |
| `kafka` | `apache/kafka:latest` | KRaft mode, NOT Bitnami (broken for single-node) |
| `redis-master` | `bitnamilegacy/redis` | |
| `egov-mdms-service` | `egovio/egov-mdms-service:arm64-local` | Master data — tenant `pg` |
| `egov-persister` | `egovio/egov-persister:arm64-local` | Kafka consumer → Postgres write |
| `egov-indexer` | `egovio/egov-indexer:arm64-local` | |
| `egov-user` | `egovio/egov-user:arm64-local` | Java 8, citizen user records |
| `egov-workflow-v2` | `egovio/egov-workflow-v2:arm64-local` | DIGIT workflow engine (DGT- tasks) |
| `egov-enc-service` | `egovio/egov-enc-service:arm64-local` | PII encryption/decryption |
| `caste-certificate-service` | `caste-certificate-service:arm64-local` | Flowable engine (FLW- tasks) ✅ |

**Source repos at** `/Users/sameerkhanna/Documents/Projects/DG2.0/`:
- `Digit-Core/` — DIGIT service source
- `DIGIT-DevOps/deploy-as-code/helm/` — Helm charts
- `caste-certificate-service/` — custom Flowable service ✅
- `officer-portal/` — React officer UI ✅
- `citizen-portal/` — React citizen UI ✅

**PostgreSQL schemas in `egov_db`:**
- `public` — all DIGIT tables (ACT_*, EG_WF_*, EG_USER, etc.)
- `caste_cert` — Flowable ACT_* tables for caste-certificate-service ✅

---

## 3. Proven Build Pattern (follow for every new service)

Every Spring Boot service follows this exact sequence:

```bash
# 1. Build
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
cd /Users/sameerkhanna/Documents/Projects/DG2.0/<service-name>
mvn clean package -DskipTests

# 2. Docker image (must be arm64)
docker build -t <service-name>:arm64-local .
docker image inspect <service-name>:arm64-local | grep -i architecture  # must say arm64

# 3. Deploy
kubectl apply -f k8s-manifest.yaml
# OR if already deployed:
kubectl rollout restart deployment/<service-name> -n egov
kubectl rollout status deployment/<service-name> -n egov --timeout=90s
```

**Standard Dockerfile** (same every time):
```dockerfile
FROM eclipse-temurin:17-jre-jammy
WORKDIR /opt/app
COPY target/*.jar app.jar
ENTRYPOINT ["java", "-Xmx256m", "-Xms256m", "-jar", "/opt/app/app.jar"]
```

**Standard `pom.xml` parent:**
```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.4</version>
</parent>
<properties>
    <java.version>17</java.version>
    <flowable.version>8.0.0</flowable.version>
</properties>
```

**Standard `application.properties` structure:**
```properties
server.port=8080
server.servlet.context-path=/<service-name>

spring.datasource.url=jdbc:postgresql://postgres.egov.svc.cluster.local:5432/egov_db?currentSchema=<schema_name>
spring.datasource.username=${SPRING_DATASOURCE_USERNAME}
spring.datasource.password=${SPRING_DATASOURCE_PASSWORD}
spring.datasource.driver-class-name=org.postgresql.Driver

management.endpoints.web.exposure.include=health,info
management.endpoint.health.probes.enabled=true
management.health.livenessState.enabled=true
management.health.readinessState.enabled=true
```

**Standard K8s manifest structure** (plain Deployment + Service, no Helm):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <service-name>
  namespace: egov
spec:
  replicas: 1
  strategy:
    type: Recreate
  template:
    spec:
      containers:
        - name: <service-name>
          image: <service-name>:arm64-local
          imagePullPolicy: Never
          env:
            - name: SPRING_DATASOURCE_USERNAME
              valueFrom:
                secretKeyRef:
                  name: db
                  key: username
            - name: SPRING_DATASOURCE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db
                  key: password
          livenessProbe:
            httpGet:
              path: /<service-name>/actuator/health/liveness
              port: 8080
            initialDelaySeconds: 45
          readinessProbe:
            httpGet:
              path: /<service-name>/actuator/health/readiness
              port: 8080
            initialDelaySeconds: 45
          resources:
            requests: { memory: "384Mi", cpu: "200m" }
            limits:  { memory: "512Mi" }
---
apiVersion: v1
kind: Service
metadata:
  name: <service-name>
  namespace: egov
spec:
  selector:
    app: <service-name>
  ports:
    - port: 8080
      targetPort: 8080
```

**Before deploying any new service, create its schema:**
```bash
kubectl exec -it postgres-6d77874b49-nk7p8 -n egov -- \
  psql -U egovuser -d egov_db -c "CREATE SCHEMA IF NOT EXISTS <schema_name>;"
```

**Flowable 8 schema bootstrap on fresh PostgreSQL schemas (CRITICAL):**
Flowable 8 with `flowable.database-schema-update=true` fails silently on a
brand-new schema — it attempts an upgrade path that requires existing ACT_*
tables and throws if they don't exist. The service starts but crashes on first
workflow operation.

**Fix:** Before deploying any new Flowable service, clone the full Flowable
table structure from the working `caste_cert` schema into the new schema:
```bash
# Dump Flowable DDL from caste_cert and replay into <new_schema>
kubectl exec -it postgres-6d77874b49-nk7p8 -n egov -- \
  pg_dump -U egovuser -d egov_db \
  --schema=caste_cert --schema-only --no-owner --no-acl \
  | sed 's/caste_cert\./\<new_schema\>./g' \
  | psql -U egovuser -d egov_db

# Also copy the required act_ge_property seed rows:
kubectl exec -it postgres-6d77874b49-nk7p8 -n egov -- \
  psql -U egovuser -d egov_db -c \
  "INSERT INTO <new_schema>.act_ge_property \
   SELECT * FROM caste_cert.act_ge_property \
   ON CONFLICT DO NOTHING;"
```
This was required for pension, family_member_svc, and scheme_application schemas.
`caste_cert` remains the canonical source — it was bootstrapped correctly first.
```

**BPMN boundary events rule:** `<boundaryEvent>` elements must be siblings of `<userTask>` at the `<process>` level with `attachedToRef=`, never nested inside the task element. Flowable's XSD validator rejects nested boundary events with a SAXParseException.

---

## 4. Java Package Convention

All custom services use `org.magicsword.<service>.*` with these sub-packages:
- `model` — request/response records (Java 17 records, `jakarta.*` imports)
- `controller` — `@RestController` classes
- `service` — business logic, Flowable API calls
- `config` — Spring configuration if needed

---

## 5. Engine Routing Convention

| Prefix | Engine | Service |
|---|---|---|
| `FLW-` | Flowable (embedded) | caste-certificate-service, pension-service, family-member-service, scheme-application-service |
| `DGT-` | DIGIT egov-workflow-v2 | marriage-certificate-service |

The officer portal uses this prefix to route approve actions to the correct backend.

---

## 6. Frontend Conventions

**Tech stack:** Vite + React, plain CSS (no component library), `i18next` + `react-i18next` for Gujarati.

**Port assignments:**
- `officer-portal` — port 5173
- `citizen-portal` — port 5174
- `family-portal` — port 5175 (to be built)

**Color palette (all portals share this):**
```css
--blue-dark:  #1a3c5e   /* header, primary buttons */
--blue-mid:   #2c5f8a   /* hover states */
--orange:     #f47920   /* accent, active step, FLW badge */
--green:      #2e7d32   /* approved, success */
--red:        #c62828   /* escalated, error */
--grey-bg:    #f5f6fa   /* page background */
--card-bg:    #ffffff
--text-main:  #1a1a2e
--text-sub:   #666
```

**Header strip** (all portals): Full-width, `--blue-dark` background.
- Left: "🏛 Gujarat Government" in white
- Right: Portal name in white

**Engine badges:**
- `FLW` — green background, white text
- `DGT` — blue background, white text

**CORS:** Each new backend service must add `@CrossOrigin(origins = {"http://localhost:5173","http://localhost:5174","http://localhost:5175"})` on its controller.

**Gujarati i18n:** `i18next` installed in all citizen-facing apps. Language toggle in header. All citizen-visible strings have `en` and `gu` keys. Officer portal stays English only.

**Mobile-first:** All citizen-facing UIs (citizen-portal, family-portal) must be responsive. Test breakpoints: 375px (mobile), 768px (tablet), 1280px (desktop). Bottom tab navigation on mobile.

---

## 7. Completed Work

### ✅ Phase 0 — DIGIT Core Infrastructure
All 6 DIGIT services running on arm64 K3s. End-to-end workflow transition proven with real PII encryption. `MARRIAGE_CERT` businessService configured in `egov-workflow-v2` with states `PENDINGAPPROVAL → APPROVED/REJECTED`.

### ✅ Phase 3 — All Five Workflow Services

| Service | Engine | Schema | Local Port | Status |
|---|---|---|---|---|
| caste-certificate-service | Flowable | caste_cert | 8080 (pf: none needed) | ✅ |
| marriage-certificate-service | DIGIT egov-wf | marriage_cert | pf: 8081 | ✅ |
| pension-service | Flowable | pension | pf: 8082 | ✅ |
| family-member-service | Flowable | family_member_svc | pf: 8083 | ✅ |
| scheme-application-service | Flowable | scheme_application | pf: 8084 | ✅ |

**Verified:** pension returns familyIncome "₹140000" from family-registry; scheme-application returns registryIncome + eligibilityNotes; family-member ADD+approve syncs new member into family-registry (6 members confirmed); marriage-certificate stores locally + calls DIGIT workflow.

**Known fix applied to all Flowable services:** Flowable 8 schema bootstrap bug — see section 3 above for the pg_dump workaround. Required for pension, family_member_svc, scheme_application.

**NullPointerException fix:** `HistoricVariableInstance.getValue()` can return null. All historic variable collectors now use `getOrDefault()` / null checks.

### ✅ Phase 3a — Caste Certificate Service
- `caste-certificate-service` at `/Users/sameerkhanna/Documents/Projects/DG2.0/caste-certificate-service/`
- Flowable 8.0.0 embedded, Spring Boot 3.3.4
- BPMN: `casteCertificateApproval` — Data Entry Officer Review → Talati Verification → End (+ 24h SLA timer boundary events)
- APIs: `POST /v1/applications`, `GET /v1/applications`, `GET /v1/applications/{id}`, `POST /v1/applications/{id}/approve`
- `ApplicationResponse` fields: engineRef, status, currentTask, assignee, candidateGroups, applicantName, casteCode, tenantId

### ✅ Officer Portal
- `officer-portal` at `/Users/sameerkhanna/Documents/Projects/DG2.0/officer-portal/`
- Gujarat Government header, stats bar (Pending/Approved/Escalated counts), application cards with FLW badge, applicant name, caste category badge, approve button
- 5-second poll

### ✅ Citizen Portal (Caste Certificate)
- `citizen-portal` at `/Users/sameerkhanna/Documents/Projects/DG2.0/citizen-portal/`
- 3-step progress bar, application form, confirmation screen with tracking number, status check, Gujarati-ready structure

---

## 8. Remaining Phases

---

### Phase 1 — Family Registry Service

**Purpose:** Central store for family demographics and income. All scheme eligibility checks, pension applications, and family member changes read from and write to this service. Foundational — everything else depends on it.

**New service:** `family-registry-service`  
**Location:** `/Users/sameerkhanna/Documents/Projects/DG2.0/family-registry-service/`  
**Schema:** `family_registry`  
**Package:** `org.magicsword.family`

**Database tables:**
```sql
CREATE TABLE person (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(200) NOT NULL,
    dob          DATE,
    gender       VARCHAR(10),
    aadhaar_ref  VARCHAR(50) UNIQUE,   -- masked, e.g. XXXX-XXXX-1234
    occupation   VARCHAR(100),
    annual_income BIGINT DEFAULT 0,   -- in INR
    caste_category VARCHAR(10),        -- SC / ST / OBC / NT / GENERAL
    is_alive     BOOLEAN DEFAULT TRUE,
    mobile       VARCHAR(15)
);

CREATE TABLE family (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address  TEXT,
    village  VARCHAR(100),
    taluka   VARCHAR(100),
    district VARCHAR(100),
    state    VARCHAR(50) DEFAULT 'Gujarat'
);

CREATE TABLE family_member (
    family_id            UUID REFERENCES family(id),
    person_id            UUID REFERENCES person(id),
    relationship_to_head VARCHAR(20),  -- HEAD/SPOUSE/SON/DAUGHTER/FATHER/MOTHER/OTHER
    PRIMARY KEY (family_id, person_id)
);
```

**APIs:**
```
GET  /v1/families/{id}                       → FamilyResponse (family + all members with relationships)
GET  /v1/families/{id}/income                → IncomeResponse (total + per-member breakdown)
GET  /v1/families/{id}/scheme-eligibility    → List<SchemeEligibility> (evaluated against hardcoded schemes until Phase 4)
GET  /v1/persons/search?name=&aadhaar=&village=  → List<PersonSummary>
GET  /v1/persons/{id}                        → PersonResponse (person + their family)
POST /v1/families                            → create family + head (returns familyId)
POST /v1/families/{id}/members               → add member → publish MEMBER_ADDED to Kafka topic family-registry-events
DELETE /v1/families/{id}/members/{personId}  → mark person is_alive=false → publish MEMBER_DELETED
PUT  /v1/persons/{id}/income                 → update annual_income → publish INCOME_UPDATED
```

**Kafka events** (published to topic `family-registry-events`):
```json
{
  "eventType": "MEMBER_ADDED | MEMBER_DELETED | INCOME_UPDATED",
  "familyId": "uuid",
  "personId": "uuid",
  "timestamp": "ISO-8601"
}
```

**Hardcoded scheme eligibility rules** (interim, replaced by Phase 4 Scheme Engine):
```
PM_KISAN:       occupation contains "farmer" AND annual_income < 200000
BPL_RATION:     family total income < 100000
OBC_SCHOLARSHIP: caste_category IN (OBC, SC, ST) AND head income < 250000
JAN_DHAN:       always eligible
```

**Definition of done:**
- Service starts, Flowable-free (plain Spring Boot + JPA)
- All 8 endpoints return correct data
- Kafka events published and visible via `kafka-console-consumer`
- `CREATE SCHEMA family_registry` applied before first boot

---

### Phase 2 — Sample Data: 1000 Families

**Purpose:** Populate `family_registry` with realistic Gujarat data for demo.

**Script:** `seed_data/generate_families.py`  
**Output:** `seed_data/seed_families.sql`

**Requirements:**
- 1,000 family records, ~4,500 person records
- Gujarat geography: real district/taluka/village names from Ahmedabad, Surat, Vadodara, Rajkot, Banaskantha, Kutch
- Income distribution: 30% below ₹1L, 40% ₹1–3L, 20% ₹3–6L, 10% above ₹6L
- Caste: SC 20%, ST 15%, OBC 40%, NT 10%, General 15%
- Family sizes: 3–7 members
- Occupations: farmer, daily wage, teacher, shopkeeper, government employee, ASHA worker, auto driver, weaver
- **5 "hero" families** with fully curated stories, named and used in demo narration:
  - **Priya Patel** (Ahmedabad, OBC, farmer family, income ₹95,000 — eligible for BPL + OBC scholarship)
  - **Rajan Nair** (Surat, SC, mixed income family, father deceased — scheme removal demo)
  - **Meera Solanki** (Vadodara, ST, large joint family, pension-eligible grandparent)
  - **Ahmed Shaikh** (Rajkot, General, above-threshold income — shows ineligibility correctly)
  - **Kavita Rathod** (Banaskantha, NT, widow with children — widow pension eligible)

**Load command:**
```bash
kubectl exec -i postgres-6d77874b49-nk7p8 -n egov -- \
  psql -U egovuser -d egov_db < seed_data/seed_families.sql
```

---

### Phase 3 — Remaining Four Workflow Services

Each service follows the identical Spring Boot 3.3.4 + Flowable 8.0.0 pattern as `caste-certificate-service`. Only the BPMN process and field names differ.

---

#### 3a. Marriage Certificate Service (DIGIT engine)

**Important:** This service does NOT use Flowable. It uses the existing `egov-workflow-v2` DIGIT engine with the `MARRIAGE_CERT` businessService already configured in Phase 0. This is what makes the "two engines" story concrete — a real service on DIGIT's engine alongside real services on Flowable.

**New service:** `marriage-certificate-service`  
**Engine:** DIGIT `egov-workflow-v2` (`DGT-` prefix)  
**Schema:** `marriage_cert`

**What this service does:** Thin wrapper that stores the application record in its own table and submits a workflow transition to `egov-workflow-v2`. The approval lives in DIGIT; this service owns the application data.

**APIs:**
```
POST /v1/applications         → stores record, calls egov-wf POST /process/_transition (action: APPLY)
                                returns { engineRef: "DGT-{businessKey}", status: "PENDINGAPPROVAL" }
GET  /v1/applications/{id}    → fetches WF status from egov-wf GET /process/_search
POST /v1/applications/{id}/approve → calls egov-wf POST /process/_transition (action: APPROVE)
GET  /v1/applications         → list all pending (search egov-wf by businessService: MARRIAGE_CERT)
```

**Request fields:** brideAadhaarRef, groomAadhaarRef, brideNames, groomName, marriageDate, witnessName, tenantId

---

#### 3b. Pension Service (Flowable)

**New service:** `pension-service`  
**Engine:** Flowable (`FLW-` prefix)  
**Schema:** `pension`  
**Package:** `org.magicsword.pension`  
**BPMN process key:** `pensionApplication`

**BPMN:**
```
Start → [Revenue Officer Verification] → [Pension Sanctioning Officer] → [Disbursement Initiated] → End
```
All three tasks have 48h SLA timer boundary events → EscalationEnd.

**Request fields:** applicantName, pensionType (OLD_AGE / WIDOW / DISABILITY), aadhaarRef, familyId, tenantId

**Business rule:** Pension service should call `family-registry-service GET /v1/persons/{aadhaarRef}` at submission to auto-populate age and income for the officer's view.

**APIs:** Same three-endpoint pattern as caste-certificate-service.

---

#### 3c. Family Member Addition / Deletion Service (Flowable)

**New service:** `family-member-service`  
**Engine:** Flowable (`FLW-` prefix)  
**Schema:** `family_member_svc`  
**Package:** `org.magicsword.familymember`  
**BPMN process key:** `familyMemberChange`

**BPMN:**
```
Start → [Talati Verification] → End
```
Single-task workflow with 24h SLA timer.

**Request fields:** familyId, changeType (ADD / DELETE), personName, dob, gender, relationshipToHead, reason, tenantId

**On workflow completion:** Service calls `family-registry-service`:
- If ADD: `POST /v1/families/{familyId}/members`
- If DELETE: `DELETE /v1/families/{familyId}/members/{personId}`

This triggers the Kafka event that the Scheme Engine (Phase 4) listens to.

---

#### 3d. Family Income Scheme Application Service (Flowable)

**New service:** `scheme-application-service`  
**Engine:** Flowable (`FLW-` prefix)  
**Schema:** `scheme_application`  
**Package:** `org.magicsword.schemeapp`  
**BPMN process key:** `schemeApplication`

**BPMN:**
```
Start → [Income Verification Officer] → [Scheme Approval Officer] → End
```
Both tasks have 48h SLA timer boundary events.

**Request fields:** schemeId, familyId, aadhaarRef, declaredIncome, tenantId

**At submission:** Calls `family-registry-service GET /v1/families/{familyId}/income` and `GET /v1/families/{familyId}/scheme-eligibility` to pre-populate officer view with registry income vs declared income.

---

### Phase 4 — Scheme Engine

**Purpose:** Two things: (a) let department officers define schemes through a UI, and (b) automatically identify and remove beneficiaries when family data changes.

**New service:** `scheme-engine-service`  
**Schema:** `scheme_engine`  
**Package:** `org.magicsword.scheme`

**Database tables:**
```sql
CREATE TABLE scheme (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(200),
    name_gujarati    VARCHAR(200),
    description      TEXT,
    department       VARCHAR(100),
    benefit_type     VARCHAR(50),    -- CASH / RATION / PENSION / SCHOLARSHIP
    benefit_value    TEXT,
    income_ceiling   BIGINT,         -- annual family income in INR, NULL = no limit
    eligible_castes  TEXT[],         -- e.g. {SC, ST, OBC} or NULL for all
    min_age          INT,
    max_age          INT,
    gender           VARCHAR(10),    -- M / F / ANY
    district_scope   VARCHAR(100),   -- NULL = state-wide
    valid_from       DATE,
    valid_to         DATE,
    is_active        BOOLEAN DEFAULT TRUE,
    created_by       VARCHAR(100),
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE beneficiary (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id   UUID REFERENCES scheme(id),
    family_id   UUID,
    person_id   UUID,               -- NULL if scheme is family-level
    status      VARCHAR(20),        -- IDENTIFIED / CONFIRMED / ACTIVE / REMOVED
    identified_at  TIMESTAMP,
    confirmed_at   TIMESTAMP,
    removed_at     TIMESTAMP,
    removal_reason TEXT
);
```

**APIs:**
```
POST /v1/schemes                          → officer creates scheme
PUT  /v1/schemes/{id}                     → update or deactivate
GET  /v1/schemes                          → list all active schemes
GET  /v1/schemes/{id}/beneficiaries       → list beneficiaries + status
GET  /v1/families/{familyId}/eligibility  → check one family against all active schemes

POST /v1/admin/run-identification         → manually trigger full eligibility scan (for demo)
```

**Kafka Consumer** (topic `family-registry-events`):

On `MEMBER_DELETED` (person deceased):
1. Query `beneficiary` table for all ACTIVE records where person_id matches
2. Set status = REMOVED, removal_reason = "MEMBER_DECEASED", removed_at = now
3. Log removal — no officer confirmation needed for deceased removal

On `INCOME_UPDATED`:
1. Fetch updated family income from family-registry-service
2. Re-evaluate all active schemes for that family
3. For schemes they no longer qualify for: set beneficiary status = REMOVED, removal_reason = "INCOME_EXCEEDED_CEILING"
4. For schemes they newly qualify for: create IDENTIFIED beneficiary record for officer confirmation

On `MEMBER_ADDED`:
1. Re-evaluate all active schemes for that family
2. Create IDENTIFIED records for any newly qualifying schemes

**Definition of done:**
- Officer creates a scheme via API
- `POST /v1/admin/run-identification` scans all 1,000 families and creates IDENTIFIED records
- `DELETE /v1/families/{id}/members/{personId}` on Rajan Nair's deceased father triggers automatic REMOVED status on his pension beneficiary record, visible within 5 seconds

---

### Phase 5 — Officer Portal Redesign (Unified Workstation)

**Location:** `/Users/sameerkhanna/Documents/Projects/DG2.0/officer-portal/`  
Full replacement of current App.jsx.

**Layout:** Fixed sidebar + main content area.

**Sidebar navigation items:**
- Task Queue
- Scheme Management
- Beneficiary Dashboard
- Family Registry

**Task Queue screen (current home screen, extended):**

Polls two sources in parallel every 5 seconds:
1. `GET caste-certificate-service/v1/applications` → FLW rows (green badge)
2. `GET egov-workflow-v2/egov-wf/process/_search` (POST with body `{RequestInfo:{...}, ProcessSearchCriteria:{businessService:["MARRIAGE_CERT"], tenantId:"pg"}}`) → DGT rows (blue badge)
3. `GET pension-service/v1/applications` → FLW rows
4. `GET family-member-service/v1/applications` → FLW rows
5. `GET scheme-application-service/v1/applications` → FLW rows

Merges into one list sorted by submission time. Each card shows service type label (Caste Cert / Marriage Cert / Pension / etc.).

Approve action routes based on prefix:
- `FLW-*` → `POST /{service}/v1/applications/{id}/approve`
- `DGT-*` → `POST egov-workflow-v2/egov-wf/process/_transition`

**Scheme Management screen:**
- List of active schemes with beneficiary counts
- "Create Scheme" button → modal form with all scheme fields (name, Gujarati name, income ceiling, eligible castes, benefit type, validity)
- Per-scheme "View Beneficiaries" → table of IDENTIFIED/CONFIRMED/ACTIVE/REMOVED records with confirm/reject actions

**Beneficiary Dashboard screen:**
- Summary cards: Total Active Beneficiaries, Auto-Removed This Month, Pending Confirmation
- Live event feed (poll every 3s): recent auto-identification and auto-removal events with family name, scheme name, reason
- This is the "wow moment" screen for the automatic beneficiary demo

**Family Registry screen:**
- Search bar (name / village / aadhaar)
- Results list → click → full family detail panel:
  - Family tree (same React Flow tree as family-portal)
  - Income breakdown
  - Scheme eligibility status

---

### Phase 6 — Family Portal (New App)

**New app:** `family-portal`  
**Location:** `/Users/sameerkhanna/Documents/Projects/DG2.0/family-portal/`  
**Port:** 5175  
**CORS:** Add `http://localhost:5175` to all backend controllers

**Purpose:** Citizen-facing 360-degree family profile. A citizen enters their Aadhaar reference and sees their complete family picture.

**Screens:**

**Home / Search:**
Search by Aadhaar reference or name + village. Returns matching person. On select → Family Profile.

**Family Profile (the main screen):**

Three panels on desktop (stacked on mobile):

*Panel 1 — Family Tree (React Flow):*
- Interactive, zoomable, draggable
- Nodes: name, age, occupation (small icon), income (greyed out on mobile for privacy)
- Node color by role: HEAD = blue-dark, SPOUSE = purple, children = green, elders = orange
- Edges labeled with relationship type

*Panel 2 — Income Overview:*
- Total family annual income in large type
- Horizontal bar per member (plain CSS, proportional width)
- Members sorted by income descending
- Deceased members shown in grey with strikethrough

*Panel 3 — Scheme Eligibility:*
- Card per active scheme
- Green tick + "Eligible" or grey cross + "Not eligible" + one-line reason
- "Applied" badge if a scheme-application is PENDING/APPROVED for this family
- "Apply Now" button → navigates to citizen-portal scheme application form

**Mobile layout:**
Panels stack vertically. Tree collapses to a compact list view on <480px. Bottom navigation tab bar: Tree / Income / Schemes.

**Gujarati toggle:** All labels, scheme names, relationship labels, status messages available in Gujarati.

---

### Phase 6b — Citizen Portal Redesign (All 5 Services)

**Location:** `/Users/sameerkhanna/Documents/Projects/DG2.0/citizen-portal/`  
Full replacement with React Router, 5 service flows.

**Home screen:**
5 service tiles in a 2-column grid:
- Caste Certificate (existing, improved)
- Marriage Certificate (new)
- Pension Application (new)
- Family Member Change (new)
- Scheme Application (new)

Language toggle in header (English / ગુજરાતી) persisted in localStorage.

**Each service:**
- Application form (mobile-first, large tap targets)
- Progress steps indicator (service-specific steps)
- Confirmation + tracking number
- Status check via tracking number

**My Applications screen:**
Citizen enters their Aadhaar reference → sees all applications across all 5 services in one list, with status badges.

**Mobile:** Bottom tab navigation (Home / Apply / My Applications / My Family). Full functionality at 375px.

**Gujarati:** All strings translated. Form field labels, placeholder text, status labels, scheme names, error messages.

---

### Phase 7 — Gujarati Chatbot

**Embedded widget** in citizen-portal home screen (bottom-right chat bubble).

**Model:** `claude-haiku-4-5-20251001` (low latency, sufficient for intent extraction)

**Backend:** Small Node.js or Spring Boot proxy at `chatbot-service` that holds the Anthropic API key and forwards to Claude API. Never expose the API key to the browser.

**Flows to support:**

*Flow 1 — New application:*
```
User:  "મારે જાતિ પ્રમાણપત્ર જોઈએ છે"
Bot:   "તમારું પૂરું નામ શું છે?"
User:  "રાજેશ પટેલ"
Bot:   "તમારી જ્ઞાતિ કઈ છે? SC, ST, OBC, NT"
User:  "OBC"
Bot:   → POST /caste-certificate-service/v1/applications
       "અરજી સ્વીકારી. ટ્રેકિંગ નંબર: FLW-xxxx. 24 કલાકમાં સ્ટેટ્સ ચેક કરો."
```

*Flow 2 — Status check:*
```
User: "મારી અરજીની સ્થિતિ જાણવી છે"
Bot:  "તમારો ટ્રેકિંગ નંબર આપો"
User: "FLW-46ee..."
Bot:  → GET /caste-certificate-service/v1/applications/46ee...
      "તમારી અરજી 'Talati Verification' તબક્કે છે."
```

*Flow 3 — Service discovery:*
```
User: "પેન્શન માટે શું કરવું?"
Bot:  "આ સ્ક્રીન પર 'Pension Application' ટેપ કરો..."
```

**System prompt** instructs Claude to: (a) respond in the same language as the user, (b) extract intent from one of {APPLY_CASTE, APPLY_MARRIAGE, APPLY_PENSION, CHECK_STATUS, DISCOVER_SERVICE}, (c) collect missing fields conversationally, (d) call the correct service when all fields are ready.

---

### Phase 6c — Authentication Layer ✅ Complete

**Two parallel tracks: citizen Aadhaar + OTP, and departmental Keycloak.**

---

#### Track 1: Citizen Authentication — Aadhaar + OTP

**Architecture:**
Real production flow calls UIDAI's e-KYC API. For this demo environment, UIDAI API
access is not available (requires official registration). We simulate the OTP backend
with a fixed demo OTP `123456` while preserving the correct citizen UX flow.

**New service:** `auth-service`
**Location:** `/Users/sameerkhanna/Documents/Projects/DG2.0/auth-service/`
**Schema:** none (in-memory OTP store, JWT secret from env)
**Port:** 8080 internal / port-forward 8087
**Package:** `org.magicsword.auth`

**Dependencies:** spring-boot-starter-web, spring-boot-starter-actuator,
`io.jsonwebtoken:jjwt-api:0.12.3`, `io.jsonwebtoken:jjwt-impl:0.12.3`,
`io.jsonwebtoken:jjwt-jackson:0.12.3`, spring-boot-starter-webflux

**APIs:**
```
POST /v1/otp/send
  body: { "aadhaarRef": "XXXX-XXXX-1001" }
  → validates aadhaar exists in family-registry-service (GET /v1/persons/search?aadhaar=)
  → stores OTP "123456" in ConcurrentHashMap<aadhaarRef, OtpEntry{otp, expiresAt}>
    with 10-minute TTL
  → response: { "success": true, "maskedMobile": "XXXXXX9210" }
    (maskedMobile from person.mobile, mask all but last 4 digits)
  → if aadhaar not found in registry: 404 { "error": "Aadhaar not registered" }

POST /v1/otp/verify
  body: { "aadhaarRef": "XXXX-XXXX-1001", "otp": "123456" }
  → validates OTP matches and not expired
  → fetches citizen profile from family-registry (name, village, familyId)
  → issues JWT (HS256, 8-hour expiry) with claims:
      sub: aadhaarRef, name: personName, familyId: familyId,
      role: "CITIZEN", iat, exp
  → response: { "token": "eyJ...", "name": "Priya Patel",
                "aadhaarRef": "XXXX-XXXX-1001", "familyId": "uuid" }

GET /v1/verify
  header: Authorization: Bearer {token}
  → validates JWT signature and expiry
  → response: { "valid": true, "role": "CITIZEN", "aadhaarRef": "...", "name": "..." }
  → 401 if invalid/expired
```

**application.properties:**
```properties
server.port=8080
server.servlet.context-path=/auth-service
jwt.secret=${JWT_SECRET:demo-secret-key-32-chars-minimum!!}
jwt.expiry.hours=8
family.registry.base-url=http://family-registry-service.egov.svc.cluster.local:8080/family-registry-service
management.endpoints.web.exposure.include=health,info
management.endpoint.health.probes.enabled=true
management.health.livenessState.enabled=true
management.health.readinessState.enabled=true
```

**Citizen Portal login screen** (added before home screen in citizen-portal):
- On load: check localStorage `citizen_token`. Call GET /auth-service/v1/verify.
  If valid → go to home. If not → show login screen.
- Screen 1 — Aadhaar entry:
    Gujarat Government header, "Citizen Login" title.
    Input: Aadhaar Reference (format hint: XXXX-XXXX-NNNN)
    Button: "Send OTP" → POST /auth-service/v1/otp/send
    On success: show "OTP sent to XXXXXX{last4}" and advance to Screen 2
    Demo note visible on screen: "Demo OTP: 123456"
- Screen 2 — OTP entry:
    6-digit OTP input (auto-focus, numeric keyboard on mobile)
    "Verify OTP" → POST /auth-service/v1/otp/verify
    On success: store token + profile in localStorage (`citizen_token`, `citizen_profile`)
    Navigate to home. All application forms pre-populate applicantName from profile.
    "Change Aadhaar" link goes back to Screen 1.
- Logout: clears localStorage, returns to login screen.

**Demo citizen accounts** (all with OTP 123456):
- `XXXX-XXXX-1001` → Priya Patel (Bavla, OBC farmer)
- `XXXX-XXXX-2001` → Rajan Nair (Katargam, SC)
- `XXXX-XXXX-5001` → Kavita Rathod (Deesa, NT widow)

---

#### Track 2: Departmental Authentication — Keycloak

**Architecture:**
DIGIT 2.x uses Keycloak as its IAM layer. Departmental users, roles, and
permissions live in Keycloak. Officer portal authenticates via Keycloak's
token endpoint (Resource Owner Password Credentials grant — acceptable for
demo environment).

**Keycloak deployment:**
Image: `quay.io/keycloak/keycloak:24.0` (multi-arch, arm64 compatible)
Mode: `start-dev` (H2 in-memory database — does NOT survive pod restarts,
acceptable for demo)
Namespace: `egov`, Service name: `keycloak`
Internal port: 8080, local port-forward: 8090

**K8s manifest** (`keycloak-deployment.yaml`):
```yaml
env:
  - name: KEYCLOAK_ADMIN
    value: "admin"
  - name: KEYCLOAK_ADMIN_PASSWORD
    value: "admin"
  - name: KC_HTTP_ENABLED
    value: "true"
  - name: KC_HOSTNAME_STRICT
    value: "false"
args: ["start-dev"]
resources:
  requests: { memory: "768Mi", cpu: "300m" }
  limits:   { memory: "1Gi" }
```

**Realm setup** (via Keycloak admin REST API after deployment):
```
Realm:  egov
Client: officer-portal (public client, direct access grants enabled)

Roles:
  DATA_ENTRY_OFFICER
  TALATI
  REVENUE_OFFICER
  SCHEME_DEPT
  DEPT_ADMIN

Demo users (password: officer123 for all):
  data.entry    → role: DATA_ENTRY_OFFICER  displayName: "Data Entry Officer"
  talati        → role: TALATI              displayName: "Talati Officer"
  revenue       → role: REVENUE_OFFICER     displayName: "Revenue Officer"
  scheme.dept   → role: SCHEME_DEPT         displayName: "Scheme Department"
  dept.admin    → role: DEPT_ADMIN          displayName: "Department Admin"
```

**Officer Portal login screen** (added before the sidebar app):
- On load: check localStorage `officer_token`. Call Keycloak introspect or
  /auth-service/v1/verify (officer tokens also routed through auth-service verify).
  If valid → go to sidebar app. If not → show login screen.
- Clean login form: Gujarat Government header, "Department Login" title.
  Username + Password inputs.
  "Login" button → POST to Keycloak token endpoint:
    `http://localhost:8090/realms/egov/protocol/openid-connect/token`
    body: `grant_type=password&client_id=officer-portal&username={u}&password={p}`
  On success: store `access_token` in localStorage `officer_token`,
    decode JWT to get role, store role in `officer_role`.
  Navigate to sidebar app.
- Show role in sidebar footer: "Logged in as: {displayName}" + Logout button.
- Role-based task filtering:
    DATA_ENTRY_OFFICER → show tasks where assignee == "data-entry-officer"
    TALATI             → show tasks where candidateGroups contains "talati"
    REVENUE_OFFICER    → show tasks where assignee == "revenue-officer"
    SCHEME_DEPT        → show scheme-application tasks only
    DEPT_ADMIN         → show all tasks + can access Scheme Management + create schemes
- Quick demo login buttons: one per role, pre-filled credentials.

**Note on marriage-certificate-service:** Replace the hardcoded `DIGIT_AUTH_TOKEN`
env var with the Keycloak-issued token. Pass the officer's token from localStorage
in the Authorization header when calling marriage-cert approve endpoint.
Marriage-cert service forwards this token to egov-workflow-v2 transitions.

---

**Port-forward for auth testing:**
```bash
kubectl port-forward svc/auth-service 8087:8080 -n egov
kubectl port-forward svc/keycloak 8090:8080 -n egov
```

**Definition of done — VERIFIED ✅**
1. Citizen: enter `XXXX-XXXX-1001` → OTP screen → enter 123456 → logged in as Priya Patel
   → caste certificate form pre-populated with her name
2. Officer: enter `talati` / `officer123` → logged in → task queue filtered to talati tasks
3. Dept Admin: enters `dept.admin` / `officer123` → all tasks visible + Scheme Management accessible
4. Logout on both portals clears tokens and returns to login screen

**Keycloak note:** H2 in-memory — state lost on pod restart. If login fails with
"Account is not fully set up", re-run `./setup-keycloak.sh` (port-forward on 8090 must be active).

---

### Phase 6d — Scheme Coverage: Geographic Drill-down + Citizen Mapping ⬜ Cursor prompt ready — implement next

**Purpose:** Let departmental officers see how many beneficiaries are enrolled per scheme,
broken down by Gujarat district → taluka, with full citizen-to-scheme mapping.

**Backend changes (scheme-engine-service):**

1. Add `familyDistrict` (VARCHAR) and `familyTaluka` (VARCHAR) to `Beneficiary` entity
   (Hibernate `ddl-auto=update` adds columns automatically on restart)
2. Add `taluka` field to `FamilyData` model; populate from family-registry `/v1/families/{id}`
3. `createIdentifiedBeneficiary()` now persists district + taluka
4. New repository methods: `findBySchemeIdAndStatusIn`, `findByStatusIn`
5. New model DTOs: `SchemeCoverageDTO`, `GeographicBreakdownDTO` (nested district→taluka→citizens)
6. New service methods: `getSchemeCoverage()`, `getGeographicBreakdown(UUID)`, `getAllCitizensForScheme(UUID)`
7. New controller endpoints:
   - `GET /v1/schemes/coverage` → all schemes with totalEnrolled / activeCount / identifiedCount / removedCount
   - `GET /v1/schemes/{id}/geographic` → district→taluka→citizens hierarchy (active beneficiaries only)
   - `GET /v1/schemes/{id}/citizens` → full flat list sorted by identifiedAt desc

**Frontend changes (officer-portal):**

New screen `src/screens/SchemeCoverage.jsx` accessible at route `/coverage`.
Visible to ALL roles (read-only reporting).

- **Top bar:** 4 summary stat chips — Total Schemes, Total Enrolled, Active Beneficiaries, Pending Confirmation
- **Left panel:** Scheme cards grid with name, Gujarati name, department badge, benefit line, three count badges (Active / Pending / Removed)
- **Right panel** (shown when scheme selected):
  - Tab 1 — *Geographic View*: accordion district → taluka → citizen rows
    (expandable; citizen row shows name, village, status badge, "View Family" link)
  - Tab 2 — *Citizen List*: searchable table (Name / Village / District / Taluka / Status / Enrolled On)
- After re-deploying: run `POST /v1/admin/run-identification` to populate district/taluka on new records

**Definition of done:**
1. `/v1/schemes/coverage` returns all schemes with counts
2. `/v1/schemes/{id}/geographic` returns at least 2 Gujarat districts with talukas
3. Officer portal `/coverage` shows scheme cards + geographic drill-down + searchable citizen table
4. Sidebar "📊 Scheme Coverage" link visible for all roles

---

### Phase 8 — Containerize for External Demo

**Goal:** No port-forward required during stakeholder demo. All services accessible from a single IP.

**What to containerize:**
- `citizen-portal` → Nginx container, image `citizen-portal:arm64-local`
- `officer-portal` → Nginx container, image `officer-portal:arm64-local`
- `family-portal` → Nginx container, image `family-portal:arm64-local`

**Nginx Dockerfile pattern:**
```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

Build React apps with `npm run build` first, then Docker.

**Access:** NodePort services exposing each portal. Demo from any browser on the same network as the MacBook.

**API URLs:** React apps built with `VITE_API_BASE=http://<node-ip>:<nodeport>` pointing to the K8s NodePort for each backend service.

---

## 9. Complete Service Inventory (End State)

| Service | Engine | Schema | Port | Status |
|---|---|---|---|---|
| `caste-certificate-service` | Flowable | `caste_cert` | 8080 | ✅ Done |
| `marriage-certificate-service` | DIGIT | `marriage_cert` | 8081 | ✅ Done |
| `pension-service` | Flowable | `pension` | 8082 | ✅ Done |
| `family-member-service` | Flowable | `family_member_svc` | 8083 | ✅ Done |
| `scheme-application-service` | Flowable | `scheme_application` | 8084 | ✅ Done |
| `family-registry-service` | — (JPA only) | `family_registry` | 8085 | ✅ Done |
| `scheme-engine-service` | — (Kafka consumer) | `scheme_engine` | 8086 | ✅ Done |
| `auth-service` | — (JWT issuer) | — (in-memory) | 8087 | ✅ Done |
| `keycloak` | — (IAM) | H2 in-memory | 8090 | ✅ Done |
| `chatbot-service` | — (Claude API proxy) | — | 8088 | ⬜ Phase 7 |
| `citizen-portal` | React/Vite | — | 5174 | ✅ Done |
| `officer-portal` | React/Vite | — | 5173 | ✅ Done |
| `family-portal` | React/Vite | — | 5175 | ✅ Done |

---

## 10. Demo Narrative (for stakeholder presentation)

**Scene 1 — Family 360 View:**
Show Priya Patel's family profile (family-portal). Interactive tree, income breakdown, 3 schemes she qualifies for. One click to apply for BPL ration card.

**Scene 2 — Citizen applies in Gujarati:**
Priya uses the chatbot on her mobile (citizen-portal). Types in Gujarati. Bot collects name and caste, submits the application. Tracking number returned.

**Scene 3 — Officer sees mixed queue:**
Officer portal shows Priya's caste certificate (FLW- badge) alongside a marriage certificate submitted via DIGIT engine (DGT- badge). Two engines, one queue.

**Scene 4 — Officer approves:**
Officer approves both tasks. Citizen's portal shows "Approved" on step 3.

**Scene 5 — Automatic scheme event:**
Officer opens Beneficiary Dashboard. Marks Rajan Nair's father as deceased via Family Member Deletion service. Within 5 seconds, dashboard shows auto-removal from Senior Citizen Pension scheme. No manual intervention.

**Scene 6 — Scheme formulation:**
Department officer creates a new "Chief Minister's Digital Literacy Scheme" (age 18–35, income < ₹3L, any caste). Clicks "Run Identification." System scans 1,000 families, shows 247 IDENTIFIED beneficiaries. Officer bulk-confirms.

---

## 11. Build Sequence Recommendation

| Order | Phase | Deliverable | Status |
|---|---|---|---|
| 1 | Phase 1 | family-registry-service | ✅ Done |
| 2 | Phase 2 | 1,000 family seed data | ✅ Done (4,597 persons loaded) |
| 3 | Phase 3b | pension-service | ✅ Done |
| 4 | Phase 3c | family-member-service | ✅ Done |
| 5 | Phase 3d | scheme-application-service | ✅ Done |
| 6 | Phase 3a | marriage-certificate-service | ✅ Done |
| 7 | Phase 4 | scheme-engine-service | ✅ Done (44 beneficiaries auto-identified) |
| 8 | Phase 5 | Officer portal redesign | ✅ Done |
| 9 | Phase 6 | Family portal + citizen portal redesign | ✅ Done |
| 10 | Phase 6b | Citizen portal — all 5 services + Gujarati | ✅ Done |
| 11 | Phase 6c | Auth layer (citizen OTP + officer Keycloak) | ✅ Done |
| 12 | Phase 6d | Scheme Coverage — geographic drill-down | ⬜ Cursor prompt ready |
| 13 | Phase 7 | Gujarati chatbot (Claude haiku proxy) | ⬜ Pending |
| 14 | Phase 8 | Containerize portals for stakeholder demo | ⬜ Pending |

---

## 12. Key Technical Gotchas (from Phase 0 — don't rediscover)

1. **Bitnami Kafka chart broken** for single-node KRaft — use `apache/kafka:latest` plain deployment
2. **BPMN boundary events** must be siblings at `<process>` level, not nested inside `<userTask>`
3. **`flowable.async-executor-activate=true`** required for timer events to fire
4. **SPRING_DATASOURCE_DRIVER_CLASS_NAME** must be set explicitly to `org.postgresql.Driver` to avoid OTel JDBC conflict
5. **Health probes:** Spring Boot 2.3+ uses `/health/liveness` and `/health/readiness` separately
6. **`egov-persister` Kafka write path** is silently unreliable for some message types — if a Postgres row doesn't appear, INSERT manually matching the API response
7. **Encryption chain:** `egov-enc-service` expects `type: "Normal"` or `type: "Imp"` in encrypt/decrypt calls, not internal key-purpose strings
8. **Bitnami registry redirect** for any other Bitnami chart: `--set image.registry=docker.io --set image.repository=bitnamilegacy/<service>`
9. **`@CrossOrigin`** must list all three portal origins (5173, 5174, 5175) on every controller
10. **`imagePullPolicy: Never`** in all K8s manifests — images are local, not in a registry
