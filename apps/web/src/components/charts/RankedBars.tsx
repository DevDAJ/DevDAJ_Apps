import { barX, defineChart, stack } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { text } from "@tanstack/charts/text";
import { tooltip } from "@tanstack/charts/tooltip";
import { useMemo } from "react";
import { CHART_CLASS, CHART_THEME } from "./core";

export interface RankedRow {
  key: string;
  label: string;
  value: number;
  /** Shown at the bar tip; defaults to the value. */
  display?: string;
  /** Secondary text, shown in the tooltip. */
  hint?: string;
  color?: string;
  /** Part of the bar drawn in another colour at its end (e.g. how much was flagged). */
  part?: { value: number; color: string; label: string };
}

interface Segment {
  label: string;
  part: "main" | "part";
  value: number;
  color: string;
  row: RankedRow;
}

/** Horizontal ranked bars (TanStack Charts `barX`), value at the tip, rows in the given order. */
export function RankedBars({
  rows,
  color = "var(--series-2)",
  label = "Ranked values",
}: {
  rows: RankedRow[];
  color?: string;
  label?: string;
}) {
  const definition = useMemo(() => {
    const segments: Segment[] = rows.flatMap((row) => {
      const part = row.part && row.part.value > 0 ? Math.min(row.part.value, row.value) : 0;
      const main: Segment = {
        label: row.label,
        part: "main",
        value: row.value - part,
        color: row.color ?? color,
        row,
      };
      return part
        ? [main, { label: row.label, part: "part", value: part, color: row.part!.color, row }]
        : [main];
    });
    return defineChart(
      {
        marks: [
          barX(segments, {
            x: "value",
            y: "label",
            z: "part",
            layout: stack({ order: ["main", "part"] }),
            fill: (s) => s.color,
            stroke: "var(--card)",
            strokeWidth: 1,
            maxThickness: 14,
            radius: { end: 4, stack: "outer" },
          }),
          text(rows, {
            x: "value",
            y: "label",
            text: (r) => r.display ?? r.value.toLocaleString(),
            anchor: "start",
            dx: 8,
            fill: "var(--foreground)",
            fontWeight: 600,
          }),
        ],
        scales: {
          x: { scale: scaleLinear, axis: false, nice: false },
          y: {
            scale: scaleBand(
              rows.map((r) => r.label),
              [0, 1],
            ),
            axis: {
              line: false,
              ticks: { size: 0, padding: 10 },
              tickLabels: { fontSize: 12, fontWeight: 600 },
            },
          },
        },
        theme: CHART_THEME,
        margin: { top: 0, right: 52, bottom: 0 },
      },
      {
        focus: "nearest-y",
        tooltip: {
          use: tooltip,
          content: (points) => {
            const row = (points[0]?.datum as Segment | undefined)?.row;
            if (!row) return { rows: [] };
            return {
              title: row.label,
              rows: [
                {
                  label: "Total",
                  value: row.display ?? row.value.toLocaleString(),
                  color: row.color ?? color,
                },
                ...(row.part
                  ? [
                      {
                        label: row.part.label,
                        value: String(row.part.value),
                        color: row.part.color,
                      },
                    ]
                  : []),
                ...(row.hint ? [{ label: row.hint, value: "" }] : []),
              ],
            };
          },
        },
      },
    );
  }, [rows, color]);

  return (
    <Chart
      definition={definition}
      ariaLabel={label}
      height={Math.max(60, rows.length * 32)}
      className={CHART_CLASS}
    />
  );
}
