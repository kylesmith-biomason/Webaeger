import os from "node:os";

/**
 * URL phones should open. Prefer PUBLIC_URL; else first non-internal IPv4.
 */
export function resolvePublicUrl(port = 3000) {
  const fromEnv = process.env.PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      const family = net.family;
      const isV4 = family === "IPv4" || family === 4;
      if (isV4 && !net.internal) {
        return `http://${net.address}:${port}`;
      }
    }
  }
  return `http://127.0.0.1:${port}`;
}
