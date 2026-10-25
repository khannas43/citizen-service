# DG 2.0 — Evaluator Film · Production Script for Editor & Capture

**Film:** *Digital Gujarat 2.0 — One Family. One Platform. One State.*  
**Finished length:** **3:00.00**  
**Audience:** Government evaluators  
**VO:** English, recorded separately, laid under picture  
**On-screen language:** Product UI may be Gujarati; supers in English  
**Picture source:** Screen recordings + Flutter device recording, captured across **multiple sessions**  
**Creative lock:** [`DG20_Three_Month_Video_Storyboard.md`](./DG20_Three_Month_Video_Storyboard.md)

This document is the **edit bible**. Each shot can be recorded on a different day. The editor never needs the live cluster — only the files named below.

---

## 1. How work is split

| Person | Does | Does not |
| --- | --- | --- |
| **Capture (product / demo owner)** | Log in, put the screen in the start state, record **handles**, export files with the names in §4 | Cut the film, write VO, add music |
| **Voice talent** | Read §6 in one or two takes, dry, no music | Ad-lib product claims |
| **Video maker (editor)** | Assemble to the master timeline in §3, supers, PIP, grade, mix, export | Re-record portals unless a shot is unusable |

**Rule:** Record **3–5× longer** than the used duration. Editor trims. Never stop the recording in the middle of a click.

---

## 2. Delivery specs (editor)

| Spec | Value |
| --- | --- |
| Master | 1920×1080, 30 fps, 16:9 |
| Picture | ProRes 422 HQ **or** high-bitrate H.264 (source clips) |
| Colour | Rec.709 · citizen shots slightly warm · officer shots slightly cool |
| VO | WAV 48 kHz 24-bit, mono or stereo identical · −3 dBTP · −16 LUFS |
| Music | Bed under VO at −18 to −22 LUFS; duck 3–4 dB when VO speaks |
| UI sound | **Mute all** portal/Flutter audio in the cut (keep 2–3 soft clicks max in Act III approve) |
| Burned-in cursor | **On** for web clips |
| Safe area | Keep lower-thirds in bottom 180 px; don’t cover primary buttons |
| Export | H.264 20 Mbps + a ProRes/master copy |

**PIP (Flutter):** 1080×1920 (or device native) scaled into a **390×844** phone frame, **right third**, drop shadow, 16 px radius. Start PIP at **00:20:00**, end at **00:26:00**. Web home remains visible on the left.

---

## 3. Master timeline (editor)

Timecode = **finished film**. VO lines are the **only** spoken words.

