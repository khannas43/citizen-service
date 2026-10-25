# DG 2.0 — Demo Script
**Version:** 1.0 · **Duration:** ~24 minutes · **Date:** July 2026
**Presenter:** Solo · **Environment:** MacBook + K3s + Browser

---

## Pre-Demo Checklist (T−30 min)

```bash
# 1. Verify all pods running — output should be empty (no non-Running pods)
kubectl get pods -n citizen | grep -v Running | grep -v Completed

# 2. Reset demo state
cd /Users/sameerkhanna/Documents/Projects/Citizen-Services
./demo_reset.sh

# 3. Seed red-badge SLA task (run exactly 1 hour before demo)
PGPOD=$(kubectl get pods -n citizen -l app=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n citizen $PGPOD -- psql -U citizenuser -d citizen_db -c \
  "UPDATE caste_cert.caste_application
   SET created_at = NOW() - INTERVAL '23 hours'
   WHERE applicant_name = 'Priya Patel'
   AND status = 'TALATI_VERIFICATION';"

# 4. Verify portals respond
curl -s -o /dev/null -w "%{http_code}" http://192.168.1.10:31174
curl -s -o /dev/null -w "%{http_code}" http://192.168.1.10:31173
# Both must return 200

# 5. Verify AI service healthy
curl -s http://192.168.1.10:31189/health | python3 -m json.tool
# Must show: "status":"ok", "ollama":"reachable", both models "loaded"

# 6. Connect phone (if using scrcpy)
adb devices
scrcpy --window-title "Priya's Phone — Digital Gujarat" --max-fps 30 --window-width 400 &

# 7. Open officer portal in Chrome, do NOT log in yet
open http://192.168.1.10:31173

# 8. Keep this terminal open for Scene 17 birthday trigger
```

**Browser layout on projector:**
- Left half: scrcpy (phone) OR citizen portal browser tab
- Right half: officer portal Chrome window

---

## Credentials Quick Reference

| Who | URL | Login |
|---|---|---|
| Priya (citizen) | :31174 | XXXX-XXXX-1001 · OTP 123456 |
| Talati | :31173 | talati / officer123 |
| Mamlatdar | :31173 | mamlatdar / officer123 |
| Dept Admin | :31173 | dept_admin / officer123 |
| IT Secretary | :31173 | it.admin / officer123 |

---

## Act 1 — The Citizen (0:00 – 9:00)

### Scene 1 · Priya logs in (1:30)

**URL:** `http://192.168.1.10:31174`

**Actions:**
1. Open citizen portal
2. Enter Aadhaar: `XXXX-XXXX-1001` → Continue
3. Enter OTP: `123456` → Sign In
4. Home screen loads — name pre-filled, family summary visible

**Talking point:**
> "Priya is an ASHA worker in Bavla, Ahmedabad. She logs in with her Aadhaar number and a one-time password. No username to remember. No registration. The system already knows her — because the government already has her data."

---

### Scene 2 · AI-powered search — multilingual (1:30)

**Actions:**
1. Point to the search bar on the home screen
2. Type: `pension`
3. Dropdown appears — show "⭐ For Your Profile" section with Old Age Pension, Widow Pension at top
4. Clear search. Type: `વૃદ્ધ` (Gujarati for 'elderly')
5. Same pension services appear
6. Clear search. Type: `scholarship`
7. OBC Scholarship appears at top with profile-match indicator

**Talking point:**
> "The search understands her language and her profile. She types 'elderly' in Gujarati — the system returns pension services. She types 'scholarship' — it surfaces OBC Scholarship first because it knows she has a teenage daughter. This is semantic AI search, not keyword matching: sentence-transformers embeddings with Gemma 4 reranking, running on K3s on this laptop."

---

### Scene 3 · AI Scheme Recommendations (1:30)

