-- Seed 4 demo citizen profiles into citizen_db for the Citizen Services mobile app
-- Matches actual schema: family_registry.{family, person, family_member}
--
-- Run via kubectl:
--   kubectl exec -n citizen <postgres-pod> -- \
--     psql -U citizenuser -d citizen_db < seed_demo_profiles.sql
--
-- Aadhaar refs: 900000010001 – 900000010004

BEGIN;

-- ── Families (fixed UUIDs so they're stable across re-runs) ─────────
INSERT INTO family_registry.family (id, address, district, state, taluka, village)
VALUES
  ('a1000000-0001-0001-0001-000000000001', '12, Navrangpura, Ahmedabad', 'Ahmedabad', 'Gujarat', 'Bavla',     'Bavla'),
  ('a1000000-0001-0001-0001-000000000002', '34, Rajpipla Colony, Narmada','Narmada',   'Gujarat', 'Rajpipla',  'Rajpipla'),
  ('a1000000-0001-0001-0001-000000000003', '56, Rander Road, Surat',      'Surat',     'Gujarat', 'Surat City','Surat'),
  ('a1000000-0001-0001-0001-000000000004', '78, Fatehgunj, Vadodara',     'Vadodara',  'Gujarat', 'Vadodara',  'Vadodara')
ON CONFLICT (id) DO UPDATE SET
  address  = EXCLUDED.address,
  district = EXCLUDED.district;

-- ── Persons ─────────────────────────────────────────────────────────
INSERT INTO family_registry.person
  (id, aadhaar_ref, name, gender, dob, caste_category, annual_income, is_alive, mobile)
VALUES
  ('b1000000-0001-0001-0001-000000000001', '900000010001', 'Priya Patel',      'Female', '1992-03-15', 'OBC', 180000, true, '9898000001'),
  ('b1000000-0001-0001-0001-000000000002', '900000010002', 'Ramesh Tadvi',     'Male',   '1959-07-22', 'ST',   95000, true, '9898000002'),
  ('b1000000-0001-0001-0001-000000000003', '900000010003', 'Savitaben Parmar', 'Female', '1981-11-05', 'SC',  130000, true, '9898000003'),
  ('b1000000-0001-0001-0001-000000000004', '900000010004', 'Arjun Solanki',    'Male',   '1998-01-30', 'OBC', 240000, true, '9898000004')
ON CONFLICT (aadhaar_ref) DO UPDATE SET
  name           = EXCLUDED.name,
  caste_category = EXCLUDED.caste_category,
  annual_income  = EXCLUDED.annual_income,
  mobile         = EXCLUDED.mobile;

-- ── Family Members (person ↔ family, HEAD of household) ──────────────
INSERT INTO family_registry.family_member (family_id, person_id, relationship_to_head)
VALUES
  ('a1000000-0001-0001-0001-000000000001', 'b1000000-0001-0001-0001-000000000001', 'HEAD'),
  ('a1000000-0001-0001-0001-000000000002', 'b1000000-0001-0001-0001-000000000002', 'HEAD'),
  ('a1000000-0001-0001-0001-000000000003', 'b1000000-0001-0001-0001-000000000003', 'HEAD'),
  ('a1000000-0001-0001-0001-000000000004', 'b1000000-0001-0001-0001-000000000004', 'HEAD')
ON CONFLICT DO NOTHING;

COMMIT;

-- Verify
SELECT p.aadhaar_ref, p.name, p.caste_category, f.district,
       cast(f.id as text) AS family_uuid
FROM family_registry.person p
JOIN family_registry.family_member fm ON fm.person_id = p.id
JOIN family_registry.family f ON f.id = fm.family_id
WHERE p.aadhaar_ref IN ('900000010001','900000010002','900000010003','900000010004')
ORDER BY p.aadhaar_ref;
