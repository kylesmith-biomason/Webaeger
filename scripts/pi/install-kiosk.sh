#!/usr/bin/env bash
# One-time install of Grill Master + kiosk on the Raspberry Pi.
# Usage (on Pi): sudo bash scripts/pi/install-kiosk.sh [user]
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo"
  exit 1
fi

APP_USER="${1:-${SUDO_USER:-pi}}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
INSTALL_DIR="/opt/grillmaster"
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "==> Installing to $INSTALL_DIR (user: $APP_USER)"

if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  mkdir -p "$INSTALL_DIR"
  if [[ "$REPO_DIR" != "$INSTALL_DIR" ]]; then
    rsync -a --exclude node_modules --exclude data --exclude .git "$REPO_DIR"/ "$INSTALL_DIR"/
  fi
  chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"
fi

# Node 20 if missing
if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

apt-get install -y build-essential python3 i2c-tools curl
apt-get install -y chromium-browser 2>/dev/null || apt-get install -y chromium
apt-get install -y unclutter-xfixes 2>/dev/null || apt-get install -y unclutter || true

echo "==> Building app"
sudo -u "$APP_USER" bash -lc "cd '$INSTALL_DIR' && npm ci && npm run build"

chmod +x "$INSTALL_DIR/deploy/kiosk.sh"
chmod +x "$INSTALL_DIR/scripts/"*.sh "$INSTALL_DIR/scripts/pi/"*.sh || true

echo "==> systemd service"
SERVICE_SRC="$INSTALL_DIR/deploy/grillmaster.service"
SERVICE_DST="/etc/systemd/system/grillmaster.service"
sed "s/REPLACE_USER/${APP_USER}/g" "$SERVICE_SRC" > "$SERVICE_DST"

systemctl daemon-reload
systemctl enable grillmaster.service
systemctl restart grillmaster.service

echo "==> labwc kiosk autostart"
mkdir -p "$APP_HOME/.config/labwc"
AUTOSTART="$APP_HOME/.config/labwc/autostart"
touch "$AUTOSTART"
if ! grep -q "grillmaster/deploy/kiosk.sh" "$AUTOSTART" 2>/dev/null; then
  echo "/opt/grillmaster/deploy/kiosk.sh &" >> "$AUTOSTART"
fi
chown -R "$APP_USER:$APP_USER" "$APP_HOME/.config"

echo "==> Done"
echo "    Reboot to enter kiosk mode: sudo reboot"
echo "    Escape hatch: ssh in and run: pkill chromium; pkill chromium-browser"
