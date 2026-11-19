# Slice 1 review 1 (5 Nov 2026): fixes for Cursor

Reviewed: `015_work_queue.sql`, `workqueue.py`, `work_api.py`, `events.py` and `exchange.py` changes, `tools/volume_seed.py`, `test_work_queue.py`, `DxWork.jsx`, `DxFlowBoard.jsx`. Cursor's 20 backend tests pass on my copy. I did not run the officer portal tests (the portal tooling on my side does not match the Mac); Cursor's 29 are unverified by me. Same rules as before: no git commit or push, no DG2.0, Telugu for every new string. Fix in the order below, starting with item 0 and add the named tests. Report counts.

## Must fix (5)

### 0. The Flow board shows each department twice, and the department filter finds nothing
`mdm.proposal.system` holds display names ("Civil supplies (PDS)"), while `mdm.delivery.system` and `mdm.consent.system` hold codes ("pds"). The Flow board merges the two without translating. On my copy it returns two separate rows for the same department: `pds` with 329 received and 0 needing a person, and `Civil supplies (PDS)` with 0 received and 712 needing a person. `GET /api/x/work/groups?system=pds` returns 0 items; the same call with the display name returns 712. The test that compares Flow board and queue counts passes anyway, so it does not catch this.

Fix: add `system_code` to `mdm.proposal` (migration 015, back-filled from the display name through one mapping kept in one place, for example `exchange.SYSTEM_CODE_BY_NAME`; names that are not departments ("MDM steward", "Authorised officer (policy)", "Departments holding her record") map to `mdm`). Set it in `events._propose` and for proposals raised from `citizen.py`. Index `(status, system_code)`. The Flow board, groups, items, claim and preview use `system_code`. `exchange.approvals(system=...)` and every `system` parameter accept a code or a display name and translate to the code. Tests: the Flow board has exactly one row per department code; each row's `needs_person` equals the sum of the work group counts filtered by that code; filtering by code and by display name give the same result. This must be done before `Department_Users_Spec.md`, which relies on it.

### 1. A birth with a weak or missing parent is classed "parents matched" and can be batch approved
`workqueue.classify` returns `BIRTH_CLEAN` (class B, batchable) for every `ADD_TO_RATION_CARD`, whatever the parent scores. Every branch of that function returns the same value.

Probe (my copy): birth with a real father and an unknown mother. The engine raised `ADD_TO_RATION_CARD` with father score 0.714 (below the 0.76 threshold) and mother missing. It was classed `BIRTH_CLEAN`/B and `batch/preview` accepted it. In my run the batch skipped it only because the parents' consent was still pending. If one strong-match parent has consented, nothing in the group stops it, and approving writes the parent link.

Fix:
- `ADD_TO_RATION_CARD` is `BIRTH_CLEAN` or `BIRTH_LATE` only when **every parent named on the event has a `person_id` and a score at or above `matching.Config.auto`** (read, not copied). Otherwise it is a new reason `BIRTH_PARENT_UNSURE`, class C, not batchable, label "Parent not confidently matched" (Telugu too), suggestion "Confirm the parent first".
- Keep the late rule: late and weak parent is still `BIRTH_PARENT_UNSURE`.
- Remove the dead branches and the duplicate first `BATCHABLE` definition in the same file.
- Back-fill (`apply_classification`) must re-classify open proposals whose classification would change.
- Tests: `test_a_birth_with_a_missing_or_low_score_parent_is_parent_unsure_class_c_and_not_batchable` (use the real case: known father at about 0.71, unknown mother, through `/api/events`); `test_a_late_birth_with_a_weak_parent_is_not_batchable`; `test_preview_refuses_a_parent_unsure_group`. Rename or replace the existing test whose title says "low score parent" but only checks `REVIEW_PARENTS`.

### 2. The "random" sample is the same every time
`preview` shuffles with `random.Random(id_list[0])`, so the same group always gives the same 10 rows and an officer can learn which ones are sampled. Probe: two previews of `IDREF_REQUEST` returned identical samples.
Fix: use `random.SystemRandom()` (the chosen sample is already stored in the signed token, so it stays stable for one preview). Test: two previews of a group of at least 30 items differ; one preview keeps its sample.

