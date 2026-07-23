/**
 * Temperature sensor adapters for Grill Master.
 * - mock: ramps °F by 1 each poll (per-channel ranges)
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
    minF: Number(options.minF ?? 100),
    maxF: Number(options.maxF ?? 200),
    stepF: Number(options.stepF ?? 1),
    startF: options.startF,
  });
}

/**
 * Build one sensor per probe channel from env / options.
 * PROBE_LABELS=Pit,Meat
 * RTD_ADDRS=0x70,0x66  (rtd mode)
 */
export function createProbeChannels(options = {}) {
  const mode = (options.mode || process.env.SENSOR || "mock").toLowerCase();
  const labels = parseList(
    options.labels ?? process.env.PROBE_LABELS,
    ["Pit", "Meat"]
  );
  const addrs = parseList(
    options.addresses ?? process.env.RTD_ADDRS ?? process.env.RTD_ADDR,
    ["0x66"]
  );
  const bus = Number(options.bus ?? process.env.I2C_BUS ?? 1);

  const mockRanges = [
    { minF: 100, maxF: 200, startF: 100 },
    { minF: 140, maxF: 220, startF: 160 },
    { minF: 80, maxF: 180, startF: 120 },
    { minF: 90, maxF: 250, startF: 150 },
  ];

  return labels.map((label, index) => {
    const id = index;
    let sensor;
    if (mode === "rtd" || mode === "real") {
      const addrRaw = addrs[Math.min(index, addrs.length - 1)];
      sensor = createSensor({
        mode: "rtd",
        bus,
        address: Number(addrRaw),
      });
    } else {
      const range = mockRanges[index % mockRanges.length];
      sensor = createSensor({ mode: "mock", ...range });
    }
    return {
      id,
      label: label.trim() || `Probe ${index + 1}`,
      sensor,
    };
  });
}

function parseList(value, fallback) {
  if (Array.isArray(value) && value.length) return value.map(String);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return fallback;
}

/**
 * Mock: ramp °F from min→max→min by `stepF` on every read (each poll).
 */
export class MockSensor {
  constructor({ minF = 100, maxF = 200, stepF = 1, startF } = {}) {
    this.minF = minF;
    this.maxF = maxF;
    this.stepF = stepF;
    this.currentF = startF ?? minF;
    this.direction = 1;
  }

  async readCelsius() {
    const valueF = this.currentF;
    this.currentF += this.direction * this.stepF;
    if (this.currentF >= this.maxF) {
      this.currentF = this.maxF;
      this.direction = -1;
    } else if (this.currentF <= this.minF) {
      this.currentF = this.minF;
      this.direction = 1;
    }
    return fahrenheitToCelsius(valueF);
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
