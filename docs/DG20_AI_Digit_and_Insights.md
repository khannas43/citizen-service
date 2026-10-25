# DG 2.0 — AI Capabilities, DIGIT Architecture & Insights Plan

> **Note (2026-10-08):** the running demo uses `gemma3:4b` through Ollama (config in `ai-intelligence-service`: `config.py`, `explain.py`, `k8s.yaml`), not the `gemma4` models named below. The model table below is the options analysis, not the deployed setting.

**Version:** 1.3  
**Last updated:** 2026-07-03 (Locked architecture decisions; execution plan with Sameer/Cursor work split)  
**Purpose:** Reference document for evaluator briefings, RFP mapping, and **implementation plan** for citizen-visible AI (semantic search, recommendations, SLA prediction).  
**Owner:** Sameer Khanna (solo build — no separate AI team)  
**Related docs:** `DG20_Demo_ProjectPlan.md`, `DG20_Demo_FunctionalityList.md`, `PROJECT_PLAN.md`

---

## Executive Summary

DG 2.0 delivers **Responsible AI for welfare administration** — automated, explainable, auditable decision intelligence at population scale. The demo uses **rule-based inference, event-driven automation, and analytics** rather than black-box ML models. Citizen and officer portals are **React/JavaScript** frontends; core intelligence runs in **Java/Spring Boot** microservices on **PostgreSQL** and **Apache Kafka**, with **Apache Superset (Python)** for executive analytics.

**Key framing for stakeholders:**

> Intelligence lives in the engine layer (eligibility, fraud, events, simulation). Portals surface data and orchestrate workflows. **New citizen-visible AI** (search, recommendations, SLA prediction) runs in a dedicated `ai-intelligence-service` with real embeddings, a trained ranker/SLA model, and **Gemma 4 via Ollama** for language understanding — not client-side heuristics.

---

## 0. Implementation Decision Summary (2026-07-03)

### What we discussed

A prototype plan proposed **100% client-side JavaScript** for AI-1 (Levenshtein search), AI-2 (filter `IDENTIFIED` rows), and AI-4 (two-variable SLA formula), framed as “Edge Intelligence.” **That approach was rejected** — it is not NLP, not a recommendation model, and not predictive ML. Sophisticated evaluators can distinguish heuristics from inference.

### Agreed scope (Priority 1 — proper AI)

| ID | Feature | Real AI approach | Status |
|----|---------|------------------|--------|
| **AI-1** | Intelligent service search | Semantic embeddings + pgvector + Gemma 4 rerank | ⬜ To implement |
| **AI-2** | Personalised recommendations | Eligibility engine (rules) + LightGBM ranker + live trending SQL + Gemma 4 explanations | ⬜ To implement |
| **AI-4** | Predictive SLA breach | LightGBM classifier on synthetic + seed workflow history | ⬜ To implement |

**Deferred (Priority 2):** AI-3 document quality check, AI-5 feedback/sentiment — unchanged from §9.

### Infrastructure confirmed on dev laptop (2026-07-03)

| Resource | Finding |
|----------|---------|
| **“Gamma 4”** | User intent = **Gemma 4** (Google), installed via **Ollama** — not a separate “Gamma 4” binary |
| **Ollama models** | `gemma4:e4b` (8B, ~9.6 GB) and `gemma4:26b` (26B, ~17 GB) — use **e4b** for demo latency |
| **Ollama API** | `http://localhost:11434` — OpenAI-compatible `/v1/chat/completions` |
| **Ollama embeddings** | Gemma 4 does **not** expose embeddings via Ollama on this install — use **sentence-transformers** in Python for vectors |
| **K3s / Rancher** | Running; namespace `egov`; Postgres pod `postgres:16` |
| **pgvector** | Not installed yet — **approved to add** to `citizen_db` |
| **Workflow history** | None sufficient for SLA training — **approved to generate synthetic training data** |
| **Team** | Solo — Sameer Khanna + Cursor implementation |

### Production vs demo LLM path

| Environment | LLM |
|-------------|-----|
| **Demo (MacBook)** | Gemma 4 via Ollama (`gemma4:e4b`) |
| **Production (GSDC)** | Sarvam sovereign LLM / vLLM on GPU — same `ai-intelligence-service` API, swap `LLM_PROVIDER` config |

---

## 1. AI Capabilities — What Is Available Today

### 1.1 AI Tech Stack Summary

| Layer | Technologies | AI paradigm |
|-------|--------------|-------------|
| Decision intelligence | Java 17, Spring Boot 3.3, PostgreSQL | Configurable rule inference at scale |
| Event automation | Apache Kafka, Spring Kafka | Life-event triggers, real-time beneficiary updates |
| Conversational layer | `chatbot-service` (Spring Boot) | Bilingual state machine + keyword intent detection |
| Explainability / governance | `eligibility_reason`, audit fields, override workflow | Explainable AI (XAI), human-in-the-loop |
| Officer narratives | `fraudAI.js`, assisted note templates | Template-based “AI-assisted” text generation |
| Analytics / BI | Apache Superset 3.1.3, Python, SQL views | Descriptive & prescriptive analytics |
| Frontends | React + Vite, i18next | Display + orchestration (no models in browser) |

**Not in current demo build:** OpenAI/GPT, Sarvam LLM, TensorFlow/PyTorch, vector DB (pgvector), live Bhashini NMT, document OCR.

---

### 1.2 Built AI Components (Live & Tested)

| # | Component | RFP alignment | Type | Where visible | Implementation |
|---|-----------|---------------|------|---------------|----------------|
| 1 | **Proactive Scheme Eligibility Engine** | §3.2.19, §3.2.20 | Rule inference at scale | Officer — Scheme Management; Citizen — Home | `scheme-engine-service` — age, income, caste, employment, education, marital status rules over ~950K persons |
| 2 | **Explainable AI — Eligibility Reason Chips** | §3.2.20 XAI | Explainable AI | Officer — Beneficiary cards | Pipe-delimited `eligibility_reason` → green ✓ chips |
| 3 | **“Why You Qualify” — Citizen XAI (Gujarati)** | §3.2.20 XAI | Citizen-facing explainability | Citizen — Home scheme cards | `reasonUtils.js` — localized criterion display |
| 4 | **Decision Override + Audit Log** | §3.2.20 Governance | Human-in-the-loop AI | Officer — Beneficiary override modal | Mandatory reason (≥10 chars); full decision lineage |
| 5 | **Fairness Distribution Panel** | §3.2.20 Equity | Algorithmic fairness monitoring | Officer — Scheme Coverage | Beneficiary mix vs Gujarat caste/district benchmarks |
| 6 | **Fraud Intelligence Engine** | §3.2.20, §8.6 | Anomaly detection (rule-based) | Officer — Fraud Signals | 4 live signals: MULTI_SCHEME_OVERLAP, INCOME_CLIFF, AGE_ANOMALY, FAMILY_INCOME_MISMATCH |
| 7 | **Scheme Forecasting Simulator** | §8.6 Predictive | Predictive analytics | Officer — Scheme Simulator | Re-runs eligibility engine with hypothetical scheme parameters |
| 8 | **Kafka Event-Driven Auto-Removal** | §3.2.19 | Event-driven automation | Officer — Beneficiary Dashboard | `MEMBER_DELETED` → REMOVED + family re-evaluation (<5s) |
| 9 | **Life-Event Triggered Identification** | §3.2.19 | Proactive AI | Citizen notifications; Beneficiary Dashboard | Midnight cron + `POST /v1/admin/trigger-birthday-check` |
| 10 | **Assisted Note Generation** | §8.2.2.16 | AI-assisted workflow | Officer — Task Queue | Template assembly from application + SLA + eligibility data |
| 11 | **Bilingual Chatbot** | §8.2.2.10–14 | Conversational assistance | Citizen portal widget | `chatbot-service` — 4+ intents, bilingual keywords; **Bhashini deferred** |
| 12 | **Superset Executive Dashboards** | §8.6, §3.2.20 | Analytics & BI | Officer — Reports tab | Gujarat Welfare Pulse + Scheme Performance (embedded SDK + guest tokens) |
| 13 | **CAF Duplicate Detection** | Governance | Automated deduplication | Citizen — CAF wizard | Aadhaar duplicate check at intake (`cafDuplicateCheck.js`) |

