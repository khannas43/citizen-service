# Citizen approvals: parent consent and other approvals on the citizen portal

Spec for the build in Cursor. Written 5 Nov 2026. Claude writes the spec and reviews the result; Cursor writes the code.
Repo: `Citizen-Services`. Namespace `citizen`. Telugu first; Tamil is a separate track.

## 1. Outcome

A parent signs in to the citizen portal, sees that a department is waiting for their approval, and approves, partly approves or declines it, for their child, in Telugu or English, in under a minute. The officer sees the same state without phoning anyone. Nothing about the child's data moves until the parent approves.

Use case the demo follows: UC2 "A child is born". The registration creates the child and asks the mother (or the father if no mother is on record) for consent, one consent per purpose.

## 2. What already exists (verified in the code, do not rebuild)

| Area | Where | What it does today |
|---|---|---|
| Consent engine | `mdm-service/app/exchange.py` | `request_consent`, `respond` (GRANT or REFUSE, partial elements, expiry), `revoke`, `remind` (counts reminders, max 2 by policy), `_guardian_ok`, `birth_consents` (one consent per purpose: BIRTH_PDS, BIRTH_HEALTH, BIRTH_CITIZEN_RECORD, BIRTH_GIRL_SCHEME for a girl) |
| Citizen API | `mdm-service/app/citizen_api.py`, `citizen.py` | `GET /api/citizen/consents`, `POST .../{cid}/respond`, `POST .../{cid}/withdraw`. The caller is identified by the sign-in token (`aadhaarRef` from auth-service), never by an id they send. `mdm.citizen_link` binds sign-in to person |
| Citizen screen | `citizen-portal/src/screens/RequestsForYou.jsx` | Tab "Requests for you" inside My Data (`/my-consents`). One card per consent. Locale keys `requests.*` in en, te, hi, gu |
| Notifications | `notifications-service` `POST /v1/notifications` (`aadhaarRef, title, message, serviceName, trackingId`), `GET ?aadhaar=`, `PATCH /{id}/read` | The bell in the citizen portal polls it every 30 s |
| Table | `mdm.consent` | has `person_id` (who answers), `subject_person_id` (the child), `given_by_person_id`, `respond_by`, `reminders`, `last_reminder_at`, `event_id`; `mdm.consent_log` is the history |

## 3. Gaps this work closes

1. A parent is never told. MDM raises the consent but sends no notification, and `remind()` only increments a counter.
2. No Home alert. The pending request is buried in My Data, third tab.
3. The screen is one card per purpose. A birth makes 3 or 4 cards, so the parent answers 3 or 4 times, with no child summary and no "approve all".
4. No guardian declaration. The portal never records that the person answering says they are the child's parent or guardian.
5. Only one parent can see the request. The other parent, if linked, cannot.
6. No receipt after answering, and no plain statement of what happens next.
7. Nothing for other approvals a citizen should confirm (a proposed correction to their record, a child or family member to be linked).
8. The officer cannot tell "not seen" from "seen, not answered".

## 4. Design decisions (defaults; Sameer to confirm in review)

- **D1 One approval per event.** The citizen API groups the consents of one event (`event_id`) into a single "approval" with one line per department. Answers are still stored per consent, so the engine and its ledger do not change.
- **D2 Declaration.** To approve or decline for a child, the parent ticks: "I am the parent or guardian of {child}". Store the relationship (`mother`, `father`, `guardian`) and the declaration text version on each consent answered. Declining needs no declaration text but still records who answered.
- **D3 Either linked parent may answer.** A consent is visible to every person who is a recorded parent of `subject_person_id` and has a `citizen_link`. The first answer wins; the other parent then sees it read-only as "Answered by {name} on {date}". Reuse `_guardian_ok`.
- **D4 Other approvals are requests, not edits.** A citizen "confirms" or "disputes" a fact. Confirming creates or advances a steward proposal in `mdm.proposal`; it never writes master data. A person (steward) still approves.
- **D5 Notifications are best effort.** MDM posts to notifications-service when a consent is requested and when a reminder is sent. A failure is logged and never blocks the consent or the reminder.
- **D6 Seen tracking.** First time a citizen opens an approval, `seen_at` is set on its consents. The officer sees Waiting, Seen, Answered.
- **D7 Language.** Telugu and English are required in full. Hindi and Gujarati may fall back to English through `defaultValue` for now; list them in the review notes so they are not forgotten.
- **D8 Words.** Say "approval" and "permission" to the parent, not "consent engine", "principal" or "data subject". Show citizens department names only; the firm is never named on any screen.