**Actions:**
1. Scroll below the search bar to the "🤖 Recommended for Your Family" section
2. Point to the 3–4 scheme cards showing
3. Click/expand one card to show eligibility chips (✓ Age ✓ Income ✓ Caste)
4. Point to the Gemma-generated explanation line under the scheme name
5. Toggle language to ગુજરાતી — labels flip, eligibility reasons appear in Gujarati

**Talking point:**
> "The platform doesn't wait for Priya to search. It proactively identifies schemes her family qualifies for — the eligibility engine has already run against 221,000 families in Gujarat. The AI layer ranks them by relevance and Gemma 4 writes the explanation in plain Gujarati. She doesn't just see 'eligible.' She sees exactly why."

---

### Scene 4 · Apply via Common Application Form (1:00)

**Actions:**
1. Click "Apply Now →" on the OBC Scholarship card
2. CAF wizard opens — 5 steps visible in progress bar
3. Step 1: personal details pre-filled from profile
4. Step 2: family income pre-filled
5. Point to document vault — "Aadhaar already uploaded" chip
6. Do NOT submit — just show pre-fill

**Talking point:**
> "One application form for every government service. Data the citizen already gave once — name, income, documents — is pre-filled. No re-entry, no repeated uploads. The document vault stores it once and reuses it across all applications."

---

### Scene 5 · Consent management (0:45)

**Actions:**
1. Navigate to My Data → Consents tab
2. Show 3 consent cards (Social Welfare, Pension Dept, Food Dept — one already revoked)
3. Click Revoke on an active consent → card turns grey instantly

**Talking point:**
> "Every data sharing decision is visible and revocable. This is DPDP Act compliance, not a checkbox — it's a live control panel."

---

### Scene 6 · AI search in Gujarati chatbot (1:00)

**Actions:**
1. Open the chatbot bubble (bottom-right)
2. Type: `જ્ઞાતિ પ્રમાણ પત્ર` (caste certificate in Gujarati)
3. Bot responds in Gujarati, begins collecting fields
4. Show one exchange — bot asks for name in Gujarati
5. Close chatbot (no need to complete full flow)

**Talking point:**
> "For citizens who prefer to converse rather than navigate, the Gujarati chatbot handles any service — apply, track status, check eligibility. Bhashini NMT translation. No English required."

---

## Act 2 — The Officer (9:00 – 20:00)

### Scene 7 · Officer logs in — Task Queue with SLA (1:30)

**Actions:**
1. Switch to officer portal — `http://192.168.1.10:31173`
2. Login as `talati / officer123`
3. Home screen loads — show 4 KPI cards (Pending, SLA Breached, Approved Today, AI At Risk)
4. Click "📋 Task Queue" from Quick Actions
5. Point to Priya's caste certificate row — **red SLA badge pulsing** "⏱ ~58m remaining"
6. Point to green FLW- prefix badge vs blue DGT- prefix badge on marriage cert row

**Talking point:**
> "The officer's home shows a live dashboard — pending tasks, SLA breaches, and an AI-predicted at-risk count computed by LightGBM. The task queue shows every pending application across two workflow engines. Caste certificates run on Flowable BPM. Marriage registration runs on DIGIT's own workflow engine. One queue, two engines, one approval interface."

---

### Scene 8 · AI At Risk tab (1:00)

**Actions:**
1. Click the "⚠ AI Predicted — At Risk" tab above the task table
2. Show filtered list — only at-risk tasks visible
3. Point to "🔴 Breach imminent" badge in the SLA column on a breached task
4. Hover over the badge — SHAP explanation tooltip appears ("Primary driver: time elapsed")
5. Click "All Tasks" tab to return to full list

**Talking point:**
> "The AI predicts which applications will breach SLA before they breach it. The LightGBM model scores each task on elapsed time, queue depth, service type, and officer load. SHAP values tell the officer which factor is driving the risk — not a black box, an explainable prediction. The officer can intervene before the SLA clock runs out."

---

### Scene 9 · Approve → real-time notification (1:30)