---

### 1.3 AI Components by User Portal

**Citizen portal (React)**

- Chatbot widget → `chatbot-service`
- “Why you qualify” scheme cards → `scheme-engine-service` + `reasonUtils.js`
- Proactive eligibility notifications → Kafka + notifications-service
- CAF duplicate prevention → cross-service application lookup

**Officer portal (React)**

- Eligibility reason chips, override/audit → scheme-engine API
- Fairness panel, geographic insights → Scheme Coverage (computed client-side + API data)
- Fraud signals + AI brief narratives → scheme-engine rules + `fraudAI.js` templates
- Scheme simulator → scheme-engine `/simulate`
- Assisted notes → Task Queue template builder
- Reports → Superset embedded dashboards

---

### 1.4 Production Roadmap (Not Yet in Demo)

| Capability | Planned technology | RFP section | Demo status |
|------------|-------------------|-------------|-------------|
| Document OCR / field extraction | Sarvam Vision API | §8.2.2.9 | ⬜ Not built |
| Semantic service search | Fuse.js (demo) → IndicBERT + pgvector (prod) | §8.2.3.1 | ⬜ Not built |
| Grievance auto-classification | Keyword classifier in grievance-service | §3.2.7 | ⬜ Not built |
| NLP chatbot | Gamma 4 (see Section 3) | §8.2.2.10–14 | ⬜ Planned |
| Live Gujarati NMT | Bhashini API | §8.2.2.14 | ⬜ Deferred (DIBD key) |
| Sovereign LLM | Sarvam at GSDC | Architecture reference | ⬜ Production only |

---

### 1.5 How to Describe “AI” to Evaluators

Use a **three-layer model**:

1. **Decision intelligence (live)** — Rule engine, life events, fraud rules, simulator  
2. **Responsible AI (live)** — XAI, override/audit, fairness monitoring  
3. **Cognitive AI (roadmap)** — Gamma 4 NLP, Sarvam Vision OCR, Bhashini NMT, sovereign LLM at GSDC  

**Recommended one-liner:**

> *“Our AI stack is auditable rules-first automation at population scale — the same paradigm as PM-KISAN and DBT beneficiary identification — extended with explainability, governance, and event-driven proactive delivery.”*

---

## 2. DIGIT Services vs Non-DIGIT Components

### 2.1 DIGIT Core Platform (Deployed on K3s)

These six DIGIT services run in namespace `egov` as platform infrastructure:

| DIGIT service | Image | Role |
|---------------|-------|------|
| **egov-mdms-service** | `egovio/cs-egov-mdms-service:dev` | Master data — tenant `pg` |
| **egov-persister** | `egovio/cs-egov-persister:dev` | Kafka consumer → Postgres persistence |
| **egov-indexer** | `egovio/cs-egov-indexer:dev` | Search/indexing pipeline |
| **egov-user** | `egovio/cs-egov-user:dev` | DIGIT citizen user records |
| **egov-workflow-v2** | `egovio/cs-egov-workflow-v2:dev` | DIGIT workflow engine (`DGT-` tasks) |
| **egov-enc-service** | `egovio/cs-egov-enc-service:dev` | PII encryption/decryption |

**Source:** `Digit-Core/` (arm64 native builds).  
**Database:** DIGIT tables in `public` schema (`EG_WF_*`, `EG_USER`, etc.).

---

### 2.2 Where DIGIT Is Actively Integrated

| Integration point | DIGIT service used | Details |
|-------------------|-------------------|---------|
| **marriage-certificate-service** | `egov-workflow-v2` | `MARRIAGE_CERT` business service; APPLY/APPROVE transitions; `DGT-` application prefix |
| **Officer Task Queue** | `egov-workflow-v2` (via marriage service) | Routes approve actions by engine prefix (`DGT-` vs `FLW-`) |
| **Platform PII handling** | `egov-enc-service` | Encryption chain for citizen PII in DIGIT workflow paths |
| **DIGIT data pipeline** | `egov-persister`, `egov-indexer`, `egov-mdms` | Background platform services supporting DIGIT module pattern |

**Marriage service workflow URL:**

```
http://egov-workflow-v2.citizen.svc.cluster.local:8080/egov-workflow-v2
```

---

### 2.3 Two-Engine Architecture

| Prefix | Workflow engine | Services |
|--------|-----------------|----------|
| `FLW-` | **Flowable** (embedded in custom Spring Boot services) | caste-certificate, pension, family-member, scheme-application |
| `DGT-` | **DIGIT egov-workflow-v2** | marriage-certificate |

**Presenter line:** *“Two workflow engines — Flowable for citizen certificate services, DIGIT’s own engine for marriage registration. One task queue, one approval UX.”*

---

### 2.4 Non-DIGIT / Custom-Built Components

| Category | Component | Technology | Notes |
|----------|-----------|------------|-------|
| **Workflow (non-DIGIT)** | caste-certificate-service | Flowable + Spring Boot | `FLW-` prefix |
| | pension-service | Flowable + Spring Boot | |
| | family-member-service | Flowable + Spring Boot | |
| | scheme-application-service | Flowable + Spring Boot | |
| **Scheme intelligence** | scheme-engine-service | Spring Boot + Kafka + JPA | Eligibility, fraud, simulator, birthday trigger |
| **Registry** | family-registry-service | Spring Boot + JPA | 221K+ families, Kafka event publisher |
| **Citizen auth** | auth-service | Spring Boot + JWT | OTP login — **not** egov-user UI flow |
| **Officer IAM** | Keycloak 24 | H2 in-memory | **not** DIGIT user management |
| **Grievance** | grievance-service | Spring Boot + JPA | |
| **Notifications** | notifications-service | Spring Boot + JPA | |
| **Chatbot** | chatbot-service | Spring Boot state machine | |
| **Portals** | citizen-portal, officer-portal, family-portal | React + Vite + Nginx | Custom UX — not DIGIT UI modules |
| **Analytics** | Apache Superset | Python/Flask | Separate from DIGIT |
| **Infrastructure** | PostgreSQL 16, Kafka (KRaft), Redis/Valkey | — | Shared by DIGIT and custom services |

---

