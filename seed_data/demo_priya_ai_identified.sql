-- AI "Schemes eligible for" on citizen My Family.
-- The recommender only returns scheme_engine.beneficiary rows with status IDENTIFIED.
-- demo_payments_seed.sql confirms BPL / OAP / scholarship for the payments timeline,
-- which left this family with nothing IDENTIFIED — so the AI panel rendered empty.
-- These rows are additional schemes the family qualifies for and is not already availing.

SET search_path TO scheme_engine;

BEGIN;

INSERT INTO beneficiary (
    id, scheme_id, family_id, person_id, person_name,
    family_village, family_district, family_taluka,
    status, identified_at, eligibility_reason, caste_category, gender
)
SELECT v.id, v.scheme_id, 'a1000000-0000-0000-0000-000000000001',
       v.person_id, v.person_name, 'Bavla', 'Ahmedabad', 'Dholka',
       'IDENTIFIED', NOW() - INTERVAL '1 day', v.reason, 'OBC', v.gender
FROM (VALUES
    ('c1000001-0000-0000-0000-000000000001'::uuid,
     'b1000001-0000-0000-0000-000000000015'::uuid,
     '10000001-0000-0000-0000-000000000001',
     'Priya Patel', 'F',
     'Caste OBC in eligible list|Income ₹1.03L < ₹3.00L (ceiling)'),
    ('c1000001-0000-0000-0000-000000000002'::uuid,
     'b1000001-0000-0000-0000-000000000004'::uuid,
     '10000001-0000-0000-0000-000000000001',
     'Priya Patel', 'F',
     'Gender female|Age 41 ≥ 21 (minimum)|Age 41 ≤ 55 (maximum)|Caste OBC in eligible list'),
    ('c1000001-0000-0000-0000-000000000003'::uuid,
     'b1000001-0000-0000-0000-000000000005'::uuid,
     '10000001-0000-0000-0000-000000000001',
     'Priya Patel', 'F',
     'Gender female|Age 41 ≥ 18 (minimum)|Age 41 ≤ 45 (maximum)|Caste OBC in eligible list'),
    ('c1000001-0000-0000-0000-000000000004'::uuid,
     'b1000001-0000-0000-0000-000000000013'::uuid,
     '10000002-0000-0000-0000-000000000001',
     'Ramesh Patel', 'M',
     'Age 43 ≥ 21 (minimum)|Income ₹1.03L < ₹1.50L (ceiling)|Caste OBC in eligible list'),
    ('c1000001-0000-0000-0000-000000000005'::uuid,
     'b1000001-0000-0000-0000-000000000008'::uuid,
     '10000002-0000-0000-0000-000000000001',
     'Ramesh Patel', 'M',
     'Age 43 ≥ 21 (minimum)|Age 43 ≤ 70 (maximum)|Caste OBC in eligible list'),
    ('c1000001-0000-0000-0000-000000000006'::uuid,
     'b1000001-0000-0000-0000-000000000012'::uuid,
     '10000001-0000-0000-0000-000000000001',
     'Priya Patel', 'F',
     'Age 41 ≥ 21 (minimum)|Age 41 ≤ 55 (maximum)|Caste OBC in eligible list'),
    ('c1000001-0000-0000-0000-000000000007'::uuid,
     'b1000001-0000-0000-0000-000000000003'::uuid,
     '10000005-0000-0000-0000-000000000001',
     'Savitaben Patel', 'F',
     'Age 65 ≥ 65 (minimum)|Caste OBC in eligible list'),
    ('c1000001-0000-0000-0000-000000000008'::uuid,
     'b1000001-0000-0000-0000-000000000009'::uuid,
     '10000002-0000-0000-0000-000000000001',
     'Ramesh Patel', 'M',
     'Age 43 ≥ 18 (minimum)|Age 43 ≤ 65 (maximum)|Caste OBC in eligible list')
) AS v(id, scheme_id, person_id, person_name, gender, reason)
WHERE NOT EXISTS (
    SELECT 1 FROM beneficiary b
    WHERE b.family_id = 'a1000000-0000-0000-0000-000000000001'
      AND b.scheme_id = v.scheme_id
      AND b.status IN ('IDENTIFIED', 'CONFIRMED', 'ACTIVE')
);

COMMIT;
