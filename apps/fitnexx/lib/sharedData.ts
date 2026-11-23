import { KEYS } from "./backupSchema";
import type { BodyMetrics, Meal, PrType, SetType, WeightUnit, Workout, WorkoutSet } from "./types";

/**
 * Fitnexx's shareable data lives in SQLite (`@devdaj/app-data`), where other DevDAJ apps can
 * read it. Private data (gyms with their locations, templates, reminders, AI keys, sync
 * secrets) stays in AsyncStorage.
 *
 * Other apps query these tables directly, so treat them as a public API: add columns or
 * tables, never rename or remove them.
 *
 * meals          id, date, name, calories, protein, carbs, fat, image_uri
 * workouts       id, date, title, duration, total_volume
 * workout_exercises  workout_id, position, exercise_name
 * workout_sets   workout_id, exercise_position, position, exercise_name, weight, reps, rpe,
 *                set_type, is_pr, pr_types (JSON array), notes
 * body_metrics   date, weight, height, body_fat, age, sex, target_weight, activity_level
 * water_log      day (YYYY-MM-DD), ml
 * preferences    key, value: weight_unit ("kg" | "lbs"), daily_calorie_goal (kcal)
 */

/** The parts of expo-sqlite's `SQLiteDatabase` used here (tests run them on node:sqlite). */
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlParam[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

type SqlParam = string | number | null;

export const SCHEMA_VERSION = 1;

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL,
  image_uri TEXT
);
CREATE INDEX IF NOT EXISTS meals_date_idx ON meals (date);

CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  duration REAL NOT NULL,
  total_volume REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS workouts_date_idx ON workouts (date);

CREATE TABLE IF NOT EXISTS workout_exercises (
  workout_id TEXT NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  exercise_name TEXT NOT NULL,
  PRIMARY KEY (workout_id, position)
);

CREATE TABLE IF NOT EXISTS workout_sets (
  workout_id TEXT NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
  exercise_position INTEGER NOT NULL,
  position INTEGER NOT NULL,
  exercise_name TEXT NOT NULL,
  weight REAL NOT NULL,
  reps REAL NOT NULL,
  rpe REAL,
  set_type TEXT NOT NULL,
  is_pr INTEGER,
  pr_types TEXT,
  notes TEXT,
  PRIMARY KEY (workout_id, exercise_position, position)
);
CREATE INDEX IF NOT EXISTS workout_sets_exercise_idx ON workout_sets (exercise_name);

