#!/usr/bin/env bash
# Generate the department extracts, copy them into the MDM pod and run matching + golden-record build.
# Usage: scripts/mdm_load.sh [extract_dir] [--force]     (COUNT=1000 families by default)
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib/guard.sh
NS=citizen
OUT="${1:-/tmp/tg_sources}"; shift || true
python3 seed_data/telangana/generate_source_extracts_tg.py --out "$OUT" --count "${COUNT:-1000}"
POD=$(kubectl get pod -n $NS -l app=mdm-service -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n $NS "$POD" -- rm -rf /tmp/extracts
kubectl cp "$OUT" "$NS/$POD:/tmp/extracts"
kubectl exec -n $NS "$POD" -- python -m app.loader --dir /tmp/extracts "$@"
