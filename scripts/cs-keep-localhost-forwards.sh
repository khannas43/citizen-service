#!/bin/bash
# shellcheck source=/dev/null
source "$(dirname "$0")/lib/guard.sh"
# Keep Citizen Services demo services reachable on localhost (Rancher NodePorts bind the VM IP only).
# LaunchAgent cannot execute this from Documents (macOS TCC). Installer copies it to ~/bin.
# Agent: ~/Library/LaunchAgents/com.citizen.localhost-forwards.plist
export PATH="${HOME}/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"
export KUBECONFIG="${HOME}/.kube/config"
NS=citizen

forwards=(
  "svc/officer-portal 31173:80"
  "svc/citizen-portal 31174:80"
  "svc/family-portal 31175:80"
  "svc/superset 31176:8088"
  "svc/keycloak 8090:8080"
  "svc/ai-intelligence-service 31189:8089"
)

listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

while true; do
  if ! kubectl get ns "$NS" >/dev/null 2>&1; then
    sleep 8
    continue
  fi
  for spec in "${forwards[@]}"; do
    svc=${spec%% *}
    ports=${spec##* }
    local_port=${ports%%:*}
    if ! listening "$local_port"; then
      kubectl port-forward -n "$NS" --address localhost "$svc" "$ports" \
        >>"${HOME}/.dg20-pf-${local_port}.log" 2>&1 &
    fi
  done
  # Android emulator: map emulator localhost → Mac port-forwards
  if command -v adb >/dev/null 2>&1 && adb devices 2>/dev/null | grep -q emulator; then
    adb reverse tcp:31174 tcp:31174 >/dev/null 2>&1 || true
    adb reverse tcp:31189 tcp:31189 >/dev/null 2>&1 || true
    adb reverse tcp:31173 tcp:31173 >/dev/null 2>&1 || true
  fi
  sleep 4
done
