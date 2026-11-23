/** Minimal daily bar chart (SVG), no chart library. */
export function BarChart({
  points,
  label,
}: {
  points: { day: string; value: number | null }[];
  label: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  const width = 600;
  const height = 120;
  const gap = 2;
  const barWidth = points.length ? width / points.length - gap : 0;
  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
      >
        {points.map((point, i) => {
          const h = ((point.value ?? 0) / max) * (height - 4);
          return (
            <rect
              key={point.day}
              x={i * (barWidth + gap)}
              y={height - h}
              width={Math.max(barWidth, 1)}
              height={h}
              rx={1}
            >
              <title>{`${point.day}: ${point.value ?? "no data"}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="muted">
        <span>{points[0]?.day}</span>
        <span>
          {label} · max {max.toLocaleString()}
        </span>
        <span>{points.at(-1)?.day}</span>
      </figcaption>
    </figure>
  );
}
