import { useMemo, useRef, useState } from "react";

function toDisplay(celsius, unit) {
  return unit === "C" ? celsius : (celsius * 9) / 5 + 32;
}

function formatHm(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function chooseStepMinutes(spanMs, maxTicks = 5) {
  const spanMin = Math.max(spanMs / 60000, 1);
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240, 360, 720];
  for (const step of candidates) {
    if (Math.ceil(spanMin / step) <= maxTicks) return step;
  }
  return candidates[candidates.length - 1];
}

function floorToStepMs(timeMs, stepMinutes) {
  const stepMs = stepMinutes * 60 * 1000;
  return Math.floor(timeMs / stepMs) * stepMs;
}

function buildTimeTicks(tMin, tMax, stepMinutes, xAtTime, minPxGap = 64) {
  const stepMs = stepMinutes * 60 * 1000;
  let t = floorToStepMs(tMin, stepMinutes);
  if (t < tMin) t += stepMs;

  const candidates = [];
  for (; t <= tMax; t += stepMs) {
    candidates.push({ time: t, label: formatHm(new Date(t)) });
  }

  const start = { time: tMin, label: formatHm(new Date(tMin)) };
  const end = { time: tMax, label: formatHm(new Date(tMax)) };
  if (!candidates.length || candidates[0].time - tMin > stepMs * 0.5) {
    candidates.unshift(start);
  }
  if (
    !candidates.length ||
    tMax - candidates[candidates.length - 1].time > stepMs * 0.5
  ) {
    candidates.push(end);
  }

  const unique = [];
  for (const tick of candidates) {
    if (unique.length && unique[unique.length - 1].label === tick.label) {
      continue;
    }
    unique.push(tick);
  }

  if (unique.length <= 2) return unique;

  const first = unique[0];
  const last = unique[unique.length - 1];
  const middle = unique.slice(1, -1);
  const kept = [first];

  for (const tick of middle) {
    const prev = kept[kept.length - 1];
    if (xAtTime(tick.time) - xAtTime(prev.time) >= minPxGap) {
      kept.push(tick);
    }
  }

  if (xAtTime(last.time) - xAtTime(kept[kept.length - 1].time) >= minPxGap) {
    kept.push(last);
  } else if (kept.length === 1) {
    kept.push(last);
  } else {
    kept[kept.length - 1] = last;
  }

  return kept;
}

function chooseTempStep(range) {
  const rough = Math.max(range, 1) / 5;
  const candidates = [1, 2, 5, 10, 15, 20, 25, 50, 100];
  for (const step of candidates) {
    if (step >= rough) return step;
  }
  return 100;
}

function buildTempTicks(yMin, yMax, step) {
  const ticks = [];
  const start = Math.ceil(yMin / step - 1e-9) * step;
  for (let v = start; v <= yMax + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(4)));
  }
  if (!ticks.length || ticks[0] !== yMin) {
    ticks.unshift(Number(yMin.toFixed(4)));
  }
  if (ticks[ticks.length - 1] !== yMax) {
    ticks.push(Number(yMax.toFixed(4)));
  }
  return ticks.filter(
    (v, i, arr) => i === 0 || Math.abs(v - arr[i - 1]) > step * 0.01
  );
}

function niceTempDomain(dataMin, dataMax) {
  const span = Math.max(dataMax - dataMin, 1);
  const margin = Math.max(span * 0.08, 2);
  let lo = dataMin - margin;
  let hi = dataMax + margin;
  const step = chooseTempStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (hi <= lo) hi = lo + step;
  return { yMin: lo, yMax: hi, tempStep: step };
}

