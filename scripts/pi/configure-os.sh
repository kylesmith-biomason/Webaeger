#!/usr/bin/env bash
# Run on the Raspberry Pi as root (sudo) after first boot.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo bash scripts/pi/configure-os.sh"
  exit 1
fi

echo "==> Updating packages"
apt update
apt full-upgrade -y
apt install -y i2c-tools unclutter-xfixes chromium-browser || apt install -y i2c-tools unclutter chromium

echo "==> Enabling I2C"
raspi-config nonint do_i2c 0

echo "==> Desktop autologin for current console user"
# B2 = desktop autologin (raspi-config boot behaviour)
raspi-config nonint do_boot_behaviour B4

echo "==> Disabling screen blanking"
raspi-config nonint do_blanking 1

echo "==> Done. Reboot recommended: sudo reboot"
