# DG 2.0 — Demo Build Project Plan
**Version:** 2.4 (Superset Reports live; officer portal UX polish; ops stability fixes)
**Last updated:** 2026-07-02 (Apache Superset Reports module ✅; citizen portal Gujarati i18n expansion ✅; CAF wizard ✅; officer Task Queue table ✅; grievance-service probe fix ✅; Two-engine panel update + Home/Login redesign still pending)
**Demo mode:** Option 2 — Mac + scrcpy (all services on K3s, phone mirrored to screen)
**Built by:** Claude (architecture + code generation) + Cursor (implementation)

---

## 0. Phase Status Summary

| Phase | Name | Build Status | Test Status | Notes |
|---|---|---|---|---|
| DS-1 | Shared design system | ✅ Done | ✅ Passed | Gujarat palette, welcome hero, saffron accents — 2026-06-23 |
| DS-2 | Keycloak ConfigMap persistence | ✅ Done | ✅ Passed | Pod restart no longer wipes officer logins |
| DS-3 | Seed data + demo_reset.sh | ✅ Done | ✅ Passed | 6-member Priya family, hero beneficiaries, idempotent reset |
| Phase 6d | Scheme coverage + geographic drill-down | ✅ Done | ✅ Passed | District → taluka → citizens; full redesign with Leaflet map + insights tab |
| Phase 7 | Gujarati chatbot | ✅ Done | ✅ Passed | 3 bugs fixed 2026-06-24: success now shows CAS-… ref, status prompt updated, status lookup by applicationNo works across all 5 service prefixes |
| Phase 8 | Containerised portals + NodePort ingress | ✅ Done | ✅ Passed | Login, home screen, EN/ગુ toggle — 2026-06-23 |
| Phase 9 | Android APK + scrcpy | ⬜ Deferred | ⬜ Deferred | After all screens finalised |
| Phase 10 | Grievance module | ✅ Done | ✅ Passed | Citizen + Officer portal both tested 2026-06-28 |
| Phase 11 | My Data + Consent management | ✅ Done | ✅ Passed | Extended to full My Data page (personal/address/family/consents tabs); Request Data Update with auto-fill + document attach ✅ 2026-06-24 |
| Phase 12 | SLA countdown badges | ✅ Done | ✅ Passed | Green → amber → red pulse; tested 2026-06-28 |
| Phase 13 | Notifications service + bell | ✅ Done | ✅ Passed | Notification bell visible and polling ✅ 2026-06-24 |
| Phase 14 | Admin platform dashboard | ✅ Superseded | ✅ Passed | Replaced by Apache Superset Reports module (Phase 14 custom React dashboard deferred) |
| Phase 15 | Two-engine architecture panel | ✅ Done | ✅ Passed | Live task counts, slide-in; **update pending** — new platform components (Superset, analytics layer, Kafka) to be added |
| Phase 16 | Eligibility reason backend | ✅ Done | ✅ Passed | Pipe-delimited chips, Savitaben/Shreya/Priya/Kavita backfilled; tested 2026-06-28 |
| Phase 17 | Demo script + screen recording | ⬜ Pending | ⬜ Pending | Write after all screens finalised |
| Phase 18 | Responsible AI (4 features) | ✅ Done | ✅ Passed | Why-you-qualify, override+audit, fairness distribution; tested 2026-06-28 |
| Phase 19 | Fraud Analytics panel | ✅ Done | ✅ Passed | 4 signal types, DEPT_ADMIN + REVENUE_OFFICER; tested 2026-06-28 |
| Phase 20 | Scheme Forecasting Simulator | ✅ Done | ✅ Passed | Adjust params → projected count + delta; tested 2026-06-28 |
| Phase 21 | Disbursement status | ✅ Done | ✅ Passed | GOV-TXN ref, citizen My Scheme Enrollments; tested 2026-06-28 |
| Phase 22 | Certificate PDF generation | ✅ Done | ✅ Passed | iText, Gujarat Govt layout, Mamlatdar signatory; tested 2026-06-28 |
| Phase 23 | Clarification tab (2-way Q&A) | ✅ Done | ✅ Passed | Citizen asks → officer answers → notification fires; tested 2026-06-28 |
| Phase 24 | Event-triggered identification (girl turns 18) | ✅ Done | ✅ Passed | @Scheduled midnight + manual trigger endpoint; tested 2026-06-28 |
| Phase 25 | Assisted note generation | ✅ Done | ✅ Passed | 📝 Generate Note modal, copy to clipboard; tested 2026-06-28 |
| Phase 26 | IT Secretary ops dashboard | ✅ Done | ✅ Passed | it.admin/officer123, service health grid, ops-summary; tested 2026-06-28 |
| Phase 27 | Plug & play workflow panel (BPMN viewer) | ✅ Done | ✅ Passed | Swimlane + XML excerpt slide-in; tested 2026-06-28 |
| — | Large dataset | ✅ Done | ✅ Passed | ~221k families / ~950k persons; 78,987 beneficiaries identified |
| — | Standardised reference numbers | ✅ Done | ✅ Passed | CAS/MAR/PEN/FAM/SCH/GRV-YYMM-000001 across all 6 services and both portals |
| — | Citizen portal UX overhaul | ✅ Done | ✅ Passed | /apply page, sortable My Applications, clickable rows + detail modal (modal bg bug fixed 2026-06-24), single-row toolbar, Gujarati toggle; status badges plain colour-coded text (no pill/capsule) 2026-06-24 |
| — | Document vault | ✅ Done | ✅ Passed | citizen_document table in family-registry-service; upload once, reuse across all application forms; tested 2026-06-28 |
| — | Citizen profile in officer grievance thread | ✅ Done | ✅ Passed | Personal/address/family/docs tabs shown when officer expands a grievance; tested 2026-06-28 |
| — | Design overhaul (Gujarat palette) | ✅ Done | ✅ Passed | Scheme Coverage + Scheme Management fully redesigned; officer portal Gujarat palette applied |
| — | Scheme Management redesign | ✅ Done | ✅ Passed | Command bar with KPIs; pipeline visualization; card-based beneficiaries; scheme selector in command bar; deactivate in bar; tested 2026-06-28 |
| — | Scheme Coverage redesign | ✅ Done | ✅ Passed | Leaflet map; insights tab; sort + page-size in citizens tab; category+scheme dropdowns; tested 2026-06-28 |
| — | Person entity: educationLevel / maritalStatus / employmentStatus | ✅ Done | ✅ Passed | JPA ddl-auto adds columns; seed data backfilled; citizen My Data shows all 3 fields; scheme engine SimulateParameters + SimulatedBeneficiary updated |
| — | Scheme Simulator: age filter fix | ✅ Done | ✅ Passed | Was showing HEAD's age; now shows qualifying member's age when minAge/maxAge active |
| — | Scheme Simulator: annual attrition rate | ✅ Done | ✅ Passed | Attrition field added (deaths, age-outs); net rate = growthRate − attritionRate applied in projection |
| — | Scheme Simulator: beneficiary profile modal | ✅ Done | ✅ Passed | Click beneficiary name → modal with Identity + Socio-Economic (incl. new fields) + Family sections |
| — | Scheme Simulator: Budget Forecasting single row | ✅ Done | ✅ Passed | sim-budget-grid repeat(4,1fr); all 4 fields in one row |
| — | Family Registry: complete redesign | ✅ Done | ✅ Passed | Empty state; min-3-char search; AbortController + cancel button; 🔄 refresh; sort toolbar; caste/district filters; pagination with page-size selector; advanced filters panel (17 fields); tested 2026-06-28 |
| — | Family Registry: family tree visual overhaul | ✅ Done | ✅ Passed | White cards; role-coloured accent stripe; avatar circle per role; HEAD gold ring + crown; SPOUSE bridge; Income Overview tab; Scheme Eligibility tab; tested 2026-06-28 |
| — | Officer portal image fix | ✅ Done | ✅ Passed | Was serving citizen-portal content on port 30073; fixed by building with absolute path; verified title = "Officer Portal" in running pod |
| — | Apache Superset integration + Reports module | ✅ Done | ✅ Passed | Superset 3.1.3 on NodePort 30076; 2 executive dashboards (`gujarat-welfare-pulse`, `scheme-performance`); analytics SQL views seeded; `@superset-ui/embedded-sdk` with guest tokens via `build_with_superset.sh`; tab switcher in officer portal; filter sidebar hidden — 2026-07-02 |
| — | Citizen portal Gujarati i18n expansion | ✅ Done | ✅ Passed | 530 keys EN/GU; Payments, Certificates, Notifications, Contact Centre, Consents, Home (My Applications), CAF, Apply, complaints, nav — 2026-06-29 |
| — | Common Application Form (CAF) | ✅ Done | ✅ Passed | 5-step wizard; `/apply/caf`; duplicate check; document config; linked from Home — 2026-06-29 |
| — | Officer portal: Task Queue table redesign | ✅ Done | ✅ Passed | Card list → sortable table (all columns); pagination; search + filters in single row — 2026-07-02 |
| — | Officer portal: full-width layouts | ✅ Done | ✅ Passed | Fraud Intelligence Engine + Grievances pages span full content width — 2026-07-02 |
| — | Grievance-service K8s stability | ✅ Done | ✅ Passed | Liveness/readiness probe delays increased (startup ~85s); fixes citizen complaint 502 — 2026-06-29 |
| — | Ops stability (502 recovery) | ✅ Done | ✅ Passed | Flowable schema bootstrap for pension/family-member/scheme-application; postgres analytics view re-seed; officer/citizen portal redeploys — 2026-06-29 |
| — | Two-engine architecture panel: expand to full platform view | ⬜ Pending | ⬜ Pending | Add analytics layer (Superset), Kafka event bus, Rules/AI engine, Edge vs Platform AI tiers |
| — | Citizen-visible AI sprint (AI-1, AI-2, AI-4) | ⬜ Planned | ⬜ Pending | **Proper AI** via `ai-intelligence-service` — see `docs/DG20_AI_Digit_and_Insights.md` §11; Gemma 4 + pgvector + LightGBM; ~2–3 weeks solo |
| — | Officer portal: Home page redesign | ⬜ Pending | ⬜ Pending | Current home is plain; needs professional landing with KPIs, quick actions, recent activity |
| — | Officer portal: Login page redesign | ⬜ Pending | ⬜ Pending | Current Keycloak login screen; needs DG 2.0 branded login matching Gujarat palette |

### Citizen portal — fully tested 2026-06-28 ✅
Login · My Applications list · Detail modal · /apply page · **Common Application Form (CAF)** · Grievances (raise + app dropdown) · My Data (personal/address/family + educationLevel/maritalStatus/employmentStatus) · Request Data Update (auto-fill + docs) · Notification bell · Gujarati toggle (530 keys, all major screens) · Chatbot (all 4 intents) · Scheme enrollment strip · Application forms per service (pre-fill + doc vault) · Certificate download · Clarifications flow · Grievance full round-trip (raise → officer resolves → status update) · Document vault · Payments & Benefits · My Certificates · Notification Hub · Contact Centre · My Consents

### Scheme Simulator — tested 2026-06-26 ✅
Age filter (qualifying member shown not HEAD) · Attrition rate field · Beneficiary profile modal · Budget Forecasting single-row layout

### Officer portal — fully tested 2026-06-28 ✅
Task queue (sortable table, pagination, single-row filters) · Approve/reject · SLA badges · Grievances + citizen profile panel · **Reports / Superset embed** (Gujarat Welfare Pulse + Scheme Performance tabs) · Scheme Management (redesigned: command bar, pipeline, card beneficiaries, scheme selector) · Scheme Coverage (redesigned: Leaflet map, insights tab, sort/page-size, dropdowns) · Beneficiaries (confirm/override/disburse/audit) · Fraud signals (full-width) · Coverage analytics · Birthday trigger · IT Ops dashboard · BPMN panel · Family Registry (search, filters, pagination, family tree) · Eligibility reason chips · Fairness distribution · Assisted note generation · Certificate PDF download · Clarifications tab · Notifications

### Remaining before demo
0. **Phase 0 — AI platform** — pgvector image migration (`pg_dump` first), `ai-intelligence-service` scaffold, Ollama gate test ⬜ Planned (~3 days) — see `docs/DG20_AI_Digit_and_Insights.md` §11–§12
1. **AI-1** semantic search (pgvector + Gemma rerank) ⬜ Planned (~5 days)
2. **AI-2** recommendations (LightGBM ranker + Gemma explain) ⬜ Planned (~5 days)
3. **AI-4** SLA prediction (LightGBM + SHAP, no Gemma) ⬜ Planned (~7 days)
4. **Two-engine architecture panel update** — expand to show full platform: Flowable + DIGIT + Kafka + Scheme Engine + Superset + ai-intelligence-service ⬜ Pending
5. **Officer portal Home page redesign** — professional landing with KPIs and quick actions ⬜ Pending
6. **Officer portal Login page redesign** — DG 2.0 branded, Gujarat palette ⬜ Pending
7. **Phase 17 Demo Script** — write after AI sprint + items 4–6 complete ⬜ Pending
8. **Phase 9 Android APK + scrcpy** — after all screens finalised ⬜ Deferred