## 5. Data changes

New file `db/mdm/014_citizen_approvals.sql`, idempotent, listed in `scripts/mdm_setup.sh` after `013_translation_memory.sql`.

```sql
ALTER TABLE mdm.consent ADD COLUMN IF NOT EXISTS seen_at timestamptz;
ALTER TABLE mdm.consent ADD COLUMN IF NOT EXISTS answered_as text;          -- mother | father | guardian
ALTER TABLE mdm.consent ADD COLUMN IF NOT EXISTS declaration_version text;  -- e.g. 'parent-v1'
ALTER TABLE mdm.consent ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE TABLE IF NOT EXISTS mdm.citizen_request (
  id          bigserial PRIMARY KEY,
  person_id   integer NOT NULL REFERENCES mdm.person(id),         -- who must answer
  subject_person_id integer REFERENCES mdm.person(id),            -- whose record it is about
  kind        text NOT NULL,        -- CONFIRM_DETAILS | LINK_CHILD | LINK_FAMILY_MEMBER
  summary     text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}',   -- what is proposed, in plain fields the screen can show
  proposal_id bigint REFERENCES mdm.proposal(id),
  status      text NOT NULL DEFAULT 'PENDING',  -- PENDING | CONFIRMED | DISPUTED | EXPIRED
  respond_by  timestamptz,
  responded_at timestamptz,
  seen_at     timestamptz,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS citizen_request_person_ix ON mdm.citizen_request (person_id, status);
```

Run the file through the same ownership and `platform.scope_all()` tail the other db files use.

## 6. API contract (mdm-service, all under `/mdm-service`)

All citizen routes use the existing `me` dependency (token to `aadhaarRef`). The caller never sends a person id.

| Method and path | Purpose | Notes |
|---|---|---|
| `GET /api/citizen/approvals` | Everything waiting or recent for me | Returns `{person, pending, items}`. Each item is `{key, kind: "CONSENT_GROUP" or "REQUEST", ...}` |
| `GET /api/citizen/approvals/{key}` | One approval in full | Sets `seen_at` on first read. Keys: `event-{id}` or `req-{id}` |
| `POST /api/citizen/approvals/event-{id}/answer` | Answer a birth approval | Body: `{relationship, declared: true, answers: [{consent_id, decision: GRANT or REFUSE, elements?: [..]}]}`. `declared` must be true when any answer is GRANT. All-or-nothing in one transaction |
| `POST /api/citizen/approvals/req-{id}/answer` | Confirm or dispute | Body: `{decision: CONFIRM or DISPUTE, note?}` |
| `POST /api/citizen/consents/{cid}/withdraw` | unchanged | Keep for the "Withdraw" button |
| `GET /api/citizen/approvals/summary` | `{pending: n}` | Cheap; used by the Home banner and the menu badge |
| `POST /api/x/citizen-requests` | Officer raises a request | Steward or admin (`can_write`). Body `{person_id, subject_person_id?, kind, summary, detail, proposal_id?}` |
| `POST /api/x/consents/{cid}/remind` | exists; extend | After the counter moves, call the notifier (D5) |

A `CONSENT_GROUP` item looks like:

