# DG 2.0 — Evaluator Film Storyboard (LOCKED)

**Title:** *Digital Gujarat 2.0 — One Family. One Platform. One State.*  
**Length:** **3:00** exactly  
**Audience:** Government evaluators  
**Language:** English voice-over · Gujarati **on screen** (UI + lower-thirds), never spoken  
**Close:** Form Builder (design → govern → citizen render)  
**Mobile:** **6 seconds** of Flutter, picture-in-picture after web login — **do not show the demo-profile picker**  
**Date locked:** 2026-08-17

This is the **creative lock** (3:00). For the video maker — shot files, VO cue sheet, session split, and edit timeline — use [`DG20_Evaluator_Film_Production_Script.md`](./DG20_Evaluator_Film_Production_Script.md). Capture is **multi-session**; the editor does not need the live cluster.

---

## Locked decisions

| Decision | Choice |
| --- | --- |
| Length | 3:00 |
| Audience | Government evaluators |
| VO | English only |
| Form Builder | Closing punch (Act V) |
| Flutter | 6s PIP of Priya’s Home → My Family → Apply — same identity as web |

**Evaluator stance:** prove *working software on a live stack*, dual-engine coexistence with DIGIT, family as the welfare unit, explainable eligibility, department-owned forms. No investor adjectives. No live UIDAI / DigiLocker / PSP / WhatsApp claims.

---

## Clock (3:00)

```text
0:00–0:10   Title
0:10–1:02   Act I    Citizen (web) + Flutter PIP
1:02–1:26   Act II   Family + consent
1:26–2:00   Act III  Officer: one queue, two engines
2:00–2:32   Act IV   State finds the citizen
2:32–2:54   Act V    Form Builder (close)
2:54–3:00   End card
```

**Word count of VO:** ~430 words · read at **~145 wpm** · leave 0.3–0.5s air between acts.

---

## Visual grammar (evaluators)

- Show **working UI**, never architecture slides of UI.
- Keep **role badge** visible on every officer shot (`TALATI` / `DEPT ADMIN`).
- Show **Gujarati in the product**, English in the voice.
- Flutter: **phone bezel**, right third of frame, after Priya is already identified on web.
- Super: thin `Recorded from the live cluster` only in Act IV (2 seconds).
- Never: passwords, kubectl, 500s, Keycloak admin, demo-profile login list.

---

## TITLE (0:00 – 0:10)

| | |
| --- | --- |
| **Picture** | Gujarat map / emblem dissolves into citizen landing. Hard-cut: English landing → Gujarati toggle. |
| **On-screen** | `DIGITAL GUJARAT 2.0` · `A working evaluation build` |
| **Voice-over** | *Six crore citizens. Hundreds of schemes. Two government workflow engines. The evaluation question is simple: can the State find the family — before the family has to find the State?* |
| **Capture** | Citizen `http://localhost:31174/` |

---

## ACT I — The citizen (0:10 – 1:02)

### Beat 1 · Web login (0:10 – 0:20)

| | |
| --- | --- |
| **Picture** | **Clip 6s.** Citizen tab → Aadhaar `XXXX-XXXX-1001` → OTP → Home: **Priya Patel**, Bavla, family summary. |
| **On-screen** | `Aadhaar + OTP` · `No new registration` |
| **Voice-over** | *Priya Patel is an ASHA worker in Bavla. She does not register. She authenticates. The family registry already holds her record. Digital Gujarat 2.0 lets her use it.* |
| **Capture** | `:31174` landing |

### Beat 2 · Same citizen on the phone (0:20 – 0:26)

| | |
| --- | --- |
| **Picture** | **Clip 6s (Flutter).** Phone PIP, already on **Home** as Priya (skip login screen). Tap **My Family** (1s) → tap **Apply** hub (2s). Web home stays in the background. |
| **On-screen** | `Same identity · web and mobile` |
| **Voice-over** | *The same identity is on her phone. Home, family, apply — one citizen, two surfaces.* |
| **Capture** | Flutter app, Priya profile **pre-selected in a debug/build so the picker is never filmed**. |