### 2.5 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Citizen / Officer / Family Portals (React — NON-DIGIT UX)      │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST (cluster DNS)
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐   ┌─────────────────┐   ┌──────────────────┐
│ Custom Spring │   │ scheme-engine   │   │ chatbot-service  │
│ Boot services │   │ (AI / rules)    │   │ (conversational) │
│ FLW- Flowable │   │ Kafka consumer  │   └──────────────────┘
└───────┬───────┘   └────────┬────────┘
        │                    │
        │            ┌───────▼───────┐
        │            │ Apache Kafka  │
        │            └───────▲───────┘
        │                    │
┌───────▼────────────────────┴──────────────────────────────────┐
│ marriage-certificate-service  ──►  egov-workflow-v2  (DIGIT)  │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ DIGIT Core: mdms · persister · indexer · user · enc-service   │
└───────────────────────────────┬───────────────────────────────┘
                                ▼
                         PostgreSQL 16
                                ▲
                         Superset (Python) — analytics layer
```

---

## 3. Plan — NLP Chatbot Using Gemma 4 (Ollama)

> **Note:** “Gamma 4” in earlier docs = **Gemma 4** via **Ollama** on the dev laptop (`gemma4:e4b`, `gemma4:26b`). Production target remains Sarvam sovereign LLM at GSDC.

### 3.1 Current State

| Aspect | Today |
|--------|-------|
| Service | `chatbot-service` (Spring Boot 3.3, Java 17) |
| Intent detection | `IntentDetector.java` — bilingual **keyword matching** |
| Dialogue | `Msgs.java` — static EN/GU message templates |
| Intents | APPLY_CASTE, APPLY_PENSION, CHECK_STATUS, ELIGIBILITY, APPLY_MENU, DISCOVER |
| Backend calls | caste-cert, pension, family-registry, scheme-engine |
| Translation | Static bilingual strings; **Bhashini NMT not live** |

**Gap:** Cannot handle paraphrase, typos, or free-form Gujarati/English questions beyond keyword lists.

---

### 3.2 Gemma 4 via Ollama (confirmed on dev laptop)

| Item | Value |
|------|-------|
| Runtime | **Ollama** — `http://localhost:11434` |
| Models installed | `gemma4:e4b` (8B, demo default), `gemma4:26b` (26B, slower) |
| API | OpenAI-compatible `POST /v1/chat/completions` |
| Embeddings | **Not** via Ollama for Gemma 4 — use sentence-transformers in `ai-intelligence-service` |
| K8s access | `host.docker.internal:11434` from pods on Rancher Desktop |

---

### 3.3 Recommended Architecture — Hybrid NLP + Rules

Do **not** replace the entire chatbot with a free-form LLM. Use **Gemma 4 for understanding; existing services for transactions and eligibility.**

```
Citizen message (GU / EN / mixed)
        │
        ▼
┌───────────────────┐
│  Gemma 4 (Ollama) │  ← intent classification, entity extraction, rerank, explain
│  (understanding)  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Intent Router    │
└─────────┬─────────┘
          │
    ┌─────┴─────┬─────────────────┐
    ▼           ▼                 ▼
Transactional  Informational    Fallback
(state machine) (RAG + tools)    (clarify / handoff)
    │           │
    ▼           ▼
Existing      Gamma 4 + DB/API
chatbot       tool calls
flows         (schemes, status, services)
```

**Rules for welfare safety:**

- **Eligibility answers** must come from `scheme-engine-service` rules — never LLM-invented  
- **Apply / submit / status** actions go through existing state machine + APIs  
- **LLM role:** understand messy input, summarize, explain, route — not decide benefits  
- Log all Gamma 4 prompts/responses with session ID for audit  

---

### 3.4 Implementation Phases

#### Phase A — Gamma 4 Intent Layer (2–3 days)

**Goal:** Replace keyword `IntentDetector` with Gamma 4 classification.

| Task | Details |
|------|---------|
| Add `Gamma4Client.java` | WebClient wrapper; configurable base URL + API key |
| Intent prompt | System prompt listing intents + few-shot GU/EN examples |
| Output schema | JSON: `{ "intent", "confidence", "entities", "language" }` |
| Fallback | If confidence < 0.7 or timeout → existing keyword detector |
| ConfigMap intents | Same enum as today: APPLY_CASTE, CHECK_STATUS, ELIGIBILITY, etc. |

**Files to modify:**

- `chatbot-service/src/main/java/org/citizen/chatbot/IntentDetector.java` (or new `NlpIntentService.java`)
- `chatbot-service/src/main/java/org/citizen/chatbot/service/ChatbotService.java`
- `chatbot-service/src/main/resources/application.properties` — Gamma 4 config

---

#### Phase B — RAG for Open Questions (2–3 days)

**Goal:** Answer “Which schemes can my family get?” / “How do I apply for pension?” without rigid keywords.

| Task | Details |
|------|---------|
| Build knowledge corpus | JSON/Markdown: service catalog, scheme descriptions, GU synonyms, FAQ |
| Embedding (optional) | If Gamma 4 supports RAG natively, use that; else simple keyword + corpus chunk retrieval |
| Tool functions | `getFamilySchemes(aadhaarRef)`, `getApplicationStatus(ref)`, `listServices()` |
| Response template | “Based on platform data: …” + link to portal route |

**Corpus sources:**

- Citizen portal service tiles and `locales/gu.json` / `en.json`  
- Scheme definitions from `scheme_engine.scheme`  
- Project plan demo talking points (controlled FAQ)

---

#### Phase C — Officer-Side NL Query (optional, 1–2 days)

**Goal:** Natural language queries on analytics (“Which districts have lowest OBC penetration?”).

| Task | Details |
|------|---------|
| NL → SQL guardrail | Gamma 4 generates SQL against allowlisted `analytics.*` views only |
| Or: NL → insight ID | Map to pre-built insight queries (safer for demo) |
| UI | Optional chat panel on officer Reports page |

---

### 3.5 Requirements Checklist

#### Infrastructure

| Requirement | Notes |
|-------------|-------|
| Gamma 4 API reachable from K8s | Network policy / DNS from `chatbot-service` pod |
| API credentials | K8s Secret — never in source code |
| Timeout + circuit breaker | Default 3s; fallback to keyword intent |
| Logging | Prompt/response audit log (redact Aadhaar) |

#### Application

| Requirement | Notes |
|-------------|-------|
| `chatbot-service` rebuild + redeploy | Existing K8s manifest on port 31188 |
| Citizen portal | No change if API contract unchanged |
| Config | `GAMMA4_BASE_URL`, `GAMMA4_API_KEY`, `GAMMA4_MODEL`, `NLP_ENABLED=true` |

#### Data & Security

| Requirement | Notes |
|-------------|-------|
| PII minimization | Send Aadhaar ref (masked) not raw Aadhaar to Gamma 4 |
| No PII in prompts for general FAQ | RAG corpus contains no citizen data |
| Consent alignment | Chatbot session tied to logged-in citizen where applicable |

#### Testing

| Test case | Expected |
|-----------|----------|
| Gujarati paraphrase: “મારા પરિવારને કઈ યોજના મળે?” | ELIGIBILITY intent → scheme-engine data |
| Typo: “cast certifcate status” | CHECK_STATUS or APPLY_CASTE |
| Transaction: complete caste apply flow | State machine unchanged; Gamma 4 only routes |
| Gamma 4 down | Keyword fallback; banner “Advanced NLP unavailable” |
| Adversarial: “Approve my pension” | Must not execute officer actions |

