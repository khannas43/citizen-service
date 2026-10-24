-- DG 2.0 — 20 Demo Schemes across 9 categories
-- Run AFTER seed_demo_schemes.sql
-- Adds category to existing 5 schemes + inserts 15 new schemes

SET search_path TO scheme_engine;

-- ── Patch existing 5 schemes with category ──────────────────────────────────
UPDATE scheme SET category = 'SENIOR_CITIZEN'    WHERE id = 'a1000001-0000-0000-0000-000000000001';
UPDATE scheme SET category = 'EDUCATION'          WHERE id = 'a1000001-0000-0000-0000-000000000002';
UPDATE scheme SET category = 'OTHER'              WHERE id = 'a1000001-0000-0000-0000-000000000003';
UPDATE scheme SET category = 'WOMEN_EMPOWERMENT'  WHERE id = 'a1000001-0000-0000-0000-000000000004';
UPDATE scheme SET category = 'EDUCATION'          WHERE id = 'a1000001-0000-0000-0000-000000000005';

-- ── 15 New Schemes ──────────────────────────────────────────────────────────
INSERT INTO scheme (id, name, name_gujarati, description, department, benefit_type, benefit_value,
                    income_ceiling, eligible_castes, min_age, max_age, gender, district_scope,
                    valid_from, valid_to, is_active, category, created_by, created_at)
VALUES

-- EDUCATION (2 more → total 4)
('b1000001-0000-0000-0000-000000000001',
 'Pre-Matric SC/ST Scholarship', 'પ્રી-મેટ્રિક SC/ST શિષ્યવૃત્તિ',
 'Scholarship for SC/ST students in Class 1–10 to reduce school dropout', 'Education',
 'ANNUAL', '12000', 200000, 'SC,ST', 6, 16, 'ANY', NULL,
 '2020-01-01', '2030-12-31', true, 'EDUCATION', 'scheme.dept', NOW()),

('b1000001-0000-0000-0000-000000000002',
 'Tribal Student Hostel Allowance', 'આદિવાસી વિદ્યાર્થી છાત્રાલય ભથ્થું',
 'Hostel and meal allowance for ST students studying in district headquarters', 'Tribal Development',
 'MONTHLY', '2500', 180000, 'ST', 12, 22, 'ANY', NULL,
 '2020-01-01', '2030-12-31', true, 'EDUCATION', 'scheme.dept', NOW()),

-- SENIOR_CITIZEN (1 more → total 2)
('b1000001-0000-0000-0000-000000000003',
 'Senior Citizen Health Card', 'વરિષ્ઠ નાગરિક આરોગ્ય કાર્ડ',
 'Free OPD, medicines and annual health check-up for citizens aged 65+', 'Health',
 'IN_KIND', 'Free Health Card', 200000, 'OBC,SC,ST,NT,GENERAL', 65, NULL, 'ANY', NULL,
 '2020-01-01', '2030-12-31', true, 'SENIOR_CITIZEN', 'dept.admin', NOW()),

-- WOMEN_EMPOWERMENT (2 more → total 3)
('b1000001-0000-0000-0000-000000000004',
 'Mahila Udyog Loan Scheme', 'મહિલા ઉદ્યોગ લોન યોજના',
 'Subsidised business loans up to ₹2L for women entrepreneurs', 'Industries',
 'LOAN', '200000', 300000, 'OBC,SC,ST,NT', 21, 55, 'FEMALE', NULL,
 '2021-01-01', '2030-12-31', true, 'WOMEN_EMPOWERMENT', 'scheme.dept', NOW()),

('b1000001-0000-0000-0000-000000000005',
 'Matru Shakti Yojana', 'માતૃ શક્તિ યોજના',
 'Monthly nutritional support for pregnant and lactating women', 'Health',
 'MONTHLY', '1500', 200000, 'OBC,SC,ST,NT', 18, 45, 'FEMALE', NULL,
 '2021-01-01', '2030-12-31', true, 'WOMEN_EMPOWERMENT', 'dept.admin', NOW()),

-- CHILD_WELFARE (2 new)
('b1000001-0000-0000-0000-000000000006',
 'Anganwadi Nutrition Scheme', 'આંગણવાડી પોષણ યોજના',
 'Supplementary nutrition and immunisation for children under 6', 'Women & Child Dev',
 'IN_KIND', 'Nutrition Kit', 200000, 'OBC,SC,ST,NT', 0, 6, 'ANY', NULL,
 '2020-01-01', '2030-12-31', true, 'CHILD_WELFARE', 'dept.admin', NOW()),

