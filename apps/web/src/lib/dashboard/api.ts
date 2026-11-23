/**
 * Paid API access to the public dataset. DevDAJ apps read the dataset for free; anyone building
 * their own app buys a monthly plan and calls the API with a token. Preview data only: no payment
 * provider, and the dataset endpoints do not check tokens yet.
 */
import type { DatasetId } from "./types";

export type PlanId = "starter" | "growth" | "scale";

export interface ApiPlan {
  id: PlanId;
  name: string;
  /** USD per month (placeholder pricing). */
  price: number;
  /** Requests included per calendar month. */
  quota: number;
  /** Requests per second per token. */
  rateLimit: number;
  maxTokens: number;
  blurb: string;
}

export const PLANS: ApiPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 9,
    quota: 50_000,
    rateLimit: 10,
    maxTokens: 2,
    blurb: "A side project or a small app.",
  },
  {
    id: "growth",
    name: "Growth",
    price: 29,
    quota: 500_000,
    rateLimit: 50,
    maxTokens: 5,
    blurb: "An app with real users.",
  },
  {
    id: "scale",
    name: "Scale",
    price: 99,
    quota: 5_000_000,
    rateLimit: 200,
    maxTokens: 20,
    blurb: "Heavy traffic or several apps.",
  },
];

export const planOf = (id: PlanId) => PLANS.find((p) => p.id === id)!;

export interface ApiSubscription {
  id: string;
  /** A dashboard person, or an outside developer account. */
  ownerId: string;
  ownerName: string;
  /** What they are building, as they described it. */
  app: string;
  plan: PlanId;
  startedAt: string;
  cancelledAt: string | null;
  /** End of the current paid month. */
  renewsAt: string;
}

