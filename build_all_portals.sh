#!/bin/bash
set -e
echo "=== DG 2.0 Portal Build ==="
echo "Building with nginx reverse proxy — no IP hardcoding needed"

MAC_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
AI_BASE="/ai-intelligence-service"

echo ""
echo "→ Building officer-portal..."
cd /Users/sameerkhanna/Documents/Projects/DG2.0/officer-portal
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
  --build-arg VITE_SUPERSET_URL=http://localhost:30076 \
  --build-arg VITE_AI_BASE="$AI_BASE" \
  -t officer-portal:arm64-local .
echo "✓ officer-portal built"

echo ""
echo "→ Building citizen-portal..."
cd /Users/sameerkhanna/Documents/Projects/DG2.0/citizen-portal
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
  -t citizen-portal:arm64-local .
echo "✓ citizen-portal built"

echo ""
echo "→ Building family-portal..."
cd /Users/sameerkhanna/Documents/Projects/DG2.0/family-portal
docker build \
  --build-arg VITE_FAMILY_API=/family-registry-service \
  --build-arg VITE_SCHEME_API=/scheme-engine-service \
  --build-arg VITE_CITIZEN_PORTAL= \
  -t family-portal:arm64-local .
echo "✓ family-portal built"

echo ""
echo "→ Applying K8s manifests..."
kubectl apply -f /Users/sameerkhanna/Documents/Projects/DG2.0/officer-portal/k8s-manifest.yaml
kubectl apply -f /Users/sameerkhanna/Documents/Projects/DG2.0/citizen-portal/k8s-manifest.yaml
kubectl apply -f /Users/sameerkhanna/Documents/Projects/DG2.0/family-portal/k8s-manifest.yaml

echo ""
echo "→ Restarting portal deployments..."
kubectl rollout restart deployment/officer-portal -n egov
kubectl rollout restart deployment/citizen-portal -n egov
kubectl rollout restart deployment/family-portal -n egov

kubectl rollout status deployment/officer-portal -n egov --timeout=90s
kubectl rollout status deployment/citizen-portal -n egov --timeout=90s
kubectl rollout status deployment/family-portal -n egov --timeout=90s

MAC_IP=$(ipconfig getifaddr en0)
echo ""
echo "=== Done ==="
echo "  officer-portal : http://$MAC_IP:30073"
echo "  citizen-portal : http://$MAC_IP:30074"
echo "  family-portal  : http://$MAC_IP:30075"
