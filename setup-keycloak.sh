#!/usr/bin/env bash
# shellcheck source=/dev/null
source "$(dirname "$0")/scripts/lib/guard.sh"
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8090}"

echo "Getting admin token from ${KEYCLOAK_URL}..."
TOKEN_RESPONSE=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password&client_id=admin-cli&username=admin&password=admin')

if ! echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; json.load(sys.stdin)['access_token']" >/dev/null 2>&1; then
  echo "Failed to get admin token. Is Keycloak running?"
  echo "  1. kubectl port-forward svc/keycloak 8090:8080 -n citizen"
  echo "  2. Wait ~60s after pod start, then retry"
  echo "  3. If still failing: kubectl rollout restart deployment/keycloak -n citizen"
  echo "Response: ${TOKEN_RESPONSE:-<empty — port-forward likely not running>}"
  exit 1
fi

ADMIN_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Creating realm citizen..."
curl -s -o /dev/null -w "%{http_code}" -X POST "${KEYCLOAK_URL}/admin/realms" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "realm": "citizen",
    "enabled": true,
    "displayName": "Gujarat Government - EGOV",
    "registrationAllowed": false,
    "loginWithEmailAllowed": false,
    "duplicateEmailsAllowed": true,
    "resetPasswordAllowed": false,
    "editUsernameAllowed": false,
    "bruteForceProtected": false,
    "accessTokenLifespan": 86400,
    "accessTokenLifespanForImplicitFlow": 86400,
    "ssoSessionIdleTimeout": 86400,
    "ssoSessionMaxLifespan": 86400
  }' | grep -qE '^(201|409)$' || echo "(realm may already exist)"

echo "Setting 24h token / SSO lifespans on citizen (demo)..."
export KEYCLOAK_URL ADMIN_TOKEN
python3 - <<'PY'
import json, os, urllib.request
url = os.environ['KEYCLOAK_URL']
token = os.environ['ADMIN_TOKEN']
req = urllib.request.Request(
    f'{url}/admin/realms/citizen',
    headers={'Authorization': f'Bearer {token}'},
)
with urllib.request.urlopen(req) as resp:
    realm = json.loads(resp.read())
realm['accessTokenLifespan'] = 86400
realm['accessTokenLifespanForImplicitFlow'] = 86400
realm['ssoSessionIdleTimeout'] = 86400
realm['ssoSessionMaxLifespan'] = 86400
body = json.dumps(realm).encode()
put = urllib.request.Request(
    f'{url}/admin/realms/citizen',
    data=body,
    method='PUT',
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    },
)
with urllib.request.urlopen(put) as resp:
    print(f'  realm updated HTTP {resp.status}')
PY

echo "Disabling all required actions (Keycloak 24 defaults block direct-grant login)..."
export KEYCLOAK_URL ADMIN_TOKEN
curl -s "${KEYCLOAK_URL}/admin/realms/citizen/authentication/required-actions" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
| python3 -c "
import json, os, subprocess, sys
actions = json.load(sys.stdin)
url = os.environ['KEYCLOAK_URL']
token = os.environ['ADMIN_TOKEN']
for a in actions:
    alias = a['alias']
    body = json.dumps({'alias': alias, 'enabled': False, 'defaultAction': False, 'priority': a.get('priority', 0)})
    subprocess.run(['curl', '-s', '-o', '/dev/null', '-X', 'PUT',
        f'{url}/admin/realms/citizen/authentication/required-actions/{alias}',
        '-H', f'Authorization: Bearer {token}', '-H', 'Content-Type: application/json', '-d', body], check=False)
    print(f'  disabled {alias}')
"

echo "Creating client officer-portal..."
curl -s -o /dev/null -w "%{http_code}" -X POST "${KEYCLOAK_URL}/admin/realms/citizen/clients" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "clientId": "officer-portal",
    "enabled": true,
    "publicClient": true,
    "directAccessGrantsEnabled": true,
    "standardFlowEnabled": false,
    "redirectUris": ["http://localhost:5173/*"],
    "webOrigins": ["http://localhost:5173"]
  }' | grep -qE '^(201|409)$' || echo "(client may already exist)"


