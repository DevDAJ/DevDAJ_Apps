import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ChartFrame, pct, shortDate } from "@/components/charts/core";
import { Meter, StatTile } from "@/components/charts/figures";
import { StackedColumns } from "@/components/charts/StackedColumns";
import { weeklyOutcomes } from "@/lib/dashboard/analytics";
import {
  MAX_FLAGGED_RATE,
  maintainerEligibility,
  MIN_CONTRIBUTIONS,
  WINDOW_DAYS,
} from "@/lib/dashboard/rules";
import { useDashboard } from "@/lib/dashboard/store";
import type { ContributionStatus, DatasetId } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";
import { OUTCOME_SERIES } from "./AdminOverview";
import {
  buttonClass,
  DatasetChip,
  fieldClass,
  PageHeader,
  relativeTime,
  SectionTitle,
  StatusPlate,
} from "./ui";

const FILTERS: { id: "all" | ContributionStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Waiting" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "spam", label: "Spam" },
  { id: "unreliable", label: "Unreliable" },
];

export function ContributorOverview() {
  const {
    me,
    contributions,
    applications,
    datasets,
    nowDate: now,
    dataset,
    person,
    apply,
  } = useDashboard();
  const mine = useMemo(
    () => contributions.filter((c) => c.submittedBy === me.id),
    [contributions, me.id],
  );
  const e = maintainerEligibility(mine, now);
  const application = applications.find((a) => a.personId === me.id && a.status !== "declined");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const shown = filter === "all" ? mine : mine.filter((c) => c.status === filter);
  const weekly = weeklyOutcomes(mine, now, 12);
  const approved = mine.filter((c) => c.status === "approved").length;
  const reviewed = mine.filter((c) => c.status !== "pending").length;

  return (
    <>
      <PageHeader
        title="Your contributions"
        lede="Every request goes to the maintainer of that dataset. Approved ones go live for everyone."
        action={
          <Link
            to="/dashboard/dataset"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-line-cobalt px-5 font-bold text-background no-underline hover:bg-brand/90"
          >
            Suggest an item <ArrowRight className="size-4" />
          </Link>
        }
      />

      <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-semibold tracking-tight">Become a maintainer</h2>
            <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
              Maintainers approve requests and add items directly. To apply you need{" "}
              {MIN_CONTRIBUTIONS} contributions in the last {WINDOW_DAYS} days, with no more than{" "}
              {pct(MAX_FLAGGED_RATE)} of your reviewed contributions marked spam or unreliable.
            </p>
          </div>
          {application ? (
            <StatusPlate status={application.status === "approved" ? "approved" : "pending"} />
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
          <Requirement
            ok={e.enoughContributions}
            title="Contributions in the last 30 days"
            value={`${e.inWindow} of ${MIN_CONTRIBUTIONS}`}
            detail={
              e.enoughContributions
                ? "Enough for this month."
                : `${MIN_CONTRIBUTIONS - e.inWindow} more to go. Contributions older than ${WINDOW_DAYS} days drop out.`
            }
          >
            <Meter
              value={e.inWindow}
              max={MIN_CONTRIBUTIONS}
              tone={e.enoughContributions ? "done" : "ok"}
              label="Contributions in the last 30 days"
            />
          </Requirement>
          <Requirement
            ok={e.reliable}
            title="Marked spam or unreliable"
            value={`${pct(e.flaggedRate, 1)} · ${e.flagged} of ${e.reviewed}`}
            detail={
              e.reliable
                ? "Within the 10% limit."
                : "Above the 10% limit. Approved contributions bring it down."
            }
          >
            <Meter
              value={e.flaggedRate}
              max={0.2}
              tone={e.reliable ? (e.flaggedRate > MAX_FLAGGED_RATE * 0.7 ? "warn" : "ok") : "bad"}
              marker={{ at: MAX_FLAGGED_RATE, label: "10% limit" }}
              label="Share marked spam or unreliable"
            />
          </Requirement>
        </div>

        {application ? (
          <p className="mt-8 text-sm text-muted-foreground">
            {application.status === "approved"
              ? "Your application was approved."
              : `You applied to maintain ${dataset(application.dataset).name} ${relativeTime(application.submittedAt, now)}. An admin will decide.`}
          </p>
        ) : (
          <ApplyForm
            eligible={e.eligible}
            datasets={datasets.map((d) => d.id)}
            onApply={(ds, motivation) =>
              apply(ds, motivation, {
                contributionsInWindow: e.inWindow,
                flaggedRate: e.flaggedRate,
              })
            }
          />
        )}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Submitted, all time" value={mine.length} />
        <StatTile label="Approved" value={approved} />
        <StatTile label="Waiting" value={mine.filter((c) => c.status === "pending").length} />
        <StatTile label="Approval rate" value={reviewed ? pct(approved / reviewed) : "–"} />
      </div>

      <div className="mt-4">
        <ChartFrame
          title="Your requests per week"
          subtitle="Last 12 weeks"
          legend={OUTCOME_SERIES.map((s) => ({
            label: s.label,
            color: s.color,
            dashed: s.hatched,
          }))}
        >
          <StackedColumns
            data={weekly.map((w) => ({ x: w.start, values: w.values }))}
            series={OUTCOME_SERIES}
            label="Your requests per week"
            formatX={shortDate}
            height={180}
          />
        </ChartFrame>
      </div>

      <SectionTitle hint={`${shown.length} shown`}>History</SectionTitle>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "h-8 cursor-pointer rounded-full border px-3 text-sm font-semibold",
              filter === f.id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground/80 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="border-t border-border">
        {shown.slice(0, 40).map((c) => (
          <li
            key={c.id}
            className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-border py-3"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {c.kind === "edit" ? "Edit: " : "New: "}
                {c.title}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <DatasetChip dataset={dataset(c.dataset)} className="text-xs" />·{" "}
                {relativeTime(c.submittedAt, now)}
                {c.reviewedBy && <>· reviewed by {person(c.reviewedBy)?.name}</>}
              </span>
              {c.note && c.status !== "approved" && (
                <span className="mt-1 block text-sm text-muted-foreground">“{c.note}”</span>
              )}
            </span>
            <StatusPlate status={c.status} />
          </li>
        ))}
        {shown.length === 0 && (
          <li className="py-6 text-sm text-muted-foreground">Nothing here.</li>
        )}
      </ul>
    </>
  );
}

function Requirement({
  ok,
  title,
  value,
  detail,
  children,
}: {
  ok: boolean;
  title: string;
  value: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <span
            className={cn(
              "inline-flex size-5 items-center justify-center rounded-full",
              ok
                ? "bg-foreground text-background"
                : "border border-dashed border-foreground/50 text-foreground/60",
            )}
          >
            {ok ? <Check className="size-3.5" /> : <X className="size-3" />}
          </span>
          {title}
        </span>
        <span className="text-sm font-bold tabular-nums">{value}</span>
      </div>
      {children}
      <span className="mt-4 text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

function ApplyForm({
  eligible,
  datasets,
  onApply,
}: {
  eligible: boolean;
  datasets: DatasetId[];
  onApply: (dataset: DatasetId, motivation: string) => void;
}) {
  const { dataset } = useDashboard();
  const [ds, setDs] = useState<DatasetId>(datasets[0]);
  const [motivation, setMotivation] = useState("");
  return (
    <form
      className="mt-8 grid grid-cols-1 gap-3 border-t border-border pt-6 sm:grid-cols-[12rem_1fr_auto] sm:items-end"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (eligible && motivation.trim()) onApply(ds, motivation.trim());
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Dataset
        <select
          className={fieldClass}
          value={ds}
          onChange={(ev) => setDs(ev.target.value as DatasetId)}
          disabled={!eligible}
        >
          {datasets.map((id) => (
            <option key={id} value={id}>
              {dataset(id).name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Why you
        <input
          className={fieldClass}
          placeholder="What you know about this dataset"
          value={motivation}
          maxLength={300}
          onChange={(ev) => setMotivation(ev.target.value)}
          disabled={!eligible}
        />
      </label>
      <button
        type="submit"
        disabled={!eligible || !motivation.trim()}
        className={cn(buttonClass, "h-10 bg-foreground text-background hover:bg-foreground/85")}
      >
        Apply
      </button>
      {!eligible && (
        <p className="text-xs text-muted-foreground sm:col-span-3">
          Applications open once both requirements are met.
        </p>
      )}
    </form>
  );
}
