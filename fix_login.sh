#!/usr/bin/env bash
# Recover portal login when Keycloak realm is lost or auth returns 500/502.
set -euo pipefail

NS="${NAMESPACE:-egov}"
MAC_IP=$(ipconfig getifaddr en0 2>/dev/null || true)

echo "=== Fix portal login ==="
echo "→ Restarting Keycloak (re-imports egov realm from ConfigMap)..."
kubectl rollout restart deployment/keycloak -n "$NS"
kubectl rollout status deployment/keycloak -n "$NS" --timeout=120s

echo "→ Restarting auth-service (CORS fix for containerized portal)..."
kubectl rollout restart deployment/auth-service -n "$NS"
kubectl rollout status deployment/auth-service -n "$NS" --timeout=90s

echo "→ Waiting for Keycloak to accept logins..."
sleep 10

if [[ -n "$MAC_IP" ]]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 \
    -X POST "http://${MAC_IP}:30073/realms/egov/protocol/openid-connect/token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'grant_type=password&client_id=officer-portal&username=talati&password=officer123' || echo "000")
  echo "Officer token test: HTTP $code"
  echo ""
  echo "Use these URLs (not localhost, not an old IP):"
  echo "  officer-portal : http://${MAC_IP}:30073"
  echo "  citizen-portal : http://${MAC_IP}:30074"
else
  echo "Could not detect en0 IP — open portals using your Mac's LAN IP on ports 30073/30074"
fi
