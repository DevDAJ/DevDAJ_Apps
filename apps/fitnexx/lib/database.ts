import { appData } from "@devdaj/app-data";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { KEYS } from "./backupSchema";
import { createSharedData, type Db, migrate, SHARED_KEYS, type SharedSnapshot } from "./sharedData";

/** Set once the AsyncStorage data from older versions has been copied into SQLite. */
const LEGACY_IMPORTED_KEY = "fitnexx_sqlite_imported";

let opening: Promise<SQLiteDatabase> | null = null;

/**
 * The shared database (`<app group>/fitnexx/data.db`). Builds without the native module
 * (Expo Go) fall back to a private database with the same tables, so the app still works;
 * other apps just can't see it.
 */
function getDatabase(): Promise<SQLiteDatabase> {
  if (!opening) {
    opening = (async () => {
      let db: SQLiteDatabase;
      if (appData.configured) {
        db = await appData.open();
      } else {
        db = await openDatabaseAsync("fitnexx-data.db");
        await db.execAsync("PRAGMA journal_mode = WAL;");
      }
      await migrate(db as Db);
      return db;
    })();
    opening.catch(() => {
      opening = null;
    });
  }
  return opening;
}

export const sharedData = createSharedData(async () => {
  const db = (await getDatabase()) as Db;
  await importLegacyOnce();
  return db;
});

let importing: Promise<void> | null = null;

/** Copies pre-SQLite data across once, then removes the old AsyncStorage copies. */
function importLegacyOnce(): Promise<void> {
  if (!importing) {
    importing = (async () => {
      if ((await AsyncStorage.getItem(LEGACY_IMPORTED_KEY)) === "true") return;
      const values = Object.fromEntries(await AsyncStorage.multiGet([...SHARED_KEYS]));
      const json = <T>(key: string): T | undefined => {
        const raw = values[key];
        return raw == null ? undefined : (JSON.parse(raw) as T);
      };
      // Older builds saved this raw ("kg"), backup restores JSON-quoted it ('"kg"').
      const unit = values[KEYS.WEIGHT_UNIT]?.replaceAll('"', "");
      const legacy: Partial<SharedSnapshot> = {
        workouts: json(KEYS.WORKOUTS),
        meals: json(KEYS.MEALS),
        bodyMetrics: json(KEYS.BODY_METRICS),
        waterLog: json(KEYS.WATER),
        weightUnit: unit === "kg" || unit === "lbs" ? unit : undefined,
        dailyCalorieGoal: json<number | null>(KEYS.DAILY_CALORIE_GOAL),
      };
      // Runs inside the first write/read, so call the raw importer rather than queueing.
      await rawImport(legacy);
      await AsyncStorage.setItem(LEGACY_IMPORTED_KEY, "true");
      await AsyncStorage.multiRemove([...SHARED_KEYS]);
    })();
    importing.catch(() => {
      importing = null;
    });
  }
  return importing;
}

const rawImport = (legacy: Partial<SharedSnapshot>) =>
  createSharedData(async () => (await getDatabase()) as Db).importLegacy(legacy);