CREATE TABLE IF NOT EXISTS body_metrics (
  date TEXT PRIMARY KEY,
  weight REAL NOT NULL,
  height REAL NOT NULL,
  body_fat REAL,
  age REAL NOT NULL,
  sex TEXT NOT NULL,
  target_weight REAL,
  activity_level TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS water_log (
  day TEXT PRIMARY KEY,
  ml REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY,
  value
);
`;

/** Creates or upgrades the tables. Safe to run on every launch. */
export async function migrate(db: Db): Promise<void> {
  await db.execAsync("PRAGMA foreign_keys = ON;");
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;
  await db.withTransactionAsync(async () => {
    if (version < 1) await db.execAsync(SCHEMA_V1);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

/** AsyncStorage / backup / sync keys whose data lives in SQLite. */
export const SHARED_KEYS: readonly string[] = [
  KEYS.WORKOUTS,
  KEYS.MEALS,
  KEYS.BODY_METRICS,
  KEYS.WATER,
  KEYS.WEIGHT_UNIT,
  KEYS.DAILY_CALORIE_GOAL,
];

/**
 * Splits a validated backup or sync payload (keyed like the old AsyncStorage keys) into the
 * part that goes to SQLite and the AsyncStorage entries for everything else.
 */
export function splitKeyedData(data: Record<string, unknown>): {
  shared: SharedSnapshot;
  rest: [string, string][];
} {
  const unit = data[KEYS.WEIGHT_UNIT];
  const goal = data[KEYS.DAILY_CALORIE_GOAL];
  return {
    shared: {
      workouts: (data[KEYS.WORKOUTS] as Workout[] | undefined) ?? [],
      meals: (data[KEYS.MEALS] as Meal[] | undefined) ?? [],
      bodyMetrics: (data[KEYS.BODY_METRICS] as BodyMetrics[] | undefined) ?? [],
      waterLog: (data[KEYS.WATER] as Record<string, number> | undefined) ?? {},
      weightUnit: unit === "lbs" ? "lbs" : "kg",
      dailyCalorieGoal: typeof goal === "number" ? goal : null,
    },
    rest: Object.entries(data)
      .filter(([key]) => !SHARED_KEYS.includes(key))
      .map(([key, value]) => [key, JSON.stringify(value)]),
  };
}

/** Everything stored in SQLite, in the app's own shapes. */
export interface SharedSnapshot {
  workouts: Workout[];
  meals: Meal[];
  bodyMetrics: BodyMetrics[];
  waterLog: Record<string, number>;
  weightUnit: WeightUnit;
  dailyCalorieGoal: number | null;
}

interface MealRow {
  id: string;
  date: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  image_uri: string | null;
}

interface WorkoutRow {
  id: string;
  date: string;
  title: string;
  duration: number;
  total_volume: number;
}

interface ExerciseRow {
  workout_id: string;
  position: number;
  exercise_name: string;
}

interface SetRow {
  workout_id: string;
  exercise_position: number;
  weight: number;
  reps: number;
  rpe: number | null;
  set_type: string;
  is_pr: number | null;
  pr_types: string | null;
  notes: string | null;
}

interface BodyMetricsRow {
  date: string;
  weight: number;
  height: number;
  body_fat: number | null;
  age: number;
  sex: BodyMetrics["sex"];
  target_weight: number | null;
  activity_level: BodyMetrics["activityLevel"];
}

/** `undefined` and `null` both become NULL; NULL reads back as a missing field. */
const opt = (value: string | number | boolean | undefined | null): SqlParam =>
  value === undefined || value === null ? null : typeof value === "boolean" ? Number(value) : value;

function toMeal(row: MealRow): Meal {
  const meal: Meal = {
    id: row.id,
    date: row.date,
    name: row.name,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
  };
  if (row.image_uri !== null) meal.imageUri = row.image_uri;
  return meal;
}

function toSet(row: SetRow): WorkoutSet {
  const set: WorkoutSet = { weight: row.weight, reps: row.reps, setType: row.set_type as SetType };
  if (row.rpe !== null) set.rpe = row.rpe;
  if (row.notes !== null) set.notes = row.notes;
  if (row.is_pr !== null) set.isPr = row.is_pr === 1;
  if (row.pr_types !== null) set.prTypes = JSON.parse(row.pr_types) as PrType[];
  return set;
}

function toBodyMetrics(row: BodyMetricsRow): BodyMetrics {
  const metrics: BodyMetrics = {
    date: row.date,
    weight: row.weight,
    height: row.height,
    age: row.age,
    sex: row.sex,
    activityLevel: row.activity_level,
  };
  if (row.body_fat !== null) metrics.bodyFat = row.body_fat;
  if (row.target_weight !== null) metrics.targetWeight = row.target_weight;
  return metrics;
}

async function writeMeal(db: Db, meal: Meal): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO meals (id, date, name, calories, protein, carbs, fat, image_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      meal.id,
      meal.date,
      meal.name,
      meal.calories,
      meal.protein,
      meal.carbs,
      meal.fat,
      opt(meal.imageUri),
    ],
  );
}

async function writeWorkout(db: Db, workout: Workout): Promise<void> {
  // Replacing the parent row cascades to its exercises and sets.
  await db.runAsync("DELETE FROM workouts WHERE id = ?", [workout.id]);
  await db.runAsync(
    "INSERT INTO workouts (id, date, title, duration, total_volume) VALUES (?, ?, ?, ?, ?)",
    [workout.id, workout.date, workout.title, workout.duration, workout.totalVolume],
  );
  for (const [position, exercise] of workout.exercises.entries()) {
    await db.runAsync(
      "INSERT INTO workout_exercises (workout_id, position, exercise_name) VALUES (?, ?, ?)",
      [workout.id, position, exercise.exerciseName],
    );
    for (const [setPosition, set] of exercise.sets.entries()) {
      await db.runAsync(
        `INSERT INTO workout_sets (workout_id, exercise_position, position, exercise_name, weight,
           reps, rpe, set_type, is_pr, pr_types, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          workout.id,
          position,
          setPosition,
          exercise.exerciseName,
          set.weight,
          set.reps,
          opt(set.rpe),
          set.setType,
          opt(set.isPr),
          set.prTypes === undefined ? null : JSON.stringify(set.prTypes),
          opt(set.notes),
        ],
      );
    }
  }
}