**Actions:**
1. Click Approve on Priya's caste certificate row
2. Switch to citizen portal (or phone) — within 30 seconds the bell shows "1"
3. Click bell → notification reads: "Caste Certificate approved. Use for OBC Scholarship applications."
4. On citizen portal, navigate to My Applications → status shows APPROVED
5. Click "Download Certificate" — PDF opens (Gujarat Govt header, OBC, cert number, date)

**Talking point:**
> "Approval is instant. The citizen is notified within 30 seconds — no SMS charges, no polling. The certificate downloads immediately. From application to approved document: end-to-end in under 2 minutes."

---

### Scene 10 · Architecture panel (1:00)

**Actions:**
1. Click "🏛 Architecture" in the header
2. Panel slides in — walk through 4 tiers top to bottom
3. Point to Tier 2 live counters (Flowable N tasks, DIGIT N tasks)
4. Point to Tier 3 AI card — Gemma 4, pgvector, LightGBM+SHAP, AI-1/2/4 badges
5. Close panel

**Talking point:**
> "Four tiers on a single K3s cluster. Workflow engines handle citizen requests. The eligibility engine runs proactive identification. The AI layer adds semantic search, personalised recommendations, and predictive SLA management. Apache Superset provides executive dashboards. Everything on arm64, open-source, portable to any cloud."

---

### Scene 11 · Scheme Management — create + identify + audit (3:00)

**Actions (login as dept_admin / officer123):**
1. Navigate to Scheme Management
2. Click "New Scheme" → Create "CM Digital Literacy Scheme" (age 18–35, income < ₹3L, all castes)
3. Click "Run Identification" → watch counter: 247 IDENTIFIED
4. Click one beneficiary card → eligibility chips expand:
   ✓ Age 23 ≥ 18  ✓ Income ₹1.4L < ₹3L  ✓ All castes eligible
5. Click Override on a borderline case → enter reason (min 10 chars) → status updates
6. Click Audit Trail → timeline:
   IDENTIFIED (Eligibility Engine) → CONFIRMED (officer) → OVERRIDE (Revenue Officer + reason)

**Talking point:**
> "The government creates a scheme. The platform identifies 247 eligible citizens automatically — across 221,000 families, in seconds. Every identification shows exactly which rules fired. An officer can override any decision — but that override goes into the audit log with the reason, the officer's name, and the timestamp. RTI-ready on day one. This is responsible AI: explainable, auditable, overridable."

---

### Scene 12 · Scheme Coverage — geographic drill-down + fairness (1:30)

**Actions:**
1. Navigate to Scheme Coverage → select BPL Ration Card
2. Geographic tab → Leaflet choropleth map loads — hover over Ahmedabad district
3. Click Ahmedabad → drill-down popup: talukas with beneficiary counts
4. Expand Bavla taluka → village-level counts visible
5. Switch to Distribution tab → caste bars (OBC 41%, SC 28%...)
6. Point to any district showing ⚠ Underrepresented

**Talking point:**
> "The coverage map goes to village level — every taluka, every settlement. The Distribution tab compares actual coverage against Gujarat population benchmarks by caste, district, and gender. If Kutch is underrepresented, it's flagged automatically. The system monitors its own equity gaps in real time."

---

### Scene 13 · Family Registry — deceased member → auto-removal (1:30)

**Actions:**
1. Navigate to Family Registry → search "Patel"
2. Open Priya's family tree — 6 nodes, Bhavesh greyed with ✝
3. Show Income Overview tab, Scheme Eligibility tab
4. Point to Bhavesh: "Old Age Pension — REMOVED: MEMBER_DECEASED"
5. Click Audit Trail on Bhavesh's beneficiary record:
   IDENTIFIED (Engine) → CONFIRMED (officer) → REMOVED (Engine — MEMBER_DECEASED)

**Talking point:**
> "When a family member passes, the scheme engine detects it through a Kafka event and auto-removes their benefits. No officer intervention needed. The audit trail shows the full lifecycle — automated identification, officer confirmation, automated removal. Every step documented."

---

