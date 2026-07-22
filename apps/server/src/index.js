import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import {
  createSensor,
  celsiusToFahrenheit,
} from "@grill-master/sensor";
import { openDatabase, createCookStore } from "./db.js";
import { loadProjectEnv } from "./loadEnv.js";

loadProjectEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const POLL_MS = Number(process.env.POLL_MS || 30000);
const UNIT = (process.env.TEMP_UNIT || "F").toUpperCase();

const db = openDatabase();
const cooks = createCookStore(db);
const sensor = createSensor({ mode: process.env.SENSOR || "mock" });

const app = express();
app.use(express.json());

let latest = {
  celsius: null,
  fahrenheit: null,
  recordedAt: null,
  error: null,
  unit: UNIT,
};

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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    sensor: process.env.SENSOR || "mock",
    unit: UNIT,
  });
});

app.get("/api/temp", (_req, res) => {
  res.json({
    ...latest,
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
  const readings = cooks.getReadings(cook.id).map((r) => ({
    id: r.id,
    recordedAt: r.recorded_at,
    celsius: r.celsius,
    fahrenheit: celsiusToFahrenheit(r.celsius),
  }));
  res.json({ cook: serializeCook(cook), readings });
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
           <h1>Grill Master</h1>
           <p>Web UI not built yet. Run <code>npm run build -w @grill-master/web</code>
           or open the Vite dev server on port 5173.</p>
           <p>API is up at <a href="/api/temp">/api/temp</a>.</p>
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
      latest,
      activeCook: serializeCook(cooks.getActiveCook()),
    })
  );
});

async function pollSensor() {
  try {
    const celsius = await sensor.readCelsius();
    const reading = readingPayload(celsius);
    latest = { ...reading, error: null };

    const active = cooks.getActiveCook();
    let stored = null;
    if (active) {
      stored = cooks.addReading(active.id, celsius);
    }

    broadcast({
      type: "temp",
      ...latest,
      activeCook: serializeCook(active),
      readingId: stored?.id ?? null,
    });
  } catch (err) {
    latest = {
      ...latest,
      error: err.message || String(err),
      recordedAt: new Date().toISOString(),
    };
    broadcast({ type: "temp", ...latest, activeCook: serializeCook(cooks.getActiveCook()) });
  }
}

const pollTimer = setInterval(pollSensor, POLL_MS);
pollSensor();

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Grill Master listening on http://0.0.0.0:${PORT} (SENSOR=${process.env.SENSOR || "mock"})`
  );
});

async function shutdown() {
  clearInterval(pollTimer);
  await sensor.close();
  db.close();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
