#!/usr/bin/env bash
# Optional: build and deploy the self-hosted translation service (IndicTrans2) into namespace citizen, then switch it on in the MDM service.
# Needs: Docker, and a Hugging Face token once access to ai4bharat/indictrans2-en-indic-dist-200M is granted (the weights are gated).
#   HF_TOKEN=hf_xxx bash scripts/translation_setup.sh
# Switch off again:  kubectl -n citizen set env deployment/mdm-service MT_ENABLED=false
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib/guard.sh
NS=citizen
if [ -n "${HF_TOKEN:-}" ]; then
  kubectl -n $NS create secret generic hf-token --from-literal=token="$HF_TOKEN" --dry-run=client -o yaml | kubectl apply -f -
fi
echo "== image + deployment (first build downloads PyTorch, about 2 GB)"
docker build -q -t cs-translation-service:dev translation-service
kubectl apply -f translation-service/k8s-manifest.yaml
kubectl -n $NS rollout restart deployment/translation-service
kubectl -n $NS rollout status deployment/translation-service --timeout=300s
echo "== switching machine translation on in the MDM service"
kubectl -n $NS set env deployment/mdm-service MT_ENABLED=true
kubectl -n $NS rollout status deployment/mdm-service --timeout=240s
echo "done. The model downloads on the first translation (a few minutes); check: kubectl -n $NS logs deploy/translation-service"
