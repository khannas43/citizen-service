# DG 2.0 — Demo Functionality List

**Version:** 1.0  
**Last updated:** 2026-06-23  
**Purpose:** Master reference of every feature demonstrated in the DG 2.0 demo. Organized by user journey. Use this during demo script creation (Phase 17) and evaluator briefings.

**Status key:** ✅ Built | 🔄 In progress | ⬜ Planned | ❌ Dropped (requires live integration)

---

## 1. Citizen Journey — Mobile App (Gujarati, Farmer persona: Priya Patel)

### 1.1 Registration & Authentication
| # | Feature | Status | Notes |
|---|---|---|---|
| 1.1.1 | Aadhaar-based OTP login (simulates eKYC handshake) | ✅ Built | Demo OTP: 123456; framed as "eKYC simulation" |
| 1.1.2 | Auto-populated profile (name, family, schemes) on login | ✅ Built | From family-registry-service |
| 1.1.3 | Live Aadhaar/UIDAI eKYC integration | ❌ Dropped | Requires UIDAI live API — not available for demo |
| 1.1.4 | Bank account integration / payment gateway | ❌ Dropped | Requires live PSP |
| 1.1.5 | DigiLocker document upload / storage | ❌ Dropped | Requires live DigiLocker API |

### 1.2 AI Chatbot & Scheme Discovery
| # | Feature | Status | Notes |
|---|---|---|---|
| 1.2.1 | Gujarati ↔ English language toggle (full UI) | ✅ Built | All labels, chatbot, eligibility reasons flip |
| 1.2.2 | AI chatbot in Gujarati — scheme discovery | ✅ Built | Static bilingual; Bhashini deferred |
| 1.2.3 | Chatbot: apply for caste certificate via conversation | ✅ Built | Collects fields, submits, returns FLW- tracking number |
| 1.2.4 | Chatbot: check application status | ✅ Built | FLW- and DGT- prefix routing |
| 1.2.5 | Chatbot: eligibility check (which schemes apply to me?) | ✅ Built | Fetches family + scheme engine output |
| 1.2.6 | AI scheme recommendations with eligibility reasoning | ✅ Built | "Why you qualify" panel — income, age, caste chips |
| 1.2.7 | Gujarati translation of eligibility reasons | ✅ Built | Phase 18b — reasonUtils.js |

### 1.3 Application Tracking & Status
| # | Feature | Status | Notes |
|---|---|---|---|
| 1.3.1 | Application status screen (FLW- and DGT- tracking numbers) | ✅ Built | Shows current step, submitted date |
| 1.3.2 | Real-time status updates (no page refresh needed) | ✅ Built | 30s poll |
| 1.3.3 | 2-way clarification tab on applications | ✅ Built | Phase 23 — citizen asks, officer replies |
| 1.3.4 | Scheme disbursement status ("₹X credited — Ref: GOV-TXN-XXXXXX") | ✅ Built | Phase 21 |

### 1.4 Notifications
| # | Feature | Status | Notes |
|---|---|---|---|
| 1.4.1 | In-app notification bell (unread count badge) | ✅ Built | 30s poll, marks read on click |
| 1.4.2 | Approval notification with context hint ("Use cert for OBC Scholarship") | ✅ Built | Phase 13 |
| 1.4.3 | Proactive eligibility notification (event-triggered — girl turns 18) | ✅ Built | Phase 24 — @Scheduled + trigger endpoint |
| 1.4.4 | Disbursement notification ("₹1,000 credited") | ✅ Built | Phase 21 |
| 1.4.5 | Clarification answered notification | ✅ Built | Phase 23 |
| 1.4.6 | WhatsApp notifications | ❌ Dropped | Requires Twilio/WABA onboarding |

### 1.5 Certificates & Documents
| # | Feature | Status | Notes |
|---|---|---|---|
| 1.5.1 | Certificate PDF download on approval | ✅ Built | Phase 22 — Gujarat Govt layout, cert number, signatory, Mamlatdar block |
| 1.5.2 | DigiLocker storage of issued certificate | ❌ Dropped | Requires live DigiLocker API |

