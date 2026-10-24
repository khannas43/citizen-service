-- Demo grievances for citizen portal / officer grievances tab.
-- Idempotent: keyed on grievance_ref.

INSERT INTO grievance.grievance (
  id, tracking_ref, aadhaar_ref, citizen_name, complaint_text,
  status, category, priority, grievance_ref, created_at, updated_at, officer_notes
)
SELECT
  'a1000001-0000-0000-0000-000000000001'::uuid,
  'CAS-2607-000001',
  'XXXX-XXXX-1001',
  'Priya Patel',
  'My caste certificate application has been pending for over two weeks with no status update on the portal.',
  'OPEN',
  'DELAYED_PROCESSING',
  'HIGH',
  'GRV-2607-000001',
  NOW() - INTERVAL '12 days',
  NOW() - INTERVAL '12 days',
  NULL
WHERE NOT EXISTS (SELECT 1 FROM grievance.grievance WHERE grievance_ref = 'GRV-2607-000001');

INSERT INTO grievance.grievance (
  id, tracking_ref, aadhaar_ref, citizen_name, complaint_text,
  status, category, priority, grievance_ref, created_at, updated_at, officer_notes
)
SELECT
  'a1000001-0000-0000-0000-000000000002'::uuid,
  'SCH-2607-000002',
  'XXXX-XXXX-1001',
  'Priya Patel',
  'Skill Development Grant application shows submitted but I have not received any acknowledgement SMS.',
  'ACKNOWLEDGED',
  'BENEFIT_NOT_RECEIVED',
  'NORMAL',
  'GRV-2607-000002',
  NOW() - INTERVAL '8 days',
  NOW() - INTERVAL '3 days',
  'Taluka office confirmed receipt. Verification in progress.'
WHERE NOT EXISTS (SELECT 1 FROM grievance.grievance WHERE grievance_ref = 'GRV-2607-000002');

INSERT INTO grievance.grievance (
  id, tracking_ref, aadhaar_ref, citizen_name, complaint_text,
  status, category, priority, grievance_ref, created_at, updated_at, officer_notes
)
SELECT
  'a1000001-0000-0000-0000-000000000003'::uuid,
  'SCH-2607-000001',
  'XXXX-XXXX-1001',
  'Priya Patel',
  'Portal shows wrong annual income on my family profile — please verify against submitted documents.',
  'QUERY_RAISED',
  'WRONG_INFORMATION',
  'NORMAL',
  'GRV-2607-000003',
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '1 day',
  'Please upload latest income certificate from Mamlatdar office.'
WHERE NOT EXISTS (SELECT 1 FROM grievance.grievance WHERE grievance_ref = 'GRV-2607-000003');

INSERT INTO grievance.grievance (
  id, tracking_ref, aadhaar_ref, citizen_name, complaint_text,
  status, category, priority, grievance_ref, created_at, updated_at, officer_notes
)
SELECT
  'a1000001-0000-0000-0000-000000000004'::uuid,
  NULL,
  'XXXX-XXXX-2001',
  'Rajan Nair',
  'Unable to download pension approval letter from My Certificates — page shows blank PDF.',
  'OPEN',
  'TECHNICAL_ISSUE',
  'URGENT',
  'GRV-2607-000004',
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '2 days',
  NULL
WHERE NOT EXISTS (SELECT 1 FROM grievance.grievance WHERE grievance_ref = 'GRV-2607-000004');

INSERT INTO grievance.grievance (
  id, tracking_ref, aadhaar_ref, citizen_name, complaint_text,
  status, category, priority, grievance_ref, created_at, updated_at, officer_notes
)
SELECT
  'a1000001-0000-0000-0000-000000000005'::uuid,
  NULL,
  'XXXX-XXXX-5001',
  'Kavita Rathod',
  'Widow pension eligibility was rejected but no reason was communicated.',
  'RESOLVED',
  'SCHEME_ELIGIBILITY',
  'HIGH',
  'GRV-2606-000099',
  NOW() - INTERVAL '45 days',
  NOW() - INTERVAL '10 days',
  'Re-reviewed after death certificate upload. Eligible from next disbursement cycle.'
WHERE NOT EXISTS (SELECT 1 FROM grievance.grievance WHERE grievance_ref = 'GRV-2606-000099');

