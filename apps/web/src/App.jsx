import { useCallback, useEffect, useMemo, useState } from "react";
import { useGrillSocket } from "./useGrillSocket.js";
import { TempChart } from "./TempChart.jsx";

function formatClock(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function App() {
  const { latest, connected } = useGrillSocket();
  const [view, setView] = useState("live"); // live | graph
  const [activeCook, setActiveCook] = useState(null);
  const [detail, setDetail] = useState(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

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
    fetch(`/api/cooks/${activeCook.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [activeCook?.id, latest?.readingId, view]);

  const displayTemp = latest?.display;
  const unit = latest?.unit || "F";
  const hasError = Boolean(latest?.error);

  const statusLabel = useMemo(() => {
    if (!connected) return "Reconnecting";
    if (hasError) return "Sensor error";
    return "Live";
  }, [connected, hasError]);

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
      await refreshActive();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          Grill <span>Master</span>
        </div>
        <div
          className={`status ${hasError ? "err" : connected ? "live" : ""}`}
        >
          {statusLabel}
        </div>
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
                  onClick={stopCook}
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
            <div className="graph-header">
              <div className="graph-title">
                {activeCook?.name || "Temperature"}
              </div>
              <div className="graph-sub">
                {detail?.readings?.length
                  ? `${detail.readings.length} readings`
                  : "No readings yet"}
              </div>
            </div>
            <div className="graph-body">
              {detail?.readings?.length ? (
                <TempChart
                  readings={detail.readings}
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
              <button className="btn btn-primary" onClick={() => setView("live")}>
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
    </div>
  );
}