### 1.6 Data Governance & Consent
| # | Feature | Status | Notes |
|---|---|---|---|
| 1.6.1 | View all data consents (department, data category, purpose) | ✅ Built | Phase 11 |
| 1.6.2 | Revoke consent in one click (instant update, no reload) | ✅ Built | Phase 11 |
| 1.6.3 | Consent history (revoked items shown greyed) | ✅ Built | Phase 11 |

### 1.7 Grievance Redressal
| # | Feature | Status | Notes |
|---|---|---|---|
| 1.7.1 | Submit grievance linked to tracking number | ✅ Built | Phase 10 |
| 1.7.2 | View grievance status (OPEN / ACKNOWLEDGED / RESOLVED) | ✅ Built | Phase 10 |
| 1.7.3 | Real-time status update (officer acknowledges → badge changes) | ✅ Built | Phase 10 |

---

## 2. Family Tree Journey (Family Portal, Browser)

| # | Feature | Status | Notes |
|---|---|---|---|
| 2.1 | Interactive family tree (React Flow, 6-node Patel family) | ✅ Built | Bhavesh: deceased overlay + ✝, Savitaben: orange |
| 2.2 | Per-member income breakdown | ✅ Built | |
| 2.3 | Family-level scheme eligibility cards | ✅ Built | |
| 2.4 | "Apply Now" pre-fills citizen portal with familyId | ✅ Built | |

---

## 3. Officer Journey — Web Portal (English, 5 roles)

### 3.1 Task Queue & Application Processing
| # | Feature | Status | Notes |
|---|---|---|---|
| 3.1.1 | Unified task queue (Flowable FLW- + DIGIT DGT- tasks) | ✅ Built | Green/blue role badges |
| 3.1.2 | SLA countdown badge (colour: green → amber → red pulse) | ✅ Built | Phase 12 |
| 3.1.3 | Approve / reject application with one click | ✅ Built | Triggers workflow step completion |
| 3.1.4 | Assisted note generation (template from live application data) | ✅ Built | Phase 25 — "📝 Generate Note" modal in task card |
| 3.1.5 | 2-way clarification reply from task queue | ✅ Built | Phase 23 — "💬 Clarifications" sidebar in nav |

### 3.2 Scheme Management & Beneficiaries
| # | Feature | Status | Notes |
|---|---|---|---|
| 3.2.1 | Create / edit / deactivate schemes | ✅ Built | |
| 3.2.2 | Run eligibility identification (auto-identifies all qualifying families) | ✅ Built | Phase 6d |
| 3.2.3 | Confirm / remove beneficiaries | ✅ Built | |
| 3.2.4 | Eligibility reason chips per beneficiary (✓ Age · ✓ Income · ✓ Caste) | ✅ Built | Phase 16 |
| 3.2.5 | Override beneficiary status + reason (audit-logged) | ✅ Built | Phase 18c |
| 3.2.6 | Audit trail per beneficiary (IDENTIFIED → CONFIRMED → OVERRIDE) | ✅ Built | Phase 18c |
| 3.2.7 | Mark disbursed + disbursement reference | ✅ Built | Phase 21 |
| 3.2.8 | Certificate download for any approved application | ✅ Built | Phase 22 |
| 3.2.9 | Scheme Forecasting Simulator (adjust params → projected count + delta) | ✅ Built | Phase 20 |

### 3.3 Geographic Coverage & Distribution
| # | Feature | Status | Notes |
|---|---|---|---|
| 3.3.1 | Scheme coverage cards with enrolment counts | ✅ Built | Phase 6d |
| 3.3.2 | Geographic drill-down: district → taluka → citizens | ✅ Built | Phase 6d |
| 3.3.3 | Caste distribution vs Gujarat population benchmark | ✅ Built | Phase 18d |
| 3.3.4 | District coverage with underrepresentation flags | ✅ Built | Phase 18d |
| 3.3.5 | Gender distribution panel | ✅ Built | Phase 18d |

