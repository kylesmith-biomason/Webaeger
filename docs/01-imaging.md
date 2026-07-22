# Image the Raspberry Pi 4

## Prerequisites

- Raspberry Pi 4
- microSD card (32GB+)
- [Raspberry Pi Imager](https://www.raspberrypi.com/software/) on your Mac
- Hosyond 5" DSI display connected before first power-on

## Flash the OS

1. Open Raspberry Pi Imager.
2. **Device:** Raspberry Pi 4.
3. **OS:** Raspberry Pi OS (64-bit) with desktop (Bookworm or newer).
4. **Storage:** Select your microSD card.
5. Click the gear / **OS Customisation** and set:
   - Hostname: `grillmaster`
   - Username / password
   - Wi‑Fi SSID and password (or use Ethernet)
   - Locale and timezone
   - Enable **SSH** (prefer public-key authentication)
6. Write the image, eject the card, insert it into the Pi.
7. Connect the Hosyond DSI ribbon and power the display from the Pi 5V pins if required by the panel.
8. Power on the Pi.

## First boot checklist

SSH in (or use the attached keyboard/display), then run:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo raspi-config
```

In `raspi-config`:

| Path | Setting |
|------|---------|
| System Options → Boot / Auto Login | Desktop Autologin |
| Interface Options → I2C | Enable |
| Display Options → Screen Blanking | No |

Or apply the same settings non-interactively:

```bash
# From this repo on the Pi after clone to /opt/Webaeger:
sudo bash scripts/pi/configure-os.sh
```

Reboot when finished:

```bash
sudo reboot
```

## Clone the Webaeger repo (on the Pi)

```bash
sudo mkdir -p /opt/Webaeger
sudo chown "$USER:$USER" /opt/Webaeger
git clone https://github.com/kylesmith-biomason/Webaeger.git /opt/Webaeger
cd /opt/Webaeger
```

If Git complains about **dubious ownership**:

```bash
sudo chown -R "$USER:$USER" /opt/Webaeger
git config --global --add safe.directory /opt/Webaeger
```

## Verify SSH from your Mac

```bash
ssh <user>@grillmaster.local
```
