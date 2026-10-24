-- Demo loop: realistic action / audit timestamps (case opened → action in 2–12 days).
-- Idempotent: only rows where action is more than 60 days after its case.
-- Backup first:
--   kubectl exec -n egov deploy/postgres -- psql -U egovuser -d egov_db -c "\copy (
--     SELECT a.id, a.case_id, a.action_type, a.created_at
--     FROM expenditure_integrity.integrity_action a
--     JOIN expenditure_integrity.integrity_case c ON c.id = a.case_id
--     WHERE a.created_at > c.created_at + interval '60 days'
--   ) TO STDOUT WITH CSV HEADER" > seed_data/backups/integrity_action_timestamps_before.csv

SET search_path TO expenditure_integrity, public;

UPDATE integrity_action a
SET created_at = c.created_at
  + ((2 + abs(hashtext(a.id::text)) % 11) || ' days')::interval
  + time '09:00:00'
FROM integrity_case c
WHERE c.id = a.case_id
  AND a.created_at > c.created_at + interval '60 days';

UPDATE integrity_audit_log l
SET created_at = c.created_at
  + ((2 + abs(hashtext(l.id::text)) % 11) || ' days')::interval
  + time '10:00:00'
FROM integrity_case c
WHERE c.id = l.case_id
  AND l.created_at > c.created_at + interval '60 days';

-- Align case updated_at with latest action when it was unrealistically far in the future.
UPDATE integrity_case c
SET updated_at = sub.latest_action
FROM (
  SELECT case_id, max(created_at) AS latest_action
  FROM integrity_action
  GROUP BY case_id
) sub
WHERE c.id = sub.case_id
  AND c.status IN ('ACTION_RECORDED', 'CLOSED')
  AND c.updated_at > sub.latest_action + interval '1 day';