### Scene 14 · Fraud Signals (1:00)

**Actions:**
1. Navigate to Fraud Signals (Dept Admin sidebar)
2. Show summary strip: HIGH N · MEDIUM N · LOW N
3. Point to MULTI_SCHEME_OVERLAP card — same citizen ACTIVE in pension + cash scheme
4. Point to INCOME_CLIFF card — "Income ₹1.87L is 93% of ₹2L ceiling for Old Age Pension"
5. Point to each card's "exact rule that fired" detail text

**Talking point:**
> "The platform runs four fraud detection rules continuously against all active beneficiaries. Every alert names the exact rule that triggered it. Not an anomaly score — a specific, actionable finding. The field officer sees the citizen's name, the scheme, and the precise data inconsistency. This is explainable fraud detection."

---

### Scene 15 · Scheme Forecasting Simulator (1:30)

**Actions:**
1. Navigate to Scheme Simulator
2. Select "Old Age Pension" as baseline (44 current beneficiaries)
3. Raise income ceiling from ₹2L to ₹2.5L
4. Click Run Simulation → 67 projected (▲ +23)
5. Show district breakdown bars: Ahmedabad 28, Surat 14…
6. Click projected beneficiary Savitaben → see qualifying criteria

**Talking point:**
> "Before the government announces a scheme change, the platform shows exactly how many citizens will qualify, which districts they're in, and what the disbursement budget should be. No assumptions. No surprises after launch. Policy impact assessment in 10 seconds."

---

### Scene 16 · 2-way Clarification (0:45)

**Actions:**
1. On citizen portal: My Applications → open approved caste cert → "💬 Ask a Question"
2. Type: "When will the physical certificate be delivered?"
3. Switch to officer portal → Clarifications sidebar → question visible
4. Officer types answer → Submit
5. Back to citizen portal → bell fires, answer visible under application

**Talking point:**
> "Citizens can ask questions directly on their application. Officers answer. No call centre, no helpdesk tickets. The full Q&A thread is attached to the application permanently."

---

## Act 3 — Platform Intelligence (20:00 – 24:00)

### Scene 17 · Event-triggered identification — girl turns 18 (1:00)

