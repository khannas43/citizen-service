#!/usr/bin/env bash
# Loads the Telangana sample data that fills the gaps against DG2.0: offices, scheme page content, consents/documents, payments.
# Run from the repo root. Uses the superuser in the citizen namespace only (never egov).
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/lib/guard.sh 2>/dev/null || true
NS=citizen
POD=$(kubectl get pod -n $NS -l app=postgres -o jsonpath='{.items[0].metadata.name}')
psqlf() { kubectl exec -n $NS "$POD" -- psql -U postgres -d citizen_db -v ON_ERROR_STOP=1 -q -f "$1"; }
cp_sql() { kubectl cp "$1" "$NS/$POD:$2"; }

echo "== registry villages"
kubectl exec -n $NS "$POD" -- psql -U postgres -d citizen_db -At -F, \
  -c "select distinct district, taluka, village from family_registry.family where village is not null" > /tmp/tg_registry.csv
echo "   $(wc -l < /tmp/tg_registry.csv) villages with families"

echo "== offices"
python3 seed_data/telangana/seed_offices_tg.py --registry /tmp/tg_registry.csv > /tmp/tg_offices.sql
cp_sql /tmp/tg_offices.sql /tmp/tg_offices.sql; psqlf /tmp/tg_offices.sql

echo "== scheme page content"
python3 seed_data/telangana/seed_scheme_content_tg.py > /tmp/tg_content.sql
cp_sql /tmp/tg_content.sql /tmp/tg_content.sql; psqlf /tmp/tg_content.sql

echo "== consents + documents"
cp_sql seed_data/telangana/seed_consents_docs_tg.sql /tmp/tg_consents.sql; psqlf /tmp/tg_consents.sql

echo "== payments"
cp_sql seed_data/telangana/seed_payments_tg.sql /tmp/tg_payments.sql
kubectl exec -n $NS "$POD" -- psql -U postgres -d citizen_db -v ON_ERROR_STOP=1 -f /tmp/tg_payments.sql

echo "== counts"
kubectl exec -n $NS "$POD" -- psql -U postgres -d citizen_db -c "
select 'offices' t, count(*) from scheme_engine.service_office union all
select 'office_links', count(*) from scheme_engine.office_service_link union all
select 'geo_centroid', count(*) from scheme_engine.geo_centroid union all
select 'scheme_content', count(*) from scheme_engine.scheme_content union all
select 'consents', count(*) from family_registry.consent union all
select 'documents', count(*) from family_registry.citizen_document;"
echo "done. Next: python3 seed_data/telangana/seed_activity_tg.py --enrich"
