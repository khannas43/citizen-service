#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAMESPACE=egov

echo "=== DG 2.0 — Apache Superset Deploy ==="

POSTGRES_POD=$(kubectl get pods -n "$NAMESPACE" -l app=postgres -o jsonpath='{.items[0].metadata.name}')
echo "→ Ensuring Superset metadata database exists..."
kubectl exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U egovuser -d egov_db -tc \
  "SELECT 1 FROM pg_database WHERE datname='superset'" | grep -q 1 || \
kubectl exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U egovuser -d egov_db -c "CREATE DATABASE superset;"

echo "→ Applying analytics SQL views..."
kubectl cp "$ROOT/superset/seed_analytics_views.sql" "$NAMESPACE/$POSTGRES_POD:/tmp/seed_analytics_views.sql"
kubectl exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U egovuser -d egov_db -f /tmp/seed_analytics_views.sql

echo "→ Applying executive dashboard SQL views..."
kubectl cp "$ROOT/superset/superset_dashboard_views.sql" "$NAMESPACE/$POSTGRES_POD:/tmp/superset_dashboard_views.sql"
kubectl exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U egovuser -d egov_db -f /tmp/superset_dashboard_views.sql

echo "→ Applying Kubernetes manifests (excluding init job)..."
kubectl delete job superset-init -n "$NAMESPACE" --ignore-not-found
kubectl create configmap superset-bootstrap -n "$NAMESPACE" \
  --from-file=bootstrap_reporting.py="$ROOT/superset/bootstrap_reporting.py" \
  --dry-run=client -o yaml | kubectl apply -f -

MAC_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
kubectl patch configmap superset-env -n "$NAMESPACE" --type merge -p \
  "{\"data\":{\"OFFICER_PORTAL_ORIGINS\":\"http://localhost:30073,http://127.0.0.1:30073,http://${MAC_IP}:30073\"}}"

kubectl apply -f "$ROOT/superset/k8s-manifest.yaml"

echo "→ Waiting for Superset init job..."
kubectl wait --for=condition=complete job/superset-init -n "$NAMESPACE" --timeout=600s

echo "→ Waiting for Superset deployment..."
kubectl rollout status deployment/superset -n "$NAMESPACE" --timeout=300s

MAC_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
EGOV_USER=$(kubectl get secret db -n "$NAMESPACE" -o jsonpath='{.data.username}' | base64 -d)
EGOV_PASS=$(kubectl get secret db -n "$NAMESPACE" -o jsonpath='{.data.password}' | base64 -d)

echo ""
echo "=== Superset is ready ==="
echo "  URL:      http://${MAC_IP}:30076"
echo "  Login:    admin / admin123"
echo ""
echo "  Add data source (Settings → Database → + Database):"
echo "  Display name: DG20 eGov Warehouse"
echo "  URI: postgresql+psycopg2://${EGOV_USER}:${EGOV_PASS}@postgres.egov.svc.cluster.local:5432/egov_db"
echo ""
echo "  Recommended datasets (schema analytics):"
echo "    analytics.beneficiary_by_status"
echo "    analytics.beneficiary_by_district"
echo "    analytics.scheme_enrollment"
echo "    analytics.grievance_summary"
echo "    analytics.platform_snapshot"
echo "  Dashboard: DG 2.0 Platform Dashboard (slug: dg20-platform)"
echo ""
echo "  Officer portal → Reports menu embeds dashboard at /reports"
