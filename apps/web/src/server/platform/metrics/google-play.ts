import type { AppEntry } from "../../../catalog";
import { signJwt } from "./jwt";
import type { DailyMetric } from "./types";

/**
 * Google Play has no API for install numbers; they are published as monthly CSV reports in the
 * developer account's Cloud Storage bucket (Play Console → Download reports → Statistics →
 * "Copy Cloud Storage URI"). A service account invited to the Play Console with "View app
 * information and download bulk reports" can read them.
 *
 *   gs://<bucket>/stats/installs/installs_<package>_<YYYYMM>_overview.csv  (UTF-16)
 */
export interface GooglePlayConfig {
  bucket: string;
  clientEmail: string;
  privateKey: string;
}

export function googlePlayConfig(): GooglePlayConfig | null {
  const bucket = process.env.GOOGLE_PLAY_REPORTS_BUCKET?.replace(/^gs:\/\//, "").replace(
    /\/.*$/,
    "",
  );
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!bucket || !raw) return null;
  const json = raw.trim().startsWith("{") ? raw : atob(raw);
  const account = JSON.parse(json) as { client_email?: string; private_key?: string };
  if (!account.client_email || !account.private_key) return null;
  return { bucket, clientEmail: account.client_email, privateKey: account.private_key };
}

async function accessToken(config: GooglePlayConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    "RS256",
    config.privateKey,
    {},
    {
      iss: config.clientEmail,
      scope: "https://www.googleapis.com/auth/devstorage.read_only",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Google auth failed (${res.status}): ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Report files are UTF-16 (LE with BOM); fall back to UTF-8 if there is no BOM. */
export function decodeReport(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Installs overview CSV → daily rows. Downloads = "Daily User Installs", usage = "Active Device Installs". */
export function parseInstallsOverview(csv: string, app: string): DailyMetric[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const date = col("Date");
  const downloads =
    col("Daily User Installs") >= 0 ? col("Daily User Installs") : col("Daily Device Installs");
  const active = col("Active Device Installs");
  if (date < 0) throw new Error("Unexpected installs report format (no Date column).");
  return lines.slice(1).flatMap((line) => {
    const cells = splitCsvLine(line);
    const day = cells[date];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? "")) return [];
    return [
      {
        app,
        store: "google_play" as const,
        day,
        downloads: downloads >= 0 ? toNumber(cells[downloads]) : null,
        active_devices: active >= 0 ? toNumber(cells[active]) : null,
      },
    ];
  });
}

/** Months (YYYYMM) touched by [from, to]. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endKey = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  while (year * 12 + month <= endKey) {
    months.push(`${year}${String(month).padStart(2, "0")}`);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return months;
}

export async function fetchGooglePlayMetrics(
  config: GooglePlayConfig,
  apps: readonly AppEntry[],
  from: string,
  to: string,
): Promise<DailyMetric[]> {
  const token = await accessToken(config);
  const rows: DailyMetric[] = [];
  for (const app of apps) {
    for (const month of monthsBetween(from, to)) {
      const object = `stats/installs/installs_${app.bundleId}_${month}_overview.csv`;
      const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.bucket)}/o/${encodeURIComponent(object)}?alt=media`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (res.status === 404) continue; // no report yet for that month
      if (!res.ok) throw new Error(`Google Play report ${object} failed (${res.status}).`);
      const parsed = parseInstallsOverview(
        decodeReport(new Uint8Array(await res.arrayBuffer())),
        app.slug,
      );
      rows.push(...parsed.filter((row) => row.day >= from && row.day <= to));
    }
  }
  return rows;
}
