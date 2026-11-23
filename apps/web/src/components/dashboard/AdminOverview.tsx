import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { ChartFrame, pct, SERIES, shortDate } from "@/components/charts/core";
import { Heatmap, SegmentedBar, StatTile } from "@/components/charts/figures";
import { LineChart } from "@/components/charts/LineChart";
import { RankedBars } from "@/components/charts/RankedBars";
import { type ColumnSeries, StackedColumns } from "@/components/charts/StackedColumns";
import {
  activityGrid,
  contributorStats,
  dailyCounts,
  datasetGrowth,
  inLastDays,
  median,
  type Outcome,
  QUEUE_AGES,
  queueAge,
  reviewerStats,
  reviewHours,
  weeklyFlaggedRate,
  weeklyOutcomes,
} from "@/lib/dashboard/analytics";
import { MAX_FLAGGED_RATE, maintainerEligibility, MIN_CONTRIBUTIONS } from "@/lib/dashboard/rules";
import { useDashboard } from "@/lib/dashboard/store";
import { FLAGGED } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";
import { formatHours, PageHeader, SectionTitle } from "./ui";

export const OUTCOME_SERIES: ColumnSeries<Outcome>[] = [
  { key: "approved", label: "Approved", color: "var(--outcome-approved)" },
  { key: "rejected", label: "Rejected", color: "var(--outcome-rejected)" },
  { key: "flagged", label: "Spam or unreliable", color: "var(--outcome-flagged)" },
  { key: "pending", label: "Waiting", color: "var(--outcome-pending)", hatched: true },
];

const RANGES = [
  { weeks: 8, label: "8 weeks" },
  { weeks: 12, label: "12 weeks" },
  { weeks: 16, label: "16 weeks" },
];

