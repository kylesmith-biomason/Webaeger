import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function openDatabase(dbPath = process.env.DB_PATH) {
  const resolved =
    dbPath ||
    path.resolve(path.join(__dirname, "../../../data/grillmaster.db"));
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cook_id INTEGER NOT NULL,
      recorded_at TEXT NOT NULL,
      celsius REAL NOT NULL,
      FOREIGN KEY (cook_id) REFERENCES cooks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_readings_cook_id ON readings(cook_id);
    CREATE INDEX IF NOT EXISTS idx_readings_recorded_at ON readings(recorded_at);
  `);
  return db;
}

export function createCookStore(db) {
  const insertCook = db.prepare(
    `INSERT INTO cooks (name, started_at) VALUES (?, ?)`
  );
  const endCook = db.prepare(
    `UPDATE cooks SET ended_at = ? WHERE id = ? AND ended_at IS NULL`
  );
  const getActive = db.prepare(
    `SELECT * FROM cooks WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1`
  );
  const getCook = db.prepare(`SELECT * FROM cooks WHERE id = ?`);
  const listCooks = db.prepare(
    `SELECT c.*,
      (SELECT COUNT(*) FROM readings r WHERE r.cook_id = c.id) AS reading_count,
      (SELECT MIN(celsius) FROM readings r WHERE r.cook_id = c.id) AS min_c,
      (SELECT MAX(celsius) FROM readings r WHERE r.cook_id = c.id) AS max_c,
      (SELECT AVG(celsius) FROM readings r WHERE r.cook_id = c.id) AS avg_c
     FROM cooks c
     ORDER BY c.started_at DESC
     LIMIT ?`
  );
  const insertReading = db.prepare(
    `INSERT INTO readings (cook_id, recorded_at, celsius) VALUES (?, ?, ?)`
  );
  const listReadings = db.prepare(
    `SELECT id, cook_id, recorded_at, celsius
     FROM readings
     WHERE cook_id = ?
     ORDER BY recorded_at ASC`
  );

  return {
    startCook(name) {
      const active = getActive.get();
      if (active) {
        throw Object.assign(new Error("A cook is already in progress"), {
          status: 409,
          active,
        });
      }
      const startedAt = new Date().toISOString();
      const info = insertCook.run(name?.trim() || defaultCookName(), startedAt);
      return getCook.get(info.lastInsertRowid);
    },

    stopCook() {
      const active = getActive.get();
      if (!active) return null;
      endCook.run(new Date().toISOString(), active.id);
      return getCook.get(active.id);
    },

    getActiveCook() {
      return getActive.get() || null;
    },

    getCook(id) {
      return getCook.get(id) || null;
    },

    listCooks(limit = 50) {
      return listCooks.all(limit);
    },

    addReading(cookId, celsius) {
      const recordedAt = new Date().toISOString();
      const info = insertReading.run(cookId, recordedAt, celsius);
      return {
        id: Number(info.lastInsertRowid),
        cook_id: cookId,
        recorded_at: recordedAt,
        celsius,
      };
    },

    getReadings(cookId) {
      return listReadings.all(cookId);
    },
  };
}

function defaultCookName() {
  const d = new Date();
  return `Cook ${d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