export interface ApiToken {
  id: string;
  subscriptionId: string;
  name: string;
  /** Only the prefix and last four characters are kept after creation. */
  prefix: string;
  last4: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ApiUsageDay {
  tokenId: string;
  day: string;
  dataset: DatasetId;
  requests: number;
  /** Requests refused for going over the rate limit or the monthly quota (HTTP 429). */
  limited: number;
}

export interface ApiData {
  subscriptions: ApiSubscription[];
  tokens: ApiToken[];
  usage: ApiUsageDay[];
}

const DAY = 86_400_000;
const USAGE_DAYS = 60;
const DATASET_IDS: DatasetId[] = ["gyms", "exercises", "merchants", "foods"];

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS: {
  name: string;
  app: string;
  plan: PlanId;
  ageDays: number;
  cancelled?: number;
}[] = [
  { name: "Liftlog Studio", app: "Gym check-in app", plan: "scale", ageDays: 170 },
  { name: "Kopi & Code", app: "Café budgeting bot", plan: "growth", ageDays: 150 },
  { name: "PJ Runners Club", app: "Club website", plan: "starter", ageDays: 140 },
  { name: "NutriScan", app: "Meal planner", plan: "growth", ageDays: 120 },
  { name: "Coach Hub", app: "Personal trainer CRM", plan: "growth", ageDays: 95 },
  { name: "Spendwise", app: "Expense tracker", plan: "starter", ageDays: 80, cancelled: 25 },
  { name: "Gym Finder MY", app: "Gym directory", plan: "scale", ageDays: 60 },
  { name: "Ari Tan", app: "Student project", plan: "starter", ageDays: 45 },
  { name: "Fitlab", app: "Workout generator", plan: "growth", ageDays: 30 },
  { name: "Pantry Pal", app: "Recipe app", plan: "starter", ageDays: 12 },
];

/** Typical share of calls per dataset, by what the customer is building. */
function mixFor(app: string): Record<DatasetId, number> {
  if (/expense|budget/i.test(app)) return { gyms: 0, exercises: 0, merchants: 0.9, foods: 0.1 };
  if (/meal|recipe/i.test(app)) return { gyms: 0, exercises: 0.05, merchants: 0.05, foods: 0.9 };
  if (/workout|trainer/i.test(app))
    return { gyms: 0.25, exercises: 0.7, merchants: 0, foods: 0.05 };
  return { gyms: 0.75, exercises: 0.2, merchants: 0, foods: 0.05 };
}

/** Busy days per plan, as a share of the plan's monthly quota. */
const LOAD: Record<PlanId, number> = { starter: 0.6, growth: 0.45, scale: 0.35 };

export function createMockApiData(today: Date, maintainerId: string): ApiData {
  const rand = rng(990);
  const t = today.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();
  const subscriptions: ApiSubscription[] = [];
  const tokens: ApiToken[] = [];
  const usage: ApiUsageDay[] = [];

  const all = [
    ...CUSTOMERS.map((c, i) => ({ ...c, ownerId: `x-${i + 1}` })),
    // The previewed maintainer also builds an app on the API.
    {
      name: "Mei Lin",
      app: "Climbing gym map",
      plan: "starter" as PlanId,
      ageDays: 40,
      ownerId: maintainerId,
    },
  ];

  all.forEach((c, i) => {
    const started = t - c.ageDays * DAY;
    const cancelledAt = "cancelled" in c && c.cancelled ? t - c.cancelled * DAY : null;
    const sub: ApiSubscription = {
      id: `s-${i + 1}`,
      ownerId: c.ownerId,
      ownerName: c.name,
      app: c.app,
      plan: c.plan,
      startedAt: iso(started),
      cancelledAt: cancelledAt ? iso(cancelledAt) : null,
      renewsAt: iso(t + (((c.ageDays % 30) + 30) % 30 || 30) * DAY),
    };
    subscriptions.push(sub);

    const plan = planOf(c.plan);
    const tokenCount = Math.min(
      plan.maxTokens,
      c.plan === "scale" ? 3 : c.plan === "growth" ? 2 : 1,
    );
    const mix = mixFor(c.app);
    for (let k = 0; k < tokenCount; k++) {
      const token: ApiToken = {
        id: `t-${i + 1}-${k + 1}`,
        subscriptionId: sub.id,
        name: k === 0 ? "Production" : k === 1 ? "Staging" : `Worker ${k}`,
        prefix: "ddk_live",
        last4: Math.floor(rand() * 0xffff)
          .toString(16)
          .padStart(4, "0"),
        createdAt: iso(started + k * 3 * DAY),
        lastUsedAt: null,
        revokedAt: null,
      };
      const share = k === 0 ? 0.8 : 0.2 / (tokenCount - 1);
      const dailyBase = ((plan.quota * LOAD[c.plan]) / 30) * share;
      for (let d = USAGE_DAYS - 1; d >= 0; d--) {
        const dayMs = t - d * DAY;
        if (dayMs < Date.parse(token.createdAt) || (cancelledAt && dayMs > cancelledAt)) continue;
        const ramp = Math.min(1, (dayMs - started) / (21 * DAY) + 0.25);
        const weekday = new Date(dayMs).getDay();
        const wave = weekday === 0 || weekday === 6 ? 1.25 : 1;
        const total = Math.round(dailyBase * ramp * wave * (0.7 + rand() * 0.6));
        const spike = c.plan === "starter" && rand() < 0.08;
        for (const ds of DATASET_IDS) {
          const requests = Math.round(total * mix[ds]);
          if (requests === 0) continue;
          usage.push({
            tokenId: token.id,
            day: iso(dayMs).slice(0, 10),
            dataset: ds,
            requests,
            limited: spike
              ? Math.round(requests * 0.06)
              : rand() < 0.1
                ? Math.round(rand() * 4)
                : 0,
          });
        }
        token.lastUsedAt = iso(dayMs - rand() * 6 * 3_600_000);
      }
      tokens.push(token);
    }
  });

  return { subscriptions, tokens, usage };
}

/** Active on a given time: started and not yet cancelled. */
export const activeAt = (s: ApiSubscription, time: number) =>
  Date.parse(s.startedAt) <= time && (!s.cancelledAt || Date.parse(s.cancelledAt) > time);

/** Monthly recurring revenue at a moment. */
export function mrr(subscriptions: ApiSubscription[], time: number): number {
  return subscriptions
    .filter((s) => activeAt(s, time))
    .reduce((sum, s) => sum + planOf(s.plan).price, 0);
}

/** MRR at the end of each of the last `months` months, split by plan. */
export function mrrByMonth(subscriptions: ApiSubscription[], now: Date, months: number) {
  return Array.from({ length: months }, (_, i) => {
    const end = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i) + 1, 0, 23, 59);
    const at = Math.min(end.getTime(), now.getTime());
    const values = { starter: 0, growth: 0, scale: 0 } as Record<PlanId, number>;
    for (const s of subscriptions) if (activeAt(s, at)) values[s.plan] += planOf(s.plan).price;
    return { start: new Date(end.getFullYear(), end.getMonth(), 1).toISOString(), values };
  });
}

/** Requests per day by dataset over the last `days` days. */
export function dailyRequests(usage: ApiUsageDay[], now: Date, days: number) {
  const keys = Array.from({ length: days }, (_, i) =>
    new Date(now.getTime() - (days - 1 - i) * DAY).toISOString().slice(0, 10),
  );
  const index = new Map(keys.map((k, i) => [k, i]));
  const rows = keys.map((day) => ({
    day,
    values: { gyms: 0, exercises: 0, merchants: 0, foods: 0 } as Record<DatasetId, number>,
    limited: 0,
  }));
  for (const u of usage) {
    const i = index.get(u.day);
    if (i === undefined) continue;
    rows[i].values[u.dataset] += u.requests;
    rows[i].limited += u.limited;
  }
  return rows;
}

/** Requests in the current calendar month, for a set of tokens. */
export function monthToDate(usage: ApiUsageDay[], tokenIds: Set<string>, now: Date) {
  const month = now.toISOString().slice(0, 7);
  let requests = 0;
  let limited = 0;
  for (const u of usage) {
    if (!tokenIds.has(u.tokenId) || !u.day.startsWith(month)) continue;
    requests += u.requests;
    limited += u.limited;
  }
  return { requests, limited };
}

export function usd(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** A preview token: looks real, is not accepted anywhere. */
export function newTokenSecret(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  return `ddk_live_${body}`;
}
