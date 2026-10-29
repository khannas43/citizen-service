#!/usr/bin/env bash
# Create the mdm schema, build the MDM service image and deploy it into namespace citizen. Never touches egov.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib/guard.sh
NS=citizen
POD=$(kubectl get pod -n $NS -l app=postgres -o jsonpath='{.items[0].metadata.name}')
echo "== database objects (schema mdm, state-scoped)"
for f in 001_mdm.sql 002_exchange.sql 003_wave2.sql 004_wave3.sql 005_wave4.sql; do
  kubectl cp "db/mdm/$f" "$NS/$POD:/tmp/$f"
  kubectl exec -n $NS "$POD" -- psql -U postgres -d citizen_db -v ON_ERROR_STOP=1 -q -f "/tmp/$f"
done
echo "== image + deployment"
docker build -q -t cs-mdm-service:dev mdm-service
kubectl apply -f mdm-service/k8s-manifest.yaml
kubectl -n $NS rollout restart deployment/mdm-service
kubectl -n $NS rollout status deployment/mdm-service --timeout=240s
echo "done. Next: scripts/mdm_load.sh"
