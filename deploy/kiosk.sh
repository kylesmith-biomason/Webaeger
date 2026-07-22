#!/usr/bin/env bash
# Chromium kiosk launcher for Grill Master (Pi OS Bookworm/Trixie + labwc)
set -euo pipefail

URL="${GRILL_URL:-http://localhost:3000}"

# Wait until the local server answers
for _ in $(seq 1 60); do
  if curl -sf "$URL/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Avoid Chromium "restore session" bubble
PREF_DIR="${HOME}/.config/chromium/Default"
if [[ -f "${PREF_DIR}/Preferences" ]]; then
  sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' "${PREF_DIR}/Preferences" || true
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' "${PREF_DIR}/Preferences" || true
fi

# Hide cursor when idle (package name varies)
if command -v unclutter-xfixes >/dev/null 2>&1; then
  unclutter-xfixes --timeout 1 --hide-on-touch &
elif command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 0.5 -root &
fi

CHROME="chromium"
command -v chromium-browser >/dev/null 2>&1 && CHROME="chromium-browser"

exec "$CHROME" \
  --kiosk \
  --app="$URL" \
  --ozone-platform=wayland \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 \
  --touch-events=enabled \
  --password-store=basic
