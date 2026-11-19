# Shared officer side at scale: design for review

Draft 1, 5 Nov 2026. For Sameer's review before anything is built. Applies to every use case; built once, used by all six (order: UC1, UC2, UC4, UC5, UC3, UC6).

## 1. The problem

A department officer cannot open 2,100 births and 700 deaths one at a time each day. Today every consequential step is a proposal that a person approves individually (`mdm.proposal`, status PROPOSED to APPROVED). That is right for a demo and wrong for volume.

Planning figures (assumptions; the simulator in section 3.6 will measure them):
- 2,100 births a day, each feeding 3 or 4 departments: about 7,500 deliveries.
- 700 deaths a day, each triggering about 5 follow-up actions: about 3,500 actions.
- If about 5% of items need a person, that is about 140 items a day across all departments, a few dozen per department.
- One officer can reasonably clear 150 to 300 simple decisions a day, but only if they are grouped and shown with their evidence.

Principle: routine passes through under a rule a person approved once. Anything unusual, risky or hard to undo reaches a person, grouped by reason. Nothing is hidden: every automatic action is recorded with the rule and version that allowed it, and a sample is checked by a person afterwards.

## 2. A decision for you first: the governing rule

The POC brief says every consequential action is a proposal approved by a person with a recorded rationale. At volume that has to become: **a person approves the rule; each use of the rule is recorded; exceptions always go to a person.** Each automatic action is stored as "approved under rule R, version N, by <approver of the rule>". This keeps the audit trail and the accountability, but it is a change from the brief as written, so it needs your agreement (and the client's) before we build it. Section 7 lists this as decision D1.

## 3. What gets built (shared by all use cases)

### 3.1 Three classes of action

| Class | Meaning | Handling | Examples from the engine today |
|---|---|---|---|
| A. Citizen decides | Sharing needs consent | The citizen approves or declines. No officer step. Officer sees counts and exceptions | `BIRTH_PDS`, `BIRTH_HEALTH`, `BIRTH_CITIZEN_RECORD`, `BIRTH_GIRL_SCHEME`, scholarship, housing, marriage consents |
| B. Routine, reversible | Statutory or low impact, clean match | Automatic under an approved rule, held briefly, undo window, sampled afterwards | `ADD_TO_RATION_CARD` with parents matched at or above 0.76 and consent granted; `REQUEST_IDENTITY_REFERENCE`; `NOTE_NEW_NAME`; `CONFIRM_DEATH` with one match at or above the threshold |
| C. Always a person | Hard to undo, affects entitlements, or ambiguous | Never automatic. Needs a reason; two people for the riskiest; hold before act | `STOP_PENSION`, `CLOSE_SCHOLARSHIP`, `MARK_DECEASED_PDS`, `REFER_UNDERAGE`, `REVIEW_PARENTS`, `REVIEW_DEPARTMENT_REJECTION`, any `CONFIRM_*` with more than one plausible match |

The current `rationale_required_kinds` policy list is the seed for class C. Class assignment is policy data (versioned), not code.

### 3.2 Screen 1: Flow board (upgrade of Control Tower)

One row per department, one column per state, all numbers clickable.

```
Today, 05 Nov            Received  Delivered  Waiting for   Retrying  Failed   Needs a   Oldest   On time
                                              the citizen                     person    waiting
Civil supplies (PDS)       2,114     1,402        640           9        0       63       2d 4h     97%
Health                     2,114     1,611        470          12        1       20       1d 2h     98%
Women and child welfare    1,030       702        318           6        0        4       0d 19h    99%
Citizen record             2,114     1,902        190           3        0       19       0d 6h     99%
Pension                      700       661          0           0        0       39       0d 3h     94%
```

- Source: `mdm.delivery` statuses already exist (`DELIVERED`, `PENDING_CONSENT`, `RETRYING`, `DEAD_LETTER`, `BLOCKED_*`); "Needs a person" comes from open work items (3.3).
- Clicking a number opens the Work queue filtered to it.
- A department officer sees only their department's row; a supervisor sees all.
- A small trend line per department (last 14 days) and a banner when a threshold is crossed (for example oldest waiting over the response time in Policy).

### 3.3 Screen 2: Work queue (replaces one-by-one Approvals as the main entry)

Items are grouped by **reason**, not listed individually.

```
Needs a person: 140 items in 7 groups                        [Department: PDS ▾] [Class ▾] [Assigned: anyone ▾]
------------------------------------------------------------------------------------------------------------
 ▸ Parent match below the automatic threshold         63   oldest 2d 4h   Class C   Suggest: review each pair
 ▸ Two plausible people for one death                 21   oldest 1d 1h   Class C   Suggest: choose from list
 ▸ Department rejected a delivery                      9   oldest 0d 7h   Class C   Suggest: fix data or re-send
 ▸ Late registration (over 60 days)                   18   oldest 3d 0h   Class B*  Suggest: approve if documents present
 ▸ Pension stop after a death                         39   oldest 0d 3h   Class C   Two people; held 7 days
 ...
```

Opening a group shows a table (search, filters, sort, CSV export as in the shared kit) with the evidence beside each row: the proposed action, the two or three candidate people with scores and the fields that differ, and the source records. Actions:
- **Approve selected / Approve all in group** (batch, see 3.4), **Reject**, **Send to second person**, **Assign to me** (claim; others see it is claimed).
- **Triage mode**: opens items one at a time with Next, for groups of mixed cases. Keyboard shortcuts for approve, reject, skip.
- A group marked Class C never offers "Approve all" without a sample review and a reason.

Work items come from `mdm.proposal` (already holds kind, status, detail) plus new fields in section 4. The queue also lists items other screens already create today (review tasks, discrepancies) through one common view.

### 3.4 Batch approve, with safety

1. The officer selects a group or rows and presses Approve.
2. The system shows a preview: how many records, which departments get what, and a **sample** (10 random rows, the 5 lowest-confidence rows, any outliers). The officer must open the sample before the button enables.
3. One reason is recorded for the batch (class C: required, minimum length from policy). A batch gets an id; every record's ledger line carries that batch id.
4. Class C batches need a **second approver** (a different person with the supervisor role) before they run.
5. Nothing leaves immediately: outbound deliveries are **held** for a period set by policy (default 30 minutes; 7 days for pension stop) during which the batch can be **undone** in one click. After the hold, deliveries go. Undo after sending becomes a normal revocation with its own record.
6. A receipt shows counts, the batch id, who approved, the rule or reason, and the undo deadline.

### 3.5 Screen 3: Standing rules (automatic under an approved rule)

An extension of the Policy screen, which is already versioned with preview and history.

- One rule per action kind: conditions (minimum match score, consent present, no conflicting fields, maximum per day), class, hold period, who approved it, effective date, version.
- **Dry run**: "if this rule had been on for the last 7 days it would have handled 1,840 and left 63 for a person." Uses recorded events, no changes made.
- **Circuit breaker**: if the sampled error rate, the exception rate or the delivery failure rate crosses a limit set in the rule, the rule pauses itself, new items go to the Work queue, and a supervisor is notified.
- **Pause** switch per rule and one **pause all automation** switch (for incidents).
- Changing a rule needs a reason and a second approver; old versions stay and each action still shows the version that applied.

### 3.6 Screen 4: Quality checks and a volume simulator

- **Sampling.** Each day a random share (policy, default 2%) of automatic actions, plus every one near a threshold, goes to a Check queue: "does this look right?" with the same evidence view. Findings feed a report (sample size, error count, rate) and can trip the circuit breaker.
- **Volume simulator** (added to the Demo scenario runner): a form with births per day, deaths per day, share of parents who consent at the registration desk, via the portal within two days, or never, match quality mix, and exception rate. It generates a synthetic day (DEMO- records only, cleared with Clear demo records) and fills the Flow board live. It reports the number of items for a person, per department, and the time to clear at a chosen number of officers. This is how we replace the 5% assumption with a measured figure.

### 3.7 Citizen side effects at volume

- **Registration-desk consent.** Most parents should be asked at the hospital or registrar, with an operator present (the Assisted channel already records the operator). Add a quick consent capture on that desk screen so the majority of consents never wait for the portal.
- **Lapse.** A consent not answered by the response window lapses (existing). Nothing is shared; the parent can still approve later by a new request.
- **Reminders.** Manual today (decision D4). The Flow board shows how many are waiting, so a supervisor can see whether to remind in bulk.

## 4. Data changes (outline for the spec)

- `mdm.proposal` gains: `reason_code`, `risk_class` (A, B, C), `auto_rule_id`, `auto_rule_version`, `auto_decided` (boolean), `batch_id`, `hold_until`, `claimed_by`, `claimed_at`, `second_approver`, `second_decided_at`.
- New `mdm.auto_rule` (kind, conditions jsonb, class, hold_minutes, version, active, approved_by, second_approver, approved_at), versioned the same way as `mdm.policy`.
- New `mdm.batch` (id, actor, kind or reason, count, sample_ids, rationale, status, second_approver, undo_until, created_at).
- New `mdm.qa_sample` (proposal_id, sampled_at, checked_by, verdict, note).
- Indexes: `(status, reason_code, created_at)`, `(claimed_by, status)`, `(hold_until) WHERE status='HELD'`.
- A proposal status `HELD` between decided and sent; and a delivery state `HELD` for the same period.
- Counts for the Flow board are computed with grouped queries on these indexes (partial indexes on open states). If the numbers get slow, a small counts table refreshed every 30 seconds replaces the live query. Lists use keyset paging, not offsets.

## 5. Roles

| Role | Can |
|---|---|
| Department officer | See and act on their own department's items; claim; approve class B/C singles and batches within their department; not change rules |
| Supervisor | All departments; second-approve class C batches and rule changes; pause rules; run reminders |
| Steward | Master-data matching items (parents, death and marriage matches) |
| Auditor | Read everything including rules, batches and sampling; record Check findings; no approvals |

The existing roles (DEPT_ADMIN, IT_ADMIN and the stewardship role) map onto these; exact mapping to be set in the spec.

## 6. Build in three slices

| Slice | Contents | What it unlocks |
|---|---|---|
| 1 | Flow board; Work queue with grouping, claim and the common view; batch approve with sample, reason, batch id (no auto rules yet, no hold) | UC2 and UC4 can be demonstrated at volume with batch approval |
| 2 | Standing rules with dry run; hold and undo; second approver; circuit breaker; class C handling | UC3 (pension stop with hold) and UC1 (auto-link above threshold) |
| 3 | Sampling and Check queue; volume simulator; registration-desk consent | The scale story for the client, with measured numbers |

Each slice gets its own Cursor spec, tests and review, like the citizen approvals work.

## 7. Acceptance tests (outline; the spec names each one)

- Given a synthetic day of 2,100 births and 700 deaths with 5% exceptions: the Work queue shows no more than about 140 items in no more than about 10 groups; the groups carry the right reason codes.
- Batch approve of 500 items completes in under 10 seconds and writes 500 ledger lines carrying one batch id, one reason and the approver.
- A class C batch cannot run without a second approver who is a different person; an approver cannot approve their own batch.
- The sample must be opened before batch approve enables; the sample always includes the lowest-confidence rows.
- Undo within the hold stops every delivery in the batch and returns the items to the queue; after the hold, undo is a recorded revocation.
- A rule with its conditions unmet never acts; a rule that is paused never acts; the circuit breaker pauses a rule when the sampled error rate passes its limit and routes new items to the queue.
- Every automatic action shows the rule id and version in Events › Trail and in the ledger.
- A department officer cannot see or act on another department's items; the Auditor can read but not approve.
- Flow board numbers equal the sum of the filtered queue counts when clicked through.
- All new strings in English and Telugu; keyboard-only use of the queue and the batch dialog; works at laptop width.
- Performance on the laptop with 20,000 deliveries in the database: Flow board loads in under 2 seconds; queue group list under 1 second; opening a group page of 50 rows under 1 second.

## 8. Decisions for Sameer

- **D1.** Agree to change the governing rule to "a person approves the rule, each use is recorded, exceptions go to a person"? (Needed before slice 2. Slice 1 needs no change because every batch is still approved by a person.)
- **D2.** Hold periods: 30 minutes standard and 7 days for pension stop acceptable?
- **D3.** Sample share: 2% a day acceptable, plus all items near a threshold?
- **D4.** Who is the second approver for class C: any supervisor, or a named role per department?
- **D5.** Ageing: after how long does an unclaimed item escalate to a supervisor, and what response time does each department get (today set in Policy)?
- **D6.** Should the first demo use real-looking daily volumes (2,100 and 700), or a scaled-down day (210 and 70) to keep the laptop responsive?

## 9. Not in this design

Department-side sign-in and inbox (departments answer through the officer portal today); real hospital integrations for registration-desk capture; staffing forecasts beyond the simple per-officer figure.

## 10. Decisions recorded (Sameer, 5 Nov 2026)

- D1: confirmed. A person approves the rule, each use is recorded, exceptions go to a person.
- D2: single approvals take effect immediately. The hold-and-undo window exists only for batches and automatic actions, because once data reaches a department it cannot be recalled, only revoked; the hold gives a window to catch a mistaken batch. Length is set per rule (0 means immediate). Proposed production default 30 minutes; demo 1 minute. Pension stop keeps its longer cooling-off period (proposed 7 days, to confirm when slice 2 is specified).
- D3: sampling at 5%, taken on automatic decisions (an event or proposal), not on each delivery, so the daily check load is comparable to the exception load rather than several times larger. To be reduced later if the findings are clean.
- D4: second approver is a Supervisor. For the demo an Admin may act at both levels, but the level 1 approver is an officer and the level 2 approver a supervisor; other roles later. A demo switch will allow the same person at both levels, shown with a visible demo badge and recorded as such.
- D5: department response time defaults to 30 days and an unclaimed item escalates after 30 days. Existing per-use response times in Policy stay as overrides.
- D6: first demo at one tenth of real volume (210 births and 70 deaths a day).
- Parent match below the automatic threshold waits for an officer (see `Citizen_Approvals_Change_1.md`).