| TC in | TC out | Dur | Seq | Picture | VO (see §6 line #) |
| --- | --- | --- | --- | --- | --- |
| 00:00:00 | 00:00:10 | 10s | A | **A1** landing + GU toggle, 4s freeze on Gujarati hero | L1 |
| 00:00:10 | 00:00:20 | 10s | B | **B1** Aadhaar → OTP → Priya home | L2 |
| 00:00:20 | 00:00:26 | 6s | C | **C1** Flutter PIP over frozen/slow web home | L3 |
| 00:00:26 | 00:00:38 | 12s | D | **D1** search `pension` / `વૃદ્ધ` + language toggle | L4 |
| 00:00:38 | 00:00:50 | 12s | E | **E1** still of cards 3s + **E2** expand chips | L5 |
| 00:00:50 | 00:01:02 | 12s | F | **F1** CAF steps + vault chip | L6 |
| 00:01:02 | 00:01:14 | 12s | G | **G1** My Family 5s · smash **G2** family tree 7s | L7 |
| 00:01:14 | 00:01:26 | 12s | H | **H1** profile OTP · **H2** consent revoke | L8 |
| 00:01:26 | 00:01:44 | 18s | I | **I1** task queue FLW+DGT, SLA, Approve · **I2** 2s dual-engine panel | L9 |
| 00:01:44 | 00:02:00 | 16s | J | **J1** Generate Note · **J2** clarification · **J3** grievance ACK | L10 |
| 00:02:00 | 00:02:16 | 16s | K | **K1** identification scan + beneficiary chips | L11 |
| 00:02:16 | 00:02:32 | 16s | L | **L1** coverage 5s · **L2** fraud 6s · **L3** simulator 5s | L12 |
| 00:02:32 | 00:02:54 | 22s | M | **M1** builder 9s · **M2** governance 5s · **M3** citizen form 8s | L13 |
| 00:02:54 | 00:03:00 | 6s | N | **N1** four-up end card | L14 |

**Transitions:** 8–12 frame dissolves between acts; **hard cuts** inside an act except G1→G2 and M2→M3 (smash cuts).

**Lower-thirds:** fade in 8 frames after shot starts, hold, fade out 8 frames before shot ends. Font: Noto Sans / same as portals if available. English only.

---

## 4. File naming (capture must use this)

```text
DG20_A1_landing_gu.mov
DG20_B1_web_login_priya.mov
DG20_C1_flutter_home_family_apply.mov
DG20_D1_search_bilingual.mov
DG20_E1_recs_wide.jpg          (or .mov freeze)
DG20_E2_recs_expand_chips.mov
DG20_F1_caf_vault.mov
DG20_G1_my_family_list.mov
DG20_G2_family_portal_tree.mov
DG20_H1_member_profile_otp.mov
DG20_H2_consent_revoke.mov
DG20_I1_officer_tasks_approve.mov
DG20_I2_dual_engine_panel.mov
DG20_J1_generate_note.mov
DG20_J2_clarification_reply.mov
DG20_J3_grievance_ack.mov
DG20_K1_scan_beneficiaries.mov
DG20_L1_coverage_drill.mov
DG20_L2_fraud_named_rule.mov
DG20_L3_simulator_slider.mov
DG20_M1_form_builder_palette.mov
DG20_M2_governance_publish.mov
DG20_M3_citizen_published_form.mov
DG20_N1_endcard_still.jpg      (editor may build from stills of B1/C1/I1/M1)
DG20_VO_takeXX.wav
```

If a take is bad: `DG20_B1_web_login_priya_TAKE02.mov`. Editor uses highest TAKE number unless labelled `_USE`.

---

## 5. Capture sessions (different days are expected)

Record in any order. Each session is **self-contained**.

| Session | Shots | Logins | Notes |
| --- | --- | --- | --- |
| **S-CIT-1** | A1, B1, D1, E1, E2, F1 | Priya web | Browser 1920×1080, hide bookmarks |
| **S-CIT-2** | G1, H1, H2 | Priya web | Family + consents |
| **S-FAM** | G2 | Family portal | Patel / Bavla tree |
| **S-MOB** | C1 | Flutter Priya **already open** | Never film profile picker |
| **S-OFF-1** | I1, I2, J1, J2, J3 | `talati` | Need FLW **and** DGT tasks visible |
| **S-OFF-2** | K1, L1, L2, L3 | `dept_admin` | Schemes must be seeded |
| **S-FB** | M1, M2, M3 | officer with Builder access + Priya | One draft ready to publish |

**Browser:** Chrome, 100% zoom, fullscreen. Hide OS clock if it shows a wrong date. Cursor size default.

**URLs (cluster demo):**

| Surface | URL |
| --- | --- |
| Citizen | `http://localhost:31174/` |
| Officer | `http://localhost:31173/` |
| Family | `http://localhost:31175/` |

If capturing on LAN, substitute the machine IP; **do not** show the address bar in the finished film (editor crops 64 px from top **or** capture with address bar hidden).

---

## 6. Voice-over cue sheet (editor sync)

Record dry. Talent: even pace, documentary, not a commercial.

| ID | Approx film TC | Text |
| --- | --- | --- |
| **L1** | 0:00–0:10 | Six crore citizens. Hundreds of schemes. Two government workflow engines. The evaluation question is simple: can the State find the family — before the family has to find the State? |
| **L2** | 0:10–0:20 | Priya Patel is an ASHA worker in Bavla. She does not register. She authenticates. The family registry already holds her record. Digital Gujarat 2.0 lets her use it. |
| **L3** | 0:20–0:26 | The same identity is on her phone. Home, family, apply — one citizen, two surfaces. |
| **L4** | 0:26–0:38 | She searches in English. She searches in Gujarati. The service list does not change because the language did. |
| **L5** | 0:38–0:50 | The platform does not wait for her to know a scheme’s name. Eligibility has already been run on the family record. She is not told only that she qualifies. She is shown why. |
| **L6** | 0:50–1:02 | One common application. Name, income, and documents she has already given are reused. The State stops asking the citizen to photocopy her own life. |
| **L7** | 1:02–1:14 | Digital Gujarat 2.0 does not treat the applicant as a lone file. The household is the record of truth — members, income, relationships, life events. |
| **L8** | 1:14–1:26 | A living adult’s profile opens only with consent. Consent is not a PDF clause. It is a control the citizen can revoke — and the system complies at once. |
| **L9** | 1:26–1:44 | The Talati does not run two products. Caste certificates move on Flowable. Marriage certificates move on DIGIT’s workflow engine. She sees one queue, one SLA, one decision. |
| **L10** | 1:44–2:00 | The note is drafted from the application in front of her. Missing information is asked on the same screen. A grievance is a thread: acknowledged, answered, closed — not a black box. |
| **L11** | 2:00–2:16 | A department defines a scheme. The engine runs it against the family registry. Qualifying citizens are identified with reasons in the open — not inside an opaque model. |
| **L12** | 2:16–2:32 | Leadership can see who is covered and who is missing. Every fraud flag names the rule that fired. Every override is audited. Before notification, the department can test a change in the ceiling. |
| **L13** | 2:32–2:54 | Departments do not wait for a vendor to draw the next form. They compose from a locked government palette. What the officer designs is what the citizen sees. Draft. Submit. Approve. Publish. The service is live on the same platform the evaluator is watching. |
| **L14** | 2:54–3:00 | Not five services on a portal. A platform: two engines, one family record, explainable eligibility, and forms the State owns. That is Digital Gujarat 2.0. |

**Banned on VO:** Gemma, Ollama, mockup, production go-live, UIDAI, DigiLocker, WhatsApp, “AI decides”, “we replaced DIGIT”.

---

## 7. Graphics package (editor builds)

| Code | Text | Style |
| --- | --- | --- |
| LT-A | `DIGITAL GUJARAT 2.0` / `A working evaluation build` | Title card, centered |
| LT-B | `Aadhaar + OTP` · `No new registration` | Lower third |
| LT-C | `Same identity · web and mobile` | Lower third |
| LT-D | `English and Gujarati · same results` | Lower third |
| LT-E | `Eligibility with reasons` | Lower third |
| LT-F | `Common Application Form` · `Document vault` | Lower third |
| LT-G | `Family is the unit of welfare` | Lower third |
| LT-H | `Consent is operational` | Lower third |
| LT-I | `Flowable + DIGIT workflow · one queue` | Lower third |
| LT-J | `Assisted note · two-way clarification` | Lower third |
| LT-K | `Population identification` | Lower third |
| LT-L | `Coverage · fairness · explainable fraud` | Lower third |
| LT-M | `Controlled government palette` · `Publish to the citizen` | Lower third |
| LT-N | `Citizen · Officer · Family · Platform` · `Flowable + DIGIT` | End card |
| BUG-K | `Recorded from the live cluster` | 2s, top-right, 70% opacity, only over K1 |

---

## 8. Shot sheets (capture + edit)

Each sheet: **used duration** is what the editor keeps. **Record** at least the handle length.

---

### A1 — Landing + Gujarati toggle

| Field | Detail |
| --- | --- |
| **File** | `DG20_A1_landing_gu.mov` |
| **Used** | 10s (loop or slow last 4s) |
| **Record** | 25–40s |
| **Portal** | Citizen · logged **out** |
| **URL** | `/` landing |
| **Login** | None |
| **Start frame** | Hero of Digital Gujarat landing, **English**, Citizen login panel visible |
| **Action** | 1) Hold 3s. 2) Click language control to **ગુજરાતી**. 3) Hold 5s on Gujarati hero. 4) Optional: move cursor to Citizen tab (do not log in). |
| **Must see** | Wordmark/hero, EN→GU chrome flip |
| **Must not** | Officer login filled, errors |
| **Edit** | Under **L1**. Title super LT-A first 4s then fade. |
| **Grade** | Warm |

