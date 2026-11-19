#!/usr/bin/env bash
# Download the IndicTrans2 model on this Mac and test it on 40 department-style sentences. Nothing is deployed.
#   1. Request access on https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M and create a read token at https://huggingface.co/settings/tokens
#   2. HF_TOKEN=hf_xxx bash scripts/translation_eval.sh            (add: --model ai4bharat/indictrans2-en-indic-1B  to try the larger model)
# The first run downloads about 1 GB (4 GB for the 1B model) and installs PyTorch into translation-service/.venv.
set -euo pipefail
cd "$(dirname "$0")/../translation-service"
: "${HF_TOKEN:?Set HF_TOKEN to your Hugging Face read token}"
# PyTorch and the model libraries do not have wheels for the newest Python (3.13/3.14), so use 3.10 to 3.12.
if [ -d .venv ] && ! .venv/bin/python -c 'import sys; sys.exit(0 if (3,10)<=sys.version_info[:2]<=(3,12) else 1)' 2>/dev/null; then
  echo "Removing the old .venv (wrong Python version)"; rm -rf .venv
fi
if [ ! -d .venv ]; then
  PY=""
  for c in python3.12 python3.11 python3.10 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 /usr/local/bin/python3.12 /usr/local/bin/python3.11; do
    if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
  done
  if [ -n "$PY" ]; then
    "$PY" -m venv .venv
  elif command -v uv >/dev/null 2>&1; then
    uv venv --seed --python 3.12 .venv
  else
    echo "Need Python 3.10 to 3.12. Run:  brew install python@3.12   then run this script again." >&2; exit 1
  fi
fi
. .venv/bin/activate
pip install -q -r requirements.txt -r requirements-model.txt
export HF_TOKEN
python tools/evaluate.py "$@"