---

### 3.6 Effort Estimate

| Phase | Effort | Demo impact |
|-------|--------|---------------|
| A — Intent layer | 2–3 days | High — natural Gujarati/English input |
| B — RAG open questions | 2–3 days | High — scheme discovery without keywords |
| C — Officer NL insights | 1–2 days | Medium — analytics story |
| **Total** | **~1–1.5 weeks** | |

---

### 3.7 What Not to Do

- Do not let Gamma 4 directly approve applications or change beneficiary status  
- Do not send full citizen PII to external APIs without GSDC policy sign-off  
- Do not remove the existing state machine — LLM hallucination risk is unacceptable for welfare  
- Do not claim “full LLM chatbot” if only Phase A is done — label as “NLP-enhanced hybrid chatbot”  

---

## 4. Intelligent Computation vs Data Display — Insights Plan

### 4.1 The Honest Assessment

**Most portal screens are data presentation** — list, filter, sort, and display records from PostgreSQL via REST APIs. That is by design: intelligence is centralized in backend engines, not duplicated in every UI screen.

**Screens that are primarily DB pull + display:**

- Task queue (list tasks; approve/reject calls workflow APIs)  
- Grievance list and detail  
- My Applications / certificates (citizen)  
- Family registry browse  
- Beneficiary table (displays engine output)  
- Notifications list  
- Payments & Benefits history  

**Capabilities that are genuinely computed (not simple CRUD):**

| Capability | Computation location | What it does |
|------------|---------------------|--------------|
| Proactive eligibility | `scheme-engine-service` | Rule evaluation over full population |
| Fraud signals | `scheme-engine-service` | Live anomaly rules on beneficiary + person data |
| Scheme simulator | `scheme-engine-service` | Hypothetical re-run of eligibility rules |
| Kafka auto-removal | scheme-engine + family-registry | Event → status change + re-evaluation |
| Birthday identification | scheme-engine `@Scheduled` | Age milestone → new IDENTIFIED records |
| Fairness panel | Officer Scheme Coverage | Compares beneficiary mix vs benchmarks |
| Geographic insights | Officer Scheme Coverage | Concentration, zero-district, caste gap analysis |
| Chatbot orchestration | `chatbot-service` | Multi-turn flows + live API calls |
| Assisted notes | Task Queue | Assembles note from multiple live fields |
| Fraud AI briefs | `fraudAI.js` | Template narrative from signal metadata |
| Superset dashboards | SQL analytics views | Aggregations, KPIs, funnel metrics |

---

### 4.2 Insights Already Available (Built)

**Superset dashboards (officer Reports tab):**

- Gujarat Welfare Pulse — platform KPIs, beneficiary counts, geographic coverage  
- Scheme Performance Intelligence — penetration, funnels, demographics  

**SQL analytics views (`superset/seed_analytics_views.sql`, `superset_dashboard_views.sql`):**

| View | Insight |
|------|---------|
| `analytics.beneficiary_by_status` | Pipeline funnel (IDENTIFIED → ACTIVE) |
| `analytics.beneficiary_by_district` | Geographic distribution |
| `analytics.scheme_enrollment` | Enrollment by scheme and department |
| `analytics.beneficiary_caste_gender` | Demographic breakdown |
| `analytics.auto_removals` | Event-driven removals (deceased, etc.) |
| `analytics.grievance_summary` | Grievance volume by status/category |
| `analytics.fraud_signal_summary` | Counts by fraud signal type |
| `analytics.platform_kpis` | Executive KPI rollup |
| `analytics.processing_kpi` | Processing time metrics |

**Officer UI computed insights (Scheme Coverage):**

- Geographic concentration risk (top-3 district share)  
- Zero-enrollment districts  
- Caste underrepresentation vs Gujarat benchmarks  
- Low-penetration major districts  

---

### 4.3 Insights That Can Be Generated (Recommended Next)

These require **SQL + rules + presentation** — no ML needed. High value for addressing “just DB pull” perception.

#### Executive insight cards (officer Home or Reports)

| # | Insight | SQL / logic source | Action suggested |
|---|---------|-------------------|------------------|
| 1 | Beneficiaries stuck in IDENTIFIED > 30 days | `beneficiary` + timestamps | Trigger confirmation drive |
| 2 | Districts with zero enrollment for scheme X | Geographic breakdown | Targeted identification |
| 3 | OBC/SC/ST representation gap vs benchmark | Fairness logic (existing) | Policy review |
| 4 | Unresolved HIGH fraud signals > 7 days | Fraud signals + dates | Officer escalation |
| 5 | Multi-scheme overlap leakage estimate | Overlap count × avg benefit | Audit priority list |
| 6 | Confirmation funnel drop-off rate | IDENTIFIED vs CONFIRMED counts | Process improvement |
| 7 | Override rate by officer/district | Audit log aggregation | Governance review |
| 8 | SLA tasks breaching in next 24 hours | Task created_at + SLA rules | Workload alert |
| 9 | Simulator snapshot: “If ceiling = ₹1.8L → +N beneficiaries” | Latest simulation run | Policy brief |
| 10 | Flowable vs DIGIT avg processing time | FLW- vs DGT- completion times | Architecture comparison |

#### Citizen-facing insights (optional)

| Insight | Source |
|---------|--------|
| “You qualify for N schemes — tap to see why” | scheme-engine (existing) |
| “Your application may breach SLA in X days” | Workflow task dates |
| “Family member turning 18 — new schemes available” | Birthday trigger (existing) |

---

### 4.4 Insights Requiring Gamma 4 or External AI

| Insight | Approach |
|---------|----------|
| Natural language analytics queries | Gamma 4 + allowlisted SQL or pre-built insight map |
| Grievance summarization + classification | Gamma 4 or keyword classifier + extractive summary |
| Document field extraction insights | Sarvam Vision OCR (separate from Gamma 4) |
| Semantic service search | Fuse.js (demo) or IndicBERT + pgvector (production) |

---

### 4.5 Packaging Recommendation

Instead of adding more data tables, add an **“Insights” panel** with 5–8 auto-generated cards refreshed on load:

```
┌─────────────────────────────────────────────────────────┐
│  🔴 3 districts have zero Old Age Pension enrollment    │
│  ⚠️  847 beneficiaries unconfirmed for > 30 days        │
│  🔍 12 HIGH fraud signals unresolved                    │
│  📊 OBC share 21pp below benchmark on Scheme X          │
│  💡 Simulator: ₹1.8L ceiling → +4,200 beneficiaries    │
└─────────────────────────────────────────────────────────┘
```

Implementation: new endpoint `GET /v1/admin/insights` in scheme-engine-service returning pre-computed insight objects `{ type, title, body, action, severity }`.

**Estimated effort:** 1–2 days for insight endpoint + officer UI cards.

---

---

## 8. Honest AI Gap Assessment (RFP §3.2.20 / §3.2.21)

### 8.1 What is built vs what evaluators see

**Built as AI (real or appropriately framed):**

Rules-based eligibility engine with explainability chips, fraud detection (4 signal types), scheme forecasting simulator, assisted note generation, Kafka event-driven auto-removal, birthday-triggered eligibility, bilingual chatbot with static responses, proactive notifications with context hints, fairness distribution panel, Superset executive dashboards.

