#!/bin/bash
# Install Remote Support Agent on macOS (one-time consent, background daemon)
# Usage: sudo bash install.sh [--server wss://remotesharing.space]

set -euo pipefail

SERVER="${1:-wss://remotesharing.space}"
if [[ "${1:-}" == "--server" && -n "${2:-}" ]]; then SERVER="$2"; fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_SRC="$(cd "$SCRIPT_DIR/../../agent/RemoteSupport.Agent" && pwd)"
INSTALL_DIR="/usr/local/RemoteSupport"
PLIST="/Library/LaunchAgents/com.remotesupport.agent.plist"
LOG_DIR="/var/log/remote-support"

echo "==> Building agent..."
cd "$AGENT_SRC"
dotnet publish -c Release -r osx-x64 --self-contained false -o "$INSTALL_DIR"

echo "==> One-time consent (required)..."
echo "    Type 'y' when prompted to allow your tech team remote access."
"$INSTALL_DIR/RemoteSupport.Agent" --grant-consent --server "$SERVER" || {
  echo "Consent not granted. Install aborted." >&2
  exit 1
}

echo "==> Installing launch agent..."
mkdir -p "$LOG_DIR"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.remotesupport.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${INSTALL_DIR}/RemoteSupport.Agent</string>
    <string>--daemon</string>
    <string>--server</string>
    <string>${SERVER}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/agent.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/agent.err</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/com.remotesupport.agent" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/com.remotesupport.agent"
launchctl kickstart -k "gui/$(id -u)/com.remotesupport.agent"

echo ""
echo "Installed. Agent runs at login."
echo "Logs: $LOG_DIR/agent.log"
echo "Revoke: $INSTALL_DIR/RemoteSupport.Agent --revoke-consent"