### Beat 3 · Language and search (0:26 – 0:38)

| | |
| --- | --- |
| **Picture** | **Clip 6s.** Search `pension` → cards. Clear. Type `વૃદ્ધ`. Same pensions. Toggle EN ↔ GU. |
| **On-screen** | `English and Gujarati · same results` |
| **Voice-over** | *She searches in English. She searches in Gujarati. The service list does not change because the language did.* |
| **Capture** | Citizen home search |

### Beat 4 · Why you qualify (0:38 – 0:50)

| | |
| --- | --- |
| **Picture** | **Still 3s + clip 5s.** Recommended cards. Expand: `✓ Age  ✓ Income  ✓ Caste` + explanation line. |
| **On-screen** | `Eligibility with reasons` |
| **Voice-over** | *The platform does not wait for her to know a scheme’s name. Eligibility has already been run on the family record. She is not told only that she qualifies. She is shown why.* |
| **Capture** | Citizen recommendations |

### Beat 5 · CAF + vault (0:50 – 1:02)

| | |
| --- | --- |
| **Picture** | **Clip 8s.** Apply Now → CAF. Personal details pre-filled. Income pre-filled. Vault chip: Aadhaar already on file. **Do not submit.** |
| **On-screen** | `Common Application Form` · `Document vault` |
| **Voice-over** | *One common application. Name, income, and documents she has already given are reused. The State stops asking the citizen to photocopy her own life.* |
| **Capture** | `/apply/caf` |

---

## ACT II — The family (1:02 – 1:26)

### Beat 6 · Family as the unit of welfare (1:02 – 1:14)

| | |
| --- | --- |
| **Picture** | **Clip 7s.** Citizen My Family list → **cut** to Family Portal tree (Patel household, deceased overlay, eligibility cards). |
| **On-screen** | `Family is the unit of welfare` |
| **Voice-over** | *Digital Gujarat 2.0 does not treat the applicant as a lone file. The household is the record of truth — members, income, relationships, life events.* |
| **Capture** | `:31174/my-family` · family portal `:31175` |

### Beat 7 · Consent you can revoke (1:14 – 1:26)

| | |
| --- | --- |
| **Picture** | **Clip 7s.** OTP to open an adult member profile → My Consents → revoke → row greys **immediately**. |
| **On-screen** | `Consent is operational` |
| **Voice-over** | *A living adult’s profile opens only with consent. Consent is not a PDF clause. It is a control the citizen can revoke — and the system complies at once.* |
| **Capture** | `/my-family` · `/my-consents` |

---

## ACT III — The officer (1:26 – 2:00)

### Beat 8 · One inbox, two engines (1:26 – 1:44)

| | |
| --- | --- |
| **Picture** | **Clip 10s.** Login `talati` → `/tasks`. Green `FLW-` caste task **and** blue `DGT-` marriage task. SLA badge on Priya’s caste file. Approve. 2s architecture panel: Flowable vs DIGIT counts. |
| **On-screen** | `Flowable + DIGIT workflow · one queue` |
| **Voice-over** | *The Talati does not run two products. Caste certificates move on Flowable. Marriage certificates move on DIGIT’s workflow engine. She sees one queue, one SLA, one decision.* |
| **Capture** | `:31173/tasks` · Arch panel |

### Beat 9 · Assist the officer (1:44 – 2:00)

| | |
| --- | --- |
| **Picture** | **Clip 8s.** Generate Note from the live file. Clarification reply. Grievance OPEN → ACKNOWLEDGED. |
| **On-screen** | `Assisted note · two-way clarification` |
| **Voice-over** | *The note is drafted from the application in front of her. Missing information is asked on the same screen. A grievance is a thread: acknowledged, answered, closed — not a black box.* |
| **Capture** | Task card · clarifications · `/grievances` |

