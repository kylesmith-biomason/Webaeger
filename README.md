# Grill Master

Local grilling temperature kiosk for Raspberry Pi 4 + Hosyond 5" DSI (800×480) + Atlas Scientific Isolated HAT / EZO-RTD.

The Pi boots into Chromium **kiosk** mode (`--kiosk --app=…`) so the UI fills the screen with no browser chrome.

## Quick start (Mac development)

```bash
npm install
SENSOR=mock npm run dev          # API + mock temps on :3000
# optional second terminal for hot UI reload:
npm run dev:web                  # Vite on :5173 (proxies API)
```

Open `http://localhost:3000` (or `:5173`) and size the window to **800×480**.

## Pi setup

1. Image the Pi — [docs/01-imaging.md](docs/01-imaging.md)
2. Confirm the display — [docs/02-display.md](docs/02-display.md)
3. Seat Atlas HAT / EZO-RTD — [docs/03-atlas-rtd.md](docs/03-atlas-rtd.md)
4. Push this repo to GitHub, then from your Mac:

```bash
PI_HOST=you@grillmaster.local ./scripts/bootstrap-pi.sh git@github.com:YOU/grill-master.git
ssh you@grillmaster.local 'sudo reboot'
```

Or on the Pi after cloning to `/opt/grillmaster`:

```bash
sudo bash scripts/pi/install-kiosk.sh
```

## Deploy updates

```bash
git push
PI_HOST=you@grillmaster.local ./scripts/deploy.sh
```

## Layout

```
apps/server/     Express API, SQLite cook history, sensor polling, serves UI
apps/web/        Touch UI (800×480)
packages/sensor/ Mock + Atlas EZO-RTD I2C adapters
deploy/          systemd unit + Chromium kiosk launcher
scripts/         deploy / bootstrap / Pi helpers
docs/            Imaging, display, Atlas walkthroughs
```

## Environment

| Variable   | Default              | Notes                          |
|------------|----------------------|--------------------------------|
| `SENSOR`   | `mock`               | `rtd` on the Pi                |
| `PORT`     | `3000`               | HTTP + WebSocket               |
| `POLL_MS`  | `30000`              | Sensor poll interval (30s)     |
| `TEMP_UNIT`| `F`                  | `C` or `F`                     |
| `DB_PATH`  | `data/grillmaster.db`| SQLite file                    |
| `I2C_BUS`  | `1`                  | Pi I2C bus                     |
| `RTD_ADDR` | `0x66`               | EZO-RTD default                |
