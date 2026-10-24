#!/bin/bash
# Keep DG 2.0 demo services reachable on localhost (Rancher NodePorts bind the VM IP only).
# LaunchAgent cannot execute this from Documents (macOS TCC). Installer copies it to ~/bin.
# Agent: ~/Library/LaunchAgents/com.dg20.localhost-forwards.plist
export PATH="${HOME}/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"
export KUBECONFIG="${HOME}/.kube/config"
NS=egov

forwards=(
  "svc/officer-portal 30073:80"
  "svc/citizen-portal 30074:80"
  "svc/family-portal 30075:80"
  "svc/superset 30076:8088"
  "svc/keycloak 8090:8080"
  "svc/ai-intelligence-service 30089:8089"
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
    adb reverse tcp:30074 tcp:30074 >/dev/null 2>&1 || true
    adb reverse tcp:30089 tcp:30089 >/dev/null 2>&1 || true
    adb reverse tcp:30073 tcp:30073 >/dev/null 2>&1 || true
  fi
  sleep 4
done
