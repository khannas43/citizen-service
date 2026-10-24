SET search_path TO scheme_engine;

-- Bhavesh — Old Age Pension REMOVED (deceased)
INSERT INTO beneficiary (id, scheme_id, family_id, person_id, person_name, family_village, family_district, family_taluka, status,
                         identified_at, removed_at, removal_reason)
SELECT gen_random_uuid(), 'a1000001-0000-0000-0000-000000000001',
       'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000',
       'Bhavesh Patel', 'Bavla', 'Ahmedabad', 'Dholka', 'REMOVED', NOW() - INTERVAL '30 days',
       NOW() - INTERVAL '7 days', 'MEMBER_DECEASED'
WHERE NOT EXISTS (
  SELECT 1 FROM beneficiary b
  WHERE b.person_id = 'b1000000-0000-0000-0000-000000000000'
    AND b.scheme_id = 'a1000001-0000-0000-0000-000000000001'
);

-- Savitaben — Old Age Pension IDENTIFIED
INSERT INTO beneficiary (id, scheme_id, family_id, person_id, person_name, family_village, family_district, family_taluka, status, identified_at)
SELECT gen_random_uuid(), 'a1000001-0000-0000-0000-000000000001',
       'a1000000-0000-0000-0000-000000000001', '10000005-0000-0000-0000-000000000001',
       'Savitaben Patel', 'Bavla', 'Ahmedabad', 'Dholka', 'IDENTIFIED', NOW() - INTERVAL '2 days'
WHERE NOT EXISTS (
  SELECT 1 FROM beneficiary b
  WHERE b.person_id = '10000005-0000-0000-0000-000000000001'
    AND b.scheme_id = 'a1000001-0000-0000-0000-000000000001'
);

-- Shreya — OBC Scholarship IDENTIFIED
INSERT INTO beneficiary (id, scheme_id, family_id, person_id, person_name, family_village, family_district, family_taluka, status, identified_at)
SELECT gen_random_uuid(), 'a1000001-0000-0000-0000-000000000002',
       'a1000000-0000-0000-0000-000000000001', '10000004-0000-0000-0000-000000000001',
       'Shreya Patel', 'Bavla', 'Ahmedabad', 'Dholka', 'IDENTIFIED', NOW() - INTERVAL '2 days'
WHERE NOT EXISTS (
  SELECT 1 FROM beneficiary b
  WHERE b.person_id = '10000004-0000-0000-0000-000000000001'
    AND b.scheme_id = 'a1000001-0000-0000-0000-000000000002'
);

-- Priya family — BPL Ration Card IDENTIFIED
INSERT INTO beneficiary (id, scheme_id, family_id, person_id, person_name, family_village, family_district, family_taluka, status, identified_at)
SELECT gen_random_uuid(), 'a1000001-0000-0000-0000-000000000003',
       'a1000000-0000-0000-0000-000000000001', '10000001-0000-0000-0000-000000000001',
       'Priya Patel', 'Bavla', 'Ahmedabad', 'Dholka', 'IDENTIFIED', NOW() - INTERVAL '2 days'
WHERE NOT EXISTS (
  SELECT 1 FROM beneficiary b
  WHERE b.person_id = '10000001-0000-0000-0000-000000000001'
    AND b.scheme_id = 'a1000001-0000-0000-0000-000000000003'
);

-- Gopal Nair (Rajan's deceased father) — pension REMOVED
INSERT INTO beneficiary (id, scheme_id, family_id, person_id, person_name, family_village, family_district, family_taluka, status,
                         identified_at, removed_at, removal_reason)
SELECT gen_random_uuid(), 'a1000001-0000-0000-0000-000000000001',
       'a2000000-0000-0000-0000-000000000002', '20000004-0000-0000-0000-000000000001',
       'Gopal Nair', 'Katargam', 'Surat', 'Katargam', 'REMOVED', NOW() - INTERVAL '30 days',
       NOW() - INTERVAL '15 days', 'MEMBER_DECEASED'
WHERE NOT EXISTS (
  SELECT 1 FROM beneficiary b
  WHERE b.person_id = '20000004-0000-0000-0000-000000000001'
    AND b.scheme_id = 'a1000001-0000-0000-0000-000000000001'
);

-- Kavita Rathod — Widow Pension IDENTIFIED
INSERT INTO beneficiary (id, scheme_id, family_id, person_id, person_name, family_village, family_district, family_taluka, status, identified_at)
SELECT gen_random_uuid(), 'a1000001-0000-0000-0000-000000000004',
       'a5000000-0000-0000-0000-000000000005', '50000001-0000-0000-0000-000000000001',
       'Kavita Rathod', 'Deesa', 'Banaskantha', 'Deesa', 'IDENTIFIED', NOW() - INTERVAL '3 days'
WHERE NOT EXISTS (
  SELECT 1 FROM beneficiary b
  WHERE b.person_id = '50000001-0000-0000-0000-000000000001'
    AND b.scheme_id = 'a1000001-0000-0000-0000-000000000004'
);
