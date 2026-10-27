#!/usr/bin/env bash
# Read-only: row counts per table in DG2.0 (egov_db) vs Citizen-Services (citizen_db), side by side.
# Reads only; never writes to either database. Output: /tmp/data_inventory.txt
set -euo pipefail
Q="select table_schema||'.'||table_name,
 (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
 from information_schema.tables where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema','platform')
 order by 1"
pod() { kubectl get pod -n "$1" -o name | grep -m1 postgres | sed 's|pod/||'; }
EP=$(pod egov); CP=$(pod citizen)
echo "egov pod=$EP  citizen pod=$CP"
kubectl exec -n egov "$EP" -- psql -U egovuser -d egov_db -At -F'|' -c "$Q" | sort > /tmp/inv_egov.txt
kubectl exec -n citizen "$CP" -- psql -U postgres -d citizen_db -At -F'|' -c "$Q" | sort > /tmp/inv_citizen.txt
join -t'|' -a1 -a2 -e '-' -o 0,1.2,2.2 /tmp/inv_egov.txt /tmp/inv_citizen.txt \
 | grep -v '\.\(act_\|flw_\)' | awk -F'|' 'BEGIN{printf "%-58s %10s %10s\n","table","DG2.0","citizen"} {printf "%-58s %10s %10s\n",$1,$2,$3}' | tee /tmp/data_inventory.txt
