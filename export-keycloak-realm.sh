#!/usr/bin/env bash
# shellcheck source=/dev/null
source "$(dirname "$0")/scripts/lib/guard.sh"
# export-keycloak-realm.sh — export citizen realm with clients, roles, and users for KC import
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8090}"
OUT="${1:-$(dirname "$0")/citizen-realm.json}"

ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password&client_id=admin-cli&username=admin&password=admin' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

export KEYCLOAK_URL ADMIN_TOKEN OUT
python3 << 'PYEOF'
import json, os, urllib.request

url = os.environ['KEYCLOAK_URL']
token = os.environ['ADMIN_TOKEN']
out = os.environ['OUT']
headers = {'Authorization': f'Bearer {token}'}

def get(path):
    req = urllib.request.Request(f'{url}{path}', headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

realm = get('/admin/realms/citizen')
realm['roles'] = {'realm': get('/admin/realms/citizen/roles')}

clients = get('/admin/realms/citizen/clients')
full_clients = []
for c in clients:
    cid = c['id']
    detail = get(f'/admin/realms/citizen/clients/{cid}')
    detail['protocolMappers'] = get(f'/admin/realms/citizen/clients/{cid}/protocol-mappers/models')
    full_clients.append(detail)
realm['clients'] = full_clients

users = get('/admin/realms/citizen/users?max=100')
for u in users:
    uid = u['id']
    u['realmRoles'] = [r['name'] for r in get(f'/admin/realms/citizen/users/{uid}/role-mappings/realm')]
    u['credentials'] = [{'type': 'password', 'value': 'officer123', 'temporary': False}]
realm['users'] = users

# Disable required actions so direct-grant login works after import
actions = get('/admin/realms/citizen/authentication/required-actions')
for a in actions:
    a['enabled'] = False
    a['defaultAction'] = False
realm['requiredActions'] = actions

with open(out, 'w') as f:
    json.dump(realm, f, indent=2)

print(f'Exported realm={realm["realm"]} clients={len(full_clients)} users={len(users)} → {out}')
PYEOF
