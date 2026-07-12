#!/bin/bash
# Validate public/ and core server files before VPS deployment.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PUBLIC_DIR="$PROJECT_DIR/public"
BUILD_VERSION="${BUILD_VERSION:-2026.07.06-v12}"

required_public=(
  viewer.html
  viewer.css
  viewer.js
  client.html
  client.js
  styles.css
  rtc-utils.js
  version.json
)

echo "==> Verifying production public/ layout..."
for f in "${required_public[@]}"; do
  if [ ! -f "$PUBLIC_DIR/$f" ]; then
    echo "MISSING: public/$f" >&2
    exit 1
  fi
done

forbidden_public=(
  server.js
  package.json
  view.html
  node_modules
)
for f in "${forbidden_public[@]}"; do
  if [ -e "$PUBLIC_DIR/$f" ]; then
    echo "FORBIDDEN in public/: $f" >&2
    exit 1
  fi
done

if find "$PUBLIC_DIR" -name '.DS_Store' | grep -q .; then
  echo "Remove .DS_Store files from public/ before deploy." >&2
  find "$PUBLIC_DIR" -name '.DS_Store' >&2
  exit 1
fi

if ! grep -q "Smart Connect" "$PUBLIC_DIR/viewer.html"; then
  echo "viewer.html is not the Smart Connect admin UI." >&2
  exit 1
fi

if ! grep -q 'href="/viewer.css' "$PUBLIC_DIR/viewer.html"; then
  echo "viewer.html must link viewer.css (not legacy styles.css)." >&2
  exit 1
fi

if grep -q 'setupCard\|view\.html' "$PUBLIC_DIR/viewer.html"; then
  echo "viewer.html appears to be the legacy interface." >&2
  exit 1
fi

if ! grep -q 'id="controlBtn"' "$PUBLIC_DIR/viewer.html"; then
  echo "viewer.html missing remote control toolbar." >&2
  exit 1
fi

if ! grep -q 'control-event' "$PUBLIC_DIR/viewer.js"; then
  echo "viewer.js missing remote control event relay." >&2
  exit 1
fi

if ! grep -q '127.0.0.1:9877' "$PUBLIC_DIR/client.js"; then
  echo "client.js missing local agent control bridge." >&2
  exit 1
fi

if ! grep -q "\"build\": \"$BUILD_VERSION\"" "$PUBLIC_DIR/version.json"; then
  echo "version.json build must be $BUILD_VERSION" >&2
  exit 1
fi

for html in viewer.html client.html; do
  if ! grep -q 'Cache-Control' "$PUBLIC_DIR/$html"; then
    echo "WARN: $html has no cache-control meta (recommended for production)." >&2
  fi
done

if [ ! -f "$PROJECT_DIR/server.js" ]; then
  echo "MISSING: server.js at project root" >&2
  exit 1
fi

if ! grep -q 'relayControlEvent' "$PROJECT_DIR/server.js"; then
  echo "server.js missing remote control relay handlers." >&2
  exit 1
fi

echo "OK: public/ production layout verified (build $BUILD_VERSION)"
echo "    Assets:"
ls -1 "$PUBLIC_DIR" | sed 's/^/      /'