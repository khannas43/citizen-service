-- 016_uc1.sql  (run as superuser after 015; idempotent)
-- UC1 identity linkage: review tasks join the Work queue; citizen confirm/report requests are limited to one open per detail.

-- Before the unique index below: close older duplicate open reports for the same person and detail, keeping the newest.
UPDATE mdm.discrepancy d SET status='REJECTED', resolved_by='system', resolved_at=now(),
       resolution_note='Superseded by a newer open report for the same detail (016_uc1)'
 WHERE d.kind='DISCREPANCY' AND d.status='ROUTED'
   AND EXISTS (SELECT 1 FROM mdm.discrepancy n WHERE n.person_id=d.person_id AND n.attribute=d.attribute
                AND n.kind='DISCREPANCY' AND n.status='ROUTED' AND n.id>d.id);

ALTER TABLE mdm.review_task ADD COLUMN IF NOT EXISTS reason_code text;
ALTER TABLE mdm.review_task ADD COLUMN IF NOT EXISTS risk_class  text;
ALTER TABLE mdm.review_task ADD COLUMN IF NOT EXISTS batch_id    bigint;
ALTER TABLE mdm.review_task ADD COLUMN IF NOT EXISTS claimed_by  text;
ALTER TABLE mdm.review_task ADD COLUMN IF NOT EXISTS claimed_at  timestamptz;
CREATE INDEX IF NOT EXISTS review_task_queue_ix ON mdm.review_task (status, reason_code, id) WHERE status='OPEN';
ALTER TABLE mdm.citizen_request ADD COLUMN IF NOT EXISTS attribute text;
CREATE UNIQUE INDEX IF NOT EXISTS citizen_request_open_attr_ux ON mdm.citizen_request (person_id, attribute, kind) WHERE status='PENDING' AND attribute IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS discrepancy_open_attr_ux ON mdm.discrepancy (person_id, attribute) WHERE status='ROUTED' AND kind='DISCREPANCY';
