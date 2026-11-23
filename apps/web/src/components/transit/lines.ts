import type { AppStatus, LineColor } from "@/catalog";

/** CSS colour for each line ink (tokens live in app.css). */
export const LINE_INK: Record<LineColor | "cobalt" | "porcelain", string> = {
  scarlet: "var(--line-scarlet)",
  amber: "var(--line-amber)",
  green: "var(--line-green)",
  cobalt: "var(--line-cobalt)",
  porcelain: "var(--foreground)",
};

/** Service state in the network's own words. */
export const SERVICE: Record<AppStatus, { label: string; planned: boolean }> = {
  live: { label: "In service", planned: false },
  beta: { label: "Trial service", planned: false },
  coming_soon: { label: "Under construction", planned: true },
};
