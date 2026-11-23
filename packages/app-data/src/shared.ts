/**
 * Names shared by the JS API, the native code and the config plugin.
 * Changing any of these breaks reading data written by already-installed apps.
 */

/** Every DevDAJ app id is `tech.devdaj.app.<app_name>`. */
export const APP_ID_PREFIX = "tech.devdaj.app";

/** iOS: the app group every DevDAJ app joins. Inside it is one folder per app. */
export const APP_GROUP = "group.tech.devdaj.shared";

/** Android: signature-level permission guarding each app's data provider (only same-key apps get it). */
export const READ_PERMISSION = "tech.devdaj.permission.APP_DATA";

/** Android: the data provider of app `x` lives at `tech.devdaj.app.x.appdata`. */
export const AUTHORITY_SUFFIX = ".appdata";

/** File name of each app's database inside its folder. */
export const DATABASE_FILE = "data.db";

const APP_NAME = /^[a-z][a-z0-9_]{0,63}$/;

/** App names are folder names and part of the app id: lowercase letters, digits, `_`. */
export function isValidAppName(app: string): boolean {
  return APP_NAME.test(app);
}

export function assertAppName(app: string): void {
  if (!isValidAppName(app)) {
    throw new AppDataError(
      `"${app}" is not a valid app name (lowercase letters, digits and _).`,
      "invalid_app",
    );
  }
}

/** `fitnexx` → `tech.devdaj.app.fitnexx` */
export function appIdOf(app: string): string {
  assertAppName(app);
  return `${APP_ID_PREFIX}.${app}`;
}

/** `fitnexx` → `tech.devdaj.app.fitnexx.appdata` */
export function authorityOf(app: string): string {
  return `${appIdOf(app)}${AUTHORITY_SUFFIX}`;
}

/** `<apps folder>/<app>`: the folder holding an app's database. */
export function appFolder(appsDirectory: string, app: string): string {
  assertAppName(app);
  return `${appsDirectory.replace(/\/+$/, "")}/${app}`;
}

/** A value that can be bound to a query and read back the same on iOS and Android. */
export type SqlValue = string | number | null;

/**
 * Only reads may cross apps. Readers also open the other app's database with
 * `PRAGMA query_only`, so this is a friendly early error rather than the safeguard.
 */
export function assertReadQuery(sql: string): void {
  const start = sql
    .replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)+/, "")
    .slice(0, 6)
    .toLowerCase();
  if (!start.startsWith("select") && !start.startsWith("with")) {
    throw new AppDataError("Other apps' data is read-only: use a SELECT query.", "read_only");
  }
}

export type AppDataErrorCode =
  | "invalid_app"
  | "read_only"
  | "not_configured"
  | "app_unavailable"
  | "forbidden"
  | "unsupported_platform";

export class AppDataError extends Error {
  constructor(
    message: string,
    public code: AppDataErrorCode,
  ) {
    super(message);
    this.name = "AppDataError";
  }
}