---

## 1. What This Plan Covers

This plan picks up from where the current PROJECT_PLAN.md ends — Phases 0–6c complete, Keycloak auth working, 5 services live, 4,597 persons seeded. Everything here is net-new work required to make the demo complete, compelling, and evaluator-proof against RFP Criterion 4 (30 marks) and Criterion 1 (80 marks).

**Demo delivery:** MacBook running K3s. Android phone sideloaded with citizen-portal APK. scrcpy mirrors phone to Mac screen. Officer portal open in browser alongside. One presenter, two channels, zero port-forwarding during the presentation.

---

## 2. Completed Baseline (Do Not Re-do)

| Service / Feature | Status | Notes |
|---|---|---|
| K3s cluster on Rancher Desktop | ✅ Done | arm64, namespace `egov` |
| PostgreSQL 16 | ✅ Done | `egov_db`, all schemas |
| Kafka (KRaft, apache/kafka:latest) | ✅ Done | Not Bitnami |
| Valkey / Redis | ✅ Done | Cache |
| DIGIT core (mdms, persister, indexer, user, workflow-v2, enc-service) | ✅ Done | arm64 native builds |
| caste-certificate-service (Flowable) | ✅ Done | Schema `caste_cert` |
| marriage-certificate-service (DIGIT engine) | ✅ Done | Schema `marriage_cert` |
| pension-service (Flowable) | ✅ Done | Schema `pension` |
| family-member-service (Flowable) | ✅ Done | Schema `family_member_svc` |
| scheme-application-service (Flowable) | ✅ Done | Schema `scheme_application` |
| family-registry-service (JPA) | ✅ Done | Schema `family_registry` |
| scheme-engine-service (Kafka consumer) | ✅ Done | Schema `scheme_engine`, 44 beneficiaries |
| auth-service (JWT + OTP) | ✅ Done | Port 8087 |
| Keycloak 24.0 (officer IAM) | ✅ Done | H2 in-memory, realm `egov` |
| officer-portal (React) | ✅ Done | Port 5173, sidebar layout |
| citizen-portal (React, 5 services, Gujarati) | ✅ Done | Port 5174 |
| family-portal (React Flow tree) | ✅ Done | Port 5175 |
| 1,000 hero families / 4,597 persons seeded | ✅ Done | 5 hero families; large dataset adds ~220k more |
| ~220,000 families / ~950,000 persons (large dataset) | ✅ Done | generate_large_dataset.py — Gujarat districts, realistic demographics |
| Citizen OTP login (Aadhaar ref + 123456) | ✅ Done | Priya XXXX-XXXX-1001 |
| Officer Keycloak login (5 roles) | ✅ Done | talati/officer123 etc. |
| DS-1 Shared design system | ✅ Done | tokens.css, Noto Sans/Gujarati, dg-role-* badges, animation classes |
| DS-2 Keycloak ConfigMap persistence | ✅ Done | `--import-realm` arg, realm-config volume, pod-restart tested |
| DS-3 Seed data + demo_reset.sh | ✅ Done | 6-member Priya family, 5 beneficiary records, idempotent reset script |

---

## 3. Hero Families — Seed Data to Verify / Extend

Before any new development, verify these 5 families are seeded correctly. Add missing members per the complete family tree defined below.

### 3.1 Priya Patel — Primary Hero (Bavla, Ahmedabad)

| Person | Age | Role | Occupation | Income | Caste | Aadhaar Ref | Status |
|---|---|---|---|---|---|---|---|
| Bhavesh Patel (Father-in-law) | 72 | HEAD (deceased) | Retired farmer | ₹0 | OBC | XXXX-XXXX-1000 | `is_alive=false` |
| Priya Patel (Daughter-in-law) | 38 | Effective head | ASHA Worker | ₹72,000 | OBC | XXXX-XXXX-1001 | Alive |
| Ramesh Patel (Husband) | 41 | SPOUSE | Daily wage | ₹60,000 | OBC | XXXX-XXXX-1002 | Alive |
| Shreya Patel (Daughter) | 17 | DAUGHTER | Student Cl-11 | ₹0 | OBC | XXXX-XXXX-1003 | Alive |
| Arjun Patel (Son) | 12 | SON | Student Cl-7 | ₹0 | OBC | XXXX-XXXX-1004 | Alive |
| Savitaben Patel (Mother-in-law) | 65 | MOTHER_IN_LAW | Homemaker | ₹0 | OBC | XXXX-XXXX-1005 | Alive |

**Family total income:** ₹1,32,000
**Schemes to pre-seed:**
- Bhavesh: Old Age Pension — status REMOVED (removal_reason: MEMBER_DECEASED) ← *demo-critical*
- Savitaben: Old Age Pension — status IDENTIFIED (pending officer confirmation) ← *demo-critical*
- Shreya: Post-Matric OBC Scholarship — status IDENTIFIED ← *demo-critical*
- Family: BPL Ration Card — status IDENTIFIED (income < ₹1,50,000 ceiling)

**React Flow tree node colors:**
- Bhavesh: orange + grey overlay + ✝ icon (deceased)
- Priya: blue-dark (effective head)
- Ramesh: purple (spouse)
- Shreya, Arjun: green (children)
- Savitaben: orange (elder, alive)

### 3.2 Rajan Nair — Scheme Removal Demo (Katargam, Surat)
Family of 4. Father **Gopal Nair** (68, actual DB name — NOT Suresh) was on Old Age Pension — pre-seed as REMOVED (deceased). Rajan (42) is head. Wife Meena (39). Son Kiran (16, student). SC caste. Income ₹1,10,000.
**Note:** demo_reset.sh uses the actual DB name (Gopal Nair).

### 3.3 Kavita Rathod — Widow Pension (Deesa, Banaskantha)
NT caste. Widow (husband deceased). 3 children (ages 8, 11, 14). Income ₹48,000. Pre-seed: Widow Pension application in "Revenue Officer Verification" step. Aadhaar: XXXX-XXXX-5001.

### 3.4 Ahmed Shaikh — Ineligibility Demo (Rajkot)
General caste. Income ₹4,80,000. Family of 3. **Zero schemes eligible.** Shows the system correctly excludes ineligible families — important for trust.

### 3.5 Meera Solanki — Large Joint Family (Vadodara)
ST caste. 7 members. Grandparent Ramabai (71) eligible for Old Age Pension — pre-seed as IDENTIFIED. Income ₹1,75,000.

### 3.6 Seed Reset Script
File: `demo_reset.sh` at project root. Run before every demo session.

```bash
#!/bin/bash
# demo_reset.sh — restores pristine demo state

POSTGRES_POD=$(kubectl get pods -n egov -l app=postgres -o jsonpath='{.items[0].metadata.name}')

echo "Resetting beneficiary states..."
kubectl exec -it $POSTGRES_POD -n egov -- psql -U egovuser -d egov_db << 'SQL'
-- Reset Bhavesh to REMOVED (deceased)
UPDATE scheme_engine.beneficiary b
SET status = 'REMOVED', removal_reason = 'MEMBER_DECEASED'
FROM family_registry.person p
WHERE p.name = 'Bhavesh Patel' AND b.person_id = p.id;

-- Reset Savitaben to IDENTIFIED
UPDATE scheme_engine.beneficiary b
SET status = 'IDENTIFIED', removal_reason = NULL
FROM family_registry.person p
WHERE p.name = 'Savitaben Patel' AND b.person_id = p.id;

-- Reset Priya caste cert to PENDINGAPPROVAL step "Talati Verification"
-- (delete any APPROVED records, re-insert pending)
DELETE FROM caste_cert.caste_application WHERE applicant_name = 'Priya Patel';

-- Reset Rajan father to REMOVED
UPDATE scheme_engine.beneficiary b
SET status = 'REMOVED', removal_reason = 'MEMBER_DECEASED'
FROM family_registry.person p
WHERE p.name = 'Suresh Nair' AND b.person_id = p.id;
SQL

echo "Running scheme identification..."
curl -s -X POST http://localhost:$(kubectl get svc scheme-engine-service -n egov \
  -o jsonpath='{.spec.ports[0].nodePort}')/scheme-engine-service/v1/admin/run-identification

echo "Done. Demo state restored."
```

---

## 3.7 Key Scripts Inventory (project root)

| Script | Purpose | When to run |
|---|---|---|
| `demo_reset.sh` | Restore beneficiary states, seed red-badge SLA task | 30 min before every demo |
| `export-keycloak-realm.sh` | Export live Keycloak realm → refresh ConfigMap | After any realm/user change |
| `start-port-forwards.sh --restart` | Restore all port-forwards 8080–8090 | Any time forwards die |
| `seed_data/seed_families.sql` | Load 1,000 hero families + 4,597 persons | After Postgres wipe — run first |
| `seed_data/seed_demo_schemes.sql` | Load Old Age Pension, BPL, OBC Scholarship, Widow Pension | After Postgres wipe |
| `seed_data/demo_hero_patch.sql` | Extend Priya to 6-member family, correct incomes; Anjali Solanki (DOB = today-18yr) | After Postgres wipe |
| `seed_data/demo_beneficiaries.sql` | Pre-seed beneficiary records for hero families | After Postgres wipe |
| `seed_data/demo_eligibility_reason_backfill.sql` | Backfill eligibility_reason for hero beneficiaries (Savitaben, Shreya, Priya, Kavita) | After demo_beneficiaries.sql |
| `seed_data/demo_distribution_backfill.sql` | Backfill casteCategory + gender on beneficiary rows for Distribution panel (Phase 18d) | After demo_eligibility_reason_backfill.sql |
| `seed_data/generate_large_dataset.py` | Generate ~220,000 families / ~950,000 persons across all Gujarat districts (idempotent — skips if >150k families exist) | After base seed; then run run-identification |
| `build_all_portals.sh` | Rebuild all 3 portals with current WiFi IP | Before containerized demo |

> **DB state as of 2026-06-23:** ~221k families already seeded (large dataset ran during Phase 22–27 testing). This is the intended demo state — the simulator, fraud signals, and distribution panel all need this volume. Do NOT reset to 1,000 families unless specifically reproducing a clean baseline.

**Full Postgres recovery sequence (if pod restarts and wipes data):**
```bash
# 1. Create schemas
kubectl exec -it $POSTGRES_POD -n egov -- psql -U egovuser -d egov_db -c \
  "CREATE SCHEMA IF NOT EXISTS family_registry;
   CREATE SCHEMA IF NOT EXISTS scheme_engine;
   CREATE SCHEMA IF NOT EXISTS caste_cert;
   CREATE SCHEMA IF NOT EXISTS marriage_cert;
   CREATE SCHEMA IF NOT EXISTS pension;
   CREATE SCHEMA IF NOT EXISTS family_member_svc;
   CREATE SCHEMA IF NOT EXISTS scheme_application;
   CREATE SCHEMA IF NOT EXISTS grievance;
   CREATE SCHEMA IF NOT EXISTS notifications;"

# 2. Restart all Spring Boot services (they recreate their own tables via ddl-auto)
kubectl rollout restart deployment -n egov \
  family-registry-service scheme-engine-service caste-certificate-service \
  pension-service family-member-service scheme-application-service \
  marriage-certificate-service auth-service grievance-service notifications-service

# 3. Reload base hero seed data (in order)
kubectl exec -i $POSTGRES_POD -n egov -- psql -U egovuser -d egov_db \
  < seed_data/seed_families.sql
kubectl exec -i $POSTGRES_POD -n egov -- psql -U egovuser -d egov_db \
  < seed_data/seed_demo_schemes.sql
kubectl exec -i $POSTGRES_POD -n egov -- psql -U egovuser -d egov_db \
  < seed_data/demo_hero_patch.sql
kubectl exec -i $POSTGRES_POD -n egov -- psql -U egovuser -d egov_db \
  < seed_data/demo_beneficiaries.sql
kubectl exec -i $POSTGRES_POD -n egov -- psql -U egovuser -d egov_db \
  < seed_data/demo_eligibility_reason_backfill.sql
kubectl exec -i $POSTGRES_POD -n egov -- psql -U egovuser -d egov_db \
  < seed_data/demo_distribution_backfill.sql

# 4. Generate large dataset (~15 min — run overnight before demo day)
kubectl port-forward svc/postgres 5433:5432 -n egov &
python seed_data/generate_large_dataset.py
kill %1

# 5. Auto-identify beneficiaries from large dataset (~10–15 min)
kubectl port-forward svc/scheme-engine-service 8096:8080 -n egov &
curl -s -X POST http://localhost:8096/scheme-engine-service/v1/admin/run-identification | jq .
kill %1

# 6. Restore demo state (clears Savitaben disbursement, seeds SLA task)
./demo_reset.sh
```

---

## 4. Keycloak Persistence Fix ✅ Done (DS-2)