This is substantial — but almost all of it is **officer-side and backend intelligence.** Citizens experience little of it directly as “AI.”

**The real problem:** AI works in the platform but does not *feel* like AI during a demo. Evaluators see data tables and workflows; the intelligence layer is underexposed on the citizen portal.

### 8.2 RFP AI requirements — coverage status

| RFP requirement (§3.2.20 / §3.2.21) | Status today | Visibility in demo |
|--------------------------------------|--------------|-------------------|
| Proactive eligibility + XAI | ✅ Built | Medium (officer + scheme cards) |
| Fraud detection | ✅ Built | Officer only |
| Predictive simulator | ✅ Built | Officer only |
| Process automation (Kafka events) | ✅ Built | Officer / narrative |
| **Intelligent / NLP service search** | ❌ Missing | Citizen home has no search |
| **Document intelligence (OCR)** | ❌ Dropped | Correct for demo scope |
| **Document quality assessment** | ❌ Missing | Upload has no validation UX |
| **Recommendation engine** | ⚠️ Partial | Data exists; home not personalised |
| **Predictive SLA breach** | ⚠️ Partial | Reactive SLA badges only (Phase 12) |
| **Sentiment analysis / feedback** | ❌ Missing | No feedback mechanism |
| **Grievance intent classification** | ❌ Missing | Free-text → undifferentiated queue |
| Voice search | ❌ Deferred | Phase 2 |
| Auto-approval low-risk | ❌ Deferred | Governance risk for demo |

### 8.3 Architectural framing for evaluators

| Tier | Where it runs | Demo (MacBook) | Production (GSDC) |
|------|---------------|----------------|-------------------|
| **Application AI** | `ai-intelligence-service` on K8s | Embeddings, ranker, SLA model, Gemma 4 via Ollama | Same service; GPU node optional |
| **Decision AI** | Java `scheme-engine-service` | Eligibility, fraud rules (unchanged) | Same |
| **Platform AI** | Data centre | Gemma 4 local substitute | Sarvam 30B, IndicOCR, Bhashini |

**Presenter line:** *“Citizen search and recommendations use semantic retrieval and a trained ranker. SLA risk uses a supervised model on workflow history. Eligibility decisions stay in the auditable rules engine. Language understanding runs on Gemma 4 locally; production swaps to sovereign Sarvam at GSDC.”*

---

## 9. AI Components — Scope & Status

**Priority 1 (proper AI — in scope):** AI-1, AI-2, AI-4 — see **§11** for full implementation plan.  
**Priority 2 (deferred):** AI-3, AI-5 — see subsections below.

**Rejected approach:** Client-only Levenshtein / lookup-table / weighted-formula prototypes labeled as “Edge Intelligence.” Portals display model outputs; **inference runs in `ai-intelligence-service`.**

---

### AI-1 — Semantic Service Search (Citizen Portal) — Priority 1 ⬜

**RFP:** §3.2.20 — NLP search, semantic search, spelling tolerance, personalised results  
**Status:** ⬜ To implement

**Tech stack:**

| Component | Technology |
|-----------|------------|
| Embedding model | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (EN + GU, CPU-friendly) |
| Vector store | PostgreSQL **pgvector** — schema `ai`, table `service_embeddings` |
| Search API | `ai-intelligence-service` — `POST /v1/search/services` |
| Personalisation | Profile features passed to reranker; Gemma 4 rerank + explanation |
| LLM (language) | **Gemma 4 `gemma4:e4b`** via Ollama at `host.docker.internal:11434` from K8s |
| Frontend | `citizen-portal` — search bar, results with similarity score + “why matched” |

**Pipeline:**

```
Query (EN/GU) → embed (sentence-transformers) → pgvector top-10 cosine
  → Gemma 4 rerank(candidates + citizen profile) → ranked results + NL explanation
```

**Index content:** ~20 services — name, description, GU labels, synonyms, route, eligibility hints (from `serviceCatalog` + locales).

**Demo proof:** Gujarati query with no keyword overlap still returns correct service; admin shows embedding score.

---

### AI-2 — Eligibility-Constrained Recommendation Engine (Citizen Home) — Priority 1 ⬜

**RFP:** §3.2.20 — Personalised recommendations, eligibility-based suggestions, trending  
**Status:** ⬜ To implement

**Tech stack:**

| Component | Technology |
|-----------|------------|
| Eligibility truth | `scheme-engine-service` — **never LLM** — IDENTIFIED / CONFIRMED records |
| Ranker | **LightGBM** (`lgbm` Python) — learns order among eligible schemes |
| Features | match strength, days to deadline, member age fit, district uptake, apply-rate proxy |
| Trending | **Live SQL** on application tables by taluka (last 30 days) — not hardcoded |
| Explanations | Gemma 4 generates Gujarati/EN card subtitle from `eligibility_reason` JSON |
| API | `GET /v1/recommendations?familyId=` in `ai-intelligence-service` |
| Frontend | `citizen-portal/Home.jsx` — “Recommended for Your Family” + “Trending in [taluka]” |

**Training data (no live history yet):**

- Generate ~2,000 synthetic (family_profile, scheme, applied: 0/1) rows from seed families + scheme rules  
- Script: `ai-intelligence-service/scripts/generate_recommendation_training_data.py`  
- Document in `docs/AI_MODEL_CARDS.md` — dataset source, features, metrics  

**Demo proof:** Priya login → Shreya OBC scholarship ranked first with model score + eligibility reason; trending from real SQL.

---

### AI-4 — Predictive SLA Breach Model (Officer + Citizen) — Priority 1 ⬜

**RFP:** §3.2.20 process automation; §3.2.6.1.1 predictive completion  
**Status:** ⬜ To implement

**Tech stack:**

| Component | Technology |
|-----------|------------|
| Model | **LightGBM binary classifier** — P(breach within next N hours) |
| Features | elapsed/sla ratio, queue depth by role, service type, district, DOW, officer throughput proxy, clarification count |
| Training data | **Synthetic** — `scripts/generate_sla_training_data.py` — ~5,000 completed tasks with realistic delays |
| Serving | `POST /v1/sla/predict` and batch score on task queue load |
| Explainability | SHAP top-3 features per prediction (officer UI) |
| Officer UI | Task Queue **“At Risk”** tab — `P(breach) > 0.75` |
| Citizen UI | Application status — `estimated_completion_at` from model |
| Storage | `ai.sla_predictions` cache table optional |

**Not acceptable:** `0.6 × elapsed + 0.4 × queue_depth` labeled as ML.

**Demo proof:** Model card shows AUC on holdout set; officer sees “82% breach risk — high queue depth for Talati role.”

---

### AI-3 — Document Quality Check on Upload — Priority 2 (deferred)

**RFP:** §3.2.20 — Document intelligence: quality assessment (blur, completeness), DPI checks  
**Status:** ⬜ Deferred (Priority 2)

Client-side Canvas checks (blur, resolution, aspect ratio) — see earlier draft; not in P1 scope.

---

### AI-5 — Citizen Feedback with Sentiment Analysis — Priority 2 (deferred)
**Portal:** Citizen (post-certificate) + Officer (feedback dashboard)  
**Status:** ⬜ Planned

**Gap:** Zero feedback mechanism in platform. Full §3.2.21 page uncovered.

