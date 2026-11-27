/**
 * Siblings may read only these three versioned views from the shared `data.db`:
 *
 * public_v1_workouts (id, date, title, duration, total_volume), date is ISO UTC.
 * public_v1_daily_nutrition (day, calories, protein, carbs, fat), day is the device's local
 * YYYY-MM-DD.
 * public_v1_body_weight (day, weight), day is local and weight is in kg as stored.
 *
 * For breaking changes add a public_v2_* view beside them; never edit a published view.
 */
import { exerciseRowId, setRowId, type Db } from "./sharedData";
import { dayKey } from "./streak";

/** The published public summary schema version. */
export const PUBLIC_SCHEMA_VERSION = 2;

type SqlValue = string | number | null;

const LEGACY_TABLES = [
  { name: "workouts", columns: ["id", "date", "title", "duration", "total_volume"] },
  { name: "workout_exercises", columns: ["workout_id", "position", "exercise_name"] },
  {
    name: "workout_sets",
    columns: [
      "workout_id",
      "exercise_position",
      "position",
      "exercise_name",
      "weight",
      "reps",
      "rpe",
      "set_type",
      "is_pr",
      "pr_types",
      "notes",
    ],
  },
  {
    name: "meals",
    columns: ["id", "date", "name", "calories", "protein", "carbs", "fat", "image_uri"],
  },
  {
    name: "body_metrics",
    columns: [
      "date",
      "weight",
      "height",
      "body_fat",
      "age",
      "sex",
      "target_weight",
      "activity_level",
    ],
  },
  { name: "water_log", columns: ["day", "ml"] },
  { name: "preferences", columns: ["key", "value"] },
] as const;

const SUMMARY_TABLES = `
CREATE TABLE IF NOT EXISTS summary_workouts (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  duration REAL NOT NULL,
  total_volume REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS summary_daily_nutrition (
  day TEXT PRIMARY KEY,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS summary_body_weight (
  day TEXT PRIMARY KEY,
  weight REAL NOT NULL
);
CREATE VIEW IF NOT EXISTS public_v1_workouts AS
  SELECT id, date, title, duration, total_volume FROM summary_workouts;
CREATE VIEW IF NOT EXISTS public_v1_daily_nutrition AS
  SELECT day, calories, protein, carbs, fat FROM summary_daily_nutrition;
CREATE VIEW IF NOT EXISTS public_v1_body_weight AS
  SELECT day, weight FROM summary_body_weight;
`;

