import type { AppEntry } from "../../../catalog";
import { signJwt } from "./jwt";
import type { DailyMetric } from "./types";

/**
 * App Store Connect Sales and Trends: one gzipped TSV per day for the whole vendor account.
 * Downloads are first-time units (product types 1, 1F, 1T, F1, 1E, 1EP, 1EU). Daily active
 * devices need the Analytics Reports API and are not collected yet (`active_devices: null`).
 */
export interface AppStoreConfig {
  issuerId: string;
  keyId: string;
  privateKey: string;
  vendorNumber: string;
}

const DOWNLOAD_TYPES = new Set(["1", "1F", "1T", "F1", "1E", "1EP", "1EU"]);

export function appStoreConfig(): AppStoreConfig | null {
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
  const privateKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY;
  const vendorNumber = process.env.APP_STORE_CONNECT_VENDOR_NUMBER;
  if (!issuerId || !keyId || !privateKey || !vendorNumber) return null;
  return { issuerId, keyId, privateKey, vendorNumber };
}

function token(config: AppStoreConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    "ES256",
    config.privateKey,
    { kid: config.keyId },
    { iss: config.issuerId, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" },
  );
}

/** Sums first-time download units per Apple Identifier from a Sales SUMMARY report. */
export function parseSalesSummary(tsv: string): Map<string, number> {
  const lines = tsv.split(/\r?\n/).filter((line) => line.trim());
  const totals = new Map<string, number>();
  if (lines.length < 2) return totals;
  const header = lines[0].split("\t").map((h) => h.trim());
  const appleId = header.indexOf("Apple Identifier");
  const units = header.indexOf("Units");
  const type = header.indexOf("Product Type Identifier");
  if (appleId < 0 || units < 0 || type < 0) throw new Error("Unexpected sales report format.");
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    if (!DOWNLOAD_TYPES.has(cells[type]?.trim())) continue;
    const id = cells[appleId]?.trim();
    const count = Number(cells[units]);
    if (!id || !Number.isFinite(count)) continue;
    totals.set(id, (totals.get(id) ?? 0) + count);
  }
  return totals;
}

async function gunzipText(res: Response): Promise<string> {
  if (!res.body) return "";
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

export async function fetchAppStoreMetrics(
  config: AppStoreConfig,
  apps: readonly AppEntry[],
  from: string,
  to: string,
): Promise<DailyMetric[]> {
  const tracked = apps.filter((app) => app.stores.appStore);
  if (!tracked.length) return [];
  const bearer = await token(config);
  const rows: DailyMetric[] = [];
  const days = daysBetween(from, to);
  // A few days at a time: Apple rate limits per key.
  for (let i = 0; i < days.length; i += 4) {
    const batch = days.slice(i, i + 4);
    const results = await Promise.all(
      batch.map(async (day) => {
        const params = new URLSearchParams({
          "filter[frequency]": "DAILY",
          "filter[reportDate]": day,
          "filter[reportSubType]": "SUMMARY",
          "filter[reportType]": "SALES",
          "filter[vendorNumber]": config.vendorNumber,
          "filter[version]": "1_1",
        });
        const res = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${params}`, {
          headers: { authorization: `Bearer ${bearer}`, accept: "application/a-gzip" },
        });
        // 404: no sales that day, or the report is not ready yet (they lag about a day).
        if (res.status === 404) return { day, totals: new Map<string, number>() };
        if (!res.ok) throw new Error(`App Store sales report ${day} failed (${res.status}).`);
        return { day, totals: parseSalesSummary(await gunzipText(res)) };
      }),
    );
    for (const { day, totals } of results) {
      for (const app of tracked) {
        rows.push({
          app: app.slug,
          store: "app_store",
          day,
          downloads: totals.get(app.stores.appStore!.appleId) ?? 0,
          active_devices: null,
        });
      }
    }
  }
  return rows;
}
