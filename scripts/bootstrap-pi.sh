#!/usr/bin/env bash
# Bootstrap the repo onto a Pi that already has SSH access.
# Usage from Mac (after imaging):
#   ./scripts/bootstrap-pi.sh git@github.com:YOU/grill-master.git
#   PI_HOST=user@grillmaster.local ./scripts/bootstrap-pi.sh <git-url>
set -euo pipefail

PI_HOST="${PI_HOST:-kyle@grillmaster.local}"
GIT_URL="${1:-}"

if [[ -z "$GIT_URL" ]]; then
  echo "Usage: PI_HOST=user@host ./scripts/bootstrap-pi.sh <git-clone-url>"
  exit 1
fi

ssh "$PI_HOST" bash -s <<EOF
set -euo pipefail
sudo mkdir -p /opt/grillmaster
sudo chown "\$USER:\$USER" /opt/grillmaster
if [[ ! -d /opt/grillmaster/.git ]]; then
  git clone "${GIT_URL}" /opt/grillmaster
fi
cd /opt/grillmaster
sudo bash scripts/pi/configure-os.sh
sudo bash scripts/pi/configure-display.sh || true
bash scripts/pi/verify-rtd.sh || true
sudo bash scripts/pi/install-kiosk.sh "\$USER"
EOF

echo "Bootstrap finished. Reboot the Pi when ready: ssh ${PI_HOST} 'sudo reboot'"