```json
{"key":"event-412","kind":"CONSENT_GROUP","status":"PENDING","event_type":"BIRTH",
 "child":{"name":"…","dob":"2026-10-30","sex":"F"},
 "asked_by":"Registrar, civil registration","asked_at":"…","respond_by":"…",
 "lines":[{"consent_id":9,"department":"pds","department_name":"…","purpose":"BIRTH_PDS","purpose_name":"…",
           "elements":["child_name","date_of_birth","parents"],"status":"PENDING"}],
 "can_answer":true,"answered_by":null,"answered_at":null}
```

Rules the backend must enforce (these become tests):
- A caller can read or answer only approvals where they are the consent's `person_id`, or a recorded parent of the `subject_person_id` with a citizen link (D3). Anything else: 403 for answer, and the key simply does not appear in lists.
- A group already answered by one parent returns 409 to the other, with the name and date.
- A GRANT without `declared: true` is refused with 422 and a plain message.
- Unknown `consent_id` in `answers`, or one that belongs to another event: 422, and nothing is saved.
- Partial elements must be a subset of the purpose's elements (already enforced in `respond`; keep it).
- `answered_as`, `declaration_version` and the answering person go into `mdm.consent` and into `consent_log.detail`.
- Every answer writes the existing audit and ledger rows. No new write path may skip `exchange.respond`.
- Expired consents (`respond_by` passed) show as EXPIRED and cannot be answered.

Notifier (D5): new `mdm-service/app/notify.py` with `send(cur, person_id, title, message, tracking_id)`. It looks up the person's `aadhaar_ref` through `citizen_link`, posts to `NOTIFICATIONS_URL` (env, default `http://notifications-service.citizen.svc.cluster.local:8080/notifications-service/v1/notifications`; confirm the real path from `k8s-manifest.yaml`), `serviceName="Approvals"`, `trackingId=event-{id}`. Timeout 3 s, swallow errors, set `consent.notified_at`. Call it from `birth_consents` (once per event, to the person who will answer, and to the other linked parent) and from `remind`. Off unless `NOTIFY_ENABLED=true`, like `MT_ENABLED`; `mdm_setup.sh` resets it, so document that in the script comment.

## 7. Citizen portal screens (`citizen-portal/src`)

Stack as it is: React 19, react-router 7, react-i18next, plain CSS with `tokens.css`. No new libraries.

1. **Home banner** (`screens/Home.jsx`). If `summary.pending > 0`, show a banner at the top: "{n} approval(s) waiting for you" with a button "Review". Hidden when 0. Poll once on load and when the tab regains focus.
2. **Menu badge and bell** (`components/Layout.jsx`, `NotificationBell.jsx`). A numbered badge on the new menu entry. Notifications with `serviceName === "Approvals"` open `/approvals/{trackingId}` on click.
3. **New route `/approvals`** (`screens/Approvals.jsx`) and **`/approvals/:key`** (`screens/ApprovalDetail.jsx`). Menu label "Approvals" (en) and a Telugu label in `te.json`. Keep `/my-consents` working; its "Requests for you" tab shows the same list and links into `/approvals`.
4. **List.** Pending first, then recent (answered, expired). Each row: who it is about, the department count, "asked on", "answer by", a status chip. Empty state and "not linked yet" state reuse the existing `requests.none` and `requests.unlinked` text.
5. **Detail for a birth approval.**
   - Header: child's name, date of birth, sex, and who registered it.
   - One section per department: department name, purpose in one sentence, the data it will receive (checklist, all ticked), a toggle "Share with this department" (default on).
   - A plain line: "Nothing is shared until you approve. You can withdraw later."
   - Declaration: relationship radio (Mother, Father, Guardian) and the tick "I am the parent or guardian of {child}". Approve is disabled until both are set.
   - Buttons: "Approve selected" (the toggled-on lines), "Decline all". A toggled-off line is sent as REFUSE.
   - A confirm step before sending: "You are approving N departments for {child}. Confirm?" Focus moves to the dialog; Esc cancels.