**Risk:** Keycloak H2 loses all realm data on pod restart. Demo-day landmine.

**Fix:** Export realm JSON and mount as ConfigMap for auto-import on startup.

```bash
# 1. Port-forward Keycloak
kubectl port-forward svc/keycloak 8090:8080 -n egov

# 2. Export realm (run after Keycloak is set up with all users)
curl -s http://localhost:8090/admin/realms/egov \
  -H "Authorization: Bearer $(curl -s http://localhost:8090/realms/master/protocol/openid-connect/token \
    -d 'client_id=admin-cli&grant_type=password&username=admin&password=admin' \
    | jq -r '.access_token')" > egov-realm.json

# 3. Create ConfigMap
kubectl create configmap keycloak-realm \
  --from-file=egov-realm.json=./egov-realm.json -n egov

# 4. Patch Keycloak deployment to import on start
kubectl patch deployment keycloak -n egov --patch '
spec:
  template:
    spec:
      containers:
      - name: keycloak
        env:
        - name: KC_IMPORT
          value: /opt/keycloak/data/import/egov-realm.json
        volumeMounts:
        - name: realm-config
          mountPath: /opt/keycloak/data/import
      volumes:
      - name: realm-config
        configMap:
          name: keycloak-realm'
```

**Definition of done — VERIFIED ✅** Delete Keycloak pod. Wait for restart. Login as `talati/officer123` succeeds without running `setup-keycloak.sh`. Uses `--import-realm` arg with ConfigMap volume mount.

---

## 5. Phase 6d — Scheme Coverage: Geographic Drill-down
**Tool:** Cursor
**Effort:** 1 day
**Status:** Cursor prompt already written in PROJECT_PLAN.md

Execute the existing Cursor prompt exactly as specced. No changes needed.

**Definition of done:**
1. `GET /v1/schemes/coverage` returns all schemes with enrolment counts
2. `GET /v1/schemes/{id}/geographic` returns district → taluka → citizens hierarchy with at least Ahmedabad and Banaskantha
3. Officer portal `/coverage` shows scheme cards, geographic accordion, searchable citizen table
4. Sidebar "📊 Scheme Coverage" link visible for all roles

---

## 6. Phase 7 — Gujarati Chatbot (Bhashini + Rule-based State Machine)
**Tool:** Cursor
**Effort:** 2 days
**Dependency:** Bhashini API key (register at dashboard.bhashini.co.in before starting)

### 6.1 Architecture

```
citizen-portal chatbot widget
        ↓  POST /v1/chat  (text + sessionId)
chatbot-service (Spring Boot, port 8088)
        ↓  if language == Gujarati:
        →  Bhashini NMT API (gu → en)   [translate input]
        ↓  intent matching (Java state machine)
        →  family-registry / caste-cert / scheme-engine APIs
        ↓  compose English response
        →  Bhashini NMT API (en → gu)   [translate response]
        ↓  return { reply: "...", sessionState: {...} }
citizen-portal renders reply
```

Bhashini fallback: if Bhashini call fails or >2s timeout → skip translation, respond in English, show banner "Gujarati translation temporarily unavailable."

### 6.2 chatbot-service spec

**Location:** `/Users/sameerkhanna/Documents/Projects/DG2.0/chatbot-service/`
**Schema:** none (session state in ConcurrentHashMap, expires after 10 min inactivity)
**Package:** `org.magicsword.chatbot`

**Session state object:**
```java
record ChatSession(
  String sessionId,
  String currentIntent,        // APPLY_CASTE | APPLY_PENSION | CHECK_STATUS | DISCOVER | ELIGIBILITY
  Map<String, String> collected, // fields gathered so far
  String aadhaarRef,           // set after citizen identified
  Instant lastActivity
)
```

**Intent detection (keyword rules, English after Bhashini translate):**

| Keywords (post-translate) | Intent |
|---|---|
| caste, certificate, jati, jaati, obc, sc, st | APPLY_CASTE |
| pension, old age, widow, disability, vridh | APPLY_PENSION |
| status, track, tracking, application, check | CHECK_STATUS |
| scheme, yojana, eligible, benefit, scholarship | ELIGIBILITY |
| help, service, what can, how to | DISCOVER |

**Conversation flows:**

*APPLY_CASTE:*
```
Bot: "What is your full name?"
→ collect: applicantName
Bot: "What is your caste category? (SC / ST / OBC / NT / General)"
→ collect: casteCode
Bot: "What is your Aadhaar reference? (format: XXXX-XXXX-NNNN)"
→ collect: aadhaarRef
→ POST /caste-certificate-service/v1/applications
Bot: "Application submitted. Tracking number: {trackingId}. Check status in 24 hours."
```

*CHECK_STATUS:*
```
Bot: "Please share your tracking number."
→ collect: trackingId
→ if FLW- prefix: GET /caste-cert or /pension-service/v1/applications/{id}
→ if DGT- prefix: GET /marriage-cert/v1/applications/{id}
Bot: "Your {serviceName} application is currently at: {currentTask}."
```

*ELIGIBILITY:*
```
Bot: "Please share your Aadhaar reference."
→ GET /family-registry-service/v1/persons/search?aadhaar={ref}
→ GET /family-registry-service/v1/families/{familyId}/scheme-eligibility
Bot: "Your family is eligible for 3 schemes: BPL Ration Card, OBC Scholarship, Old Age Pension. 
     Type 'apply' followed by the scheme name to start."
```

**Bhashini integration:**
```java
// Translate gu → en before processing
String englishText = bhashiniClient.translate(userInput, "gu", "en");

// Translate en → gu before responding
String gujaratiReply = bhashiniClient.translate(englishReply, "en", "gu");
```

Bhashini endpoint: `https://dhruva-api.bhashini.gov.in/services/inference/pipeline`
Auth header: `Authorization: {your-api-key}`
Pipeline task: `translation` (NMT model for gu-en pair)

**K8s manifest:** NodePort 30088 for local access.

### 6.3 Chatbot widget in citizen-portal

Bottom-right chat bubble. Fixed position. Appears on all screens after login.

```jsx
// ChatWidget.jsx — add to App.jsx layout after auth check
<ChatWidget 
  sessionId={citizenProfile.aadhaarRef}
  prefilledAadhaar={citizenProfile.aadhaarRef}
/>
```

Widget renders an iframe-free chat panel: bubble → click → 360×500px panel slides up → message list + input. Close button collapses. Unread badge on bubble.

**Demo moment:** Priya types *"જ્ઞાતિ પ્રમાણ પત્ર"* → bot responds in Gujarati → collects fields → submits → tracking number returned in Gujarati.

**Definition of done:**
1. chatbot-service starts, health endpoint responds
2. English intent detection works for all 5 intents
3. Bhashini translation round-trip works (gu→en→gu)
4. APPLY_CASTE flow submits a real application end-to-end
5. CHECK_STATUS returns live status for a real tracking number
6. ELIGIBILITY flow returns Priya's 3 eligible schemes in Gujarati
7. Fallback English mode activates when Bhashini unavailable
8. Widget renders on citizen-portal home screen

---

## 7. Phase 8 — Containerize Portals + Ingress
**Tool:** Cursor + bash
**Effort:** 1 day

### 7.1 Nginx Dockerfile for all three portals

Same pattern for citizen-portal, officer-portal, family-portal:

```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`nginx.conf` (handles React Router — all routes serve index.html):
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Build sequence (run from each portal directory after `npm run build`):
```bash
# citizen-portal
VITE_API_BASE=http://$(ipconfig getifaddr en0):30000 npm run build
docker build -t citizen-portal:arm64-local .
kubectl apply -f k8s-manifest-citizen-portal.yaml

# officer-portal
npm run build
docker build -t officer-portal:arm64-local .
kubectl apply -f k8s-manifest-officer-portal.yaml

# family-portal
npm run build
docker build -t family-portal:arm64-local .
kubectl apply -f k8s-manifest-family-portal.yaml
```

### 7.2 NodePort assignments (no port-forwarding required)

| Portal / Service | NodePort | Access URL |
|---|---|---|
| citizen-portal | 30074 | `http://<mac-ip>:30074` |
| officer-portal | 30073 | `http://<mac-ip>:30073` |
| family-portal | 30075 | `http://<mac-ip>:30075` |
| superset | 30076 | `http://<mac-ip>:30076` (admin/admin123; officer portal embeds via guest tokens) |
| auth-service | 30087 | `http://<mac-ip>:30087` |
| caste-cert | 30080 | internal only |
| pension-service | 30082 | internal only |
| family-registry | 30085 | internal only |
| scheme-engine | 30086 | internal only |
| chatbot-service | 30088 | internal only |
| Keycloak | 30090 | `http://<mac-ip>:30090` |

All service-to-service calls use cluster DNS (`service-name.egov.svc.cluster.local`). Only portals and auth-service are NodePort-exposed. No port-forwarding during demo.

**VITE_API_BASE** is set at build time to Mac's WiFi IP. Script `build_all_portals.sh`:
```bash
#!/bin/bash
MAC_IP=$(ipconfig getifaddr en0)
echo "Building portals for IP: $MAC_IP"

cd /Users/sameerkhanna/Documents/Projects/DG2.0/citizen-portal
VITE_API_BASE=http://$MAC_IP npm run build
docker build -t citizen-portal:arm64-local .
kubectl rollout restart deployment/citizen-portal -n egov

cd /Users/sameerkhanna/Documents/Projects/DG2.0/officer-portal
VITE_API_BASE=http://$MAC_IP npm run build
docker build -t officer-portal:arm64-local .
kubectl rollout restart deployment/officer-portal -n egov

cd /Users/sameerkhanna/Documents/Projects/DG2.0/family-portal
VITE_API_BASE=http://$MAC_IP npm run build
docker build -t family-portal:arm64-local .
kubectl rollout restart deployment/family-portal -n egov

echo "All portals rebuilt and redeployed."
```

**Definition of done:** All 3 portals accessible via browser at NodePort URLs. Zero port-forwarding active. officer-portal login works. citizen-portal OTP login works.

---

## 8. Phase 9 — Android APK (Capacitor Wrap)
**Tool:** Android Studio + Capacitor CLI
**Effort:** Half day
**Dependency:** Phase 8 (citizen-portal containerized and on NodePort)

### 8.1 Steps

```bash
cd /Users/sameerkhanna/Documents/Projects/DG2.0/citizen-portal

# Install Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# Init (one time)
npx cap init "Digital Gujarat" "gov.gujarat.dg2" --web-dir=dist
```

`capacitor.config.json`:
```json
{
  "appId": "gov.gujarat.dg2",
  "appName": "Digital Gujarat",
  "webDir": "dist",
  "server": {
    "cleartext": true,
    "allowNavigation": ["*"]
  }
}
```

```bash
# Add Android platform
npx cap add android

# Build React + sync into Android
VITE_API_BASE=http://$(ipconfig getifaddr en0) npm run build
npx cap sync android

# Open Android Studio
npx cap open android
# → Build → Build Bundle(s)/APK(s) → Build APK(s)
# APK: android/app/build/outputs/apk/debug/app-debug.apk

# Sideload on phone
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### 8.2 App icon

In Android Studio: right-click `res` → New → Image Asset → select DG 2.0 / Gujarat Govt logo PNG. Set adaptive icon. Rebuild APK.

### 8.3 scrcpy setup

```bash
brew install scrcpy

# USB mode (preferred for demo)
adb devices           # verify phone detected
scrcpy --window-title "Priya's Phone — Digital Gujarat" \
       --max-fps 30 \
       --window-width 400
