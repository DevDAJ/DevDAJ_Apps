import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { ChartFrame, SERIES, shortDate } from "@/components/charts/core";
import { StatTile } from "@/components/charts/figures";
import { LineChart } from "@/components/charts/LineChart";
import { RankedBars } from "@/components/charts/RankedBars";
import { StackedColumns } from "@/components/charts/StackedColumns";
import {
  contributorStats,
  dailyCounts,
  datasetGrowth,
  median,
  reviewHours,
  weeklyOutcomes,
} from "@/lib/dashboard/analytics";
import { useDashboard } from "@/lib/dashboard/store";
import { OUTCOME_SERIES } from "./AdminOverview";
import {
  DatasetChip,
  formatHours,
  PageHeader,
  relativeTime,
  SectionTitle,
  StatusPlate,
} from "./ui";

export function MaintainerOverview() {
  const {
    me,
    contributions,
    items,
    datasets,
    people,
    nowDate: now,
    dataset,
    person,
  } = useDashboard();
  const mine = useMemo(
    () => contributions.filter((c) => me.maintains.includes(c.dataset)),
    [contributions, me],
  );
  const myDatasets = datasets.filter((d) => me.maintains.includes(d.id));
  const pending = mine
    .filter((c) => c.status === "pending")
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const myReviews = contributions.filter(
    (c) =>
      c.reviewedBy === me.id &&
      c.reviewedAt &&
      now.getTime() - Date.parse(c.reviewedAt) < 30 * 86_400_000,
  );
  const peerWaiting = items.filter(
    (it) => it.peerCheck?.status === "awaiting" && it.addedBy !== me.id,
  );
  const myAdds = items.filter((it) => it.addedBy === me.id && it.peerCheck);
  const weekly = weeklyOutcomes(mine, now, 12);
  const growth = datasetGrowth(
    items.filter((it) => me.maintains.includes(it.dataset)),
    myDatasets,
    now,
    12,
  );
  const top = contributorStats(mine, people, 30, now).slice(0, 6);
  const oldest = pending[0];

  return (
    <>
      <PageHeader
        title={`Hi, ${me.name.split(" ")[0]}`}
        lede={
          <>
            You look after{" "}
            {myDatasets.map((d, i) => (
              <span key={d.id}>
                {i > 0 && " and "}
                <DatasetChip dataset={d} className="align-middle font-semibold text-foreground" />
              </span>
            ))}
            . Approve contributor requests, add items yourself, and check what other maintainers
            add.
          </>
        }
        action={
          <Link
            to="/dashboard/review"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-line-cobalt px-5 font-bold text-background no-underline hover:bg-brand/90"
          >
            Open review <ArrowRight className="size-4" />
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Requests waiting"
          value={pending.length}
          hint={oldest ? `Oldest ${relativeTime(oldest.submittedAt, now)}` : "Queue is clear"}
          trend={dailyCounts(mine, now, 30)}
        />
        <StatTile
          label="Your reviews, 30 days"
          value={myReviews.length}
          hint={`Median ${formatHours(median(myReviews.map((c) => reviewHours(c) ?? 0)))} to decide`}
        />
        <StatTile
          label="Peer checks for you"
          value={peerWaiting.length}
          hint="Items other maintainers added"
        />
        <StatTile
          label="Your additions"
          value={myAdds.length}
          hint={`${myAdds.filter((it) => it.peerCheck?.status === "awaiting").length} awaiting a check`}
        />
      </div>

      <SectionTitle hint="Your datasets, last 12 weeks">Activity</SectionTitle>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Requests per week"
          subtitle="Contributor requests in your datasets"
          legend={OUTCOME_SERIES.map((s) => ({
            label: s.label,
            color: s.color,
            dashed: s.hatched,
          }))}
          table={{
            columns: ["Week of", ...OUTCOME_SERIES.map((s) => s.label)],
            rows: weekly.map((w) => [
              shortDate(w.start),
              ...OUTCOME_SERIES.map((s) => w.values[s.key]),
            ]),
          }}
        >
          <StackedColumns
            data={weekly.map((w) => ({ x: w.start, values: w.values }))}
            series={OUTCOME_SERIES}
            label="Requests per week"
            formatX={shortDate}
          />
        </ChartFrame>
        <ChartFrame
          title="Live items"
          subtitle="At the end of each week"
          legend={myDatasets.map((d) => ({
            label: d.name,
            color: SERIES[d.series - 1],
            shape: "line",
          }))}
        >
          <LineChart
            x={growth.map((g) => g.start)}
            series={myDatasets.map((d) => ({
              key: d.id,
              label: d.name,
              color: SERIES[d.series - 1],
              values: growth.map((g) => g.values[d.id]),
            }))}
            label="Live items per week"
            formatX={shortDate}
            area
          />
        </ChartFrame>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Oldest requests"
          subtitle="Review these first"
          action={
            <Link to="/dashboard/review" className="text-sm text-brand">
              All
            </Link>
          }
        >
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          ) : (
            <ul className="divide-y divide-border">
              {pending.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {c.kind === "edit" ? "Edit: " : ""}
                      {c.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dataset(c.dataset).name} · {person(c.submittedBy)?.name} ·{" "}
                      {relativeTime(c.submittedAt, now)}
                    </span>
                  </span>
                  <StatusPlate status="pending" />
                </li>
              ))}
            </ul>
          )}
        </ChartFrame>
        <ChartFrame
          title="Most active in your datasets"
          subtitle="Requests in the last 30 days; red is spam or unreliable"
        >
          <RankedBars
            rows={top.map((t) => ({
              key: t.person.id,
              label: t.person.name,
              value: t.total,
              part: {
                value: t.flagged,
                color: "var(--outcome-flagged)",
                label: "Spam or unreliable",
              },
            }))}
          />
        </ChartFrame>
      </div>
    </>
  );
}