### 3. The batch token can be replayed and its secret is in the source
- A used token is accepted again. Probe: approving twice with one token created a second empty batch row (batch 9, approved 0).
- `_TOKEN_SECRET` is a constant in the code, so anyone who reads the repository can forge a token and choose their own sample. `_PREVIEW_STORE` is in memory, never cleaned, and lost on restart.
- The token carries the actor but approve never checks it.

Fix: (a) read the secret from the environment (`BATCH_TOKEN_SECRET`); if unset, generate one random secret at start-up (log a warning); no new manifest change needed for the demo. (b) Give the token a random id; record it in `mdm.batch` (new column `token_id`, unique, added in migration 015 with `ADD COLUMN IF NOT EXISTS`) and refuse a second approve with 409 before inserting anything. (c) Refuse if the approving actor differs from the previewing actor (409). (d) Drop `_PREVIEW_STORE`; the signature and the `token_id` are enough. Tests: replay refused and creates no row; another user's token refused; a forged token refused.

### 4. A batch approves items another officer has claimed
`batch_approve` ignores `claimed_by`. Fix: skip an item claimed by someone else, with the reason "Claimed by <name>", listed in the receipt like any other skipped item. Test: one of three items claimed by another user is skipped and the other two approve.

## Should fix (6)

5. **Weak tests.** `test_a_department_officer_sees_only_their_own_department` contains `assert ... or True` and can never fail; make it assert what the code actually does (department filter returns only that system), and state in its docstring that there is no per-user scoping yet. `test_a_volume_day_at_tenth_scale...` counts only rows whose summary contains "Volume", so deaths are missed, and its limit of 900 is loose. Count by the event registration prefix (`DEMO-VOL-`), assert the group count (at most 10), assert the exception groups appear (see 6), and assert the number of open items equals births plus deaths times the proposals per event as measured. `test_performance...` uses whatever is in the database; seed 20,000 deliveries (a direct SQL insert in the test) before timing, as the spec says.
6. **The seed tool does not make a believable day.**
   - "Late" births use a registration date (2025-01-15) **before** the birth date (2026-10-01), so none is ever late. Use a date more than `late_event_days` after the birth.
   - In my run of 210 births at 5% exceptions, the Work queue got 210 clean births, 0 late, 0 parent reviews (check that `unknown` and `typo` really change the parent match).
   - All 66 deaths came out `DEATH_AMBIGUOUS` because the seed reuses real names that occur many times. Choose deceased people whose full name is unique in `mdm.person`, so a clean day produces mostly `DEATH_SINGLE`.
   - Print per-reason counts and, separately, how many are batchable.
7. **Flow board arithmetic.** The totals row's `on_time_pct` is weighted by `needs_person`, which is wrong; compute it from the summed on-time and total counts. Remove the dead `if False else` query. Use `department_response_days` and the 30-day escalation constant in every query (one place), and make `overdue` count each item once (union, not the larger of two counts).
8. **Reads that write.** `groups`, `items` and `flow_board` call `apply_classification` (an UPDATE) on every GET. Run the back-fill once at start-up or after migration instead, and keep `classify` in `_propose` for new rows. Reads must not write.
9. **Telugu for the suggestion text.** The group "suggestion" is English only in the Telugu view. Add Telugu in `SUGGESTIONS` and return it when `Accept-Language` is Telugu, as the labels do. Test it.
10. **Flow board: split routine from decisions.** `needs_person` counts every open proposal. My seeded tenth-scale day left 420 open birth items (210 ration card, 210 identity reference) plus 66 deaths, against the design's expectation of about 14. Those are routine items that batch approve clears in two actions, but the number alarms. Add two fields per row and in totals: `routine` (open items in batchable groups) and `decision` (open class C items), show both columns on the Flow board (keep `needs_person` as their sum), link each to the Work queue filtered by class. Definitions in the help drawer; Telugu.

## Noted, not for Cursor now

- **Department scoping** is now specified separately in `Department_Users_Spec.md` (two demo users, PDS and Health). It depends on item 0.
- `sample_opened` is reported by the browser; the server cannot know the rows were actually opened. Acceptable for a demo; production would record opens.
- `items()` runs about five queries per row. It meets the one-second target on my copy (about 1,600 open proposals); recheck at 5,000.

## What I will re-check after the fixes

Re-run my probes (weak parent, two previews, replay, claimed item), the 20 tests plus the new ones, a seeded day with the corrected seeder (per-reason counts), and the Flow board totals against the queue counts. I will also ask for the officer portal test output.
