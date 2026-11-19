#!/usr/bin/env bash
# Create the mdm schema, build the MDM service image and deploy it into namespace citizen. Never touches egov.
# Applying mdm-service/k8s-manifest.yaml resets NOTIFY_ENABLED to false (same pattern as MT_ENABLED).
# Turn NOTIFY_ENABLED=true on the deployment when a demo or live environment should post to notifications-service.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib/guard.sh
NS=citizen
POD=$(kubectl get pod -n $NS -l app=postgres -o jsonpath='{.items[0].metadata.name}')
echo "== database objects (schema mdm, state-scoped)"
for f in 001_mdm.sql 002_exchange.sql 003_wave2.sql 004_wave3.sql 005_wave4.sql 006_quality.sql 007_quality_daily.sql 008_quality_reasons.sql 009_record_link_history.sql 010_dept_response.sql 011_citizen_link.sql 012_translation_cache.sql 013_translation_memory.sql 014_citizen_approvals.sql 015_work_queue.sql 016_uc1.sql 017_uc4.sql 018_uc5.sql; do
  kubectl cp "db/mdm/$f" "$NS/$POD:/tmp/$f"
  kubectl exec -n $NS "$POD" -- psql -U postgres -d citizen_db -v ON_ERROR_STOP=1 -q -f "/tmp/$f"
done
echo "== image + deployment"
docker build -q -t cs-mdm-service:dev mdm-service
kubectl apply -f mdm-service/k8s-manifest.yaml
kubectl -n $NS rollout restart deployment/mdm-service
kubectl -n $NS rollout status deployment/mdm-service --timeout=240s
echo "done. Next: scripts/mdm_load.sh"