**Actions (from terminal):**
```bash
curl -s -X POST \
  "http://192.168.1.10:$(kubectl get svc scheme-engine-service -n citizen \
  -o jsonpath='{.spec.ports[0].nodePort}')/scheme-engine-service/v1/admin/trigger-birthday-check?date=$(date +%Y-%m-%d)"
```
1. Run the command
2. Switch to citizen portal logged in as any Solanki family member (or show Anjali's notifications)
3. Within 10 seconds: bell shows "Congratulations! You are now eligible for CM Girl Child Education Grant"

**Talking point:**
> "The platform reaches out to citizens — they don't discover schemes, the scheme finds them. Anjali Solanki turned 18 today. A Kafka event fired at midnight. The eligibility engine ran. She's notified before she opens the app. This is proactive governance."

---

### Scene 18 · IT Secretary Ops Dashboard (1:00)

**Actions (login as it.admin / officer123):**
1. Navigate to Ops Dashboard
2. Show Service Health Grid — all services green
3. Show Platform Stats: families, persons, beneficiaries, fraud signals
4. Show grievance category breakdown bars

**Talking point:**
> "The IT Secretary sees platform health in real time — every service, every metric, every open grievance. No Monday morning reports. No spreadsheets. Live, on a dashboard, from any browser."

---

### Scene 19 · BPMN Workflow Configuration (0:45)

**Actions:**
1. Click "⚙️ Workflow Config" in header
2. Panel slides in — caste cert swimlane: Citizen → Talati 24h → Mamlatdar 24h → Issued
3. Point to each step: role, SLA, Flowable BPMN badge
4. Scroll to BPMN XML snippet

**Talking point:**
> "A new government service is a BPMN XML file. Steps, roles, SLAs — declared in configuration, not code. Add a Revenue Officer verification step: edit the XML, run kubectl apply. No application deployment. This is the plug-and-play architecture DST requires."

---

## Close

> "DG 2.0 is not a demo of features — it's a demonstration of architecture. Flowable and DIGIT workflow engines behind one task queue. A rules-based eligibility engine that identifies 78,000 beneficiaries across 221,000 families. An AI layer with Gemma 4, pgvector semantic search, and LightGBM predictions — running on open-source, on-premise, on arm64. Every decision explainable. Every action auditable. Every citizen notified in real time. That is Criterion 4 — and it runs on this laptop."

---

## Recovery Commands

```bash
# Pod not Running
kubectl rollout restart deployment/<service-name> -n citizen
kubectl rollout status deployment/<service-name> -n citizen --timeout=120s

# Postgres data lost (pod restart)
PGPOD=$(kubectl get pods -n citizen -l app=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec -i -n citizen $PGPOD -- psql -U citizenuser -d citizen_db < seed_data/seed_families.sql
kubectl exec -i -n citizen $PGPOD -- psql -U citizenuser -d citizen_db < seed_data/seed_demo_schemes.sql
kubectl exec -i -n citizen $PGPOD -- psql -U citizenuser -d citizen_db < seed_data/demo_hero_patch.sql
kubectl exec -i -n citizen $PGPOD -- psql -U citizenuser -d citizen_db < seed_data/demo_beneficiaries.sql
./demo_reset.sh

# AI service down
kubectl rollout restart deployment/ai-intelligence-service -n citizen
# Wait 90s (model load time), then verify:
curl -s http://192.168.1.10:31189/health

# Notification bell not firing within 30s
kubectl logs -n citizen deployment/notifications-service --tail=20

# SLA badge not showing red
PGPOD=$(kubectl get pods -n citizen -l app=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n citizen $PGPOD -- psql -U citizenuser -d citizen_db -c \
  "UPDATE caste_cert.caste_application SET created_at = NOW() - INTERVAL '23 hours'
   WHERE applicant_name = 'Priya Patel';"

# Keycloak login fails after pod restart
kubectl rollout restart deployment/keycloak -n citizen
# Wait 60s — realm auto-imports from ConfigMap

# Port-forwards died (if using local mode)
./start-port-forwards.sh --restart

# Nuclear: full reset
./demo_reset.sh
```

---

## Scene Timing Summary

| Scene | Description | Duration | Cumulative |
|---|---|---|---|
| 1 | Citizen login | 1:30 | 1:30 |
| 2 | AI semantic search | 1:30 | 3:00 |
| 3 | AI recommendations + why you qualify | 1:30 | 4:30 |
| 4 | CAF pre-fill | 1:00 | 5:30 |
| 5 | Consent management | 0:45 | 6:15 |
| 6 | Gujarati chatbot | 1:00 | 7:15 |
| 7 | Task Queue + SLA badges | 1:30 | 8:45 |
| 8 | AI At Risk tab + SHAP | 1:00 | 9:45 |
| 9 | Approve → notification → PDF | 1:30 | 11:15 |
| 10 | Architecture panel | 1:00 | 12:15 |
| 11 | Scheme creation + audit trail | 3:00 | 15:15 |
| 12 | Coverage map + fairness | 1:30 | 16:45 |
| 13 | Family Registry + auto-removal | 1:30 | 18:15 |
| 14 | Fraud Signals | 1:00 | 19:15 |
| 15 | Scheme Simulator | 1:30 | 20:45 |
| 16 | 2-way Clarification | 0:45 | 21:30 |
| 17 | Birthday trigger (Kafka) | 1:00 | 22:30 |
| 18 | IT Ops Dashboard | 1:00 | 23:30 |
| 19 | BPMN Workflow Config | 0:45 | 24:15 |

**Buffer:** 6 minutes available if evaluators ask questions mid-demo.
**If running long:** Drop scenes 5 (Consents), 6 (Chatbot), 16 (Clarification) — saves ~2:30.