**Build:**

**Citizen trigger:** After certificate download (`MyCertificates.jsx`) — bottom sheet: “How was your experience?” 5-star + 200-char text + chips (Too slow · Easy process · etc.)

**On-device sentiment (keyword classifier before submit):**

- Positive: fast, easy, helpful, excellent, ઝડપી, સારું, સહેલું…
- Negative: slow, difficult, confusing, ધીમું, મુશ્કેલ…
- Label: Positive / Neutral / Negative — show “😊 Positive” in green on device

**Backend:** `feedback` table + `POST /v1/feedback` + `GET /v1/feedback/summary`

**Officer dashboard (Dept Admin):** Avg rating, positive %, negative %, ratings bar chart, NPS = % promoters (4–5) − % detractors (1–2). **Auto-escalation:** rating ≤ 2 → auto-create OPEN grievance with feedback text.

**Seed data:** 40–50 feedback records → NPS ~+42 (credible vs DARPG benchmarks 30–65).

**Demo moment:** Priya rates 5 stars, types “ખૂબ ઝડપી સેવા” → Positive. Admin sees NPS +42, 87% positive, 1 auto-escalated complaint.

| Effort | Backend | Frontend |
|--------|---------|----------|
| ~2 hours | New `feedback-service` or extend `grievance-service` | Citizen sheet + officer dashboard |
| ~4 hours | — | |

---

### 9.1 Summary table

| ID | Component | Real AI stack | Priority | Effort |
|----|-----------|---------------|----------|--------|
| AI-1 | Semantic service search | pgvector retrieval + Gemma rerank only | **P1** | ~5 days |
| AI-2 | Recommendations | scheme-engine + LightGBM ranker + Gemma explain (not rank) | **P1** | ~5 days |
| AI-4 | Predictive SLA | LightGBM + SHAP only (no Gemma) | **P1** | ~7 days |
| AI-3 | Document quality | Canvas heuristics (deferred) | P2 | ~4h |
| AI-5 | Feedback + sentiment | Keyword + backend (deferred) | P2 | ~6h |
| — | **ai-intelligence-service platform** | Python FastAPI + shared infra | **P1** | ~3 days |
| | **Total P1** | | | **~2–3 weeks** (solo) |

### 9.2 Build sequence (Priority 1 — proper AI)

```
Phase 0 (2–3 days) — Platform setup
  pgvector on Postgres · ai-intelligence-service scaffold · Ollama wiring · model cards doc

Phase 1 (4–5 days) — AI-1 Semantic Search
  Build index · search API · citizen home search UI · Gujarati test cases

Phase 2 (4–5 days) — AI-2 Recommendations
  Synthetic training data · LightGBM ranker · recommendations API · Home cards · trending SQL

Phase 3 (5–7 days) — AI-4 SLA Prediction
  Synthetic workflow history · train/evaluate LightGBM · predict API · At Risk tab · citizen ETA

Phase 4 (1 day) — Integration test + demo script updates
```

Parallel (optional): Upgrade `chatbot-service` to use Gemma 4 intent layer (§3).

---

## 11. Locked Architecture Decisions (2026-07-03)

These decisions are **final** for the P1 implementation. Do not use rejected alternatives.

### Decision 1 — pgvector installation

The existing `postgres:16` image has **no pgvector**.

| Option | Verdict |
|--------|---------|
| **A — Switch to `pgvector/pgvector:pg16` image** | ✅ **LOCKED** |
| B — `apt-get install` inside pod | ❌ Not persistent; dies on pod restart |

**Migration procedure (before Phase 1):**

```bash
# 1. Backup
kubectl exec -n citizen deploy/postgres -- pg_dump -U citizenuser citizen_db > egov_db_backup_$(date +%Y%m%d).sql

# 2. Update postgres Deployment image → pgvector/pgvector:pg16
# 3. Restore if fresh volume, or CREATE EXTENSION on existing data volume

psql -U citizenuser -d citizen_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -U citizenuser -d citizen_db -c "CREATE SCHEMA IF NOT EXISTS ai;"
```

One-time migration. Clean and supported.

---

### Decision 2 — sentence-transformers model in K8s

Model: `paraphrase-multilingual-MiniLM-L12-v2` (~470MB).

| Option | Verdict |
|--------|---------|
| **Bake into Docker image at build time** | ✅ **LOCKED** — ~900MB image, zero internet at demo |
| Download at pod startup | ❌ ~3 min cold start; fails offline |

```dockerfile
# Dockerfile excerpt
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"
```

---

### Decision 3 — LightGBM model training

Models **cannot** be trained inside K8s at runtime (no training pipeline in cluster).

| Step | Where |
|------|-------|
| 1. Write synthetic data scripts | `scripts/gen_rec_data.py`, `scripts/gen_sla_data.py` |
| 2. Train `.pkl` locally on Mac host | `scripts/train_ranker.py`, `scripts/train_sla.py` |
| 3. `COPY models_trained/*.pkl` into Docker image | Build time |
| 4. FastAPI loads from disk at startup | `app/models/ranker.py`, `app/models/sla_model.py` |

**Training data targets:**

| Model | Rows | Label |
|-------|------|-------|
| Recommendation ranker | ~2,000 | citizen profile × scheme features → relevance score |
| SLA classifier | ~5,000 | service, elapsed, queue depth, … → `breached_within_24h` |

✅ **LOCKED:** Train locally → bundle in image. Sameer designs feature schema + generation logic; Cursor implements scripts.

---

### Decision 4 — Ollama connectivity from K8s

Ollama runs on Mac at `localhost:11434`. Inside K3s pods, `localhost` = the pod, **not** the Mac.

| Address | Verdict |
|---------|---------|
| **`host.docker.internal:11434`** | ✅ **LOCKED** (Rancher Desktop resolves to host) |
| `localhost:11434` from pod | ❌ Wrong |

**Phase 0 gate — must pass before prompt pipeline:**

```bash
kubectl exec -it -n citizen deploy/citizen-portal -- wget -qO- http://host.docker.internal:11434/api/tags
# or curl from a debug pod
```

---

### Decision 5 — Gemma 4 usage per feature (surgical)

Do **not** use Gemma for everything. LLM calls add 2–5s latency.

| Feature | Gemma 4 role | Cheaper path handles |
|---------|--------------|----------------------|
| **AI-1 Search** | **Reranker only** — top-5 pgvector candidates → ranked list + 1-line `why_matched` | pgvector cosine similarity does retrieval |
| **AI-2 Recommendations** | **Explanation only** — 1 sentence per card from structured eligibility fields | LightGBM ranker decides ordering |
| **AI-4 SLA** | **Not used** | LightGBM + SHAP (deterministic, instant) |

✅ **LOCKED:** Gemma called only for AI-1 rerank and AI-2 explanation text. AI-4 is fully LightGBM + SHAP.

---

### Execution architecture

```
citizen-portal (React) ──┐
                          ├──► ai-intelligence-service (FastAPI :31189)
officer-portal (React) ──┘         │
                                   ├── sentence-transformers (bundled in image)
                                   ├── pgvector queries → postgres :5432
                                   ├── LightGBM .pkl (bundled in image)
                                   ├── SHAP (bundled)
                                   └── Ollama → host.docker.internal:11434
                                              (Gemma 4 gemma4:e4b — AI-1 rerank, AI-2 explain only)
```

