#!/usr/bin/env bash
# Groups everything in the citizen namespace under one label so it is easy to list, filter and clean up.
#   kubectl get all -n citizen -l app.kubernetes.io/part-of=citizen-services
source "$(dirname "$0")/lib/guard.sh"
set -euo pipefail
NS="${CS_NAMESPACE:-citizen}"
kubectl label --overwrite -n "$NS" \
  deployments,statefulsets,services,configmaps,secrets,persistentvolumeclaims,jobs,ingresses \
  --all app.kubernetes.io/part-of=citizen-services project=citizen-services
kubectl label --overwrite namespace "$NS" project=citizen-services
echo "Labelled everything in namespace $NS."
