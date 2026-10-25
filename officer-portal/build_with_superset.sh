#!/bin/bash
# shellcheck source=/dev/null
source "$(dirname "$0")/../scripts/lib/guard.sh"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAMESPACE=citizen
# Prefer loopback so Reports keep working when the Mac LAN IP changes.
MAC_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "127.0.0.1")
SUPERSET_URL="${VITE_SUPERSET_URL:-http://127.0.0.1:31176}"

echo "=== Officer portal build (with Superset embed) ==="

SUPERSET_POD=$(kubectl get pods -n "$NAMESPACE" -l app=superset \
  --field-selector=status.phase=Running \
  -o jsonpath='{.items[0].metadata.name}')
kubectl cp "$ROOT/superset/export_embed_creds.py" "$NAMESPACE/$SUPERSET_POD:/tmp/export_embed_creds.py"
EMBED_JSON=$(kubectl exec -n "$NAMESPACE" "$SUPERSET_POD" -- bash -c \
  'export PYTHONPATH=/app/pythonpath; python /tmp/export_embed_creds.py' 2>/dev/null | tail -1)

echo "→ Embed credentials loaded for dashboards"

docker build --no-cache \
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
  --build-arg VITE_SUPERSET_URL="$SUPERSET_URL" \
  --build-arg VITE_SUPERSET_EMBEDS="$EMBED_JSON" \
  --build-arg VITE_AI_BASE="/ai-intelligence-service" \
  -t cs-officer-portal:dev "$ROOT/officer-portal"

kubectl rollout restart deployment/officer-portal -n "$NAMESPACE"
kubectl rollout status deployment/officer-portal -n "$NAMESPACE" --timeout=120s

echo "=== Done — Reports at http://${MAC_IP}:31173/reports ==="