---

### B1 — Web login to Priya home

| Field | Detail |
| --- | --- |
| **File** | `DG20_B1_web_login_priya.mov` |
| **Used** | 10s |
| **Record** | 30–45s |
| **Portal** | Citizen |
| **URL** | `/` |
| **Login** | Aadhaar `XXXX-XXXX-1001` · OTP `123456` |
| **Start frame** | Citizen login tab active, Aadhaar field empty |
| **Action** | 1) Type Aadhaar (or paste). 2) Continue. 3) Type OTP. 4) Sign in. 5) **Hold 4s** on Home: name **Priya Patel**, family summary visible. |
| **Must see** | Name on home after login |
| **Must not** | Failed OTP, “Aadhaar not found” |
| **Edit** | Under **L2**. Crop address bar. LT-B. |
| **Grade** | Warm |

---

### C1 — Flutter PIP

| Field | Detail |
| --- | --- |
| **File** | `DG20_C1_flutter_home_family_apply.mov` |
| **Used** | 6s |
| **Record** | 20s |
| **App** | `citizen-mobile` Flutter |
| **Login** | **Before record:** select Priya Patel so Home is showing. **Never record the demo list.** |
| **Start frame** | Home tab, Priya’s name visible |
| **Action** | 1) Hold 1.5s Home. 2) Tap **My Family**. Hold 1.5s. 3) Back. 4) Tap **Apply**. Hold 2s. |
| **Must see** | Bottom nav: Home / Family / Apply |
| **Must not** | Profile picker, debug banners (`DEBUG`), laptop desktop |
| **Edit** | Under **L3**. Phone bezel right. Left: freeze last frame of **B1**. LT-C. |
| **Audio** | Mute Flutter |

