import { areaY, defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { ruleY } from "@tanstack/charts/rule";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import { useMemo } from "react";
import { CHART_CLASS, CHART_THEME, compact, GRID } from "./core";

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

interface Row {
  x: string;
  series: string;
  value: number;
}

/** Lines over a shared x axis (TanStack Charts `lineY`), grouped tooltip per x. */
export function LineChart({
  x,
  series,
  height = 220,
  label,
  formatX,
  formatY = compact,
  area = false,
  threshold,
  yMax,
}: {
  x: string[];
  series: LineSeries[];
  height?: number;
  label: string;
  formatX: (x: string) => string;
  formatY?: (v: number) => string;
  /** Soft wash under a single series. */
  area?: boolean;
  /** A reference value (e.g. a limit), drawn as a rule. Name it in the chart's legend. */
  threshold?: { value: number; label: string };
  yMax?: number;
}) {
  const definition = useMemo(() => {
    const rows: Row[] = series.flatMap((s) =>
      s.values.map((value, i) => ({ x: x[i], series: s.label, value })),
    );
    const labels = series.map((s) => s.label);
    const colorOf = new Map(series.map((s) => [s.label, s.color]));
    const wash = area && series.length === 1;
    return defineChart(
      {
        marks: [
          ...(wash
            ? [
                areaY(rows, {
                  x: "x",
                  y: "value",
                  fill: series[0].color,
                  fillOpacity: 0.1,
                }),
              ]
            : []),
          ...(threshold
            ? [
                ruleY([threshold.value], {
                  stroke: "var(--foreground)",
                  strokeOpacity: 0.45,
                  strokeWidth: 1,
                }),
              ]
            : []),
          lineY(rows, {
            x: "x",
            y: "value",
            z: "series",
            color: "series",
            stroke: (r) => colorOf.get(r.series) ?? "",
            strokeWidth: 2,
            lineCap: "round",
            lineJoin: "round",
          }),
        ],
        scales: {
          x: {
            scale: scalePoint,
            axis: {
              line: false,
              ticks: { size: 0, format: (v: string) => formatX(v) },
              tickLabels: { thin: true },
            },
          },
          y: {
            scale: yMax === undefined ? scaleLinear : scaleLinear([0, yMax], [0, 1]),
            nice: yMax === undefined,
            grid: GRID,
            axis: { line: false, ticks: { count: 4, size: 0, format: (v: number) => formatY(v) } },
          },
        },
        color: { domain: labels, range: series.map((s) => s.color) },
        theme: CHART_THEME,
        margin: { top: 8, right: 8 },
      },
      {
        focus: "group-x",
        tooltip: {
          use: tooltip,
          content: (points) => {
            const at = points[0]?.datum as Row | undefined;
            return {
              title: at ? formatX(at.x) : "",
              // The area wash and the line share rows; keep one per series.
              rows: [
                ...new Map(points.map((p) => [(p.datum as Row).series, p.datum as Row])).values(),
              ]
                .sort((a, b) => b.value - a.value)
                .map((r) => ({
                  label: r.series,
                  value: formatY(r.value),
                  color: colorOf.get(r.series),
                })),
            };
          },
        },
      },
    );
  }, [x, series, formatX, formatY, area, threshold, yMax]);

  return (
    <Chart definition={definition} ariaLabel={label} height={height} className={CHART_CLASS} />
  );
}
