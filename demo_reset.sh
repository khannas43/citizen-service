#!/bin/bash
# shellcheck source=/dev/null
source "$(dirname "$0")/scripts/lib/guard.sh"
# demo_reset.sh — restores pristine demo state before every presentation.
# Run 30 minutes before demo.
# Usage: ./demo_reset.sh

set -e

POSTGRES_POD=$(kubectl get pods -n citizen -l app=postgres \
  -o jsonpath='{.items[0].metadata.name}')

echo "==> Resetting beneficiary states..."
kubectl exec "$POSTGRES_POD" -n citizen -- psql -U citizenuser -d citizen_db << 'SQL'

-- Reset Bhavesh to REMOVED (deceased)
UPDATE scheme_engine.beneficiary b
SET status = 'REMOVED',
    removal_reason = 'MEMBER_DECEASED',
    removed_at = NOW() - INTERVAL '7 days',
    confirmed_at = NULL
FROM family_registry.person p
WHERE p.name = 'Bhavesh Patel'
  AND b.person_id = p.id::text
  AND b.status != 'REMOVED';

-- Reset Savitaben to IDENTIFIED — pending confirmation
UPDATE scheme_engine.beneficiary b
SET status = 'IDENTIFIED',
    removal_reason = NULL,
    removed_at = NULL,
    confirmed_at = NULL,
    identified_at = NOW() - INTERVAL '2 days'
FROM family_registry.person p
WHERE p.name = 'Savitaben Patel'
  AND b.person_id = p.id::text;

-- Reset Shreya to IDENTIFIED
UPDATE scheme_engine.beneficiary b
SET status = 'IDENTIFIED',
    removal_reason = NULL,
    removed_at = NULL,
    confirmed_at = NULL
FROM family_registry.person p
WHERE p.name = 'Shreya Patel'
  AND b.person_id = p.id::text;

-- Reset Gopal Nair (Rajan's deceased father) to REMOVED
UPDATE scheme_engine.beneficiary b
SET status = 'REMOVED',
    removal_reason = 'MEMBER_DECEASED',
    removed_at = NOW() - INTERVAL '15 days',
    confirmed_at = NULL
FROM family_registry.person p
WHERE p.name = 'Gopal Nair'
  AND b.person_id = p.id::text;

-- Reset Kavita Rathod to IDENTIFIED
UPDATE scheme_engine.beneficiary b
SET status = 'IDENTIFIED',
    removal_reason = NULL,
    removed_at = NULL,
    confirmed_at = NULL
FROM family_registry.person p
WHERE p.name = 'Kavita Rathod'
  AND b.person_id = p.id::text;

SQL

echo "==> Seeding red-badge SLA application (23h old)..."
kubectl exec "$POSTGRES_POD" -n citizen -- psql -U citizenuser -d citizen_db -c "
  UPDATE caste_cert.act_ru_task
  SET create_time_ = NOW() - INTERVAL '23 hours'
  WHERE name_ = 'Talati Verification'
    AND proc_inst_id_ IN (
      SELECT v.proc_inst_id_ FROM caste_cert.act_ru_variable v
      WHERE v.name_ = 'applicantName'
        AND v.text_ = 'Priya Patel'
    );" 2>/dev/null || echo "(caste_cert task table not present — skip SLA badge reset)"

echo "==> Seeding demo grievances..."
kubectl cp "$(dirname "$0")/seed_data/demo_grievances.sql" "citizen/$POSTGRES_POD:/tmp/demo_grievances.sql"
kubectl exec "$POSTGRES_POD" -n citizen -- psql -U citizenuser -d citizen_db -f /tmp/demo_grievances.sql

echo "==> Ensuring scheme categories (20-scheme catalog)..."
kubectl cp "$(dirname "$0")/seed_data/seed_20_schemes.sql" "citizen/$POSTGRES_POD:/tmp/seed_20_schemes.sql"
kubectl exec "$POSTGRES_POD" -n citizen -- psql -U citizenuser -d citizen_db -f /tmp/seed_20_schemes.sql

echo "==> Backfilling beneficiary geography..."
kubectl cp "$(dirname "$0")/seed_data/demo_beneficiary_geography_backfill.sql" "citizen/$POSTGRES_POD:/tmp/demo_beneficiary_geography_backfill.sql"
kubectl exec "$POSTGRES_POD" -n citizen -- psql -U citizenuser -d citizen_db -f /tmp/demo_beneficiary_geography_backfill.sql

echo "==> Seeding Priya family AI identified schemes..."
kubectl cp "$(dirname "$0")/seed_data/demo_priya_ai_identified.sql" "citizen/$POSTGRES_POD:/tmp/demo_priya_ai_identified.sql"
kubectl exec "$POSTGRES_POD" -n citizen -- psql -U citizenuser -d citizen_db -f /tmp/demo_priya_ai_identified.sql

echo "==> Verifying demo state..."
kubectl exec "$POSTGRES_POD" -n citizen -- psql -U citizenuser -d citizen_db -t -c "
SELECT
  p.name,
  b.status,
  b.removal_reason
FROM scheme_engine.beneficiary b
JOIN family_registry.person p ON p.id::text = b.person_id
WHERE p.name IN ('Bhavesh Patel','Savitaben Patel','Shreya Patel',
                 'Gopal Nair','Kavita Rathod')
ORDER BY p.name;"

echo ""
echo "✅ Demo state restored."
echo ""
echo "Pre-demo checklist:"
echo "  1. kubectl get pods -n citizen | grep -v Running  # should be empty"
echo "  2. Officer portal → login as talati → task queue shows red SLA badge"
echo "  3. Family portal → XXXX-XXXX-1001 → tree shows 6 members, Bhavesh grey"
echo "  4. Phone connected → adb devices → scrcpy running"