6. **Receipt.** After answering: tick icon, "Approved for {child}", the list of departments and what was shared, the date and time, a reference (`event-412 · consent ids`), and the line "Each department receives only what you approved." Buttons: "Back to approvals", "Withdraw" (per line, uses the existing endpoint).
7. **Other approvals** (`kind: REQUEST`). A card with the summary, the proposed change shown as "current value, proposed value" rows from `detail`, and "Yes, this is correct", "No, this is wrong" plus an optional note. After answering, say "Thank you. An officer will review this before anything changes."
8. **States and quality.** Loading, error with retry, 401 sends to sign-in, 404 unlinked message, double-click safe (button disabled while sending), works at 360 px width, keyboard order logical, every control has a visible label, status never shown by colour alone.
9. **Language.** `en.json` and `te.json` get an `approvals.*` block. Reuse `requests.dept.*`, `requests.element.*` and `requests.purposeName.*`. Child and parent names come from the API as stored (do not machine-translate in the citizen portal in this phase). `hi.json` and `gu.json` may omit keys (D7).

## 8. Officer portal changes (`officer-portal/src`)

Hub Decisions, tab Consent (`/dx/consent`):
- New column "Citizen" with Waiting, Seen {date}, Answered {date}, Expired, from `seen_at` and `status`.
- "Remind" button on a waiting row (steward or admin). It calls the existing remind route, shows "Reminder 1 of 2 sent" and disables at the policy limit. If notifications are off, say "Reminder recorded; notifications are switched off."
- A filter "Waiting for the citizen".
- Every new string needs a Telugu entry in `te.js` or `te.decisions.js`, or `i18n/coverage.test.js` fails the build.
- Update the screen inventory workbook rows for the Consent screen and add one row for the citizen Approvals screens (separate sheet "Citizen portal"), and the build-plan doc.

## 9. Acceptance tests

Cursor writes these first, then makes them pass. Backend in `mdm-service/tests/test_citizen_approvals.py`, using the existing fixtures from `test_citizen.py` (mock `verify_citizen_token`).

Backend:
1. `test_a_birth_makes_one_approval_group_with_one_line_per_department`
2. `test_a_girl_birth_has_four_lines_a_boy_birth_three`
3. `test_an_unrelated_citizen_does_not_see_the_approval_and_cannot_answer_it` (403 on answer)
4. `test_the_other_linked_parent_sees_it_and_can_answer`
5. `test_once_one_parent_answers_the_other_gets_409_with_the_name`
6. `test_approving_without_the_declaration_is_refused`
7. `test_declining_does_not_need_the_declaration`
8. `test_partial_elements_are_kept_and_the_delivery_releases_only_those`
9. `test_a_bad_consent_id_in_the_answer_saves_nothing`
10. `test_the_answer_records_relationship_declaration_version_and_who_answered`
11. `test_first_open_sets_seen_at_and_a_second_open_does_not_change_it`
12. `test_an_expired_consent_shows_expired_and_cannot_be_answered`
13. `test_summary_counts_only_pending_items_for_me`
14. `test_a_notification_is_sent_when_the_birth_consent_is_raised_and_a_failure_does_not_block_it`
15. `test_remind_sends_a_notification_and_stops_at_the_policy_limit`
16. `test_confirming_a_request_creates_a_proposal_and_never_edits_the_person`
17. `test_disputing_a_request_records_the_note_and_changes_nothing`
18. `test_a_citizen_cannot_raise_a_request_only_a_steward_can`

Frontend (vitest, `citizen-portal/src/screens/__tests__/`):
1. Home shows the banner with the count and hides it at zero.
2. The list shows pending before answered.
3. Approve is disabled until a relationship is chosen and the declaration is ticked.
4. Toggling a department off sends REFUSE for it and GRANT for the others, in one request.
5. The confirm dialog shows the count and child's name; Esc cancels and sends nothing.
6. The receipt appears after success and the button cannot double-send.
7. A 409 shows "already answered by {name}".
8. A 404 shows the unlinked message; a 401 goes to sign-in.
9. Telugu renders the Approve button and the declaration in Telugu (no English fallback for these keys).
10. A notification with serviceName "Approvals" opens the matching detail.