```

Position the scrcpy window on the left half of the screen. Officer portal browser on the right half. Both visible simultaneously on the projector.

**WiFi mode (if cable-free needed):**
```bash
adb tcpip 5555
adb connect <android-phone-ip>:5555
scrcpy
```

**Definition of done:** APK installed on Android phone. Opens to "Digital Gujarat" login screen. OTP login as Priya (XXXX-XXXX-1001 / 123456) succeeds. All 5 service tiles visible. scrcpy window shows phone at 400px width on Mac desktop.

---

## 9. Phase 10 — Grievance Module
**Tool:** Cursor
**Effort:** 1 day
**RFP mapping:** Criterion 1.1d — Multi-channel Feedback and Grievance Reporting

### 9.1 grievance-service (new Spring Boot service)

**Location:** `/Users/sameerkhanna/Documents/Projects/DG2.0/grievance-service/`
**Schema:** `grievance`
**Package:** `org.magicsword.grievance`
**Engine:** Plain JPA (no Flowable — simple 3-status lifecycle)

**Table:**
```sql
CREATE TABLE grievance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_ref VARCHAR(50),    -- the FLW- or DGT- tracking number they're complaining about
  aadhaar_ref VARCHAR(50),
  citizen_name VARCHAR(200),
  complaint_text TEXT,
  status VARCHAR(20) DEFAULT 'OPEN',  -- OPEN / ACKNOWLEDGED / RESOLVED
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  officer_notes TEXT
);
```

**APIs:**
```
POST /v1/grievances           → citizen submits (aadhaarRef, trackingRef, complaintText)
GET  /v1/grievances?aadhaar=  → citizen views own grievances
GET  /v1/grievances/all       → officer views all open grievances
PATCH /v1/grievances/{id}     → officer updates status + notes
```

### 9.2 Citizen portal — "Raise a Complaint" screen

New tile on citizen-portal home: "🔔 My Complaints". Two sections:

*Raise new complaint:*
- Tracking number input (pre-filled if coming from status check screen)
- Complaint text (textarea, 500 chars)
- Submit button → POST /grievances → show "Complaint submitted. Reference: GRV-xxxxx"

*My complaints list:*
- Cards per complaint: tracking ref, status badge (OPEN=red / ACKNOWLEDGED=amber / RESOLVED=green), complaint text, submitted date

### 9.3 Officer portal — Grievances tab

New sidebar item "🔔 Grievances" (visible to all officer roles).
Table: Citizen Name | Tracking Ref | Complaint | Submitted | Status | Action
Action buttons: "Acknowledge" (PATCH status=ACKNOWLEDGED) | "Resolve" (PATCH status=RESOLVED + notes modal)

**Definition of done:**
1. Priya submits complaint → officer sees it in < 5 seconds (5s poll)
2. Officer acknowledges → Priya's portal shows ACKNOWLEDGED badge
3. Full round-trip in under 2 minutes

---

## 10. Phase 11 — Consent Management Screen
**Tool:** Cursor
**Effort:** Half day
**RFP mapping:** Criterion 1.1e — Consent Management, Data Sharing, Revocation

### 10.1 Backend — consent table in family-registry-service

Add to `family_registry` schema (no new service needed):
```sql
CREATE TABLE consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aadhaar_ref VARCHAR(50),
  department VARCHAR(100),
  data_category VARCHAR(100),  -- 'Identity', 'Income', 'Family', 'Location'
  purpose TEXT,
  granted_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'ACTIVE'   -- ACTIVE / REVOKED
);
```

New endpoints in family-registry-service:
```
GET  /v1/persons/{aadhaarRef}/consents  → list all consents
PATCH /v1/persons/{aadhaarRef}/consents/{id}/revoke → set status=REVOKED
```

Pre-seed 3 consents for Priya (XXXX-XXXX-1001):
1. Social Welfare Dept — Income data — ACTIVE (for BPL ration card)
2. Pension Dept — Aadhaar + Family data — ACTIVE (for Old Age Pension)
3. Food & Supply Dept — Location data — REVOKED (already revoked — shows history)

### 10.2 Citizen portal — "My Data & Consents" screen

New tab in citizen-portal bottom navigation (mobile) or main menu (desktop).

Layout:
- Header: "Your Data Shared with Government Departments"
- One card per consent: Department name | Data shared | Purpose | Status badge | "Revoke" button (only on ACTIVE)
- Revoked consents shown greyed with "Revoked on {date}"
- On revoke: confirmation modal → PATCH → card updates to REVOKED instantly

**Definition of done:** Priya sees 3 consent cards. Clicks Revoke on one. Card turns grey. No page reload.

---

## 11. Phase 12 — SLA Countdown Badge on Officer Task Cards
**Tool:** Cursor (frontend only — no backend changes)
**Effort:** 2 hours
**RFP mapping:** Criterion 1.1f — SLAs for service delivery

Each task card in officer-portal task queue gets an SLA badge computed in React:

```jsx
function SLABadge({ createdAt, slaHours }) {
  const deadline = new Date(createdAt).getTime() + slaHours * 3600000;
  const remaining = deadline - Date.now();
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);

  if (remaining <= 0) return <span className="sla-badge red">⚠️ SLA BREACHED</span>;
  if (hours < 1) return <span className="sla-badge red">⏱ {mins}m remaining</span>;
  if (hours < 6) return <span className="sla-badge amber">⏱ {hours}h {mins}m remaining</span>;
  return <span className="sla-badge green">⏱ {hours}h {mins}m remaining</span>;
}
```

SLA hours by service:
- Caste certificate (Talati step): 24h
- Caste certificate (Mamlatdar step): 24h
- Pension (Revenue Officer): 48h
- Pension (Sanctioning Officer): 48h
- Marriage certificate: 72h

**Seed one red-badge application:** Before demo, insert a Priya caste-cert application with `created_at = NOW() - INTERVAL '23 hours'` so it shows a red "⏱ 58m remaining" badge during the presentation.

```sql
-- Run this ~1 hour before demo
UPDATE caste_cert.caste_application 
SET created_at = NOW() - INTERVAL '23 hours'
WHERE applicant_name = 'Priya Patel'
AND status = 'TALATI_VERIFICATION';
```

---

## 12. Phase 13 — Notifications Service
**Tool:** Cursor
**Effort:** 1 day
**RFP mapping:** RFP Vol 1 §3.2.6 — Application Tracking and Transparency

### 12.1 notifications-service (new Spring Boot service)

**Location:** `/Users/sameerkhanna/Documents/Projects/DG2.0/notifications-service/`
**Schema:** `notifications`
**Package:** `org.magicsword.notifications`

**Table:**
```sql
CREATE TABLE notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aadhaar_ref VARCHAR(50),
  title VARCHAR(200),
  message TEXT,
  service_name VARCHAR(100),
  tracking_id VARCHAR(100),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**APIs:**
```
POST /v1/notifications          → internal call from other services on approval events
GET  /v1/notifications?aadhaar= → citizen fetches own notifications (unread first)
PATCH /v1/notifications/{id}/read → mark as read
```

### 12.2 Hook approvals into notifications

In each service's approval handler, after status update, POST to notifications-service:

```java
// Example: caste-certificate-service ApprovalService.java
notificationClient.send(NotificationRequest.builder()
  .aadhaarRef(application.getAadhaarRef())
  .title("Application Approved")
  .message("Your Caste Certificate (OBC) application " + app.getEngineRef() 
    + " has been approved. Use this certificate for OBC Scholarship applications.")
  .serviceName("Caste Certificate")
  .trackingId(application.getEngineRef())
  .build());
```

The `message` field includes a context hint (what can this certificate be used for next) — hardcoded per service type. No AI needed.

### 12.3 Citizen portal — notification bell

Bell icon in citizen-portal header. Polls `GET /notifications?aadhaar={ref}` every 30s.
Unread count badge (red circle). Click → dropdown list of last 10 notifications.
Each notification: title, message, time ago ("2 minutes ago"), click marks as read.

**Definition of done:**
1. Officer approves Priya's caste cert
2. Within 30s, bell shows "1" badge on Priya's phone
3. Priya opens notifications: "Your Caste Certificate (OBC) has been approved. Use for OBC Scholarship applications."

---

## 13. Phase 14 — Admin Platform Dashboard
**Tool:** Cursor (frontend only — aggregates existing API data)
**Effort:** Half day
**RFP mapping:** Criterion 1.2 — Govt Officer Module (MIS reporting)
**Status (2026-07-02):** Superseded by Apache Superset Reports module in officer portal (`/reports`). Custom React `/admin` dashboard deferred; Superset provides executive KPI dashboards with embedded guest-token access.

New screen in officer-portal at route `/admin` — visible to DEPT_ADMIN role only.

### Two sections:

**Section 1 — Today's Platform Stats (5 stat cards)**

Poll each service every 10s, aggregate in React:
```
Total Applications Today | Approved Today | Pending | Escalated (SLA breached) | Avg Processing Time
```

Computation in React — no backend aggregation service needed:
```jsx
// Fetch from all services in parallel
const [casteCert, pension, marriage, schemeApp] = await Promise.all([
  fetch('/api/caste-cert/v1/applications'),
  fetch('/api/pension/v1/applications'),
  fetch('/api/marriage-cert/v1/applications'),
  fetch('/api/scheme-app/v1/applications')
]);
// Filter by today's date, count statuses
```

**Section 2 — Service-wise Breakdown (horizontal bar chart)**

Pure CSS bars, no chart library:
```jsx
{services.map(s => (
  <div className="service-bar-row">
    <span className="label">{s.name}</span>
    <div className="bar" style={{ width: `${(s.count / maxCount) * 100}%` }}>
      {s.count}
    </div>
  </div>
))}
```

---

## 14. Phase 15 — Two-Engine Architecture Live Panel
**Tool:** Cursor (frontend only — pure React SVG)
**Effort:** 2 hours
**RFP mapping:** Criterion 2a — Modularity and cohesiveness

An "ℹ️ Architecture" button in officer-portal header (visible always). Click → slide-in panel from the right (300px wide).

Panel contains a minimal inline SVG showing:
- Box 1: "Flowable Engine" (orange) with live counter: "4 active tasks"
- Box 2: "DIGIT egov-workflow-v2" (blue) with live counter: "1 active task"
- Arrow from each box to "Unified Task Queue" in centre
- Arrow from Task Queue to "Officer Workstation"

Counters pulled from the existing task queue data already fetched on the Task Queue screen — no additional API calls. The numbers update whenever the task queue polls.

**Presenter line:** *"Two workflow engines — Flowable for citizen certificate services, DIGIT's own engine for marriage registration. One task queue, one approval UX. DST is not locked into any single vendor. This is the architecture."*

---

## 15. Phase 16 — Eligibility Explanation in Beneficiary Records
**Tool:** Cursor (backend — 2 hours)
**Effort:** 2 hours

Add `eligibility_reason` VARCHAR(500) to `scheme_engine.beneficiary` table.

Populate in `SchemeIdentificationService.java` when creating IDENTIFIED records:

```java
String reason = buildReason(person, family, scheme);
// Example output: "Age 65 ≥ 60 (minimum). Family income ₹1.32L < ₹2L (ceiling). Caste OBC: all castes eligible."

private String buildReason(Person p, Family f, Scheme s) {
  List<String> parts = new ArrayList<>();
  if (s.getMinAge() != null) parts.add("Age " + age + " ≥ " + s.getMinAge() + " (minimum)");
  if (s.getIncomeCeiling() != null) parts.add("Family income ₹" + formatLakh(income) + " < ₹" + formatLakh(s.getIncomeCeiling()) + " (ceiling)");
  if (s.getEligibleCastes() != null) parts.add("Caste " + p.getCasteCategory() + " in eligible list");
  return String.join(". ", parts) + ".";
}
```

Show in officer-portal Scheme Management → View Beneficiaries table: "Identified by: Eligibility Engine | Reason: {eligibilityReason}".

**Presenter line:** *"The system doesn't just identify — it explains. Every eligibility decision is auditable and human-readable. That is AI governance."*

---

## 16. Phase 18 — Responsible AI Module
**Tool:** Cursor
**Total effort:** 1.5 days
**RFP mapping:** Criterion 4 (Governance, Ethics, Transparency), Criterion 1.1e (Data Governance)

Four interconnected features that make the platform's AI claims demonstrable — not a slide, a live system.

**Evaluator framing:** *"We chose a rules engine over ML because citizens have a right to know exactly why they qualify or don't. Every decision is explainable, auditable, and overridable. This is responsible AI."*

---

### 18a — Eligibility Reason Chain (Officer Portal)
**Effort:** 2h backend + 1h frontend
**Depends on:** Phase 16 backend (`eligibility_reason` field)

**Backend** (scheme-engine-service — extends Phase 16):

In `createIdentifiedBeneficiary()`, call `buildReason()` and store in `eligibility_reason`:

```java
private String buildReason(Scheme scheme, FamilyData family, FamilyData.MemberData head) {
  List<String> parts = new ArrayList<>();
  if (scheme.getMinAge() != null) {
    int age = head.getDob() != null ? ageFromDob(head.getDob()) : 0;
    parts.add("Age " + age + " ≥ " + scheme.getMinAge() + " (minimum)");
  }
  if (scheme.getMaxAge() != null) {
    int age = head.getDob() != null ? ageFromDob(head.getDob()) : 0;
    parts.add("Age " + age + " ≤ " + scheme.getMaxAge() + " (maximum)");
  }
  if (scheme.getIncomeCeiling() != null) {
    long income = family.getTotalAnnualIncome() != null ? family.getTotalAnnualIncome() : 0L;
    parts.add("Income ₹" + formatLakh(income) + " < ₹" + formatLakh(scheme.getIncomeCeiling()) + " (ceiling)");
  }
  if (scheme.getEligibleCastes() != null && !scheme.getEligibleCastes().isBlank()) {
    parts.add("Caste " + head.getCasteCategory() + " in eligible list");
  } else {
    parts.add("All castes eligible");
  }
  parts.add("Scheme active " + (scheme.getValidFrom() != null ? "from " + scheme.getValidFrom() : ""));
  return String.join("|", parts);
}

private String formatLakh(long amount) {
  if (amount >= 100000) return String.format("%.2fL", amount / 100000.0);
  return "₹" + amount;
}
```

Pipe-delimited so frontend can split and render each criterion as a chip.

