SET search_path TO family_registry;

BEGIN;

-- Bhavesh Patel (deceased HEAD, father-in-law)
INSERT INTO person (id, name, dob, gender, aadhaar_ref, occupation, annual_income, caste_category, is_alive, mobile)
VALUES ('b1000000-0000-0000-0000-000000000000', 'Bhavesh Patel', '1954-03-10', 'M',
        'XXXX-XXXX-1000', 'Retired Farmer', 0, 'OBC', false, '9999000000')
ON CONFLICT (aadhaar_ref) DO NOTHING;

INSERT INTO family_member (family_id, person_id, relationship_to_head)
VALUES ('a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000', 'HEAD')
ON CONFLICT DO NOTHING;

-- Priya: effective head data, no longer registry HEAD
UPDATE person SET occupation = 'ASHA Worker', annual_income = 48000
WHERE aadhaar_ref = 'XXXX-XXXX-1001';

UPDATE family SET ration_card_number = '241234567800000101'
WHERE id = 'a1000000-0000-0000-0000-000000000001';

UPDATE family SET ration_card_number = '241234567800000201'
WHERE id = 'a2000000-0000-0000-0000-000000000002';

UPDATE family SET ration_card_number = '241234567800000501'
WHERE id = 'a5000000-0000-0000-0000-000000000005';

UPDATE family_member SET relationship_to_head = 'OTHER'
WHERE family_id = 'a1000000-0000-0000-0000-000000000001'
  AND person_id = '10000001-0000-0000-0000-000000000001';

-- Ramesh Patel
UPDATE person SET name = 'Ramesh Patel', dob = '1983-07-15', occupation = 'Daily Wage',
                  annual_income = 60000, mobile = '9898100002'
WHERE aadhaar_ref = 'XXXX-XXXX-1002';

UPDATE family_member SET relationship_to_head = 'SPOUSE'
WHERE family_id = 'a1000000-0000-0000-0000-000000000001'
  AND person_id = '10000002-0000-0000-0000-000000000001';

-- Shreya Patel (was Ananya) — aadhaar XXXX-1003
UPDATE person SET name = 'Shreya Patel', dob = '2008-09-01', gender = 'F',
                  occupation = 'Student', aadhaar_ref = 'XXXX-XXXX-1003-tmp'
WHERE aadhaar_ref = 'XXXX-XXXX-1004';

UPDATE person SET name = 'Arjun Patel', dob = '2013-05-20', gender = 'M',
                  occupation = 'Student', aadhaar_ref = 'XXXX-XXXX-1004'
WHERE aadhaar_ref = 'XXXX-XXXX-1003';

UPDATE person SET aadhaar_ref = 'XXXX-XXXX-1003'
WHERE aadhaar_ref = 'XXXX-XXXX-1003-tmp';

UPDATE family_member SET relationship_to_head = 'DAUGHTER'
WHERE family_id = 'a1000000-0000-0000-0000-000000000001'
  AND person_id = '10000004-0000-0000-0000-000000000001';

UPDATE family_member SET relationship_to_head = 'SON'
WHERE family_id = 'a1000000-0000-0000-0000-000000000001'
  AND person_id = '10000003-0000-0000-0000-000000000001';

-- Savitaben Patel (was Kantaben)
UPDATE person SET name = 'Savitaben Patel', dob = '1960-11-05', occupation = 'Homemaker',
                  mobile = '9999000005'
WHERE aadhaar_ref = 'XXXX-XXXX-1005';

UPDATE family_member SET relationship_to_head = 'MOTHER_IN_LAW'
WHERE family_id = 'a1000000-0000-0000-0000-000000000001'
  AND person_id = '10000005-0000-0000-0000-000000000001';

-- Anjali Solanki — turns 18 today for birthday-trigger demo (Phase 24)
INSERT INTO person (id, name, dob, gender, aadhaar_ref, occupation, annual_income, caste_category, is_alive, mobile)
VALUES ('30000007-0000-0000-0000-000000000001', 'Anjali Solanki',
        CURRENT_DATE - INTERVAL '18 years', 'F', 'XXXX-XXXX-3007', 'student', 0, 'ST', true, '9876543007')
ON CONFLICT (aadhaar_ref) DO UPDATE SET
  name = EXCLUDED.name,
  dob = EXCLUDED.dob,
  gender = EXCLUDED.gender;

INSERT INTO family_member (family_id, person_id, relationship_to_head)
VALUES ('a3000000-0000-0000-0000-000000000003', '30000007-0000-0000-0000-000000000001', 'DAUGHTER')
ON CONFLICT DO NOTHING;

COMMIT;
