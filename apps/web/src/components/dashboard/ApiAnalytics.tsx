import { useMemo } from "react";
import { ChartFrame, pct, SERIES, shortDate } from "@/components/charts/core";
import { SegmentedBar, StatTile } from "@/components/charts/figures";
import { RankedBars } from "@/components/charts/RankedBars";
import { StackedColumns } from "@/components/charts/StackedColumns";
import {
  activeAt,
  dailyRequests,
  monthToDate,
  mrr,
  mrrByMonth,
  type PlanId,
  PLANS,
  planOf,
  usd,
} from "@/lib/dashboard/api";
import { useDashboard } from "@/lib/dashboard/store";
import { cn } from "@/lib/utils";
import { PageHeader, relativeTime, SectionTitle, StatusPlate } from "./ui";

const DAY = 86_400_000;
/** Plans are ordered tiers, so they take ordered steps of one hue (cobalt), light to dark. */
const PLAN_COLOR: Record<PlanId, string> = {
  starter: "oklch(0.84 0.07 262)",
  growth: "oklch(0.7 0.13 262)",
  scale: "oklch(0.56 0.16 262)",
};
const monthLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short" });

/** Admin: who pays for the API, how much they call it, and what it earns. */
export function ApiAnalytics() {
  const { api, datasets, nowDate: now } = useDashboard();
  const t = now.getTime();
  const subs = api.subscriptions;
  const active = subs.filter((s) => activeAt(s, t));

  const stats = useMemo(() => {
    const daily = dailyRequests(api.usage, now, 60);
    const sum = (rows: typeof daily) =>
      rows.reduce((s, d) => s + Object.values(d.values).reduce((a, b) => a + b, 0), 0);
    const last30 = daily.slice(30);
    const prev30 = daily.slice(0, 30);
    const limited = last30.reduce((s, d) => s + d.limited, 0);
    return {
      daily: last30,
      requests: sum(last30),
      requestsPrev: sum(prev30),
      limitedRate: limited / Math.max(1, sum(last30) + limited),
      spark: last30.map((d) => Object.values(d.values).reduce((a, b) => a + b, 0)),
    };
  }, [api.usage, now]);

  const months = useMemo(() => mrrByMonth(subs, now, 6), [subs, now]);
  const revenue = mrr(subs, t);
  const revenuePrev = mrr(subs, t - 30 * DAY);
  const churned = subs.filter(
    (s) => s.cancelledAt && t - Date.parse(s.cancelledAt) < 90 * DAY,
  ).length;
  const newSubs = subs.filter((s) => t - Date.parse(s.startedAt) < 30 * DAY).length;

  const customers = useMemo(
    () =>
      subs
        .map((s) => {
          const ids = new Set(
            api.tokens.filter((tk) => tk.subscriptionId === s.id).map((tk) => tk.id),
          );
          const since30 = new Date(t - 30 * DAY).toISOString().slice(0, 10);
          let requests = 0;
          let limited = 0;
          for (const u of api.usage) {
            if (!ids.has(u.tokenId) || u.day < since30) continue;
            requests += u.requests;
            limited += u.limited;
          }
          const mtd = monthToDate(api.usage, ids, now);
          return { s, requests, limited, mtd, tokens: ids.size };
        })
        .sort((a, b) => b.requests - a.requests),
    [subs, api.tokens, api.usage, now, t],
  );

  const series = datasets.map((d) => ({ key: d.id, label: d.name, color: SERIES[d.series - 1] }));
  const planSeries = PLANS.map((p) => ({ key: p.id, label: p.name, color: PLAN_COLOR[p.id] }));

  return (
    <>
      <PageHeader
        title="API revenue and usage"
        lede="Developers pay a monthly plan to use the dataset in their own apps. DevDAJ apps and the dashboard read it for free."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          className="col-span-2 md:col-span-1 xl:col-span-2"
          label="Monthly recurring revenue"
          value={usd(revenue)}
          delta={{ value: revenue - revenuePrev, label: "vs 30 days ago", format: usd }}
        />
        <StatTile
          className="col-span-2 md:col-span-1 xl:col-span-2"
          label="Requests, last 30 days"
          value={stats.requests.toLocaleString()}
          delta={{ value: stats.requests - stats.requestsPrev, label: "vs previous 30 days" }}
          trend={stats.spark}
        />
        <StatTile
          label="Paying developers"
          value={active.length}
          hint={`${newSubs} new in 30 days`}
        />
        <StatTile label="Cancelled, 90 days" value={churned} />
        <StatTile
          label="Average per developer"
          value={usd(active.length ? revenue / active.length : 0)}
          hint="per month"
        />
        <StatTile
          label="Refused (429)"
          value={pct(stats.limitedRate, 2)}
          hint="of calls, last 30 days"
        />
      </div>

      <SectionTitle hint="Last 6 months">Revenue</SectionTitle>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <ChartFrame
          title="Monthly recurring revenue"
          subtitle="At the end of each month, by plan (USD)"
          legend={planSeries.map((p) => ({ label: p.label, color: p.color }))}
          table={{
            columns: ["Month", ...planSeries.map((p) => p.label), "Total"],
            rows: months.map((m) => [
              monthLabel(m.start),
              ...planSeries.map((p) => usd(m.values[p.key])),
              usd(Object.values(m.values).reduce((a, b) => a + b, 0)),
            ]),
          }}
        >
          <StackedColumns
            data={months.map((m) => ({ x: m.start, values: m.values }))}
            series={planSeries}
            label="Monthly recurring revenue by plan"
            formatX={monthLabel}
          />
        </ChartFrame>
        <ChartFrame title="Plan mix" subtitle={`${active.length} paying developers`}>
          <SegmentedBar
            label="Paying developers by plan"
            segments={PLANS.map((p) => ({
              key: p.id,
              label: p.name,
              value: active.filter((s) => s.plan === p.id).length,
              color: PLAN_COLOR[p.id],
              ink: p.id === "scale" ? "light" : "dark",
            }))}
          />
          <ul className="mt-5 flex flex-col gap-2 text-sm">
            {PLANS.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  {p.name} · {usd(p.price)}
                </span>
                <span className="font-semibold tabular-nums">
                  {usd(active.filter((s) => s.plan === p.id).length * p.price)}/mo
                </span>
              </li>
            ))}
          </ul>
        </ChartFrame>
      </div>

      <SectionTitle hint="Last 30 days">Usage</SectionTitle>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <ChartFrame
          title="API requests per day"
          subtitle="Paid calls only, by dataset"
          legend={series.map((s) => ({ label: s.label, color: s.color }))}
          table={{
            columns: ["Day", ...series.map((s) => s.label), "Refused"],
            rows: stats.daily.map((d) => [
              shortDate(d.day),
              ...series.map((s) => d.values[s.key]),
              d.limited,
            ]),
          }}
        >
          <StackedColumns
            data={stats.daily.map((d) => ({ x: d.day, values: d.values }))}
            series={series}
            label="API requests per day by dataset"
            formatX={shortDate}
          />
        </ChartFrame>
        <ChartFrame title="Top developers" subtitle="Requests; red is the part refused (429)">
          <RankedBars
            label="Top developers by requests"
            rows={customers.slice(0, 7).map((c) => ({
              key: c.s.id,
              label: c.s.ownerName,
              value: c.requests + c.limited,
              display: compactNum(c.requests + c.limited),
              hint: `${planOf(c.s.plan).name} · ${c.s.app}`,
              part: { value: c.limited, color: "var(--outcome-flagged)", label: "Refused" },
            }))}
          />
        </ChartFrame>
      </div>

      <SectionTitle hint={`${subs.length} all time`}>Developers</SectionTitle>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <table className="m-0 w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Developer</th>
              <th className="px-4 py-2.5 font-semibold">Plan</th>
              <th className="px-4 py-2.5 font-semibold">This month</th>
              <th className="px-4 py-2.5 font-semibold">Tokens</th>
              <th className="px-4 py-2.5 font-semibold">Since</th>
              <th className="px-4 py-2.5 font-semibold">State</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(({ s, mtd, tokens }) => {
              const plan = planOf(s.plan);
              const share = mtd.requests / plan.quota;
              return (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 whitespace-normal">
                    <span className="font-semibold">{s.ownerName}</span>
                    <span className="block text-xs text-muted-foreground">{s.app}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {plan.name} <span className="text-muted-foreground">{usd(plan.price)}</span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {mtd.requests.toLocaleString()}{" "}
                    <span
                      className={cn(
                        "text-xs",
                        share >= 0.8 ? "font-semibold text-brand" : "text-muted-foreground",
                      )}
                    >
                      {pct(share)} of quota
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{tokens}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {relativeTime(s.startedAt, now)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPlate status={s.cancelledAt ? "cancelled" : "active"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString();
}
