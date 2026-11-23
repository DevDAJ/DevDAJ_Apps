/** Figures: stat tile, sparkline, meter, segmented bar, heatmap. Plots use TanStack Charts. */
import { barX, cell, defineChart, dot, lineY, stack } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { text } from "@tanstack/charts/text";
import { tooltip } from "@tanstack/charts/tooltip";
import { type ReactNode, useMemo } from "react";
import { cn } from "@/lib/utils";
import { CHART_CLASS, CHART_THEME, Legend, type LegendEntry, pct } from "./core";

/** 30-point trend in the de-emphasis ink, current value as an accent dot. No guides, no focus. */
export function Sparkline({
  values,
  color = "var(--series-2)",
}: {
  values: number[];
  color?: string;
}) {
  const definition = useMemo(() => {
    const rows = values.map((value, i) => ({ i, value }));
    return defineChart(
      {
        marks: [
          lineY(rows, { x: "i", y: "value", stroke: "var(--chart-muted)", strokeWidth: 1.5 }),
          dot(rows.slice(-1), { x: "i", y: "value", fill: color, r: 3 }),
        ],
        scales: { x: { scale: scaleLinear }, y: { scale: scaleLinear } },
        guides: false,
        theme: CHART_THEME,
        margin: 4,
      },
      { pointer: false, keyboard: false, tooltip: false, focusRing: false },
    );
  }, [values, color]);
  return (
    <div aria-hidden>
      <Chart definition={definition} ariaLabel="Trend" height={28} className={CHART_CLASS} />
    </div>
  );
}

/**
 * Stat tile: label, value, optional delta vs a named period, optional 30-point sparkline.
 * `goodWhenUp` decides whether a rise reads as good (porcelain) or bad (signal red).
 */
export function StatTile({
  label,
  value,
  delta,
  trend,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: { value: number; label: string; goodWhenUp?: boolean; format?: (v: number) => string };
  trend?: number[];
  hint?: ReactNode;
  className?: string;
}) {
  const good = delta ? delta.value >= 0 === (delta.goodWhenUp ?? true) : true;
  const sign = delta && delta.value > 0 ? "+" : delta && delta.value < 0 ? "−" : "±";
  const abs = delta ? Math.abs(delta.value) : 0;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] p-4",
        className,
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-[1.75rem] leading-tight font-semibold tracking-tight [font-variant-numeric:proportional-nums]">
        {value}
      </span>
      {delta && (
        <span className="text-xs text-muted-foreground">
          <span className={cn("font-semibold", good ? "text-foreground" : "text-destructive")}>
            {sign}
            {delta.format ? delta.format(abs) : abs.toLocaleString()}
          </span>{" "}
          {delta.label}
        </span>
      )}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {trend && (
        <div className="mt-1">
          <Sparkline values={trend} />
        </div>
      )}
    </div>
  );
}

/**
 * Progress toward a goal. `tone` carries state: ok (cobalt), warn (amber), bad (signal red).
 * An optional marker draws a limit on the track.
 */
export function Meter({
  value,
  max,
  tone = "ok",
  marker,
  label,
}: {
  value: number;
  max: number;
  tone?: "ok" | "warn" | "bad" | "done";
  marker?: { at: number; label: string };
  label: string;
}) {
  const fill =
    tone === "bad"
      ? "var(--outcome-flagged)"
      : tone === "warn"
        ? "var(--line-amber)"
        : tone === "done"
          ? "var(--foreground)"
          : "var(--line-cobalt)";
  const share = Math.min(1, Math.max(0, value / max));
  return (
    <div
      className="relative pt-1"
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--chart-track)" }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${share * 100}%`, background: fill }}
        />
      </div>
      {marker && (
        <div
          className="absolute top-0 h-4 w-0.5 bg-foreground"
          style={{ left: `calc(${(marker.at / max) * 100}% - 1px)` }}
        >
          <span className="absolute top-4 left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap text-muted-foreground">
            {marker.label}
          </span>
        </div>
      )}
    </div>
  );
}

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Text inside the fill: dark on light fills (default), light on dark ones. */
  ink?: "dark" | "light";
  hatched?: boolean;
}

/** One whole split into parts: tall 28px blocks with share printed inside where it fits. */