STATE_CODE="${STATE_CODE:-TG}"
echo "Registering state_code user attribute and 'state' token claim..."
python3 - "$KEYCLOAK_URL" "$ADMIN_TOKEN" <<'PY'
import json, sys, urllib.request
url, token = sys.argv[1], sys.argv[2]
def call(method, path, body=None):
    req = urllib.request.Request(f'{url}/admin/realms/citizen{path}', method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read(); return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        if e.code == 409: return None
        raise
prof = call('GET', '/users/profile')
if not any(a['name'] == 'state_code' for a in prof['attributes']):
    prof['attributes'].append({'name': 'state_code', 'displayName': 'State',
        'validations': {'length': {'min': 2, 'max': 2}},
        'permissions': {'view': ['admin', 'user'], 'edit': ['admin']}, 'multivalued': False})
    call('PUT', '/users/profile', prof)
client = call('GET', '/clients?clientId=officer-portal')[0]['id']
call('POST', f'/clients/{client}/protocol-mappers/models', {'name': 'state', 'protocol': 'openid-connect',
    'protocolMapper': 'oidc-usermodel-attribute-mapper', 'config': {'user.attribute': 'state_code',
    'claim.name': 'state', 'jsonType.label': 'String', 'id.token.claim': 'true',
    'access.token.claim': 'true', 'userinfo.claim': 'true'}})
print('  done')
PY

echo "Creating realm roles..."
for ROLE in DATA_ENTRY_OFFICER TALATI REVENUE_OFFICER SCHEME_DEPT DEPT_ADMIN IT_ADMIN SENIOR_MGMT; do
  curl -s -o /dev/null -X POST "${KEYCLOAK_URL}/admin/realms/citizen/roles" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "{\"name\": \"${ROLE}\", \"description\": \"${ROLE} role\"}" || true
done

create_user() {
  USERNAME=$1
  DISPLAY=$2
  ROLE=$3
  EMAIL="${USERNAME}@demo.gov.in"

  # Remove existing user so credentials/required-actions are clean
  EXISTING_ID=$(curl -s "${KEYCLOAK_URL}/admin/realms/citizen/users?username=${USERNAME}&exact=true" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    | python3 -c "import sys,json; u=json.load(sys.stdin); print(u[0]['id'] if u else '')" 2>/dev/null || true)
  if [[ -n "${EXISTING_ID}" ]]; then
    curl -s -o /dev/null -X DELETE "${KEYCLOAK_URL}/admin/realms/citizen/users/${EXISTING_ID}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}"
  fi

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
  if [[ "$HTTP" != "201" ]]; then
    echo "Warning: create user ${USERNAME} returned HTTP ${HTTP}"
  fi

  USER_ID=$(curl -s "${KEYCLOAK_URL}/admin/realms/citizen/users?username=${USERNAME}&exact=true" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

  ROLE_ID=$(curl -s "${KEYCLOAK_URL}/admin/realms/citizen/roles/${ROLE}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

  curl -s -o /dev/null -X POST \
    "${KEYCLOAK_URL}/admin/realms/citizen/users/${USER_ID}/role-mappings/realm" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "[{\"id\":\"${ROLE_ID}\",\"name\":\"${ROLE}\"}]"

  echo "  User ${USERNAME} → ${ROLE}"
}

echo "Creating demo users..."
create_user "data.entry"  "Data Entry Officer" "DATA_ENTRY_OFFICER"
create_user "talati"      "Talati Officer"     "TALATI"
create_user "mamlatdar"   "Mamlatdar Officer"  "TALATI"
create_user "revenue"     "Revenue Officer"    "REVENUE_OFFICER"
create_user "revenue_officer" "Revenue Officer" "REVENUE_OFFICER"
create_user "scheme.dept" "Scheme Department"  "SCHEME_DEPT"
create_user "dept.admin"  "Department Admin"   "DEPT_ADMIN"
create_user "dept.admin2" "Department Admin 2" "DEPT_ADMIN"
create_user "dept_admin"  "Department Admin"   "DEPT_ADMIN"
create_user "it.admin"    "IT Secretary"       "IT_ADMIN"
create_user "senior.mgmt" "Senior Management"  "SENIOR_MGMT"

echo "Keycloak setup complete."

echo "Verifying talati login..."
VERIFY=$(curl -s -X POST \
  "${KEYCLOAK_URL}/realms/citizen/protocol/openid-connect/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password&client_id=officer-portal&username=talati&password=officer123')
if echo "$VERIFY" | python3 -c "import sys,json; json.load(sys.stdin)['access_token']" >/dev/null 2>&1; then
  echo "✓ talati/officer123 login OK — access_token received"
else
  echo "$VERIFY" | python3 -m json.tool
  exit 1
fi