---

### D1 — Bilingual search

| Field | Detail |
| --- | --- |
| **File** | `DG20_D1_search_bilingual.mov` |
| **Used** | 12s |
| **Record** | 40s |
| **Portal** | Citizen Home (Priya logged in) |
| **URL** | `/` (authenticated) |
| **Start frame** | Search bar empty, recommendations visible below |
| **Action** | 1) Click search. Type `pension` slowly. 2) Show results / “for your profile”. 3) Clear. 4) Type `વૃદ્ધ`. 5) Same pension services. 6) Toggle EN→GU or GU→EN on the page chrome. |
| **Must see** | Same scheme family in both scripts |
| **Must not** | Empty results |
| **Edit** | Under **L4**. Speed-ramp typing if needed. LT-D. |

---

### E1 / E2 — Recommendations + chips

| Field | Detail |
| --- | --- |
| **Files** | `DG20_E1_recs_wide.jpg` (or freeze) · `DG20_E2_recs_expand_chips.mov` |
| **Used** | E1 3s + E2 9s |
| **Record E2** | 25s |
| **URL** | Citizen Home, scroll to **Recommended for Your Family** |
| **Action E2** | Click/expand **Old Age Pension** or **Widow Pension** (whichever shows chips). Hold on `✓ Age` `✓ Income` `✓ Caste` and the explanation sentence. |
| **Must see** | At least two ticks and a “why” line |
| **Must not** | “No recommendations”, model/vendor names in shot |
| **Edit** | Under **L5**. LT-E. |

