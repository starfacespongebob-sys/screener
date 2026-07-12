#!/bin/bash
# Upload remote-support to root@147.93.85.173
# Usage: ./deploy/upload.sh
# Requires: SSH key added to server (ssh root@147.93.85.173 should work without password)

set -euo pipefail

HOST="root@147.93.85.173"
REMOTE_DIR="/opt/remote-support"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_remote_support_deploy}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [ -f "$SSH_KEY" ]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi

echo "==> Uploading to $HOST:$REMOTE_DIR"
ssh "${SSH_OPTS[@]}" "$HOST" "mkdir -p $REMOTE_DIR"

rsync -avz --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules \
  --exclude 'public/node_modules' \
  --exclude agent/*/bin \
  --exclude agent/*/obj \
  --exclude .git \
  --exclude 'test-*.mjs' \
  --exclude .DS_Store \
  --exclude 'public/.DS_Store' \
  "$PROJECT_DIR/" "$HOST:$REMOTE_DIR/"

echo "==> Verifying public assets on server..."
ssh "${SSH_OPTS[@]}" "$HOST" "ls -la $REMOTE_DIR/public/ && test -f $REMOTE_DIR/public/viewer.css && test -f $REMOTE_DIR/public/viewer.html && grep -q 'viewer.css' $REMOTE_DIR/public/viewer.html && grep -q 'Smart Connect' $REMOTE_DIR/public/viewer.html"

echo "==> Running server setup..."
ssh "${SSH_OPTS[@]}" "$HOST" "chmod +x $REMOTE_DIR/deploy/server-setup.sh && APP_DIR=$REMOTE_DIR BUILD_VERSION=2026.07.06-v11 bash $REMOTE_DIR/deploy/server-setup.sh"

echo "==> Done."
echo "    Direct:  http://147.93.85.173:8080/viewer.html"
echo "    Version: http://147.93.85.173:8080/api/version"