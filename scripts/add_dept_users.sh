#!/usr/bin/env bash
# Create the two department demo users and roles if missing. Never deletes or resets anyone else.
# Usage: bash scripts/add_dept_users.sh
# Optional: KEYCLOAK_URL=http://127.0.0.1:18090 DRY_RUN=1 bash scripts/add_dept_users.sh
# Needs the citizen-namespace Keycloak admin API. Port 8090 is often the egov Keycloak
# (dg20 keep-alive); this script tries KEYCLOAK_URL / 127.0.0.1:8090, then opens a
# temporary forward to citizen/keycloak on 18090. Officer portal (31173) has no /admin/.
# shellcheck source=/dev/null
source "$(dirname "$0")/lib/guard.sh"
set -euo pipefail

STATE_CODE="${STATE_CODE:-TG}"
DRY_RUN="${DRY_RUN:-0}"
TEMP_PF_PID=""
cleanup() { [[ -n "${TEMP_PF_PID}" ]] && kill "${TEMP_PF_PID}" 2>/dev/null || true; }
trap cleanup EXIT

try_keycloak() {
  local KC=$1
  local RESP TOK BODY
  RESP=$(curl -s -m 10 -X POST "${KC}/realms/master/protocol/openid-connect/token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'grant_type=password&client_id=admin-cli&username=admin&password=admin' || true)
  if ! echo "${RESP}" | python3 -c "import sys,json; json.load(sys.stdin)['access_token']" >/dev/null 2>&1; then
    echo "  No admin token from ${KC}: ${RESP:0:120}"
    TOKEN_RESPONSE="${RESP}"
    return 1
  fi
  TOK=$(echo "${RESP}" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
  BODY=$(curl -s -m 10 -H "Authorization: Bearer ${TOK}" "${KC}/admin/realms/citizen" || true)
  if ! echo "${BODY}" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('realm')=='citizen'" >/dev/null 2>&1; then
    echo "  ${KC}: citizen realm not on this Keycloak (often egov on 8090)"
    TOKEN_RESPONSE="${RESP}"
    return 1
  fi
  KEYCLOAK_URL="${KC}"
  ADMIN_TOKEN="${TOK}"
  TOKEN_RESPONSE="${RESP}"
  echo "Using ${KEYCLOAK_URL}"
  return 0
}

ADMIN_TOKEN=""
TOKEN_RESPONSE=""
# Save caller override, then clear so try_keycloak can set the working URL.
CANDIDATES="${KEYCLOAK_URL:-http://127.0.0.1:8090}"
KEYCLOAK_URL=""
for KC in $CANDIDATES; do
  echo "Trying ${KC}..."
  if try_keycloak "${KC}"; then
    break
  fi
done

if [[ -z "${ADMIN_TOKEN}" && "${DRY_RUN}" != "1" ]]; then
  echo "Opening a temporary port-forward to citizen/keycloak on 18090..."
  kubectl -n citizen port-forward --address 127.0.0.1 svc/keycloak 18090:8080 >/tmp/pf-kc-citizen-admin.log 2>&1 &
  TEMP_PF_PID=$!
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    if try_keycloak "http://127.0.0.1:18090"; then
      break
    fi
  done
fi

if [[ -z "${ADMIN_TOKEN}" ]]; then
  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "DRY_RUN: Keycloak not reachable; script would create roles PDS_OFFICER, HEALTH_OFFICER"
    echo "DRY_RUN: and users pds.officer, health.officer (password officer123) if missing."
    echo "DRY_RUN: It never deletes or recreates existing users/roles."
    exit 0
  fi
  echo "Failed to reach the citizen Keycloak admin API."
  echo "Last response: ${TOKEN_RESPONSE:-<empty>}"
  exit 1
fi

ensure_role() {
  local ROLE=$1
  local CODE
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${KEYCLOAK_URL}/admin/realms/citizen/roles" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "{\"name\": \"${ROLE}\", \"description\": \"${ROLE} role\"}")
  if [[ "${CODE}" == "201" ]]; then
    echo "  Created role ${ROLE}"
  elif [[ "${CODE}" == "409" ]]; then
    echo "  Role ${ROLE} already exists"
  else
    echo "  Role ${ROLE}: HTTP ${CODE}"
  fi
}

ensure_user() {
  local USERNAME=$1
  local DISPLAY=$2
  local ROLE=$3
  local EMAIL="${USERNAME}@demo.gov.in"

  local EXISTING_ID
  EXISTING_ID=$(curl -s "${KEYCLOAK_URL}/admin/realms/citizen/users?username=${USERNAME}&exact=true" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    | python3 -c "import sys,json; u=json.load(sys.stdin); print(u[0]['id'] if u else '')" 2>/dev/null || true)

  if [[ -n "${EXISTING_ID}" ]]; then
    echo "  User ${USERNAME} already exists — left unchanged"
    # Ensure role mapping (idempotent add)
    local ROLE_JSON USER_ID
    USER_ID="${EXISTING_ID}"
    ROLE_JSON=$(curl -s "${KEYCLOAK_URL}/admin/realms/citizen/roles/${ROLE}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}")
    curl -s -o /dev/null -X POST \
      "${KEYCLOAK_URL}/admin/realms/citizen/users/${USER_ID}/role-mappings/realm" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H 'Content-Type: application/json' \
      -d "[${ROLE_JSON}]" || true
    return 0
  fi

  local HTTP
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${KEYCLOAK_URL}/admin/realms/citizen/users" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "{
      \"username\": \"${USERNAME}\",
      \"enabled\": true,
      \"email\": \"${EMAIL}\",
      \"emailVerified\": true,
      \"firstName\": \"${DISPLAY}\",
      \"attributes\": {\"state_code\": [\"${STATE_CODE}\"]},
      \"requiredActions\": [],
      \"credentials\": [{\"type\":\"password\",\"value\":\"officer123\",\"temporary\":false}]
    }")
  if [[ "${HTTP}" != "201" ]]; then
    echo "Warning: create user ${USERNAME} returned HTTP ${HTTP}"
    return 0
  fi

  local USER_ID ROLE_JSON
  USER_ID=$(curl -s "${KEYCLOAK_URL}/admin/realms/citizen/users?username=${USERNAME}&exact=true" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
  ROLE_JSON=$(curl -s "${KEYCLOAK_URL}/admin/realms/citizen/roles/${ROLE}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}")
  curl -s -o /dev/null -X POST \
    "${KEYCLOAK_URL}/admin/realms/citizen/users/${USER_ID}/role-mappings/realm" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "[${ROLE_JSON}]"
  echo "  Created user ${USERNAME} → ${ROLE}"
}

echo "Ensuring department roles..."
ensure_role "PDS_OFFICER"
ensure_role "HEALTH_OFFICER"

echo "Ensuring department users (create only if missing)..."
ensure_user "pds.officer" "Civil supplies officer" "PDS_OFFICER"
ensure_user "health.officer" "Health officer" "HEALTH_OFFICER"

echo "Done. Existing users and passwords were not changed."
