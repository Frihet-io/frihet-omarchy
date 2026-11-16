#!/usr/bin/env bash
set -euo pipefail

if ! command -v omarchy-webapp-install >/dev/null 2>&1; then
  echo "Error: omarchy-webapp-install not found in PATH. Are you running on Omarchy?" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_ICON="${SCRIPT_DIR}/frihet-erp.png"

if [ -f "$LOCAL_ICON" ]; then
  ICON_REF="$LOCAL_ICON"
else
  ICON_REF="https://app.frihet.io/pwa-512x512.png"
fi

omarchy-webapp-install "Frihet ERP" "https://app.frihet.io" "$ICON_REF"

cat <<'EOF'

Installed Frihet ERP as a frameless Omarchy web app.

Optional Hyprland shortcut (~/.config/hypr/bindings.conf):
bindd = SUPER SHIFT, F, Frihet ERP, exec, omarchy-launch-webapp "https://app.frihet.io"
EOF