---

### Service directory layout (locked)

**Path:** `DG2.0/ai-intelligence-service/`

```
ai-intelligence-service/
├── app/
│   ├── main.py
│   ├── routers/
│   │   ├── search.py       # AI-1
│   │   ├── recommend.py    # AI-2
│   │   └── sla.py          # AI-4
│   ├── models/
│   │   ├── embedder.py     # sentence-transformers singleton
│   │   ├── ranker.py       # LightGBM recommendation model
│   │   └── sla_model.py    # LightGBM SLA model
│   ├── db.py               # asyncpg + pgvector
│   └── llm.py              # Ollama client (Gemma 4)
├── scripts/
│   ├── embed_services.py   # one-time: embed ~24 services → pgvector
│   ├── gen_rec_data.py     # ~2k recommendation training rows
│   ├── gen_sla_data.py     # ~5k SLA training rows
│   ├── train_ranker.py     # → models_trained/recommend_model.pkl
│   └── train_sla.py        # → models_trained/sla_model.pkl
├── models_trained/
│   ├── recommend_model.pkl
│   └── sla_model.pkl
├── data/
│   └── service_catalog.json
├── Dockerfile
├── k8s.yaml
└── requirements.txt
```

---

### Phase work split — Sameer (brain) vs Cursor (hands)

| Phase | Duration | Sameer delivers first | Then Cursor implements |
|-------|----------|----------------------|------------------------|
| **0** | 2–3 days | pgvector migration steps, DB schema, FastAPI skeleton spec, Ollama test command | Scaffold service, run migration, verify Ollama, NodePort, Dockerfile with bundled models |
| **1** | 4–5 days | Service catalogue JSON, embedding schema, search API contract, Gemma rerank prompt | `embed_services.py`, search router, citizen portal search UI |
| **2** | 4–5 days | Recommendation feature schema, LightGBM features, training data spec, Gemma explanation prompt | `gen_rec_data`, train ranker, recommend endpoint, Home recommendation cards |
| **3** | 5–7 days | SLA feature schema, synthetic task distribution, SHAP output contract, citizen ETA logic | `gen_sla_data`, train SLA model, sla endpoint, Task Queue At Risk tab + citizen status |
| **4** | 1 day | Demo script verification checklist | Integration fixes, model cards, project plan updates |

---

## 12. Implementation Plan — `ai-intelligence-service`

### 12.1 New service overview

**Location:** `/Users/sameerkhanna/Documents/Projects/Citizen-Services/ai-intelligence-service/`  
**Runtime:** Python 3.11 + FastAPI  
**Deploy:** Docker `arm64-local` → K8s Deployment in namespace `egov`  
**NodePort:** `31189`

See **§11** for locked directory layout and decisions.

### 12.2 Shared tech stack (all three features)

| Layer | Technology | Notes |
|-------|------------|-------|
| API framework | **FastAPI** + uvicorn | REST; OpenAPI docs at `/docs` |
| Embeddings | **sentence-transformers** `paraphrase-multilingual-MiniLM-L12-v2` | **Baked in Docker image** (Decision 2) |
| Vector DB | **pgvector/pgvector:pg16** Postgres | Schema `ai`; cosine distance (Decision 1) |
| ML models | **LightGBM** `.pkl` | **Trained locally, bundled in image** (Decision 3) |
| LLM | **Gemma 4 `gemma4:e4b`** via Ollama | `host.docker.internal:11434` — **AI-1 rerank + AI-2 explain only** (Decision 5) |
| Explainability | **SHAP** (SLA model only) | AI-4 — no Gemma |
| Orchestration | **K3s** (Rancher Desktop) | Same cluster as existing services |
| Portal integration | React `fetch` via nginx proxy | `/ai-intelligence-service/...` |

### 12.3 Phase 0 — Platform setup (Days 1–3)

#### Step 0.1 — Postgres migration to pgvector image (Decision 1)

**Do not** use `apt-get install` inside the pod.

1. `pg_dump` full `citizen_db` backup to host  
2. Update postgres Deployment: `image: pgvector/pgvector:pg16`  
3. Apply manifest; verify pod healthy  
4. `CREATE EXTENSION vector;` + `CREATE SCHEMA ai;`  
5. Run `demo_reset.sh` smoke test — all services still connect  

**Tables:**

```sql
CREATE TABLE ai.service_embeddings (
  id SERIAL PRIMARY KEY,
  service_key VARCHAR(64) UNIQUE,
  title_en TEXT, title_gu TEXT, body_en TEXT, body_gu TEXT,
  embedding vector(384),
  metadata JSONB
);

CREATE TABLE ai.sla_training_runs (
  id SERIAL PRIMARY KEY,
  model_version VARCHAR(32),
  auc FLOAT,
  trained_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);
```

#### Step 0.2 — Verify Ollama from K8s (Decision 4 — gate)

```bash
# Must succeed before any Gemma prompt work
kubectl run ollama-test --rm -it --image=curlimages/curl -n citizen -- \
  curl -s http://host.docker.internal:11434/api/tags
```

Env in `ai-intelligence-service`:

```
OLLAMA_BASE_URL=http://host.docker.internal:11434
LLM_MODEL=gemma4:e4b
```

#### Step 0.3 — Scaffold `ai-intelligence-service`

- Dockerfile: pre-download sentence-transformers model + `COPY models_trained/*.pkl`  
- `requirements.txt`: fastapi, uvicorn, sentence-transformers, lightgbm, shap, asyncpg, pgvector, httpx  
- Health: `GET /health` — DB ok; Ollama optional ping  
- Deploy: `imagePullPolicy: Never`, arm64, NodePort 31189  

#### Step 0.4 — Nginx proxy (citizen + officer portals)

Add to portal `nginx.conf`:

```nginx
location /ai-intelligence-service/ {
  proxy_pass http://ai-intelligence-service.citizen.svc.cluster.local:8089/;
}
```

#### Step 0.5 — Model documentation

Create `docs/AI_MODEL_CARDS.md` — dataset, metrics, limitations for each model.

---

### 12.4 Phase 1 — AI-1 Semantic Search (Days 4–8)

| Step | Task | Output |
|------|------|--------|
| 1.1 | Curate `data/service_catalog.json` from citizen portal services + GU locales | 20+ services |
| 1.2 | `embed_services.py` — embed EN+GU text, upsert pgvector | Populated `ai.service_embeddings` |
| 1.3 | `POST /v1/search/services` — embed query → pgvector top-5 | Candidate list |
| 1.4 | **Gemma rerank only** — top-5 + profile → final order + `why_matched` | 1 Ollama call per search |
| 1.5 | Citizen portal `ServiceSearch.jsx` on Home | Search UI |
| 1.6 | Test: GU query without keyword overlap; EN typo tolerance via embeddings | Test checklist |

**API contract:**

```json
POST /v1/search/services
{ "query": "શિષ્યવૃત્તિ", "lang": "gu", "profile": { "caste": "OBC", "familyId": "..." } }

Response: { "results": [{ "serviceKey", "title", "score", "whyMatched", "route" }] }
```

---

### 12.5 Phase 2 — AI-2 Recommendations (Days 9–13)

