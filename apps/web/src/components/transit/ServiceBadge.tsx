import type { AppStatus } from "@/catalog";
import { cn } from "@/lib/utils";
import { SERVICE } from "./lines";

/** Service state as a pill: a solid dot for running lines, a dashed ring for planned ones. */
export function ServiceBadge({ status, className }: { status: AppStatus; className?: string }) {
  const service = SERVICE[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        service.planned
          ? "border-dashed border-foreground/25 text-muted-foreground"
          : "border-border bg-card text-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          service.planned
            ? "border border-dashed border-current"
            : "bg-[var(--brand)] shadow-[0_0_0_3px_color-mix(in_oklch,var(--brand)_20%,transparent)]",
        )}
      />
      {service.label}
    </span>
  );
}
