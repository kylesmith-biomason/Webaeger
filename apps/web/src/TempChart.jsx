function toDisplay(celsius, unit) {
  return unit === "C" ? celsius : (celsius * 9) / 5 + 32;
}

function formatHm(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function pickTimeTicks(readings, count = 5) {
  if (!readings.length) return [];
  if (readings.length === 1) {
    return [{ index: 0, label: formatHm(readings[0].recordedAt) }];
  }
  const ticks = [];
  const last = readings.length - 1;
  for (let i = 0; i < count; i++) {
    const index = Math.round((i / (count - 1)) * last);
    ticks.push({ index, label: formatHm(readings[index].recordedAt) });
  }
  // Deduplicate consecutive identical labels while keeping endpoints
  const deduped = [];
  for (const tick of ticks) {
    if (
      deduped.length &&
      deduped[deduped.length - 1].label === tick.label &&
      tick.index !== last
    ) {
      continue;
    }
    deduped.push(tick);
  }
  return deduped;
}

export function TempChart({
  readings,
  unit = "F",
  width = 320,
  height = 72,
}) {
  if (!readings?.length) return null;

  const values = readings.map((r) => toDisplay(r.celsius, unit));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const showAxis = height > 120;
  const padX = showAxis ? 44 : 16;
  const padTop = showAxis ? 22 : 12;
  const padBottom = showAxis ? 36 : 12;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const xAt = (i) =>
    padX + (i / Math.max(values.length - 1, 1)) * plotW;
  const yAt = (v) => padTop + (1 - (v - min) / span) * plotH;

  const points = values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const timeTicks = showAxis ? pickTimeTicks(readings, 5) : [];

  const stroke = showAxis ? 3.5 : 2.5;
  const glow = showAxis ? 10 : 6;

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {showAxis && (
        <line
          x1={padX}
          y1={padTop + plotH}
          x2={padX + plotW}
          y2={padTop + plotH}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
        />
      )}
      <polyline
        fill="none"
        stroke="rgba(255,180,120,0.22)"
        strokeWidth={glow}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
      <polyline
        fill="none"
        stroke="rgba(255,106,26,0.95)"
        strokeWidth={stroke}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
      {showAxis && (
        <>
          <text x={8} y={padTop + 4} className="chart-label">
            {max.toFixed(0)}°{unit}
          </text>
          <text x={8} y={padTop + plotH} className="chart-label">
            {min.toFixed(0)}°{unit}
          </text>
          {timeTicks.map((tick) => (
            <text
              key={`${tick.index}-${tick.label}`}
              x={xAt(tick.index)}
              y={height - 10}
              textAnchor="middle"
              className="chart-label"
            >
              {tick.label}
            </text>
          ))}
        </>
      )}
    </svg>
  );
}