---

### F1 — CAF + document vault

| Field | Detail |
| --- | --- |
| **File** | `DG20_F1_caf_vault.mov` |
| **Used** | 12s |
| **Record** | 40s |
| **URL** | From a recommendation **Apply Now**, landing on `/apply/caf` |
| **Action** | 1) Show step progress (step 1). Personal fields **pre-filled**. 2) Next to income / family step — numbers pre-filled. 3) Point cursor at vault chip **Aadhaar already uploaded** (or equivalent). 4) **Stop. Do not submit.** |
| **Must see** | Prefill + vault reuse |
| **Must not** | Validation errors, submit spinner |
| **Edit** | Under **L6**. LT-F. |

---

### G1 — My Family list

| Field | Detail |
| --- | --- |
| **File** | `DG20_G1_my_family_list.mov` |
| **Used** | 5s |
| **Record** | 20s |
| **URL** | `/my-family` |
| **Action** | Slow scroll of Patel members (Priya, spouse, children, elder). Hold on household. |
| **Must see** | Multiple members, relationships |
| **Edit** | First half of **L7**. Smash cut to G2. |

---

### G2 — Family portal tree

| Field | Detail |
| --- | --- |
| **File** | `DG20_G2_family_portal_tree.mov` |
| **Used** | 7s |
| **Record** | 30s |
| **Portal** | Family portal `:31175` |
| **Action** | Open **Patel / Bavla** tree. Pan React Flow canvas. Show deceased overlay if present. Eligibility cards on the side. |
| **Must see** | Interactive tree, not a static org chart screenshot from PowerPoint |
| **Edit** | Second half of **L7**. LT-G across G1–G2. |

---

### H1 — Member profile OTP

| Field | Detail |
| --- | --- |
| **File** | `DG20_H1_member_profile_otp.mov` |
| **Used** | 6s |
| **Record** | 25s |
| **URL** | `/my-family` |
| **Action** | Open a **living adult** member (not self if OTP not required). Complete OTP `123456`. Profile 360 fields appear (masked Aadhaar OK). |
| **Must see** | OTP step then profile |
| **Must not** | Full unmasked Aadhaar if the UI ever shows it — crop/mask in edit |
| **Edit** | First half **L8**. |

---

### H2 — Consent revoke

| Field | Detail |
| --- | --- |
| **File** | `DG20_H2_consent_revoke.mov` |
| **Used** | 6s |
| **Record** | 20s |
| **URL** | `/my-consents` |
| **Action** | Click **Revoke** on one department consent. Row greys / status changes **without reload**. Hold 2s. |
| **Must see** | Instant UI update |
| **Edit** | Second half **L8**. LT-H. |

---

### I1 — Officer dual-engine queue + Approve

| Field | Detail |
| --- | --- |
| **File** | `DG20_I1_officer_tasks_approve.mov` |
| **Used** | 16s |
| **Record** | 45s |
| **Portal** | Officer |
| **URL** | `/tasks` |
| **Login** | `talati` / `officer123` |
| **Pre-roll (off camera)** | Confirm queue shows at least one **FLW-** (caste) and one **DGT-** (marriage). Priya caste task SLA amber or red if possible. |
| **Start frame** | Task list, **TALATI** badge visible |
| **Action** | 1) Slow scroll pointing at green FLW- then blue DGT- badges. 2) Open Priya caste card, show SLA. 3) Click **Approve**. 4) Hold on success / card leaving queue. |
| **Must see** | Both engine prefixes in one list + one decision |
| **Must not** | Empty queue, 500 |
| **Edit** | Under **L9**. LT-I. Keep **one** approve click sound. |

---

### I2 — Dual-engine architecture panel

