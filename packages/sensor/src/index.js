/**
 * Temperature sensor adapters for Grill Master.
 * - mock: sinusoidal grill-like temps for Mac development
 * - rtd: Atlas Scientific EZO-RTD over I2C (Pi)
 */

export function createSensor(options = {}) {
  const mode = (options.mode || process.env.SENSOR || "mock").toLowerCase();
  if (mode === "rtd" || mode === "real") {
    return new RtdSensor({
      bus: Number(options.bus ?? process.env.I2C_BUS ?? 1),
      address: Number(options.address ?? process.env.RTD_ADDR ?? 0x66),
    });
  }
  return new MockSensor({
    baseF: Number(options.baseF ?? 225),
    amplitudeF: Number(options.amplitudeF ?? 15),
  });
}

export class MockSensor {
  constructor({ baseF = 225, amplitudeF = 15 } = {}) {
    this.baseF = baseF;
    this.amplitudeF = amplitudeF;
    this.startedAt = Date.now();
  }

  async readCelsius() {
    const t = (Date.now() - this.startedAt) / 1000;
    const f =
      this.baseF +
      this.amplitudeF * Math.sin(t / 40) +
      (Math.random() - 0.5) * 1.2;
    return fahrenheitToCelsius(f);
  }

  async close() {}
}

/**
 * Atlas EZO-RTD I2C protocol:
 * write command string, wait ~600ms, read response buffer.
 * Response: status byte + ASCII payload (e.g. temperature in C).
 */
export class RtdSensor {
  constructor({ bus = 1, address = 0x66 } = {}) {
    this.busNumber = bus;
    this.address = address;
    this.bus = null;
  }

  async #ensureBus() {
    if (this.bus) return this.bus;
    const i2c = await import("i2c-bus");
    this.bus = await i2c.openPromisified(this.busNumber);
    return this.bus;
  }

  async #command(cmd, delayMs = 600) {
    const bus = await this.#ensureBus();
    const payload = Buffer.from(cmd, "ascii");
    await bus.i2cWrite(this.address, payload.length, payload);
    await sleep(delayMs);
    const buf = Buffer.alloc(32);
    await bus.i2cRead(this.address, buf.length, buf);
    const status = buf[0];
    const text = buf
      .slice(1)
      .toString("ascii")
      .replace(/\0/g, "")
      .trim();
    if (status === 2) {
      throw new Error(`EZO-RTD syntax error for command: ${cmd}`);
    }
    if (status === 254) {
      throw new Error("EZO-RTD still processing (increase delay)");
    }
    if (status === 255) {
      throw new Error("EZO-RTD no data to send");
    }
    // status 1 = success
    return text;
  }

  async readCelsius() {
    const text = await this.#command("R", 600);
    const value = Number.parseFloat(text);
    if (!Number.isFinite(value)) {
      throw new Error(`EZO-RTD returned non-numeric reading: "${text}"`);
    }
    return value;
  }

  async close() {
    if (this.bus) {
      await this.bus.close();
      this.bus = null;
    }
  }
}

export function celsiusToFahrenheit(c) {
  return (c * 9) / 5 + 32;
}

export function fahrenheitToCelsius(f) {
  return ((f - 32) * 5) / 9;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
