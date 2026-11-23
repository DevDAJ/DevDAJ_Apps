import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Database, Gauge, Inbox, KeyRound, Users } from "lucide-react";
import type { ComponentType } from "react";
import { DashboardProvider, useDashboard } from "@/lib/dashboard/store";
import type { Role } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Dashboard · Apps by DevDAJ" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <DashboardProvider>
      <DashboardLayout />
    </DashboardProvider>
  ),
});

const ROLES: { id: Role; label: string }[] = [
  { id: "admin", label: "Admin" },
  { id: "maintainer", label: "Maintainer" },
  { id: "contributor", label: "Contributor" },
];

type NavTo =
  | "/dashboard"
  | "/dashboard/dataset"
  | "/dashboard/review"
  | "/dashboard/people"
  | "/dashboard/api";

const NAV: {
  to: NavTo;
  label: string;
  icon: ComponentType<{ className?: string }>;
  roles: Role[];
}[] = [
  {
    to: "/dashboard",
    label: "Overview",
    icon: Gauge,
    roles: ["admin", "maintainer", "contributor"],
  },
  {
    to: "/dashboard/dataset",
    label: "Dataset",
    icon: Database,
    roles: ["admin", "maintainer", "contributor"],
  },
  { to: "/dashboard/review", label: "Review", icon: Inbox, roles: ["admin", "maintainer"] },
  { to: "/dashboard/people", label: "People", icon: Users, roles: ["admin"] },
  {
    to: "/dashboard/api",
    label: "API",
    icon: KeyRound,
    roles: ["admin", "maintainer", "contributor"],
  },
];

function DashboardLayout() {
  const { role, setRole, me, contributions, items, dataset } = useDashboard();
  const pending = contributions.filter(
    (c) => c.status === "pending" && (role === "admin" || me.maintains.includes(c.dataset)),
  ).length;
  const awaiting = items.filter(
    (it) => it.peerCheck?.status === "awaiting" && it.addedBy !== me.id && role !== "contributor",
  ).length;

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-6 pb-24 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-foreground/35 px-4 py-3 text-sm">
        <p className="text-muted-foreground">
          <span className="mr-2 inline-flex h-6 items-center rounded-[0.3rem] border border-dashed border-foreground/45 px-2 text-[0.7rem] font-bold tracking-[0.025em] text-foreground/80 uppercase">
            Preview
          </span>
          Illustrative data, not the database. Changes reset on reload.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">View as</span>
          <div
            role="radiogroup"
            aria-label="View the dashboard as"
            className="flex rounded-full border border-border p-0.5"
          >
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={role === r.id}
                onClick={() => setRole(r.id)}
                className={cn(
                  "h-8 cursor-pointer rounded-full px-3 text-sm font-semibold transition-colors",
                  role === r.id
                    ? "bg-foreground text-background"
                    : "text-foreground/80 hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[13rem_1fr]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <div className="hidden lg:block">
            <div className="text-lg leading-tight font-semibold tracking-tight">{me.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {role === "maintainer"
                ? `Maintains ${me.maintains.map((d) => dataset(d).name).join(", ")}`
                : role === "admin"
                  ? "Everything, every dataset"
                  : "Suggests items for review"}
            </div>
          </div>
          <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 lg:mx-0 lg:flex-col lg:border-0 lg:px-0">
            {NAV.filter((n) => n.roles.includes(role)).map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: true }}
                className="flex shrink-0 items-center gap-2.5 border-b-2 border-transparent px-2 py-2.5 text-sm font-semibold text-foreground/75 no-underline hover:text-foreground data-[status=active]:border-brand data-[status=active]:text-foreground lg:rounded-md lg:border-b-0 lg:data-[status=active]:bg-muted"
              >
                <Icon className="size-4" />
                {label}
                {to === "/dashboard/review" && pending + awaiting > 0 && (
                  <span className="ml-auto rounded-full bg-foreground px-1.5 text-[11px] leading-5 font-bold text-background tabular-nums">
                    {pending + awaiting}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