| Field | Detail |
| --- | --- |
| **File** | `DG20_I2_dual_engine_panel.mov` |
| **Used** | 2s |
| **Record** | 10s |
| **Action** | Open officer **Arch / two-engine** panel showing live Flowable vs DIGIT counts. Hold. |
| **Edit** | Tail of **L9**, cutaway. If panel missing, editor holds I1 badges extra 2s. |

---

### J1 — Generate Note

| Field | Detail |
| --- | --- |
| **File** | `DG20_J1_generate_note.mov` |
| **Used** | 6s |
| **Record** | 20s |
| **URL** | `/tasks` · a remaining application card |
| **Action** | Click **Generate Note**. Modal fills from live data. Hold. **Do not need to save.** |
| **Edit** | Start of **L10**. |

---

### J2 — Clarification reply

| Field | Detail |
| --- | --- |
| **File** | `DG20_J2_clarification_reply.mov` |
| **Used** | 5s |
| **Record** | 20s |
| **Action** | Open clarifications sidebar/thread. Type a short officer reply (English). Send. |
| **Edit** | Middle **L10**. |

---

### J3 — Grievance acknowledge

| Field | Detail |
| --- | --- |
| **File** | `DG20_J3_grievance_ack.mov` |
| **Used** | 5s |
| **Record** | 20s |
| **URL** | `/grievances` |
| **Action** | Open an OPEN grievance. **Acknowledge**. Badge → ACKNOWLEDGED. |
| **Edit** | End **L10**. LT-J over J1–J3. |

---

### K1 — Identification scan + beneficiaries

| Field | Detail |
| --- | --- |
| **File** | `DG20_K1_scan_beneficiaries.mov` |
| **Used** | 16s |
| **Record** | 50s (scan may take several seconds) |
| **Login** | `dept_admin` / `officer123` |
| **URL** | `/schemes` then `/beneficiaries` |
| **Pre-roll** | Schemes list must load (not HTTP 500). |
| **Action** | 1) Select **Old Age Pension** (or any active scheme). 2) **Run Identification Scan**. 3) Hold on result (families scanned / newly identified). 4) Go to Beneficiaries. 5) Show chips `✓ Age · ✓ Income · ✓ Caste`. 6) Click **Confirm** on one row. |
| **Must see** | Numeric scan result + reason chips |
| **Must not** | `Scan failed (HTTP 500)` |
| **Edit** | Under **L11**. LT-K. BUG-K for 2s at scan result. Cool grade. |

---

### L1 — Coverage drill-down

| Field | Detail |
| --- | --- |
| **File** | `DG20_L1_coverage_drill.mov` |
| **Used** | 5s |
| **Record** | 25s |
| **URL** | `/coverage` |
| **Action** | Click a district → taluka (or next level). Map/list updates. |
| **Edit** | First third **L12**. |

---

### L2 — Fraud named rule

| Field | Detail |
| --- | --- |
| **File** | `DG20_L2_fraud_named_rule.mov` |
| **Used** | 6s |
| **Record** | 20s |
| **URL** | `/fraud-signals` |
| **Action** | Open a card whose rule id is visible (e.g. `MULTI_SCHEME_OVERLAP`). Hold on **rule text**, not just a red icon. |
| **Must see** | Named rule |
| **Edit** | Middle **L12**. LT-L. |

---

### L3 — Simulator slider

| Field | Detail |
| --- | --- |
| **File** | `DG20_L3_simulator_slider.mov` |
| **Used** | 5s |
| **Record** | 20s |
| **URL** | `/scheme-simulator` |
| **Action** | Change income ceiling (or one parameter). Projected count / delta updates. |
| **Edit** | End **L12**. **First trim if overrun.** |

---

### M1 — Form Builder palette + preview  ★ hero

