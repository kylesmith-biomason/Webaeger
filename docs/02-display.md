# Hosyond 5" DSI Display (800×480)

## Cable and power

1. Connect the FFC ribbon to the Pi 4 **DSI** port (contacts oriented per the Hosyond manual).
2. If the panel has 5V power pins, connect them to the Pi’s 5V and GND header pins before seating the Atlas HAT.
3. Power on and wait for the desktop.

## Overlay (if the panel does not light up)

Hosyond’s driver-free 800×480 DSI panels usually use the official-compatible overlay. Edit:

```bash
sudo nano /boot/firmware/config.txt
```

Ensure these lines exist (do not duplicate `vc4-kms-v3d` if already present):

```ini
dtoverlay=vc4-kms-v3d
dtoverlay=vc4-kms-dsi-7inch
```

If Hosyond’s PDF specifies a different overlay, use that exact line instead.

Reboot:

```bash
sudo reboot
```

Or apply from the repo:

```bash
sudo bash scripts/pi/configure-display.sh
```

## Confirm resolution and touch

```bash
wlr-randr
# Expect DSI-1 (or similar) at 800x480

# Optional rotation (example: 90°):
# wlr-randr --output DSI-1 --transform 90
```

Tap the screen — the pointer / touch should respond. Persist rotation via **Screen Configuration** or `~/.config/kanshi/config` if needed.