`eligibility_reason` is already added to `BeneficiaryResponse` in Phase 16. No new endpoint needed.

**Frontend** (officer-portal BeneficiaryDashboard):

Each beneficiary card expands to show criteria chips when clicked:

```jsx
function ReasonChips({ reason }) {
  if (!reason) return null
  return (
    <div className="reason-chips">
      {reason.split('|').map((r, i) => (
        <span key={i} className="reason-chip reason-chip-pass">✓ {r.trim()}</span>
      ))}
      <span className="reason-source">Identified by Eligibility Engine</span>
    </div>
  )
}
```

CSS for reason chips:
```css
.reason-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
.reason-chip { font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 4px; }
.reason-chip-pass { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }
.reason-source { font-size: 0.7rem; color: var(--text-secondary); width: 100%; margin-top: 0.2rem; }
```

Presenter line: *"Every identification decision shows the exact rules that fired — not a black box."*

---

### 18b — "Why You Qualify" Citizen View
**Effort:** 2h frontend only
**Depends on:** `eligibility_reason` in BeneficiaryResponse (Phase 16 + 18a backend); `/v1/beneficiaries/family/{familyId}` endpoint (Phase 6d)

**Frontend** (citizen-portal Home screen):

Fetch beneficiaries for the logged-in citizen's family on Home load. For each scheme card, add a ▸ expand chevron. Expanded:

```jsx
function WhyQualify({ reason, lang }) {
  if (!reason) return null
  const criteria = reason.split('|').map(r => r.trim())
  return (
    <div className={`why-qualify ${lang === 'gu' ? 'dg-gu' : ''}`}>
      <div className="why-qualify-header">
        {lang === 'gu' ? 'આ સ્કીમ શા માટે મળે છે:' : 'Why you qualify:'}
      </div>
      {criteria.map((c, i) => (
        <div key={i} className="why-qualify-row">
          <span className="why-check">✓</span>
          <span>{c}</span>
        </div>
      ))}
      <div className="why-engine">
        {lang === 'gu' ? 'પાત્રતા એન્જિન દ્વારા ઓળખાયેલ' : 'Identified by Eligibility Engine'}
      </div>
    </div>
  )
}
```

Gujarati translations of reason text:
- "Age N ≥ M (minimum)" → "ઉંમર N ≥ M (ન્યૂનતમ)"
- "Income ₹X < ₹Y (ceiling)" → "આવક ₹X < ₹Y (મર્યાદા)"
- "Caste C in eligible list" → "જ્ઞાતિ C પાત્ર"
- "All castes eligible" → "તમામ જ્ઞાતિ પાત્ર"
- "Scheme active from D" → "સ્કીમ D થી સક્રિય"

Implement as a `translateReason(reason, lang)` function in a new `src/reasonUtils.js` file. Uses simple string substitution — no API call.

CSS:
```css
.why-qualify { background: #f0f7f0; border-left: 3px solid #4caf50; padding: 0.6rem 0.75rem; border-radius: 0 6px 6px 0; margin-top: 0.5rem; }
.why-qualify-header { font-weight: 600; font-size: 0.8rem; color: #2e7d32; margin-bottom: 0.4rem; }
.why-qualify-row { display: flex; gap: 0.4rem; font-size: 0.8rem; color: var(--text-primary); margin-bottom: 0.2rem; }
.why-check { color: #4caf50; font-weight: 700; }
.why-engine { font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.4rem; font-style: italic; }
```

Presenter line (Scene 3 extension): *"Priya doesn't just see 'eligible' — she sees exactly why. That's transparent governance."*

---

### 18c — Override + Decision Audit Log
**Effort:** 3h backend + 2h frontend

**Backend** (scheme-engine-service):

Add 3 fields to `Beneficiary` entity (ddl-auto=update handles columns):
```java
private String confirmedBy;   // officer name who confirmed
private String overrideBy;    // officer name who overrode
private String overrideReason; // required when status manually changed
```

Add to `BeneficiaryResponse` record: `confirmedBy`, `overrideBy`, `overrideReason`.

New endpoint in BeneficiaryController:
```java
@PatchMapping("/{id}/override")
public ResponseEntity<BeneficiaryResponse> override(
    @PathVariable UUID id,
    @RequestBody OverrideRequest req) {
  return ResponseEntity.ok(service.overrideBeneficiary(id, req));
}
```

New model:
```java
public record OverrideRequest(
  String status,        // "CONFIRMED" or "REMOVED" only
  String reason,        // required, min 10 chars
  String officerName    // from client — localStorage.getItem('officer_name')
) {}
```

Service method `overrideBeneficiary()`:
- Validates status is CONFIRMED or REMOVED
- Validates reason is non-blank
- Sets status + timestamps + overrideBy + overrideReason
- Saves + returns updated BeneficiaryResponse

Update existing `confirmBeneficiary()` — add optional `String officerName` param, store in `confirmedBy`.

New endpoint:
```java
@GetMapping("/{id}/audit")
public ResponseEntity<List<AuditEvent>> getAudit(@PathVariable UUID id)
```

`AuditEvent` record: `{ Instant timestamp, String action, String actor, String reason }`

Build audit trail from entity fields — no separate table:
```java
List<AuditEvent> events = new ArrayList<>();
events.add(new AuditEvent(b.getIdentifiedAt(), "IDENTIFIED", "Eligibility Engine (auto)", b.getEligibilityReason()));
if (b.getConfirmedAt() != null)
  events.add(new AuditEvent(b.getConfirmedAt(), "CONFIRMED", b.getConfirmedBy() != null ? b.getConfirmedBy() : "Officer", null));
if (b.getRemovedAt() != null)
  events.add(new AuditEvent(b.getRemovedAt(), "REMOVED",
    b.getOverrideBy() != null ? b.getOverrideBy() : "Eligibility Engine (auto)",
    b.getOverrideReason() != null ? b.getOverrideReason() : b.getRemovalReason()));
events.sort(Comparator.comparing(AuditEvent::timestamp));
return events;
```

**Frontend** (officer-portal BeneficiaryDashboard):

Each beneficiary card gets two additions:

1. **Override button** (visible to REVENUE_OFFICER and DEPT_ADMIN):
   Opens a modal:
   - Status dropdown: "Confirm" / "Remove"
   - Reason textarea (required, min 10 chars, placeholder: "Enter reason for override…")
   - Submit → PATCH /v1/beneficiaries/{id}/override with `{ status, reason, officerName }`
   - On success: card updates inline, audit log refreshes

2. **Audit Trail section** (expandable, below reason chips):
   ```
   Timeline:
   15-Jun 14:32  IDENTIFIED    Eligibility Engine (auto)
                               Age 23 ≥ 18. Income ₹1.4L < ₹3L. All castes eligible.
   16-Jun 09:15  CONFIRMED     Talati Meera Patel
   20-Jun 11:44  REMOVED       Eligibility Engine (auto) — MEMBER_DECEASED
   20-Jun 14:00  OVERRIDE      Revenue Officer Mehta
                               "Orphaned family, exceptional circumstances per DC directive"
   ```

   Each row: coloured left border (green=IDENTIFIED/CONFIRMED, red=REMOVED, amber=OVERRIDE).
   Fetch from GET /v1/beneficiaries/{id}/audit when section expands.

Pass officer name via JS when calling confirm/override:
```js
headers: {
  'Content-Type': 'application/json',
  'X-Officer-Name': localStorage.getItem('officer_name') ?? 'Officer'
}
```

Presenter line: *"Every decision — automated or manual — is in the audit log. RTI-ready on day one."*

---

### 18d — Fairness Distribution Panel
**Effort:** 3h frontend only
**Depends on:** Phase 6d SchemeCoverage screen + `/v1/schemes/{id}/citizens` endpoint

**Frontend** (officer-portal SchemeCoverage.jsx — extends Phase 6d):

Add third tab "📊 Distribution" to the scheme detail panel.

First, ensure `BeneficiaryResponse` includes `casteCategory` from the Person record. If missing, add it to scheme-engine-service: in `toBeneficiaryResponse()` add `casteCategory` field sourced from the Beneficiary entity. Add `casteCategory` field to `Beneficiary` entity and populate in `createIdentifiedBeneficiary()` from `head.getCasteCategory()`.

**Distribution tab content (3 CSS bar chart sections):**

**By Caste** — compare enrolled % vs Gujarat population benchmark:

| Caste | Gujarat population | If enrolled % is >20% below population → flag amber |
|---|---|---|
| OBC | 48% | |
| SC | 7% | |
| ST | 15% | |
| NT | 8% | |
| General | 22% | |

```jsx
const GUJARAT_POPULATION = { OBC: 48, SC: 7, ST: 15, NT: 8, GENERAL: 22 }

function CasteBar({ caste, count, total, benchmark }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const diff = pct - benchmark
  const flagged = diff < -20
  return (
    <div className={`dist-row ${flagged ? 'dist-flagged' : ''}`}>
      <span className="dist-label">{caste}</span>
      <div className="dist-bar-track">
        <div className="dist-bar" style={{ width: `${pct}%` }} />
      </div>
      <span className="dist-pct">{pct}%</span>
      <span className="dist-count">({count})</span>
      {flagged && <span className="dist-warn">⚠ Underrepresented</span>}
    </div>
  )
}
```

**By District** — flag any district enrolled < 5% when its Gujarat population share > 7%:

Hardcode Gujarat district population shares (top 10 districts only, approximate):
```js
const GUJARAT_DISTRICT_SHARE = {
  Ahmedabad: 16, Surat: 13, Vadodara: 8, Rajkot: 7, Mehsana: 5,
  Banaskantha: 5, Anand: 4, Gandhinagar: 3, Kutch: 3, Other: 36
}
```
Flag districts where enrolled share < (district population share / 2).

**By Gender:**
Compute from `personName` — this is approximate; add `gender` to `BeneficiaryResponse` sourced from head's gender field in Beneficiary entity. Group: Female-headed vs Male-headed households.

**CSS for distribution bars:**
```css
.dist-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; font-size: 0.82rem; }
.dist-label { width: 80px; color: var(--text-secondary); flex-shrink: 0; }
.dist-bar-track { flex: 1; height: 14px; background: var(--border); border-radius: 7px; overflow: hidden; }
.dist-bar { height: 100%; background: var(--gov-blue-mid); border-radius: 7px; transition: width 0.4s ease; }
.dist-pct { width: 36px; text-align: right; font-weight: var(--weight-semibold); }
.dist-count { width: 40px; color: var(--text-secondary); }
.dist-warn { color: var(--warning); font-size: 0.72rem; font-weight: var(--weight-semibold); }
.dist-flagged .dist-bar { background: var(--warning); }
.dist-flagged .dist-label { color: var(--warning); }
```

Add section headers:
```jsx
<div className="dist-section-header">Caste Distribution vs Gujarat Population</div>
<div className="dist-section-header">District Coverage</div>
<div className="dist-section-header">Household Gender</div>
```

Presenter line: *"The system monitors its own coverage gaps in real time. Kutch at 2% is flagged. The field team gets a notification — not a manual report six months later."*

---

### 18 — Definition of done

1. Officer creates CM Digital Literacy Scheme → identifies 247 → clicks beneficiary → sees criteria chips: ✓ Age ✓ Income ✓ Caste ✓ Scheme active
2. Criteria use real values (actual age/income numbers), not placeholders
3. Citizen portal: Priya expands BPL Ration Card → sees "Why you qualify" with all 3 criteria in Gujarati when in GU mode
4. Officer clicks Override on any beneficiary → modal → enters reason → status changes → card reflects new status
5. Audit log shows: IDENTIFIED (Engine) → CONFIRMED (officer name) → OVERRIDE (officer name + reason)
6. Audit log also shows auto-removal: IDENTIFIED → REMOVED by Eligibility Engine — MEMBER_DECEASED (for Bhavesh)
7. SchemeCoverage Distribution tab shows caste bars for any scheme with real percentages
8. At least one district shows ⚠ Underrepresented (will be visible once data spans multiple districts)
9. All 4 features work without any new external service or new K8s deployment

---

## 16a. Phase 19 — Fraud Analytics Panel
**Tool:** Cursor
**Effort:** 1 day
**RFP mapping:** Criterion 1.2 — Platform Intelligence / Proactive Governance

No new service — extends scheme-engine-service (new endpoint) and officer-portal (new screen). All signals computed live from existing Beneficiary + Person data. Rule-based, not ML — every flag has a human-readable explanation that ties into the Responsible AI narrative.

### 16a.1 Backend — fraud-signals endpoint in scheme-engine-service

New endpoint: `GET /v1/admin/fraud-signals`

Four signal types computed live from existing data:

