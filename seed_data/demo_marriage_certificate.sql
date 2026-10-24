-- Demo marriage certificate application (idempotent).
--
-- egov-workflow-v2 (the real DIGIT workflow engine this service calls) is
-- scaled to 0 replicas in this environment, and startApplication() has no
-- fallback for that dependency being unreachable, so a live POST would fail.
-- This inserts the row the same POST would have produced, so the officer
-- Task Queue shows a real "DGT-" badge next to the caste cert's "FLW-" one
-- for Scene 10. Clicking Approve on it still works live: approve() catches
-- workflow-v2 failures and marks the row APPROVED locally either way.

INSERT INTO marriage_cert.applications (
  engine_ref, application_no, business_id, workflow_id,
  applicant_name, spouse_name, tenant_id,
  status, current_task, assignee, candidate_groups, created_at
)
SELECT
  'DGT-7f3a9c21-marriage-demo-0001',
  'MAR-2607-000001',
  'MC-7F3A9C21',
  '7f3a9c21-marriage-demo-0001',
  'Rajan Nair',
  'Meera Nair',
  'pg',
  'PENDING',
  'Pending Approval',
  NULL,
  'MARRIAGE_APPROVER',
  NOW() - INTERVAL '6 hours'
WHERE NOT EXISTS (
  SELECT 1 FROM marriage_cert.applications WHERE engine_ref = 'DGT-7f3a9c21-marriage-demo-0001'
);

INSERT INTO marriage_cert.app_counter (counter_key, last_value)
VALUES ('MAR-2607', 1)
ON CONFLICT (counter_key) DO UPDATE SET last_value = GREATEST(marriage_cert.app_counter.last_value, EXCLUDED.last_value);
