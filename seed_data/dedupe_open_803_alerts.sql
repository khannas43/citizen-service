-- One open 803 alert per person + scheme (keeps the earliest case). Run once if the inbox shows
-- duplicate Kavita Rathod / post-death rows from an older detection run.
SET search_path TO expenditure_integrity, public;

WITH ranked AS (
  SELECT id, case_id,
         ROW_NUMBER() OVER (PARTITION BY person_id, scheme_id ORDER BY detected_at ASC, id ASC) AS rn
  FROM integrity_alert
  WHERE domain = 'BENEFICIARY' AND rule_code = '803' AND status = 'OPEN'
),
doomed AS (SELECT id, case_id FROM ranked WHERE rn > 1)
DELETE FROM integrity_alert a
USING doomed d
WHERE a.id = d.id;

-- Optional: close orphan cases with no remaining alerts (manual review recommended).