| Signal Type | Logic | Severity |
|---|---|---|
| `INCOME_CLIFF` | Person's `annualIncome` ≥ 90% of scheme's `incomeCeiling` AND status `ACTIVE` — possible deliberate gaming | MEDIUM |
| `MULTI_SCHEME_OVERLAP` | Same `aadhaarRef` has `ACTIVE` beneficiary records in 2+ income-support schemes (`benefitType = MONTHLY_CASH` or `ANNUAL_CASH`) | HIGH |
| `AGE_ANOMALY` | Person's DOB implies age > 100 (born before 1926-01-01) and status `ACTIVE` — data integrity issue | LOW |
| `FAMILY_INCOME_MISMATCH` | Household total income < ₹50,000 but at least one member has `annualIncome` > ₹1,80,000 — internal inconsistency | HIGH |

Response DTO:
```java
record FraudSignalDTO(
    String signalType,        // INCOME_CLIFF / MULTI_SCHEME_OVERLAP / AGE_ANOMALY / FAMILY_INCOME_MISMATCH
    String severity,          // HIGH / MEDIUM / LOW
    String personName,
    String aadhaarRef,
    String familyId,
    String schemeId,
    String schemeName,
    String detail,            // human-readable: "Income ₹1.87L is 93% of ₹2L ceiling"
    java.time.LocalDateTime detectedAt
) {}
```

Implementation in `SchemeEngineService.getFraudSignals()`:
- Query all ACTIVE beneficiaries
- For each, join with Person (via aadhaarRef) and Scheme to evaluate the 4 rules
- Return List<FraudSignalDTO> sorted by severity (HIGH first)
- Cap at 100 results for display

### 16a.2 Seed fraud signals in demo data

Before demo, verify these 3 cases exist in DB (adjust data if needed):

```sql
-- 1. INCOME_CLIFF: find a pension beneficiary close to ₹2L ceiling
--    If none exist, update one active pension beneficiary's income:
UPDATE family_registry.person SET annual_income = 187000
WHERE aadhaar_ref = 'XXXX-XXXX-XXXX'  -- pick any active pension beneficiary
  AND annual_income < 187000;

-- 2. MULTI_SCHEME_OVERLAP: verify same person ACTIVE in 2 cash schemes
--    (likely already in seed data — check first)
SELECT aadhaar_ref, count(*) as scheme_count
FROM scheme_engine.beneficiary
WHERE status = 'ACTIVE'
GROUP BY aadhaar_ref
HAVING count(*) > 1;

-- 3. FAMILY_INCOME_MISMATCH: verify at least one family with inconsistency
--    (likely already present in 1000-family seed)
```

### 16a.3 Officer portal — Fraud Signals screen

New sidebar link: `🚨 Fraud Signals` visible to `REVENUE_OFFICER` and `DEPT_ADMIN` roles (add after Beneficiaries link).

New route: `/fraud-signals`

Layout:
- **Summary strip** (3 chips): 🔴 HIGH: N | 🟡 MEDIUM: N | ⚪ LOW: N
- **Signal cards** per flagged record:
  - Person name + aadhaar ref (last 4 digits masked: XXXX-XXXX-\*\*\*\*)
  - Signal type badge (HIGH=red, MEDIUM=amber, LOW=grey)
  - Scheme name
  - Detail text (the human-readable rule explanation)
  - "View Beneficiary →" link
- Auto-refreshes every 30s
- Empty state: "✅ No active fraud signals detected."

**Demo talking point:** *"The system flags anomalies automatically — with the exact rule that triggered each flag. This is not a black box: every alert is explainable, traceable, and actionable by the field officer."*

### 16a.4 Definition of done

1. GET /v1/admin/fraud-signals returns ≥ 3 signals with real data
2. Fraud Signals tab visible in sidebar for DEPT_ADMIN login
3. HIGH severity signals show at top with red badge
4. Each card shows the specific rule detail (e.g. "Income ₹1.87L is 93% of ₹2L ceiling for Old Age Pension")
5. Signal count refreshes without page reload

---

## 16b. Phase 20 — Scheme Forecasting Simulator
**Tool:** Cursor
**Effort:** 1 day
**RFP mapping:** Criterion 1.1b — Proactive identification + budget planning

No new service — extends scheme-engine-service (new endpoint) and officer-portal (new screen within Scheme Management). The simulator runs the existing eligibility engine with hypothetical parameters and shows projected impact before any scheme is published.

### 16b.1 Backend — simulate endpoint in scheme-engine-service

New endpoint: `POST /v1/schemes/simulate`

Request:
```json
{
  "baseSchemeId": "uuid-optional",
  "parameters": {
    "minAge": 18,
    "maxAge": 60,
    "maxIncome": 300000,
    "eligibleCastes": ["OBC", "SC", "ST", "NT"],
    "benefitType": "ANNUAL_CASH"
  }
}
```

Response:
```json
{
  "currentCount": 44,
  "projectedCount": 67,
  "delta": 23,
  "projectedBeneficiaries": [
    {
      "personName": "Priya Patel",
      "aadhaarRef": "XXXX-XXXX-1001",
      "district": "Ahmedabad",
      "taluka": "Bavla",
      "age": 38,
      "annualIncome": 132000,
      "casteCategory": "OBC",
      "qualifyingCriteria": ["Age 38 ≥ 18", "Income ₹1.32L < ₹3L ceiling", "Caste OBC in eligible list"]
    }
  ],
  "removedBeneficiaries": [
    {
      "personName": "Bhavesh Patel",
      "aadhaarRef": "XXXX-XXXX-1000",
      "reason": "is_alive = false"
    }
  ],
  "districtBreakdown": {
    "Ahmedabad": 28, "Surat": 14, "Vadodara": 9, "Other": 16
  }
}
```

Implementation in `SchemeEngineService.simulate(SimulateRequest req)`:
- If `baseSchemeId` provided: load current ACTIVE beneficiaries for that scheme as baseline
- Run eligibility rules (age range, income ceiling, caste list, alive status) against ALL Persons in family_registry
- `qualifyingCriteria`: generate the same pipe-delimited reason chain as Phase 16/18a eligibility_reason
- Cap `projectedBeneficiaries` at 50 for display; return total count accurately
- `districtBreakdown`: group projected beneficiaries by `familyDistrict`
- `removedBeneficiaries`: persons in baseline who fail the new parameters

### 16b.2 Officer portal — Scheme Simulator screen

New route: `/scheme-simulator` accessible from Scheme Management sidebar (visible to `DEPT_ADMIN` and `SCHEME_DEPT` roles).

Layout:
```
┌────────────────────────────────────────────────────────┐
│  🔮 Scheme Eligibility Simulator                       │
├────────────────────────────────────────────────────────┤
│  Base scheme (optional): [dropdown — existing schemes] │
│                                                        │
│  Age range:     [18] to [60]                           │
│  Income ceiling: [₹ 3,00,000]                         │
│  Eligible castes: [OBC ×] [SC ×] [ST ×] [NT +Add]    │
│                                                        │
│  [🔮 Run Simulation]                                   │
├────────────────────────────────────────────────────────┤
│  RESULTS                          ▲ +23 from baseline  │
│  ┌──────────────────┐                                  │
│  │  67               │   District breakdown:           │
│  │  citizens qualify │   Ahmedabad ██████ 28           │
│  └──────────────────┘   Surat     ████   14            │
│                          Vadodara  ███    9             │
│                          Other     ████   16            │
│                                                        │
│  [Name] [Age] [Income] [District] [Why they qualify]  │
│  Priya Patel  38  ₹1.32L  Bavla  Age ✓ Income ✓ ...  │
└────────────────────────────────────────────────────────┘
```

- District breakdown: CSS bar chart (same pattern as Phase 18d distribution bars)
- Results table: sortable by income, age, district
- "💾 Save as Draft Scheme" button → pre-fills Create Scheme form with the simulated parameters

**Demo talking point:** *"Before the government announces a new scheme, the platform tells you exactly how many citizens qualify, which districts they're in, and what the disbursement budget should be. No assumptions. No surprises after launch."*

### 16b.3 Definition of done

1. POST /v1/schemes/simulate returns valid response with projectedCount > 0
2. Simulator screen accessible in officer-portal under Scheme Management sidebar
3. Selecting "Old Age Pension" as base + raising income ceiling to ₹2.5L shows delta > 0
4. District breakdown chart renders with real data
5. Projected beneficiary table shows qualifying criteria per person
6. "Save as Draft" opens Create Scheme modal pre-filled with simulated parameters

---

## 16c. Phase 21 — Disbursement Status
**Tool:** Cursor
**Effort:** 0.5 day
**RFP mapping:** Criterion 1.1b — End-to-end scheme delivery lifecycle

Extends Beneficiary lifecycle: IDENTIFIED → CONFIRMED → DISBURSED. No new service.

**Backend (scheme-engine-service):** Add `disbursementStatus` (PENDING_DISBURSEMENT / DISBURSED), `disbursedAt`, `disbursementRef` (GOV-TXN-{8 random digits}) to Beneficiary entity (ddl-auto=update adds columns). New endpoint `PATCH /v1/beneficiaries/{id}/disburse` — sets DISBURSED, generates ref, fires notification: "₹{benefitValue} credited to your registered bank account. Ref: GOV-TXN-XXXXXXXX." Add fields to BeneficiaryResponse.

**Officer portal:** "Mark Disbursed" button on CONFIRMED cards (REVENUE_OFFICER + DEPT_ADMIN). On click: card updates to "DISBURSED ✓ {date}" + ref.

**Citizen portal:** Beneficiary status card shows "Payment Status: ₹X credited — Ref: GOV-TXN-XXXXXXXX".

**Definition of done:** Officer marks Savitaben's pension DISBURSED → citizen portal shows payment credited → bell notification fires within 30s.

---

## 16d. Phase 22 — Certificate PDF Generation
**Tool:** Cursor
**Effort:** 0.5 day
**RFP mapping:** Criterion 1.1a — Digital certificate issuance

Generate a downloadable PDF when a caste certificate is approved. No DigiLocker integration.

**Backend (caste-certificate-service):** Add `itext 5.5.13.3` to pom.xml. New endpoint `GET /v1/applications/{id}/certificate` returns `application/pdf`. PDF layout: Gujarat Govt header, applicant name, Aadhaar (last 4 masked), caste category, certificate number (= trackingId), issue date, QR verification placeholder, Mamlatdar signatory block. Returns 404 if status ≠ APPROVED.

**Portals:** "Download Certificate" button on approved applications in both citizen-portal and officer-portal.

**Definition of done:** Priya's approved caste cert → button appears → click → PDF downloads with real name, OBC, cert number, date.

---

## 16e. Phase 23 — Clarification Tab (2-Way Q&A)
**Tool:** Cursor
**Effort:** 1 day
**RFP mapping:** Criterion 1.1d — Multi-channel communication and transparency

Citizen raises questions on a specific application. Officer replies. Citizen notified when answered.

**Backend (extend grievance-service):** Add `clarification` table to `grievance` schema: `id`, `application_ref`, `aadhaar_ref`, `citizen_name`, `service_name`, `question`, `answer`, `asked_at`, `answered_at`, `status (PENDING/ANSWERED)`. Endpoints: `POST /v1/clarifications`, `GET /v1/clarifications?aadhaar=`, `GET /v1/clarifications/pending`, `PATCH /v1/clarifications/{id}/answer`. On answer: fire notification to citizen.

**Citizen portal:** "💬 Ask a Question" section on application status screen — pre-filled application ref, text input, Q&A history below.

**Officer portal:** New "💬 Clarifications" sidebar (all roles). Table: Citizen | App Ref | Question | Status. "Answer" button → inline textarea.

**Definition of done:** Priya asks question on FLW-XXXXX → officer answers → Priya's bell fires → answer visible under her application.

---

## 16f. Phase 24 — Event-Triggered Identification (Girl Turns 18)
**Tool:** Cursor
**Effort:** 1 day
**RFP mapping:** Criterion 1.1b — Proactive identification, event-driven architecture

Kafka-powered: system detects an 18th birthday and auto-identifies the person for eligible youth schemes — proactive, no manual trigger.

**Backend (scheme-engine-service):** `@Scheduled(cron = "0 0 0 * * *")` daily job finds persons turning 18 today → fires Kafka event on topic `person.age.milestone` → consumer runs eligibility for that family → creates IDENTIFIED records → fires notification "Congratulations! You are now eligible for {scheme}."

**Demo trigger endpoint:** `POST /v1/admin/trigger-birthday-check?date={yyyy-MM-dd}` runs check for given date without waiting for midnight.

**Seed data:** Add daughter Anjali to Meera Solanki's family with `dob = CURRENT_DATE - INTERVAL '18 years'` in demo_hero_patch.sql. Add scheme "CM Girl Child Education Grant" (minAge=18, maxAge=25, all castes, incomeCeiling ₹3L).

**Definition of done:** Presenter calls trigger endpoint → Anjali's citizen portal bell shows "Congratulations! You are now eligible for CM Girl Child Education Grant" within 10s → IDENTIFIED record on beneficiary dashboard.

---

## 16g. Phase 25 — Assisted Note Generation (Officer Portal)
**Tool:** Cursor
**Effort:** 0.5 day
**RFP mapping:** Criterion 1.2 — AI-assisted officer workflows

