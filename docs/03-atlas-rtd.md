# Atlas Isolated HAT + EZO-RTD

## Hardware order

1. Confirm the Hosyond display works **before** installing the HAT.
2. Power off the Pi.
3. Seat the Atlas Isolated Raspberry Pi HAT on the 40-pin header.
4. Insert the EZO-RTD circuit into any slot (RTD does not require isolation).
5. Connect the RTD temperature probe to the EZO board.
6. Power on.

## Switch EZO to I2C (one-time, if needed)

Factory default is often UART. For RTD:

1. Remove the circuit from the HAT.
2. Short **PRB** to **TX**.
3. Power the circuit (3.3V / GND) until the LED changes from green to blue.
4. Remove the jumper **before** removing power.
5. Power-cycle. The board is now in I2C mode (default address `0x66`).

## Verify on the Pi

```bash
sudo apt install -y i2c-tools
sudo i2cdetect -y 1
```

You should see `66` in the grid. Or run:

```bash
bash scripts/pi/verify-rtd.sh
```

## App sensor mode

On the Pi, the server uses the real I2C sensor when `SENSOR=rtd` (default in the systemd unit). On your Mac, use `SENSOR=mock`.