### 3.4 AI / Intelligent Features (Officer View)
| # | Feature | Status | Notes |
|---|---|---|---|
| 3.4.1 | Fraud Signals dashboard (MULTI_SCHEME_OVERLAP, INCOME_CLIFF, AGE_ANOMALY, FAMILY_INCOME_MISMATCH) | ✅ Built | Phase 19 |
| 3.4.2 | Every fraud flag shows the exact rule that fired (explainable) | ✅ Built | Phase 19 |
| 3.4.3 | "Why you qualify" eligibility reason chips (officer view) | 🔄 In progress | Phase 16 |
| 3.4.4 | Assisted note generation from eligibility engine output | ✅ Built | Phase 25 |
| 3.4.5 | AI-recommended application processing (reasons + override) | ✅ Built | Phase 18c |

### 3.5 Monitoring & Grievances
| # | Feature | Status | Notes |
|---|---|---|---|
| 3.5.1 | Admin platform dashboard (applications, approvals, pending, avg time) | ⬜ Deferred | Phase 14 |
| 3.5.2 | Grievances list (OPEN / ACKNOWLEDGED / RESOLVED) | ✅ Built | Phase 10 |
| 3.5.3 | Acknowledge / resolve grievances with officer notes | ✅ Built | Phase 10 |
| 3.5.4 | Clarifications pending panel | ✅ Built | Phase 23 — "💬 Clarifications" in officer nav |

---

## 4. Event-Based Journey (Kafka, Registered User)

| # | Feature | Status | Notes |
|---|---|---|---|
| 4.1 | Auto-identification when family member turns 18 (Kafka event) | ✅ Built | Phase 24 — @Scheduled daily job + runBirthdayCheck() |
| 4.2 | Proactive in-app notification on new eligibility | ✅ Built | Phase 24 — fires with Phase 13 notification system |
| 4.3 | Demo trigger endpoint (simulate birthday without waiting for midnight) | ✅ Built | Phase 24 — POST /v1/admin/trigger-birthday-check?date= |
| 4.4 | WhatsApp notification on eligibility | ❌ Dropped | Requires Twilio / WABA onboarding |

---

## 5. IT / Platform Admin Journey (IT_ADMIN role)

| # | Feature | Status | Notes |
|---|---|---|---|
| 5.1 | IT Secretary Ops Dashboard (service health grid, platform stats, key issues) | ✅ Built | Phase 26 — OpsDashboard.jsx, IT_ADMIN role |
| 5.2 | Service health monitoring (green/red per microservice, 30s poll) | ✅ Built | Phase 26 — /actuator/health ping, HEALTH_SERVICES list |
| 5.3 | Platform stats (families, beneficiaries, open grievances, fraud signal severity) | ✅ Built | Phase 26 — fetchOpsSummary() |
| 5.4 | Grievance category breakdown (CSS bars) | ✅ Built | Phase 26 |
| 5.5 | Plug & Play Workflow Config panel (BPMN viewer) | ✅ Built | Phase 27 — WorkflowPanel.jsx, swimlane + XML snippet |
| 5.6 | Form builder / integration engine demo | ❌ Dropped | Too complex for demo timeline |
| 5.7 | CM dashboard integration | ❌ Dropped | Out of scope |

---

## 6. Responsible AI & Governance Features

| # | Feature | Status | Notes |
|---|---|---|---|
| 6.1 | Rules engine (not ML) — every decision is explainable | ✅ Built | Core architecture |
| 6.2 | Eligibility reason chips per beneficiary (pipe-delimited, one chip per criterion) | ✅ Built | Phase 16 |
| 6.3 | "Why you qualify" citizen view in Gujarati | ✅ Built | Phase 18b |
| 6.4 | Officer override with mandatory reason (audit-logged) | ✅ Built | Phase 18c |
| 6.5 | Full decision audit trail (IDENTIFIED → CONFIRMED → OVERRIDE with actor + reason) | ✅ Built | Phase 18c |
| 6.6 | Fairness distribution panel (caste/district/gender vs benchmarks, ⚠ flags) | ✅ Built | Phase 18d |
| 6.7 | Fraud signal explainability (exact rule detail per flag) | ✅ Built | Phase 19 |
| 6.8 | Two-engine architecture live panel (Flowable + DIGIT, live task counts) | ✅ Built | Phase 15 |
| 6.9 | BPMN workflow viewer (caste cert flow, configurable not coded) | ✅ Built | Phase 27 — WorkflowPanel.jsx |