async function writeBodyMetrics(db: Db, metrics: BodyMetrics): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO body_metrics (date, weight, height, body_fat, age, sex, target_weight,
       activity_level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      metrics.date,
      metrics.weight,
      metrics.height,
      opt(metrics.bodyFat),
      metrics.age,
      metrics.sex,
      opt(metrics.targetWeight),
      metrics.activityLevel,
    ],
  );
}

async function writeWaterLog(db: Db, log: Record<string, number>): Promise<void> {
  await db.runAsync("DELETE FROM water_log", []);
  for (const [day, ml] of Object.entries(log)) {
    await db.runAsync("INSERT INTO water_log (day, ml) VALUES (?, ?)", [day, ml]);
  }
}

async function writePreference(db: Db, key: string, value: SqlParam): Promise<void> {
  if (value === null) await db.runAsync("DELETE FROM preferences WHERE key = ?", [key]);
  else
    await db.runAsync("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)", [
      key,
      value,
    ]);
}

async function writeSnapshot(db: Db, data: SharedSnapshot): Promise<void> {
  for (const workout of data.workouts) await writeWorkout(db, workout);
  for (const meal of data.meals) await writeMeal(db, meal);
  for (const metrics of data.bodyMetrics) await writeBodyMetrics(db, metrics);
  await writeWaterLog(db, data.waterLog);
  await writePreference(db, "weight_unit", data.weightUnit);
  await writePreference(db, "daily_calorie_goal", data.dailyCalorieGoal);
}

const CLEAR_ALL = `
DELETE FROM workout_sets; DELETE FROM workout_exercises; DELETE FROM workouts;
DELETE FROM meals; DELETE FROM body_metrics; DELETE FROM water_log; DELETE FROM preferences;
`;

