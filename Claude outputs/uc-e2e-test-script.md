# End-to-end test script: UC1, UC2, UC3, UC4, UC5 (by scenario)

Rewritten 9 Nov 2026. Each use case is split into scenarios. Every scenario can be run on its own: it says what to run first, then lists numbered steps. Every step gives the **menu path** and the **direct address**, then what to do, then **Expect**. Anything that does not match "Expect" is a defect: note the use case, scenario and step number and take a screenshot.

Addresses: **Officer portal** O = http://localhost:31173 (log in as `mdm.admin` / `officer123` unless a step says otherwise). **Citizen portal** C = http://localhost:31174 (OTP is always 123456).
Officer menu names used below: **Operations** (Beneficiaries, Families), **Schemes** (Scheme Simulator), **Data Exchange > Operate** (Control Tower, Events, Decisions, Departments, Reviews and quality, Assisted Channel), **Data Exchange > Identity & Family** (Master Data), **Data Exchange > Govern** (Rules and records), **Data Exchange > Connect & reference** (Ask and verify, Reference), **Demo** (Scenario runner).
Hubs have tabs: Events (Events, Trail), Decisions (Work queue, Approvals, Consent, Notices), Departments (Response times and channels, Keys), Reviews and quality (Discrepancies, Feed quality, Eligibility checks), Rules and records (Policy, Retention and purge, Clearing house, Audit), Ask and verify (Query builder, Verification), Demo (Scenario runner, Unscripted events, Evidence pack, How the pieces fit).

Citizen sign-ins (each is a demo person; the login page lists them): 2001 Rajender Pagidipalli, 3001 Suma Pagidipalli (UC2), 2701 Sarojini Goud (UC3), 2601 Kavya Muthyala and 2602 Lakshmi Muthyala (UC4). The UC3 and UC4 people exist only after their scenario group has run. Suma and Rajender become the UC2 couple when scenario 2.1 runs (they now sign in under their own names and household).

## 0. Prepare (do once, 5 minutes)

