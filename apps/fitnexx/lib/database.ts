import { appData } from "@devdaj/app-data";
import { openWriter, type Writer } from "@devdaj/app-data/writer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { openDatabaseAsync } from "expo-sqlite";
import { KEYS } from "./backupSchema";
import { copyLegacyShared, createPublisher, migratePublic, type PublicChange } from "./publicData";
import {
  baselineIfEmpty,
  createSharedData,
  type Db,
  migrate,
  PRIVATE_KEYS,
  SHARED_KEYS,
  type SharedSnapshot,
} from "./sharedData";

/** Set once the AsyncStorage data from older versions has been copied into SQLite. */
const LEGACY_IMPORTED_KEY = "fitnexx_sqlite_imported";

interface Databases {
  privateDb: Db;
  publicDb: Db | null;
  writer: Writer;
}

let opening: Promise<Databases> | null = null;
let opened: Databases | null = null;

/**
 * Opens the private database first, then publishes into the shared `data.db` when configured.
 * Old v1 detail rows are copied to the private database before the public tables are replaced.
 */
function getDatabases(): Promise<Databases> {
  if (!opening) {
    opening = (async () => {
      const privateDb = (await openDatabaseAsync("fitnexx-data.db")) as Db;
      await privateDb.execAsync("PRAGMA journal_mode = WAL;");
      await migrate(privateDb);

      const publicDb = appData.configured ? ((await appData.open()) as Db) : null;
      if (publicDb) await copyLegacyShared(publicDb, privateDb);

      const writer = await openWriter(privateDb, {
        app: "fitnexx",
        keys: PRIVATE_KEYS,
        newDeviceId: () => Crypto.randomUUID().replaceAll("-", ""),
      });
      await baselineIfEmpty(writer);
      if (publicDb) await migratePublic(publicDb);

      opened = { privateDb, publicDb, writer };
      // Self-heals summaries a failed refresh left stale; never blocks opening the app's data.
      await publisher.rebuildAll().catch(warnRefreshFailed);
      return opened;
    })();
    opening.catch(() => {
      opened = null;
      opening = null;
    });
  }
  return opening;
}

const getPrivate = async (): Promise<Db> => (opened ?? (await getDatabases())).privateDb;
const getPublic = async (): Promise<Db | null> => (opened ?? (await getDatabases())).publicDb;

const publisher = createPublisher(getPrivate, getPublic);

const warnRefreshFailed = (error: unknown) =>
  console.warn("Fitnexx public summary refresh failed", error);

// shortcut: a failed refresh leaves the public summary stale until the next launch rebuild; surface it in telemetry if it happens.
const publish = (change: PublicChange) => {
  publisher.apply(change).catch(warnRefreshFailed);
};

const getWriter = async (): Promise<{ db: Db; writer: Writer }> => {
  const databases = opened ?? (await getDatabases());
  return { db: databases.privateDb, writer: databases.writer };
};

export const sharedData = createSharedData(async () => {
  const state = await getWriter();
  await importLegacyOnce();
  return state;
}, publish);

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
  createSharedData(getWriter, publish).importLegacy(legacy);
