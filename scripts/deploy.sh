#!/usr/bin/env bash
# Deploy latest Grill Master to the Pi from your Mac.
# Usage:
#   ./scripts/deploy.sh
#   PI_HOST=kyle@grillmaster.local ./scripts/deploy.sh
set -euo pipefail

PI_HOST="${PI_HOST:-kyle@grillmaster.local}"
REMOTE_DIR="${REMOTE_DIR:-/opt/grillmaster}"

echo "==> Deploying to ${PI_HOST}:${REMOTE_DIR}"

ssh "$PI_HOST" bash -s <<EOF
set -euo pipefail
cd "${REMOTE_DIR}"
if [[ -d .git ]]; then
  git pull --ff-only
else
  echo "No git repo at ${REMOTE_DIR}. Clone first or rsync manually."
  exit 1
fi
npm ci
npm run build
sudo systemctl restart grillmaster
echo "Deploy complete."
EOF
