-- Demo fraud signal cases for hero families (idempotent)
-- Run against citizen_db after demo_beneficiaries.sql

SET search_path TO scheme_engine, family_registry, public;

-- 1. MULTI_SCHEME_OVERLAP — Kavita Rathod in Widow Pension + CM Girl Child Grant
INSERT INTO scheme_engine.beneficiary (
  id, scheme_id, family_id, person_id, person_name,
  family_village, family_district, family_taluka,
  status, identified_at, confirmed_at
)
SELECT gen_random_uuid(),
       'a1000001-0000-0000-0000-000000000005',
       'a5000000-0000-0000-0000-000000000005',
       '50000001-0000-0000-0000-000000000001',
       'Kavita Rathod', 'Deesa', 'Banaskantha', 'Deesa',
       'CONFIRMED', NOW() - INTERVAL '4 days', NOW() - INTERVAL '1 day'
WHERE NOT EXISTS (
  SELECT 1 FROM scheme_engine.beneficiary b
  WHERE b.person_id = '50000001-0000-0000-0000-000000000001'
    AND b.scheme_id = 'a1000001-0000-0000-0000-000000000005'
);

UPDATE beneficiary
SET status = 'CONFIRMED', confirmed_at = COALESCE(confirmed_at, NOW())
WHERE person_id = '50000001-0000-0000-0000-000000000001'
  AND scheme_id IN (
    'a1000001-0000-0000-0000-000000000004',
    'a1000001-0000-0000-0000-000000000005'
  )
  AND status IN ('IDENTIFIED', 'CONFIRMED', 'ACTIVE');

-- 2. INCOME_CLIFF — Patel household (Priya ₹48,000 + Ramesh ₹55,000)
UPDATE person SET annual_income = 48000 WHERE id = '10000001-0000-0000-0000-000000000001';
UPDATE person SET annual_income = 55000 WHERE id = '10000002-0000-0000-0000-000000000001';
UPDATE beneficiary
SET status = 'CONFIRMED', confirmed_at = COALESCE(confirmed_at, NOW())
WHERE person_id = '10000005-0000-0000-0000-000000000001'
  AND scheme_id = 'a1000001-0000-0000-0000-000000000001'
  AND status IN ('IDENTIFIED', 'CONFIRMED', 'ACTIVE');

-- 3. AGE_ANOMALY — Bhikabhai Solanki (age > 100)
UPDATE person SET dob = '1920-03-10' WHERE id = '30000005-0000-0000-0000-000000000001';

INSERT INTO scheme_engine.beneficiary (id, scheme_id, family_id, person_id, person_name, family_village, status, identified_at, confirmed_at)
SELECT gen_random_uuid(), 'a1000001-0000-0000-0000-000000000001',
       'a3000000-0000-0000-0000-000000000003', '30000005-0000-0000-0000-000000000001',
       'Bhikabhai Solanki', 'Waghodia', 'CONFIRMED', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days'
WHERE NOT EXISTS (
  SELECT 1 FROM scheme_engine.beneficiary b
  WHERE b.person_id = '30000005-0000-0000-0000-000000000001'
    AND b.scheme_id = 'a1000001-0000-0000-0000-000000000001'
);

UPDATE scheme_engine.beneficiary
SET status = 'CONFIRMED', confirmed_at = COALESCE(confirmed_at, NOW())
WHERE person_id = '30000005-0000-0000-0000-000000000001'
  AND scheme_id = 'a1000001-0000-0000-0000-000000000001';

-- 4. FAMILY_INCOME_MISMATCH — Rathod family: deceased Suresh high income, living total < ₹50k
UPDATE person SET annual_income = 250000, is_alive = false
WHERE id = '50000002-0000-0000-0000-000000000001';

UPDATE person SET annual_income = 15000 WHERE id = '50000001-0000-0000-0000-000000000001';
UPDATE person SET annual_income = 0 WHERE id IN (
  '50000003-0000-0000-0000-000000000001',
  '50000004-0000-0000-0000-000000000001'
);
