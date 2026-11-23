import type { AppStatus } from "../catalog";

const LABELS: Record<AppStatus, string> = {
  live: "Available",
  beta: "Beta",
  coming_soon: "Coming soon",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{LABELS[status as AppStatus] ?? status}</span>;
}
