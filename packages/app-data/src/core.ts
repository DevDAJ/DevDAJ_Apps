import type { SQLiteDatabase } from "expo-sqlite";
import {
  AppDataError,
  appFolder,
  assertAppName,
  assertReadQuery,
  DATABASE_FILE,
  type SqlValue,
} from "./shared";

/** The native half (`ios/AppDataModule.swift`, `android/.../AppDataModule.kt`). */
export interface NativeAppData {
  /** This app's name, from the config plugin's `app` option. */
  appName: string | null;
  /** iOS: the app group container. Android: `<files>/devdaj`. Null when the plugin isn't applied. */
  appsDirectory: string | null;
  /** iOS: the expanded keychain access group. Null on Android or without the plugin. */
  keychainGroup?: string | null;
  /** Whether `<apps folder>/<app>/data.db` exists (iOS: any app; Android: this app only). */
  databaseExists(app: string): boolean;
  /** Android only: query another app's database through its ContentProvider. */
  queryApp?(app: string, sql: string, args: string[]): Promise<Row[]>;
}

/**
 * ContentProvider arguments are strings, so each value travels tagged with its SQLite type
 * and the provider binds it with that type again (see `QueryArg.kt`).
 */
export function encodeArg(value: SqlValue): string {
  if (value === null) return "n:";
  if (typeof value === "string") return `t:${value}`;
  if (!Number.isFinite(value)) throw new TypeError("Query numbers must be finite.");
  return Number.isSafeInteger(value) ? `i:${value}` : `r:${value}`;
}

export type Row = Record<string, SqlValue>;

interface Deps {
  native: NativeAppData | null;
  platform: string | undefined;
  open: (name: string, directory: string, newConnection: boolean) => Promise<SQLiteDatabase>;
}

export interface AppData {
  /** This app's name (e.g. `fitnexx`), or null when the plugin isn't set up. */
  readonly app: string | null;
  /** True once the native module and config plugin are in this build. */
  readonly configured: boolean;
  /** iOS: the expanded keychain access group for the raw data key. Null elsewhere. */
  readonly keychainGroup: string | null;
  /**
   * This app's own database (read/write), at `<apps folder>/<app>/data.db`, in WAL mode.
   * Other apps can read it, so keep anything private out or in a separate database.
   */
  open(): Promise<SQLiteDatabase>;
  /** Runs a read-only query against an app's database: this app's or another installed DevDAJ app's. */
  query<T extends Row = Row>(app: string, sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Whether another app is installed, set up and has data this app may read. */
  has(app: string): Promise<boolean>;
}

/** Testable core; `appData` below is the real instance. */
export function createAppData({ native, platform, open }: Deps): AppData {
  const app = native?.appName ?? null;
  const directory = native?.appsDirectory ?? null;
  let own: Promise<SQLiteDatabase> | null = null;

  const requireSetup = () => {
    if (!app || !directory) {
      throw new AppDataError(
        "Shared app data isn't set up: add the @devdaj/app-data plugin to app.json and rebuild.",
        "not_configured",
      );
    }
    return { app, directory };
  };

  const openOwn = () => {
    if (!own) {
      own = (async () => {
        const setup = requireSetup();
        const db = await open(DATABASE_FILE, appFolder(setup.directory, setup.app), false);
        // WAL lets other apps read while this app writes; busy_timeout rides out short locks.
        await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;");
        return db;
      })();
      own.catch(() => {
        own = null;
      });
    }
    return own;
  };

  const unavailable = (other: string) =>
    new AppDataError(`${other} isn't installed or hasn't saved any data yet.`, "app_unavailable");

  const queryOther = async (other: string, sql: string, params: SqlValue[]): Promise<Row[]> => {
    if (platform === "ios") {
      const setup = requireSetup();
      if (!native?.databaseExists(other)) throw unavailable(other);
      const db = await open(DATABASE_FILE, appFolder(setup.directory, other), true);
      try {
        await db.execAsync("PRAGMA query_only = 1; PRAGMA busy_timeout = 3000;");
        return await db.getAllAsync<Row>(sql, params);
      } finally {
        // Never hold another app's file open: iOS kills apps that keep shared-container locks while suspended.
        await db.closeAsync();
      }
    }
    if (platform === "android" && native?.queryApp) {
      requireSetup();
      try {
        return await native.queryApp(other, sql, params.map(encodeArg));
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === "ERR_APP_UNAVAILABLE") throw unavailable(other);
        if (code === "ERR_APP_FORBIDDEN") {
          throw new AppDataError(
            `${other} is signed with a different key, so its data can't be shared.`,
            "forbidden",
          );
        }
        throw error;
      }
    }
    throw new AppDataError(
      "Reading other apps' data only works on iOS and Android.",
      "unsupported_platform",
    );
  };

  return {
    app,
    configured: app !== null && directory !== null,
    keychainGroup: platform === "ios" ? (native?.keychainGroup ?? null) : null,
    open: openOwn,

    async query<T extends Row = Row>(target: string, sql: string, params: SqlValue[] = []) {
      assertAppName(target);
      assertReadQuery(sql);
      if (target === app) return (await openOwn()).getAllAsync<T>(sql, params);
      return (await queryOther(target, sql, params)) as T[];
    },

    async has(target) {
      assertAppName(target);
      if (target === app) return true;
      try {
        await queryOther(target, "SELECT 1", []);
        return true;
      } catch (error) {
        if (error instanceof AppDataError && error.code !== "not_configured") return false;
        throw error;
      }
    },
  };
}
