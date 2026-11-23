import { describe, expect, test } from "vite-plus/test";
import { type ApiSubscription, type ApiUsageDay, monthToDate, mrr, mrrByMonth } from "./api";

const NOW = new Date("2026-11-20T12:00:00Z");
const sub = (
  plan: ApiSubscription["plan"],
  started: string,
  cancelled: string | null = null,
): ApiSubscription => ({
  id: `${plan}-${started}`,
  ownerId: "o",
  ownerName: "o",
  app: "a",
  plan,
  startedAt: started,
  cancelledAt: cancelled,
  renewsAt: started,
});

describe("api revenue", () => {
  const subs = [
    sub("starter", "2026-08-01T00:00:00Z"),
    sub("growth", "2026-10-15T00:00:00Z"),
    sub("scale", "2026-09-01T00:00:00Z", "2026-11-01T00:00:00Z"),
  ];

  test("mrr counts only subscriptions active at that moment", () => {
    expect(mrr(subs, NOW.getTime())).toBe(9 + 29);
    expect(mrr(subs, Date.parse("2026-10-20T00:00:00Z"))).toBe(9 + 29 + 99);
  });

  test("mrrByMonth splits by plan at each month end", () => {
    const months = mrrByMonth(subs, NOW, 3);
    expect(months.map((m) => m.values)).toEqual([
      { starter: 9, growth: 0, scale: 99 },
      { starter: 9, growth: 29, scale: 99 },
      { starter: 9, growth: 29, scale: 0 },
    ]);
  });
});

test("monthToDate sums only this month's usage for the given tokens", () => {
  const usage: ApiUsageDay[] = [
    { tokenId: "a", day: "2026-11-02", dataset: "gyms", requests: 100, limited: 2 },
    { tokenId: "a", day: "2026-10-31", dataset: "gyms", requests: 500, limited: 0 },
    { tokenId: "b", day: "2026-11-03", dataset: "foods", requests: 40, limited: 0 },
  ];
  expect(monthToDate(usage, new Set(["a"]), NOW)).toEqual({ requests: 100, limited: 2 });
});
