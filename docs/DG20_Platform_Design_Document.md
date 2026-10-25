# DG 2.0 — Platform Design Document

**Document type:** Consolidated functional & architectural design  
**Audience:** Architecture, product, delivery, evaluation, and engineering  
**Scope:** All major functionalities delivered or designed in the Digital Gujarat 2.0 (DG 2.0) workspace  
**Last updated:** 2026-08-10  
**Status:** Living design record grounded in the current codebase and prior specs  

---

## 1. Purpose

Digital Gujarat 2.0 (DG 2.0) is a working governance platform that demonstrates:

1. **Two workflow engines side by side** — DIGIT `egov-workflow-v2` (`DGT-*` tasks) and embedded Flowable (`FLW-*` tasks) — on shared infrastructure.
2. **Citizen-centric service delivery** across web and mobile, with Gujarati/English bilingual UX.
3. **Family as the unit of welfare** — a 360° family registry with consents, document vault, and scheme eligibility.
4. **Automatic scheme identification and coverage analytics** over a population dataset.
5. **A government Form Builder and Renderer** (Units A–E) that replaces Form.io with an open JSON Schema + controlled-widget palette.
6. **Responsible AI assist** for discovery, recommendations, explanations, and officer insights (demo-safe models).

This document consolidates functionality across portals, microservices, Form Builder, DIGIT core, and analytics. It is the master design map; detailed specs live in the referenced documents in §12.

---

## 2. Design principles

| Principle | Meaning in DG 2.0 |
| --- | --- |
| Two engines, one platform | Marriage (and DIGIT-native paths) use `egov-workflow-v2`; caste, pension, family-member, scheme applications use Flowable-embedded services. Task IDs encode the engine (`DGT-` vs `FLW-`). |
| Family 360 first | Persons and families are the golden record; schemes, applications, consents, and documents attach to that model. |
| One Form Definition contract | Builder, validator, store, governance, and citizen renderer share one immutable Form Definition object (JSON Schema + uiSchema + meta). |
| Controlled vocabulary | Departments compose forms from ~28 approved widgets — not a free-canvas builder. |
| Render once | The same Renderer is used for citizen runtime and Builder live preview. |
| Bilingual by construction | EN/GU labels and eligibility reasons flip across portals, chatbot, and widgets. |
| Consent & least privilege | Profile access, data-sharing, and Form Definition APIs are gated by consent, role, or capability. |
| Demo-honest integrations | Live UIDAI, DigiLocker, PSP, WhatsApp, and Bhashini are explicitly out of demo scope; OTP/eKYC is simulated. |

---

## 3. System context

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                         User surfaces                                    │
│  Citizen Web │ Citizen Mobile │ Officer Web │ Family Portal (staff)     │
└───────────────┬──────────────────┬──────────────────┬────────────────────┘
                │ same-origin nginx / NodePort         │
┌───────────────▼──────────────────▼──────────────────▼────────────────────┐
│                    Custom microservices (egov ns)                          │
│  auth │ family-registry │ caste │ marriage │ pension │ family-member     │
│  scheme-application │ scheme-engine │ grievance │ notifications          │
│  chatbot │ ai-intelligence │ form-definition-service                     │
└───────────────┬──────────────────────────────────────┬───────────────────┘
                │                                      │
┌───────────────▼──────────────┐        ┌──────────────▼───────────────────┐
│ DIGIT core                   │        │ Platform data & messaging          │
│ workflow-v2 │ mdms │ user    │        │ PostgreSQL 16 (citizen_db + schemas)  │
│ persister │ indexer │ enc    │        │ Kafka │ Redis │ Keycloak (egov)    │
└──────────────────────────────┘        │ Superset (analytics)               │
                                        └────────────────────────────────────┘