| Field | Detail |
| --- | --- |
| **File** | `DG20_M1_form_builder_palette.mov` |
| **Used** | 9s |
| **Record** | 40s |
| **URL** | `/form-builder` |
| **Login** | Officer with a **Builder** `FDS_*` role (or whatever role opens the route). If gated, use a user that can enter `/form-builder`. |
| **Start frame** | Three-pane shell: palette \| canvas \| live preview |
| **Action** | 1) Scroll palette (government widgets). 2) Add or reorder **one** field. 3) Hold on **right pane citizen preview** updating. |
| **Must see** | Palette + live preview together |
| **Must not** | Blank embed, error boundary |
| **Edit** | First part **L13**. Do not speed-ramp this shot. |

---

### M2 — Governance approve / publish

| Field | Detail |
| --- | --- |
| **File** | `DG20_M2_governance_publish.mov` |
| **Used** | 5s |
| **Record** | 25s |
| **URL** | `/form-definitions` |
| **Pre-roll** | A definition already **submitted** in queue (capture can submit off-camera). |
| **Action** | Open detail. **Approve** then **Publish** (or the two clicks the UI actually uses). Hold on published status. |
| **Edit** | Middle **L13**. Smash cut to M3. |

---

### M3 — Citizen published form (same fields)

| Field | Detail |
| --- | --- |
| **File** | `DG20_M3_citizen_published_form.mov` |
| **Used** | 8s (hold last frame 1.5s after VO of L13 ends) |
| **Record** | 25s |
| **Portal** | Citizen, Priya logged in |
| **URL** | `/apply/:serviceId` for the **same** serviceId just published |
| **Action** | Form renderer showing **same fields / same order** as M1 preview. Slow scroll. No submit required. |
| **Must see** | Continuity with M1 (editor may split-screen last 2s: builder preview \| citizen form) |
| **Edit** | End **L13**. LT-M. **Never trim this shot to save time.** |

---

### N1 — End card

| Field | Detail |
| --- | --- |
| **File** | Editor composite from stills of B1, C1, I1, M1 **or** `DG20_N1_endcard_still.jpg` |
| **Used** | 6s |
| **Layout** | 2×2: Priya home · Flutter phone · Talati queue · Form Builder |
| **Super** | LT-N + wordmark |
| **VO** | **L14** |
| **Fade** | Fade to black last 10 frames |

---

## 9. Audio mix (editor)

| Layer | Level |
| --- | --- |
| VO | Hero · −16 LUFS |
| Music | Instrumental, no lyrics, Indian classical / restrained contemporary · −20 LUFS, duck under VO |
| UI | Off, except I1 approve click at −28 dB |
| Flutter | Mute |

Beds: warmer in A–H, cleaner pulse in I–L, resolve open chord on M–N.

---

## 10. Continuity & legal

- Same **Priya Patel** on web and phone.
- Officer shots: **TALATI** for I/J, **DEPT ADMIN** for K/L.
- Mask any full Aadhaar / mobile if UI ever expands it.
- Do not show `officer123` being typed (cut after username or use a logged-in start frame). For I1, **start already on `/tasks`**.
- Watermark optional: none preferred for evaluators.

---

## 11. Editor assembly checklist

1. Lay **VO** on A1 from 00:00:00. Picture follows VO, not the reverse.  
2. Drop clips per §3. Trim with **handles**; don’t cut mid-click.  
3. Add LT-* supers.  
4. Insert C1 PIP 00:20–00:26.  
5. Smash G1→G2 and M2→M3.  
6. Optional 2s split-screen end of M3.  
7. Mix, grade, export 3:00:00.  
8. QC: no HTTP errors, no picker, no passwords, both `FLW-` and `DGT-` readable, Form Builder preview matches citizen form.

**If a clip never arrives:** skip L3 simulator first; **never** skip C1, I1, or M1–M3. For missing I2, extend I1. For missing G2, extend G1 and keep LT-G.

---

## 12. One-page VO (print for talent)

Same as §6 L1–L14, read as fourteen paragraphs with a breath between each.

---

*Capture owners: one session per table in §5. Video maker: this file is sufficient to cut without access to the cluster.*
