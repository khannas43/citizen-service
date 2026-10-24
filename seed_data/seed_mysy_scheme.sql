-- MYSY (Mukhyamantri Yuva Swavalamban Yojana) — student scholarship scheme.
-- Run AFTER scheme-engine-service has been redeployed with min_percentile/
-- diploma_min_percentage/neet_mbbs_eligible columns and the scheme_benefit_component
-- table (Hibernate ddl-auto adds these on startup).
SET search_path TO scheme_engine;

INSERT INTO scheme (id, name, name_gujarati, description, department, benefit_type, benefit_value,
                    income_ceiling, eligible_castes, min_age, max_age, gender, district_scope,
                    valid_from, valid_to, is_active, category, created_by, created_at,
                    min_percentile, diploma_min_percentage, neet_mbbs_eligible)
VALUES
  ('a1000001-0000-0000-0000-000000000006', 'Mukhyamantri Yuva Swavalamban Yojana (MYSY)',
   'મુખ્યમંત્રી યુવા સ્વાવલંબન યોજના',
   'Financial assistance to meritorious and needy students for higher education.',
   'Education', 'ANNUAL', 'Course-tiered (see benefit components)',
   600000, NULL, NULL, NULL, 'ANY', 'Gujarat',
   '2020-01-01', '2030-12-31', true, 'EDUCATION', 'dept.admin', NOW(),
   80.0, 65.0, true)
ON CONFLICT (id) DO UPDATE SET
    min_percentile = EXCLUDED.min_percentile,
    diploma_min_percentage = EXCLUDED.diploma_min_percentage,
    neet_mbbs_eligible = EXCLUDED.neet_mbbs_eligible;

DELETE FROM scheme_benefit_component WHERE scheme_id = 'a1000001-0000-0000-0000-000000000006';

INSERT INTO scheme_benefit_component (id, scheme_id, course_category, tuition_amount, boarding_amount, books_amount)
VALUES
  ('a1000002-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000006', 'MEDICAL_DENTAL',      200000, 12000, 10000),
  ('a1000002-0000-0000-0000-000000000002', 'a1000001-0000-0000-0000-000000000006', 'ENGINEERING_GROUP',    50000, 12000,  5000),
  ('a1000002-0000-0000-0000-000000000003', 'a1000001-0000-0000-0000-000000000006', 'DIPLOMA',               25000, 12000,  3000),
  ('a1000002-0000-0000-0000-000000000004', 'a1000001-0000-0000-0000-000000000006', 'ARTS_COMMERCE',         10000, 12000,     0);
