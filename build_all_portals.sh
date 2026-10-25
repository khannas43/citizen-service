#!/bin/bash
# shellcheck source=/dev/null
source "$(dirname "$0")/scripts/lib/guard.sh"
set -e
echo "=== Citizen Services Portal Build ==="
echo "Building with nginx reverse proxy — no IP hardcoding needed"

MAC_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
NS="${CS_NAMESPACE:-citizen}"
AI_BASE="/ai-intelligence-service"

echo ""
echo "→ Building officer-portal..."
cd "$REPO_ROOT/officer-portal"
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
  --build-arg VITE_SUPERSET_URL=http://localhost:31176 \
  --build-arg VITE_AI_BASE="$AI_BASE" \
  -t cs-officer-portal:dev .
echo "✓ officer-portal built"

echo ""
echo "→ Building citizen-portal..."
cd "$REPO_ROOT/citizen-portal"
docker build \
  --build-arg VITE_CASTE_API=/caste-certificate-service \
  --build-arg VITE_MARRIAGE_API=/marriage-certificate-service \
  --build-arg VITE_PENSION_API=/pension-service \
  --build-arg VITE_FAMILY_MB_API=/family-member-service \
  --build-arg VITE_SCHEME_APP_API=/scheme-application-service \
  --build-arg VITE_FAMILY_API=/family-registry-service \
  --build-arg VITE_SCHEME_API=/scheme-engine-service \
  --build-arg VITE_AUTH_API=/auth-service \
  --build-arg VITE_CHATBOT_API=/chatbot-service \
  --build-arg VITE_GRIEVANCE_API=/grievance-service \
  --build-arg VITE_NOTIFICATIONS_API=/notifications-service \
  --build-arg VITE_OFFICER_PORTAL_URL= \
  --build-arg VITE_AI_BASE="$AI_BASE" \
  -t cs-citizen-portal:dev .
echo "✓ citizen-portal built"

echo ""
echo "→ Building family-portal..."
cd "$REPO_ROOT/family-portal"
docker build \
  --build-arg VITE_FAMILY_API=/family-registry-service \
  --build-arg VITE_SCHEME_API=/scheme-engine-service \
  --build-arg VITE_CITIZEN_PORTAL= \
  -t cs-family-portal:dev .
echo "✓ family-portal built"

echo ""
echo "→ Applying K8s manifests..."
kubectl apply -f "$REPO_ROOT/officer-portal/k8s-manifest.yaml"
kubectl apply -f "$REPO_ROOT/citizen-portal/k8s-manifest.yaml"
kubectl apply -f "$REPO_ROOT/family-portal/k8s-manifest.yaml"

echo ""
echo "→ Restarting portal deployments..."
kubectl rollout restart deployment/officer-portal -n "$NS"
kubectl rollout restart deployment/citizen-portal -n "$NS"
kubectl rollout restart deployment/family-portal -n "$NS"

kubectl rollout status deployment/officer-portal -n "$NS" --timeout=90s
kubectl rollout status deployment/citizen-portal -n "$NS" --timeout=90s
kubectl rollout status deployment/family-portal -n "$NS" --timeout=90s

MAC_IP=$(ipconfig getifaddr en0)
echo ""
echo "=== Done ==="
echo "  officer-portal : http://$MAC_IP:31173"
echo "  citizen-portal : http://$MAC_IP:31174"
echo "  family-portal  : http://$MAC_IP:31175"
