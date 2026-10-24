SET search_path TO scheme_engine;

INSERT INTO scheme (id, name, name_gujarati, description, department, benefit_type, benefit_value,
                    income_ceiling, eligible_castes, min_age, max_age, gender, district_scope,
                    valid_from, valid_to, is_active, category, created_by, created_at)
VALUES
  ('a1000001-0000-0000-0000-000000000001', 'Old Age Pension', 'વૃદ્ધાવસ્થા પેન્શન',
   'Monthly pension for citizens aged 60+', 'Social Justice', 'MONTHLY', '1000',
   150000, 'OBC,SC,ST,NT', 60, NULL, 'ANY', NULL,
   '2020-01-01', '2030-12-31', true, 'SENIOR_CITIZEN', 'dept.admin', NOW()),
  ('a1000001-0000-0000-0000-000000000002', 'Post-Matric OBC Scholarship', 'પોસ્ટ મેટ્રિક OBC શિષ્યવૃત્તિ',
   'Scholarship for OBC students in Class 11+', 'Education', 'ANNUAL', '25000',
   250000, 'OBC', 15, 25, 'ANY', NULL,
   '2020-01-01', '2030-12-31', true, 'EDUCATION', 'scheme.dept', NOW()),
  ('a1000001-0000-0000-0000-000000000003', 'BPL Ration Card', 'BPL રાશન કાર્ડ',
   'Subsidised food grains for below-poverty-line families', 'Food & Civil Supplies', 'IN_KIND', '35kg/month',
   150000, 'OBC,SC,ST,NT', NULL, NULL, 'ANY', NULL,
   '2020-01-01', '2030-12-31', true, 'OTHER', 'dept.admin', NOW()),
  ('a1000001-0000-0000-0000-000000000004', 'Widow Pension', 'વિધવા પેન્શન',
   'Monthly pension for widows', 'Social Justice', 'MONTHLY', '1250',
   150000, 'OBC,SC,ST,NT', 18, NULL, 'FEMALE', NULL,
   '2020-01-01', '2030-12-31', true, 'WOMEN_EMPOWERMENT', 'dept.admin', NOW()),
  ('a1000001-0000-0000-0000-000000000005', 'CM Girl Child Education Grant', 'મુખ્યમંત્રી બાળક શિક્ષણ અનુદાન',
   'Education grant for girls turning 18', 'Education', 'ANNUAL', '15000',
   2000000, NULL, 18, 25, 'ANY', NULL,
   '2020-01-01', '2030-12-31', true, 'EDUCATION', 'dept.admin', NOW())
ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category;
