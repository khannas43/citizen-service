SET search_path TO scheme_engine;

-- Hero beneficiaries for Scene 10 (eligibility reason chips in officer portal)

UPDATE beneficiary
SET eligibility_reason = 'Age 65 ≥ 60 (minimum)|Income ₹1.03L < ₹2.00L (ceiling)|Caste OBC in eligible list'
WHERE person_name = 'Savitaben Patel'
  AND scheme_id = 'a1000001-0000-0000-0000-000000000001'
  AND status IN ('IDENTIFIED', 'CONFIRMED', 'ACTIVE');

UPDATE beneficiary
SET eligibility_reason = 'Age 17 ≥ 15 (minimum)|Age 17 ≤ 25 (maximum)|Income ₹1.50L < ₹2.50L (ceiling)|Caste OBC in eligible list'
WHERE eligibility_reason IS NULL
  AND person_name = 'Shreya Patel'
  AND scheme_id = 'a1000001-0000-0000-0000-000000000002'
  AND status IN ('IDENTIFIED', 'CONFIRMED', 'ACTIVE');

UPDATE beneficiary
SET eligibility_reason = 'Income ₹0.48L < ₹1.50L (ceiling)|Caste OBC in eligible list'
WHERE person_name = 'Priya Patel'
  AND scheme_id = 'a1000001-0000-0000-0000-000000000003'
  AND status IN ('IDENTIFIED', 'CONFIRMED', 'ACTIVE');

UPDATE beneficiary
SET eligibility_reason = 'Age 42 ≥ 18 (minimum)|Income ₹0.90L < ₹1.50L (ceiling)|Caste OBC in eligible list'
WHERE eligibility_reason IS NULL
  AND person_name = 'Kavita Rathod'
  AND scheme_id = 'a1000001-0000-0000-0000-000000000004'
  AND status IN ('IDENTIFIED', 'CONFIRMED', 'ACTIVE');
