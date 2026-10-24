# DG 2.0 — Citizen Portal & Mobile App Requirements Document

**Scope:** Citizen Portal (web, React) and Citizen Mobile App (Flutter). The staff-facing `family-portal` search tool is explicitly out of scope for this document.

---

# 1. Introduction

## 1.1 Purpose & Scope

This document specifies, screen by screen, the intended behavior of the two citizen-facing surfaces of the DG 2.0 platform:

- **Citizen Portal** — a React web application (`citizen-portal`) reached via the public landing page, covering login, application submission, family management, grievances, payments, certificates, and notifications.
- **Citizen Mobile App** — a Flutter application (`citizen-mobile`) offering an equivalent, mobile-optimized subset of the same capabilities, with offline draft support.

It is written against the current codebase and is intended as the reference for QA acceptance, RBAC review, and future feature work. Where the current implementation diverges from the intended production behavior (for example, the mobile app's demo-profile login), this is called out explicitly rather than silently normalized.

Out of scope: the Officer Portal, `family-portal` (staff-facing Aadhaar search/family-tree tool), and backend service internals beyond what a screen depends on.

## 1.2 Document Conventions

Every screen in Sections 4 and 5 is specified using the same eight-part template:

| Field | Answers |
|---|---|
| **Purpose** | What the screen is for, in one or two sentences. |
| **RBAC / Access** | Who can reach this screen and under what conditions. |
| **UI States** | Empty, loading, error, and success states the screen must handle. |
| **Business Logic & Validation** | Rules the screen enforces before/while calling the API. |
| **API Dependencies** | Which backend service(s) and endpoint(s) the screen calls. |
| **Workflow** | The sequence of steps/screens involved, where the screen is part of a larger flow. |
| **Exit Criteria** | What "done" looks like — the acceptance conditions a QA pass should check. |
| **Edge Cases** | Known tricky states (duplicate submissions, missing profile data, network failure, etc.). |

## 1.3 Glossary & Reference Documents

| Term | Meaning |
|---|---|
| **Aadhaar-ref** | Masked Aadhaar-derived identifier used as the citizen's primary key across services (`XXXX-XXXX-NNNN` display format). |
| **OTP** | One-time password sent to the citizen's registered mobile number, used both for login and for consent-gated profile access. |
| **CAF** | Common Application Form — a single form that lets a citizen apply to multiple services in one submission. |
| **HEAD / Acting Head** | The family member the registry marks as `relationshipToHead = HEAD`, or — if that person is deceased — the oldest alive adult `SPOUSE`/`OTHER` member, who inherits head privileges. |
| **SELF** | The logged-in citizen's own record within their family. |
| **Reference number** | Human-readable application/grievance tracking number, format `PREFIX-YYMM-NNNNNN` (`CAS`, `MAR`, `PEN`, `FAM`, `SCH`, `GRV`). |
| **engineRef** | Internal workflow-engine identifier (`FLW-<uuid>` for Flowable-backed services, `DGT-<uuid>` for marriage), used for status polling; not shown to citizens directly. |

Related documents: `DEMO_SCRIPT.md` (scene-by-scene walkthrough of the citizen app, useful for expected happy-path behavior), `CasteCertService_Spec.md` (backend workflow spec for the caste-certificate service).

---

# 2. Actors, Roles & Access Model

## 2.1 Citizen — Unauthenticated

- Can only reach the **Landing Page**. Every other route redirects to `/`.
- Can browse the public service catalogue, read notices/scheme announcements, and use the language toggle (English/Gujarati) on the landing page itself.
- Cannot view any personal data, submit applications, or file grievances.

## 2.2 Citizen — OTP-Authenticated (Web)

- Login flow: enter Aadhaar-ref → system sends OTP to the masked registered mobile number → citizen enters OTP → on success, a JWT (`citizen_token`) and a cached profile (`citizen_profile`, including `aadhaarRef`, `name`, `familyId`, `casteCategory`, `annualIncome` where known) are stored client-side.
- Every authenticated route is wrapped in a token-verification check (`verifyCitizenToken`) on app load; an invalid/expired token forces logout back to the Landing Page.
- A citizen's access is scoped to their own Aadhaar-ref and, for family data, their own `familyId`.

## 2.3 Citizen — Mobile App Login (current vs. intended)

- **Current implementation:** the mobile login screen presents a fixed list of demo profiles (`kDemoProfiles`) for one-tap selection; there is no OTP step. On selection, the app attempts to hydrate the chosen profile with live family-registry data, then proceeds to the main shell.
- **Intended production behavior (requirement):** the mobile app must use the same Aadhaar-ref + OTP flow as the web portal, calling the same `auth-service` endpoints (`/v1/otp/send`, `/v1/otp/verify`), so that citizens have one consistent identity across web and mobile.
- Session persistence: profile is cached in `SharedPreferences`; "Switch Profile" clears the cached profile and returns to Login.

## 2.4 Family Role Hierarchy

| Role | Definition |
|---|---|
| **HEAD** | The family member flagged `relationshipToHead = HEAD` and alive. |
| **Acting Head** | If the registered HEAD is deceased, the oldest alive adult member with relationship `SPOUSE` or `OTHER` inherits head privileges. |
| **SELF** | Any member viewing their own record — always allowed, no consent needed. |
| **Member (non-head, non-self)** | Can view their own applications/grievances only; cannot browse the full family member list beyond names shown by the Head's session, and cannot open another living adult member's detailed profile. |

## 2.5 Consent-Gated Access Rules (applies to **My Family** screen on web)

A viewer may open a family member's detailed profile only if one of the following holds:

1. The target **is the viewer** (always allowed, no consent).
2. The target is a **minor** (under 18) — allowed without consent, since minors cannot independently consent.
3. The target **is deceased** — allowed without consent (historical record).
4. The viewer **is the Head/Acting Head** *and* has **already granted session consent** for this specific target (tracked in `sessionStorage`, keyed per viewer+target pair) — allowed.
5. Otherwise, if the viewer is Head/Acting Head but has not yet consented this session: **OTP re-verification is required** before the profile opens.
6. If the viewer is **not** Head/Acting Head and the target is a living adult who is not themself: **access denied**, with an explanatory message — non-head members cannot browse other living adults' full profiles.

## 2.6 Officer Roles (cross-reference only)

The Landing Page's officer login tab authenticates against Keycloak and extracts a role from `realm_access.roles` (`DATA_ENTRY_OFFICER`, `TALATI`, `REVENUE_OFFICER`, `SCHEME_DEPT`, `DEPT_ADMIN`, `IT_ADMIN`). These roles govern the **Officer Portal**, which is out of scope here — noted only because the same landing page hosts both login tabs.

---

# 3. Cross-Cutting Workflows

## 3.1 Authentication & OTP Verification

**Web:**
1. Citizen enters Aadhaar-ref on the Landing Page login panel.
2. System looks up the mobile number on file and returns a masked version (e.g., `XXXXX-XX789`) for confirmation; OTP is sent via `auth-service`.
3. Citizen enters the OTP; on verification, a JWT is issued and the profile is cached client-side.
4. Failure paths: unknown Aadhaar-ref, OTP mismatch, OTP expiry — each must show a specific, actionable error (not a generic failure).

**Mobile (current):** profile selected directly from a demo list, no OTP. **(Gap — see §2.3.)**

**Exit criteria:** a citizen can log in with a valid Aadhaar-ref + OTP and land on Home/My Applications within the session; an invalid OTP is rejected with a retry option; the session survives a page refresh (token re-verified) but not a token expiry.

## 3.2 Application Submission Workflow (generic — Caste / Marriage / Pension / Family-Member / Scheme)

1. **Apply** — citizen selects a service (from Apply catalogue, CAF, or a quick-apply shortcut).
2. **Duplicate check** — for caste, pension, and scheme services, the client checks existing applications (`fetchMyApplications`) for a blocking duplicate (same service, and for pension/scheme the same `pensionType`/`schemeId`) before allowing submission; if found, submission is blocked with an explanatory message rather than silently creating a duplicate.
3. **Fill** — profile-sourced fields (name, Aadhaar-ref, family ID, declared income where known) are shown locked (🔒) and non-editable; only fields the citizen must actually choose (caste category, pension type, groom details, scheme selection, family-member change details) are editable.
4. **Attach documents** — citizen may select previously-uploaded documents from their personal **document vault**, and/or upload a new one inline (accepted: PDF/JPG/PNG/GIF/Word, max 5 MB per file).
5. **Submit** — a `POST /v1/applications` call to the owning backend service returns an `engineRef` and human-readable `applicationNo`; the submission is persisted client-side (`saveCitizenApp`) so it survives to the Home/My Applications list.
6. **Confirmation** — a progress-stepper (Apply → Review → Approved) plus the tracking number and current status; citizen may manually re-check status.
7. **Track** — the application then appears in Home / My Applications (web) or Track (mobile), polled periodically, and remains visible regardless of which device it was submitted from (keyed by Aadhaar-ref, not local device state).

**Exit criteria:** every one of the five services can be submitted end-to-end and produces a trackable reference number; a second submission of a blocking-duplicate type is rejected client-side with a clear message; attached documents are retrievable by the reviewing officer.

## 3.3 Consent Request & Approval Workflow

1. Head/Acting Head attempts to open a living adult family member's profile (My Family screen).
2. System evaluates `canOpenProfile` (see §2.5); if OTP is required, an OTP challenge is triggered specifically for this consent action (independent of login session OTP).
3. On successful OTP entry, consent is recorded for the **current session only** (`sessionStorage`), permitting repeated views of that same member without re-prompting until the session ends.
4. Consent for **data sharing with departments** (as opposed to family-profile viewing) is a separate, longer-lived record shown on **My Data & Consents → Consents tab**, where the citizen can revoke or restore per-department consent and view a lightweight access log.

**Exit criteria:** a non-consented profile view always prompts OTP; a consented view within the same session does not re-prompt; revoking a department consent is reflected immediately in that consent's status and is independently restorable.

## 3.4 Grievance Lifecycle Workflow

States: `OPEN` (Awaiting Response) → `ACKNOWLEDGED` (Under Review) → `QUERY_RAISED` (officer needs citizen input) ⇄ citizen response → `RESOLVED` (terminal; no further follow-ups accepted).

1. Citizen files a grievance, optionally linked to an existing application (`trackingRef`), with a **category** (9 fixed categories), **priority** (Low/Normal/High/Urgent), free-text description (max 500 chars), and up to 3 attachments (PDF/JPG/PNG, max 2 MB each).
2. Officer acknowledges, may raise a query (`QUERY_RAISED`) requesting more information — this surfaces to the citizen as an actionable "Officer Query — Please Respond" state with a dedicated **Respond** shortcut.
3. Citizen and officer exchange follow-up comments (with optional attachments) in a threaded view until the officer marks it `RESOLVED`.
4. Once `RESOLVED`, the thread becomes read-only — no further citizen follow-up is accepted.

**Exit criteria:** a citizen can file, track, and follow up on a grievance without leaving the app; an officer query is visually distinguishable from a routine status update; a resolved grievance cannot receive new citizen messages.

## 3.5 Notification Delivery Workflow

- In-app: **Notification Hub** (web) / push notifications + in-app badge (mobile) surface status changes on applications, grievance responses, and scheme eligibility updates.
- Mobile additionally supports OS-level push (via `NotificationService`), including a lifecycle-resume check (`didChangeAppLifecycleState` → `checkStatusChanges`) so status changes are caught when the app is foregrounded again, not only via push delivery.
- Web polls for new notifications/clarifications every ~10 seconds while Home is open; this is not a substitute for real push and should not be relied upon when the tab isn't active.

**Exit criteria:** an approved application or an officer's grievance response produces a notification within one polling/push cycle; opening the notification deep-links to the relevant application/grievance detail.

## 3.6 AI-Assisted Discovery Workflow

- **Semantic service search** (`AISearch`, embedded on Home): citizen describes their need in natural language (English or Gujarati); the AI intelligence service returns ranked matching services with a one-line reason.
- **Scheme recommendations** (`SchemeRecommendations`, embedded on My Family): given the family's profile (income, caste category, member ages), the system surfaces schemes the family is likely eligible for, each with a plain-language eligibility explanation.
- **Chatbot** (`ChatWidget` on web, `dg_chatbot.dart` on mobile): free-form Q&A assistant, backed by `chatbot-service`, supporting Gujarati.

**Exit criteria:** search returns results for both a keyword query and a natural-language query; recommendations reflect the citizen's actual family data (not placeholder content); the chatbot responds in the citizen's selected UI language.

## 3.7 Draft & Offline Sync Workflow (mobile-specific)

1. While filling any apply form, the citizen may save an incomplete form as a **draft** (persisted locally via Hive-backed `DraftService`, keyed by Aadhaar-ref), even with no network connectivity.
2. Drafts are listed under **Drafts**, badge-counted on the app bar's drafts icon.
3. Resuming a draft reopens the correct form type (caste/pension/scheme) pre-filled with the saved field values.
4. Deleting a draft requires an explicit confirmation dialog (irreversible action).
5. Drafts are **not** submitted automatically — the citizen must reopen and explicitly submit once connectivity is available.

**Exit criteria:** a draft saved offline survives an app restart; resuming a draft restores all previously entered field values; submitting from a resumed draft removes it from the drafts list.

---

# 4. Citizen Portal (Web) — Screen Specifications

## 4.1 Screen Inventory & Route Map

| Route | Component | Auth required |
|---|---|---|
| `/` (unauthenticated) | LandingPage | No |
| `/` (authenticated) | Home | Yes |
| `/apply` | ApplyPage | Yes |
| `/apply/caf` | CommonApplicationForm | Yes |
| `/apply/caste`, `/apply/marriage`, `/apply/pension`, `/apply/family-member`, `/apply/scheme` | ApplyForm (per service) | Yes |
| `/apply/:serviceId` | PublishedFormApplication (lazy) | Yes |
| `/my-family` | MyFamily | Yes |
| `/my-consents` | MyData (tabs: My Data / Consents) | Yes |
| `/grievances` | MyComplaints | Yes |
| `/payments` | PaymentsBenefits | Yes |
| `/certificates` | MyCertificates | Yes |
| `/notifications` | NotificationHub | Yes |
| `/contact` | ContactCentre | Yes |

Legacy redirects: `/login` → `/`, `/my-applications` → `/`, `/my-complaints` → `/grievances`.

## 4.2 Landing Page / Login

**Purpose:** Public entry point; hosts marketing content (service catalogue, scheme announcements, how-it-works) and both citizen and officer login panels.

**RBAC:** Public — no authentication required to view. Login panels are the gate to everything else.

**UI States:** Default (marketing content) · citizen-login step 1 (Aadhaar-ref entry) · step 2 (OTP entry) · officer-login (username/password) · error (invalid Aadhaar-ref / OTP / credentials) · loading (during OTP send/verify or Keycloak token exchange).

**Business Logic & Validation:** Aadhaar-ref must match a known citizen record before an OTP is sent (no OTP is sent to an unregistered Aadhaar-ref — this must not leak whether an Aadhaar-ref exists via timing or message differences). Officer login uses Keycloak's `password` grant and extracts role from the returned JWT.

**API Dependencies:** `auth-service` (`/v1/otp/send`, `/v1/otp/verify`), Keycloak token endpoint (officer path only).

**Workflow:** See §3.1.

**Exit Criteria:** Both login tabs are independently reachable and functional; language toggle (EN/GU) persists across a reload; a successful citizen login lands on Home; a successful officer login redirects to the Officer Portal (external app).

**Edge Cases:** Expired OTP; OTP resend rate-limiting; switching between citizen/officer tabs mid-entry should not leak partially-entered state into the other tab.

> **Note:** The application-progress cards shown on the landing page hero (e.g., "Income Certificate — 80% — In review") are static marketing mockups, not live citizen data — this should be clearly understood as illustrative, not a functional requirement to keep in sync with real data.

## 4.3 Home / Dashboard

**Purpose:** Post-login landing screen — a searchable, filterable, sortable list of all the citizen's applications across all five services, plus AI-assisted service search.

**RBAC:** Authenticated citizen; scoped to their own Aadhaar-ref only.

**UI States:** Loading · empty (no applications yet, with a prominent "Start your first application" CTA) · populated table · no-match-for-filter · application detail modal open.

**Business Logic & Validation:** Applications are fetched by fanning out to all five certificate/application services filtered by the citizen's Aadhaar-ref, then merged client-side. Search matches against reference number, service name, or `engineRef`. Filters: by service (5 options + All) and by status (Pending/Approved/Escalated + All). Sortable columns: reference number, service, submitted date, status. A "needs info" badge overrides the normal status badge when an officer clarification is pending on that application.

**API Dependencies:** All 5 certificate/application services (`GET /v1/applications?aadhaar=...`), `grievance-service` (clarifications), `notifications-service`.

**Workflow:** Entry point into §3.2 (via "New Application" → CAF) and into the application detail modal (status, current workflow step, certificate download link when approved and status is `caste`+`APPROVED`).

**Exit Criteria:** All of a citizen's applications across all 5 services appear in one unified list within a few seconds of login; auto-refresh picks up a status change within ~15 seconds without a manual reload; clicking a row opens full detail without navigating away.

**Edge Cases:** One backend service being temporarily unreachable must not blank the whole list — partial results from the other four services should still render; a citizen with zero `familyId` (registry not yet linked) should see a clear explanatory empty state, not a silent failure.

## 4.4 Apply — Service Catalogue

**Purpose:** Landing page for the Apply section — lets the citizen choose which service to apply for (including any dynamically published/generic forms).

**RBAC:** Authenticated citizen.

**Business Logic:** Lists the 5 built-in services plus any additional published form definitions (via `PublishedFormApplication`/`serviceId` route) fetched from a form-registry source.

**API Dependencies:** Depends on which services are configured as "published" (dynamic form definitions).

**Exit Criteria:** Every enabled service is listed and its tile navigates to the correct apply route.

## 4.5 Common Application Form (CAF)

**Purpose:** Lets a citizen fill shared personal/family details once and select one or more services to submit together, rather than repeating the same data-entry per service.

**RBAC:** Authenticated citizen.

**Business Logic & Validation:** Must run the same per-service duplicate-block checks as the individual Apply forms before allowing a service to be selected for bundled submission; profile-locked fields behave identically to the individual forms.

**Workflow:** A superset entry point into §3.2 — one CAF submission fans out to the individual services' `/v1/applications` endpoints.

**Exit Criteria:** Selecting 2+ services and submitting produces that many distinct tracked applications, each independently visible and trackable on Home.

## 4.6 Apply — Caste Certificate

**Purpose:** Submit a caste certificate application.

**RBAC:** Authenticated citizen; blocked if a PENDING or APPROVED caste application already exists (duplicate-block, see §3.2 step 2).

**UI States:** Form · submitting · confirmation (tracking number + progress stepper) · duplicate-blocked error.

**Business Logic & Validation:** Name and Aadhaar-ref are profile-locked. Caste category is citizen-selectable from the configured caste list, defaulting to the profile's recorded category. `tenantId` is fixed (`pg`).

**API Dependencies:** `caste-certificate-service` (`POST /v1/applications`, `GET /v1/applications/track/:ref`).

**Exit Criteria:** Submission returns a `CAS-YYMM-NNNNNN` reference; status polling reflects PENDING → APPROVED transitions; an approved application unlocks the certificate PDF download on Home/My Certificates.

**Edge Cases:** Citizen with no recorded caste category on profile must still be able to select one manually.

## 4.7 Apply — Marriage Certificate

**Purpose:** Submit a marriage certificate application; the logged-in citizen is always the bride/applicant, with groom details entered manually.

**RBAC:** Authenticated citizen.

**Business Logic & Validation:** Groom name, groom Aadhaar-ref, marriage date, and witness name are all required, free-text/date fields (no profile-lookup for the groom in the current implementation). No duplicate-block check currently applies to this service (see §3.2 step 2 — only caste/pension/scheme are checked).

**API Dependencies:** `marriage-certificate-service` (`POST /v1/applications`).

**Exit Criteria:** Submission returns a `MAR-YYMM-NNNNNN` reference and is trackable like any other application.

**Edge Cases:** Groom Aadhaar-ref is free text with no format validation in the current implementation — a production requirement should add Aadhaar-ref format validation here, matching the applicant's own field.

## 4.8 Apply — Pension

**Purpose:** Submit a pension application (Old Age, Widow, or other configured pension types).

**RBAC:** Authenticated citizen; duplicate-blocked per **pension type** (a citizen may hold one PENDING/APPROVED application per pension type, but could file for a different type — e.g., already has Old Age, can still apply for a different pension category if eligible).

**Business Logic & Validation:** Pension type is a required select; family ID is profile-locked and passed through so the backend can pull family income context.

**API Dependencies:** `pension-service` (`POST /v1/applications`).

**Exit Criteria:** Submission returns a `PEN-YYMM-NNNNNN` reference; the confirmation screen shows the selected pension type in the summary.

## 4.9 Apply — Add / Change Family Member

**Purpose:** Request an addition, update, or removal against the citizen's family record (e.g., register a newborn, correct/remove a member).

**RBAC:** Authenticated citizen with a linked `familyId`.

**Business Logic & Validation:** `changeType` (ADD / other configured types) drives which fields are shown — ADD requires full new-member details (name, DOB, gender, relationship, occupation, income, caste category, mobile); non-ADD change types require only a `personId` reference. A free-text `reason` is always required regardless of change type.

**API Dependencies:** `family-member-service` (`POST /v1/applications`), which on approval synchronizes into `family-registry-service`.

**Exit Criteria:** Submission returns a `FAM-YYMM-NNNNNN` reference; on approval, the change is reflected in **My Family**.

## 4.10 Apply — Scheme Application

**Purpose:** Apply to a specific welfare scheme (selected from the live scheme catalogue, or deep-linked with a pre-selected `schemeId` from AI recommendations).

**RBAC:** Authenticated citizen with a linked `familyId`; duplicate-blocked per specific `schemeId`.

**Business Logic & Validation:** Declared income is pre-filled and profile-locked when the family record already has a recorded annual income; otherwise the citizen must manually enter it. Scheme is a required select populated from `scheme-engine-service`'s live scheme list.

**API Dependencies:** `scheme-engine-service` (`GET /v1/schemes`), `scheme-application-service` (`POST /v1/applications`).

**Exit Criteria:** Submission returns a `SCH-YYMM-NNNNNN` reference; the confirmation screen shows the scheme name and family ID.

**Edge Cases:** Scheme list fails to load — the form must degrade to "no schemes available, try again later" rather than allowing submission with an empty scheme selection.

## 4.11 Apply — Dynamically Published Form

**Purpose:** Support future services added via a form-builder/publishing mechanism without requiring a new hardcoded route per service.

**RBAC:** Authenticated citizen.

**Business Logic:** Lazy-loaded component; renders whatever fields the published form definition specifies for the given `serviceId`.

**Exit Criteria:** A newly published form is reachable at `/apply/:serviceId` without a code deployment to `citizen-portal`, and its submission is trackable on Home like any built-in service. *(This screen's detailed field-level behavior depends on the form-builder's schema and is out of scope for per-field specification here.)*

## 4.12 My Family

**Purpose:** View household composition, family income breakdown, and enrolled/eligible welfare schemes; central place for consent-gated member profile viewing.

**RBAC:** Authenticated citizen with a linked `familyId`. Tab content (Members / Income / Schemes) is visible to all family members, but opening an individual member's **detailed profile** is gated per §2.5.

**UI States:** Loading · error (family fetch failed) · no-family-linked · Members tab · Income tab · Schemes tab · member profile panel open (with or without OTP challenge) · access-denied banner (non-head attempting to open another living adult's profile).

**Business Logic & Validation:** Members sorted by relationship precedence (Head → Spouse → Parents → Children → Other). Head/Acting Head sees a "you can view any member" hint; non-head members see a "self-view only" hint. Scheme Recommendations component surfaces AI-suggested schemes based on the family's actual income/composition data.

**API Dependencies:** `family-registry-service` (family, income, geo), `scheme-engine-service` (enrolled/eligible schemes).

**Workflow:** See §3.3 for the consent flow.

**Exit Criteria:** Head can view every member's profile (with OTP the first time per session for living adults); non-head members see only their own detailed profile and get a clear denial message for others; income and scheme tabs load independently of the members tab (one failing doesn't blank the others).

## 4.13 My Data & Consents

**Purpose:** Two-tab screen — **My Data** (view personal/family registry data, request corrections, manage a personal document vault) and **Consents** (manage per-department data-sharing consent, review DPDP rights, export all personal data).

### My Data Tab

**Business Logic & Validation:** Displays read-only registry data (identity, address, family) sourced live from `family-registry-service` — falling back to the cached login profile only for fields not yet returned by the live lookup. "Request Update" opens a structured correction request (field, current value, requested value, reason, optional supporting documents) which is filed as a `WRONG_INFORMATION` grievance rather than a direct self-service edit — **all registry corrections go through officer review**, by design.

**Exit Criteria:** A correction request produces a trackable grievance; the citizen cannot directly edit registry fields from this screen.

### Consents Tab

**Business Logic & Validation:** Each consent card shows the department, data category shared, purpose, grant date, and (if revoked) revoke date and a computed 1-year validity window. Revoke/restore are independent, reversible actions with an access-log accordion per consent. A DPDP-rights accordion (5 fixed rights) is informational. "Download My Data" produces a JSON export of the citizen's data via `fetchDataExport`.

**API Dependencies:** Consents CRUD endpoints (grant implicit at data-sharing time; revoke/restore explicit), data-export endpoint.

**Exit Criteria:** Revoking a consent immediately flips its status and unlocks a "Restore" action; the JSON export downloads successfully and contains the citizen's actual data, not a placeholder.

## 4.14 Grievances (My Complaints)

**Purpose:** File and track grievances; see §3.4 for the full lifecycle.

**RBAC:** Authenticated citizen; grievances scoped to the citizen's own Aadhaar-ref.

**UI States:** Loading · empty · populated table · filter-no-match · raise-complaint modal · thread expanded (with follow-up composer, or read-only "resolved" notice).

**Business Logic & Validation:** Category (required, 9 fixed options) and complaint text (required, max 500 chars) gate submission; priority defaults to Normal. Attachments: max 3 files, 2 MB each, PDF/JPG/PNG only — both count and size/type are validated client-side before upload. Sort/filter by status, category, priority (urgent-first ordering available), and date filed.

**API Dependencies:** `grievance-service` (submit, list, thread, comment).

**Exit Criteria:** See §3.4.

**Edge Cases:** Attaching a 4th file is blocked with an explicit message rather than silently dropping earlier attachments; responding to an officer query pre-fills a response template in the follow-up box for convenience.

## 4.15 Payments & Benefits

**Purpose:** Track disbursements/benefits received against enrolled schemes.

**RBAC:** Authenticated citizen, scoped to their own family's disbursement records.

**API Dependencies:** `scheme-engine-service` (disbursement records tied to the family's beneficiary rows).

**Exit Criteria:** Every DISBURSED beneficiary record for the citizen's family appears with amount, scheme, and disbursement date/reference.

## 4.16 My Certificates

**Purpose:** Central place to view and download all certificates the citizen has been issued (currently: caste certificate; extensible to other certificate-producing services).

**RBAC:** Authenticated citizen; only certificates belonging to their own applications.

**Business Logic:** Download is only available once the underlying application's status is `APPROVED`.

**API Dependencies:** Certificate-issuing service's download endpoint (`certificateDownloadUrl`).

**Exit Criteria:** An approved caste certificate downloads as a valid PDF; a not-yet-approved application does not expose a download link.

## 4.17 Notification Hub

**Purpose:** Chronological feed of all notifications (status changes, grievance responses, scheme eligibility alerts).

**RBAC:** Authenticated citizen, own notifications only.

**API Dependencies:** `notifications-service`.

**Exit Criteria:** Every notification the citizen has received appears here, most recent first, and clicking one deep-links to the relevant application/grievance.

## 4.18 Contact Centre

**Purpose:** Help/support surface — contact channels, FAQs, and possibly escalation paths for issues not covered by the grievance flow.

**RBAC:** Authenticated citizen (content itself is not personal data).

**Exit Criteria:** Contact information and FAQ content render correctly in both supported languages.

## 4.19 Shared Components (used across multiple screens)

| Component | Used on | Purpose |
|---|---|---|
| `AISearch` | Home | Natural-language service discovery (§3.6). |
| `SchemeRecommendations` | My Family | AI-driven scheme eligibility suggestions (§3.6). |
| `ChatWidget` | Global | Gujarati-capable chatbot assistant. |
| `NotificationBell` | Global header | Unread-notification indicator, quick access to Notification Hub. |
| `MemberProfile360` | My Family | The consent-gated detailed member profile panel itself. |
| `InfoRequestSection` | Home (app detail modal) | Surfaces and lets the citizen respond to an officer's information request against a specific application. |

---

# 5. Mobile App (Flutter) — Screen Specifications

## 5.1 Screen Inventory & Navigation Map

Bottom navigation (`MainShell`), 5 tabs: **Home**, **My Family**, **Apply**, **Grievances**, **More** — implemented as an `IndexedStack` so tab state persists across switches. A floating action button opens the **Chatbot**. The app bar shows a drafts badge (when drafts exist) and a profile switcher.

| Screen | File | Reached from |
|---|---|---|
| Login | `login/login_screen.dart` | App launch (no session) |
| Home | `home/home_screen.dart` | Bottom nav — Home tab |
| My Family | `family/family_screen.dart` | Bottom nav — Family tab |
| Apply Hub | `apply/apply_screen.dart` | Bottom nav — Apply tab |
| Caste / Pension / Scheme forms | `apply/caste_form_screen.dart`, `pension_form_screen.dart`, `scheme_form_screen.dart` | Apply Hub quick-tiles, or resumed from Drafts |
| Common Application Form | `apply/common_application_form.dart` | Apply Hub CAF banner |
| Grievance Form | `apply/grievance_form_screen.dart` | Apply Hub "Support" card |
| Form Success | `apply/_form_success_screen.dart` | After any successful apply/grievance submission |
| Grievances | `grievances/grievances_screen.dart` | Bottom nav — Grievances tab |
| Schemes Browse | `schemes/schemes_screen.dart` | Linked from Home/Family |
| Drafts | `drafts/drafts_screen.dart` | App bar drafts icon |
| Track Application | `track/track_screen.dart` | Application row tap |
| More / Settings | `more/more_screen.dart` | Bottom nav — More tab |
| Chatbot | `widgets/dg_chatbot.dart` | Floating action button |

## 5.2 Login

**Purpose:** Entry point selecting/authenticating the citizen profile that drives the rest of the session.

**RBAC:** None (pre-authentication).

**Current Business Logic:** Presents a fixed list of demo profiles (`kDemoProfiles`); selecting one attempts to hydrate it with live family-registry data (`fetchProfile`) and caches the result to `SharedPreferences`, then opens `MainShell`.

**Required (target) Business Logic:** Replace demo-profile selection with Aadhaar-ref entry + OTP verification against `auth-service`, matching the web flow (§3.1), so the same citizen identity works across both surfaces.

**Exit Criteria (current):** Selecting any demo profile successfully opens the Home tab with that profile's real data where available. **Exit Criteria (target):** A citizen can log in with their own Aadhaar-ref + OTP, not only from a fixed demo list.

## 5.3 Home

**Purpose:** Mobile equivalent of the web Home — the citizen's application list and entry point to apply/track.

**RBAC:** Authenticated (or demo-selected) profile only, scoped to that profile's Aadhaar-ref.

**Exit Criteria:** Mirrors §4.3's exit criteria for the mobile form factor — all applications across services visible, status reflected within one refresh cycle.

*(Implementation file was found empty at inspection time — this is a placeholder pending a follow-up code check; the specification above states the required behavior regardless of current file state.)*

## 5.4 My Family

**Purpose:** Mobile equivalent of the web My Family screen.

**RBAC:** Same consent-gating rules as §2.5/§4.12 must apply identically on mobile — a non-head member must not be able to view another living adult's profile on mobile just because the OTP-gating logic happens to only be implemented on web today. **This is a requirement to verify/enforce**, not an assumption to leave unchecked.

**Exit Criteria:** Same as §4.12, adapted to mobile UI (list/detail navigation rather than in-page panel).

## 5.5 Apply Hub

**Purpose:** Entry point for all application types — a CAF banner (primary CTA), three "quick apply" shortcuts (Caste, Pension, Scheme — each opening the CAF pre-selected to that service), and a separate "Raise a Grievance" card (grievances are explicitly **not** bundled into CAF).

**RBAC:** Authenticated profile.

**Business Logic:** Quick-apply tiles are a convenience shortcut into the CAF flow with a preselected service, not a separate submission path.

**Exit Criteria:** Each quick-apply tile opens CAF with the correct service preselected; the grievance card opens the standalone Grievance Form, not CAF.

## 5.6–5.9 Apply — Caste / Pension / Scheme Forms & CAF

**Purpose:** Mobile equivalents of the web per-service apply forms (§4.6, §4.8, §4.10) and the CAF (§4.5).

**RBAC:** Same duplicate-block and profile-lock rules as web must apply identically.

**Business Logic & Validation:** Each per-service form must accept a `draftFields` parameter so it can be **resumed from a saved draft** (§3.7) with all previously entered values restored — this is a mobile-specific requirement not present on web.

**Exit Criteria:** Each form can (a) be submitted directly, (b) be saved as a draft mid-fill, and (c) be resumed from a draft with no data loss.

## 5.10 Apply — Grievance Form

**Purpose:** Mobile equivalent of raising a grievance (§4.14 / §3.4), reached independently of CAF.

**RBAC:** Authenticated profile.

**Exit Criteria:** Mirrors §4.14's submission exit criteria.

## 5.11 Application/Grievance Submitted (Success Screen)

**Purpose:** Shared confirmation screen shown after any successful apply or grievance submission — displays the tracking reference and next steps.

**Exit Criteria:** Every successful submission path (apply forms, CAF, grievance form) routes through this screen with the correct reference number, never leaving the citizen on a blank/ambiguous state after submit.

## 5.12 Grievances

**Purpose:** Mobile equivalent of My Complaints (§4.14) — list, filter, and thread view of the citizen's grievances.

**Exit Criteria:** Same lifecycle guarantees as §3.4, adapted to mobile navigation (push to a detail/thread screen rather than in-page expansion).

## 5.13 Schemes Browse

**Purpose:** Let the citizen browse the full welfare scheme catalogue independent of an active application, to decide what to apply for.

**API Dependencies:** `scheme-engine-service` (`GET /v1/schemes`).

**Exit Criteria:** Full scheme list is browsable and each scheme deep-links into the Scheme apply form with that scheme preselected.

## 5.14 Drafts

**Purpose:** Offline-first draft management — see §3.7 for the full lifecycle.

**RBAC:** Scoped to the current profile's Aadhaar-ref (`DraftService.listDrafts(aadhaarRef)`); drafts are local-device storage, not synced across devices.

**UI States:** Empty ("No saved drafts") · populated list · delete-confirmation dialog · unsupported-draft-type snackbar (a draft for a service type without a dedicated resume screen shows an explanatory message instead of silently failing).

**Business Logic & Validation:** Deleting a draft requires explicit confirmation (irreversible). Resuming routes to the correct form screen (`caste`/`pension`/`scheme`) based on the draft's stored `service` field.

**Exit Criteria:** See §3.7.

**Edge Cases:** A draft for a service type not yet supported by a resume screen (e.g., marriage or family-member drafts, if ever saved) must degrade gracefully with a clear message, not crash.

## 5.15 Track Application

**Purpose:** Detailed single-application status view (mobile equivalent of the Home detail modal, §4.3), reached by tapping an application row.

**Exit Criteria:** Shows current status, current workflow step, and — when approved and applicable — a certificate download/view action.

## 5.16 More / Settings

**Purpose:** Secondary menu — likely houses language toggle, profile switch, app info, and links to Contact/Support equivalents.

**Exit Criteria:** Language toggle here stays in sync with the same toggle available elsewhere in the app (one source of truth via `LocaleService`).

## 5.17 Chatbot

**Purpose:** Floating-action-button-launched conversational assistant (`DgChatbotScreen`), mobile equivalent of the web `ChatWidget`.

**API Dependencies:** `chatbot-service`.

**Exit Criteria:** Reachable from any tab via the persistent FAB; responds in the citizen's selected language.

## 5.18 Mobile-Specific Non-Functional Concerns

- **Offline storage:** Drafts persist via Hive-backed local storage and must survive app restarts and OS-level backgrounding.
- **Push notifications:** Registered and requested at app start (`NotificationService.init()` / `.requestPermission()`); a foreground-resume hook re-checks status changes so notifications aren't missed while the app was backgrounded.
- **Deep links:** Scheme browse → scheme apply form; notification tap → relevant application/grievance (parity with web).
- **Permissions:** Push notification permission is requested proactively at launch — the UX for a denied permission (how status updates are then surfaced) needs an explicit fallback (in-app badge/polling) rather than silent loss of updates.

---

# 6. Non-Functional Requirements

## 6.1 Localization

Both apps must support English and Gujarati via a single, session-persistent language toggle (`react-i18next` on web, `LocaleService`/`app_strings` on mobile). No screen should ship with hardcoded English strings that bypass the translation layer — this document's own examples (e.g., grievance category labels, consent right titles) are drawn from the translation keys already in use and should be treated as the canonical set.

## 6.2 Performance & Responsiveness

- Home/application-list views should render an initial paint within a few seconds even if one of the five backend application services is slow or unreachable (partial-result tolerance, see §4.3 edge cases).
- Polling intervals (15s for applications, 10s for notifications/clarifications) are a stopgap for real push and should not block the UI thread or cause visible flicker on refresh.

## 6.3 Accessibility

- All interactive elements (buttons, form fields, filters) must be keyboard-navigable and screen-reader labeled on web.
- Status badges and priority indicators must not rely on color alone — text labels (already present, e.g., "Awaiting Response", "Urgent") must always accompany color coding.

## 6.4 Security & Data Privacy

- Aadhaar-ref is never shown in full — always masked (`maskAadhaar`) except where the citizen is viewing their own confirmed profile data.
- Mobile numbers are masked (`maskMobile`) in any UI context.
- JWTs (`citizen_token`) are stored client-side (localStorage/SharedPreferences) and must be verified server-side on every sensitive request, not trusted purely from client state.
- Consent revocation must take effect for any *future* data access — it does not need to retroactively erase data already legitimately shared prior to revocation, but the distinction should be clearly communicated to the citizen in the Consents tab copy.
- File uploads (document vault, grievance attachments) must be validated both client-side (type/size, already implemented) and server-side (must not trust client validation alone as the only gate).

## 6.5 Offline Behavior (Mobile)

- Only the **Drafts** workflow is required to function fully offline. Submission, tracking, grievances, and family data all require connectivity and should show a clear "no connection" state rather than a stuck spinner or silent failure.

---

# 7. Appendices

## 7.1 API-to-Screen Mapping

| Backend service | Port (dev) | Consumed by |
|---|---|---|
| `caste-certificate-service` | 8080 | Apply-Caste, Home (status), My Certificates |
| `marriage-certificate-service` | 8081 | Apply-Marriage, Home (status) |
| `pension-service` | 8082 | Apply-Pension, Home (status) |
| `family-member-service` | 8083 | Apply-Family-Member, Home (status) |
| `scheme-application-service` | 8084 | Apply-Scheme, Home (status) |
| `family-registry-service` | 8085 | My Family, My Data, mobile profile hydration |
| `scheme-engine-service` | 8086 | My Family (schemes/recommendations), Apply-Scheme, Payments & Benefits, Schemes Browse |
| `auth-service` | 8087 | Login/OTP (web; required for mobile per §5.2 target) |
| `chatbot-service` | 8088 | ChatWidget (web), Chatbot (mobile) |
| `ai-intelligence-service` | 30089 (mobile) / proxied (web) | AISearch, SchemeRecommendations, mobile speech features |
| `grievance-service` | 8089 | My Complaints / Grievances (both apps), My Data correction requests |
| `notifications-service` | 8099 | Notification Hub (web), push notifications (mobile) |

## 7.2 Reference Number Formats

`PREFIX-YYMM-NNNNNN`, prefixes: `CAS` (caste), `MAR` (marriage), `PEN` (pension), `FAM` (family member), `SCH` (scheme), `GRV` (grievance). Internally tracked by `engineRef` (`FLW-<uuid>` or `DGT-<uuid>` for marriage), which is not shown to citizens directly.

## 7.3 Status & Category Enumerations

| Domain | Values |
|---|---|
| Application status | `PENDING`, `APPROVED`, `ESCALATED` (a `REJECTED` state appears in some UI status-color mappings but should be confirmed against current backend logic — see Open Questions). |
| Grievance status | `OPEN`, `ACKNOWLEDGED`, `QUERY_RAISED`, `RESOLVED` |
| Grievance priority | `LOW`, `NORMAL`, `HIGH`, `URGENT` |
| Grievance category | `DELAYED_PROCESSING`, `DOCUMENT_REJECTION`, `WRONG_INFORMATION`, `CERTIFICATE_NOT_RECEIVED`, `SCHEME_ELIGIBILITY`, `BENEFIT_NOT_RECEIVED`, `TECHNICAL_ISSUE`, `OFFICER_CONDUCT`, `OTHER` |

## 7.4 Glossary

See §1.3.

## 7.5 Open Questions / Assumptions Requiring Validation

1. **Mobile login is demo-profile-based, not OTP-based** (§2.3, §5.2) — confirmed as a real gap against the intended production requirement; needs a decision on priority/timeline.
2. **Mobile consent-gating for My Family** — the OTP/consent rules in §2.5 are confirmed implemented on web; whether the same rules are enforced identically on the mobile My Family screen needs direct verification (§5.4).
3. **`REJECTED` application status** appears in some web status-color mappings (Home screen) but no backend service was confirmed to produce it (only `PENDING`/`APPROVED`/`ESCALATED` were seen in the certificate services) — needs clarification: is this a planned-but-unused state, or dead code?
4. **Marriage application has no duplicate-block check** (§4.7) — confirm whether this is intentional (multiple marriage certificate requests are legitimately allowed) or an oversight relative to caste/pension/scheme.
5. **Several mobile screens** (Home, Family, Grievances, Schemes, More, Track) were inventoried by file/route but not read in full detail for this document — their specifications above are written to the *required* behavior based on their web equivalents and naming; each should be checked against actual code before being treated as a binding acceptance spec.