---

## 7. Platform Architecture Demo Points

| # | Point | How Demonstrated | Phase |
|---|---|---|---|
| 7.1 | Two workflow engines unified in one task queue | Architecture slide-in panel, live task counts | Phase 15 ✅ |
| 7.2 | Kafka event bus (real-time beneficiary auto-removal on death event) | Scene 12 — delete Bhavesh → auto-REMOVED within 5s | Built ✅ |
| 7.3 | Kafka event bus (proactive eligibility trigger) | Scene 17 — birthday check fires, citizen notified | Phase 24 ✅ |
| 7.4 | Microservices (12 services, one K3s cluster) | Pod health grid in IT Dashboard | Phase 26 ✅ |
| 7.5 | No-code workflow configuration (BPMN) | BPMN viewer + XML snippet | Phase 27 ✅ |
| 7.6 | Nginx reverse proxy (no CORS, same-origin API calls) | Implicit — all APIs work without CORS errors | Built ✅ |
| 7.7 | arm64 / Rancher Desktop deployment | Implicit — all pods running on Apple Silicon | Built ✅ |

---

## 8. Features Dropped (Require Live Integrations)

| Feature | Reason Dropped |
|---|---|
| Live Aadhaar eKYC (UIDAI API) | Requires UIDAI partnership and sandbox access |
| Bank account integration | Requires live PSP / NPCI API |
| Payment gateway | Requires PSP onboarding |
| DigiLocker upload / storage | Requires DigiLocker sandbox credentials |
| DigiLocker certificate push | Requires DigiLocker sandbox credentials |
| WhatsApp notifications | Requires Twilio / WABA business account approval |
| Bhashini live translation | Requires DIBD approval; replaced with static bilingual Msgs class |
| CM dashboard integration | Out of scope for demo timeline |
| Form builder / drag-drop workflow | Too complex; replaced with BPMN viewer (Phase 27) |

---

## 9. Complete Phase → Feature Mapping

| Phase | Feature(s) | Status |
|---|---|---|
| DS-1 | Design system (tokens, Noto Sans, dg-* classes) | ✅ Done |
| DS-2 | Keycloak ConfigMap persistence | ✅ Done |
| DS-3 | Seed data + demo_reset.sh | ✅ Done |
| Phase 6d | Scheme coverage + geographic drill-down | ✅ Done |
| Phase 7 | Gujarati chatbot (static bilingual) | ✅ Done |
| Phase 8 | Containerized portals + NodePort ingress | ✅ Done |
| Phase 9 | Android APK + scrcpy | ⬜ Deferred |
| Phase 10 | Grievance module | ✅ Done |
| Phase 11 | Consent management | ✅ Done |
| Phase 12 | SLA countdown badges | ✅ Done |
| Phase 13 | Notifications service + bell | ✅ Done |
| Phase 14 | Admin platform dashboard | ⬜ Planned |
| Phase 15 | Two-engine architecture panel | ✅ Done |
| Phase 16 | Eligibility reason backend | ✅ Done |
| Phase 17 | Demo script + screen recording | ⬜ Last |
| Phase 18 | Responsible AI (4 features: reason chips, citizen why, override+audit, fairness) | ✅ Done |
| Phase 19 | Fraud Analytics panel | ✅ Done |
| Phase 20 | Scheme Forecasting Simulator | ✅ Done |
| Phase 21 | Disbursement status | ✅ Done |
| Phase 22 | Certificate PDF generation | ✅ Done |
| Phase 23 | Clarification tab (2-way Q&A) | ✅ Done |
| Phase 24 | Event-triggered identification (girl turns 18) | ✅ Done |
| Phase 25 | Assisted note generation (officer) | ✅ Done |
| Phase 26 | IT Secretary ops dashboard | ✅ Done |
| Phase 27 | Plug & play workflow panel (BPMN viewer) | ✅ Done |
