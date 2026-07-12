#!/bin/bash
# Run this ON THE VPS (Hostinger SSH terminal) to replace public/ with Smart Connect UI.
# First upload public-v9.tar.gz to /tmp/ on the server from your Mac:
#   scp ~/remote-support/deploy/public-v9.tar.gz root@147.93.85.173:/tmp/

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/remote-support}"
ARCHIVE="${1:-/tmp/public-v9.tar.gz}"

if [ ! -f "$ARCHIVE" ]; then
  echo "Archive not found: $ARCHIVE" >&2
  echo "Upload from Mac: scp ~/remote-support/deploy/public-v9.tar.gz root@YOUR_IP:/tmp/" >&2
  exit 1
fi

echo "==> Stopping service..."
systemctl stop remote-support 2>/dev/null || pkill -f "node server.js" 2>/dev/null || true

echo "==> Backing up old public/"
if [ -d "$APP_DIR/public" ]; then
  mv "$APP_DIR/public" "$APP_DIR/public.bak.$(date +%Y%m%d%H%M)"
fi
mkdir -p "$APP_DIR/public"

echo "==> Extracting new public/"
tar xzf "$ARCHIVE" -C "$APP_DIR/public"

echo "==> Removing old interface files if present..."
rm -f "$APP_DIR/public/view.html"

if ! grep -q "Smart Connect" "$APP_DIR/public/viewer.html"; then
  echo "ERROR: viewer.html is still the old interface!" >&2
  exit 1
fi

echo "==> Starting service..."
systemctl start remote-support 2>/dev/null || (
  cd "$APP_DIR" && nohup node server.js >/var/log/remote-support.log 2>&1 &
)

sleep 2
echo "==> Verification:"
head -10 "$APP_DIR/public/viewer.html"
echo "---"
curl -s "http://127.0.0.1:8080/viewer.html" | head -10
echo "---"
curl -s "http://127.0.0.1:8080/api/version" 2>/dev/null || echo "(restart server.js if /api/version missing)"

echo ""
echo "Open http://YOUR_IP:8080/viewer.html and hard-refresh (Ctrl+Shift+R)"