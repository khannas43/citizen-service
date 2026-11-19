"""The 35 scripted scenarios and 9 cross-cutting tests from the firm's implementation plan (text kept as written there).
id, use case, positive (+) or negative (-) case, scenario, what the plan says we show."""

SCENARIOS = [
    ('1.1', 'UC1', '+', 'Recognise one person across civil registration, revenue, PDS, pension MIS and the identity service despite spelling and transliteration variants', 'Linkage detail page: per-attribute score, confidence, provenance, and the audit entry'),
    ('1.2', 'UC1', '+', 'Show parent-child and spouse relationships and the household across systems', 'Relationship graph with source and validity on every edge'),
    ('1.3', 'UC1', '-', 'Two sources disagree on date of birth or name', 'Conflict list, the rule that fired, and the unchanged source value'),
    ('1.4', 'UC1', '-', 'Two plausible candidates for one record (a father and son with the same name)', 'Review queue, reviewer decision with reason, audit entry'),
    ('1.5', 'UC1', '-', 'A person has no identity reference', 'Alternative linkage path and the lower-assurance label'),
    ('1.6', 'UC1', '-', 'A citizen reports a wrong attribute', 'Correction ticket, status trail, and the downstream notification'),
    ('2.1', 'UC2', '+', 'Civil registration publishes a birth event; subscribed systems are notified', 'Event schema, subscription config, per-subscriber delivery receipts'),
    ('2.2', 'UC2', '+', 'The parent consents to some downstream uses but not others', 'Consent screen, consent record, audit entries naming the consent'),
    ('2.3', 'UC2', '-', 'A subscribing system is unavailable when the event is published', 'Stop one adapter live, show retries and the dead-letter entry, restart, replay, then the citizen message'),
    ('2.4', 'UC2', '=', 'Live step: the Health system goes down', 'Whatever the parent approves for Health waits and is retried; it is never shown as shared'),
    ('2.5', 'UC2', '=', 'Live step: the Health system comes back', 'Retries and replays deliver what was waiting; the parent now sees it as shared'),
    ('2.6', 'UC2', '-', 'Child registered without a name; the name is added later', 'Partial record, then the amendment applied to the same subject'),
    ('2.7', 'UC2', '-', 'Registration is delayed by months, so the event arrives late', 'A late event, the window rule, and the lapsed item shown for review'),
    ('2.8', 'UC2', '=', 'Live step: a second child is registered late and without a name', 'A held birth: no child record, no consent request, nothing sent'),
    ('2.9', 'UC2', '=', 'Live step: the name arrives', 'The same child is created, flagged as a late registration, and consent is asked now'),
    ('2.10', 'UC2', '-', 'Parent details differ from other records', 'Ambiguity flag, review task, blocked downstream notification'),
    ('2.11', 'UC2', '-', 'The parent declines or does not respond', 'Expired request, reminder cap in config, empty audit for blocked flows'),
    ('2.12', 'UC2', '=', 'Live step: a third child is registered and the parent does not answer', 'Consent requests waiting, nothing sent'),
    ('2.13', 'UC2', '=', 'Live step: the response time runs out', 'Requests expire, every department stays blocked, the parent sees Expired'),
    ('3.1', 'UC3', '+', 'A death is registered; the surviving spouse is linked; pension eligibility and household updates are proposed', 'Proposal card with the evidence chain, awaiting confirmation'),
    ('3.2', 'UC3', '+', 'A benefit stops only after an authorised officer approves', 'Role-gated approval, rationale text, audit entry, outbound stop instruction'),
    ('3.3', 'UC3', '-', 'Death occurred outside Telangana or was never registered', 'A query for an unregistered person returning "no record" with no proposal raised'),
    ('3.4', 'UC3', '-', 'No identifiable spouse or nominee, or a dispute is raised', 'Dispute flag, frozen proposals, officer-only decision'),
    ('3.5', 'UC3', '-', 'The person has a benefit payment in flight', 'A proposal dated to the next cycle, a repeat event ignored, and the in-flight payment untouched'),
    ('3.6', 'UC3', '=', 'Live step: a pensioner dies; his wife, ration card and land record are on file, a payment is due', 'A proposal to confirm, then proposals for the pension stop, card, land and the wife; nothing changes until an officer approves'),
    ('3.7', 'UC3', '=', 'Live step: a pensioner with no spouse and no nominee dies', 'A proposal to confirm, then a task to trace the next of kin'),
    ('3.8', 'UC3', '=', 'Live step: a death fits two living men with the same name', 'No pre-selection and no follow-ups until an officer chooses'),
    ('3.9', 'UC3', '=', 'Live step: a death outside the state for someone the registry does not hold', 'No match, no proposal, and a note that this does not mean the person is alive'),
    ('3.10', 'UC3', '=', 'Live step: the same death is sent a second time', 'The repeat is ignored and no second proposal appears'),
    ('4.1', 'UC4', '+', 'Answer eligibility questions (income band, category, residence) from authoritative sources', 'Query result with validity period, and an audit entry showing no document moved'),
    ('4.2', 'UC4', '+', 'The applicant turns 18', 'Guardian consent ending, notification, new consent from the individual'),
    ('4.3', 'UC4', '-', 'The source certificate has expired or cannot be found', 'Expired-certificate result and the routed request'),
    ('4.4', 'UC4', '-', 'Income or category differs across sources', 'Conflict card and the absence of any silent choice'),
    ('4.5', 'UC4', '-', 'Consent is withdrawn mid-application', 'Before-and-after view: what stopped, what remains, and the purge evidence'),
    ('4.6', 'UC4', '-', 'The applicant is from another state', 'No-record result and the manual-route task'),
    ('4.7', 'UC4', '=', 'Live step: the student applies and her parent is asked', 'A consent card for the parent, and a read-only card for the student'),
    ('4.8', 'UC4', '=', 'Live step: the student turns 18', 'Her date of birth moves so she is 18 now; the next daily check hands consent over to her'),
    ('5.1', 'UC5', '+', 'A housing application checks existing housing benefit and land or property holdings across systems', 'One composed answer, per-source breakdown, and audit entries showing no bulk transfer'),
    ('5.2', 'UC5', '+', 'An electricity connection is linked to a household for an eligibility check', 'Linkage explanation: basis, confidence, and what would raise it'),
    ('5.3', 'UC5', '-', 'Addresses differ across systems (spelling, ward or village names)', 'Normalisation steps, a resolved case and an unresolved case'),
    ('5.4', 'UC5', '-', 'Tenant versus owner, or a ration card shared by more than one household', 'Household model view with roles; review task for the shared card'),
    ('5.5', 'UC5', '-', 'A possible duplicate benefit is detected', "Alert with minimal content, and the other department's decision step"),
    ('5.6', 'UC5', '-', 'A land or property record has not been updated', 'Stale flag, freshness limit in the catalogue, and the custodian signal'),
    ('5.7', 'UC5', '=', 'Live step: plant the five housing cases and a housing applicant', 'Four work queue groups and one clean case; the applicant (sign-in 2801) has a housing consent card waiting'),
    ('6.1', 'UC6', '+', 'A marriage is registered or queried; both parties consent separately; relationship, name change and household updates are proposed', 'Two consent records, the spouse edge created, and three proposals awaiting confirmation'),
    ('6.2', 'UC6', '-', 'Only one party consents', 'One-sided result with nothing about the second person'),
    ('6.3', 'UC6', '-', 'The marriage was registered under another registrar and no digital record exists', 'No-record result, declared fallback and its label'),
    ('6.4', 'UC6', '-', 'A record indicates a party is below the legal minimum age', 'Stopped flow, officer-only task, no downstream notices, and the policy setting'),
    ('6.5', 'UC6', '-', 'A surname or name change creates a mismatch across records', 'Same person linked before and after the name change, with the alias trail'),
]

