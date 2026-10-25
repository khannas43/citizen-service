#!/bin/bash
# Start the host-side speech worker (see scripts/stt_worker.py). Creates a token on first run and reuses it.
set -e
cd "$(dirname "$0")/.."
TOKEN_FILE="$HOME/.dg20-stt-token"
if [ ! -s "$TOKEN_FILE" ]; then
  umask 077
  python3 -c "import secrets; print(secrets.token_urlsafe(32))" > "$TOKEN_FILE"
  echo "Created $TOKEN_FILE. Store it for the cluster with:"
  echo "  kubectl -n citizen create secret generic stt-worker --from-file=token=$TOKEN_FILE"
fi
export STT_WORKER_TOKEN="$(cat "$TOKEN_FILE")"
export PYTHONPATH=.
exec "${PYTHON:-python3}" -m uvicorn scripts.stt_worker:app --host 0.0.0.0 --port "${PORT:-8091}"
