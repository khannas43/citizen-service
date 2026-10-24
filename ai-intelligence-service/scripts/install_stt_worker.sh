#!/bin/bash
# Install (or refresh) the host speech worker as a login-time launchd agent.
#
# launchd jobs are not allowed to read ~/Documents (macOS privacy rules), so the worker runs from a copy of
# its three source files in ~/.dg20-stt-worker. Re-run this script after changing app/config.py,
# app/speech_engine.py or scripts/stt_worker.py.
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/.dg20-stt-worker"
LABEL="com.dg20.stt-worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PY="$HOME/.dg20-stt-venv/bin/python"
[ -x "$PY" ] || { echo "Missing $PY: create it with python3.12 -m venv ~/.dg20-stt-venv and install faster-whisper==1.1.0 av==18.1.0 huggingface_hub==0.36.2 fastapi uvicorn python-multipart pydantic-settings httpx requests"; exit 1; }

mkdir -p "$DEST/app" "$DEST/scripts"
cp "$SRC/app/__init__.py" "$SRC/app/config.py" "$SRC/app/speech_engine.py" "$DEST/app/"
touch "$DEST/scripts/__init__.py"
cp "$SRC/scripts/stt_worker.py" "$DEST/scripts/"

TOKEN_FILE="$HOME/.dg20-stt-token"
if [ ! -s "$TOKEN_FILE" ]; then
  umask 077
  "$PY" -c "import secrets; print(secrets.token_urlsafe(32))" > "$TOKEN_FILE"
  echo "Created $TOKEN_FILE. Store it for the cluster with:"
  echo "  kubectl -n egov create secret generic stt-worker --from-literal=token=\"\$(cat $TOKEN_FILE)\""
fi

cat > "$DEST/run.sh" <<R
#!/bin/bash
export STT_WORKER_TOKEN="\$(cat "$TOKEN_FILE")"
cd "$DEST"
export PYTHONPATH="$DEST"
exec "$PY" -m uvicorn scripts.stt_worker:app --host 0.0.0.0 --port 8091
R
chmod +x "$DEST/run.sh"

cat > "$PLIST" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$LABEL</string>
<key>ProgramArguments</key><array><string>$DEST/run.sh</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$HOME/.dg20-stt-worker.log</string>
<key>StandardErrorPath</key><string>$HOME/.dg20-stt-worker.log</string>
</dict></plist>
P

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed. Check: curl localhost:8091/health"
