#!/bin/bash
# Full wipe + deploy remote-support to VPS from your Mac.
# Usage:
#   chmod +x ~/remote-support/deploy/full-deploy.sh
#   ~/remote-support/deploy/full-deploy.sh
#
# Or with custom host:
#   HOST=root@147.93.85.173 ~/remote-support/deploy/full-deploy.sh

set -euo pipefail

HOST="${HOST:-root@147.93.85.173}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ARCHIVE="$SCRIPT_DIR/remote-support-full.tar.gz"

echo "==> Verifying production layout..."
chmod +x "$SCRIPT_DIR/verify-public.sh"
BUILD_VERSION="${BUILD_VERSION:-2026.07.06-v11}" "$SCRIPT_DIR/verify-public.sh"

echo "==> Building full archive from $PROJECT_DIR"
tar czf "$ARCHIVE" \
  --exclude node_modules \
  --exclude 'public/node_modules' \
  --exclude 'agent/*/bin' \
  --exclude 'agent/*/obj' \
  --exclude .git \
  --exclude .DS_Store \
  --exclude '*/.DS_Store' \
  --exclude 'test-*.mjs' \
  --exclude 'deploy/remote-support-full.tar.gz' \
  -C "$PROJECT_DIR" .

echo "    Archive: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

echo "==> Verifying archive contains Smart Connect UI..."
VERIFY_DIR="$(mktemp -d)"
trap 'rm -rf "$VERIFY_DIR"' EXIT
tar xzf "$ARCHIVE" -C "$VERIFY_DIR" public/viewer.html public/viewer.js server.js public/version.json
grep -q "Smart Connect" "$VERIFY_DIR/public/viewer.html" || {
  echo "ERROR: Archive does not contain Smart Connect viewer.html" >&2
  exit 1
}
grep -q "control-event" "$VERIFY_DIR/public/viewer.js" || {
  echo "ERROR: Archive missing remote control in viewer.js" >&2
  exit 1
}
grep -q "relayControlEvent" "$VERIFY_DIR/server.js" || {
  echo "ERROR: Archive missing remote control in server.js" >&2
  exit 1
}
grep -q '"build": "2026.07.06-v11"' "$VERIFY_DIR/public/version.json" || {
  echo "ERROR: Archive version.json build mismatch" >&2
  exit 1
}

echo "==> Uploading to $HOST..."
scp -o StrictHostKeyChecking=accept-new \
  "$ARCHIVE" \
  "$SCRIPT_DIR/vps-fresh-install.sh" \
  "$HOST:/tmp/"

echo "==> Running fresh install on VPS (wipe + deploy)..."
ssh -o StrictHostKeyChecking=accept-new "$HOST" \
  "chmod +x /tmp/vps-fresh-install.sh && bash /tmp/vps-fresh-install.sh"

echo ""
echo "==> Done! Open https://remotesharing.space/viewer.html"
echo "    Hard refresh: Cmd+Shift+R"
echo "    Verify:       https://remotesharing.space/api/version"