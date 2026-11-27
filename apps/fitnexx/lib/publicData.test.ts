import { openWriter } from "@devdaj/app-data/writer";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import { copyLegacyShared, createPublisher, migratePublic } from "./publicData";
import {
  createSharedData,
  type Db,
  exerciseRowId,
  migrate,
  PRIVATE_KEYS,
  setRowId,
} from "./sharedData";
import { dayKey } from "./streak";
import type { BodyMetrics, Meal, Workout } from "./types";

/** expo-sqlite's async API over Node's built-in SQLite, so the real SQL runs in tests. */
function nodeDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  return {
    raw,
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, params) {
      const result = raw.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },
    async getAllAsync<T>(sql: string, params: (string | number | null)[] = []) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: (string | number | null)[] = []) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async withTransactionAsync(task) {
      raw.exec("BEGIN");
      try {
        await task();
        raw.exec("COMMIT");
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

/** Local wall-clock timestamps so the expected local day is stable in any time zone. */
const localIso = (day: number, hour = 12): string => new Date(2026, 10, day, hour).toISOString();

const meals: Meal[] = [
  {
    id: "m1",
    date: localIso(18, 8),
    name: "Breakfast",
    calories: 400,
    protein: 20,
    carbs: 40,
    fat: 10,
  },
  {
    id: "m2",
    date: localIso(18, 20),
    name: "Dinner",
    calories: 600,
    protein: 40,
    carbs: 60,
    fat: 20,
  },
  {
    id: "m3",
    date: localIso(19, 12),
    name: "Lunch",
    calories: 300,
    protein: 25,
    carbs: 30,
    fat: 8,
  },
];

const workout: Workout = {
  id: "w1",
  date: localIso(18, 9),
  title: "Push",
  duration: 3600,
  totalVolume: 4200,
  exercises: [{ exerciseName: "Bench Press", sets: [{ weight: 100, reps: 5, setType: "normal" }] }],
};

const metrics: BodyMetrics[] = [
  {
    date: localIso(18, 8),
    weight: 80,
    height: 180,
    age: 30,
    sex: "male",
    activityLevel: "moderate",
  },
  {
    date: localIso(18, 20),
    weight: 79,
    height: 180,
    age: 30,
    sex: "male",
    activityLevel: "moderate",
  },
];

/** Opens a deterministic writer so private writes also record change-log operations. */
async function testData(db: Db) {
  const writer = await openWriter(db, {
    app: "fitnexx",
    keys: PRIVATE_KEYS,
    newDeviceId: () => "testdevice",
    now: () => 1,
  });
  return createSharedData(async () => ({ db, writer }));
}

async function setup() {
  const privateDb = nodeDb();
  const publicDb = nodeDb();
  await migrate(privateDb);
  await migratePublic(publicDb);
  const data = await testData(privateDb);
  const publisher = createPublisher(
    async () => privateDb,
    async () => publicDb,
  );
  return { privateDb, publicDb, data, publisher };
}

const OLD_TABLES = [
  "workout_sets",
  "workout_exercises",
  "workouts",
  "meals",
  "body_metrics",
  "water_log",
  "preferences",
];

const VIEW_COLUMNS: Record<string, [string, string][]> = {
  public_v1_workouts: [
    ["id", "TEXT"],
    ["date", "TEXT"],
    ["title", "TEXT"],
    ["duration", "REAL"],
    ["total_volume", "REAL"],
  ],
  public_v1_daily_nutrition: [
    ["day", "TEXT"],
    ["calories", "REAL"],
    ["protein", "REAL"],
    ["carbs", "REAL"],
    ["fat", "REAL"],
  ],
  public_v1_body_weight: [
    ["day", "TEXT"],
    ["weight", "REAL"],
  ],
};

async function viewRows(db: Db) {
  return {
    workouts: await db.getAllAsync(
      "SELECT id, date, title, duration, total_volume FROM public_v1_workouts ORDER BY id",
    ),
    nutrition: await db.getAllAsync(
      "SELECT day, calories, protein, carbs, fat FROM public_v1_daily_nutrition ORDER BY day",
    ),
    weights: await db.getAllAsync("SELECT day, weight FROM public_v1_body_weight ORDER BY day"),
  };
}

describe("public summary schema", () => {
  test("migratePublic creates the three views with exact columns and is idempotent", async () => {
    const db = nodeDb();
    await migratePublic(db);
    expect(await db.getFirstAsync("PRAGMA user_version")).toEqual({ user_version: 2 });

    for (const [view, columns] of Object.entries(VIEW_COLUMNS)) {
      const info = await db.getAllAsync<{ name: string; type: string }>(
        `PRAGMA table_info(${view})`,
      );
      expect(info.map((column) => [column.name, column.type])).toEqual(columns);
    }

    expect(
      (await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'view'"))
        .map((row) => row.name)
        .sort(),
    ).toEqual(Object.keys(VIEW_COLUMNS).sort());

    await migratePublic(db);
    expect(await db.getFirstAsync("PRAGMA user_version")).toEqual({ user_version: 2 });
  });

  test("legacy v1 data moves to private before the old public tables are dropped", async () => {
    const legacyDb = nodeDb();
    await migrate(legacyDb);
    const legacy = await testData(legacyDb);
    await legacy.saveWorkout(workout);
    for (const meal of meals) await legacy.saveMeal(meal);
    for (const metric of metrics) await legacy.saveBodyMetrics(metric);
    await legacy.saveWaterLog({ [dayKey(new Date(localIso(18)))]: 750 });
    await legacy.setWeightUnit("lbs");
    await legacy.setDailyCalorieGoal(2200);
    // copyLegacyShared only runs against a pre-summary v1 public database.
    await legacyDb.execAsync("PRAGMA user_version = 1;");

    const privateDb = nodeDb();
    await migrate(privateDb);
    expect(await copyLegacyShared(legacyDb, privateDb)).toBe(true);
    expect(
      await privateDb.getAllAsync<{ id: string }>(
        "SELECT id FROM workout_exercises ORDER BY position",
      ),
    ).toEqual(
      workout.exercises.map((_, position) => ({ id: exerciseRowId(workout.id, position) })),
    );
    expect(
      await privateDb.getAllAsync<{ id: string }>(
        "SELECT id FROM workout_sets ORDER BY exercise_position, position",
      ),
    ).toEqual(
      workout.exercises.flatMap((exercise, exercisePosition) =>
        exercise.sets.map((_, position) => ({
          id: setRowId(workout.id, exercisePosition, position),
        })),
      ),
    );

    const privateData = await testData(privateDb);
    expect(await privateData.getWorkouts()).toEqual(await legacy.getWorkouts());
    expect(await privateData.getMeals()).toEqual(await legacy.getMeals());
    expect(await privateData.getBodyMetrics()).toEqual(await legacy.getBodyMetrics());
    expect(await privateData.getWaterLog()).toEqual(await legacy.getWaterLog());
    expect(await privateData.getWeightUnit()).toBe(await legacy.getWeightUnit());
    expect(await privateData.getDailyCalorieGoal()).toBe(await legacy.getDailyCalorieGoal());

    await migratePublic(legacyDb);
    const tables = (
      await legacyDb.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      )
    ).map((row) => row.name);
    for (const old of OLD_TABLES) expect(tables).not.toContain(old);
    expect(
      (
        await legacyDb.getAllAsync<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'view'",
        )
      )
        .map((row) => row.name)
        .sort(),
    ).toEqual(Object.keys(VIEW_COLUMNS).sort());
    expect(await copyLegacyShared(legacyDb, privateDb)).toBe(false);
  });
});

describe("public publisher", () => {
  test("apply sums meals by local day and removes a day when its last meal is deleted", async () => {
    const { publicDb, data, publisher } = await setup();
    const firstDay = dayKey(new Date(meals[0].date));
    const secondDay = dayKey(new Date(meals[2].date));
    expect(firstDay).not.toBe(secondDay);

    for (const meal of meals) await data.saveMeal(meal);
    await publisher.apply({ mealDays: [secondDay, firstDay, firstDay] });
    expect(
      await publicDb.getAllAsync("SELECT * FROM public_v1_daily_nutrition ORDER BY day"),
    ).toEqual([
      { day: firstDay, calories: 1000, protein: 60, carbs: 100, fat: 30 },
      { day: secondDay, calories: 300, protein: 25, carbs: 30, fat: 8 },
    ]);

    await data.deleteMeal("m2");
    await publisher.apply({ mealDays: [firstDay] });
    expect(
      await publicDb.getAllAsync("SELECT * FROM public_v1_daily_nutrition ORDER BY day"),
    ).toEqual([
      { day: firstDay, calories: 400, protein: 20, carbs: 40, fat: 10 },
      { day: secondDay, calories: 300, protein: 25, carbs: 30, fat: 8 },
    ]);

    await data.deleteMeal("m1");
    await publisher.apply({ mealDays: [firstDay] });
    expect(
      await publicDb.getAllAsync("SELECT * FROM public_v1_daily_nutrition ORDER BY day"),
    ).toEqual([{ day: secondDay, calories: 300, protein: 25, carbs: 30, fat: 8 }]);
  });

  test("apply upserts and deletes workout summaries", async () => {
    const { publicDb, data, publisher } = await setup();
    const row = {
      id: workout.id,
      date: workout.date,
      title: workout.title,
      duration: workout.duration,
      total_volume: workout.totalVolume,
    };

    await data.saveWorkout(workout);
    await publisher.apply({ workouts: [workout.id, workout.id] });
    expect(await publicDb.getAllAsync("SELECT * FROM public_v1_workouts")).toEqual([row]);

    await data.saveWorkout({ ...workout, title: "Push v2", totalVolume: 5000 });
    await publisher.apply({ workouts: [workout.id] });
    expect(await publicDb.getAllAsync("SELECT * FROM public_v1_workouts")).toEqual([
      { ...row, title: "Push v2", total_volume: 5000 },
    ]);

    await data.deleteWorkout(workout.id);
    await publisher.apply({ workouts: [workout.id] });
    expect(await publicDb.getAllAsync("SELECT * FROM public_v1_workouts")).toEqual([]);
  });

  test("apply keeps the latest weight entry of a local day", async () => {
    const { publicDb, data, publisher } = await setup();
    const day = dayKey(new Date(metrics[0].date));
    for (const metric of metrics) await data.saveBodyMetrics(metric);
    await publisher.apply({ weightDays: [day] });
    expect(await publicDb.getAllAsync("SELECT * FROM public_v1_body_weight")).toEqual([
      { day, weight: 79 },
    ]);

    await publisher.apply({ weightDays: [dayKey(new Date(localIso(20, 12)))] });
    expect(await publicDb.getAllAsync("SELECT * FROM public_v1_body_weight")).toEqual([
      { day, weight: 79 },
    ]);
  });

  test("publishing without a public database is a no-op", async () => {
    const { privateDb } = await setup();
    const publisher = createPublisher(
      async () => privateDb,
      async () => null,
    );
    await expect(publisher.apply({ all: true })).resolves.toBeUndefined();
    await expect(
      publisher.apply({ mealDays: [dayKey(new Date(meals[0].date))] }),
    ).resolves.toBeUndefined();
    await expect(publisher.apply({ workouts: [workout.id] })).resolves.toBeUndefined();
    await expect(
      publisher.apply({ weightDays: [dayKey(new Date(metrics[0].date))] }),
    ).resolves.toBeUndefined();
    await expect(publisher.rebuildAll()).resolves.toBeUndefined();
  });

  test("rebuildAll matches the sequence of incremental applies", async () => {
    const { privateDb, publicDb: incrementalDb, data, publisher } = await setup();
    for (const meal of meals) await data.saveMeal(meal);
    await data.saveWorkout(workout);
    for (const metric of metrics) await data.saveBodyMetrics(metric);

    await publisher.apply({
      mealDays: [...new Set(meals.map((meal) => dayKey(new Date(meal.date))))],
      workouts: [workout.id],
      weightDays: [...new Set(metrics.map((metric) => dayKey(new Date(metric.date))))],
    });

    const rebuiltDb = nodeDb();
    await migratePublic(rebuiltDb);
    const rebuilt = createPublisher(
      async () => privateDb,
      async () => rebuiltDb,
    );
    await rebuilt.rebuildAll();

    expect(await viewRows(rebuiltDb)).toEqual(await viewRows(incrementalDb));
  });
});
