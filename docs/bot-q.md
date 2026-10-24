# Citizen chatbot — questions to ask (voice or text)

Use these on the citizen portal chatbot (`:30074`), typed or spoken. English and Gujarati both work.

Login as **Priya Patel** (`XXXX-XXXX-1001` / OTP `123456`) for the best demo answers.

The bot is keyword-based, not a free-form LLM. Stay close to the lines below. After it replies, answer its follow-up (name, caste category, Aadhaar, application number).

---

## Best demo openers

English:

- I want to apply for a caste certificate
- Apply for old age pension
- Which schemes is my family eligible for?
- Track my application
- Show my certificates
- Show my payments
- I want to file a grievance
- Apply for BPL ration card
- I want to apply for a government service

Gujarati (voice works well on these):

- જ્ઞાતિ પ્રમાણપત્ર
- પેન્શન અરજી
- મારા પરિવાર કઈ યોજના મળે?
- અરજીની સ્થિતિ
- મારા પ્રમાણપત્ર જુઓ
- ચૂકવણી
- ફરિયાદ નોંધાવ
- રેશન કાર્ડ

---

## 1. Apply — Caste Certificate

- Apply for caste certificate
- I need a caste certificate
- Caste cert
- OBC certificate
- જ્ઞાતિ પ્રમાણપત્ર
- જ્ઞાતિ

Follow-ups the bot will ask: full name → caste category (`SC` / `ST` / `OBC` / `NT` / `General`) → Aadhaar (`XXXX-XXXX-NNNN`).

Priya already has a caste application; the bot may say it is already pending or issued.

---

## 2. Apply — Pension

- Apply for pension
- Old age pension
- Widow pension
- Disability pension
- પેન્શન
- વૃદ્ધ પેન્શન
- વિધવા પેન્શન

Follow-ups: pension type → Aadhaar → name.

---

## 3. Apply — Scheme / BPL ration

- Apply for BPL ration card
- I need a ration card
- Apply for a welfare scheme
- રેશન કાર્ડ
- અનાજ

Opens the Common Application Form (CAF).

---

## 4. Apply — service menu

- I want to apply for a government service
- Government services
- સરકારી સેવા

Bot lists Caste Certificate, Pension, Marriage Certificate, Scheme Application, Family Member Change.

---

## 5. Eligible schemes

- Which schemes is my family eligible for?
- What yojana do I qualify for?
- Show eligible schemes
- મારા પરિવાર કઈ સ્કીમ મળે?
- યોજના
- પાત્ર

Follow-up: Aadhaar. For Priya use `XXXX-XXXX-1001`.

Do **not** start with “check” here — that word routes to status tracking.

---

## 6. Track application status

- Track my application
- What is my application status?
- Where is my application?
- CAS-2608-000001
- PEN-2608-000001
- સ્થિતિ
- ટ્રેક

If you do not paste a number, the bot lists applications on the logged-in account, or asks for a number (`CAS-…`, `PEN-…`, `MAR-…`, `FAM-…`, `SCH-…`, `GRV-…`).

---

## 7. Certificates

- Show my certificates
- Download my certificate
- View my certificates
- મારા પ્રમાણપત્ર જુઓ
- પ્રમાણપત્ર ડાઉનલોડ

Opens My Certificates.

---

## 8. Payments and benefits

- Show my payments
- Payments and benefits
- Disbursement
- ચૂકવણી

Opens Payments & Benefits.

---

## 9. Grievance / complaint

- I want to file a grievance
- Submit a complaint
- Lodge a complaint
- ફરિયાદ
- ફરિયાદ નોંધાવ

Opens Grievances.

---

## Voice tips

- Speak one short sentence. Pause after the bot replies.
- Gujarati: use the lines in the **Best demo openers** section.
- English: prefer “apply for…”, “track…”, “eligible schemes”, “show my certificates”.
- Avoid mixing two intents in one utterance (e.g. “apply for caste and also track status”).

## Words that change the intent

| If you say | Bot treats it as |
|---|---|
| status, track, check, where, CAS-/PEN-… | Application status |
| scheme, yojana, eligible, પાત્ર | Scheme eligibility |
| caste, OBC, SC, ST, જ્ઞાતિ | Caste certificate apply |
| pension, old age, widow, પેન્શન | Pension apply |
| ration, BPL, રેશન | Scheme / CAF apply |
| grievance, complaint, ફરિયાદ | Grievance page |
| certificate + show/download/my | Certificates page |
| payment, disbursement, ચૂકવણી | Payments page |

Unknown phrasing falls back to: *Caste Certificate, Pension, Status check, Eligible schemes*.
