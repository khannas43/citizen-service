-- Telangana DEMO payments: marks a share of cash-scheme beneficiaries as CONFIRMED + DISBURSED (DBT) with a reference
-- and a date spread over the last 6 months(one record per beneficiary; no extra rows, so beneficiary counts stay stable).
-- DEMO values only. Idempotent: only touches rows still IDENTIFIED.
-- Run as the superuser: psql -d citizen_db -v ON_ERROR_STOP=1 -f seed_data/telangana/seed_payments_tg.sql
SELECT set_config('app.state_code', 'TG', false);
SET search_path TO scheme_engine;

-- 1) about 45% of cash-benefit beneficiaries are already enrolled and paid (hero families always)
WITH cash AS (
  SELECT id AS scheme_id, benefit_value::bigint AS amt FROM scheme
  WHERE created_by = 'seed-tg-demo' AND benefit_type IN ('MONTHLY','ANNUAL','ONE_TIME') AND benefit_value ~ '^[0-9]+$'
), pick AS (
  SELECT b.id, c.amt, abs(hashtext(b.id::text)) AS h
  FROM beneficiary b JOIN cash c ON c.scheme_id = b.scheme_id
  WHERE b.status = 'IDENTIFIED' AND (abs(hashtext(b.id::text)) % 100 < 45
        OR b.person_id IN (SELECT id::text FROM family_registry.person WHERE aadhaar_ref LIKE 'XXXX-XXXX-_001'))
)
UPDATE beneficiary b
SET status = 'CONFIRMED',
    confirmed_at = NOW() - ((p.h % 60 + 150) || ' days')::interval,
    disbursement_status = 'DISBURSED',
    disbursement_ref = 'TG-DBT-' || lpad((p.h % 900000 + 100000)::text, 6, '0'),
    disbursed_at = NOW() - ((p.h % 150 + 1) || ' days')::interval,
    amount = p.amt
FROM pick p WHERE b.id = p.id;

SELECT disbursement_status, count(*), coalesce(sum(amount), 0) AS total FROM beneficiary GROUP BY 1 ORDER BY 1;
