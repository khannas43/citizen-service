-- Demo consents (My Data > Consents) and notifications (bell / hub) for citizen portal + mobile.
-- Idempotent: consents keyed on id, notifications keyed on id.

-- Priya Patel (XXXX-XXXX-1001) — 2 active consents + 1 revoked, matches demo script Scene 8.
INSERT INTO family_registry.consent (
  id, aadhaar_ref, department, data_category, purpose, status, granted_at, revoked_at
)
SELECT
  'c1000001-0000-0000-0000-000000000001'::uuid,
  'XXXX-XXXX-1001',
  'Social Welfare Department',
  'Income & Caste Records',
  'Eligibility verification for OBC Scholarship',
  'ACTIVE',
  NOW() - INTERVAL '30 days',
  NULL
WHERE NOT EXISTS (SELECT 1 FROM family_registry.consent WHERE id = 'c1000001-0000-0000-0000-000000000001'::uuid);

INSERT INTO family_registry.consent (
  id, aadhaar_ref, department, data_category, purpose, status, granted_at, revoked_at
)
SELECT
  'c1000001-0000-0000-0000-000000000002'::uuid,
  'XXXX-XXXX-1001',
  'Pension Department',
  'Family & Age Records',
  'Old Age Pension eligibility check for family members',
  'ACTIVE',
  NOW() - INTERVAL '20 days',
  NULL
WHERE NOT EXISTS (SELECT 1 FROM family_registry.consent WHERE id = 'c1000001-0000-0000-0000-000000000002'::uuid);

INSERT INTO family_registry.consent (
  id, aadhaar_ref, department, data_category, purpose, status, granted_at, revoked_at
)
SELECT
  'c1000001-0000-0000-0000-000000000003'::uuid,
  'XXXX-XXXX-1001',
  'Food & Civil Supplies Department',
  'Income Records',
  'BPL Ration Card verification',
  'REVOKED',
  NOW() - INTERVAL '60 days',
  NOW() - INTERVAL '5 days'
WHERE NOT EXISTS (SELECT 1 FROM family_registry.consent WHERE id = 'c1000001-0000-0000-0000-000000000003'::uuid);

-- Priya Patel notifications — deliberately excludes "Caste Certificate Approved":
-- that one fires live during the officer-approval demo scene so the bell count
-- visibly increments in front of the audience.
INSERT INTO notifications.notification (
  id, aadhaar_ref, title, message, service_name, tracking_id, is_read, created_at
)
SELECT
  'd1000001-0000-0000-0000-000000000001'::uuid,
  'XXXX-XXXX-1001',
  'Scholarship application received',
  'Your Post-Matric OBC Scholarship application has been received and is under review.',
  'scheme-application-service',
  'SCH-2607-000001',
  false,
  NOW() - INTERVAL '3 days'
WHERE NOT EXISTS (SELECT 1 FROM notifications.notification WHERE id = 'd1000001-0000-0000-0000-000000000001'::uuid);

INSERT INTO notifications.notification (
  id, aadhaar_ref, title, message, service_name, tracking_id, is_read, created_at
)
SELECT
  'd1000001-0000-0000-0000-000000000002'::uuid,
  'XXXX-XXXX-1001',
  'Grievance acknowledged',
  'Your grievance GRV-2607-000002 has been acknowledged by the Talati office. Verification in progress.',
  'grievance-service',
  'GRV-2607-000002',
  false,
  NOW() - INTERVAL '2 days'
WHERE NOT EXISTS (SELECT 1 FROM notifications.notification WHERE id = 'd1000001-0000-0000-0000-000000000002'::uuid);

INSERT INTO notifications.notification (
  id, aadhaar_ref, title, message, service_name, tracking_id, is_read, created_at
)
SELECT
  'd1000001-0000-0000-0000-000000000003'::uuid,
  'XXXX-XXXX-1001',
  'Welcome to Digital Gujarat 2.0',
  'Your profile is active. Explore schemes recommended for your family on the home screen.',
  'auth-service',
  NULL,
  true,
  NOW() - INTERVAL '30 days'
WHERE NOT EXISTS (SELECT 1 FROM notifications.notification WHERE id = 'd1000001-0000-0000-0000-000000000003'::uuid);
