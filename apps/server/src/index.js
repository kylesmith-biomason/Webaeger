import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import {
  createProbeChannels,
  celsiusToFahrenheit,
} from "@grill-master/sensor";
import { openDatabase, createCookStore } from "./db.js";
import { loadProjectEnv } from "./loadEnv.js";
import { resolvePublicUrl } from "./publicUrl.js";

loadProjectEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
/** Live UI / WebSocket update interval */
const POLL_MS = Number(process.env.POLL_MS || 4000);
/** How often to persist readings for the graph while a cook is active */
const RECORD_MS = Number(process.env.RECORD_MS || 60000);
const UNIT = (process.env.TEMP_UNIT || "F").toUpperCase();
const PUBLIC_URL = resolvePublicUrl(PORT);

const db = openDatabase();
const cooks = createCookStore(db);
const probes = createProbeChannels({ mode: process.env.SENSOR || "mock" });

const app = express();
app.use(express.json());

const probeMeta = probes.map(({ id, label }) => ({ id, label }));

/** @type {Record<number, object>} */
let channels = Object.fromEntries(
  probes.map(({ id }) => [
    id,
    {
      id,
      label: probes[id].label,
      celsius: null,
      fahrenheit: null,
      display: null,
      recordedAt: null,
      error: null,
      unit: UNIT,
    },
  ])
);

function serializeCook(cook) {
  if (!cook) return null;
  return {
    id: cook.id,
    name: cook.name,
    startedAt: cook.started_at,
    endedAt: cook.ended_at ?? null,
    notes: cook.notes ?? null,
    readingCount: cook.reading_count ?? undefined,
    minC: cook.min_c ?? undefined,
    maxC: cook.max_c ?? undefined,
    avgC: cook.avg_c ?? undefined,
  };
}

function readingPayload(celsius, recordedAt = new Date().toISOString()) {
  return {
    celsius,
    fahrenheit: celsiusToFahrenheit(celsius),
    recordedAt,
    unit: UNIT,
    display:
      UNIT === "C"
        ? Number(celsius.toFixed(1))
        : Number(celsiusToFahrenheit(celsius).toFixed(1)),
  };
}

function latestSnapshot() {
  const list = probeMeta.map((p) => channels[p.id]);
  const primary = list[0] || null;
  return {
    unit: UNIT,
    probes: probeMeta,
    channels: list,
    // Back-compat single-channel fields (first probe)
    celsius: primary?.celsius ?? null,
    fahrenheit: primary?.fahrenheit ?? null,
    display: primary?.display ?? null,
    recordedAt: primary?.recordedAt ?? null,
    error: primary?.error ?? null,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    sensor: process.env.SENSOR || "mock",
    unit: UNIT,
    publicUrl: PUBLIC_URL,
    probes: probeMeta,
  });
});

app.get("/api/temp", (_req, res) => {
  res.json({
    ...latestSnapshot(),
    activeCook: serializeCook(cooks.getActiveCook()),
  });
});

app.get("/api/cooks", (_req, res) => {
  res.json({
    cooks: cooks.listCooks().map(serializeCook),
    activeCook: serializeCook(cooks.getActiveCook()),
  });
});

app.get("/api/cooks/:id", (req, res) => {
  const cook = cooks.getCook(Number(req.params.id));
  if (!cook) {
    res.status(404).json({ error: "Cook not found" });
    return;
  }
  const channelParam = req.query.channel;
  const wantAll =
    channelParam === undefined ||
    channelParam === "" ||
    channelParam === "all";
  const rows = wantAll
    ? cooks.getAllReadings(cook.id)
    : cooks.getReadings(cook.id, Number(channelParam));
  const readings = rows.map((r) => ({
    id: r.id,
    channel: r.channel ?? 0,
    recordedAt: r.recorded_at,
    celsius: r.celsius,
    fahrenheit: celsiusToFahrenheit(r.celsius),
  }));
  res.json({
    cook: serializeCook(cook),
    channel: wantAll ? "all" : Number(channelParam),
    readings,
  });
});

app.post("/api/cooks", (req, res) => {
  try {
    const cook = cooks.startCook(req.body?.name);
    broadcast({ type: "cook", cook: serializeCook(cook) });
    res.status(201).json({ cook: serializeCook(cook) });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      activeCook: serializeCook(err.active),
    });
  }
});

app.post("/api/cooks/stop", (_req, res) => {
  const cook = cooks.stopCook();
  broadcast({ type: "cook", cook: serializeCook(cook) });
  res.json({ cook: serializeCook(cook) });
});

const webDist = path.resolve(__dirname, "../../web/dist");
app.use(express.static(webDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/ws")) {
    next();
    return;
  }
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) {
      res
        .status(503)
        .type("html")
        .send(
          `<!doctype html><html><body style="font-family:sans-serif;padding:2rem">
           <h1>Traeger</h1>
           <p>Web UI not built yet. Run <code>npm run build -w @grill-master/web</code>.</p>
           </body></html>`
        );
    }
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

wss.on("connection", (socket) => {
  socket.send(
    JSON.stringify({
      type: "hello",
      ...latestSnapshot(),
      activeCook: serializeCook(cooks.getActiveCook()),
    })
  );
});

/** Last DB write time / id — live polls do not change these */
let lastGraphRecordAt = 0;
let lastRecordCookId = null;
let lastStoredId = null;

async function pollSensors() {
  const active = cooks.getActiveCook();
  const now = Date.now();

  if (!active) {
    lastGraphRecordAt = 0;
    lastRecordCookId = null;
  }

  const shouldRecord =
    Boolean(active) &&
    (active.id !== lastRecordCookId || now - lastGraphRecordAt >= RECORD_MS);

  let recordedThisPoll = false;

  await Promise.all(
    probes.map(async ({ id, label, sensor }) => {
      try {
        const celsius = await sensor.readCelsius();
        const reading = readingPayload(celsius);
        channels[id] = {
          id,
          label,
          ...reading,
          error: null,
        };
        if (shouldRecord) {
          const stored = cooks.addReading(active.id, celsius, id);
          lastStoredId = stored.id;
          recordedThisPoll = true;
        }
      } catch (err) {
        channels[id] = {
          ...channels[id],
          id,
          label,
          error: err.message || String(err),
          recordedAt: new Date().toISOString(),
          unit: UNIT,
        };
      }
    })
  );

  if (recordedThisPoll) {
    lastGraphRecordAt = now;
    lastRecordCookId = active.id;
  }

  broadcast({
    type: "temp",
    ...latestSnapshot(),
    activeCook: serializeCook(active),
    // Stable across live-only polls so the UI does not refetch graph history every tick
    readingId: lastStoredId,
  });
}

const pollTimer = setInterval(pollSensors, POLL_MS);
pollSensors();

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Traeger listening on http://0.0.0.0:${PORT} (SENSOR=${process.env.SENSOR || "mock"}, POLL_MS=${POLL_MS}, RECORD_MS=${RECORD_MS}, probes=${probeMeta.map((p) => p.label).join("|")}, PUBLIC_URL=${PUBLIC_URL})`
  );
});

async function shutdown() {
  clearInterval(pollTimer);
  await Promise.all(probes.map((p) => p.sensor.close()));
  db.close();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