-- Officer query thread on Priya's QUERY_RAISED grievance
INSERT INTO grievance.grievance_comment (
  id, grievance_id, author_name, author_type, comment_text, created_at
)
SELECT
  'b1000001-0000-0000-0000-000000000001'::uuid,
  'a1000001-0000-0000-0000-000000000003'::uuid,
  'Talati Officer',
  'OFFICER_QUERY',
  'Please upload your latest income certificate issued by the Mamlatdar. The amount on file does not match your declaration.',
  NOW() - INTERVAL '1 day'
WHERE NOT EXISTS (
  SELECT 1 FROM grievance.grievance_comment
  WHERE id = 'b1000001-0000-0000-0000-000000000001'::uuid
);

-- Five closed (RESOLVED) grievances in May–June 2026 for Priya Patel.
-- Shown on citizen /grievances (aadhaar XXXX-XXXX-1001) and officer grievances queue.
INSERT INTO grievance.grievance (
  id, tracking_ref, aadhaar_ref, citizen_name, complaint_text,
  status, category, priority, grievance_ref, created_at, updated_at, officer_notes
)
SELECT
  'a1000001-0000-0000-0000-000000000011'::uuid,
  'CAS-2605-000011',
  'XXXX-XXXX-1001',
  'Priya Patel',
  'Caste certificate application submitted in April is still pending. Taluka office has not issued any update.',
  'RESOLVED',
  'DELAYED_PROCESSING',
  'HIGH',
  'GRV-2605-000101',
  TIMESTAMP '2026-05-04 10:20:00',
  TIMESTAMP '2026-05-12 16:40:00',
  'Verified at taluka counter. Certificate printed and dispatched on 12 May 2026. Closed.'
WHERE NOT EXISTS (SELECT 1 FROM grievance.grievance WHERE grievance_ref = 'GRV-2605-000101');

INSERT INTO grievance.grievance (
  id, tracking_ref, aadhaar_ref, citizen_name, complaint_text,
  status, category, priority, grievance_ref, created_at, updated_at, officer_notes
)
SELECT
  'a1000001-0000-0000-0000-000000000012'::uuid,
  'SCH-2605-000012',
  'XXXX-XXXX-1001',
  'Priya Patel',
  'Income certificate attached to my scheme application was rejected without stating which page was unclear.',
  'RESOLVED',
  'DOCUMENT_REJECTION',
  'NORMAL',
  'GRV-2605-000102',
  TIMESTAMP '2026-05-18 09:05:00',
  TIMESTAMP '2026-05-26 14:15:00',
  'Re-uploaded Mamlatdar income certificate accepted. Application restored to verification. Closed.'
WHERE NOT EXISTS (SELECT 1 FROM grievance.grievance WHERE grievance_ref = 'GRV-2605-000102');

INSERT INTO grievance.grievance (
  id, tracking_ref, aadhaar_ref, citizen_name, complaint_text,
  status, category, priority, grievance_ref, created_at, updated_at, officer_notes
)
SELECT
  'a1000001-0000-0000-0000-000000000013'::uuid,
  'SCH-2606-000013',
  'XXXX-XXXX-1001',
  'Priya Patel',
  'Skill Development Grant was approved but the benefit has not been credited to my bank account.',
  'RESOLVED',
  'BENEFIT_NOT_RECEIVED',
  'HIGH',
  'GRV-2606-000101',
  TIMESTAMP '2026-06-06 11:30:00',
  TIMESTAMP '2026-06-14 17:05:00',
  'Treasury confirmed NEFT on 13 Jun 2026. Citizen account credited. Closed.'
WHERE NOT EXISTS (SELECT 1 FROM grievance.grievance WHERE grievance_ref = 'GRV-2606-000101');

INSERT INTO grievance.grievance (
  id, tracking_ref, aadhaar_ref, citizen_name, complaint_text,
  status, category, priority, grievance_ref, created_at, updated_at, officer_notes
)
SELECT
  'a1000001-0000-0000-0000-000000000014'::uuid,
  'CAS-2606-000014',
  'XXXX-XXXX-1001',
  'Priya Patel',
  'My Certificates page downloads a blank PDF for the caste certificate issued last month.',
  'RESOLVED',
  'TECHNICAL_ISSUE',
  'NORMAL',
  'GRV-2606-000102',
  TIMESTAMP '2026-06-15 08:45:00',
  TIMESTAMP '2026-06-20 12:10:00',
  'Document store regenerated. Download verified from citizen portal. Closed.'
WHERE NOT EXISTS (SELECT 1 FROM grievance.grievance WHERE grievance_ref = 'GRV-2606-000102');

