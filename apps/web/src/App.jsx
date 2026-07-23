import { useCallback, useEffect, useMemo, useState } from "react";
import { useGrillSocket } from "./useGrillSocket.js";
import { TempChart } from "./TempChart.jsx";
import { QrShareOverlay } from "./QrShareOverlay.jsx";

const CHANNEL_KEY = "traeger.selectedChannel";
const GRAPH_CHANNELS_KEY = "traeger.graphChannels";

function formatClock(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDisplayTemp(celsius, unit) {
  return unit === "C" ? celsius : (celsius * 9) / 5 + 32;
}

/** Average °/min ramp over the last 5 minutes of readings. */
function fiveMinuteRamp(readings, unit) {
  if (!readings?.length || readings.length < 2) return null;

  const latestMs = new Date(readings[readings.length - 1].recordedAt).getTime();
  if (!Number.isFinite(latestMs)) return null;
  const cutoff = latestMs - 5 * 60 * 1000;

  const window = readings.filter((r) => {
    const t = new Date(r.recordedAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
  if (window.length < 2) return null;

  const first = window[0];
  const last = window[window.length - 1];
  const t0 = new Date(first.recordedAt).getTime();
  const t1 = new Date(last.recordedAt).getTime();
  const dtMin = (t1 - t0) / 60000;
  if (dtMin < 0.05) return null;

  const v0 = toDisplayTemp(first.celsius, unit);
  const v1 = toDisplayTemp(last.celsius, unit);
  if (!Number.isFinite(v0) || !Number.isFinite(v1)) return null;

  return (v1 - v0) / dtMin;
}

function formatRamp(rampPerMin) {
  if (rampPerMin == null || !Number.isFinite(rampPerMin)) return "—";
  const sign = rampPerMin > 0 ? "+" : "";
  return `${sign}${rampPerMin.toFixed(1)}°/min`;
}

function readStoredChannel() {
  try {
    const raw = localStorage.getItem(CHANNEL_KEY);
    if (raw == null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function readStoredGraphChannels(fallbackIds) {
  try {
    const raw = localStorage.getItem(GRAPH_CHANNELS_KEY);
    if (!raw) return new Set(fallbackIds);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return new Set(fallbackIds);
    return new Set(parsed.map(Number).filter(Number.isFinite));
  } catch {
    return new Set(fallbackIds);
  }
}

export default function App() {
  const { latest, connected } = useGrillSocket();
  const [view, setView] = useState("live"); // live | graph
  const [activeCook, setActiveCook] = useState(null);
  const [detail, setDetail] = useState(null);
  const [naming, setNaming] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [channelId, setChannelId] = useState(readStoredChannel);
  const [graphChannels, setGraphChannels] = useState(() => new Set());

  const probes = latest?.probes?.length
    ? latest.probes
    : latest?.channels?.map((c) => ({ id: c.id, label: c.label })) || [
        { id: 0, label: "Pit" },
        { id: 1, label: "Meat" },
      ];

  useEffect(() => {
    if (!probes.some((p) => p.id === channelId)) {
      setChannelId(probes[0]?.id ?? 0);
    }
  }, [probes, channelId]);

  useEffect(() => {
    if (graphChannels.size > 0) return;
    const ids = probes.map((p) => p.id);
    setGraphChannels(readStoredGraphChannels(ids));
  }, [probes, graphChannels.size]);

  function selectChannel(id) {
    setChannelId(id);
    try {
      localStorage.setItem(CHANNEL_KEY, String(id));
    } catch {
      // ignore
    }
  }

  function toggleGraphChannel(id) {
    setGraphChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem(GRAPH_CHANNELS_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
    selectChannel(id);
  }

  const activeChannel = useMemo(() => {
    const list = latest?.channels || [];
    return list.find((c) => c.id === channelId) || list[0] || null;
  }, [latest?.channels, channelId]);

  const refreshActive = useCallback(async () => {
    const res = await fetch("/api/cooks");
    const data = await res.json();
    setActiveCook(data.activeCook || null);
  }, []);

  useEffect(() => {
    refreshActive().catch(console.error);
  }, [refreshActive]);

  useEffect(() => {
    if (latest?.activeCook !== undefined) {
      setActiveCook(latest.activeCook);
    }
  }, [latest?.activeCook]);

  useEffect(() => {
    if (!activeCook?.id) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    const query =
      view === "graph" ? "channel=all" : `channel=${channelId}`;
    fetch(`/api/cooks/${activeCook.id}?${query}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [activeCook?.id, latest?.readingId, view, channelId]);

  const displayTemp = activeChannel?.display;
  const unit = activeChannel?.unit || latest?.unit || "F";
  const hasError = Boolean(activeChannel?.error);

  const statusLabel = useMemo(() => {
    if (!connected) return "Reconnecting";
    if (hasError) return "Sensor error";
    return "Live";
  }, [connected, hasError]);

  const graphSeries = useMemo(() => {
    const all = detail?.readings || [];
    const selected =
      graphChannels.size > 0
        ? graphChannels
        : new Set(probes.map((p) => p.id));
    return probes
      .filter((p) => selected.has(p.id))
      .map((p) => ({
        id: p.id,
        label: p.label,
        readings: all.filter((r) => (r.channel ?? 0) === p.id),
      }))
      .filter((s) => s.readings.length > 0);
  }, [detail?.readings, graphChannels, probes]);

  const rampReadings = useMemo(() => {
    const all = detail?.readings || [];
    return all.filter((r) => (r.channel ?? 0) === channelId);
  }, [detail?.readings, channelId]);

  const rampPerMin = useMemo(
    () => fiveMinuteRamp(rampReadings, unit),
    [rampReadings, unit]
  );

  async function startCook() {
    setBusy(true);
    try {
      const res = await fetch("/api/cooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start cook");
      setActiveCook(data.cook);
      setNaming(false);
      setName("");
      await refreshActive();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function stopCook() {
    setBusy(true);
    try {
      await fetch("/api/cooks/stop", { method: "POST" });
      setActiveCook(null);
      setDetail(null);
      setConfirmingEnd(false);
      await refreshActive();
    } finally {
      setBusy(false);
    }
  }

  const liveChannelToggle =
    probes.length > 1 ? (
      <div className="channel-toggle" role="tablist" aria-label="Probe channel">
        {probes.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={channelId === p.id}
            className={`channel-btn ${channelId === p.id ? "active" : ""}`}
            onClick={() => selectChannel(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
    ) : null;

  const graphChannelToggle =
    probes.length > 1 ? (
      <div
        className="channel-toggle"
        role="group"
        aria-label="Graph probe channels"
      >
        {probes.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={graphChannels.has(p.id)}
            className={`channel-btn ${graphChannels.has(p.id) ? "active" : ""}`}
            onClick={() => toggleGraphChannel(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className="app">
      <header
        className={`top ${view === "graph" ? "top-graph" : "top-live"}`}
      >
        {view === "graph" ? (
          <>
            <button
              type="button"
              className="graph-cook-name brand-hit"
              aria-label="Show phone QR code"
              onClick={() => setShowQr(true)}
            >
              {activeCook?.name || "Temperature"}
            </button>
            {graphChannelToggle}
            <div
              className={`status ${hasError ? "err" : connected ? "live" : ""}`}
            >
              {statusLabel}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className="brand brand-hit"
              aria-label="Show phone QR code"
              onClick={() => setShowQr(true)}
            >
              Traeger
            </button>
            {liveChannelToggle}
            <div
              className={`status ${hasError ? "err" : connected ? "live" : ""}`}
            >
              {statusLabel}
            </div>
          </>
        )}
      </header>

      {view === "live" ? (
        <>
          <main className="stage">
            <div className="glow" aria-hidden />
            <div className="temp-wrap">
              <p className="temp">
                {displayTemp == null ? "--.-" : displayTemp.toFixed(1)}
                <span className="temp-unit">°{unit}</span>
              </p>
              <div className="temp-meta">
                {activeCook ? (
                  <>
                    Cooking{" "}
                    <span className="cook-name">{activeCook.name}</span>
                    {" · "}
                    started {formatClock(activeCook.startedAt)}
                  </>
                ) : (
                  "Ready when you are"
                )}
              </div>
            </div>
          </main>

          <footer className="bottom bottom-live">
            <div className="actions">
              {activeCook ? (
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setConfirmingEnd(true)}
                >
                  End cook
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => setNaming(true)}
                >
                  Start cook
                </button>
              )}
              <button
                className="btn btn-ghost"
                disabled={!activeCook}
                onClick={() => setView("graph")}
              >
                Graph
              </button>
            </div>
          </footer>
        </>
      ) : (
        <>
          <main className="stage stage-graph">
            <div className="graph-sub-bar graph-sub-bar-row">
              <div
                className="graph-ramp"
                title="Average temp change over the last 5 minutes"
              >
                <span className="graph-ramp-value">
                  {formatRamp(rampPerMin)}
                </span>
                <span className="graph-ramp-label">5 min avg</span>
              </div>
            </div>
            <div className="graph-body">
              {graphSeries.length ? (
                <TempChart
                  series={graphSeries}
                  unit={unit}
                  width={720}
                  height={280}
                />
              ) : (
                <div className="chart-empty chart-empty-lg">
                  {activeCook
                    ? "Logging temperatures…"
                    : "Start a cook to see the graph"}
                </div>
              )}
            </div>
          </main>

          <footer className="bottom bottom-live">
            <div className="actions">
              <button
                className="btn btn-primary"
                onClick={() => setView("live")}
              >
                Live temp
              </button>
            </div>
          </footer>
        </>
      )}

      {naming && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="sheet">
            <h2>Name this cook</h2>
            <p>Optional — leave blank for a timestamp name.</p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Brisket Saturday"
              onKeyDown={(e) => {
                if (e.key === "Enter") startCook();
              }}
            />
            <div className="sheet-actions">
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setNaming(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={startCook}
              >
                Start
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingEnd && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="sheet">
            <h2>End this cook?</h2>
            <p>
              {activeCook?.name
                ? `Stop recording “${activeCook.name}”. You can still view the graph history.`
                : "Stop recording temperatures for this cook."}
            </p>
            <div className="sheet-actions">
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setConfirmingEnd(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={stopCook}
              >
                End cook
              </button>
            </div>
          </div>
        </div>
      )}

      {showQr && <QrShareOverlay onClose={() => setShowQr(false)} />}
    </div>
  );
}
