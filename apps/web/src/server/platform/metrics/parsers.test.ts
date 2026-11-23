import { describe, expect, test } from "vite-plus/test";
import { daysBetween, parseSalesSummary } from "./app-store";
import { decodeReport, monthsBetween, parseInstallsOverview } from "./google-play";
import { dayRange } from "./service";

describe("google play installs report", () => {
  const csv = [
    "Date,Package Name,Daily Device Installs,Daily Device Uninstalls,Daily Device Upgrades,Total User Installs,Daily User Installs,Daily User Uninstalls,Active Device Installs",
    "2026-11-01,tech.devdaj.app.fitnexx,12,1,0,500,10,1,320",
    "2026-11-02,tech.devdaj.app.fitnexx,8,0,2,508,7,0,325",
  ].join("\n");

  test("parses daily user installs and active devices", () => {
    expect(parseInstallsOverview(csv, "fitnexx")).toEqual([
      {
        app: "fitnexx",
        store: "google_play",
        day: "2026-11-01",
        downloads: 10,
        active_devices: 320,
      },
      {
        app: "fitnexx",
        store: "google_play",
        day: "2026-11-02",
        downloads: 7,
        active_devices: 325,
      },
    ]);
  });

  test("decodes UTF-16LE reports with a BOM", () => {
    const text = "Date,Package Name\n";
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) bytes[2 + i * 2] = text.charCodeAt(i);
    expect(decodeReport(bytes)).toBe(text);
  });

  test("months between two days", () => {
    expect(monthsBetween("2025-11-20", "2026-02-03")).toEqual([
      "202511",
      "202512",
      "202601",
      "202602",
    ]);
  });
});

describe("app store sales report", () => {
  test("sums first-time download units per app, ignoring updates", () => {
    const tsv = [
      "Provider\tSKU\tUnits\tProduct Type Identifier\tApple Identifier",
      "APPLE\tfit\t5\t1F\t123",
      "APPLE\tfit\t9\t7F\t123",
      "APPLE\tfit\t2\t1T\t123",
      "APPLE\tother\t4\t1F\t999",
    ].join("\n");
    const totals = parseSalesSummary(tsv);
    expect(totals.get("123")).toBe(7);
    expect(totals.get("999")).toBe(4);
  });

  test("days between is inclusive", () => {
    expect(daysBetween("2026-02-27", "2026-03-01")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
  });

  test("dayRange ends yesterday (UTC)", () => {
    expect(dayRange(3, new Date("2026-11-19T10:00:00Z"))).toEqual({
      from: "2026-11-16",
      to: "2026-11-18",
    });
  });
});
