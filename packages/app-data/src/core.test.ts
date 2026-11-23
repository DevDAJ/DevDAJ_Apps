import { createRequire } from "node:module";
import type { SQLiteDatabase } from "expo-sqlite";
import { describe, expect, test, vi } from "vite-plus/test";
import { createAppData, encodeArg, type NativeAppData } from "./core";
import * as shared from "./shared";

const require = createRequire(import.meta.url);

function fakeDb(rows: unknown[] = [{ n: 1 }]) {
  return {
    execAsync: vi.fn(async () => {}),
    getAllAsync: vi.fn(async () => rows),
    closeAsync: vi.fn(async () => {}),
  };
}

function setup(platform: string, native: Partial<NativeAppData> | null = {}) {
  const db = fakeDb();
  const open = vi.fn(async () => db as unknown as SQLiteDatabase);
  const appData = createAppData({
    native:
      native === null
        ? null
        : {
            appName: "fitnexx",
            appsDirectory: "/group/",
            databaseExists: () => true,
            ...native,
          },
    platform,
    open,
  });
  return { appData, open, db };
}

describe("shared names", () => {
  test("app ids and provider authorities follow tech.devdaj.app.<app>", () => {
    expect(shared.appIdOf("fitnexx")).toBe("tech.devdaj.app.fitnexx");
    expect(shared.authorityOf("fitnexx")).toBe("tech.devdaj.app.fitnexx.appdata");
    expect(shared.appFolder("/group/", "fitnexx")).toBe("/group/fitnexx");
  });

  test("rejects names that could escape the folder", () => {
    for (const bad of ["../x", "Fitnexx", "a/b", "", "1app"]) {
      expect(() => shared.appIdOf(bad)).toThrow(shared.AppDataError);
    }
  });

  test("only reads may cross apps", () => {
    expect(() => shared.assertReadQuery("  -- note\nSELECT 1")).not.toThrow();
    expect(() => shared.assertReadQuery("with t as (select 1) select * from t")).not.toThrow();
    expect(() => shared.assertReadQuery("DELETE FROM meals")).toThrow("read-only");
  });

  test("the config plugin uses the same names", () => {
    const { internal } = require("../plugin/index.js");
    expect(internal.APP_ID_PREFIX).toBe(shared.APP_ID_PREFIX);
    expect(internal.APP_GROUP).toBe(shared.APP_GROUP);
    expect(internal.AUTHORITY_SUFFIX).toBe(shared.AUTHORITY_SUFFIX);
  });
});

describe("encodeArg", () => {
  test("tags values with their SQLite type for the Android provider", () => {
    expect(encodeArg(null)).toBe("n:");
    expect(encodeArg(42)).toBe("i:42");
    expect(encodeArg(1.5)).toBe("r:1.5");
    expect(encodeArg("i:not a number")).toBe("t:i:not a number");
    expect(() => encodeArg(Number.NaN)).toThrow();
  });
});

describe("own database", () => {
  test("opens <apps folder>/<app>/data.db once, in WAL mode", async () => {
    const { appData, open, db } = setup("ios");
    await appData.open();
    await appData.open();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("data.db", "/group/fitnexx", false);
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining("journal_mode = WAL"));
  });

  test("queries on this app go to its own connection", async () => {
    const { appData, db } = setup("android");
    expect(await appData.query("fitnexx", "SELECT * FROM meals WHERE id = ?", [1])).toEqual([
      { n: 1 },
    ]);
    expect(db.getAllAsync).toHaveBeenCalledWith("SELECT * FROM meals WHERE id = ?", [1]);
  });

  test("explains a missing plugin", async () => {
    const { appData } = setup("ios", null);
    expect(appData.configured).toBe(false);
    await expect(appData.open()).rejects.toMatchObject({ code: "not_configured" });
  });
});

describe("other apps on iOS", () => {
  test("opens the other app's file read-only and closes it", async () => {
    const { appData, open, db } = setup("ios");
    await appData.query("gymlog", "SELECT 1");
    expect(open).toHaveBeenCalledWith("data.db", "/group/gymlog", true);
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining("query_only = 1"));
    expect(db.closeAsync).toHaveBeenCalled();
  });

  test("missing apps are unavailable, never created", async () => {
    const { appData, open } = setup("ios", { databaseExists: () => false });
    await expect(appData.query("gymlog", "SELECT 1")).rejects.toMatchObject({
      code: "app_unavailable",
    });
    expect(await appData.has("gymlog")).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("other apps on Android", () => {
  test("goes through the provider with tagged args", async () => {
    const queryApp = vi.fn(async () => [{ total: 3 }]);
    const { appData } = setup("android", { queryApp });
    expect(await appData.query("gymlog", "SELECT ? AS a, ? AS b", [7, null])).toEqual([
      { total: 3 },
    ]);
    expect(queryApp).toHaveBeenCalledWith("gymlog", "SELECT ? AS a, ? AS b", ["i:7", "n:"]);
  });

  test("maps native errors", async () => {
    const fail = (code: string) =>
      setup("android", {
        queryApp: async () => {
          throw Object.assign(new Error("native"), { code });
        },
      }).appData;
    await expect(fail("ERR_APP_UNAVAILABLE").query("gymlog", "SELECT 1")).rejects.toMatchObject({
      code: "app_unavailable",
    });
    await expect(fail("ERR_APP_FORBIDDEN").query("gymlog", "SELECT 1")).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(await fail("ERR_APP_FORBIDDEN").has("gymlog")).toBe(false);
  });

  test("writes are refused before reaching another app", async () => {
    const queryApp = vi.fn();
    const { appData } = setup("android", { queryApp });
    await expect(appData.query("gymlog", "DROP TABLE meals")).rejects.toMatchObject({
      code: "read_only",
    });
    expect(queryApp).not.toHaveBeenCalled();
  });
});

describe("config plugin", () => {
  const { internal } = require("../plugin/index.js");

  test("validates options and app ids", () => {
    expect(() => internal.validate({ app: "Fitnexx" })).toThrow();
    expect(() => internal.validate({ app: "fitnexx", readsFrom: ["../x"] })).toThrow();
    expect(internal.validate({ app: "fitnexx", readsFrom: ["fitnexx", "gymlog"] })).toEqual({
      app: "fitnexx",
      readsFrom: ["gymlog"],
    });
    expect(() => internal.checkId("android.package", "com.fitnexx.app", "fitnexx")).toThrow(
      "tech.devdaj.app.fitnexx",
    );
  });

  test("adds the app group once", () => {
    const once = internal.applyEntitlements({});
    expect(internal.applyEntitlements(once)).toEqual({
      "com.apple.security.application-groups": ["group.tech.devdaj.shared"],
    });
  });

  test("adds the app name and provider queries to the Android manifest", () => {
    const manifest = {
      manifest: { $: {}, application: [{ $: { "android:name": ".MainApplication" } }] },
    };
    internal.applyAndroidManifest(manifest, { app: "fitnexx", readsFrom: ["gymlog"] });
    internal.applyAndroidManifest(manifest, { app: "fitnexx", readsFrom: ["gymlog"] });
    const root = manifest.manifest as Record<string, any>;
    expect(root.application[0]["meta-data"]).toEqual([
      { $: { "android:name": "tech.devdaj.appdata.APP_NAME", "android:value": "fitnexx" } },
    ]);
    expect(root.queries).toEqual([
      { provider: [{ $: { "android:authorities": "tech.devdaj.app.gymlog.appdata" } }] },
    ]);
  });
});