1. Backend, officer portal and citizen portal are rebuilt and rolled out; `bash scripts/mdm_setup.sh` has been run since the last backend build; `bash scripts/add_admin_user.sh` has been run (it sets the administrator's display name to "Master Data Administrator").
2. Log out and in again as `mdm.admin` (the role is cached): O/ (home page shows "Master Data Administrator" in the header).
3. Data Exchange > Operate > **Control Tower**, O/dx/control: loads with numbers for each use case, and a Housing row.
4. Optional but recommended: `kubectl -n citizen set env deployment/mdm-service NOTIFY_ENABLED=true`. Without it, "notice" steps record the delivery but send nothing (no bell notice).
5. Demo > **Scenario runner**, O/dx/scenarios: click **Clear demo records** once before each use case below.

---

# UC1: One citizen across departments (identity linkage)

## UC1 Scenario 1: Department feeds are checked before matching (scenario 1.1 setup)

1. Reviews and quality > **Feed quality**, O/dx/quality, tab Overview. Expect: "Ten departments send us records. Before we compare them, each feed is checked on its own." A ring of checks passed and feed cards (some passed, some warnings, one failed).
2. Same page, tab **Records received**: pick 1 to 7 October. Expect: a failure chart; the two incident days are ringed above the dashed line (what the rules allow).
3. Same page, Download "Summary by rule" (CSV). Expect: a file for the monthly report.
4. Same page, tab **Checks**: open a failed check (for example revenue certificates date of birth). Expect: Why it failed, What we found (actual values), What to do (department contact). Use Next to step through; "Copy message for the department".
5. Same page, tab **Settings**: tighten a rule with a reason, preview the effect, apply. Expect: a numbered version appears; Rules and records > **Audit**, O/dx/audit, shows it.

## UC1 Scenario 2: Match and link one person across departments (1.1, 1.2)

1. Identity & Family > **Master Data**, O/mdm?tab=people. Search a person who appears in several departments; sort and filter by district, life status and date range. Expect: results with a source count.
2. Open the person (O/mdm?tab=people&person=<id>). Expect: the same person under different spellings; relationships and household (spouse, parent-child) with where each link came from.
3. Same page, "Chosen value" for each field. Expect: which source supplied it and the rule that chose it (scenario 1.3: two sources disagree, the source of truth is unchanged).

## UC1 Scenario 3: Steward review (1.4 two plausible candidates; 1.3 conflict)

1. Master Data, O/mdm?tab=review. Expect: tasks with a score, grouped; open one: records and candidates side by side with differing fields marked in words, not colour alone.
2. Open a task with one candidate just under the auto threshold. Expect: reason "Probably the same person", class C, no "Approve all".
3. Open a task with two plausible candidates (for example a father and son with the same name). Expect: the system recommends but does not merge; no automatic action.
4. Link one task to the candidate (reason if asked). Expect: the person record is rebuilt, an audit entry is written, the same task cannot be decided twice (try again: a 409 message).
5. **Bug re-check (reported for ELEC-00000015, Komuraiah Paidi):** after linking, open the person page O/mdm?tab=people&person=20665. Expect: the page no longer offers a review for this link, and the review queue O/mdm?tab=review&q=Komuraiah%20Paidi&from=20665 does not list the two records as unlinked. If it still does, send a screenshot of both pages.
6. Keep one task separate. Expect: two records, still linkable later.
7. Task group "Unlikely to be the same person" (Decisions > **Work queue**, O/dx/work): the only batchable identity group. Open sample rows, give a reason, approve the group. Expect: a batch id in the receipt.
8. Work queue group "Two departments disagree": approve only as "send a correction request". Expect: the master value is not edited.

## UC1 Scenario 4: Lineage of the matched person

1. Events > **Trail** or Data Exchange > Operate > Events, O/dx/lineage?tab=person. Pick the person you just matched. Expect: which system supplied which value; lineage shows only what has been recorded for that person.

## UC1 Scenario 5: A citizen sees a disagreement and reports a wrong detail (1.5 no identity reference, 1.6 wrong attribute)

1. Citizen: sign in at C/ as a linked citizen with a disagreement (login page lists the demo people). Open Notifications or "Please confirm". Expect: both values and both departments shown.
2. Choose "Neither", type a value, submit. Expect: receipt "We have sent your correction to <department>"; no claim that it was updated.
3. Officer: Reviews and quality > **Discrepancies**, O/dx/discrepancies. Expect: the correction routed to the owning department, status ROUTED.
4. Citizen "Report a wrong detail": pick a detail, enter a value, send. Do it a second time for the same detail. Expect: a friendly refusal the second time.
5. Optional: Demo > Scenario runner, O/dx/scenarios: run 1.5 and 1.6 (no identity reference; citizen reports a wrong attribute).
6. Control Tower, O/dx/control: identity row counts equal the counts you see after clicking through to the filtered queue.

Pass for UC1: no path changes a master value except a steward's decision; a citizen never sees another person's record; every change is in the audit log.

---

# UC2: Birth of a child

Cast: Rajender Pagidipalli (father, sign-in 2001) and Suma Pagidipalli (mother, sign-in 3001). Scenario 2.1 links both sign-ins and gives them their own household in the registry, so the header, profile and My Family show their names (not another family's). The Health system is the one that goes down. Run first: Demo > Scenario runner, O/dx/scenarios: **Clear demo records**, then **Run the UC2 group** (7 automatic checks, 2.1 to 2.7). The live steps 2.8 to 2.13 are in the separate "Live demo steps" block and are run one at a time.

## UC2 Scenario 1: A birth is registered; the parent agrees to some uses only; the Health system is down (2.1, 2.2, 2.7)

1. Events > **Events**, O/dx/events. Search BIRTH_REGISTERED and open the newest case (O/dx/events?case=<id>). Expect: status PROCESSED; Child, Mother and Father shown as separate names (parents "matched, awaiting approval"); the strip shows "To decide" for what is still open.
2. Decisions > **Consent**, O/dx/consent. Expect: four consent rows (Civil supplies, Health, Citizen record, Girl scheme), all "Waiting". Events > Trail (O/dx/lineage?tab=event&event=<id>): every delivery waiting, nothing delivered.
3. Demo > Scenario runner, O/dx/scenarios, block "Live demo steps": run **2.8** "the Health system goes down". Expect: a green result.
4. Citizen: sign in at C/ as **3001**. Expect: the header and profile say **Suma Pagidipalli**. C/approvals shows the child; open it.
5. Choose Mother, tick the declaration, switch OFF the girl-child scheme, leave Civil supplies, Health and Citizen record on, approve, confirm. Expect the receipt: Civil supplies "Shared", Citizen record "Shared", Health "Approved, not shared yet" (system not reachable), girl scheme "Declined". Never "Shared" for Health. Switch to Telugu (EN | తె in the header) and check the same receipt.
6. Citizen: C/my-family. Expect: one household for Suma: Suma (head, "YOU"), Rajender (spouse), Vikram (son) and the new child **in the same table**, labelled "Added after birth registration".
7. Citizen: sign in as **2001**. Expect: the header says Rajender Pagidipalli; C/approvals shows the card read-only, "Answered by Suma".
8. Officer: Events > Trail, O/dx/lineage?tab=event&event=<id>. Expect: Civil supplies and Citizen record delivered; Health retrying with attempts; girl scheme blocked (parent refused), nothing sent.
9. Decisions > **Notices**, O/dx/notices. Expect: Civil supplies has a notice to answer; Health has none (it has received nothing yet).
10. Demo > Scenario runner: run **2.9** "the Health system is back". Citizen: refresh C/approvals/<key>. Expect: Health now "Shared". Notices: Health now has its notice. Rules and records > **Audit**, O/dx/audit: the outage, the retries and the replay are recorded.
11. Decisions > **Approvals**, O/dx/approvals, filter use case UC2. Expect: one row per action (add child to the ration card, request identity reference, any review). Open one: it names the department and the time it has. Approve one with a rationale: a too-short rationale is refused; approving before the parent answered is refused ("Waiting for consent from the parent"). After approving the ration card action: O/dx/events?case=<id> shows **To decide 0** when everything is approved (it counts only what is still open) and the parents show "linked".
12. Decisions > **Notices**, O/dx/notices: open the Civil supplies notice. Answer it as **Applied** with a reference (for example PDS-REF-AARVI). Citizen: C/my-family. Expect: the child also shows "On the ration card".

## UC2 Scenario 2: A birth with no name, registered months late (2.4, 2.5)

Run after Scenario 1 (the same couple).
1. Demo > Scenario runner, O/dx/scenarios: run **2.10** "a late birth is registered without a name". Expect: green.
2. Events > Events, O/dx/events: open the new case. Expect: HELD; no child record, no consent asked, nothing delivered to any department.
3. Run **2.11** "the name arrives". Events: same registration, now processed, one child (name Karthik), flagged as a late registration; a review item says "late registration". Decisions > Approvals, O/dx/approvals: the late-registration review is listed for a person, not applied automatically.
4. Citizen as **3001**: C/approvals now shows a second approval (Karthik). Expect: no duplicate or orphan child.

## UC2 Scenario 3: The parent does not answer (2.3)

1. Run **2.12**: a third child (Ishita). Citizen as **3001**, C/approvals: a pending approval. Do not answer it.
2. Run **2.13** "the response time runs out". Citizen: refresh C/approvals. Expect: the card for Ishita reads **Expired**.
3. Decisions > Consent, O/dx/consent. Expect: Expired. Events > Trail for the case: every department blocked, nothing delivered. Rules and records > Policy, O/dx/policy: reminders stop at the cap shown there.

## UC2 Scenario 4: The parents cannot be matched (2.6)

1. Scenario runner: run **2.6** (automatic). Open the evidence drawer. Expect: the parents could not be matched; no consent can be asked; every department blocked; a review task says why.
2. Decisions > Work queue, O/dx/work (or O/dx/approvals): find the review. Expect: an ambiguity flag; downstream notification blocked until a steward decides; the unmatched parent shows "not matched" with a reason.

## UC2 Scenario 5: Department notices, response times and bulk answers

1. Decisions > **Notices**, O/dx/notices. Click the tiles (Waiting, Overdue, Answered, Sent back) and clear them. Filter by Department and Status; search the child's name; click the citizen name to open that person.
2. Open a notice: due date, rule (for example "7 calendar days allowed") and whether it is statutory.
3. Simulated answer, one notice at a time: Accept one (Answered); mark another Applied (takes a reference); reject a third with a reason of at least 5 characters ("Rejected, sent back"). Open O/dx/approvals: the rejection is back there as a proposal carrying the department's reason. A pension-stop or withdrawn-consent notice offers only Acknowledge and Applied.
4. "Answer in bulk (simulated)": choose a department, outcome Accept, **Check only, record nothing**. Expect "Check only, nothing was recorded. N would be recorded, M refused"; the Waiting tile is unchanged. Then Record: "Batch BATCH-xxxxxxxx. N recorded"; the Waiting tile drops. Reject needs one reason of at least 5 characters.
5. From a CSV: "Download the open notices (CSV)"; fill outcome, reason, department_ref; leave one blank, give one APPLIED line no reference, repeat one notice number; upload with Check only, then record. Expect: good lines recorded, bad ones listed; "Download the results (CSV)".
6. Departments > **Response times and channels**, O/dx/response-times. Expect: birth 7 calendar days, birth withdrawn 2 working days, death 2 working days, marriage 7 calendar days, overrides at 2 working days for a pension stop and a withdrawn consent. Change Birth registered to 5 working days (a reason under 10 characters is refused), open History, register a new birth (Demo > Unscripted events, O/dx/inject), check its notice says 5 working days, then change it back to 7 calendar days.
7. Rules and records > **Audit**, O/dx/audit. Search the registration number: each step with a fingerprint; search DEPARTMENT_BATCH: one entry per bulk answer; run the tamper test and expect the chain intact.
8. Demo > **How the pieces fit**, O/dx/story: the birth lane includes a "Department notices" step between Deliveries and Clearing house.

## UC2 Scenario 6: The parent withdraws one purpose

1. Citizen as **3001**, C/approvals: open the first child's approval, withdraw one purpose (for example Citizen record).
2. Officer: Decisions > Consent, O/dx/consent. Expect: Revoked; Departments: the department gets a revocation notice (O/dx/notices) that can only be Acknowledged or Applied; Audit shows the withdrawal.

Pass for UC2: no data moved before Suma answered; "Shared" is never shown for something the department has not received; a refused or expired use never delivers; a held birth creates nothing until the name arrives; every step is in the Audit log; the signed-in name and household are the couple's own; "To decide" falls to 0 when everything is approved.

---

# UC3: Death of a family member

Cast (planted by scenario 3.1): Ramaiah Goud (pensioner, dies in 3.6), Sarojini Goud (his wife, sign-in **2701**), Narsimha Chary (no spouse or nominee), two men named Gangadhar Rao. Run first: Demo > Scenario runner, O/dx/scenarios: **Clear demo records**, then **Run the UC3 group** (3.1 to 3.5 automatic; 3.1 plants the cast). Live steps 3.6 to 3.10 are in the "Live demo steps" block.

## UC3 Scenario 1: The automatic checks (3.1 to 3.5)

1. Scenario runner: expect 3.1 to 3.5 green. Open the evidence drawer of each: 3.1 proposal not action; 3.2 the stop needs an authorised officer and a reason; 3.3 no record is not "alive"; 3.4 no spouse or two men fit one name; 3.5 a payment in flight is untouched.

## UC3 Scenario 2: A pensioner with a wife dies; every follow-up is only proposed (3.1, 3.2, 3.5)

1. Operations > **Beneficiaries**, O/beneficiaries, scheme "Old Age Pension (family review)". Expect: Ramaiah, Narsimha and the two Gangadhar Raos Confirmed, "Receiving the pension". Operations > **Families**, O/families: Ramaiah's household with Sarojini.
2. Scenario runner: run **3.6** (Ramaiah dies). Decisions > **Approvals**, O/dx/approvals (or Events > Events, O/dx/events). Expect: one proposal "Confirm that Ramaiah Goud ... is the person below", the matched person pre-selected; nobody is marked deceased yet.
3. Open it, confirm with a reason. Expect: four follow-ups, all only proposals: stop the pension (urgent: a payment is due, dated to the next cycle, the payment in flight is left alone), mark him deceased on the ration card, note the death on the land record, contact Sarojini. Beneficiaries: Ramaiah's note says the stop waits for an officer's approval. Families: Ramaiah shown as no longer alive.
4. Approve the pension stop: first without a reason (refused), then with a reason. Expect: approved; the pension department has a notice (Decisions > **Notices**, O/dx/notices). Beneficiaries: Ramaiah **Removed**, "Pension stopped from ... Approved by <officer>".
5. Approve "Contact Sarojini". Citizen: sign in at C/ as **2701**. Expect: C/approvals shows a read-only "A notice about a family member" card; open it: the death is confirmed, the pension in his name is approved to stop, an officer will contact her, nothing is applied to her automatically. Check it in Telugu too. Beneficiaries: a new row for Sarojini, "May be eligible for family pension".
6. Run **3.10**: the same death again. Events: shown as a duplicate; no second proposal.

## UC3 Scenario 3: A pensioner with no spouse or nominee (3.4)

1. Run **3.7**. Decisions > Approvals: confirm it with a reason. Expect: a task to trace the next of kin; the pension stop is only a proposal; no spouse notice exists.

## UC3 Scenario 4: One death fits two living men (3.4 dispute)

1. Run **3.8**. Decisions > Approvals: open the proposal. Expect: flagged ambiguous, nobody pre-selected, both men shown with their details. Try approving without choosing: refused ("Choose one"). No follow-ups exist while it is unresolved. Choose one with a reason (or reject).

## UC3 Scenario 5: A death outside the state for someone with no record (3.3)

1. Run **3.9**. Events > Events, O/dx/events: the registration shows "No match ... does not mean the person is alive"; no proposal.
2. Connect & reference > Ask and verify > **Verification**, O/dx/verify: ask the pension department whether a death is registered for that person. Expect: "no record", not "no".

Pass for UC3: nothing stops without an approval and a reason; no department record is edited; a missing record is never read as alive or dead; the payment in flight is untouched; Sarojini sees only what an officer approved and is never enrolled automatically.

---

# UC4: Higher education and turning 18

Cast (planted by scenario 4.1): Kavya (2601, student), Lakshmi (2602, her mother), Sai (brother, 17), Harika (certificate expired), Sandeep (certificates disagree), Vijay (another state, no state record), Anitha (clean). Run first: Demo > Scenario runner, O/dx/scenarios: **Clear demo records**, **Run the UC4 group**. Live steps 4.7 and 4.8 are in the "Live demo steps" block.

## UC4 Scenario 1: Find who qualifies (4.1)

1. Schemes > **Scheme Simulator**, O/scheme-simulator. Base scheme "Higher Education Scholarship (turning 18)". Expect: ages 17 to 18, income limit 2,50,000 and the categories filled in. Run, filter district Medak. Expect: Kavya, Sai, Harika, Sandeep, Anitha (not Vijay). The link "Check these students against the sources" opens O/dx/checks?tab=turning18.

## UC4 Scenario 2: The invitation (opening scene)

1. Reviews and quality > **Eligibility checks**, O/dx/checks?tab=turning18. Search Kavya, tick her, "Invite to apply", confirm. Try inviting her again: refused.
2. Citizen: sign in at C/ as **2601**. Expect: the bell shows the invitation; C/approvals ("My Approvals") shows a read-only "Scholarship invitation" card.

## UC4 Scenario 3: Kavya applies; her mother is asked (4.2 guardian)

1. Scenario runner: run **4.7**. Citizen: sign in as **2602** (Lakshmi), C/approvals. Expect: one card for Kavya and one for Sai. Allow Sai fully and Kavya partly (choose elements).
2. Citizen as **2601**: C/approvals. Expect: Kavya's card is read-only, "waiting for your parent".

## UC4 Scenario 4: Answers without moving documents (4.1, 4.3, 4.4)

1. Eligibility checks, O/dx/checks?tab=turning18: the Consent column shows "parent allowed".
2. Connect & reference > Ask and verify > **Verification**, O/dx/verify: ask "Income at most 2,50,000" for Kavya. Expect: yes or no with a band and validity date; no figure, no certificate. Rules and records > **Clearing house**, O/dx/ledger: what was asked, and that no document moved.

## UC4 Scenario 5: Certificate cases, beneficiaries and families (4.3, 4.4, 4.6)

1. Operations > **Beneficiaries**, O/beneficiaries, scheme "Higher Education Scholarship (turning 18)". Expect: a row for each cohort student with a plain note (permission given; certificate expired; certificates disagree; confirmed). Vijay is not there (no state record).
2. Decisions > **Work queue**, O/dx/work: groups "Certificate expired", "Certificates disagree", "Applicant from another state". Open a sample row, give a reason, approve each. Expect: a delivery to Revenue with references only, no values; a manual routing note for another state; the group item count drops.
3. Operations > **Families**, O/families: open Kavya's family, Citizen 360. Expect: her enrolment in the scheme with the same note.
4. Release test: Work queue, "Assign to me" on an item, switch Claimed to Anyone (the item is still listed with your name); "Release" clears it. As `dept.admin`, Claimed = Mine shows the difference.

## UC4 Scenario 6: Kavya turns 18; consent is handed over (4.2)

1. Scenario runner: run **4.8** (moves her date of birth back a few weeks, demo only). Data Exchange > Operate > **Control Tower**, O/dx/control: "Run daily checks now". Expect: "1 person turned 18".
2. Citizen as **2601**, C/approvals: a card she can answer. As **2602**: Kavya's card reads "Ended". Beneficiaries: Kavya's note "waiting for permission from the student". Expect: nothing is enrolled.

## UC4 Scenario 7: Withdrawal, the full story (4.5)

1. Citizen as **2601**: answer her card (Allow), open it and Withdraw. Expect: a receipt with what stopped, what remains, and a purge receipt number.
2. Officer: Operations > Beneficiaries: Kavya **Removed** with the withdrawal reason; Decisions > Consent, O/dx/consent: Revoked; Rules and records > Clearing house and Audit show the withdrawal.

Pass for UC4: no step changes a certificate or a master value; nothing is enrolled; a withdrawn applicant is blocked at once; every officer note matches what the citizen sees; nothing waiting ever disappears from its group.

---

# UC5: Household and housing

Run first: copy `mdm-service/tools/demo_uc5_cases.py` to the pod and `--apply` (see the earlier pod pattern: `kubectl -n citizen cp ... $POD:/tmp/...`, then `kubectl -n citizen exec $POD -- sh -c 'cd /opt/app && PYTHONPATH=/opt/app python /tmp/demo_uc5_cases.py --apply'`). Expect five cases: duplicate benefit, deceased person active on the ration card, household conflict, no household, and a clean one.

## UC5 Scenario 1: Work queue groups (no household, duplicate benefit, conflict, deceased on card)

1. Decisions > **Work queue**, O/dx/work. Expect four new groups with English and Telugu labels (toggle తెలుగు).
2. Group "No household on record": batchable. Open the sample row, continue, approve. Expect: one delivery to Housing; one notice to the applicant if notifications are on.
3. Group "Household may already have housing assistance": no "Approve all". Approve the one item: a reason is required. Expect one delivery to Housing (references and a message only).
4. Group "Ration card and housing record disagree": approve with a reason. Expect a delivery; no value chosen.
5. Group "Deceased person still active on the ration card": approve. Expect a delivery to Civil supplies.
6. Check deliveries carry no figures (on the Mac):
```
kubectl exec -n citizen $(kubectl get pod -n citizen -l app=postgres -o name | head -1) -- psql -U citizenuser -d citizen_db -c "SELECT id, system, purpose, detail FROM mdm.delivery WHERE purpose IN ('REVIEW_DUPLICATE_BENEFIT','HOUSEHOLD_NOT_FOUND','REVIEW_CARD_MEMBER','SETTLE_HOUSEHOLD_CONFLICT') ORDER BY id DESC LIMIT 5;"
```

## UC5 Scenario 2: Verification-only housing check

1. Connect & reference > Ask and verify > **Verification**, O/dx/verify: housing check for the clean demo applicant, question "Household income at most", limit 200000. Expect YES with a band and member count; no names or figures. Same question with the scholarship purpose: refused by policy.
2. Data Exchange > Operate > Control Tower, O/dx/control: the Housing row counts match what you did; each link opens the matching group.

## UC5 Scenario 3: Citizen housing card

1. Needs a demo citizen linked to an adult with a pending housing consent. If you have one: C/approvals shows the Housing wording, what is checked, 90 days; a minor never gets an answerable card. If none exists, skip and tell me.
2. Clean up: `--remove` for UC5.

Pass for UC5: nothing is edited by an approval; one open item per household however many members were checked.

---

## Close out

1. Ask Cursor to run test_uc1, test_work_queue, test_uc4, test_uc4_story, test_uc3_story, test_uc5, test_wave4 against `citizen_db_test` and the officer and citizen vitest suites, and report counts.
2. Demo > Scenario runner, O/dx/scenarios: **Clear demo records** (removes the UC2, UC3 and UC4 demo data, restores the Health system and puts the two seed sign-ins back to their original owners).
3. Clean up: `demo_uc5_cases.py --remove`, `DEMO-UC1-RAJENDER`, test links.
4. Send me the use case, scenario and step numbers that failed, with screenshots. Steps skipped for lack of a demo citizen are not failures; list them.
