#!/usr/bin/env bash
set -e

PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> DG 2.0 Citizen Mobile — Setup"
echo ""

# Check flutter
if ! command -v flutter &>/dev/null; then
  echo "ERROR: flutter not found in PATH."
  echo "  Add Flutter to your PATH first, e.g.:"
  echo "    export PATH=\"\$PATH:/path/to/flutter/bin\""
  exit 1
fi

FLUTTER_VER=$(flutter --version --machine 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('flutterVersion','unknown'))" 2>/dev/null || echo "unknown")
echo "Flutter version: $FLUTTER_VER"

# If android/ doesn't exist, bootstrap it from a temp project
if [ ! -d "$PROJ_DIR/android" ]; then
  echo ""
  echo "==> Bootstrapping android/ directory..."
  TMPDIR_BASE="${TMPDIR:-/tmp}"
  TMPPROJ="$TMPDIR_BASE/dg20_flutter_bootstrap_$$"
  flutter create \
    --org com.dg20 \
    --project-name citizen_mobile \
    --platforms android \
    "$TMPPROJ" >/dev/null 2>&1

  cp -r "$TMPPROJ/android" "$PROJ_DIR/android"
  rm -rf "$TMPPROJ"
  echo "   android/ directory created."
else
  echo "   android/ already exists — skipping bootstrap."
fi

# Set minimum SDK in android/app/build.gradle (needs 21+ for most packages)
GRADLE="$PROJ_DIR/android/app/build.gradle"
if [ -f "$GRADLE" ]; then
  # Ensure minSdkVersion >= 21
  if grep -q "minSdkVersion" "$GRADLE"; then
    sed -i.bak 's/minSdkVersion [0-9]*/minSdkVersion 21/' "$GRADLE" && rm -f "$GRADLE.bak"
    echo "   minSdkVersion set to 21."
  fi
fi

# flutter_local_notifications requires adding a notification icon and channel
# android/app/src/main/AndroidManifest.xml — ensure INTERNET permission
MANIFEST="$PROJ_DIR/android/app/src/main/AndroidManifest.xml"
if [ -f "$MANIFEST" ]; then
  if ! grep -q "INTERNET" "$MANIFEST"; then
    sed -i.bak 's|<manifest|<manifest|; s|<application|<uses-permission android:name="android.permission.INTERNET"/>\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>\n    <application|' "$MANIFEST" && rm -f "$MANIFEST.bak"
    echo "   INTERNET + POST_NOTIFICATIONS permissions added."
  else
    echo "   INTERNET permission already present."
  fi
fi

echo ""
echo "==> Running flutter pub get..."
cd "$PROJ_DIR"
flutter pub get

echo ""
echo "============================================================"
echo "  Setup complete!"
echo ""
MAC_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "YOUR_MAC_IP")
echo "  Detected Mac IP: $MAC_IP"
echo ""
echo "  Run on Android emulator (default config uses 10.0.2.2):"
echo "    flutter run -d emulator-5554"
echo ""
echo "  Run on physical device (same WiFi):"
echo "    flutter run --dart-define=API_BASE=http://$MAC_IP:30074 \\"
echo "      --dart-define=AI_BASE=http://$MAC_IP:30089"
echo ""
echo "  Build APK:"
echo "    cd $PROJ_DIR"
echo "    flutter build apk \\"
echo "      --dart-define=API_BASE=http://$MAC_IP:30074 \\"
echo "      --dart-define=AI_BASE=http://$MAC_IP:30089"
echo ""
echo "  Install on connected device:"
echo "    flutter install --dart-define=API_BASE=http://$MAC_IP:30074 --dart-define=AI_BASE=http://$MAC_IP:30089"
echo ""
echo "  APK location after build:"
echo "    $PROJ_DIR/build/app/outputs/flutter-apk/app-release.apk"
echo "============================================================"
