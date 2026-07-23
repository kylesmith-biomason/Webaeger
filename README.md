# Grill Master ([Webaeger](https://github.com/kylesmith-biomason/Webaeger))

Local grilling temperature kiosk for Raspberry Pi 4 + Hosyond 5" DSI (800×480) + Atlas Scientific Isolated HAT / EZO-RTD.

Repo: [kylesmith-biomason/Webaeger](https://github.com/kylesmith-biomason/Webaeger)  
Pi install path: `/opt/Webaeger`

The Pi boots into Chromium **kiosk** mode (`--kiosk --app=…`) so the UI fills the screen with no browser chrome.

## Quick start (Mac development)

```bash
cp .env.example .env   # optional; edit as needed
npm install
npm run start          # reads .env if present (defaults to SENSOR=mock)
# optional second terminal for hot UI reload:
npm run dev:web        # Vite on :5173 (proxies API)
```

Open `http://localhost:3000` (or `:5173`) and size the window to **800×480**.

## Pi setup

1. Image the Pi — [docs/01-imaging.md](docs/01-imaging.md)
2. Confirm the display — [docs/02-display.md](docs/02-display.md)
3. Seat Atlas HAT / EZO-RTD — [docs/03-atlas-rtd.md](docs/03-atlas-rtd.md)
4. Clone on the Pi (if not already):

```bash
sudo mkdir -p /opt/Webaeger
sudo chown "$USER:$USER" /opt/Webaeger
git clone https://github.com/kylesmith-biomason/Webaeger.git /opt/Webaeger
cd /opt/Webaeger
sudo bash scripts/pi/install-kiosk.sh
```

Or from your Mac:

```bash
PI_HOST=you@grillmaster.local ./scripts/bootstrap-pi.sh https://github.com/kylesmith-biomason/Webaeger.git
ssh you@grillmaster.local 'sudo reboot'
```

## Deploy updates

```bash
git push
PI_HOST=you@grillmaster.local ./scripts/deploy.sh
```

`deploy.sh` pulls in `/opt/Webaeger` and restarts the `webaeger` systemd service.

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

Copy [`.env.example`](.env.example) to `.env` for local overrides (`.env` is gitignored).
On the Pi, [`deploy/webaeger.service`](deploy/webaeger.service) sets production values.

| Variable   | Default              | Notes                          |
|------------|----------------------|--------------------------------|
| `SENSOR`   | `mock`               | `rtd` on the Pi                |
| `PORT`     | `3000`               | HTTP + WebSocket               |
| `POLL_MS`  | `30000`              | Sensor poll interval (30s)     |
| `TEMP_UNIT`| `F`                  | `C` or `F`                     |
| `DB_PATH`  | `data/grillmaster.db`| SQLite file                    |
| `I2C_BUS`  | `1`                  | Pi I2C bus                     |
| `RTD_ADDR` | `0x66`               | EZO-RTD default                |
| `PUBLIC_URL` | _(auto LAN IP)_    | Phone QR target URL            |
