#!/bin/bash
# Build and redeploy the officer portal WITHOUT Superset (Reports will not show embedded dashboards).
# Use build_with_superset.sh instead when Superset is running in the cluster.
# shellcheck source=/dev/null
source "$(dirname "$0")/../scripts/lib/guard.sh"
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAMESPACE=citizen
echo "=== Officer portal build (no Superset) ==="
docker build \
  --build-arg VITE_CASTE_API=/caste-certificate-service \
  --build-arg VITE_MARRIAGE_API=/marriage-certificate-service \
  --build-arg VITE_PENSION_API=/pension-service \
  --build-arg VITE_FAMILY_MB_API=/family-member-service \
  --build-arg VITE_SCHEME_APP_API=/scheme-application-service \
  --build-arg VITE_FAMILY_API=/family-registry-service \
  --build-arg VITE_SCHEME_API=/scheme-engine-service \
  --build-arg VITE_KEYCLOAK_URL= \
  --build-arg VITE_GRIEVANCE_API=/grievance-service \
  --build-arg VITE_NOTIFICATIONS_API=/notifications-service \
  --build-arg VITE_SUPERSET_URL="${VITE_SUPERSET_URL:-http://127.0.0.1:31176}" \
  --build-arg VITE_SUPERSET_EMBEDS="{}" \
  --build-arg VITE_AI_BASE="/ai-intelligence-service" \
  -t cs-officer-portal:dev "$ROOT/officer-portal"
kubectl rollout restart deployment/officer-portal -n "$NAMESPACE"
kubectl rollout status deployment/officer-portal -n "$NAMESPACE" --timeout=180s
echo "=== Done: http://127.0.0.1:31173 ==="
