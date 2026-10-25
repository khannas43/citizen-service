#!/usr/bin/env bash
# Build jars + images (cs-<name>:dev) and deploy the lean service set into namespace citizen.
# Usage: scripts/build_services.sh [service ...]   (default: the lean set)
# shellcheck source=/dev/null
source "$(dirname "$0")/lib/guard.sh"
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS="${CS_NAMESPACE:-citizen}"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17 2>/dev/null || true)}"
LEAN=(auth-service family-registry-service family-member-service scheme-engine-service scheme-application-service grievance-service notifications-service chatbot-service)
SERVICES=("$@"); [ ${#SERVICES[@]} -eq 0 ] && SERVICES=("${LEAN[@]}")

echo "=== platform-tenancy ==="
mvn -q -f "$REPO_ROOT/platform-tenancy/pom.xml" install

for s in "${SERVICES[@]}"; do
  echo "=== $s ==="
  mvn -q -f "$REPO_ROOT/$s/pom.xml" -DskipTests package
  docker build -q -t "cs-$s:dev" "$REPO_ROOT/$s"
  kubectl apply -f "$REPO_ROOT/$s/k8s-manifest.yaml"
  kubectl -n "$NS" rollout restart "deployment/$s"
done
for s in "${SERVICES[@]}"; do
  kubectl -n "$NS" rollout status "deployment/$s" --timeout=240s
done
kubectl -n "$NS" get pods
