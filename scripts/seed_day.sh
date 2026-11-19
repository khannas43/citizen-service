#!/usr/bin/env bash
# Seeds one synthetic day of births and deaths (DEMO- records) as an officer.
# Usage: bash scripts/seed_day.sh [births] [deaths]     (defaults 210 70)
# Env:   KEYCLOAK_URL (default http://localhost:8090), SEED_USER (dept.admin), SEED_PASSWORD (officer123)
set -euo pipefail
USER_NAME="${SEED_USER:-dept.admin}"
PASS="${SEED_PASSWORD:-officer123}"
BIRTHS="${1:-210}"
DEATHS="${2:-70}"

# The officer portal (31173) proxies the citizen realm; 8090 may be a port-forward to another Keycloak.
CANDIDATES="${KEYCLOAK_URL:-http://localhost:31173 http://localhost:8090}"
TOKEN=""; RESP=""
for KC in $CANDIDATES; do
  RESP=$(curl -s -m 10 -X POST "$KC/realms/citizen/protocol/openid-connect/token" \
    -d grant_type=password -d client_id=officer-portal \
    -d "username=$USER_NAME" -d "password=$PASS" || true)
  TOKEN=$(printf '%s' "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)
  if [ -n "$TOKEN" ]; then echo "Signed in through $KC"; break; fi
  echo "No token from $KC: ${RESP:0:160}"
done
if [ -z "$TOKEN" ]; then
  echo "Could not get an officer token (user $USER_NAME) from: $CANDIDATES"
  echo "Check the Keycloak address (set KEYCLOAK_URL) and that the user exists."
  exit 1
fi
# The seeder imports the service code and reads live persons directly, so it needs both of these.
export PYTHONPATH="$(pwd)/mdm-service${PYTHONPATH:+:$PYTHONPATH}"
if [ -z "${MDM_DB_DSN:-}" ]; then
  echo "MDM_DB_DSN is not set. Set it to the same live database address you used for demo_cleanup.py, then run again."
  exit 1
fi
echo "Got a token for $USER_NAME. Seeding $BIRTHS births and $DEATHS deaths..."
python3 mdm-service/tools/volume_seed.py --births "$BIRTHS" --deaths "$DEATHS" --token "$TOKEN"