export function createSharedData(getDb: () => Promise<Db>) {
  // One write at a time: transactions on a shared connection must not interleave.
  let queue: Promise<unknown> = Promise.resolve();
  const write = <T>(task: (db: Db) => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      const db = await getDb();
      let result!: T;
      await db.withTransactionAsync(async () => {
        result = await task(db);
      });
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  };
  const read = async <T>(task: (db: Db) => Promise<T>): Promise<T> => {
    await queue;
    return task(await getDb());
  };

  const getWorkouts = () =>
    read(async (db) => {
      const [workouts, exercises, sets] = await Promise.all([
        db.getAllAsync<WorkoutRow>("SELECT * FROM workouts ORDER BY date DESC"),
        db.getAllAsync<ExerciseRow>(
          "SELECT * FROM workout_exercises ORDER BY workout_id, position",
        ),
        db.getAllAsync<SetRow>(
          "SELECT * FROM workout_sets ORDER BY workout_id, exercise_position, position",
        ),
      ]);
      const setsByExercise = new Map<string, WorkoutSet[]>();
      for (const row of sets) {
        const key = `${row.workout_id}\u0000${row.exercise_position}`;
        const list = setsByExercise.get(key) ?? [];
        list.push(toSet(row));
        setsByExercise.set(key, list);
      }
      const exercisesByWorkout = new Map<string, Workout["exercises"]>();
      for (const row of exercises) {
        const list = exercisesByWorkout.get(row.workout_id) ?? [];
        list.push({
          exerciseName: row.exercise_name,
          sets: setsByExercise.get(`${row.workout_id}\u0000${row.position}`) ?? [],
        });
        exercisesByWorkout.set(row.workout_id, list);
      }
      return workouts.map((row): Workout => ({
        id: row.id,
        date: row.date,
        title: row.title,
        duration: row.duration,
        totalVolume: row.total_volume,
        exercises: exercisesByWorkout.get(row.id) ?? [],
      }));
    });

  const getMeals = () =>
    read(async (db) =>
      (await db.getAllAsync<MealRow>("SELECT * FROM meals ORDER BY date DESC")).map(toMeal),
    );

  const getPreference = (key: string) =>
    read(async (db) => {
      const row = await db.getFirstAsync<{ value: SqlParam }>(
        "SELECT value FROM preferences WHERE key = ?",
        [key],
      );
      return row?.value ?? null;
    });

  return {
    getWorkouts,
    saveWorkout: (workout: Workout) => write((db) => writeWorkout(db, workout)),
    deleteWorkout: (id: string) =>
      write((db) => db.runAsync("DELETE FROM workouts WHERE id = ?", [id]).then(() => {})),

    getMeals,
    saveMeal: (meal: Meal) => write((db) => writeMeal(db, meal)),
    async updateMeal(id: string, updates: Partial<Meal>): Promise<void> {
      await write(async (db) => {
        const row = await db.getFirstAsync<MealRow>("SELECT * FROM meals WHERE id = ?", [id]);
        if (row) await writeMeal(db, { ...toMeal(row), ...updates, id });
      });
    },
    deleteMeal: (id: string) =>
      write((db) => db.runAsync("DELETE FROM meals WHERE id = ?", [id]).then(() => {})),

    getBodyMetrics: () =>
      read(async (db) =>
        (await db.getAllAsync<BodyMetricsRow>("SELECT * FROM body_metrics ORDER BY date DESC")).map(
          toBodyMetrics,
        ),
      ),
    saveBodyMetrics: (metrics: BodyMetrics) => write((db) => writeBodyMetrics(db, metrics)),

    getWaterLog: () =>
      read(async (db) => {
        const rows = await db.getAllAsync<{ day: string; ml: number }>(
          "SELECT day, ml FROM water_log ORDER BY day",
        );
        return Object.fromEntries(rows.map((row) => [row.day, row.ml])) as Record<string, number>;
      }),
    saveWaterLog: (log: Record<string, number>) => write((db) => writeWaterLog(db, log)),

    async getWeightUnit(): Promise<WeightUnit> {
      return (await getPreference("weight_unit")) === "lbs" ? "lbs" : "kg";
    },
    setWeightUnit: (unit: WeightUnit) => write((db) => writePreference(db, "weight_unit", unit)),

    async getDailyCalorieGoal(): Promise<number | null> {
      const value = await getPreference("daily_calorie_goal");
      return typeof value === "number" ? value : null;
    },
    setDailyCalorieGoal: (goal: number | null) =>
      write((db) => writePreference(db, "daily_calorie_goal", goal)),

    /** Replaces everything (backup restore, LAN sync) in one transaction. */
    replaceAll: (data: SharedSnapshot) =>
      write(async (db) => {
        await db.execAsync(CLEAR_ALL);
        await writeSnapshot(db, data);
      }),

    clearAll: () => write((db) => db.execAsync(CLEAR_ALL)),

    /** One-time import of data saved by versions that kept everything in AsyncStorage. */
    importLegacy: (data: Partial<SharedSnapshot>) =>
      write(async (db) => {
        for (const workout of data.workouts ?? []) await writeWorkout(db, workout);
        for (const meal of data.meals ?? []) await writeMeal(db, meal);
        for (const metrics of data.bodyMetrics ?? []) await writeBodyMetrics(db, metrics);
        if (data.waterLog) await writeWaterLog(db, data.waterLog);
        if (data.weightUnit) await writePreference(db, "weight_unit", data.weightUnit);
        if (data.dailyCalorieGoal !== undefined) {
          await writePreference(db, "daily_calorie_goal", data.dailyCalorieGoal);
        }
      }),
  };
}

export type SharedData = ReturnType<typeof createSharedData>;
