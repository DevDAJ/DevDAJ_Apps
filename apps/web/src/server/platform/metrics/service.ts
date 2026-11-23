import { APPS } from "../../../catalog";
import { ApiError } from "../../shared/errors";
import { getSupabaseAdmin } from "../../shared/supabase";
import { appStoreConfig, daysBetween, fetchAppStoreMetrics } from "./app-store";
import { fetchGooglePlayMetrics, googlePlayConfig } from "./google-play";
import type { DailyMetric, Store } from "./types";

export const MAX_DAYS = 365;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** [today - days, yesterday] in UTC; stores never have today's numbers yet. */
export function dayRange(days: number, now = new Date()): { from: string; to: string } {
  const to = new Date(now.getTime() - 86_400_000);
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: isoDay(from), to: isoDay(to) };
}

function parseDays(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) {
    throw new ApiError(400, `days must be a whole number from 1 to ${MAX_DAYS}.`);
  }
  return n;
}

export function storeStatus() {
  return { google_play: googlePlayConfig() !== null, app_store: appStoreConfig() !== null };
}

/** Pulls numbers from every configured store and upserts them into `app_store_metrics`. */
export async function syncMetrics(body: unknown): Promise<{
  from: string;
  to: string;
  rows: number;
  /** "synced", "not_configured", or the error message. */
  stores: Record<Store, string>;
}> {
  const days = parseDays((body as { days?: unknown } | null)?.days, 30);
  const { from, to } = dayRange(days);
  const rows: DailyMetric[] = [];
  const stores: Record<Store, string> = {
    google_play: "not_configured",
    app_store: "not_configured",
  };

  const play = googlePlayConfig();
  const apps = APPS.filter((app) => app.status !== "coming_soon");
  const jobs: Promise<void>[] = [];
  if (play) {
    jobs.push(
      fetchGooglePlayMetrics(
        play,
        apps.filter((app) => app.stores.googlePlay),
        from,
        to,
      ).then(
        (result) => {
          rows.push(...result);
          stores.google_play = "synced";
        },
        (error: unknown) => {
          stores.google_play = error instanceof Error ? error.message : "failed";
        },
      ),
    );
  }
  const apple = appStoreConfig();
  if (apple) {
    jobs.push(
      fetchAppStoreMetrics(apple, apps, from, to).then(
        (result) => {
          rows.push(...result);
          stores.app_store = "synced";
        },
        (error: unknown) => {
          stores.app_store = error instanceof Error ? error.message : "failed";
        },
      ),
    );
  }
  await Promise.all(jobs);

  if (rows.length) {
    const syncedAt = new Date().toISOString();
    const { error } = await getSupabaseAdmin()
      .from("app_store_metrics")
      .upsert(
        rows.map((row) => ({ ...row, synced_at: syncedAt })),
        { onConflict: "app,store,day" },
      );
    if (error) throw error;
  }
  return { from, to, rows: rows.length, stores };
}

export interface AppMetrics {
  slug: string;
  name: string;
  status: string;
  downloads: number;
  /** Latest reported active devices (Google Play only for now). */
  activeDevices: number | null;
  byStore: Record<Store, { downloads: number; activeDevices: number | null }>;
  series: { day: string; downloads: number; activeDevices: number | null }[];
}

/** Dashboard data for the last `days` days, every catalog app, zero-filled. */
export async function getMetrics(query: { days?: string }): Promise<{
  from: string;
  to: string;
  configured: Record<Store, boolean>;
  lastSyncedAt: string | null;
  apps: AppMetrics[];
}> {
  const days = parseDays(query.days, 30);
  const { from, to } = dayRange(days);
  const { data, error } = await getSupabaseAdmin()
    .from("app_store_metrics")
    .select("app, store, day, downloads, active_devices, synced_at")
    .gte("day", from)
    .lte("day", to)
    .order("day", { ascending: true })
    .limit(10_000);
  if (error) throw error;
  const rows = data as (DailyMetric & { synced_at: string })[];
  const calendar = daysBetween(from, to);
  let lastSyncedAt: string | null = null;
  for (const row of rows)
    if (!lastSyncedAt || row.synced_at > lastSyncedAt) lastSyncedAt = row.synced_at;

  const apps = APPS.map((app): AppMetrics => {
    const mine = rows.filter((row) => row.app === app.slug);
    const byStore: AppMetrics["byStore"] = {
      google_play: { downloads: 0, activeDevices: null },
      app_store: { downloads: 0, activeDevices: null },
    };
    const perDay = new Map(
      calendar.map((day) => [day, { day, downloads: 0, activeDevices: null as number | null }]),
    );
    for (const row of mine) {
      const store = byStore[row.store];
      store.downloads += row.downloads ?? 0;
      if (row.active_devices !== null) store.activeDevices = row.active_devices; // rows are day-ascending
      const point = perDay.get(row.day);
      if (!point) continue;
      point.downloads += row.downloads ?? 0;
      if (row.active_devices !== null)
        point.activeDevices = (point.activeDevices ?? 0) + row.active_devices;
    }
    const actives = [byStore.google_play.activeDevices, byStore.app_store.activeDevices].filter(
      (value): value is number => value !== null,
    );
    return {
      slug: app.slug,
      name: app.name,
      status: app.status,
      downloads: byStore.google_play.downloads + byStore.app_store.downloads,
      activeDevices: actives.length ? actives.reduce((a, b) => a + b, 0) : null,
      byStore,
      series: [...perDay.values()],
    };
  });
  return { from, to, configured: storeStatus(), lastSyncedAt, apps };
}