Template-based note generation from live application data. No AI API. Fits the explainable-AI narrative.

**Frontend only (officer-portal):** "📝 Generate Note" button on each task card. Fetches application detail → assembles note client-side:

```
Application {trackingId} — {serviceName}
Applicant: {name} ({casteCode}, Aadhaar XXXX-XXXX-XXXX)
Submitted: {date} | Step: {taskName} | SLA: {status}

System verification:
✓ {eligibilityReason criterion 1}
✓ {eligibilityReason criterion 2}

Recommended action: [APPROVE / REQUEST_DOCUMENTS / REJECT]
Officer notes: ___________  Reviewed by: ___________  Date: ___________
```

Modal with editable textarea + "Copy to Clipboard" button.

**Definition of done:** Officer clicks "📝 Generate Note" → modal with pre-filled note shows real eligibility criteria from engine → editable → copy works.

---

## 16h. Phase 26 — IT Secretary Ops Dashboard
**Tool:** Cursor
**Effort:** 1 day
**RFP mapping:** Criterion 2a — Platform observability; Criterion 4 — Governance

New `IT_ADMIN` role in Keycloak (user: `it.admin / officer123`). New screen `/ops-dashboard` in officer portal.

**Keycloak:** Add `it.admin / officer123` with role `IT_ADMIN`. Re-export realm ConfigMap via `export-keycloak-realm.sh`.

**Backend (scheme-engine-service):** New endpoint `GET /v1/admin/ops-summary` → returns totalFamilies, totalPersons, totalBeneficiaries, totalSchemes, fraudSignalCount {HIGH/MEDIUM/LOW}, openGrievances, resolvedGrievances.

**Officer portal — `/ops-dashboard`** (IT_ADMIN only, sidebar: "🖥 Ops Dashboard"):
1. **Service Health Grid** — ping each service `/actuator/health` via nginx proxy. Green/red dot per service. 30s poll.
2. **Platform Stats** — 4 stat cards from ops-summary. Fraud severity chips.
3. **Key Issues** — grievance category breakdown as CSS horizontal bars.

**Definition of done:** `it.admin` login → Ops Dashboard in sidebar → all services green → live stats match DB → bars render.

---

## 16i. Phase 27 — Plug & Play Workflow Panel (BPMN Viewer)
**Tool:** Cursor
**Effort:** 0.5 day
**RFP mapping:** Criterion 2a — Modularity; configurable service workflows

Shows the caste certificate BPMN workflow visually. Demonstrates that government services are configured, not hard-coded.

**Frontend only (officer-portal):** "⚙️ Workflow Config" button in header. Slide-in panel (400px) shows:

1. **Swimlane diagram** (React SVG or pure CSS): Citizen Submits → Talati Verification (24h SLA, TALATI role) → Mamlatdar Approval (24h SLA, MAMLATDAR role) → Certificate Issued. Each box shows role + SLA + "Flowable BPMN 2.0" badge.

2. **BPMN XML snippet** (first 10 lines of caste_certificate.bpmn) in a `<pre>` syntax-highlighted block.

**Talking point:** *"Each step — form, approver role, SLA — is declared in this BPMN file. Add a new step: edit the XML. Deploy: one kubectl apply. No application code changes."*

**Definition of done:** Button in header → panel slides in → swimlane with 4 steps, roles, SLAs → XML snippet renders → closes cleanly.

---

## 17. Phase 17 — Demo Script + Screen Recording
**Tool:** Manual
**Effort:** Half day (after all phases complete)

### 16.1 Demo script file

File: `DEMO_SCRIPT.md` at project root. Format: exact URLs, exact credentials, exact talking points per step, recovery commands.

### 16.2 Screen layout on presentation day

```
┌─────────────────────────────────────────────────────┐
│                Mac Screen (mirrored to projector)    │
├──────────────────────┬──────────────────────────────┤
│   scrcpy window      │   Chrome browser             │
│   Android phone      │   officer-portal             │
│   400px wide         │   (remaining width)          │
│                      │                              │
│  [citizen-portal     │  [task queue / beneficiary   │
│   APK running]       │   dashboard / scheme mgmt]   │
└──────────────────────┴──────────────────────────────┘
```

### 16.3 Backup screen recording

Record full 20-minute demo flow using QuickTime (File → New Screen Recording). Audio commentary live. Save as `DG20_Demo_Backup.mov`. Keep on USB stick. If live environment fails, play recording without apology — "Let me show you the recorded walkthrough so we can cover all features without interruption."

### 16.4 Pre-demo checklist (run 30 min before)

```bash
# 1. Verify all pods running
kubectl get pods -n egov | grep -v Running  # should return nothing

# 2. Reset demo state
./demo_reset.sh

# 3. Rebuild portals with current IP (if network changed)
./build_all_portals.sh

# 4. Verify citizen-portal NodePort accessible
curl -s http://$(ipconfig getifaddr en0):30074 | grep "Digital Gujarat"

# 5. Verify officer login
curl -s -X POST http://$(ipconfig getifaddr en0):30090/realms/egov/protocol/openid-connect/token \
  -d 'client_id=officer-portal&grant_type=password&username=talati&password=officer123' \
  | jq .access_token

# 6. Seed red-badge application (1 hour before)
kubectl exec -it $(kubectl get pods -n egov -l app=postgres -o jsonpath='{.items[0].metadata.name}') -n egov -- \
  psql -U egovuser -d egov_db -c \
  "UPDATE caste_cert.caste_application SET created_at = NOW() - INTERVAL '23 hours' WHERE applicant_name = 'Priya Patel';"

# 7. Reset Savitaben disbursement status (so Scene 12 "Mark Disbursed" can be shown live)
kubectl exec -it $(kubectl get pods -n egov -l app=postgres -o jsonpath='{.items[0].metadata.name}') -n egov -- \
  psql -U egovuser -d egov_db -c \
  "UPDATE scheme_engine.beneficiary SET disbursement_status = NULL, disbursed_at = NULL, disbursement_ref = NULL
   WHERE person_name = 'Savitaben Patel' AND status = 'CONFIRMED';"

# 7. Connect phone, start scrcpy
adb devices
scrcpy --window-title "Priya's Phone — Digital Gujarat" --max-fps 30 --window-width 400

# 8. Open officer-portal in Chrome
open http://$(ipconfig getifaddr en0):30073
```

---

## 17. Complete Build Sequence

| Order | Phase | Deliverable | Effort | Tool | Status | Blocks |
|---|---|---|---|---|---|---|
| 0 | DS-1 | Shared design system (tokens, Noto Sans, dg-* classes) | 2h | Cursor | ✅ Done | All UI |
| 1 | DS-2 | Keycloak ConfigMap persistence fix | 1h | bash | ✅ Done | Officer login |
| 2 | DS-3 | Seed data verify/extend + demo_reset.sh | 2h | SQL + bash | ✅ Done | Demo narrative |
| 3 | Phase 6d | Scheme Coverage geographic drill-down | 1 day | Cursor | ✅ Done | Scene 11 |
| 4 | Phase 12 | SLA countdown badge | 2h | Cursor | ✅ Done | Scene 6 |
| 5 | Phase 15 | Two-engine architecture panel | 2h | Cursor | ✅ Done | Scene 7 |
| 6 | Phase 7 | Gujarati chatbot (static bilingual, no Bhashini) | 2 days | Cursor | ✅ Done | Scene 2+3 |
| 7 | Phase 8 | Containerize portals + NodePort ingress | 1 day | Cursor + bash | ✅ Done | All mobile |
| 8 | Phase 9 | Android APK + scrcpy | 0.5 day | Android Studio | ⬜ Deferred | Mobile demo |
| 9 | Phase 10 | Grievance module | 1 day | Cursor | ✅ Done | Scene 13 |
| 10 | Phase 11 | Consent management screen | 0.5 day | Cursor | ✅ Done | Scene 4 |
| 11 | Phase 13 | Notifications service + bell | 1 day | Cursor | ✅ Done | Scene 8 |
| 12 | Phase 14 | Admin platform dashboard | 0.5 day | Cursor | ✅ Superseded | Scene 9 — replaced by Superset Reports |
| 13 | Phase 16 | Eligibility reason explanation (backend) | 2h | Cursor | ✅ Done | Phase 18a |
| 14 | Phase 18 | Responsible AI module (4 features) | 1.5 days | Cursor | ✅ Done | Scene 3+10+11 |
| 15 | Phase 19 | Fraud Analytics panel | 1 day | Cursor | ✅ Done | Scene 14 |
| 16 | Phase 20 | Scheme Forecasting Simulator | 1 day | Cursor | ✅ Done | Scene 15 |
| 17 | Phase 21 | Disbursement status (CONFIRMED → DISBURSED + citizen notification) | 0.5 day | Cursor | ✅ Done | Scene 12 ext |
| 18 | Phase 22 | Certificate PDF generation (download on approval) | 0.5 day | Cursor | ✅ Done | Scene 8 ext |
| 19 | Phase 23 | Clarification tab (2-way Q&A on applications) | 1 day | Cursor | ✅ Done | Scene 16 |
| 20 | Phase 24 | Event-triggered identification (girl turns 18, Kafka) | 1 day | Cursor | ✅ Done | Scene 17 |
| 21 | Phase 25 | Assisted note generation (officer portal, template-based) | 0.5 day | Cursor | ✅ Done | Scene 6 ext |
| 22 | Phase 26 | IT Secretary ops dashboard (IT_ADMIN role) | 1 day | Cursor | ✅ Done | Scene 18 |
| 23 | Phase 27 | Plug & play workflow panel (BPMN viewer) | 0.5 day | Cursor | ✅ Done | Scene 19 |
| — | Person entity fields + Simulator improvements | — | Claude | ✅ Done | educationLevel/maritalStatus/employmentStatus; age fix; attrition; beneficiary modal |
| — | Family Registry redesign | — | Claude | ✅ Done | Search UX; pagination; sort/filter; family tree visual overhaul |
| — | Apache Superset + Reports module | — | Cursor + bash | ✅ Done | 2 dashboards; embedded SDK; guest tokens; analytics views |
| — | Citizen portal Gujarati i18n + CAF | — | Cursor | ✅ Done | 530 keys; 5-step Common Application Form wizard |
| — | Officer portal UX polish | — | Cursor | ✅ Done | Task Queue table; full-width Fraud + Grievances; Reports filter panel hidden |
| — | Grievance-service K8s probe fix | — | bash | ✅ Done | Fixes citizen complaint 502 on slow startup |
| 24 | Phase 17 | Demo script + screen recording | 0.5 day | Manual | ⬜ Last | Rehearsal |
| **Total remaining** | | | **~1.5 days** | | | |

**Recommended build sequence (remaining):**

```
Citizen AI P1 (AI-1,2,4)  →  Citizen AI P2 (AI-3,5)  →  Architecture panel  →  Officer Home/Login  →  Phase 17 Demo Script  →  Phase 9 APK
        ~1.5d                      ~1.5d                    ~0.5d              ~1d                 0.5d                  0.5d
```

**Phase 14 (Admin Dashboard)** was superseded by Apache Superset Reports — executive KPI dashboards live at officer portal `/reports` with embedded guest-token access.

**Phase 9 (Android APK)** done last before Phase 17 — all portal screens must be complete first.

---

## 18. 20-Minute Demo Run Order

