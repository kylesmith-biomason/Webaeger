#!/usr/bin/env bash
# Bootstrap Webaeger onto a Pi that already has SSH access.
# Usage from Mac (after imaging):
#   ./scripts/bootstrap-pi.sh https://github.com/kylesmith-biomason/Webaeger.git
#   PI_HOST=user@grillmaster.local ./scripts/bootstrap-pi.sh <git-url>
set -euo pipefail

PI_HOST="${PI_HOST:-kyle@grillmaster.local}"
GIT_URL="${1:-https://github.com/kylesmith-biomason/Webaeger.git}"
INSTALL_DIR="/opt/Webaeger"

ssh "$PI_HOST" bash -s <<EOF
set -euo pipefail
sudo mkdir -p "${INSTALL_DIR}"
sudo chown "\$USER:\$USER" "${INSTALL_DIR}"
if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  git clone "${GIT_URL}" "${INSTALL_DIR}"
fi
cd "${INSTALL_DIR}"
git config --global --add safe.directory "${INSTALL_DIR}" 2>/dev/null || true
sudo bash scripts/pi/configure-os.sh
sudo bash scripts/pi/configure-display.sh || true
bash scripts/pi/verify-rtd.sh || true
sudo bash scripts/pi/install-kiosk.sh "\$USER"
EOF

echo "Bootstrap finished. Reboot the Pi when ready: ssh ${PI_HOST} 'sudo reboot'"