/** Replaces the old v1 tables with the three versioned summary views, once. */
export async function migratePublic(db: Db): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  if ((row?.user_version ?? 0) >= PUBLIC_SCHEMA_VERSION) return;
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DROP TABLE IF EXISTS workout_sets;
      DROP TABLE IF EXISTS workout_exercises;
      DROP TABLE IF EXISTS workouts;
      DROP TABLE IF EXISTS meals;
      DROP TABLE IF EXISTS body_metrics;
      DROP TABLE IF EXISTS water_log;
      DROP TABLE IF EXISTS preferences;
      ${SUMMARY_TABLES}
    `);
    await db.execAsync(`PRAGMA user_version = ${PUBLIC_SCHEMA_VERSION}`);
  });
}

/** Copies a v1 public database's detail rows into the already migrated private database. */
export async function copyLegacyShared(from: Db, to: Db): Promise<boolean> {
  const version = await from.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  if ((version?.user_version ?? 0) !== 1) return false;

  const tables: { name: string; columns: readonly string[]; rows: Record<string, SqlValue>[] }[] =
    [];
  for (const table of LEGACY_TABLES) {
    tables.push({
      ...table,
      rows: await from.getAllAsync<Record<string, SqlValue>>(
        `SELECT ${table.columns.join(", ")} FROM ${table.name}`,
      ),
    });
  }

  await to.withTransactionAsync(async () => {
    for (const { name, columns, rows } of tables) {
      const needsId = name === "workout_exercises" || name === "workout_sets";
      const insertColumns = needsId ? ["id", ...columns] : columns;
      const placeholders = insertColumns.map(() => "?").join(", ");
      for (const row of rows) {
        const values: SqlValue[] = columns.map((column) => row[column] ?? null);
        if (name === "workout_exercises") {
          values.unshift(exerciseRowId(String(row.workout_id), Number(row.position)));
        } else if (name === "workout_sets") {
          values.unshift(
            setRowId(String(row.workout_id), Number(row.exercise_position), Number(row.position)),
          );
        }
        await to.runAsync(
          `INSERT OR REPLACE INTO ${name} (${insertColumns.join(", ")}) VALUES (${placeholders})`,
          values,
        );
      }
    }
  });
  return true;
}

/** Incremental summary changes; `all` rebuilds every summary table. */
export interface PublicChange {
  mealDays?: string[];
  workouts?: string[];
  weightDays?: string[];
  all?: boolean;
}

/** Half-open ISO UTC range covering one device-local day. */
function dayRange(day: string): [string, string] {
  const [year, month, date] = day.split("-").map(Number);
  return [
    new Date(year, month - 1, date).toISOString(),
    new Date(year, month - 1, date + 1).toISOString(),
  ];
}

interface NutritionTotals {
  day: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface WorkoutSummary {
  id: string;
  date: string;
  title: string;
  duration: number;
  total_volume: number;
}

/** Publishes private changes to the public views, one refresh at a time. */
export function createPublisher(
  getPrivate: () => Promise<Db>,
  getPublic: () => Promise<Db | null>,
) {
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };

  async function refreshMealDay(db: Db, privateDb: Db, day: string): Promise<void> {
    const [start, end] = dayRange(day);
    const totals = await privateDb.getFirstAsync<{
      n: number;
      calories: number | null;
      protein: number | null;
      carbs: number | null;
      fat: number | null;
    }>(
      `SELECT COUNT(*) AS n, SUM(calories) AS calories, SUM(protein) AS protein,
              SUM(carbs) AS carbs, SUM(fat) AS fat
       FROM meals WHERE date >= ? AND date < ?`,
      [start, end],
    );
    if (!totals || totals.n === 0) {
      await db.runAsync("DELETE FROM summary_daily_nutrition WHERE day = ?", [day]);
      return;
    }
    await db.runAsync(
      `INSERT OR REPLACE INTO summary_daily_nutrition (day, calories, protein, carbs, fat)
       VALUES (?, ?, ?, ?, ?)`,
      [day, totals.calories ?? 0, totals.protein ?? 0, totals.carbs ?? 0, totals.fat ?? 0],
    );
  }

  async function refreshWorkout(db: Db, privateDb: Db, id: string): Promise<void> {
    const row = await privateDb.getFirstAsync<WorkoutSummary>(
      "SELECT id, date, title, duration, total_volume FROM workouts WHERE id = ?",
      [id],
    );
    if (!row) {
      await db.runAsync("DELETE FROM summary_workouts WHERE id = ?", [id]);
      return;
    }
    await db.runAsync(
      `INSERT OR REPLACE INTO summary_workouts (id, date, title, duration, total_volume)
       VALUES (?, ?, ?, ?, ?)`,
      [row.id, row.date, row.title, row.duration, row.total_volume],
    );
  }

  async function refreshWeightDay(db: Db, privateDb: Db, day: string): Promise<void> {
    const [start, end] = dayRange(day);
    const row = await privateDb.getFirstAsync<{ weight: number }>(
      `SELECT weight FROM body_metrics WHERE date >= ? AND date < ?
       ORDER BY date DESC LIMIT 1`,
      [start, end],
    );
    if (!row) {
      await db.runAsync("DELETE FROM summary_body_weight WHERE day = ?", [day]);
      return;
    }
    await db.runAsync("INSERT OR REPLACE INTO summary_body_weight (day, weight) VALUES (?, ?)", [
      day,
      row.weight,
    ]);
  }

  async function rebuild(db: Db): Promise<void> {
    const privateDb = await getPrivate();
    const [meals, workouts, metrics] = await Promise.all([
      privateDb.getAllAsync<{
        date: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
      }>("SELECT date, calories, protein, carbs, fat FROM meals"),
      privateDb.getAllAsync<WorkoutSummary>(
        "SELECT id, date, title, duration, total_volume FROM workouts",
      ),
      privateDb.getAllAsync<{ date: string; weight: number }>(
        "SELECT date, weight FROM body_metrics",
      ),
    ]);

    const nutrition = new Map<string, NutritionTotals>();
    for (const meal of meals) {
      const day = dayKey(new Date(meal.date));
      const totals = nutrition.get(day) ?? { day, calories: 0, protein: 0, carbs: 0, fat: 0 };
      totals.calories += meal.calories;
      totals.protein += meal.protein;
      totals.carbs += meal.carbs;
      totals.fat += meal.fat;
      nutrition.set(day, totals);
    }

    const weights = new Map<string, { date: string; weight: number }>();
    for (const metric of metrics) {
      const day = dayKey(new Date(metric.date));
      const latest = weights.get(day);
      if (!latest || metric.date > latest.date) weights.set(day, metric);
    }

    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        DELETE FROM summary_workouts;
        DELETE FROM summary_daily_nutrition;
        DELETE FROM summary_body_weight;
      `);
      for (const row of nutrition.values()) {
        await db.runAsync(
          `INSERT OR REPLACE INTO summary_daily_nutrition (day, calories, protein, carbs, fat)
           VALUES (?, ?, ?, ?, ?)`,
          [row.day, row.calories, row.protein, row.carbs, row.fat],
        );
      }
      for (const row of workouts) {
        await db.runAsync(
          `INSERT OR REPLACE INTO summary_workouts (id, date, title, duration, total_volume)
           VALUES (?, ?, ?, ?, ?)`,
          [row.id, row.date, row.title, row.duration, row.total_volume],
        );
      }
      for (const [day, row] of weights) {
        await db.runAsync(
          "INSERT OR REPLACE INTO summary_body_weight (day, weight) VALUES (?, ?)",
          [day, row.weight],
        );
      }
    });
  }

  async function rebuildAll(): Promise<void> {
    await serialize(async () => {
      const db = await getPublic();
      if (!db) return;
      await rebuild(db);
    });
  }

  async function apply(change: PublicChange): Promise<void> {
    if (change.all) {
      await rebuildAll();
      return;
    }
    await serialize(async () => {
      const db = await getPublic();
      if (!db) return;
      const privateDb = await getPrivate();
      await db.withTransactionAsync(async () => {
        for (const day of new Set(change.mealDays ?? [])) {
          await refreshMealDay(db, privateDb, day);
        }
        for (const id of new Set(change.workouts ?? [])) {
          await refreshWorkout(db, privateDb, id);
        }
        for (const day of new Set(change.weightDays ?? [])) {
          await refreshWeightDay(db, privateDb, day);
        }
      });
    });
  }

  return { apply, rebuildAll };
}
