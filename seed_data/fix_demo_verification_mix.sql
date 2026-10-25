-- Demo loop: verify most ACTION_RECORDED cases; leave 15 newest awaiting verification.
-- verified_by = Keycloak sub for dept.admin (JWT claim sub).
-- Backup first:
--   kubectl exec -n citizen deploy/postgres -- psql -U citizenuser -d citizen_db -c "\copy (
--     SELECT id, domain, status, verified_at, verified_by, verification_note, updated_at
--     FROM expenditure_integrity.integrity_case WHERE status = 'ACTION_RECORDED' OR verified_at IS NOT NULL
--   ) TO STDOUT WITH CSV HEADER" > seed_data/backups/integrity_case_verification_before.csv

SET search_path TO expenditure_integrity, public;

WITH latest_action AS (
  SELECT DISTINCT ON (case_id)
    case_id,
    created_at AS action_at,
    action_type
  FROM integrity_action
  ORDER BY case_id, created_at DESC
),
awaiting AS (
  SELECT c.id
  FROM integrity_case c
  WHERE c.status = 'ACTION_RECORDED'
    AND c.verified_at IS NULL
  ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
  LIMIT 15
),
to_close AS (
  SELECT c.id, la.action_at, la.action_type
  FROM integrity_case c
  JOIN latest_action la ON la.case_id = c.id
  WHERE c.status = 'ACTION_RECORDED'
    AND c.verified_at IS NULL
    AND c.id NOT IN (SELECT id FROM awaiting)
)
UPDATE integrity_case c
SET status = 'CLOSED',
    verified_at = tc.action_at
      + ((1 + abs(hashtext(c.id::text)) % 10) || ' days')::interval
      + time '14:00:00',
    verified_by = '7817b01b-fb92-4113-b6bc-629db405f659',
    verification_note = CASE tc.action_type
      WHEN 'MASTER_CORRECTION' THEN 'Register shows the corrected record.'
      WHEN 'RECOVERY_RECORD' THEN 'Recovery reached the treasury account.'
      WHEN 'PAYMENT_ADJUSTMENT' THEN 'Next cycle register matches the adjustment.'
      ELSE 'Checked that the fix holds on source records.'
    END,
    updated_at = tc.action_at
      + ((1 + abs(hashtext(c.id::text)) % 10) || ' days')::interval
      + time '14:00:00'
FROM to_close tc
WHERE c.id = tc.id;

INSERT INTO integrity_audit_log (id, case_id, actor, actor_role, action, details, created_at)
SELECT
  gen_random_uuid(),
  c.id,
  '7817b01b-fb92-4113-b6bc-629db405f659',
  'DEPT_ADMIN',
  'VERIFIED_CLOSED',
  jsonb_build_object('note', c.verification_note),
  c.verified_at
FROM integrity_case c
WHERE c.verified_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM integrity_audit_log l
    WHERE l.case_id = c.id AND l.action = 'VERIFIED_CLOSED'
  );