CROSS_CUTTING = [
    ('CC1', "CC", 'Consent lifecycle', 'Grant, partial grant, refusal, expiry, revocation and guardian consent, followed by the downstream party losing access after revocation', 'Consent record, revocation effect in the audit log'),
    ('CC2', "CC", 'Assisted channel', 'An operator acts for a present citizen; consent capture, evidence and limits on what an operator can do', 'Operator identity, citizen-presence evidence, rate limits'),
    ('CC3', "CC", 'Live onboarding', 'We add a new simulated system during the session using configuration only; we time each step and record what had to be coded', 'Connector configuration, catalogue entry, step timings'),
    ('CC4', "CC", 'Resilience', 'Take one department offline; show retries, duplicates and out-of-order messages being handled, and what the citizen and operator see', 'Retry and dead-letter trail, replay, citizen message'),
    ('CC5', "CC", 'Misuse and security', 'An authorised user makes an over-broad query, repeats look-ups of one person, or uses a stolen token. Controls, limits, detection and alerts respond.', 'Alert, blocked request, token revocation'),
    ('CC6', "CC", 'Transparency and audit', "A citizen sees who accessed their data, when and why; an auditor's view proves the trail cannot be altered", 'Citizen view, hash-chain verification'),
    ('CC7', "CC", 'Persistence and purge', 'Show what the platform holds after a transaction, where, and for how long, then show verified deletion', 'Data inventory and purge receipt'),
    ('CC8', "CC", 'Policy change', 'Change a sharing policy or eligibility threshold during a live flow and show when it takes effect and how existing consents and in-flight transactions are treated', 'Policy version history, in-flight handling'),
    ('CC9', "CC", 'Load smoke test', "A short burst against the platform's query path to show behaviour under load, run indicatively and evidenced in writing", 'Throughput and latency report'),
]


def title_of(sid):
    """The scenario's short title for a label, or None for an unknown id. An injected event is labelled by its kind."""
    if sid and str(sid).startswith("INJECT-"):
        return "Injected event: " + str(sid)[7:].replace("_", " ").lower()
    for row in SCENARIOS:
        if row[0] == sid:
            return row[3]
    for row in CROSS_CUTTING:
        if row[0] == sid:
            return row[2]
    return None
