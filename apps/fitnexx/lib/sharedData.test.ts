import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import { KEYS } from "./backupSchema";
import { createSharedData, type Db, migrate, splitKeyedData } from "./sharedData";
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
      return raw.prepare(sql).run(...params);
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

async function setup() {
  const db = nodeDb();
  await migrate(db);
  return { db, data: createSharedData(async () => db) };
}

const workout: Workout = {
  id: "w1",
  date: "2026-11-17T08:00:00.000Z",
  title: "Push",
  duration: 3600,
  totalVolume: 4200,
  exercises: [
    {
      exerciseName: "Bench Press",
      sets: [
        { weight: 80, reps: 8, setType: "warmup" as never },
        {
          weight: 100,
          reps: 5,
          rpe: 9,
          notes: "grind",
          setType: "normal" as never,
          isPr: true,
          prTypes: ["weight" as never],
        },
      ],
    },
    { exerciseName: "Dips", sets: [] },
  ],
};

const meal: Meal = {
  id: "m1",
  date: "2026-11-18T12:00:00.000Z",
  name: "Chicken rice",
  calories: 650,
  protein: 45,
  carbs: 70,
  fat: 15,
};

const metrics: BodyMetrics = {
  date: "2026-11-18T07:00:00.000Z",
  weight: 80,
  height: 180,
  age: 30,
  sex: "male",
  activityLevel: "moderate",
};

describe("shared SQLite data", () => {
  test("migrate is idempotent and versioned", async () => {
    const { db } = await setup();
    await migrate(db);
    expect(await db.getFirstAsync("PRAGMA user_version")).toEqual({ user_version: 1 });
  });

  test("workouts round-trip exactly, including empty exercises and optional fields", async () => {
    const { data } = await setup();
    await data.saveWorkout(workout);
    expect(await data.getWorkouts()).toEqual([workout]);
  });

  test("other apps can query sets as plain rows", async () => {
    const { db, data } = await setup();
    await data.saveWorkout(workout);
    expect(
      await db.getAllAsync(
        "SELECT exercise_name, MAX(weight) AS best FROM workout_sets GROUP BY exercise_name",
      ),
    ).toEqual([{ exercise_name: "Bench Press", best: 100 }]);
  });

  test("saving a workout again replaces it; deleting cascades to its sets", async () => {
    const { db, data } = await setup();
    await data.saveWorkout(workout);
    await data.saveWorkout({ ...workout, title: "Push v2", exercises: [] });
    expect((await data.getWorkouts()).map((w) => w.title)).toEqual(["Push v2"]);
    await data.saveWorkout(workout);
    await data.deleteWorkout("w1");
    expect(await data.getWorkouts()).toEqual([]);
    expect(await db.getAllAsync("SELECT * FROM workout_sets")).toEqual([]);
  });

  test("meals are newest first and update in place", async () => {
    const { data } = await setup();
    const older = { ...meal, id: "m0", date: "2026-11-17T12:00:00.000Z" };
    await data.saveMeal(older);
    await data.saveMeal(meal);
    await data.updateMeal("m1", { calories: 700, imageUri: "file:///x.jpg" });
    await data.updateMeal("missing", { calories: 1 });
    expect(await data.getMeals()).toEqual([
      { ...meal, calories: 700, imageUri: "file:///x.jpg" },
      older,
    ]);
    await data.deleteMeal("m0");
    expect((await data.getMeals()).map((m) => m.id)).toEqual(["m1"]);
  });

  test("body metrics, water and preferences", async () => {
    const { data } = await setup();
    expect(await data.getWeightUnit()).toBe("kg");
    expect(await data.getDailyCalorieGoal()).toBeNull();
    await data.saveBodyMetrics({ ...metrics, bodyFat: 18 });
    await data.saveWaterLog({ "2026-11-18": 750 });
    await data.setWeightUnit("lbs");
    await data.setDailyCalorieGoal(2200);
    expect(await data.getBodyMetrics()).toEqual([{ ...metrics, bodyFat: 18 }]);
    expect(await data.getWaterLog()).toEqual({ "2026-11-18": 750 });
    expect(await data.getWeightUnit()).toBe("lbs");
    expect(await data.getDailyCalorieGoal()).toBe(2200);
    await data.setDailyCalorieGoal(null);
    expect(await data.getDailyCalorieGoal()).toBeNull();
  });

  test("replaceAll swaps everything atomically; clearAll empties it", async () => {
    const { data } = await setup();
    await data.saveMeal({ ...meal, id: "old" });
    await data.replaceAll({
      workouts: [workout],
      meals: [meal],
      bodyMetrics: [metrics],
      waterLog: { "2026-11-18": 500 },
      weightUnit: "lbs",
      dailyCalorieGoal: 2000,
    });
    expect((await data.getMeals()).map((m) => m.id)).toEqual(["m1"]);
    expect(await data.getWorkouts()).toEqual([workout]);
    await data.clearAll();
    expect(await data.getMeals()).toEqual([]);
    expect(await data.getWeightUnit()).toBe("kg");
  });

  test("a failed write rolls back and later writes still run", async () => {
    const { data } = await setup();
    await expect(
      data.replaceAll({
        workouts: [],
        meals: [meal, { ...meal, id: "bad", calories: null as never }],
        bodyMetrics: [],
        waterLog: {},
        weightUnit: "kg",
        dailyCalorieGoal: null,
      }),
    ).rejects.toThrow();
    expect(await data.getMeals()).toEqual([]);
    await data.saveMeal(meal);
    expect(await data.getMeals()).toEqual([meal]);
  });

  test("legacy import only fills what was saved", async () => {
    const { data } = await setup();
    await data.setWeightUnit("lbs");
    await data.importLegacy({ meals: [meal], dailyCalorieGoal: undefined });
    expect(await data.getMeals()).toEqual([meal]);
    expect(await data.getWeightUnit()).toBe("lbs");
  });
});

describe("splitKeyedData", () => {
  test("sends shared keys to SQLite and the rest to AsyncStorage", () => {
    const { shared, rest } = splitKeyedData({
      [KEYS.MEALS]: [meal],
      [KEYS.WEIGHT_UNIT]: "lbs",
      [KEYS.DAILY_CALORIE_GOAL]: null,
      [KEYS.GYMS]: [],
      [KEYS.PRO]: true,
    });
    expect(shared).toEqual({
      workouts: [],
      meals: [meal],
      bodyMetrics: [],
      waterLog: {},
      weightUnit: "lbs",
      dailyCalorieGoal: null,
    });
    expect(rest).toEqual([
      [KEYS.GYMS, "[]"],
      [KEYS.PRO, "true"],
    ]);
  });
});