---

## ACT IV — The State finds the citizen (2:00 – 2:32)

### Beat 10 · Identification (2:00 – 2:16)

| | |
| --- | --- |
| **Picture** | **Clip 8s.** `dept_admin` → `/schemes` → Run Identification Scan → counts. Beneficiaries: reason chips → Confirm. Super: `Recorded from the live cluster`. |
| **On-screen** | `Population identification` |
| **Voice-over** | *A department defines a scheme. The engine runs it against the family registry. Qualifying citizens are identified with reasons in the open — not inside an opaque model.* |
| **Capture** | `:31173/schemes` · `/beneficiaries` |

### Beat 11 · Coverage, fairness, fraud (2:16 – 2:32)

| | |
| --- | --- |
| **Picture** | **Montage 10s.** Coverage drill-down district → taluka. Caste/gender vs benchmark + flag. Fraud card with **named rule** (`MULTI_SCHEME_OVERLAP`). Simulator slider (2s). |
| **On-screen** | `Coverage · fairness · explainable fraud` |
| **Voice-over** | *Leadership can see who is covered and who is missing. Every fraud flag names the rule that fired. Every override is audited. Before notification, the department can test a change in the ceiling.* |
| **Capture** | `/coverage` · `/fraud-signals` · `/scheme-simulator` |

---

## ACT V — Form Builder (2:32 – 2:54)  ★ closing punch

### Beat 12 · Design once, render once, publish (2:32 – 2:54)

| | |
| --- | --- |
| **Picture** | **Clip 14s, do not rush.** `/form-builder`: locked palette → field on canvas → **live citizen preview**. Cut to `/form-definitions`: Approve → Publish. Smash-cut to citizen **published form** `/apply/:serviceId` — **same fields, same order**. Hold 1.5s on the citizen form after VO line ends. |
| **On-screen** | `Controlled government palette` · `One Form Definition` · `Publish to the citizen` |
| **Voice-over** | *Departments do not wait for a vendor to draw the next form. They compose from a locked government palette. What the officer designs is what the citizen sees. Draft. Submit. Approve. Publish. The service is live on the same platform the evaluator is watching.* |
| **Capture** | `:31173/form-builder` · `/form-definitions` · citizen published apply |

**Director’s note:** If time is slipping, **shorten Act IV montage**, never this beat.

---

## END CARD (2:54 – 3:00)

| | |
| --- | --- |
| **Picture** | Four-up freeze: Priya home · Flutter phone · Talati queue · Form Builder preview. Wordmark. |
| **On-screen** | `Digital Gujarat 2.0` · `Citizen · Officer · Family · Platform` · `Flowable + DIGIT` |
| **Voice-over** | *Not five services on a portal. A platform: two engines, one family record, explainable eligibility, and forms the State owns. That is Digital Gujarat 2.0.* |

---

## Full English voice-over (one take)

*Pause half a beat at each ¶. Total ≈ 3:00 with picture.*

Six crore citizens. Hundreds of schemes. Two government workflow engines. The evaluation question is simple: can the State find the family — before the family has to find the State?

Priya Patel is an ASHA worker in Bavla. She does not register. She authenticates. The family registry already holds her record. Digital Gujarat 2.0 lets her use it.

The same identity is on her phone. Home, family, apply — one citizen, two surfaces.

She searches in English. She searches in Gujarati. The service list does not change because the language did.

The platform does not wait for her to know a scheme’s name. Eligibility has already been run on the family record. She is not told only that she qualifies. She is shown why.

One common application. Name, income, and documents she has already given are reused. The State stops asking the citizen to photocopy her own life.

Digital Gujarat 2.0 does not treat the applicant as a lone file. The household is the record of truth — members, income, relationships, life events.

A living adult’s profile opens only with consent. Consent is not a PDF clause. It is a control the citizen can revoke — and the system complies at once.

The Talati does not run two products. Caste certificates move on Flowable. Marriage certificates move on DIGIT’s workflow engine. She sees one queue, one SLA, one decision.