function whittakerSmooth(values, lambda = 40) {
  const n = values.length;
  if (n < 3 || lambda <= 0) return values.slice();

  const A = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) A[i][i] = 1;

  for (let i = 0; i < n - 2; i++) {
    const coeffs = [1, -2, 1];
    const idxs = [i, i + 1, i + 2];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        A[idxs[a]][idxs[b]] += lambda * coeffs[a] * coeffs[b];
      }
    }
  }

  const y = values.slice();
  const z = values.slice();
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (pivot !== col) {
      [A[col], A[pivot]] = [A[pivot], A[col]];
      [y[col], y[pivot]] = [y[pivot], y[col]];
    }
    const diag = A[col][col] || 1e-12;
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / diag;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      y[r] -= f * y[col];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let c = i + 1; c < n; c++) sum -= A[i][c] * z[c];
    z[i] = sum / (A[i][i] || 1e-12);
  }
  return z;
}

const SMOOTH_LAMBDA = 40;

const SERIES_COLORS = [
  { stroke: "rgba(255,106,26,0.95)", glow: "rgba(255,180,120,0.22)", dot: "#ff6a1a" },
  { stroke: "rgba(126,200,227,0.95)", glow: "rgba(126,200,227,0.22)", dot: "#7ec8e3" },
  { stroke: "rgba(126,207,138,0.95)", glow: "rgba(126,207,138,0.22)", dot: "#7ecf8a" },
];

function buildSeriesPoints(readings, unit, smoothLambda) {
  const pointsData = readings
    .map((r) => ({
      time: new Date(r.recordedAt).getTime(),
      value: toDisplay(r.celsius, unit),
    }))
    .filter(
      (p) => Number.isFinite(p.time) && Number.isFinite(p.value) && p.value >= 0
    )
    .sort((a, b) => a.time - b.time);

  if (!pointsData.length) return null;

  const rawValues = pointsData.map((p) => p.value);
  const smoothed = whittakerSmooth(rawValues, smoothLambda);
  return pointsData.map((p, i) => ({
    time: p.time,
    value: smoothed[i],
    raw: p.value,
  }));
}

/**
 * @param {Array<{id:number,label:string,readings:array}>} [series]
 * @param {array} [readings] single-series fallback
 */
