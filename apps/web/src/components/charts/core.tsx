/**
 * Shared chart pieces. Plots are drawn by TanStack Charts (`@tanstack/charts`); this file holds the
 * dashboard theme for it, plus the frame (title, legend, table view) every chart sits in.
 * Colours come from the `--series-*` and `--outcome-*` tokens in app.css.
 */
import type { ChartTheme } from "@tanstack/charts";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

/** Enamel theme for TanStack Charts: porcelain text, hairline grid, transparent ground. */
export const CHART_THEME: Partial<ChartTheme> = {
  foreground: "var(--foreground)",
  muted: "var(--muted-foreground)",
  grid: "var(--chart-grid)",
  background: "transparent",
  palette: SERIES,
  focusRing: { radius: 5, strokeWidth: 2, fill: "var(--card)" },
};

/** Recessive y grid shared by every Cartesian chart. */
export const GRID = { stroke: "var(--foreground)", strokeOpacity: 0.07, strokeWidth: 1 };

/** Class for the TanStack chart host: inherits muted text for axes and labels. */
export const CHART_CLASS = "dashboard-chart text-muted-foreground text-[11px]";

export function compact(value: number): string {
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}K`;
  return value.toLocaleString();
}

export const pct = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`;

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export interface LegendEntry {
  label: string;
  color: string;
  /** Pending / planned entries are drawn dashed, like planned lines on the map. */
  dashed?: boolean;
  shape?: "square" | "line";
}

export function Legend({ entries }: { entries: LegendEntry[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {entries.map((e) => (
        <li key={e.label} className="inline-flex items-center gap-1.5">
          <Swatch {...e} />
          {e.label}
        </li>
      ))}
    </ul>
  );
}

export function Swatch({ color, dashed, shape = "square" }: Omit<LegendEntry, "label">) {
  if (shape === "line")
    return (
      <span
        aria-hidden
        className="inline-block h-0.5 w-3.5 rounded-full"
        style={{ background: color }}
      />
    );
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 rounded-[3px]"
      style={dashed ? { border: `1.5px dashed ${color}` } : { background: color }}
    />
  );
}

export interface TableView {
  columns: string[];
  rows: (string | number)[][];
}

/** A titled chart card: title, optional subtitle and legend, the plot, and a table view. */
export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: LegendEntry[];
  table?: TableView;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] p-4 sm:p-5",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </header>
      {legend && legend.length > 1 && <Legend entries={legend} />}
      <div className="min-w-0">{children}</div>
      {table && (
        <details className="group text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground select-none hover:text-foreground">
            Show as table
          </summary>
          <div className="mt-2 max-h-64 overflow-auto">
            <table className="m-0 w-full text-xs tabular-nums">
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th
                      key={c}
                      className="border-b border-border py-1 pr-3 text-left font-semibold text-muted-foreground"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className="border-b border-border/50 py-1 pr-3">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
