#!/bin/bash
# Replace ONLY the public/ folder on the VPS with the Smart Connect UI.
# Run from your Mac:
#   chmod +x ~/remote-support/deploy/push-public.sh
#   ~/remote-support/deploy/push-public.sh
# Or set HOST if different:
#   HOST=root@147.93.85.173 ~/remote-support/deploy/push-public.sh

set -euo pipefail

HOST="${HOST:-root@147.93.85.173}"
REMOTE_DIR="${REMOTE_DIR:-/opt/remote-support}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$(dirname "$SCRIPT_DIR")/public"

required=(
  viewer.html viewer.css viewer.js
  client.html client.js styles.css rtc-utils.js version.json
)

echo "==> Checking local public assets..."
for f in "${required[@]}"; do
  if [ ! -f "$PUBLIC_DIR/$f" ]; then
    echo "Missing: $PUBLIC_DIR/$f" >&2
    exit 1
  fi
done

if ! grep -q "Smart Connect" "$PUBLIC_DIR/viewer.html"; then
  echo "viewer.html is not the Smart Connect UI!" >&2
  exit 1
fi

if grep -q 'href="styles.css"' "$PUBLIC_DIR/viewer.html" || grep -q "setupCard" "$PUBLIC_DIR/viewer.html"; then
  echo "viewer.html looks like the OLD interface — aborting." >&2
  exit 1
fi

chmod +x "$SCRIPT_DIR/verify-public.sh"
BUILD_VERSION="${BUILD_VERSION:-2026.07.06-v11}" "$SCRIPT_DIR/verify-public.sh"

echo "==> Uploading public/ to $HOST:$REMOTE_DIR/public/"
ssh -o StrictHostKeyChecking=accept-new "$HOST" "mkdir -p $REMOTE_DIR/public"

rsync -avz --delete \
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  "$PUBLIC_DIR/" "$HOST:$REMOTE_DIR/public/"

echo "==> Removing stray old files on server..."
ssh "$HOST" "rm -f $REMOTE_DIR/public/view.html $REMOTE_DIR/public/server.js $REMOTE_DIR/public/package.json; rm -rf $REMOTE_DIR/public/node_modules $REMOTE_DIR/public/agent 2>/dev/null; true"

echo "==> Restarting service..."
ssh "$HOST" "systemctl restart remote-support 2>/dev/null || (pkill -f 'node server.js' 2>/dev/null; cd $REMOTE_DIR && nohup node server.js >/var/log/remote-support.log 2>&1 &)"

echo "==> Verify on server:"
ssh "$HOST" "head -10 $REMOTE_DIR/public/viewer.html; echo '---'; curl -s http://127.0.0.1:8080/api/version 2>/dev/null || true"

echo ""
echo "Done. Open: http://147.93.85.173:8080/viewer.html"
echo "Hard refresh: Cmd+Shift+R"