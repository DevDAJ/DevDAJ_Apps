/** Pure aggregations behind the dashboard charts. Each takes plain arrays, so the source can change. */
import {
  type Contribution,
  type DatasetId,
  type DatasetInfo,
  type DatasetItem,
  FLAGGED,
  type Person,
} from "./types";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const dayKey = (iso: string | number | Date) => new Date(iso).toISOString().slice(0, 10);

function startOfWeek(time: number): number {
  const d = new Date(time);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.getTime();
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type Outcome = "approved" | "rejected" | "flagged" | "pending";
export const OUTCOMES: Outcome[] = ["approved", "rejected", "flagged", "pending"];

export function outcomeOf(c: Contribution): Outcome {
  if (FLAGGED.includes(c.status)) return "flagged";
  return c.status as Outcome;
}

export interface Bucket<K extends string> {
  /** ISO date of the bucket's first day. */
  start: string;
  values: Record<K, number>;
}

/** Contributions per week, split by how they were decided. */
export function weeklyOutcomes(
  contributions: Contribution[],
  now: Date,
  weeks: number,
): Bucket<Outcome>[] {
  const first = startOfWeek(now.getTime()) - (weeks - 1) * 7 * DAY;
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    start: dayKey(first + i * 7 * DAY),
    values: { approved: 0, rejected: 0, flagged: 0, pending: 0 },
  }));
  for (const c of contributions) {
    const i = Math.floor((Date.parse(c.submittedAt) - first) / (7 * DAY));
    if (i >= 0 && i < weeks) buckets[i].values[outcomeOf(c)]++;
  }
  return buckets;
}

/** Contributions per day (any status) for sparklines. */
export function dailyCounts(contributions: Contribution[], now: Date, days: number): number[] {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  const counts = Array.from({ length: days }, () => 0);
  for (const c of contributions) {
    const i = days - 1 - Math.floor((end.getTime() - Date.parse(c.submittedAt)) / DAY);
    if (i >= 0 && i < days) counts[i]++;
  }
  return counts;
}

/** Live items per dataset at the end of each week. */
export function datasetGrowth(
  items: DatasetItem[],
  datasets: DatasetInfo[],
  now: Date,
  weeks: number,
): { start: string; values: Record<DatasetId, number> }[] {
  const first = startOfWeek(now.getTime()) - (weeks - 1) * 7 * DAY;
  return Array.from({ length: weeks }, (_, i) => {
    const end = Math.min(first + (i + 1) * 7 * DAY, now.getTime());
    const values = Object.fromEntries(datasets.map((d) => [d.id, 0])) as Record<DatasetId, number>;
    for (const item of items) if (Date.parse(item.addedAt) <= end) values[item.dataset]++;
    return { start: dayKey(first + i * 7 * DAY), values };
  });
}

export const QUEUE_AGES = ["Under 1 day", "1–3 days", "3–7 days", "Over a week"] as const;

/** Pending contributions by how long they have waited. */
export function queueAge(
  contributions: Contribution[],
  now: Date,
): Record<(typeof QUEUE_AGES)[number], number> {
  const result = Object.fromEntries(QUEUE_AGES.map((k) => [k, 0])) as Record<
    (typeof QUEUE_AGES)[number],
    number
  >;
  for (const c of contributions) {
    if (c.status !== "pending") continue;
    const days = (now.getTime() - Date.parse(c.submittedAt)) / DAY;
    result[QUEUE_AGES[days < 1 ? 0 : days < 3 ? 1 : days < 7 ? 2 : 3]]++;
  }
  return result;
}

/** Hours from submission to decision. */
export function reviewHours(c: Contribution): number | null {
  return c.reviewedAt ? (Date.parse(c.reviewedAt) - Date.parse(c.submittedAt)) / HOUR : null;
}

export interface ReviewerStats {
  person: Person;
  reviewed: number;
  medianHours: number;
  flagged: number;
}

export function reviewerStats(
  contributions: Contribution[],
  people: Person[],
  sinceDays: number,
  now: Date,
): ReviewerStats[] {
  const since = now.getTime() - sinceDays * DAY;
  return people
    .filter((p) => p.role === "maintainer")
    .map((person) => {
      const mine = contributions.filter(
        (c) => c.reviewedBy === person.id && c.reviewedAt && Date.parse(c.reviewedAt) > since,
      );
      return {
        person,
        reviewed: mine.length,
        medianHours: median(mine.map((c) => reviewHours(c) ?? 0)),
        flagged: mine.filter((c) => FLAGGED.includes(c.status)).length,
      };
    })
    .sort((a, b) => b.reviewed - a.reviewed);
}

export interface ContributorStats {
  person: Person;
  total: number;
  approved: number;
  flagged: number;
  flaggedRate: number;
}

export function contributorStats(
  contributions: Contribution[],
  people: Person[],
  sinceDays: number,
  now: Date,
): ContributorStats[] {
  const since = now.getTime() - sinceDays * DAY;
  const byId = new Map(people.map((p) => [p.id, p]));
  const map = new Map<string, ContributorStats>();
  for (const c of contributions) {
    if (Date.parse(c.submittedAt) <= since) continue;
    const person = byId.get(c.submittedBy);
    if (!person) continue;
    const s = map.get(person.id) ?? { person, total: 0, approved: 0, flagged: 0, flaggedRate: 0 };
    s.total++;
    if (c.status === "approved") s.approved++;
    if (FLAGGED.includes(c.status)) s.flagged++;
    map.set(person.id, s);
  }
  return [...map.values()]
    .map((s) => {
      const reviewed = contributions.filter(
        (c) =>
          c.submittedBy === s.person.id &&
          c.status !== "pending" &&
          Date.parse(c.submittedAt) > since,
      ).length;
      return { ...s, flaggedRate: reviewed ? s.flagged / reviewed : 0 };
    })
    .sort((a, b) => b.total - a.total);
}

/** Share of decided contributions marked spam or unreliable, per week. */
export function weeklyFlaggedRate(contributions: Contribution[], now: Date, weeks: number) {
  return weeklyOutcomes(contributions, now, weeks).map((b) => {
    const decided = b.values.approved + b.values.rejected + b.values.flagged;
    return { start: b.start, value: decided ? b.values.flagged / decided : 0 };
  });
}

/** Submissions by weekday (Mon first) and hour, local time. */
export function activityGrid(
  contributions: Contribution[],
  now: Date,
  sinceDays: number,
): number[][] {
  const since = now.getTime() - sinceDays * DAY;
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const c of contributions) {
    const t = Date.parse(c.submittedAt);
    if (t <= since) continue;
    const d = new Date(t);
    grid[(d.getDay() + 6) % 7][d.getHours()]++;
  }
  return grid;
}

export function countBy<T, K extends string>(list: T[], key: (item: T) => K): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const item of list) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

export function inLastDays<T extends { submittedAt: string }>(
  list: T[],
  now: Date,
  days: number,
  offsetDays = 0,
): T[] {
  const end = now.getTime() - offsetDays * DAY;
  const start = end - days * DAY;
  return list.filter((c) => {
    const t = Date.parse(c.submittedAt);
    return t > start && t <= end;
  });
}