('b1000001-0000-0000-0000-000000000007',
 'Kishori Shakti Yojana', 'કિશોરી શક્તિ યોજના',
 'Health, nutrition and skill training for adolescent girls', 'Women & Child Dev',
 'ANNUAL', '8000', 150000, 'SC,ST', 11, 18, 'FEMALE', NULL,
 '2020-01-01', '2030-12-31', true, 'CHILD_WELFARE', 'scheme.dept', NOW()),

-- AGRICULTURE (3 new)
('b1000001-0000-0000-0000-000000000008',
 'PM Kisan Samman Nidhi', 'PM કિસાન સન્માન નિધિ',
 'Direct income support of ₹6,000/year to small and marginal farmers', 'Agriculture',
 'ANNUAL', '6000', 400000, 'OBC,SC,ST,NT,GENERAL', 21, 70, 'ANY', NULL,
 '2019-02-01', '2030-12-31', true, 'AGRICULTURE', 'dept.admin', NOW()),

('b1000001-0000-0000-0000-000000000009',
 'Kisan Suraksha Bima', 'કિસાન સુરક્ષા વીમો',
 'Crop insurance premium subsidy for flood and drought losses', 'Agriculture',
 'INSURANCE', '15000', 500000, 'OBC,SC,ST,NT,GENERAL', 18, 65, 'ANY', NULL,
 '2020-01-01', '2030-12-31', true, 'AGRICULTURE', 'dept.admin', NOW()),

('b1000001-0000-0000-0000-000000000010',
 'Crop Loan Interest Subsidy', 'પાક ધિરાણ વ્યાજ સહાય',
 '3% interest subsidy on short-term crop loans up to ₹3L', 'Agriculture',
 'SUBSIDY', '9000', 500000, 'OBC,SC,ST,NT,GENERAL', 18, NULL, 'ANY', NULL,
 '2020-04-01', '2030-12-31', true, 'AGRICULTURE', 'scheme.dept', NOW()),

-- LIVELIHOOD (2 new)
('b1000001-0000-0000-0000-000000000011',
 'Skill Development Grant', 'કૌશલ્ય વિકાસ અનુદાન',
 'Free vocational training + ₹15,000 stipend for youth in NSQF-certified trades', 'Labour',
 'ANNUAL', '15000', 250000, 'OBC,SC,ST,NT', 18, 35, 'ANY', NULL,
 '2021-01-01', '2030-12-31', true, 'LIVELIHOOD', 'scheme.dept', NOW()),

('b1000001-0000-0000-0000-000000000012',
 'PM Mudra Yojana — Shishu', 'PM મુદ્રા યોજના — શિશુ',
 'Collateral-free micro-enterprise loan up to ₹50,000', 'Industries',
 'LOAN', '50000', 300000, 'OBC,SC,ST,NT', 21, 55, 'ANY', NULL,
 '2020-01-01', '2030-12-31', true, 'LIVELIHOOD', 'dept.admin', NOW()),

-- HOUSING (2 new)
('b1000001-0000-0000-0000-000000000013',
 'PM Awas Yojana — Gramin', 'PM આવાસ યોજના — ગ્રામ્ય',
 '₹1.2L grant for construction of permanent pucca house for houseless BPL families', 'Rural Dev',
 'ANNUAL', '120000', 150000, 'OBC,SC,ST,NT', 21, NULL, 'ANY', NULL,
 '2016-04-01', '2030-12-31', true, 'HOUSING', 'dept.admin', NOW()),

('b1000001-0000-0000-0000-000000000014',
 'Mukhyamantri Gruh Sudhara', 'મુખ્યમંત્રી ગૃહ સુધારા',
 'Up to ₹50,000 for repair and renovation of kuccha houses', 'Rural Dev',
 'ANNUAL', '50000', 150000, 'SC,ST', 21, NULL, 'ANY', NULL,
 '2021-01-01', '2030-12-31', true, 'HOUSING', 'dept.admin', NOW()),

-- HEALTH (1 new)
('b1000001-0000-0000-0000-000000000015',
 'Ayushman Gujarat', 'આયુષ્માન ગુજરાત',
 'Cashless hospitalisation up to ₹5L/year at empanelled hospitals', 'Health',
 'INSURANCE', '500000', 300000, 'OBC,SC,ST,NT,GENERAL', NULL, NULL, 'ANY', NULL,
 '2021-01-01', '2030-12-31', true, 'HEALTH', 'dept.admin', NOW())

ON CONFLICT (id) DO NOTHING;
