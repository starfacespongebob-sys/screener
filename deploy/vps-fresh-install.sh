#!/bin/bash
# Run ON THE VPS after uploading remote-support-full.tar.gz to /tmp/
# Wipes the old install and deploys fresh Smart Connect UI.
#
# Usage on VPS:
#   bash /tmp/vps-fresh-install.sh

set -euo pipefail

APP_DIR="/opt/remote-support"
ARCHIVE="/tmp/remote-support-full.tar.gz"
PORT="${PORT:-8080}"
SERVICE="remote-support"

echo "============================================"
echo "  Fresh install: remote-support (Smart Connect)"
echo "============================================"

if [ ! -f "$ARCHIVE" ]; then
  echo "ERROR: Upload the archive first:" >&2
  echo "  scp ~/remote-support/deploy/remote-support-full.tar.gz root@YOUR_IP:/tmp/" >&2
  exit 1
fi

echo "==> Stopping old service..."
systemctl stop "$SERVICE" 2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true
pkill -f "remote-support" 2>/dev/null || true

echo "==> Removing old install completely..."
if [ -d "$APP_DIR" ]; then
  mv "$APP_DIR" "${APP_DIR}.wiped.$(date +%Y%m%d%H%M%S)"
fi

# Also remove common wrong deploy locations
for OLD in /root/remote-support /var/www/remote-support /var/www/html /home/*/remote-support; do
  if [ -d "$OLD" ] && [ "$OLD" != "$APP_DIR" ]; then
    echo "    Removing stray: $OLD"
    rm -rf "$OLD"
  fi
done

echo "==> Creating fresh app directory..."
mkdir -p "$APP_DIR"
tar xzf "$ARCHIVE" -C "$APP_DIR"

echo "==> Verifying Smart Connect UI..."
if ! grep -q "Smart Connect" "$APP_DIR/public/viewer.html"; then
  echo "ERROR: viewer.html is NOT the new interface!" >&2
  head -12 "$APP_DIR/public/viewer.html" >&2
  exit 1
fi
if ! grep -q "viewer.css" "$APP_DIR/public/viewer.html"; then
  echo "ERROR: viewer.html missing viewer.css link!" >&2
  exit 1
fi
if [ ! -f "$APP_DIR/public/rtc-utils.js" ]; then
  echo "ERROR: rtc-utils.js missing!" >&2
  exit 1
fi
if [ ! -f "$APP_DIR/public/version.json" ]; then
  echo "ERROR: version.json missing!" >&2
  exit 1
fi
if ! grep -q 'id="controlBtn"' "$APP_DIR/public/viewer.html"; then
  echo "ERROR: viewer.html missing remote control UI!" >&2
  exit 1
fi
if ! grep -q 'relayControlEvent' "$APP_DIR/server.js"; then
  echo "ERROR: server.js missing remote control handlers!" >&2
  exit 1
fi
for stray in view.html server.js package.json; do
  if [ -f "$APP_DIR/public/$stray" ]; then
    echo "ERROR: stray file in public/: $stray" >&2
    exit 1
  fi
done

echo "    OK: Smart Connect viewer.html ($(wc -c < "$APP_DIR/public/viewer.html") bytes)"
echo "    OK: build $(grep -o '"build": "[^"]*"' "$APP_DIR/public/version.json" | head -1)"

echo "==> Installing Node.js if needed..."
if ! command -v node >/dev/null 2>&1; then
  apt-get update -qq
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

echo "==> Installing npm dependencies..."
cd "$APP_DIR"
rm -rf node_modules
npm install --production

echo "==> Creating systemd service..."
NODE_BIN="$(command -v node)"
cat > /etc/systemd/system/${SERVICE}.service <<EOF
[Unit]
Description=Remote Support Signaling Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=PORT=${PORT}
Environment=NODE_ENV=production
Environment=BUILD_VERSION=2026.07.06-v11
ExecStart=${NODE_BIN} server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"
sleep 2

echo "==> Service status:"
systemctl --no-pager status "$SERVICE" || true

echo "==> Health check:"
curl -sf "http://127.0.0.1:${PORT}/healthz" && echo " healthz OK" || echo " healthz FAILED"
curl -sf "http://127.0.0.1:${PORT}/api/version" && echo "" || echo "api/version not available yet"

echo "==> Viewer check (first lines):"
curl -s "http://127.0.0.1:${PORT}/viewer.html" | head -12

echo ""
echo "============================================"
echo "  DONE"
echo "  Local:  http://127.0.0.1:${PORT}/viewer.html"
echo "  Public: https://remotesharing.space/viewer.html"
echo "  Hard refresh browser: Ctrl+Shift+R"
echo "============================================"