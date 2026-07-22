#!/usr/bin/env bash
# Checks that the EZO-RTD appears on I2C bus 1 at 0x66
set -euo pipefail

BUS="${I2C_BUS:-1}"
ADDR="${RTD_ADDR:-66}"

if ! command -v i2cdetect >/dev/null 2>&1; then
  echo "i2c-tools not installed. Run: sudo apt install -y i2c-tools"
  exit 1
fi

echo "==> Scanning I2C bus $BUS"
MAP="$(i2cdetect -y "$BUS" 2>/dev/null || sudo i2cdetect -y "$BUS")"
echo "$MAP"

if echo "$MAP" | grep -qw "$ADDR"; then
  echo "==> OK: EZO-RTD found at 0x${ADDR}"
  exit 0
fi

echo "==> FAIL: No device at 0x${ADDR}"
echo "    - Enable I2C: sudo raspi-config nonint do_i2c 0"
echo "    - Check HAT seating and EZO insertion"
echo "    - Switch EZO from UART to I2C if needed (see docs/03-atlas-rtd.md)"
exit 1