| # | Scene | Duration | Portal | Who | RFP |
|---|---|---|---|---|---|
| 1 | Priya opens Digital Gujarat app on phone. Enters Aadhaar XXXX-XXXX-1001. OTP screen. Enters 123456. Logged in. Name pre-filled. | 1.5 min | Citizen (Android) | Priya | Crit 1a, eKYC |
| 2 | Switches to ગુજરાતી. All labels flip. Types in Gujarati chatbot: *"જ્ઞાતિ પ્રમાણ પત્ર"*. Bot collects fields in Gujarati. Submits. Returns FLW- tracking number in Gujarati. | 2 min | Citizen (Android) | Priya | Crit 2d, AI |
| 3 | Priya types *"અમારા પરિવારને કઈ સ્કીમ મળી શકે?"*. Bot responds: 3 schemes in Gujarati. Priya taps BPL Ration Card → expands → *"Why you qualify"* panel in Gujarati: ✓ Income ✓ Household size ✓ All castes eligible. *"She doesn't just see eligible — she sees why."* | 1.5 min | Citizen (Android) | Priya | Crit 1b, XAI |
| 4 | Opens "My Data & Consents". Sees 3 consent cards. Revokes Food Dept location data share. Card turns grey instantly. | 1 min | Citizen (Android) | Priya | Crit 1e |
| 5 | Switches to family-portal on browser. Shows Patel family tree — 6 nodes, Bhavesh greyed with ✝, Savitaben orange. Income breakdown. 3 scheme eligibility cards. "Apply Now" for BPL Ration Card → opens citizen-portal with familyId pre-filled. | 2 min | Family (browser) | Presenter | Crit 1b |
| 6 | Officer portal. Talati logs in. Task queue shows caste cert (FLW- green badge) + marriage cert (DGT- blue badge) + red SLA badge "⏱ 58m remaining" on Priya's app. | 1.5 min | Officer (browser) | Talati | Crit 1.2, SLA |
| 7 | Click "ℹ️ Architecture". Panel slides in. Flowable: 4 tasks. DIGIT: 1 task. Live split. *"Two engines, one queue."* | 1 min | Officer (browser) | Presenter | Crit 2a |
| 8 | Talati approves Priya's caste cert. Switch to phone — within 30s bell shows "1". Priya opens: *"Caste Certificate approved. Use for OBC Scholarship."* | 1.5 min | Both | Both | §3.2.6 |
| 9 | Dept Admin logs in. Platform Overview: live counts + service breakdown bars. | 1 min | Officer (browser) | Admin | Crit 1.2 MIS |
| 10 | Scheme Management → Create "CM Digital Literacy Scheme" (age 18–35, income < ₹3L). Click "Run Identification". 247 IDENTIFIED. Click one beneficiary → see criteria chips: *✓ Age 23 ≥ 18 · ✓ Income ₹1.4L < ₹3L · ✓ All castes eligible*. Click Override on a borderline case → enter reason → status updates → audit log shows: IDENTIFIED (Engine) → OVERRIDE (Revenue Officer Mehta) with reason. *"Every decision is explainable, auditable, and overridable. RTI-ready on day one."* | 3 min | Officer (browser) | Admin | Scheme AI, XAI |
| 11 | Scheme Coverage → BPL Ration Card. Geographic: Ahmedabad → Bavla → Priya. Switch to Distribution tab: caste bars (OBC 41%, SC 28%…), district bars — Kutch ⚠ Underrepresented. *"The system monitors its own coverage gaps."* | 1.5 min | Officer (browser) | Admin | §3.2.9, Fairness |
| 12 | Family Registry → find Patel family → Delete Bhavesh (mark deceased). Switch to Beneficiary Dashboard. Within 5s: "Old Age Pension auto-removed for Bhavesh Patel — MEMBER_DECEASED". Open audit trail: IDENTIFIED → CONFIRMED → REMOVED (auto). Savitaben shows IDENTIFIED. | 2 min | Officer (browser) | Admin | Kafka, event-driven |
| 13 | Priya submits grievance on phone ("Status not updated for 24h"). Officer sees it in Grievances tab. Acknowledges. Phone shows ACKNOWLEDGED. | 1.5 min | Both | Both | Crit 1d |
| 14 | Dept Admin opens Fraud Signals. Three flags: 🔴 MULTI_SCHEME_OVERLAP — same citizen ACTIVE in pension + BPL cash scheme. 🟡 INCOME_CLIFF — beneficiary income ₹1.87L is 93% of ₹2L ceiling. ⚪ AGE_ANOMALY — record shows age 103. Each card shows the exact rule that fired. *"Not a black box — every alert is explainable and actionable."* | 1.5 min | Officer (browser) | Admin | Crit 1.2, XAI |
| 15 | Scheme Simulator. Admin selects "Old Age Pension" as baseline. Raises income ceiling to ₹2.5L, expands castes to include General. Clicks "Run Simulation" → 67 citizens qualify (▲ +23). District breakdown: Ahmedabad 28, Surat 14. Beneficiary table shows Priya's mother Savitaben as newly qualifying. *"Before announcing the scheme, the government knows exactly who benefits and can plan the budget."* | 2 min | Officer (browser) | Admin | Crit 1.1b |
| 16 | Priya clicks "💬 Ask a Question" on her caste cert status screen. Types "What is the process for physical delivery of the certificate?" Officer sees it in Clarifications tab → types answer → submits. Priya's bell shows new notification. Answer visible under her application. *"2-way communication built in — no call centres, no helpdesks."* | 1.5 min | Both | Both | Crit 1.1d |
| 17 | Presenter triggers POST /admin/trigger-birthday-check for today's date. Within 10s: Anjali Solanki's citizen portal shows bell "Congratulations! You are now eligible for CM Girl Child Education Grant." Beneficiary dashboard shows new IDENTIFIED record. Kafka logs show event flow. *"The system reaches out to citizens — they don't discover schemes, the scheme finds them."* | 1.5 min | Officer + Citizen | Admin | Crit 1.1b, Kafka |
| 18 | Login as it.admin / officer123. Ops Dashboard: all services green, 1,000 families, 44 beneficiaries, 3 open grievances, 2 HIGH fraud signals. Grievance category breakdown bars. *"The IT Secretary sees platform health in real time — no manual reports, no Monday meetings."* | 1.5 min | Officer (browser) | IT Admin | Crit 2a |
| 19 | Click "⚙️ Workflow Config" in header. Panel slides in: caste cert swimlane (Citizen → Talati 24h → Mamlatdar 24h → Issued). BPMN XML snippet below. *"A new government service is configured in this file — workflow steps, roles, SLAs. No code. One kubectl apply."* | 1 min | Officer (browser) | Presenter | Crit 2a |
| **Total** | | **~33 min** | | | |

**Scene extensions (add after base phases complete):**
- Scene 6 +0.5 min (Phase 25): Officer clicks "📝 Generate Note" → pre-filled note with real eligibility criteria.
- Scene 8 +0.5 min (Phase 22): Priya taps "Download Certificate" → formatted PDF downloads.
- Scene 12 +0.5 min (Phase 21): Officer marks Savitaben DISBURSED → citizen notification "₹1,000 credited — Ref: GOV-TXN-XXXXXXXX".

**Scene 10 talking point (Responsible AI):** *"We chose a rules engine over ML because in welfare administration, citizens have a right to know exactly why they qualify or don't. A neural net cannot tell you that. Our engine can — and every decision is in the audit log before the officer even opens the file."*

---

## 19. Gotchas and Constraints (Do Not Rediscover)

| # | Gotcha | Fix |
|---|---|---|
| 1 | Bitnami Kafka broken for single-node KRaft | Use `apache/kafka:latest` plain deployment |
| 2 | Flowable 8 silent fail on fresh schema | pg_dump from caste_cert + sed rename before every new Flowable service |
| 3 | imagePullPolicy must be Never | All K8s manifests — images are local |
| 4 | @CrossOrigin must list all 3 portal origins | 5173, 5174, 5175 on every controller |
| 5 | Keycloak H2 loses state on pod restart | Phase 1 fix (ConfigMap realm import) |
| 6 | arm64 images only — Apple Silicon | eclipse-temurin:17-jre-jammy base always |
| 7 | VITE_API_BASE must be WiFi IP not localhost | Rebuild portals if network changes |
| 8 | Android cleartext HTTP required | `cleartext: true` in capacitor.config.json |
| 9 | Bhashini API needs DIBD approval | Register now at dashboard.bhashini.co.in |
| 10 | Bhashini uptime not guaranteed | English fallback mandatory in chatbot-service |
| 11 | scrcpy needs adb device connected before launch | `adb devices` first |
| 12 | HistoricVariableInstance.getValue() can return null | null checks / getOrDefault() everywhere |
| 13 | egov-persister silently unreliable | INSERT manually if row doesn't appear after API call |
| 14 | SPRING_DATASOURCE_DRIVER_CLASS_NAME must be explicit | OTel JDBC conflict otherwise |
| 15 | Kafka daily-event-volume formula silent zero | Always validate observable output, not absence of errors |
| 16 | Postgres pod restart wipes ephemeral data ("too many clients" may trigger restart) | Recovery: create schemas → restart Spring services → re-run seed_families.sql + seed_demo_schemes.sql + demo_hero_patch.sql + demo_beneficiaries.sql → run demo_reset.sh |
| 17 | Rajan Nair's deceased father is **Gopal Nair** in the DB (not Suresh) | demo_reset.sh already uses correct name; don't introduce Suresh in future SQL |
| 18 | Keycloak realm export must be refreshed after any realm change | Run `./export-keycloak-realm.sh` then update ConfigMap + rollout restart — see DS-2 |
| 19 | Flowable variable join in demo_reset.sh: use `proc_inst_id_` not `execution_id_` | Joining `act_ru_task` to `act_ru_variable` via `execution_id_` gives UPDATE 0 on multi-task processes. Fixed join uses `t.proc_inst_id_ = v.proc_inst_id_` |
| 20 | Parallel `docker build` with `cd` causes race condition — wrong portal image served | Both builds run in parallel bash; `cd` in citizen-portal build affects officer-portal build context. Fix: always pass absolute path as Docker build context (`docker build -t officer-portal:arm64-local /absolute/path/to/officer-portal`) — never use `.` |
| 21 | React JSX parse error when adding modal sibling outside root div | Modal placed after closing `</div>` of root causes "Expected `,` or `)` but found `{`". Fix: wrap entire return with `<>…</>` fragment so both root div and modal are siblings under one fragment |
| 22 | `useRef` not auto-imported — causes ReferenceError at runtime | When adding AbortController pattern (`abortRef = useRef(null)`), `useRef` must be explicitly added to the React import. Common miss when only `useState/useEffect/useCallback/useMemo` were there before |
| 23 | SimulateParameters record arity — 8th field breaks existing instantiation | Adding `annualAttritionRate` makes the record 8 fields; the default `new SimulateParameters(null,…)` instantiation had 7 nulls → compiler error. Always count fields when adding to a Java record and update all call sites |
| 24 | Family Registry search "radha" returns 10,000+ rows and hangs UI | PostgreSQL GIN trigram indexes exist but query does LIKE '%radha%' with COUNT(*) OVER() window function across 10M+ index entries. Frontend mitigation: MIN_QUERY_LEN=3, AbortController cancels slow in-flight requests, Cancel button available. Advise users to use more specific terms or advanced filters |
| 25 | `grievance-service` crash-loop → citizen complaint 502 | Spring Boot startup ~85s; K8s liveness/readiness probes at 30s killed pod before ready. Fix: `initialDelaySeconds` liveness 120, readiness 90, `timeoutSeconds` 10, `failureThreshold` 6 in `grievance-service/k8s-manifest.yaml` |
| 26 | Officer Reports "Internal server error" / chart 400/404 | Plain iframe embed fails auth; missing `analytics.*` SQL views; Superset 3.1.3 lacks `big_number`/`pie` viz types. Fix: `@superset-ui/embedded-sdk` + guest tokens; run `superset/deploy_superset.sh`; charts use `dist_bar` + KPI views |
| 27 | Officer portal Reports must use `build_with_superset.sh` | Plain `build_all_portals.sh` omits `VITE_SUPERSET_EMBEDS` JSON baked at build time. Always rebuild officer portal via `officer-portal/build_with_superset.sh` after Superset dashboard or embed UUID changes |
| 28 | Postgres pod restart drops analytics views | Re-run `superset/deploy_superset.sh` and `demo_reset.sh`; rebuild officer portal with `build_with_superset.sh` |
| 29 | Superset embedded dashboard shows filter sidebar | Set `dashboardUiConfig.filters.visible: false` and `hideChartControls: true` in `Reports.jsx` embed config |

---

## 20. Service Inventory — End State

| Service | Engine | Schema | NodePort | Status |
|---|---|---|---|---|
| caste-certificate-service | Flowable | caste_cert | internal | ✅ Done |
| marriage-certificate-service | DIGIT | marriage_cert | internal | ✅ Done |
| pension-service | Flowable | pension | internal | ✅ Done |
| family-member-service | Flowable | family_member_svc | internal | ✅ Done |
| scheme-application-service | Flowable | scheme_application | internal | ✅ Done |
| family-registry-service | JPA | family_registry | internal | ✅ Done |
| scheme-engine-service | Kafka consumer | scheme_engine | internal | ✅ Done |
| auth-service | JWT | — | 30087 | ✅ Done |
| keycloak | IAM | H2 | 30090 | ✅ Done |
| chatbot-service | static bilingual state machine | — | 30088 | ✅ Done (Phase 7) |
| grievance-service | JPA | grievance | internal | ✅ Done (Phase 10) |
| notifications-service | JPA | notifications | internal | ✅ Done (Phase 13) |
| citizen-portal | Nginx/React | — | 30074 | ✅ Done (Phase 8) |
| officer-portal | Nginx/React | — | 30073 | ✅ Done (Phase 8) |
| family-portal | Nginx/React | — | 30075 | ✅ Done (Phase 8) |
| scheme-engine-service (+fraud) | Kafka + JPA | scheme_engine | internal | ✅ Done (Phase 19) |
| scheme-engine-service (+simulate) | Kafka + JPA | scheme_engine | internal | ✅ Done (Phase 20) |
| grievance-service (+clarification) | JPA | grievance (+ clarification table) | internal | ✅ Done (Phase 23) |
| scheme-engine-service (+ops-summary, +birthday-check) | Kafka + JPA | scheme_engine | internal | ✅ Done (Phase 24 + 26) |
| superset | Flask + Celery | superset | 30076 | ✅ Done (Reports module — 2 embedded dashboards, guest tokens) |