INSERT INTO grievance.grievance (
  id, tracking_ref, aadhaar_ref, citizen_name, complaint_text,
  status, category, priority, grievance_ref, created_at, updated_at, officer_notes
)
SELECT
  'a1000001-0000-0000-0000-000000000015'::uuid,
  'MAR-2606-000015',
  'XXXX-XXXX-1001',
  'Priya Patel',
  'Marriage certificate was marked issued but the physical copy has not reached the village panchayat.',
  'RESOLVED',
  'CERTIFICATE_NOT_RECEIVED',
  'NORMAL',
  'GRV-2606-000103',
  TIMESTAMP '2026-06-22 15:50:00',
  TIMESTAMP '2026-06-28 11:25:00',
  'Duplicate dispatched via Speed Post (GJ261628). Panchayat acknowledged receipt. Closed.'
WHERE NOT EXISTS (SELECT 1 FROM grievance.grievance WHERE grievance_ref = 'GRV-2606-000103');

INSERT INTO grievance.grievance_comment (
  id, grievance_id, author_name, author_type, comment_text, created_at
)
SELECT
  'b1000001-0000-0000-0000-000000000011'::uuid,
  'a1000001-0000-0000-0000-000000000011'::uuid,
  'Talati Officer',
  'OFFICER',
  'Certificate printed and dispatched on 12 May 2026. Marking this grievance closed.',
  TIMESTAMP '2026-05-12 16:40:00'
WHERE NOT EXISTS (
  SELECT 1 FROM grievance.grievance_comment
  WHERE id = 'b1000001-0000-0000-0000-000000000011'::uuid
);

INSERT INTO grievance.grievance_comment (
  id, grievance_id, author_name, author_type, comment_text, created_at
)
SELECT
  'b1000001-0000-0000-0000-000000000012'::uuid,
  'a1000001-0000-0000-0000-000000000012'::uuid,
  'Talati Officer',
  'OFFICER',
  'Fresh income certificate accepted. Application back in verification. Closed.',
  TIMESTAMP '2026-05-26 14:15:00'
WHERE NOT EXISTS (
  SELECT 1 FROM grievance.grievance_comment
  WHERE id = 'b1000001-0000-0000-0000-000000000012'::uuid
);

INSERT INTO grievance.grievance_comment (
  id, grievance_id, author_name, author_type, comment_text, created_at
)
SELECT
  'b1000001-0000-0000-0000-000000000013'::uuid,
  'a1000001-0000-0000-0000-000000000013'::uuid,
  'Talati Officer',
  'OFFICER',
  'NEFT confirmed 13 Jun 2026. Benefit credited. Closed.',
  TIMESTAMP '2026-06-14 17:05:00'
WHERE NOT EXISTS (
  SELECT 1 FROM grievance.grievance_comment
  WHERE id = 'b1000001-0000-0000-0000-000000000013'::uuid
);

INSERT INTO grievance.grievance_comment (
  id, grievance_id, author_name, author_type, comment_text, created_at
)
SELECT
  'b1000001-0000-0000-0000-000000000014'::uuid,
  'a1000001-0000-0000-0000-000000000014'::uuid,
  'Talati Officer',
  'OFFICER',
  'PDF regenerated in document store. Download verified. Closed.',
  TIMESTAMP '2026-06-20 12:10:00'
WHERE NOT EXISTS (
  SELECT 1 FROM grievance.grievance_comment
  WHERE id = 'b1000001-0000-0000-0000-000000000014'::uuid
);

INSERT INTO grievance.grievance_comment (
  id, grievance_id, author_name, author_type, comment_text, created_at
)
SELECT
  'b1000001-0000-0000-0000-000000000015'::uuid,
  'a1000001-0000-0000-0000-000000000015'::uuid,
  'Talati Officer',
  'OFFICER',
  'Duplicate certificate dispatched; panchayat receipt confirmed. Closed.',
  TIMESTAMP '2026-06-28 11:25:00'
WHERE NOT EXISTS (
  SELECT 1 FROM grievance.grievance_comment
  WHERE id = 'b1000001-0000-0000-0000-000000000015'::uuid
);

INSERT INTO grievance.app_counter (counter_key, last_value)
VALUES ('GRV', 103)
ON CONFLICT (counter_key) DO UPDATE SET last_value = GREATEST(grievance.app_counter.last_value, EXCLUDED.last_value);