Officer portal (existing suite): Consent tab shows Waiting, Seen and Answered; Remind disables at the limit; `i18n/coverage.test.js` passes.

End-to-end walk (manual, 10 minutes, goes into the workbook as flows F13 and F14):
1. Register a birth in the officer portal (UC2).
2. Officer: Decisions › Consent shows 3 or 4 rows, Citizen = Waiting.
3. Parent signs in to the citizen portal: Home banner says "1 approval waiting". The bell shows the notification.
4. Open it, switch to Telugu, choose Mother, tick the declaration, approve all, confirm.
5. Receipt shows. Officer: rows are Answered; Events › Trail shows the deliveries released.
6. A second parent login sees "Answered by {mother}" read-only.
7. Withdraw one line; the officer sees it revoked.

## 10. Build order for Cursor

1. Migration 014 and `notify.py`; backend tests 1-18 red, then green. Run: `MDM_DB_DSN=… pytest mdm-service/tests -q` (all older tests must still pass).
2. Citizen portal: API helper, `Approvals`, `ApprovalDetail`, receipt, Home banner, menu badge, bell link; frontend tests; `en.json` and `te.json`.
3. Officer portal: Consent tab column, filter, Remind; Telugu entries; coverage test.
4. Update `scripts/mdm_setup.sh` (014, `NOTIFY_ENABLED` note), `citizen-infra` manifests only if a new env var or URL is needed.
5. Stop and hand back for review. Do not rebuild images or touch the cluster; Sameer runs `bash officer-portal/build_portal.sh`, the citizen portal build, and `scripts/mdm_setup.sh`.

### Rules for Cursor (paste at the top of the Cursor chat)

- Read this file first. Follow the existing patterns in the files named here; do not add libraries.
- Do not touch DG2.0 (`egov`), keycloak realms, seed users or demo passwords.
- Never write real identity numbers, real names of clients or the firm's name into code, tests, seed data or docs. Use "the client" or invented names.
- Never run `git commit` or `git push`.
- A citizen route must identify the caller only from the sign-in token. Never accept a person id from the browser.
- Consequential changes are proposals approved by a person (D4). The citizen screens must not edit master data.
- Every user-visible string goes through the i18n files. Telugu is required.
- Keep functions small and tested. No `console.log` left in. No TODOs without an entry in the review notes.

## 11. What Claude checks in review

- Each test in section 9 exists, fails without the change, and passes with it; older suites still pass.
- A citizen cannot reach another person's approval by changing a key in the URL (read the SQL, not just the test).
- The write path goes through `exchange.respond`, so audit, ledger and delivery release behave as before.
- Notification failure cannot roll back or block a consent.
- Telugu strings are complete and read naturally; no English leaks in the approval flow.
- Screens at 360 px, keyboard-only, and with the service down.
- Nothing in the diff touches the excluded areas; no secrets, no real data.

## 12. Open questions for Sameer

1. Should a decline by one parent block the other parent from approving, or may the other parent still approve? Default in this spec: first answer wins, either way.
2. Reminder wording and timing: manual only from the officer screen (this spec), or automatic at day 3 and day 6 of a 7-day window?
3. Do we want OTP or re-entering the sign-in password before approving (extra assurance)? Not in this spec. The demo does not need it; production would.
4. Which "other approvals" matter most for the demo: confirm details, link child, or link family member? The spec builds the generic request and the first kind only (`CONFIRM_DETAILS`) unless you say otherwise.

---

# Status and roadmap (updated 5 Nov 2026)