```

**Runtime environment (reference demo):** Rancher Desktop (K3s), namespace `egov`, Apple Silicon arm64 images, NodePorts for portals (officer `31173`, citizen `31174`, family `31175`).

---

## 4. User surfaces

### 4.1 Citizen Portal (web)

**Tech:** React + Vite · **Repo:** `citizen-portal/`  
**Auth:** Aadhaar-ref + OTP via `auth-service` (demo OTP `123456`)

| Area | Routes / entry | Functionality |
| --- | --- | --- |
| Public landing | `/` | Marketing, EN/GU toggle, citizen OTP login, officer Keycloak handoff |
| Home | authenticated `/` | Applications overview, AI search, scheme recommendations, status chips |
| Service catalogue | `/apply` | Choose a service to apply |
| CAF | `/apply/caf` | Common Application Form — multi-step, vault document reuse, family prefill |
| Legacy service forms | `/apply/caste`, `/marriage`, `/pension`, `/family-member`, `/scheme` | Hardcoded forms wired to respective workflow services |
| Published Form Definitions | `/apply/:serviceId` | Dynamic RJSF rendering of published Form Definitions from FDS |
| My Family | `/my-family` | Family members, relationship, consent-gated profile 360, OTP for Head viewing adults |
| Consents & data | `/my-consents` | Department data-sharing consents; revoke/restore; access history; vault docs |
| Applications | `/` / tracking flows | Track `FLW-*` / `DGT-*` / service prefixes; clarification threads |
| Grievances | `/grievances` | File, track, respond to officer queries |
| Payments & benefits | `/payments` | Disbursement / benefit status views |
| Certificates | `/certificates` | Issued certificates; PDF download |
| Notifications | `/notifications` + bell | Unread badge, mark-read, proactive eligibility alerts |
| Contact | `/contact` | Support contact surface |
| Chatbot | floating widget | Conversational apply (e.g. caste), status, eligibility — EN/GU |

### 4.2 Citizen Mobile (Flutter)

**Repo:** `citizen-mobile/`  
**Auth (current):** Demo profile picker (OTP/Aadhaar path is the target; gap vs web)

| Screen | Functionality |
| --- | --- |
| Login | Select demo citizen profile; hydrate from family-registry |
| Home | Entry to applications and status |
| My Family | Family view |
| Apply hub | Caste, pension, scheme, CAF, grievance |
| Track | Application status |
| Schemes | Browse schemes |
| Drafts | Offline draft persistence |
| Grievances | List and follow-up |
| Chatbot FAB | Conversational assistant |
| Notifications | Push / lifecycle status checks |
| More | Settings / profile switch |

### 4.3 Officer Portal (web)

**Tech:** React + Vite · **Repo:** `officer-portal/`  
**Auth:** Keycloak realm `egov`, password grant → JWT roles in `localStorage`

| Area | Route | Functionality |
| --- | --- | --- |
| Home | `/` | Role-aware workstation |
| Task queue | `/tasks` | Unified `FLW-*` + `DGT-*` tasks; approve/reject; SLA badges; clarifications; assisted notes |
| Form governance | `/form-definitions` | Governance queue — approve / publish Form Definition versions |
| Form Builder | `/form-builder` | Hosted Builder embed with request-time Bearer forwarding |
| Scheme management | `/schemes` | Scheme CRUD; run population identification scan |
| Beneficiaries | `/beneficiaries` | Confirm / remove / override / disburse; audit trail |
| Scheme simulator | `/scheme-simulator` | What-if eligibility forecast |
| Fraud signals | `/fraud-signals` | Rule-based anomaly cases over beneficiaries |
| Scheme coverage | `/coverage` | Geographic drill-down; caste/gender distribution fairness |
| Family registry | `/families` | Officer search of families/persons |
| Grievances | `/grievances` | Acknowledge / resolve / query citizens |
| Analytics | `/analytics` | Platform charts |
| Reports | `/reports` | Superset-backed reporting embeds |
| Ops dashboard | `/ops-dashboard` | IT_ADMIN service health and platform stats |
| Demo panels | Arch / Workflow | Two-engine narrative and BPMN viewing aids |

**Officer roles (Keycloak):** `DATA_ENTRY_OFFICER`, `TALATI`, `REVENUE_OFFICER`, `SCHEME_DEPT`, `DEPT_ADMIN`, `IT_ADMIN`, plus Form Builder `FDS_*` capability roles for Builder UX.

### 4.4 Family Portal (staff / browser)

**Repo:** `family-portal/` · React Flow tree visualization

| Capability | Description |
| --- | --- |
| Aadhaar / person search | Locate a household |
| Interactive family tree | Members, deceased overlay, relationship graph |
| Income breakdown | Per-member financials |
| Scheme eligibility cards | Family-level eligibility view |
| Apply deep-link | Prefills citizen portal with family context |

---

## 5. Domain functionality catalogue

### 5.1 Identity & access

| Function | Owner | Notes |
| --- | --- | --- |
| Citizen OTP login | `auth-service` | Aadhaar-ref send/verify; issues citizen JWT |
| Officer Keycloak login | Keycloak `egov` | Clients e.g. `officer-portal`; roles in `realm_access` |
| Form Definition OIDC | FDS `governance-oidc` | Resource Server; audience `form-definition-service`; Builder + governance capabilities |
| Session storage (officer) | Officer SPA | Password grant + `localStorage` (known debt: no refresh) |

### 5.2 Family registry & golden record

| Function | Description |
| --- | --- |
| Family / person CRUD & search | Household, members, geography (district/taluka/village) |
| Income & demographics | Annual income, caste category, gender, DOB, alive status |
| Consent grants | Department purpose-scoped data sharing; revoke/restore |
| Document vault | Upload / list / download / delete; CAF reuse |
| Data export | Citizen data-export path |
| Family IDs enumeration | Used by scheme-engine identification scan |

**Schema:** `family_registry` in `citizen_db`.

### 5.3 Certificate & application services (workflow)

| Service | Engine | Tracking | Functionality |
| --- | --- | --- | --- |
| Caste certificate | Flowable | `FLW-*` / `CAS` | Apply → DEO/Talati steps → PDF certificate |
| Marriage certificate | DIGIT workflow-v2 | `DGT-*` / `MAR` | Apply via DIGIT engine path |
| Pension | Flowable | `PEN` | Pension application lifecycle |
| Family member change | Flowable | `FAM` | Add / change / delete member applications |
| Scheme application | Flowable | `SCH` | Scheme enrolment applications |

Shared officer behaviour: unified task inbox, SLA presentation, clarification threads with citizens, notifications on state change.

### 5.4 Scheme engine (population welfare)

| Function | Description |
| --- | --- |
| Scheme CRUD | Name, bilingual labels, department, benefit type/value, eligibility rules (income, caste, age, gender, district scope, category) |
| Identification scan | Evaluate all families against active schemes; create/update beneficiaries as `IDENTIFIED` |
| Beneficiary lifecycle | `IDENTIFIED` → confirm / override / remove / disburse |
| Coverage & geography | Drill district → taluka → village → citizens; status counts |
| Distribution / fairness | Caste/gender representation vs benchmarks |
| Simulator | `POST /v1/schemes/simulate` what-if forecast |
| Fraud signals | Rule-based multi-scheme / anomaly detection for demo |
| Life-event hooks | e.g. member delete / birthday eligibility triggers |
| Custom rules | Extensible rule storage for advanced conditions |

**Schema:** `scheme_engine`.

### 5.5 Grievances & clarifications

| Function | Description |
| --- | --- |
| Citizen file grievance | Optionally linked to application tracking number |
| Status model | `OPEN` / `ACKNOWLEDGED` / `RESOLVED` (and query states) |
| Officer handling | Acknowledge, resolve, raise query |
| Clarifications | Two-way info-request threads on applications and grievances |

### 5.6 Notifications

| Function | Description |
| --- | --- |
| In-app notifications | Create / list / mark-read |
| Triggers | Approvals, disbursements, eligibility, clarification replies |
| Channels in demo | In-app only; WhatsApp deferred |

### 5.7 Conversational & AI assist

| Function | Component | Description |
| --- | --- | --- |
| Chatbot | `chatbot-service` | Intent detection; apply caste/pension; status; eligibility; EN/GU |
| Semantic search | `ai-intelligence-service` | Scheme / service discovery |
| Recommendations | AI + portal widgets | Ranked schemes with “why you qualify” reasons |
| Explanations | AI service | LLM-backed narrative (demo: Ollama Gemma; prod path: Sarvam/vLLM) |
| SLA risk / analytics | AI + Superset | Officer risk and dashboard assist |
| Speech (optional) | AI STT/TTS routes | Demo speech endpoints where enabled |

### 5.8 Form Builder & Form Definition Service (Units A–E)

| Unit | Name | Functionality |
| --- | --- | --- |
| **A** | Widget library | ~28 government widgets (Aadhaar, mobile, address, income, bilingual text, etc.) with validation, masking, a11y |
| **B** | Renderer | RJSF citizen/builder preview; progressive steps; EN/GU; CAF prefill hooks |
| **C** | Store & validator | PostgreSQL JSONB; Flyway; immutable versions; server validation; advisory locks |
| **D** | Builder SPA | Palette-constrained authoring; live preview; validate/save/clone/submit |
| **E** | Governance & hosting | Officer governance UI; published citizen render; OIDC capabilities; portal nginx allowlists |

**Form Definition lifecycle:** `draft` → `submitted` → `approved` → `published` → `retired`  
**Key APIs:** validation, draft CRUD, versions, builder clone/submit, governance queue/detail/transitions, anonymous `published/latest`.

### 5.9 Analytics & reporting

| Function | Description |
| --- | --- |
| Officer analytics screens | Charts over beneficiaries / schemes |
| Superset | Guest-token embeds; welfare / scheme performance dashboards |
| SQL analytics views | Seeded views for dashboards (`superset/seed_analytics_views*.sql`) |

### 5.10 Platform operations

| Function | Description |
| --- | --- |
| Service health | Actuator probes; IT_ADMIN ops dashboard |
| Demo reset / seed | `demo_reset.sh`, `seed_data/*` |
| Port-forwards | `start-port-forwards.sh` for local SPA → cluster services |
| Keycloak realm export | `export-keycloak-realm.sh` / `setup-keycloak.sh` |

---

## 6. Microservices catalogue

### 6.1 Custom business services

| Service | Context path (typical) | Responsibility |
| --- | --- | --- |
| `auth-service` | `/auth-service` | Citizen OTP + JWT |
| `family-registry-service` | `/family-registry-service` | Family/person golden record, consents, vault |
| `caste-certificate-service` | `/caste-certificate-service` | Flowable caste certificates |
| `marriage-certificate-service` | `/marriage-certificate-service` | DIGIT workflow marriage certificates |
| `pension-service` | `/pension-service` | Flowable pension applications |
| `family-member-service` | `/family-member-service` | Flowable family member change apps |
| `scheme-application-service` | `/scheme-application-service` | Flowable scheme enrolment apps |
| `scheme-engine-service` | `/scheme-engine-service` | Schemes, identification, beneficiaries, coverage, fraud, simulate |
| `grievance-service` | `/grievance-service` | Grievances + clarifications |
| `notifications-service` | `/notifications-service` | In-app notifications |
| `chatbot-service` | `/chatbot-service` | Conversational state machine |
| `ai-intelligence-service` | (Python FastAPI) | Search, recommend, explain, analytics proxy |
| `form-definition-service` | `/form-definition-service` | Form Definition persistence, governance, published read |

### 6.2 DIGIT core (present / used)

| Component | Role in DG 2.0 |
| --- | --- |
| `egov-workflow-v2` | DIGIT BPMN engine for `DGT-*` (marriage path) |
| `egov-mdms-service` / MDMS | Master data |
| `egov-user` | DIGIT user records |
| `egov-persister` | Kafka → Postgres persistence |
| `egov-indexer` | Indexing pipeline |
| `egov-enc-service` | PII encryption helpers |
| Kafka / Redis / Postgres | Shared platform backbone |

Full DIGIT source tree also includes filestore, localization, notifications, payment gateway, PDF, audit, boundary, gateways, etc., for broader DIGIT compatibility — not all are required for the demo path.

---

## 7. Data architecture

**Database:** PostgreSQL 16 · database `citizen_db`

| Schema | Owner service | Contents (representative) |
| --- | --- | --- |
| `public` | DIGIT | Workflow, user, ACT_*, EG_* tables |
| `family_registry` | family-registry | `family`, `person`, `family_member`, `consent`, `citizen_document` |
| `scheme_engine` | scheme-engine | `scheme`, `beneficiary`, `custom_rules` |
| `caste_cert` | caste-certificate | Flowable + business tables |
| `marriage_cert` | marriage-certificate | Marriage application data |
| `pension` | pension-service | Pension applications |
| `scheme_application` | scheme-application | Enrolment applications |
| `grievance` | grievance-service | Grievances / clarifications |
| `notifications` | notifications-service | Notification rows |
| `form_definition` | form-definition-service | Form definitions + lifecycle events (Flyway V1–V4) |

**Messaging:** Kafka for life events and DIGIT persister/indexer pipelines.  
**Caching:** Redis (DIGIT / platform).

---

## 8. Security & integration design

### 8.1 Authentication model

```text
Citizen  → auth-service OTP → citizen JWT → citizen APIs
Officer  → Keycloak password grant → officer JWT → officer SPA → backend APIs
Builder  → officer JWT forwarded as Bearer to FDS (request-time provider)
Citizen published forms → anonymous GET published/latest (FDS); SPA still requires citizen session
```

### 8.2 Portal → service access

Officer and citizen portals expose **same-origin nginx reverse proxies** to cluster services (NodePort images) or Vite dev proxies locally. Form Definition Service uses **least-privilege exact-path allowlists**:

- **Citizen:** `GET …/published/latest` only  
- **Officer:** governance + authenticated Builder APIs; technical clone/lifecycle and actuator blocked  

### 8.3 Form Definition security highlights

- Governance and Builder capabilities mapped from Keycloak roles  
- Technical identity-bearing clone/lifecycle endpoints denied under OIDC  
- Actors for clone/submit derived from JWT `sub`  
- Optimistic concurrency via ETag / If-Match  
- `governance-technical` profile prohibited in production  

---

## 9. End-to-end journeys (functional)

### 9.1 Citizen applies for caste certificate
Login (OTP) → Apply / Chatbot → Flowable process → Officer task (`FLW-*`) → Approve → PDF certificate → Notification → Certificates list.

### 9.2 Citizen applies for marriage certificate
Login → Apply marriage → DIGIT workflow (`DGT-*`) → Officer queue → Decision → Status / notification.

### 9.3 Scheme identification & benefit
Dept defines scheme → Run identification scan over family registry → Beneficiaries `IDENTIFIED` → Officer confirms / overrides → Disburse → Citizen payments & notifications.

### 9.4 Form Definition publish → citizen render
Builder authors definition → Validate/save → Submit → Governance approve/publish → Citizen opens `/apply/:serviceId` → Renderer loads `published/latest`.

### 9.5 Consent-gated family profile
Citizen opens My Family → Head requests OTP for adult member → Consent recorded → Profile 360 visible → Consents page can revoke.

### 9.6 Grievance + clarification
Citizen files grievance on tracking number → Officer acknowledges/queries → Citizen replies → Resolve → Notifications both sides.

---

## 10. Non-functional characteristics (design targets)

| Area | Design stance |
| --- | --- |
| Language | EN/GU throughout citizen UX and eligibility narratives |
| Accessibility | Widget-level a11y; controlled layouts (fields + order in v1 Form Builder) |
| Immutability | Published Form Definition versions never mutate in place |
| Observability | Spring Actuator health/liveness/readiness; IT ops dashboard |
| Deployment unit | Per-service container + K8s Deployment in `egov`; portal nginx static + proxy |
| Scale (demo) | ~1k–220k families seed profiles supported by scripts; identification scan over registry |
| Compliance narrative | Consent, vault, masking widgets, no free-form PII widgets misconfiguration |

---

## 11. Explicitly deferred or out of scope

| Item | Status |
| --- | --- |
| Live UIDAI / Aadhaar eKYC | Dropped for demo — simulated OTP |
| DigiLocker | Dropped — requires live partner |
| Bank PSP / payment gateway live settlement | Dropped / simulated disbursement refs |
| WhatsApp notifications | Dropped — WABA/Twilio onboarding |
| Bhashini live MT | Deferred — static bilingual packs |
| Mobile OTP login (parity with web) | Gap — demo profiles today |
| Form Builder §5 live catalogue service acceptance | Pending DST / product decision |
| DST inbox as approval queue | Out of Unit E package — status-derived governance queue instead |
| Production IAM hardening & image digest promotion | Scaffolded (E5.x); not production-claimed |
| AI-3 document quality / AI-5 sentiment | Deferred Priority-2 |
| CM dashboard / some early Phase-14 admin ideas | Deferred or superseded |

---

## 12. Related documents

| Document | Path |
| --- | --- |
| Full project plan | [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) |
| Demo functionality checklist | [`DG20_Demo_FunctionalityList.md`](./DG20_Demo_FunctionalityList.md) |
| Demo project plan | [`DG20_Demo_ProjectPlan.md`](./DG20_Demo_ProjectPlan.md) |
| Phase 0 / dual-engine spec | [`DG20_Demo_Phase0_Spec.md`](./DG20_Demo_Phase0_Spec.md) |
| AI & insights | [`DG20_AI_Digit_and_Insights.md`](./DG20_AI_Digit_and_Insights.md) |
| Caste service spec | [`CasteCertService_Spec.md`](./CasteCertService_Spec.md) |
| Form Builder design spec | [`../Form-builder/DG20_FormBuilder_Design_Spec_v1.md`](../Form-builder/DG20_FormBuilder_Design_Spec_v1.md) |
| Form Builder architecture | [`../Form-builder/docs/architecture.md`](../Form-builder/docs/architecture.md) |
| Citizen / mobile requirements | [`../Citizen_Portal_Mobile_App_Requirements.md`](../Citizen_Portal_Mobile_App_Requirements.md) |
| Demo script | [`../DEMO_SCRIPT.md`](../DEMO_SCRIPT.md) |

---

## 13. Summary

DG 2.0 is a **multi-portal, multi-engine welfare and certificate platform** that unifies:

- **Citizen delivery** (web + mobile) with bilingual UX, CAF, certificates, grievances, consents, and vault  
- **Officer operations** with unified tasks, schemes, beneficiaries, fraud, coverage, analytics, and Form governance  
- **Family 360** as the welfare data spine  
- **Scheme engine** for population-scale identification and fairness views  
- **Form Builder A–E** for controlled, governable, publishable service forms  
- **DIGIT + Flowable** coexistence on shared Postgres/Kafka infrastructure  
- **AI assist** for discovery and explanation without claiming live partner integrations  

This document is the single entry-point design map; deeper contracts remain in the linked unit and service specifications.
