# Citizen-Services cluster bootstrap (namespace `citizen`)

DG2.0 lives in namespace `egov` and must stay untouched. Nothing here edits it.
All scripts source `scripts/lib/guard.sh`, which refuses `egov`.

## Before you start
1. `kubectl top nodes; kubectl get pods -n egov` and compare with the quota in `00-namespace-quota.yaml`.
2. Snapshot DG2.0 first (read-only): `pg_dump` of each DB, `export-keycloak-realm.sh` equivalent, image digests.

## Order
1. `kubectl apply -f citizen-infra/00-namespace-quota.yaml`
2. Create two secrets with NEW passwords (do not copy DG2.0's):
   - `kubectl -n citizen create secret generic db-admin --from-literal=username=postgres --from-literal=password="$(openssl rand -base64 24)"`
     (Postgres superuser, for restore and migrations only)
   - `kubectl -n citizen create secret generic db --from-literal=username=citizenuser --from-literal=password="$(openssl rand -base64 24)"`
     (what the services use; an ordinary role, created in step 4)
3. `kubectl apply -f postgres-pvc.yaml`, then install Postgres with `postgres-persistence-values.yaml`
   using the same chart DG2.0 used, into namespace `citizen`, with the `db-admin` credentials as the bootstrap user.
4. Create `citizen_db`; restore a read-only DG2.0 dump into it as the superuser
   (`pg_dump --no-owner --no-acl` from egov). Then run `db/platform/001..003` (see `db/platform/README.md`;
   003 creates `citizenuser`). Then `CREATE DATABASE keycloak_db OWNER citizenuser;`
5. `kubectl apply -f citizen-infra/10-ai-service-externalname.yaml`
6. Keycloak: `kubectl apply -f keycloak-deployment.yaml`, then `./setup-keycloak.sh` (realm `citizen`).
7. `./build_all_portals.sh` (images `cs-*:dev`, NodePorts 31173+).
8. Optional: `20-networkpolicy-optional.yaml`.

## Capacity (measured 25 Oct 2026)
DG2.0 (`egov`) uses about 8.7 GB of the node's ~12 GB; the AI service alone is 3.1 GB, so it is shared, not copied.
Lean first deployment (about 3.3 GB): postgres, keycloak, auth, family-registry, family-member, scheme-engine,
scheme-application, grievance, notifications, chatbot, and the three portals.
Leave out for now: kafka, redis, superset, expenditure-integrity, pension, marriage and caste certificate services.
Quota in `00-namespace-quota.yaml`: 3 CPU, 4 GiB requests, 6 GiB limits.
