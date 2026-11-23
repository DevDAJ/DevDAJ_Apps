import { createFileRoute } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ChartFrame, pct } from "@/components/charts/core";
import { SegmentedBar } from "@/components/charts/figures";
import {
  buttonClass,
  DatasetChip,
  fieldClass,
  NotForRole,
  PageHeader,
  relativeTime,
  SectionTitle,
  StatusPlate,
} from "@/components/dashboard/ui";
import { MAX_FLAGGED_RATE, maintainerEligibility, MIN_CONTRIBUTIONS } from "@/lib/dashboard/rules";
import { useDashboard } from "@/lib/dashboard/store";
import type { Role } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/people")({ component: PeoplePage });

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  maintainer: "Maintainer",
  contributor: "Contributor",
};

function PeoplePage() {
  const {
    role,
    people,
    contributions,
    applications,
    nowDate: now,
    person,
    dataset,
    decideApplication,
  } = useDashboard();
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const rows = useMemo(
    () =>
      people
        .map((p) => ({
          p,
          e: maintainerEligibility(
            contributions.filter((c) => c.submittedBy === p.id),
            now,
          ),
        }))
        .filter(({ p }) => roleFilter === "all" || p.role === roleFilter)
        .sort((a, b) => b.e.inWindow - a.e.inWindow),
    [people, contributions, now, roleFilter],
  );
  if (role !== "admin") return <NotForRole />;

  const count = (r: Role) => people.filter((p) => p.role === r).length;
  const pending = applications.filter((a) => a.status === "pending");
  const past = applications.filter((a) => a.status !== "pending");

  return (
    <>
      <PageHeader
        title="People"
        lede="Who maintains what, who is close to maintaining, and applications waiting for you."
      />

      <ChartFrame
        title="Roles"
        subtitle={`${people.length} people with a DevDAJ account in the dataset programme`}
      >
        <SegmentedBar
          label="People by role"
          segments={[
            {
              key: "contributor",
              label: "Contributors",
              value: count("contributor"),
              color: "var(--line-cobalt)",
            },
            {
              key: "maintainer",
              label: "Maintainers",
              value: count("maintainer"),
              color: "var(--foreground)",
            },
            { key: "admin", label: "Admins", value: count("admin"), color: "var(--line-amber)" },
          ]}
        />
      </ChartFrame>

      <SectionTitle hint={`${pending.length} waiting`}>Maintainer applications</SectionTitle>
      {pending.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
          No applications waiting.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((a) => {
            const p = person(a.personId);
            const live = maintainerEligibility(
              contributions.filter((c) => c.submittedBy === a.personId),
              now,
            );
            return (
              <article
                key={a.id}
                className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">{p?.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      Wants to maintain{" "}
                      <DatasetChip
                        dataset={dataset(a.dataset)}
                        className="text-xs font-semibold text-foreground"
                      />{" "}
                      · applied {relativeTime(a.submittedAt, now)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => decideApplication(a.id, "approved")}
                      className={cn(
                        buttonClass,
                        "bg-foreground text-background hover:bg-foreground/85",
                      )}
                    >
                      <Check className="size-4" /> Make maintainer
                    </button>
                    <button
                      type="button"
                      onClick={() => decideApplication(a.id, "declined")}
                      className={cn(
                        buttonClass,
                        "border border-border text-foreground hover:bg-muted",
                      )}
                    >
                      <X className="size-4" /> Decline
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-sm">“{a.motivation}”</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Fact
                    label="At application"
                    value={`${a.snapshot.contributionsInWindow} in 30 days`}
                  />
                  <Fact label="Flagged then" value={pct(a.snapshot.flaggedRate)} />
                  <Fact
                    label="Now"
                    value={`${live.inWindow} in 30 days`}
                    warn={!live.enoughContributions}
                  />
                  <Fact label="Flagged now" value={pct(live.flaggedRate)} warn={!live.reliable} />
                </dl>
              </article>
            );
          })}
        </div>
      )}
      {past.length > 0 && (
        <ul className="mt-4 border-t border-border">
          {past.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 border-b border-border py-2.5 text-sm"
            >
              <span>
                <span className="font-semibold">{person(a.personId)?.name}</span>{" "}
                <span className="text-muted-foreground">
                  for {dataset(a.dataset).name} · {relativeTime(a.submittedAt, now)}
                </span>
              </span>
              <StatusPlate status={a.status === "approved" ? "approved" : "rejected"} />
            </li>
          ))}
        </ul>
      )}

      <SectionTitle
        hint={
          <select
            aria-label="Role"
            className={cn(fieldClass, "h-9 w-auto")}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
          >
            <option value="all">Everyone</option>
            <option value="maintainer">Maintainers</option>
            <option value="contributor">Contributors</option>
            <option value="admin">Admins</option>
          </select>
        }
      >
        Everyone
      </SectionTitle>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <table className="m-0 w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Name</th>
              <th className="px-4 py-2.5 font-semibold">Role</th>
              <th className="px-4 py-2.5 font-semibold">Last 30 days</th>
              <th className="px-4 py-2.5 font-semibold">Flagged</th>
              <th className="px-4 py-2.5 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, e }) => (
              <tr key={p.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 font-semibold">{p.name}</td>
                <td className="px-4 py-2.5">
                  {ROLE_LABEL[p.role]}
                  {p.maintains.length > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      {p.maintains.map((d) => dataset(d).name).join(", ")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 tabular-nums">
                  {e.inWindow}
                  {p.role === "contributor" && (
                    <span className="text-muted-foreground"> / {MIN_CONTRIBUTIONS}</span>
                  )}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 tabular-nums",
                    e.flaggedRate > MAX_FLAGGED_RATE && "font-semibold text-destructive",
                  )}
                >
                  {e.reviewed ? pct(e.flaggedRate) : "–"}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {relativeTime(p.joinedAt, now)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Fact({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("font-semibold tabular-nums", warn && "text-destructive")}>{value}</dd>
    </div>
  );
}
