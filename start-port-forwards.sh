#!/usr/bin/env bash
# shellcheck source=/dev/null
source "$(dirname "$0")/scripts/lib/guard.sh"
# Start kubectl port-forwards for local portal development.
# Run once, keep this terminal open (or run in background with nohup).
set -euo pipefail

NS="${NAMESPACE:-citizen}"

FORWARDS=(
  "caste-certificate-service:8080:8080"
  "marriage-certificate-service:8081:8080"
  "pension-service:8082:8080"
  "family-member-service:8083:8080"
  "scheme-application-service:8084:8080"
  "family-registry-service:8085:8080"
  "scheme-engine-service:8086:8080"
  "scheme-engine-service:8086:8080"
  "auth-service:8087:8080"
  "keycloak:8090:8080"
  "chatbot-service:8088:8088"
)

echo "Starting port-forwards in namespace ${NS}..."
if [[ "${1:-}" == "--restart" ]]; then
  pkill -f "kubectl port-forward.*-n ${NS}" 2>/dev/null || true
  sleep 1
fi

for entry in "${FORWARDS[@]}"; do
  svc="${entry%%:*}"
  rest="${entry#*:}"
  local_port="${rest%%:*}"
  remote_port="${rest##*:}"
  kubectl port-forward "svc/${svc}" "${local_port}:${remote_port}" -n "${NS}" \
    >/tmp/pf-${svc}.log 2>&1 &
  echo "  ${local_port} → ${svc}"
done

sleep 3
echo ""
echo "Health check:"
for port in 8080 8081 8082 8083 8084 8085 8086 8087 8088 8090; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://localhost:${port}/" 2>/dev/null || echo "down")
  echo "  localhost:${port} → HTTP ${code}"
done
echo ""
echo "Port-forwards running. Keep this terminal open."
echo "Logs: /tmp/pf-*.log"
wait
