#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/remote-support}"
PORT="${PORT:-8080}"

echo "==> Installing Node.js if needed..."
if ! command -v node >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
  else
    echo "Install Node.js 18+ manually, then re-run." >&2
    exit 1
  fi
fi

echo "==> App directory: $APP_DIR"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [ -f package.json ]; then
  echo "==> Installing dependencies..."
  npm install --production
else
  echo "package.json not found in $APP_DIR" >&2
  exit 1
fi

echo "==> Creating systemd service..."
cat > /etc/systemd/system/remote-support.service <<EOF
[Unit]
Description=Remote Support Signaling Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=PORT=$PORT
Environment=NODE_ENV=production
Environment=BUILD_VERSION=${BUILD_VERSION:-2026.07.06-v11}
ExecStart=$(command -v node) server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable remote-support
systemctl restart remote-support

echo "==> Status:"
systemctl --no-pager status remote-support || true
echo ""
echo "Server should be available at: http://$(hostname -I | awk '{print $1}'):$PORT/viewer.html"