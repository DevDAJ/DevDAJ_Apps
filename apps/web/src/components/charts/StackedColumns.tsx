import { barY, defineChart, stack } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { useMemo } from "react";
import { CHART_CLASS, CHART_THEME, compact, GRID } from "./core";

export interface ColumnSeries<K extends string> {
  key: K;
  label: string;
  color: string;
  /** Drawn as a dashed outline instead of solid: work still waiting (pending). */
  hatched?: boolean;
}

interface Row {
  x: string;
  series: string;
  value: number;
  hatched: boolean;
}

/** Stacked columns over time (TanStack Charts `barY`), grouped tooltip per column. */
export function StackedColumns<K extends string>({
  data,
  series,
  height = 220,
  label,
  formatX,
}: {
  data: { x: string; values: Record<K, number> }[];
  series: ColumnSeries<K>[];
  height?: number;
  label: string;
  formatX: (x: string) => string;
}) {
  const definition = useMemo(() => {
    // Zero-height segments still paint their outline, so leave them out.
    const rows: Row[] = data.flatMap((d) =>
      series
        .map((s) => ({
          x: d.x,
          series: s.label,
          value: d.values[s.key] ?? 0,
          hatched: !!s.hatched,
        }))
        .filter((r) => r.value > 0),
    );
    const labels = series.map((s) => s.label);
    const colorOf = new Map(series.map((s) => [s.label, s.color]));
    return defineChart(
      {
        marks: [
          barY(rows, {
            x: "x",
            y: "value",
            color: "series",
            layout: stack({ order: labels }),
            maxThickness: 24,
            inset: 2,
            radius: { end: 4, stack: "outer" },
            fill: (r) =>
              r.hatched ? "var(--outcome-pending-fill)" : (colorOf.get(r.series) ?? ""),
            stroke: (r) => (r.hatched ? "var(--outcome-pending)" : "var(--card)"),
            strokeWidth: 1.5,
            strokeDasharray: (r) => (r.hatched ? "3 2" : "none"),
          }),
        ],
        scales: {
          x: {
            // Explicit domain keeps empty weeks on the axis.
            scale: scaleBand(
              data.map((d) => d.x),
              [0, 1],
            ),
            axis: {
              line: false,
              ticks: { size: 0, format: (v: string) => formatX(v) },
              tickLabels: { thin: true },
            },
          },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: GRID,
            axis: { line: false, ticks: { count: 4, size: 0, format: (v: number) => compact(v) } },
          },
        },
        color: { domain: labels, range: series.map((s) => s.color) },
        theme: CHART_THEME,
        margin: { top: 8, right: 4 },
      },
      {
        focus: "group-x",
        tooltip: {
          use: tooltip,
          content: (points) => {
            const at = points[0]?.datum as Row | undefined;
            const total = points.reduce((sum, p) => sum + (p.datum as Row).value, 0);
            return {
              title: at ? formatX(at.x) : "",
              rows: [
                ...series.map((s) => {
                  const p = points.find((pt) => (pt.datum as Row).series === s.label);
                  return {
                    label: s.label,
                    value: String(p ? (p.datum as Row).value : 0),
                    color: s.color,
                  };
                }),
                { label: "Total", value: String(total) },
              ],
            };
          },
        },
      },
    );
  }, [data, series, formatX]);

  return (
    <Chart definition={definition} ariaLabel={label} height={height} className={CHART_CLASS} />
  );
}
