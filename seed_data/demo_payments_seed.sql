-- Payments & Benefits seed — pre-seeds disbursement history for Priya's family
-- Run against citizen_db after demo_beneficiaries.sql
-- Schema: scheme_engine

SET search_path TO scheme_engine;

BEGIN;

-- Card 1: Savitaben — Old Age Pension — Jun 2026 disbursement
-- Scoped off the extra monthly row (f4000001…) so a re-run cannot turn both
-- payouts into the same June 2026 / GOV-TXN-9821 pair.
UPDATE beneficiary
SET status             = 'CONFIRMED',
    confirmed_at       = '2026-03-01 10:00:00',
    disbursement_status = 'DISBURSED',
    disbursement_ref   = 'GOV-TXN-9821',
    disbursed_at       = '2026-06-01 09:00:00',
    amount             = 1250
WHERE person_id  = '10000005-0000-0000-0000-000000000001'
  AND scheme_id  = 'a1000001-0000-0000-0000-000000000001'
  AND family_id  = 'a1000000-0000-0000-0000-000000000001'
  AND id        <> 'f4000001-0000-0000-0000-000000000001';

-- Card 2: Shreya — OBC Scholarship — May 2026 disbursement
UPDATE beneficiary
SET status             = 'CONFIRMED',
    confirmed_at       = '2026-04-01 10:00:00',
    disbursement_status = 'DISBURSED',
    disbursement_ref   = 'GOV-TXN-8834',
    disbursed_at       = '2026-05-15 09:00:00',
    amount             = 5000
WHERE person_id  = '10000004-0000-0000-0000-000000000001'
  AND scheme_id  = 'a1000001-0000-0000-0000-000000000002'
  AND family_id  = 'a1000000-0000-0000-0000-000000000001';

-- Card 3: Priya family — BPL Ration Subsidy — May 2026 disbursement
UPDATE beneficiary
SET status             = 'CONFIRMED',
    confirmed_at       = '2026-02-01 10:00:00',
    disbursement_status = 'DISBURSED',
    disbursement_ref   = 'GOV-TXN-7712',
    disbursed_at       = '2026-05-01 09:00:00',
    amount             = 850
WHERE person_id  = '10000001-0000-0000-0000-000000000001'
  AND scheme_id  = 'a1000001-0000-0000-0000-000000000003'
  AND family_id  = 'a1000000-0000-0000-0000-000000000001';

-- Card 4: Savitaben — Old Age Pension — Jul 2026 (second monthly disbursement)
INSERT INTO beneficiary (
    id, scheme_id, family_id, person_id, person_name,
    family_village, family_district, family_taluka,
    status, identified_at, confirmed_at,
    disbursement_status, disbursement_ref, disbursed_at, amount,
    eligibility_reason
)
SELECT
    'f4000001-0000-0000-0000-000000000001',
    'a1000001-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    '10000005-0000-0000-0000-000000000001',
    'Savitaben Patel',
    'Bavla', 'Ahmedabad', 'Bavla',
    'CONFIRMED', '2026-01-15 10:00:00', '2026-02-01 10:00:00',
    'DISBURSED', 'GOV-TXN-9910', '2026-07-01 09:00:00', 1250,
    'Age >= 60; OBC category; Annual income <= 120000'
WHERE NOT EXISTS (
    SELECT 1 FROM beneficiary WHERE id = 'f4000001-0000-0000-0000-000000000001'
);

UPDATE beneficiary
SET status              = 'CONFIRMED',
    disbursement_status = 'DISBURSED',
    disbursement_ref    = 'GOV-TXN-9910',
    disbursed_at        = '2026-07-01 09:00:00',
    amount              = 1250
WHERE id = 'f4000001-0000-0000-0000-000000000001';

-- Card 5: Widow Pension for Priya — IDENTIFIED (processing, no disbursement yet)
UPDATE beneficiary
SET status = 'IDENTIFIED',
    amount = 1250
WHERE person_id = (
    SELECT id::text FROM family_registry.person WHERE aadhaar_ref = 'XXXX-XXXX-1001' LIMIT 1
)
  AND scheme_id = 'a1000001-0000-0000-0000-000000000004'
  AND family_id = 'a1000000-0000-0000-0000-000000000001';

COMMIT;
