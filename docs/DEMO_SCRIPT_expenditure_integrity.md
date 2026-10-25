# Expenditure Integrity: demo script (about 17 minutes)

Audience: department heads and finance. Message: **"We find money that should not have been paid, we stop it before it goes out, and we can show it was fixed."**
Everything runs on the presenter's laptop with synthetic data. Say so once, early.

## Before you start (5 minutes, do it the day before and again an hour before)
1. Rancher Desktop is running; `kubectl -n citizen get pods` shows everything Running. Wait a minute after any restart: the local port-forwards flap.
2. Open `http://localhost:31173` and sign in as **dept.admin**. Keep a second window signed in as **senior.mgmt** and a third as **scheme.dept**. Passwords: `docs/PROJECT_PLAN.md`.
3. Check the numbers on **Money Overview** match this script: open alerts **447** (184 beneficiary, 263 payroll), flagged **₹5,20,000**, confirmed and recovered **₹9,65,000**, stopped before payment **₹68,000**, verified closed **124**, waiting to be verified **19**, flagged again **13.6%**, days to correct **6.6**. If open alerts are not 447, someone ran detection: see "Put it back" at the end.
4. Do **not** press **Run detection** during the demo. It adds about 20 new alerts to the data and changes every figure.
5. Have the file `docs/demo/demo_payment_file.csv` ready on the desktop.
6. Optional segment 9 needs the approval threshold lowered; skip it unless you have rehearsed it.

## The story in one line each
Detect (rules) → Understand (timeline, person view) → Prevent (pre-payment gate) → Decide and notify (case, notice, appeal) → Fix and check (outcome, verify) → Prove it to leaders (money overview).

---