/** One whole split into parts: a 28px stacked bar with the share printed inside where it fits. */
export function SegmentedBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const definition = useMemo(() => {
    const visible = segments.filter((s) => s.value > 0);
    let start = 0;
    const labels = visible.flatMap((s) => {
      const at = start;
      start += s.value;
      return s.value / total > 0.09 && !s.hatched
        ? [{ ...s, at, share: pct(s.value / total) }]
        : [];
    });
    return defineChart(
      {
        marks: [
          barX(
            visible.map((s) => ({ ...s, row: "all" })),
            {
              x: "value",
              y: "row",
              z: "key",
              layout: stack({ order: visible.map((s) => s.key) }),
              fill: (s) => (s.hatched ? "var(--outcome-pending-fill)" : s.color),
              stroke: (s) => (s.hatched ? "var(--outcome-pending)" : "var(--card)"),
              strokeWidth: 2,
              strokeDasharray: (s) => (s.hatched ? "3 2" : "none"),
              radius: { end: 4, stack: "each" },
              inset: 0,
            },
          ),
          text(labels, {
            x: "at",
            y: () => "all",
            text: "share",
            anchor: "start",
            dx: 8,
            fontWeight: 700,
            fill: (s) => (s.ink === "light" ? "var(--foreground)" : "var(--background)"),
          }),
        ],
        scales: {
          x: { scale: scaleLinear([0, total], [0, 1]) },
          y: { scale: scaleBand },
        },
        guides: false,
        theme: CHART_THEME,
        margin: 0,
      },
      {
        tooltip: {
          use: tooltip,
          content: (points) => {
            const s = points[0]?.datum as Segment | undefined;
            return s
              ? {
                  rows: [
                    {
                      label: s.label,
                      value: `${s.value.toLocaleString()} (${pct(s.value / total)})`,
                      color: s.color,
                    },
                  ],
                }
              : { rows: [] };
          },
        },
      },
    );
  }, [segments, total]);

  return (
    <div className="flex flex-col gap-2">
      <Chart
        definition={definition}
        ariaLabel={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}
        height={28}
        className={CHART_CLASS}
      />
      <Legend
        entries={segments.map<LegendEntry>((s) => ({
          label: `${s.label} ${s.value.toLocaleString()}`,
          color: s.color,
          dashed: s.hatched,
        }))}
      />
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
/** Six ordered steps of cobalt; step 0 is "none". */
const RAMP = [
  "var(--chart-track)",
  "oklch(0.66 0.15 262 / 25%)",
  "oklch(0.66 0.15 262 / 42%)",
  "oklch(0.66 0.15 262 / 60%)",
  "oklch(0.66 0.15 262 / 80%)",
  "oklch(0.66 0.15 262)",
];
const STEPS = RAMP.map((_, i) => `s${i}`);

interface HeatCell {
  day: string;
  hour: string;
  value: number;
  step: string;
}

/** Weekday × hour counts (TanStack Charts `cell`), one hue in five steps. */
export function Heatmap({ grid, label }: { grid: number[][]; label: string }) {
  const definition = useMemo(() => {
    const max = Math.max(1, ...grid.flat());
    const rows: HeatCell[] = grid.flatMap((row, d) =>
      row.map((value, h) => ({
        day: DAYS[d],
        hour: HOURS[h],
        value,
        step: STEPS[value === 0 ? 0 : Math.max(1, Math.ceil((value / max) * 5))],
      })),
    );
    return defineChart(
      {
        marks: [cell(rows, { x: "hour", y: "day", color: "step", inset: 1, radius: 2 })],
        scales: {
          x: {
            scale: scaleBand(HOURS, [0, 1]),
            axis: {
              line: false,
              ticks: { size: 0, values: ["00", "06", "12", "18", "23"] },
            },
          },
          y: { scale: scaleBand(DAYS, [0, 1]), axis: { line: false, ticks: { size: 0 } } },
        },
        color: { domain: STEPS, range: RAMP },
        theme: CHART_THEME,
        margin: { top: 0, right: 0 },
      },
      {
        tooltip: {
          use: tooltip,
          content: (points) => {
            const c = points[0]?.datum as HeatCell | undefined;
            return c
              ? {
                  title: `${c.day} ${c.hour}:00`,
                  rows: [{ label: "Submitted", value: String(c.value) }],
                }
              : { rows: [] };
          },
        },
      },
    );
  }, [grid]);

  return (
    <div>
      <Chart definition={definition} ariaLabel={label} height={200} className={CHART_CLASS} />
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        Fewer
        {RAMP.slice(1).map((c) => (
          <span key={c} className="size-2.5 rounded-[2px]" style={{ background: c }} />
        ))}
        More
      </div>
    </div>
  );
}