| Step | Task | Output |
|------|------|--------|
| 2.1 | `gen_rec_data.py` locally → `data/rec_training.parquet` | ~2k rows |
| 2.2 | `train_ranker.py` locally → `models_trained/recommend_model.pkl` | Bundle in Docker |
| 2.3 | `GET /v1/recommendations?familyId=` — scheme-engine eligible + **LightGBM rank** | Ordered cards |
| 2.4 | **Gemma explanation only** — 1 sentence per card from structured fields | 1 Ollama call per card batch |
| 2.5 | `GET /v1/trending?taluka=Bavla` — SQL on application tables | Live trending |
| 2.6 | Home.jsx — “Recommended for Your Family” + “Trending in …” | UI |

**Rule:** Only schemes passing scheme-engine eligibility appear — ranker never invents eligibility.

---

### 12.6 Phase 3 — AI-4 SLA Prediction (Days 14–20)

**No Gemma** — LightGBM + SHAP only.

| Step | Task | Output |
|------|------|--------|
| 3.1 | `gen_sla_data.py` locally → `data/sla_training.parquet` | ~5k tasks |
| 3.2 | `train_sla.py` locally → `models_trained/sla_model.pkl` | AUC in model card |
| 3.3 | `POST /v1/sla/predict` — features from live task | `{ p_breach, eta, shap_top3 }` |
| 3.4 | Officer Task Queue — “At Risk” tab, batch score on load | UI filter |
| 3.5 | Citizen application detail — estimated completion line | Status screen |
| 3.6 | Model card in `docs/AI_MODEL_CARDS.md` | Evaluator reference |

**Feature extraction from live tasks:**

- Pull from existing task queue aggregation (Flowable + DIGIT tasks)  
- `hours_elapsed`, `sla_hours`, `pending_same_role`, `service`, `district`, `day_of_week`

---

### 12.7 Phase 4 — Integration & demo (Day 21)

- [ ] End-to-end: Priya search → recommendation → officer At Risk → citizen ETA  
- [ ] `demo_reset.sh` — no changes to AI models (read-only)  
- [ ] Update `DG20_Demo_ProjectPlan.md` Phase 17 demo scenes  
- [ ] Architecture panel — show `ai-intelligence-service` box  

---

### 12.8 Dependencies & risks

| Risk | Mitigation |
|------|------------|
| Postgres migration data loss | `pg_dump` before image swap; verify row counts after |
| Ollama not reachable from K8s pod | Phase 0 gate curl test; fallback: disable Gemma, pgvector-only search |
| sentence-transformers slow on first load | Bake model into Docker image at build time |
| Synthetic SLA data questioned | Document in model card; replace with real data post-go-live |
| Gemma 4 latency | Use `e4b` not `26b`; cache rerank for common queries |
| Solo timeline slip | Ship AI-1 first (highest visibility); AI-2/4 can follow |

---

### 12.9 Environment variables (`ai-intelligence-service`)

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | `postgresql://citizenuser:***@postgres.citizen.svc.cluster.local:5432/citizen_db` |
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` |
| `LLM_MODEL` | `gemma4:e4b` |
| `EMBEDDING_MODEL` | `paraphrase-multilingual-MiniLM-L12-v2` |
| `SCHEME_ENGINE_URL` | `http://scheme-engine-service.citizen.svc.cluster.local:8086` |
| `FAMILY_REGISTRY_URL` | `http://family-registry-service.citizen.svc.cluster.local:8085` |

---

## 10. Updated RFP Coverage (After Priority 1)

| RFP theme | Before | After AI-1–5 |
|-----------|--------|--------------|
| Intelligent search (§3.2.20) | ❌ | ✅ AI-1 semantic + Gemma 4 |
| Recommendations (§3.2.20) | ⚠️ | ✅ AI-2 ranker + eligibility engine |
| Predictive SLA (§3.2.20, §3.2.6.1.1) | ⚠️ Reactive badges | ✅ AI-4 LightGBM model |
| Document intelligence (§3.2.20) | ❌ OCR | ⬜ AI-3 deferred |
| Citizen feedback / sentiment (§3.2.21) | ❌ | ⬜ AI-5 deferred |
| Gemma 4 / chatbot NLP | ⬜ Planned | §3 — optional parallel |

---

## 5. RFP Coverage Summary (Current Baseline)

| RFP theme | Covered today | Gap |
|-----------|---------------|-----|
| Proactive service delivery (§3.2.19) | ✅ Eligibility engine, life events, Kafka automation | — |
| AI-powered services (§3.2.20) | ✅ XAI, fraud, fairness, simulator | Document OCR |
| Conversational assistance (§8.2.2.10) | ✅ Rule-based chatbot | NLP (Gamma 4) |
| Multilingual (§8.2.2.14) | ✅ UI + static bilingual bot | Live Bhashini |
| Predictive analytics (§8.6) | ✅ Simulator + Superset | NL query interface |
| Fraud detection | ✅ 4-signal rule engine | — |
| AI-generated summaries (§8.2.2.16) | ✅ Assisted notes, fraud briefs | Grievance summaries |

---

## 6. Recommended Priority Order (Master Backlog)

### 6.1 Citizen-visible AI sprint (Priority 1 — §11 locked decisions, §12 implementation)

| Order | ID | Deliverable | Effort |
|-------|-----|-------------|--------|
| 0 | — | `ai-intelligence-service` + pgvector + Ollama wiring | 2–3 days |
| 1 | AI-1 | Semantic service search | 4–5 days |
| 2 | AI-2 | Recommendations + trending | 4–5 days |
| 3 | AI-4 | SLA prediction model + UI | 5–7 days |

### 6.2 Platform / officer intelligence (existing + follow-on)

| Order | Deliverable | Effort | Impact |
|-------|-------------|--------|--------|
| 6 | Insight cards on officer portal | 1–2 days | Officer-side “insights not tables” |
| 7 | Architecture panel — Edge vs Platform AI tiers | 0.5 day | MacBook + GSDC story |
| 8 | Gemma 4 intent layer (chatbot upgrade) | 2–3 days | §3 |
| 9 | Grievance auto-classification | 0.5 day | Officer queue intelligence |
| 10 | Document OCR (Sarvam Vision) — one form | 1 day | Production-aligned OCR |
| 11 | Gamma 4 Phase B — RAG for scheme FAQ | 2–3 days | Open-ended scheme questions |

---

## 7. References

| Document / path | Content |
|-----------------|---------|
| `docs/DG20_Demo_ProjectPlan.md` | Phase status, demo scenes, gotchas |
| `docs/DG20_Demo_FunctionalityList.md` | Feature-by-feature build status |
| `docs/PROJECT_PLAN.md` | DIGIT infra, two-engine routing |
| `docs/DG20_Phase0_Handoff.md` | DIGIT core service verification |
| `scheme-engine-service/` | Eligibility, fraud, simulator, Kafka |
| `chatbot-service/` | Current conversational layer |
| `officer-portal/src/utils/fraudAI.js` | Fraud narrative templates |
| `citizen-portal/src/reasonUtils.js` | Citizen XAI localization |
| `superset/seed_analytics_views.sql` | Analytics SQL views |

---

*Document v1.3 — Locked decisions §11; implementation §12. Gemma 4 via Ollama. Solo build: Sameer Khanna (architecture) + Cursor (implementation).*