## 1. Open with the money (2 min) — signed in as senior.mgmt
**Page:** Money Overview (first item in senior management's sidebar; they land on Platform Analytics after sign-in, so click it).
**Say:** "This is what a Secretary sees. Flagged and still open: ₹5.2 lakh. Confirmed overpaid: ₹9.65 lakh, and all of it has a recovery recorded. Stopped before payment: ₹68,000. Totals only; no name appears on this page."
**Show:** the four top figures; the map (click a district, show open alerts and money); the monthly chart (toggle Flagged, Confirmed, Recovered, Stopped); the "Flagged counts every alert raised…" note under it.
**If asked "is ₹9.65 lakh real?":** "It is the pilot's synthetic data. The method is what we are showing; the figure projects only if you set the pilot's share of state spend, and then it is labelled an estimate."
**Estimate line:** below the totals there is a card for "pilot result projected to the state". It stays hidden until the pilot's share of state spend is set, and when shown it is labelled an estimate, not a finding. Mention it; do not set it for the demo.
**Point out:** "Safeguards": 88 adverse decisions, 0 overturned so far, notices issued and appeals. "How reliable each check is" shows the share of rulings that were real overpayments; rows with few rulings say so.

## 2. Three real cases (3 min) — switch to dept.admin, open Guided Story
**Page:** Guided Story (sidebar). Use Next through the four steps.
1. **A student is paid more than the scheme allows** (MYSY): "Pooja Desai is entitled to ₹10,000 but ₹20,000 was paid." Show the timeline: the entitlement bar and two payments outlined in red, which are the records the alert is about.
2. **Two offices pay the same salary** (S01): "DDO-A and DDO-B both paid the Demo Transfer Officer for the same 31 days." The two pay bars stack on top of each other, and the transfer order sits between them.
3. **Pay carries on after a status change** (S02): the status date and the August pay after it are marked. This case is already ruled on and verified, so it shows the loop closing.
4. **What the pilot found**: the one-page summary. Click **Print this page** if you want a handout.
**Say:** "Every flag comes from a plain rule that an auditor can read. There is no black box."

## 3. Work a case (3 min) — click "Open this case" on step 1
**Page:** Expenditure Integrity, with the case open.
**Show, top to bottom:** the plain-language summary, the **Timeline**, the **Evidence** in words (no record ids), **Download case file** (opens a print-ready A4 page with evidence, decision and audit trail), **All alerts for this person**.
**Do (this changes data; see "Put it back"):** pick **Confirmed overpayment**, type a reason, **Save decision**. Then **Record an outcome → Recovery**. Say: "Nothing here calls a payment system; it records the outcome and a reference."
**Then:** the case moves to *outcome recorded*, and a **Check that the fix holds** box appears: type "Treasury receipt seen" and **Verify closed**.
**Alternative with no change to the data:** open one of the four cases already waiting for verification (Rule 802 Amir Shah, Rule 802 Kinjal Koli, Rule 803 Hitesh Thakor, Rule 803 Taraben Gamit) and just do the **Verify closed** step.

## 4. Work on the right cases first (1 min)
**Page:** the Beneficiary inbox, top of the list.
**Say:** "The inbox ranks by expected recovery: the amount at stake times how often that check has proved right. Hover over the ₹ figure for the reason. A star means we are using the overall hit rate because that check has few rulings yet."

## 5. Fair to the person affected: notice and appeal (2 min) — as dept.admin
**Page:** open the closed case **Bhavnaben Nayka** (Rule 805) with this address: `http://localhost:31173/expenditure-integrity?domain=beneficiary&case=f261e97f-1749-5c0c-9f55-a7dec5af144a`
**Show:** the **Draft notice** section. The letter is a fixed template filled from the case: the person, the scheme, the reason the officer wrote, a date to respond by (15 days) and an appeal paragraph. Click **Gujarati**. Edit a word to show the officer can adjust it. Point to **Copy** and **Print**.
**Say:** "Nothing is sent from the system. The officer reviews the letter and sends it. The Gujarati template is a draft that still needs a language review before real use."
**Then:** point to **Reopen on appeal** (department admin only, with a required reason): "If the person appeals, the case goes back under review, the history stays, and a new decision can overturn the old one. The overview counts overturned decisions, so the safeguards are measured."
**Do not click** Mark as issued or Reopen case unless you want to change the data (see "Put it back").

## 6. Stop it before it is paid (3 min) — Pre-payment gate tab
**Page:** Expenditure Integrity → **Pre-payment gate**.
**Do:** **Screen a payment file** → choose `demo_payment_file.csv` (5 lines, ₹8,200).
**Result you will see:** 4 held (₹7,700) and 1 for review.
- Line 1, Meera Rathod: already paid for the period, over her entitlement.
- Line 2, Kavita Rathod: payment after a recorded death.
- Line 3, Sunita Parmar: holds two schemes that cannot be combined.
- Line 4: no bank reference given (review).
- Line 5: unknown entitlement.
**Say:** "A detected overpayment still has to be chased; a held payment is simply saved." Click **Confirm hold** on two lines. On one, **Release…**, type a reason, and show that release needs one.
**Then:** open Money Overview and show "Stopped before payment" went up.
**Note:** this adds a payment file to the data. See "Put it back".

## 7. One person, both worlds (1 min)
**Page:** the inbox → search **Meera**, click the name → **Person view**.
**Say:** "Meera appears as a beneficiary and as an employee. Beneficiary alerts and payroll alerts are in one place." Then sign in as **scheme.dept** in the other window and open the same person: **the payroll column is not there**. "Payroll shows individual salaries, so only payroll roles see it."
**Use Meera or Vimal only.** Do not open the person view on the story cases: the demo alerts carry stale person ids and the panel will not show the alert you came from.

## 8. Data and trust (2 min) — Data page and What if
- **Data → Data readiness:** "How complete is each feed? Units missing taluka, settlements missing a bank reference, employees with no service order. This tells departments what data to supply." Click a **Load data** link: it jumps to the right upload card.
- **Data → Load data:** eight CSV feeds, each accepted whole or refused whole with the line number. Show the **Download template** button on a card. The newest card is **Death and status records**: after an upload it reports how many people have a payment after the recorded death, so the next payment can be held (the pre-payment gate in segment 6 uses the same records). Do not upload during the demo.
- **Expenditure Integrity → What if:** change the shared-bank minimum from 4 to 6 and the bank-change threshold from 5 to 8, **Run**: "804 would drop from 13 alerts to 0." "We can test a rule change on the data before applying it. Nothing is saved."

## 9. Optional: a second officer approves a big recovery (2 min, rehearse first)
Recoveries of ₹1,00,000 or more need a second person. The demo cases are ₹10,000, so lower the limit for the demo:
`kubectl -n citizen set env deploy/expenditure-integrity-service OFFICER_INTEGRITY_RECOVERY_APPROVAL_THRESHOLD=5000` (wait for the pod to restart, about 30 seconds).
Record a recovery as **dept.admin**: it shows *Waiting for approval*. Try **Approve** as the same user: refused. Sign in as **dept.admin2** and click **Approve recovery**.
**Put it back straight after:** `kubectl -n citizen set env deploy/expenditure-integrity-service OFFICER_INTEGRITY_RECOVERY_APPROVAL_THRESHOLD-`

## 10. Close (1 min)
"Detect, understand, prevent, decide, fix, and prove it. The same ideas apply to any scheme or payroll. This pilot used two use cases; the rules and the screens are reusable."

---

## If they ask
- **Can it pay or recover money?** No. It records outcomes and holds. A payment system integration is a later step.
- **Is a flag a finding against a person?** No. The wording says "records need checking". A notice, a response window and an appeal path exist, and the overview reports how often decisions are overturned.
- **Is the data real?** Synthetic, generated for the pilot. Stakeholder answers on grace periods and mutual exclusions are working assumptions listed in `docs/EXPENDITURE_INTEGRITY_ASSUMPTIONS.md`.
- **Security?** Roles are enforced on the server for every screen: payroll cases only for payroll roles, senior management sees totals only. Other platform services are open in this local demo build and would be locked down before any shared use.
- **Gujarati notices?** Templates exist in English and Gujarati; the Gujarati needs a language review before real use.
- **Why do a few checks show 25 to 40% precision?** They have only 4 to 7 rulings so far, and the page says "few rulings". Payroll checks have 18 to 21 rulings and show 62 to 72%.

- **Is there a check that links payroll to beneficiaries?** Yes: rule 807 compares an employee's pay with a scheme's income limit, using a link between the employee record and the beneficiary. It shows only a pay band, never a salary. It is not part of the live demo because it needs that link loaded.
- **Can the rules be tuned?** Yes: the What-if tab shows the effect of a threshold change before it is applied, and the Rule health table shows which checks are reliable.

## If something goes wrong
- **A page will not load right after a restart:** wait a minute and refresh; the port-forwards reconnect.
- **Signed out:** sign in again; tokens last a day.
- **A figure looks different:** someone ran detection or changed a case. See below.
- **A screen is slow:** the data is small, so a slow page usually means the laptop is busy; close other heavy apps.

## Put it back after the demo (so the next run starts from the same numbers)
Run in a terminal. Open alerts should be 447 afterwards, and the payment file and the case you worked go back to how they started. If you clicked Mark as issued or Reopen case in segment 5, reset Bhavnaben Nayka's case (`f261e97f-1749-5c0c-9f55-a7dec5af144a`) to CLOSED with its original verification, and delete its `case_notice` row and the audit rows from today.
1. **Payment file from segment 6:** `kubectl -n citizen exec deploy/postgres -- psql -U citizenuser -d citizen_db -c "delete from expenditure_integrity.payment_batch_line where batch_id in (select id from expenditure_integrity.payment_batch where name not like 'Demo payment file%'); delete from expenditure_integrity.payment_batch where name not like 'Demo payment file%';"`
2. **Case you decided and recorded in segment 3:** it was an open alert. Reset its case and alert: set the case to `OPEN` with no classification or decision, the alert to `OPEN`, and delete the action and audit rows created today for that case. (Keep the case id you used; two minutes with `psql`.) If you used the *verify only* alternative, set the case back to `ACTION_RECORDED` and clear `verified_at`, `verified_by` and `verification_note`.
3. **If someone ran detection:** delete the alerts and cases with `detected_at` after the demo started and status `OPEN` (the earlier runs added about 22: 13 shared-bank and 9 eligibility alerts).
4. **Check:** Money Overview shows 447 open alerts, ₹68,000 stopped, 124 verified, 19 waiting.