export function TempChart({
  readings,
  series,
  unit = "F",
  width = 320,
  height = 72,
  smoothLambda = SMOOTH_LAMBDA,
}) {
  const svgRef = useRef(null);
  const [tip, setTip] = useState(null);

  const model = useMemo(() => {
    const inputSeries =
      series?.length > 0
        ? series
        : readings?.length
          ? [{ id: 0, label: "", readings }]
          : [];

    const built = inputSeries
      .map((s, index) => {
        const plotPoints = buildSeriesPoints(s.readings || [], unit, smoothLambda);
        if (!plotPoints) return null;
        const colors = SERIES_COLORS[index % SERIES_COLORS.length];
        return {
          id: s.id,
          label: s.label || `Ch ${s.id}`,
          plotPoints,
          colors,
        };
      })
      .filter(Boolean);

    if (!built.length) return null;

    const allValues = built.flatMap((s) =>
      s.plotPoints.flatMap((p) => [p.value, p.raw])
    );
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const { yMin, yMax, tempStep } = niceTempDomain(dataMin, dataMax);
    const span = Math.max(yMax - yMin, 1e-6);
    const tempTicks = buildTempTicks(yMin, yMax, tempStep);

    const allTimes = built.flatMap((s) => s.plotPoints.map((p) => p.time));
    const tMin = Math.min(...allTimes);
    const tMax = Math.max(...allTimes);
    const timeSpan = Math.max(tMax - tMin, 1);

    return {
      yMin,
      yMax,
      span,
      tempTicks,
      series: built,
      tMin,
      tMax,
      timeSpan,
    };
  }, [readings, series, unit, smoothLambda]);

  if (!model) return null;

  const { yMin, span, tempTicks, series: plotSeries, tMin, timeSpan } = model;

  const showAxis = height > 120;
  const padX = showAxis ? 48 : 16;
  const padTop = showAxis ? 18 : 12;
  const padBottom = showAxis ? 36 : 12;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const xAtTime = (time) => padX + ((time - tMin) / timeSpan) * plotW;
  const yAt = (v) => padTop + (1 - (v - yMin) / span) * plotH;

  const stepMinutes = chooseStepMinutes(timeSpan, 5);
  const timeTicks = showAxis
    ? buildTimeTicks(tMin, model.tMax, stepMinutes, xAtTime, 64)
    : [];

  const stroke = showAxis ? 3.5 : 2.5;
  const glow = showAxis ? 10 : 6;

  function svgCoords(clientX, clientY) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
      rect,
    };
  }

  function nearestPoint(svgX) {
    let best = null;
    let bestDist = Infinity;
    for (const s of plotSeries) {
      for (const p of s.plotPoints) {
        const px = xAtTime(p.time);
        const d = Math.abs(px - svgX);
        if (d < bestDist) {
          bestDist = d;
          best = {
            ...p,
            px,
            py: yAt(p.value),
            label: s.label,
            color: s.colors.dot,
          };
        }
      }
    }
    return best;
  }

  function updateTip(clientX, clientY) {
    const coords = svgCoords(clientX, clientY);
    if (!coords) return;
    const hit = nearestPoint(coords.x);
    if (!hit) return;
    setTip({
      leftPct: (hit.px / width) * 100,
      topPct: (hit.py / height) * 100,
      timeLabel: formatHm(new Date(hit.time)),
      tempLabel: `${hit.raw.toFixed(1)}°${unit}`,
      seriesLabel: hit.label,
      px: hit.px,
      py: hit.py,
      color: hit.color,
    });
  }

  function clearTip() {
    setTip(null);
  }

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          updateTip(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => updateTip(e.clientX, e.clientY)}
        onPointerUp={clearTip}
        onPointerLeave={clearTip}
        onPointerCancel={clearTip}
      >
        {showAxis &&
          tempTicks.map((v) => {
            const y = yAt(v);
            return (
              <g key={`grid-${v}`}>
                <line
                  x1={padX}
                  y1={y}
                  x2={padX + plotW}
                  y2={y}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                />
                <text
                  x={padX - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="chart-label"
                >
                  {v.toFixed(0)}
                </text>
              </g>
            );
          })}
        {showAxis && (
          <line
            x1={padX}
            y1={padTop + plotH}
            x2={padX + plotW}
            y2={padTop + plotH}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1"
          />
        )}
        {plotSeries.map((s) => {
          const points = s.plotPoints
            .map((p) => `${xAtTime(p.time)},${yAt(p.value)}`)
            .join(" ");
          return (
            <g key={`series-${s.id}`}>
              <polyline
                fill="none"
                stroke={s.colors.glow}
                strokeWidth={glow}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points}
              />
              <polyline
                fill="none"
                stroke={s.colors.stroke}
                strokeWidth={stroke}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points}
              />
            </g>
          );
        })}
        {tip && (
          <g className="chart-crosshair">
            <line
              x1={tip.px}
              y1={padTop}
              x2={tip.px}
              y2={padTop + plotH}
              stroke="rgba(255,248,241,0.35)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <circle
              cx={tip.px}
              cy={tip.py}
              r="6"
              fill={tip.color || "#ff6a1a"}
              stroke="#fff8f1"
              strokeWidth="2"
            />
          </g>
        )}
        {showAxis &&
          timeTicks.map((tick) => (
            <text
              key={`${tick.time}-${tick.label}`}
              x={xAtTime(tick.time)}
              y={height - 10}
              textAnchor="middle"
              className="chart-label"
            >
              {tick.label}
            </text>
          ))}
      </svg>
      {tip && (
        <div
          className={`chart-tooltip ${tip.leftPct > 70 ? "flip" : ""}`}
          style={{ left: `${tip.leftPct}%`, top: `${tip.topPct}%` }}
        >
          {tip.seriesLabel ? (
            <div className="chart-tooltip-series">{tip.seriesLabel}</div>
          ) : null}
          <div className="chart-tooltip-temp">{tip.tempLabel}</div>
          <div className="chart-tooltip-time">{tip.timeLabel}</div>
        </div>
      )}
    </div>
  );
}