export function AdminOverview() {
  const {
    contributions,
    items,
    datasets,
    people,
    applications,
    nowDate: now,
    person,
  } = useDashboard();
  const [weeks, setWeeks] = useState(12);

  const stats = useMemo(() => {
    const last30 = inLastDays(contributions, now, 30);
    const prev30 = inLastDays(contributions, now, 30, 30);
    const decided = (list: typeof contributions) => list.filter((c) => c.status !== "pending");
    const rate = (list: typeof contributions, fn: (c: (typeof list)[number]) => boolean) => {
      const d = decided(list);
      return d.length ? d.filter(fn).length / d.length : 0;
    };
    const approval = rate(last30, (c) => c.status === "approved");
    const approvalPrev = rate(prev30, (c) => c.status === "approved");
    const flagged = rate(last30, (c) => FLAGGED.includes(c.status));
    const flaggedPrev = rate(prev30, (c) => FLAGGED.includes(c.status));
    const reviewTime = median(decided(last30).map((c) => reviewHours(c) ?? 0));
    const reviewTimePrev = median(decided(prev30).map((c) => reviewHours(c) ?? 0));
    const pending = contributions.filter((c) => c.status === "pending");
    const addedLast30 = items.filter(
      (it) => now.getTime() - Date.parse(it.addedAt) < 30 * 86_400_000,
    ).length;
    const activeContributors = new Set(last30.map((c) => c.submittedBy)).size;
    const activePrev = new Set(prev30.map((c) => c.submittedBy)).size;
    return {
      last30,
      prev30,
      approval,
      approvalPrev,
      flagged,
      flaggedPrev,
      reviewTime,
      reviewTimePrev,
      pending,
      addedLast30,
      activeContributors,
      activePrev,
    };
  }, [contributions, items, now]);

  const weekly = useMemo(
    () => weeklyOutcomes(contributions, now, weeks),
    [contributions, now, weeks],
  );
  const growth = useMemo(
    () => datasetGrowth(items, datasets, now, weeks),
    [items, datasets, now, weeks],
  );
  const flaggedWeekly = useMemo(
    () => weeklyFlaggedRate(contributions, now, weeks),
    [contributions, now, weeks],
  );
  const reviewers = useMemo(
    () => reviewerStats(contributions, people, 30, now),
    [contributions, people, now],
  );
  const top = useMemo(
    () => contributorStats(contributions, people, 30, now).slice(0, 8),
    [contributions, people, now],
  );
  const grid = useMemo(
    () => activityGrid(contributions, now, weeks * 7),
    [contributions, now, weeks],
  );
  const ages = queueAge(contributions, now);
  const spark = dailyCounts(contributions, now, 30);

  const pipeline = useMemo(
    () =>
      people
        .filter((p) => p.role === "contributor")
        .map((p) => ({
          person: p,
          e: maintainerEligibility(
            contributions.filter((c) => c.submittedBy === p.id),
            now,
          ),
        }))
        .filter((r) => r.e.inWindow >= MIN_CONTRIBUTIONS * 0.6)
        .sort((a, b) => b.e.inWindow - a.e.inWindow),
    [people, contributions, now],
  );

  const peer = {
    awaiting: items.filter((it) => it.peerCheck?.status === "awaiting").length,
    confirmed: items.filter(
      (it) =>
        it.peerCheck?.status === "confirmed" &&
        it.peerCheck.by &&
        now.getTime() - Date.parse(it.addedAt) < 90 * 86_400_000,
    ).length,
    flagged: items.filter((it) => it.peerCheck?.status === "flagged").length,
  };
  const pendingApps = applications.filter((a) => a.status === "pending").length;

  return (
    <>
      <PageHeader
        title="Network analytics"
        lede="How the public dataset is growing, how fast requests are reviewed, and who is doing the work."
        action={
          <div
            role="radiogroup"
            aria-label="Range"
            className="flex rounded-full border border-border p-0.5"
          >
            {RANGES.map((r) => (
              <button
                key={r.weeks}
                type="button"
                role="radio"
                aria-checked={weeks === r.weeks}
                onClick={() => setWeeks(r.weeks)}
                className={cn(
                  "h-8 cursor-pointer rounded-full px-3 text-sm font-semibold",
                  weeks === r.weeks
                    ? "bg-muted text-foreground"
                    : "text-foreground/70 hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          className="col-span-2 md:col-span-1 xl:col-span-2"
          label="Contributions, last 30 days"
          value={stats.last30.length.toLocaleString()}
          delta={{ value: stats.last30.length - stats.prev30.length, label: "vs previous 30 days" }}
          trend={spark}
        />
        <StatTile
          label="Live items"
          value={items.length.toLocaleString()}
          delta={{ value: stats.addedLast30, label: "in 30 days" }}
        />
        <StatTile
          label="Waiting for review"
          value={stats.pending.length}
          hint={`${ages["Over a week"]} older than a week`}
        />
        <StatTile
          label="Median review time"
          value={formatHours(stats.reviewTime)}
          delta={{
            value: stats.reviewTime - stats.reviewTimePrev,
            label: "vs previous",
            goodWhenUp: false,
            format: formatHours,
          }}
        />
        <StatTile
          label="Active contributors"
          value={stats.activeContributors}
          delta={{ value: stats.activeContributors - stats.activePrev, label: "vs previous" }}
        />
        <StatTile
          label="Approval rate"
          value={pct(stats.approval)}
          delta={{
            value: (stats.approval - stats.approvalPrev) * 100,
            label: "pts",
            format: (v) => v.toFixed(1),
          }}
        />
        <StatTile
          label="Spam or unreliable"
          value={pct(stats.flagged, 1)}
          delta={{
            value: (stats.flagged - stats.flaggedPrev) * 100,
            label: "pts",
            goodWhenUp: false,
            format: (v) => v.toFixed(1),
          }}
        />
        <StatTile
          label="Maintainers"
          value={people.filter((p) => p.role === "maintainer").length}
          hint={`${pendingApps} applications waiting`}
        />
        <StatTile
          label="Peer checks open"
          value={peer.awaiting}
          hint={`${peer.flagged} items flagged by peers`}
        />
      </div>

      <SectionTitle hint={`Last ${weeks} weeks, by week submitted`}>Contributions</SectionTitle>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <ChartFrame
          title="Contributions per week"
          subtitle="Split by how each request was decided"
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
            label="Contributions per week"
            formatX={shortDate}
          />
        </ChartFrame>
        <ChartFrame
          title="Spam or unreliable rate"
          subtitle="Share of decided requests, per week"
          legend={[
            { label: "Rate", color: "var(--outcome-flagged)", shape: "line" },
            { label: "10% maintainer limit", color: "var(--chart-axis)", shape: "line" },
          ]}
          table={{
            columns: ["Week of", "Rate"],
            rows: flaggedWeekly.map((w) => [shortDate(w.start), pct(w.value, 1)]),
          }}
        >
          <LineChart
            x={flaggedWeekly.map((w) => w.start)}
            series={[
              {
                key: "rate",
                label: "Rate",
                color: "var(--outcome-flagged)",
                values: flaggedWeekly.map((w) => w.value),
              },
            ]}
            label="Spam or unreliable rate per week"
            formatX={shortDate}
            formatY={(v) => pct(v)}
            yMax={0.2}
            area
            threshold={{ value: MAX_FLAGGED_RATE, label: "10% maintainer limit" }}
          />
        </ChartFrame>
      </div>

      <SectionTitle hint="Items live in the public dataset">Dataset</SectionTitle>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <ChartFrame
          title="Dataset growth"
          subtitle="Live items at the end of each week"
          legend={datasets.map((d) => ({
            label: d.name,
            color: SERIES[d.series - 1],
            shape: "line",
          }))}
          table={{
            columns: ["Week of", ...datasets.map((d) => d.name)],
            rows: growth.map((g) => [shortDate(g.start), ...datasets.map((d) => g.values[d.id])]),
          }}
        >
          <LineChart
            x={growth.map((g) => g.start)}
            series={datasets.map((d) => ({
              key: d.id,
              label: d.name,
              color: SERIES[d.series - 1],
              values: growth.map((g) => g.values[d.id]),
            }))}
            label="Dataset growth"
            formatX={shortDate}
          />
        </ChartFrame>
        <div className="flex flex-col gap-4">
          <ChartFrame
            title="Items by dataset"
            subtitle={`${items.length.toLocaleString()} live items`}
          >
            <SegmentedBar
              label="Items by dataset"
              segments={datasets.map((d) => ({
                key: d.id,
                label: d.name,
                value: items.filter((it) => it.dataset === d.id).length,
                color: SERIES[d.series - 1],
              }))}
            />
          </ChartFrame>
          <ChartFrame
            title="Maintainer additions"
            subtitle="Peer checks on items maintainers added, 90 days"
          >
            <SegmentedBar
              label="Peer checks"
              segments={[
                {
                  key: "confirmed",
                  label: "Checked",
                  value: peer.confirmed,
                  color: "var(--outcome-approved)",
                },
                {
                  key: "flagged",
                  label: "Flagged",
                  value: peer.flagged,
                  color: "var(--outcome-flagged)",
                },
                {
                  key: "awaiting",
                  label: "Awaiting",
                  value: peer.awaiting,
                  color: "var(--outcome-pending)",
                  hatched: true,
                },
              ]}
            />
          </ChartFrame>
        </div>
      </div>

      <SectionTitle hint="Maintainers, last 30 days">Review</SectionTitle>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Review queue"
          subtitle={`${stats.pending.length} requests waiting, by age`}
          table={{ columns: ["Waiting", "Requests"], rows: QUEUE_AGES.map((k) => [k, ages[k]]) }}
        >
          <div className="flex flex-col gap-5">
            <SegmentedBar
              label="Queue by age"
              segments={QUEUE_AGES.map((k, i) => ({
                key: k,
                label: k,
                value: ages[k],
                color: [
                  "oklch(0.86 0.06 262)",
                  "oklch(0.74 0.11 262)",
                  "oklch(0.62 0.15 262)",
                  "var(--outcome-flagged)",
                ][i],
                ink: "dark",
              }))}
            />
            <RankedBars
              rows={datasets.map((d) => ({
                key: d.id,
                label: d.name,
                value: stats.pending.filter((c) => c.dataset === d.id).length,
                color: SERIES[d.series - 1],
                hint: `${people.filter((p) => p.maintains.includes(d.id)).length} maintainers`,
              }))}
            />
          </div>
        </ChartFrame>
        <ChartFrame
          title="Reviews by maintainer"
          subtitle="Decisions made; median time to decide under each name"
          table={{
            columns: ["Maintainer", "Reviewed", "Median time", "Marked spam/unreliable"],
            rows: reviewers.map((r) => [
              r.person.name,
              r.reviewed,
              formatHours(r.medianHours),
              r.flagged,
            ]),
          }}
        >
          <RankedBars
            rows={reviewers.map((r) => ({
              key: r.person.id,
              label: r.person.name,
              hint: `median ${formatHours(r.medianHours)}`,
              value: r.reviewed,
              part: {
                value: r.flagged,
                color: "var(--outcome-flagged)",
                label: "Marked spam or unreliable",
              },
            }))}
          />
        </ChartFrame>
      </div>

      <SectionTitle hint="Last 30 days">Contributors</SectionTitle>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Top contributors"
          subtitle="Requests submitted; red is the part marked spam or unreliable"
          table={{
            columns: ["Contributor", "Submitted", "Approved", "Flagged", "Flagged rate"],
            rows: top.map((t) => [
              t.person.name,
              t.total,
              t.approved,
              t.flagged,
              pct(t.flaggedRate),
            ]),
          }}
        >
          <RankedBars
            rows={top.map((t) => ({
              key: t.person.id,
              label: t.person.name,
              hint: t.person.role === "maintainer" ? "Maintainer" : `${pct(t.flaggedRate)} flagged`,
              value: t.total,
              part: {
                value: t.flagged,
                color: "var(--outcome-flagged)",
                label: "Spam or unreliable",
              },
            }))}
          />
        </ChartFrame>
        <ChartFrame
          title="When people contribute"
          subtitle={`Submissions by weekday and hour, last ${weeks} weeks`}
        >
          <Heatmap grid={grid} label="Submissions by weekday and hour" />
        </ChartFrame>
      </div>

      <SectionTitle
        hint={
          <Link
            to="/dashboard/people"
            className="inline-flex items-center gap-1 text-brand no-underline"
          >
            Applications <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        Maintainer pipeline
      </SectionTitle>
      <ChartFrame
        title="Contributors nearing the bar"
        subtitle={`${MIN_CONTRIBUTIONS} contributions in 30 days and at most ${pct(MAX_FLAGGED_RATE)} marked spam or unreliable`}
      >
        {pipeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is close yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {pipeline.map(({ person: p, e }) => {
              const applied = applications.find(
                (a) => a.personId === p.id && a.status === "pending",
              );
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[12rem_1fr_7rem_8rem]"
                >
                  <span className="font-semibold">{person(p.id)?.name}</span>
                  <span className="order-last col-span-2 sm:order-none sm:col-span-1">
                    <span className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--chart-track)]">
                      <span
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(1, e.inWindow / MIN_CONTRIBUTIONS) * 100}%`,
                          background: e.enoughContributions
                            ? "var(--foreground)"
                            : "var(--line-cobalt)",
                        }}
                      />
                    </span>
                  </span>
                  <span className="text-sm tabular-nums">
                    {e.inWindow}/{MIN_CONTRIBUTIONS} ·{" "}
                    <span
                      className={
                        e.reliable ? "text-muted-foreground" : "font-semibold text-destructive"
                      }
                    >
                      {pct(e.flaggedRate)}
                    </span>
                  </span>
                  <span className="text-right text-sm text-muted-foreground">
                    {applied
                      ? "Applied"
                      : e.eligible
                        ? "Eligible"
                        : e.reliable
                          ? "Not yet"
                          : "Too many flags"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </ChartFrame>

      <Link
        to="/admin"
        className="mt-10 flex items-center justify-between gap-4 rounded-2xl border border-border p-5 text-foreground no-underline hover:bg-muted"
      >
        <span>
          <span className="block font-bold">Downloads and active devices</span>
          <span className="text-sm text-muted-foreground">
            Store metrics stay on the existing admin page (live data).
          </span>
        </span>
        <ArrowRight className="size-4" />
      </Link>
    </>
  );
}
