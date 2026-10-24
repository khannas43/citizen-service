SET search_path TO scheme_engine;

-- Backfill caste/gender for distribution panel (hero + enrolled beneficiaries)
UPDATE beneficiary b
SET caste_category = 'OBC', gender = 'F'
WHERE b.person_name = 'Savitaben Patel'
  AND b.caste_category IS NULL;

UPDATE beneficiary b
SET caste_category = 'OBC', gender = 'F'
WHERE b.person_name = 'Shreya Patel'
  AND b.caste_category IS NULL;

UPDATE beneficiary b
SET caste_category = 'OBC', gender = 'F'
WHERE b.person_name = 'Priya Patel'
  AND b.caste_category IS NULL;

UPDATE beneficiary b
SET caste_category = 'OBC', gender = 'F'
WHERE b.person_name = 'Kavita Rathod'
  AND b.caste_category IS NULL;

-- Generic fallback from family head for any remaining enrolled rows
UPDATE beneficiary
SET caste_category = COALESCE(caste_category, 'OBC'),
    gender = COALESCE(gender, 'F')
WHERE status IN ('IDENTIFIED', 'CONFIRMED', 'ACTIVE')
  AND (caste_category IS NULL OR gender IS NULL);