## Status of this build
- Built by Cursor from this spec and reviewed by Claude: migration 014, the notifier, the citizen approvals API, the citizen portal screens (Home banner, menu badge, bell, Approvals list and detail, receipt, Please confirm), and the officer Consent changes (Citizen column, filter, Remind).
- Review 1 (see `Citizen_Approvals_Review_1.md`): eight items, all fixed. Claude re-ran its own probes on the fixed code: a household member or minor gets 403; the old respond route refuses a child's consent; a rejected parent match loses access; a dispute creates no officer proposal; the receipt heading follows the answers.
- Test results: Cursor reports 147+ backend tests, 15 citizen Approvals tests and the officer suite passing. Claude's separate run passes the approvals tests except where its own test database holds hundreds of leftover consents.
- Not yet run on the Mac cluster. Run, in order: `bash officer-portal/build_portal.sh`, the citizen portal build, `bash scripts/mdm_setup.sh`; then `kubectl -n citizen set env deployment/mdm-service NOTIFY_ENABLED=true` (the setup script resets it).
- Screen inventory workbook (`Claude outputs/Citizen_Services_Screen_Inventory.xlsx`) updated 5 Nov: new sheet Citizen portal (C01 to C12), flows F13 and F14, the Consent row S17 extended, five Known Gaps, a Citizen portal column in the Summary and instruction 13. The 4 Nov menu-name update had never reached this file, so it was applied in the same pass; eight earlier Pass results were kept and S06 was reset to Not tried. The file as it was is saved beside it as `Citizen_Services_Screen_Inventory_before_5Nov.xlsx`.

## Decisions still open
1. Whether a low-confidence parent match must wait for an officer before the parent sees the child's details (`MIN_MATCH_SCORE_TO_ANSWER`, now 0).
2. Whether a decline by one parent blocks the other (now: first answer wins, either way).
3. Reminders: manual only (now) or automatic.
4. Extra assurance (OTP) before approving: not built.

## Roadmap agreed 5 Nov
- Build one use case at a time, both citizen and officer sides. Citizen screens only where the citizen must act.
- Order: UC1, UC2, UC4, UC5, UC3, UC6. In the engine these are: UC1 one trusted record (matching and conflicts); UC2 birth; UC4 education scholarship eligibility (consent); UC5 household housing assistance (consent); UC3 death and pension eligibility (statutory, no consent); UC6 marriage (both spouses consent).
- Citizen screens expected: UC1 confirm or dispute a detail; UC2 parent approval (built); UC4 and UC5 the same approval screen with a different data list; UC6 two people must each approve; UC3 none (at most a notice).
- Three kinds of flow (confirmed by Sameer): consent flows (citizen decides, officer sees counts and exceptions); statutory flows (rules, sampling, hold before a risky action such as a pension stop); human-decision flows (grouped exception queue with batch approve and undo). Planning figures at 2,100 births and 700 deaths a day: about 7,500 birth deliveries and 3,500 death actions a day; if about 5% need a person, about 140 items a day across departments. These are assumptions to measure in the demo.
- Next designs: the shared officer side (flow view per department, exception queue grouped by reason, batch approve with a sample preview and undo window, hold before act, audit sampling, a volume simulator in the scenario runner); then short specs for UC1 and UC4.

## Telugu for the citizen portal and chatbot (findings 5 Nov)
- Citizen portal: `te.json` has all 1,083 English keys (3 values identical to English); about 24 labels and 15 placeholders or tooltips in the screens are typed into the code and never reach the Telugu file. Claude writes the Telugu and the team reviews through a review sheet (English, Claude's Telugu, correction, verdict), applied back to `te.json` by script.
- Chatbot (`chatbot-service`): rule-based (intent detector plus fixed message tables), English and Gujarati only. The portal sends `te`, which the service treats as English. Telugu needs a Telugu message table (about 90 messages), Telugu trigger words, the language switch changed from Gujarati to Telugu, and the portal language passed through. Voice (Telugu speech to text and back, possibly through Bhashini; the config has an unused `BHASHINI` mode) is the open part.
