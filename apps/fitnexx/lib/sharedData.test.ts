import { applyOps, emptyState, materializeTable, type Operation } from "@devdaj/app-data/changelog";
import { openWriter, type Writer } from "@devdaj/app-data/writer";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import { KEYS } from "./backupSchema";
import type { PublicChange } from "./publicData";
import {
  baselineIfEmpty,
  createSharedData,
  type Db,
  exerciseRowId,
  migrate,
  PRIVATE_KEYS,
  SCHEMA_VERSION,
  setRowId,
  splitKeyedData,
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

/** Opens a deterministic writer over the same database connection. */
async function writerFor(db: Db) {
  const writer = await openWriter(db, {
    app: "fitnexx",
    keys: PRIVATE_KEYS,
    newDeviceId: () => "testdevice",
    now: () => 1,
  });
  return { writer, getWriter: async (): Promise<{ db: Db; writer: Writer }> => ({ db, writer }) };
}

async function setup() {
  const db = nodeDb();
  await migrate(db);
  const { writer, getWriter } = await writerFor(db);
  return { db, writer, data: createSharedData(getWriter) };
}

const tableName = (op: Operation): string => ("table" in op ? op.table : "");

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
    expect(await db.getFirstAsync("PRAGMA user_version")).toEqual({ user_version: SCHEMA_VERSION });
  });

  test("v1 to v2 migration keeps all workout data and assigns the new row ids", async () => {
    const db = nodeDb();
    db.raw.exec(`
      CREATE TABLE workouts (
        id TEXT PRIMARY KEY, date TEXT NOT NULL, title TEXT NOT NULL,
        duration REAL NOT NULL, total_volume REAL NOT NULL
      );
      CREATE TABLE workout_exercises (
        workout_id TEXT NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
        position INTEGER NOT NULL, exercise_name TEXT NOT NULL,
        PRIMARY KEY (workout_id, position)
      );
      CREATE TABLE workout_sets (
        workout_id TEXT NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
        exercise_position INTEGER NOT NULL, position INTEGER NOT NULL,
        exercise_name TEXT NOT NULL, weight REAL NOT NULL, reps REAL NOT NULL, rpe REAL,
        set_type TEXT NOT NULL, is_pr INTEGER, pr_types TEXT, notes TEXT,
        PRIMARY KEY (workout_id, exercise_position, position)
      );
      CREATE INDEX workout_sets_exercise_idx ON workout_sets (exercise_name);
      PRAGMA user_version = 1;
    `);
    const original: Workout = {
      ...workout,
      exercises: [
        workout.exercises[0],
        {
          exerciseName: "Dips",
          sets: [
            { weight: 60, reps: 10, setType: "normal" as never },
            { weight: 70, reps: 8, setType: "normal" as never },
          ],
        },
      ],
    };
    await db.runAsync(
      "INSERT INTO workouts (id, date, title, duration, total_volume) VALUES (?, ?, ?, ?, ?)",
      [original.id, original.date, original.title, original.duration, original.totalVolume],
    );
    for (const [position, exercise] of original.exercises.entries()) {
      await db.runAsync(
        "INSERT INTO workout_exercises (workout_id, position, exercise_name) VALUES (?, ?, ?)",
        [original.id, position, exercise.exerciseName],
      );
      for (const [setPosition, set] of exercise.sets.entries()) {
        await db.runAsync(
          `INSERT INTO workout_sets (workout_id, exercise_position, position, exercise_name,
             weight, reps, rpe, set_type, is_pr, pr_types, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            original.id,
            position,
            setPosition,
            exercise.exerciseName,
            set.weight,
            set.reps,
            set.rpe ?? null,
            set.setType,
            set.isPr === undefined ? null : Number(set.isPr),
            set.prTypes === undefined ? null : JSON.stringify(set.prTypes),
            set.notes ?? null,
          ],
        );
      }
    }

    await migrate(db);
    const { writer, getWriter } = await writerFor(db);
    const data = createSharedData(getWriter);
    expect(await data.getWorkouts()).toEqual([original]);
    expect(
      await db.getAllAsync<{ id: string }>("SELECT id FROM workout_exercises ORDER BY position"),
    ).toEqual(
      original.exercises.map((_, position) => ({ id: exerciseRowId(original.id, position) })),
    );
    expect(
      await db.getAllAsync<{ id: string }>(
        "SELECT id FROM workout_sets ORDER BY exercise_position, position",
      ),
    ).toEqual(
      original.exercises.flatMap((exercise, exercisePosition) =>
        exercise.sets.map((_, position) => ({
          id: setRowId(original.id, exercisePosition, position),
        })),
      ),
    );
    expect(await writer.opsSince(0)).toEqual([]);
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

  test("saveWorkout logs one op per row and deletes removed rows on re-save", async () => {
    const { db, writer, data } = await setup();
    await data.saveWorkout(workout);
    const first = (await writer.opsSince(0)).map((entry) => entry.op);
    expect(first).toHaveLength(5);
    expect(first.every((op) => op.kind === "set")).toBe(true);
    expect(first.map(tableName)).toEqual([
      "workouts",
      "workout_exercises",
      "workout_exercises",
      "workout_sets",
      "workout_sets",
    ]);

    const afterFirst = (await writer.opsSince(0)).at(-1)?.seq ?? 0;
    await data.saveWorkout({
      ...workout,
      exercises: [
        { ...workout.exercises[0], sets: workout.exercises[0].sets.slice(0, 1) },
        workout.exercises[1],
      ],
    });
    const changed = (await writer.opsSince(afterFirst)).map((entry) => entry.op);
    expect(changed.map((op) => [op.kind, tableName(op), "row" in op ? op.row : ""])).toEqual([
      ["set", "workouts", "w1"],
      ["set", "workout_exercises", exerciseRowId("w1", 0)],
      ["set", "workout_exercises", exerciseRowId("w1", 1)],
      ["set", "workout_sets", setRowId("w1", 0, 0)],
      ["delete", "workout_sets", setRowId("w1", 0, 1)],
    ]);
    expect(await db.getAllAsync("SELECT id FROM workout_sets")).toEqual([
      { id: setRowId("w1", 0, 0) },
    ]);
  });

  test("deleteWorkout logs explicit set, exercise and workout deletes", async () => {
    const { db, writer, data } = await setup();
    await data.saveWorkout(workout);
    const before = await writer.opsSince(0);
    const afterSave = before[before.length - 1].seq;
    await data.deleteWorkout(workout.id);
    const ops = (await writer.opsSince(afterSave)).map((entry) => entry.op);
    expect(ops.map((op) => [op.kind, tableName(op)])).toEqual([
      ["delete", "workout_sets"],
      ["delete", "workout_sets"],
      ["delete", "workout_exercises"],
      ["delete", "workout_exercises"],
      ["delete", "workouts"],
    ]);
    for (const table of ["workouts", "workout_exercises", "workout_sets"]) {
      expect(await db.getAllAsync(`SELECT * FROM ${table}`)).toEqual([]);
    }
  });

  test("saveWaterLog logs only new, changed and removed days", async () => {
    const { writer, data } = await setup();
    await data.saveWaterLog({ "2026-11-17": 500, "2026-11-18": 600 });
    const before = await writer.opsSince(0);
    const afterSave = before[before.length - 1].seq;
    await data.saveWaterLog({ "2026-11-17": 500, "2026-11-19": 700 });
    const ops = (await writer.opsSince(afterSave)).map((entry) => entry.op);
    expect(
      ops.map((op) =>
        op.kind === "set" ? [op.kind, op.row, op.fields.ml] : [op.kind, "row" in op ? op.row : ""],
      ),
    ).toEqual([
      ["set", "2026-11-19", 700],
      ["delete", "2026-11-18"],
    ]);
    expect(await data.getWaterLog()).toEqual({ "2026-11-17": 500, "2026-11-19": 700 });
  });

  test("replaceAll logs a purge_app first", async () => {
    const { writer, data } = await setup();
    await data.saveMeal({ ...meal, id: "old" });
    const before = await writer.opsSince(0);
    const afterSave = before[before.length - 1].seq;
    await data.replaceAll({
      workouts: [workout],
      meals: [meal],
      bodyMetrics: [metrics],
      waterLog: { "2026-11-18": 500 },
      weightUnit: "lbs",
      dailyCalorieGoal: 2000,
    });
    const ops = (await writer.opsSince(afterSave)).map((entry) => entry.op);
    expect(ops.map((op) => op.kind)[0]).toBe("purge_app");
    expect(ops.slice(1).every((op) => op.kind === "set")).toBe(true);
  });

  test("replaying the log reproduces every row of all seven tables", async () => {
    const { db, writer, data } = await setup();
    await data.saveWorkout(workout);
    await data.saveMeal({ ...meal, id: "m0" });
    await data.saveMeal(meal);
    await data.deleteMeal("m0");
    await data.saveBodyMetrics({ ...metrics, bodyFat: 18 });
    await data.saveWaterLog({ "2026-11-18": 750 });
    await data.setWeightUnit("lbs");
    await data.setDailyCalorieGoal(2200);

    const state = applyOps(
      emptyState(),
      (await writer.opsSince(0)).map((entry) => entry.op),
    );
    for (const [table, key] of Object.entries(PRIVATE_KEYS)) {
      const actual = [...materializeTable(state, "fitnexx", table).entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([row, fields]) => ({ [key]: row, ...fields }));
      const expected = await db.getAllAsync<Record<string, string | number | null>>(
        `SELECT * FROM ${table} ORDER BY "${key}"`,
      );
      expect(actual).toEqual(expected.map((row) => ({ ...row })));
    }
  });

  test("baselineIfEmpty logs existing rows once", async () => {
    const db = nodeDb();
    await migrate(db);
    await db.runAsync(
      "INSERT INTO workouts (id, date, title, duration, total_volume) VALUES (?, ?, ?, ?, ?)",
      [workout.id, workout.date, workout.title, workout.duration, workout.totalVolume],
    );
    await db.runAsync(
      "INSERT INTO workout_exercises (id, workout_id, position, exercise_name) VALUES (?, ?, ?, ?)",
      [exerciseRowId("w1", 0), "w1", 0, "Bench Press"],
    );
    await db.runAsync(
      `INSERT INTO workout_sets (id, workout_id, exercise_position, position, exercise_name,
         weight, reps, rpe, set_type, is_pr, pr_types, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [setRowId("w1", 0, 0), "w1", 0, 0, "Bench Press", 80, 8, null, "normal", null, null, null],
    );
    await db.runAsync(
      "INSERT INTO meals (id, date, name, calories, protein, carbs, fat, image_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [meal.id, meal.date, meal.name, meal.calories, meal.protein, meal.carbs, meal.fat, null],
    );
    await db.runAsync(
      `INSERT INTO body_metrics (date, weight, height, body_fat, age, sex, target_weight,
         activity_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        metrics.date,
        metrics.weight,
        metrics.height,
        null,
        metrics.age,
        metrics.sex,
        null,
        metrics.activityLevel,
      ],
    );
    await db.runAsync("INSERT INTO water_log (day, ml) VALUES (?, ?)", ["2026-11-18", 750]);
    await db.runAsync("INSERT INTO preferences (key, value) VALUES (?, ?)", ["weight_unit", "kg"]);
    await db.runAsync("INSERT INTO preferences (key, value) VALUES (?, ?)", [
      "daily_calorie_goal",
      2000,
    ]);

    const { writer } = await writerFor(db);
    expect(await baselineIfEmpty(writer)).toBe(8);
    const ops = (await writer.opsSince(0)).map((entry) => entry.op);
    expect(ops).toHaveLength(8);
    expect(ops.every((op) => op.kind === "set")).toBe(true);
    expect(await baselineIfEmpty(writer)).toBe(0);
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

  test("a non-finite set value rolls back the whole write and logs nothing", async () => {
    const { db, writer, data } = await setup();
    const bad: Workout = {
      ...workout,
      exercises: workout.exercises.map((exercise, index) =>
        index === 0
          ? {
              ...exercise,
              sets: exercise.sets.map((set, setIndex) =>
                setIndex === 0 ? { ...set, weight: Number.POSITIVE_INFINITY } : set,
              ),
            }
          : exercise,
      ),
    };
    await expect(data.saveWorkout(bad)).rejects.toThrow();
    for (const table of ["workouts", "workout_exercises", "workout_sets"]) {
      expect(await db.getAllAsync(`SELECT * FROM ${table}`)).toEqual([]);
    }
    expect(await writer.opsSince(0)).toEqual([]);
  });

  test("legacy import only fills what was saved", async () => {
    const { data } = await setup();
    await data.setWeightUnit("lbs");
    await data.importLegacy({ meals: [meal], dailyCalorieGoal: undefined });
    expect(await data.getMeals()).toEqual([meal]);
    expect(await data.getWeightUnit()).toBe("lbs");
  });
});

describe("public change notifications", () => {
  async function tracked() {
    const db = nodeDb();
    await migrate(db);
    const { getWriter } = await writerFor(db);
    const changes: PublicChange[] = [];
    const data = createSharedData(getWriter, (change) => {
      changes.push(change);
    });
    return { db, data, changes };
  }

  test("saveMeal reports the meal's local day", async () => {
    const { data, changes } = await tracked();
    await data.saveMeal(meal);
    expect(changes).toEqual([{ mealDays: [dayKey(new Date(meal.date))] }]);
  });

  test("updateMeal reports both the old and the merged local day", async () => {
    const { data, changes } = await tracked();
    await data.saveMeal(meal);
    changes.length = 0;
    const date = new Date(2026, 10, 19, 12).toISOString();
    await data.updateMeal(meal.id, { date });
    expect(changes).toEqual([{ mealDays: [dayKey(new Date(meal.date)), dayKey(new Date(date))] }]);
  });

  test("deleteMeal reports the deleted meal's local day, missing ids report nothing", async () => {
    const { data, changes } = await tracked();
    await data.saveMeal(meal);
    changes.length = 0;
    await data.deleteMeal(meal.id);
    expect(changes).toEqual([{ mealDays: [dayKey(new Date(meal.date))] }]);
    changes.length = 0;
    await data.deleteMeal("missing");
    expect(changes).toEqual([]);
  });

  test("saveWorkout reports the id", async () => {
    const { data, changes } = await tracked();
    await data.saveWorkout(workout);
    expect(changes).toEqual([{ workouts: [workout.id] }]);
  });

  test("saveBodyMetrics reports the metrics' local day", async () => {
    const { data, changes } = await tracked();
    await data.saveBodyMetrics(metrics);
    expect(changes).toEqual([{ weightDays: [dayKey(new Date(metrics.date))] }]);
  });

  test("replaceAll reports a full rebuild", async () => {
    const { data, changes } = await tracked();
    await data.replaceAll({
      workouts: [workout],
      meals: [meal],
      bodyMetrics: [metrics],
      waterLog: {},
      weightUnit: "kg",
      dailyCalorieGoal: null,
    });
    expect(changes).toEqual([{ all: true }]);
  });

  test("a throwing onChange does not reject the write", async () => {
    const db = nodeDb();
    await migrate(db);
    const { getWriter } = await writerFor(db);
    const data = createSharedData(getWriter, () => {
      throw new Error("notify failed");
    });
    await expect(data.saveMeal(meal)).resolves.toBeUndefined();
    expect((await data.getMeals()).map((m) => m.id)).toEqual([meal.id]);
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
