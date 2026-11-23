import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SERIES } from "@/components/charts/core";
import type { ContributionStatus, DatasetInfo } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  lede,
  action,
}: {
  title: string;
  lede?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="m-0 text-[1.875rem] leading-tight font-semibold tracking-[-0.025em]">
          {title}
        </h1>
        {lede && <p className="mt-1 max-w-[60ch] text-muted-foreground">{lede}</p>}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mt-10 mb-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-6">
      <h2 className="m-0 text-xl font-semibold tracking-tight">{children}</h2>
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function NotForRole() {
  return (
    <div className="rounded-2xl border border-border p-6">
      <p className="font-semibold">This page isn't part of this role's dashboard.</p>
      <Link to="/dashboard" className="mt-2 inline-block text-sm text-brand">
        Back to the overview
      </Link>
    </div>
  );
}

/** Dataset name with its series swatch. */
export function DatasetChip({ dataset, className }: { dataset: DatasetInfo; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm whitespace-nowrap", className)}>
      <span
        aria-hidden
        className="size-2.5 rounded-[3px]"
        style={{ background: SERIES[dataset.series - 1] }}
      />
      {dataset.name}
    </span>
  );
}

const PLATE: Record<
  ContributionStatus | "awaiting" | "confirmed" | "flagged" | "active" | "cancelled",
  { label: string; className: string }
> = {
  pending: {
    label: "Waiting",
    className: "border border-dashed border-foreground/50 text-foreground/85",
  },
  awaiting: {
    label: "Awaiting check",
    className: "border border-dashed border-foreground/50 text-foreground/85",
  },
  approved: { label: "Approved", className: "bg-foreground text-background" },
  confirmed: { label: "Checked", className: "bg-foreground text-background" },
  rejected: { label: "Rejected", className: "bg-muted text-foreground/85" },
  spam: { label: "Spam", className: "bg-destructive text-background" },
  unreliable: { label: "Unreliable", className: "bg-destructive text-background" },
  flagged: { label: "Flagged", className: "bg-destructive text-background" },
  active: { label: "Paying", className: "bg-foreground text-background" },
  cancelled: { label: "Cancelled", className: "bg-muted text-foreground/85" },
};

/** Service plate for a review state (24px, uppercase label). */
export function StatusPlate({ status }: { status: keyof typeof PLATE }) {
  const plate = PLATE[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-[0.3rem] px-2 text-[0.7rem] font-bold tracking-[0.025em] whitespace-nowrap uppercase",
        plate.className,
      )}
    >
      {plate.label}
    </span>
  );
}

export function relativeTime(iso: string, now: Date): string {
  const minutes = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export const formatHours = (h: number) =>
  h < 1 ? "<1 h" : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} d`;

export const fieldClass =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-foreground/40";
export const buttonClass =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