The note is drafted from the application in front of her. Missing information is asked on the same screen. A grievance is a thread: acknowledged, answered, closed — not a black box.

A department defines a scheme. The engine runs it against the family registry. Qualifying citizens are identified with reasons in the open — not inside an opaque model.

Leadership can see who is covered and who is missing. Every fraud flag names the rule that fired. Every override is audited. Before notification, the department can test a change in the ceiling.

Departments do not wait for a vendor to draw the next form. They compose from a locked government palette. What the officer designs is what the citizen sees. Draft. Submit. Approve. Publish. The service is live on the same platform the evaluator is watching.

Not five services on a portal. A platform: two engines, one family record, explainable eligibility, and forms the State owns. That is Digital Gujarat 2.0.

---

## Shot list (14 assets)

| # | Dur | What | Must show | Must not show |
| --- | --- | --- | --- | --- |
| S01 | 4s | Landing + GU toggle | Emblem, language switch | Empty marketing scroll |
| S02 | 6s | Aadhaar + OTP → Priya | Name populated | Password fields |
| S03 | 6s | Flutter PIP | Home, Family, Apply tabs | Demo profile list |
| S04 | 6s | Search pension / વૃદ્ધ | Same cards | Failed search |
| S05 | 8s | Recommendations | Three chips + why | Model names (Gemma/Ollama) |
| S06 | 8s | CAF + vault | Prefill, vault chip | Submit / 500 |
| S07 | 7s | Family list → tree | Household + deceased mark | Unrelated families |
| S08 | 7s | Consent revoke | Instant grey | OTP secret |
| S09 | 10s | Dual-engine queue | FLW- and DGT- + Approve | Wrong role |
| S10 | 8s | Note + grievance | Generate Note, ACK | Empty queue |
| S11 | 8s | Identification | Scan result + chips | Empty schemes |
| S12 | 10s | Coverage / fraud / sim | Named fraud rule | Unexplained red charts |
| S13 | 14s | **Form Builder close** | Palette, preview, publish, citizen form | Technical clone APIs |
| S14 | 6s | End four-up | Phone + three web surfaces | Credits crawl |

**Flutter capture protocol**
1. Launch app, select Priya **before** record.
2. Start recording on Home.
3. Three taps only: Family → back → Apply.
4. Crop to device frame; no laptop chrome.

---

## Claims allowed vs forbidden (evaluators)

| Allowed on VO / supers | Forbidden |
| --- | --- |
| Working evaluation build on cluster | Production go-live / statewide rollout |
| Aadhaar-ref + OTP **on web** (demo OTP) | Live UIDAI eKYC |
| Same citizen on Flutter | “Mobile OTP login” |
| Flowable + DIGIT in one officer queue | “We replaced DIGIT” |
| Explainable eligibility chips | “AI decides benefits” |
| Form Builder publish to citizen | Form.io / vendor lock-in |
| Identification against family registry | Exact statewide population as production fact |

---

## Pre-record (T−60)

```bash
kubectl get pods -n citizen | grep -v Running | grep -v Completed
./demo_reset.sh
# Priya caste task SLA amber/red (DEMO_SCRIPT.md)
# Schemes seeded; identification scan succeeds
# Form Builder: one draft ready to submit/publish
```

| Role | URL | Login |
| --- | --- | --- |
| Priya (web) | `:31174` | `XXXX-XXXX-1001` · OTP `123456` |
| Talati | `:31173` | `talati` / `officer123` |
| Dept Admin | `:31173` | `dept_admin` / `officer123` |
| Family tree | `:31175` | staff search Patel / Bavla |
| Flutter | local run | Priya **pre-selected** |

---

## If the cut overruns

Trim in this order: S12 simulator (drop 3s) → S10 grievance (drop 2s) → S07 tree hold (drop 2s). **Never trim S13 (Form Builder) or S03 (Flutter).**
