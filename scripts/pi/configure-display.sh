#!/usr/bin/env bash
# Ensures Hosyond-compatible DSI overlay lines exist in config.txt
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo bash scripts/pi/configure-display.sh"
  exit 1
fi

CONFIG="/boot/firmware/config.txt"
if [[ ! -f "$CONFIG" ]]; then
  CONFIG="/boot/config.txt"
fi

if [[ ! -f "$CONFIG" ]]; then
  echo "Could not find boot config.txt"
  exit 1
fi

ensure_line() {
  local line="$1"
  if grep -qxF "$line" "$CONFIG"; then
    echo "Already present: $line"
  else
    echo "$line" >> "$CONFIG"
    echo "Added: $line"
  fi
}

echo "==> Updating $CONFIG"
ensure_line "dtoverlay=vc4-kms-v3d"
ensure_line "dtoverlay=vc4-kms-dsi-7inch"

echo "==> Done. Reboot for display changes: sudo reboot"
echo "    Then run: wlr-randr"
