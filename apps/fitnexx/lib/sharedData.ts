import type { Change, Writer, WriterTransaction } from "@devdaj/app-data/writer";
import { KEYS } from "./backupSchema";
import type { PublicChange } from "./publicData";
import { dayKey } from "./streak";
import type { BodyMetrics, Meal, PrType, SetType, WeightUnit, Workout, WorkoutSet } from "./types";

/**
 * This database is PRIVATE to Fitnexx (`fitnexx-data.db`); siblings cannot read it. Siblings read
 * only the three public summary views defined in `publicData.ts` from the shared `data.db`.
 * Other private data (gyms with their locations, templates, reminders, AI keys, sync secrets)
 * stays in AsyncStorage.
 *
 * meals          id, date, name, calories, protein, carbs, fat, image_uri
 * workouts       id, date, title, duration, total_volume
 * workout_exercises  id (<workout_id>:<position>), workout_id, position, exercise_name
 * workout_sets   id (<workout_id>:<exercise_position>:<position>), workout_id,
 *                exercise_position, position, exercise_name, weight, reps, rpe,
 *                set_type, is_pr, pr_types (JSON array), notes
 * body_metrics   date, weight, height, body_fat, age, sex, target_weight, activity_level
 * water_log      day (YYYY-MM-DD), ml
 * preferences    key, value: weight_unit ("kg" | "lbs"), daily_calorie_goal (kcal)
 */

/** The parts of expo-sqlite's `SQLiteDatabase` used here (tests run them on node:sqlite). */
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlParam[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

type SqlParam = string | number | null;

export const SCHEMA_VERSION = 2;

const ROW_ID_SEPARATOR = ":";

/** Row id for one exercise: `<workout_id>:<position>`. */
export function exerciseRowId(workoutId: string, position: number): string {
  return `${workoutId}${ROW_ID_SEPARATOR}${position}`;
}

/** Row id for one set: `<workout_id>:<exercise_position>:<position>`. */
export function setRowId(workoutId: string, exercisePosition: number, position: number): string {
  return `${workoutId}${ROW_ID_SEPARATOR}${exercisePosition}${ROW_ID_SEPARATOR}${position}`;
}

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

/** Rebuilds the two detail tables with row ids. */
const SCHEMA_V2 = `
CREATE TABLE workout_exercises_v2 (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  exercise_name TEXT NOT NULL,
  UNIQUE (workout_id, position)
);

CREATE TABLE workout_sets_v2 (
  id TEXT PRIMARY KEY,
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
  UNIQUE (workout_id, exercise_position, position)
);

INSERT INTO workout_exercises_v2 (id, workout_id, position, exercise_name)
SELECT workout_id || '${ROW_ID_SEPARATOR}' || position, workout_id, position, exercise_name
FROM workout_exercises;

INSERT INTO workout_sets_v2 (
  id, workout_id, exercise_position, position, exercise_name, weight, reps, rpe, set_type,
  is_pr, pr_types, notes
)
SELECT workout_id || '${ROW_ID_SEPARATOR}' || exercise_position || '${ROW_ID_SEPARATOR}' || position,
  workout_id, exercise_position, position, exercise_name, weight, reps, rpe, set_type,
  is_pr, pr_types, notes
FROM workout_sets;

DROP TABLE workout_exercises;
DROP TABLE workout_sets;
ALTER TABLE workout_exercises_v2 RENAME TO workout_exercises;
ALTER TABLE workout_sets_v2 RENAME TO workout_sets;

CREATE INDEX IF NOT EXISTS workout_exercises_workout_idx ON workout_exercises (workout_id);
CREATE INDEX IF NOT EXISTS workout_sets_workout_idx ON workout_sets (workout_id);
CREATE INDEX IF NOT EXISTS workout_sets_exercise_idx ON workout_sets (exercise_name);
`;

/** Creates or upgrades the tables. Safe to run on every launch. */
export async function migrate(db: Db): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) {
    await db.execAsync("PRAGMA foreign_keys = ON;");
    return;
  }
  await db.execAsync("PRAGMA foreign_keys = OFF;");
  try {
    await db.withTransactionAsync(async () => {
      if (version < 1) await db.execAsync(SCHEMA_V1);
      await db.execAsync(SCHEMA_V2);
      await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  } finally {
    await db.execAsync("PRAGMA foreign_keys = ON;");
  }
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

/** Primary-key columns used by the private change-log writer. */
export const PRIVATE_KEYS: Record<string, string> = {
  workouts: "id",
  workout_exercises: "id",
  workout_sets: "id",
  meals: "id",
  body_metrics: "date",
  water_log: "day",
  preferences: "key",
};

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
  id: string;
  workout_id: string;
  position: number;
  exercise_name: string;
}

interface SetRow {
  id: string;
  workout_id: string;
  exercise_position: number;
  position: number;
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

function mealFields(meal: Meal): Record<string, SqlParam> {
  return {
    date: meal.date,
    name: meal.name,
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    image_uri: opt(meal.imageUri),
  };
}

function workoutFields(workout: Workout): Record<string, SqlParam> {
  return {
    date: workout.date,
    title: workout.title,
    duration: workout.duration,
    total_volume: workout.totalVolume,
  };
}

function exerciseFields(
  workoutId: string,
  position: number,
  name: string,
): Record<string, SqlParam> {
  return { workout_id: workoutId, position, exercise_name: name };
}

function setFields(
  workoutId: string,
  exercisePosition: number,
  position: number,
  exerciseName: string,
  set: WorkoutSet,
): Record<string, SqlParam> {
  return {
    workout_id: workoutId,
    exercise_position: exercisePosition,
    position,
    exercise_name: exerciseName,
    weight: set.weight,
    reps: set.reps,
    rpe: opt(set.rpe),
    set_type: set.setType,
    is_pr: opt(set.isPr),
    pr_types: set.prTypes === undefined ? null : JSON.stringify(set.prTypes),
    notes: opt(set.notes),
  };
}

function bodyMetricsFields(metrics: BodyMetrics): Record<string, SqlParam> {
  return {
    weight: metrics.weight,
    height: metrics.height,
    body_fat: opt(metrics.bodyFat),
    age: metrics.age,
    sex: metrics.sex,
    target_weight: opt(metrics.targetWeight),
    activity_level: metrics.activityLevel,
  };
}

/** Writes one workout and its detail rows, returning the row ids just written. */
async function writeWorkout(
  tx: WriterTransaction,
  workout: Workout,
): Promise<{ exerciseIds: Set<string>; setIds: Set<string> }> {
  const exerciseChanges: Change[] = [];
  const setChanges: Change[] = [];
  for (const [position, exercise] of workout.exercises.entries()) {
    exerciseChanges.push({
      kind: "set",
      row: exerciseRowId(workout.id, position),
      fields: exerciseFields(workout.id, position, exercise.exerciseName),
    });
    for (const [setPosition, set] of exercise.sets.entries()) {
      setChanges.push({
        kind: "set",
        row: setRowId(workout.id, position, setPosition),
        fields: setFields(workout.id, position, setPosition, exercise.exerciseName, set),
      });
    }
  }
  await tx.write("workouts", [{ kind: "set", row: workout.id, fields: workoutFields(workout) }]);
  await tx.write("workout_exercises", exerciseChanges);
  await tx.write("workout_sets", setChanges);
  return {
    exerciseIds: new Set(exerciseChanges.map((change) => change.row)),
    setIds: new Set(setChanges.map((change) => change.row)),
  };
}

async function writeMeal(tx: WriterTransaction, meal: Meal): Promise<void> {
  await tx.write("meals", [{ kind: "set", row: meal.id, fields: mealFields(meal) }]);
}

async function writeBodyMetrics(tx: WriterTransaction, metrics: BodyMetrics): Promise<void> {
  await tx.write("body_metrics", [
    { kind: "set", row: metrics.date, fields: bodyMetricsFields(metrics) },
  ]);
}

async function writeWaterLog(tx: WriterTransaction, log: Record<string, number>): Promise<void> {
  const current = await tx.getAll<{ day: string; ml: number }>("SELECT day, ml FROM water_log");
  const changes: Change[] = [];
  for (const [day, ml] of Object.entries(log)) {
    if (!current.some((row) => row.day === day && row.ml === ml)) {
      changes.push({ kind: "set", row: day, fields: { ml } });
    }
  }
  for (const row of current) {
    if (!Object.hasOwn(log, row.day)) changes.push({ kind: "delete", row: row.day });
  }
  await tx.write("water_log", changes);
}

/** Sets one preference row, or deletes it when the value is null. */
async function writePreference(tx: WriterTransaction, key: string, value: SqlParam): Promise<void> {
  const changes: Change[] =
    value === null
      ? [{ kind: "delete", row: key }]
      : [{ kind: "set", row: key, fields: { value } }];
  await tx.write("preferences", changes);
}

async function writeSnapshot(tx: WriterTransaction, data: SharedSnapshot): Promise<void> {
  for (const workout of data.workouts) await writeWorkout(tx, workout);
  for (const meal of data.meals) await writeMeal(tx, meal);
  for (const metrics of data.bodyMetrics) await writeBodyMetrics(tx, metrics);
  await writeWaterLog(tx, data.waterLog);
  await writePreference(tx, "weight_unit", data.weightUnit);
  await writePreference(tx, "daily_calorie_goal", data.dailyCalorieGoal);
}

type GetWriter = () => Promise<{ db: Db; writer: Writer }>;

export function createSharedData(getWriter: GetWriter, onChange?: (change: PublicChange) => void) {
  // One write at a time: transactions on a shared connection must not interleave.
  let queue: Promise<unknown> = Promise.resolve();
  const write = <T>(
    task: (tx: WriterTransaction) => Promise<T>,
    change?: (result: T) => PublicChange | undefined,
  ): Promise<T> => {
    const run = queue.then(async () => {
      const { writer } = await getWriter();
      let result!: T;
      await writer.transaction(async (tx) => {
        result = await task(tx);
      });
      if (onChange && change) {
        try {
          const value = change(result);
          if (value) onChange(value);
        } catch (error) {
          // Notification is best effort: a failed refresh never fails the private write.
          console.warn("Fitnexx public change notification failed", error);
        }
      }
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  };
  const read = async <T>(task: (db: Db) => Promise<T>): Promise<T> => {
    await queue;
    return task((await getWriter()).db);
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
    saveWorkout: (workout: Workout) =>
      write(
        async (tx) => {
          const [oldExercises, oldSets] = await Promise.all([
            tx.getAll<{ id: string }>(
              "SELECT id FROM workout_exercises WHERE workout_id = ? ORDER BY id",
              [workout.id],
            ),
            tx.getAll<{ id: string }>(
              "SELECT id FROM workout_sets WHERE workout_id = ? ORDER BY id",
              [workout.id],
            ),
          ]);
          const { exerciseIds, setIds } = await writeWorkout(tx, workout);
          const staleSets = oldSets.filter((row) => !setIds.has(row.id));
          if (staleSets.length > 0) {
            await tx.write(
              "workout_sets",
              staleSets.map((row) => ({ kind: "delete", row: row.id })),
            );
          }
          const staleExercises = oldExercises.filter((row) => !exerciseIds.has(row.id));
          if (staleExercises.length > 0) {
            await tx.write(
              "workout_exercises",
              staleExercises.map((row) => ({ kind: "delete", row: row.id })),
            );
          }
        },
        () => ({ workouts: [workout.id] }),
      ),
    deleteWorkout: (id: string) =>
      write(
        async (tx) => {
          const [exercises, sets] = await Promise.all([
            tx.getAll<{ id: string }>(
              "SELECT id FROM workout_exercises WHERE workout_id = ? ORDER BY id",
              [id],
            ),
            tx.getAll<{ id: string }>(
              "SELECT id FROM workout_sets WHERE workout_id = ? ORDER BY id",
              [id],
            ),
          ]);
          await tx.write(
            "workout_sets",
            sets.map((row) => ({ kind: "delete", row: row.id })),
          );
          await tx.write(
            "workout_exercises",
            exercises.map((row) => ({ kind: "delete", row: row.id })),
          );
          await tx.write("workouts", [{ kind: "delete", row: id }]);
        },
        () => ({ workouts: [id] }),
      ),

    getMeals,
    saveMeal: (meal: Meal) =>
      write(
        (tx) => writeMeal(tx, meal),
        () => ({ mealDays: [dayKey(new Date(meal.date))] }),
      ),
    async updateMeal(id: string, updates: Partial<Meal>): Promise<void> {
      await write(
        async (tx) => {
          const row = await tx.getFirst<MealRow>("SELECT * FROM meals WHERE id = ?", [id]);
          if (!row) return undefined;
          const merged = { ...toMeal(row), ...updates, id };
          const days = [dayKey(new Date(row.date)), dayKey(new Date(merged.date))];
          await writeMeal(tx, merged);
          return days;
        },
        (days) => (days ? { mealDays: days } : undefined),
      );
    },
    deleteMeal: (id: string) =>
      write(
        async (tx) => {
          const row = await tx.getFirst<{ date: string }>("SELECT date FROM meals WHERE id = ?", [
            id,
          ]);
          await tx.write("meals", [{ kind: "delete", row: id }]);
          return row?.date;
        },
        (date) => (date ? { mealDays: [dayKey(new Date(date))] } : undefined),
      ).then(() => {}),

    getBodyMetrics: () =>
      read(async (db) =>
        (await db.getAllAsync<BodyMetricsRow>("SELECT * FROM body_metrics ORDER BY date DESC")).map(
          toBodyMetrics,
        ),
      ),
    saveBodyMetrics: (metrics: BodyMetrics) =>
      write(
        (tx) => writeBodyMetrics(tx, metrics),
        () => ({ weightDays: [dayKey(new Date(metrics.date))] }),
      ),

    getWaterLog: () =>
      read(async (db) => {
        const rows = await db.getAllAsync<{ day: string; ml: number }>(
          "SELECT day, ml FROM water_log ORDER BY day",
        );
        return Object.fromEntries(rows.map((row) => [row.day, row.ml])) as Record<string, number>;
      }),
    saveWaterLog: (log: Record<string, number>) => write((tx) => writeWaterLog(tx, log)),

    async getWeightUnit(): Promise<WeightUnit> {
      return (await getPreference("weight_unit")) === "lbs" ? "lbs" : "kg";
    },
    setWeightUnit: (unit: WeightUnit) => write((tx) => writePreference(tx, "weight_unit", unit)),

    async getDailyCalorieGoal(): Promise<number | null> {
      const value = await getPreference("daily_calorie_goal");
      return typeof value === "number" ? value : null;
    },
    setDailyCalorieGoal: (goal: number | null) =>
      write((tx) => writePreference(tx, "daily_calorie_goal", goal)),

    /** Replaces everything (backup restore, LAN sync) in one transaction. */
    replaceAll: (data: SharedSnapshot) =>
      write(
        async (tx) => {
          await tx.purge();
          await writeSnapshot(tx, data);
        },
        () => ({ all: true }),
      ),

    clearAll: () =>
      write(
        async (tx) => {
          await tx.purge();
        },
        () => ({ all: true }),
      ),

    /** One-time import of data saved by versions that kept everything in AsyncStorage. */
    importLegacy: (data: Partial<SharedSnapshot>) =>
      write(
        async (tx) => {
          for (const workout of data.workouts ?? []) await writeWorkout(tx, workout);
          for (const meal of data.meals ?? []) await writeMeal(tx, meal);
          for (const metrics of data.bodyMetrics ?? []) await writeBodyMetrics(tx, metrics);
          if (data.waterLog) await writeWaterLog(tx, data.waterLog);
          if (data.weightUnit) await writePreference(tx, "weight_unit", data.weightUnit);
          if (data.dailyCalorieGoal !== undefined) {
            await writePreference(tx, "daily_calorie_goal", data.dailyCalorieGoal);
          }
        },
        () => ({ all: true }),
      ),
  };
}

/** Baselines rows that existed before logging started, parents before children. */
export async function baselineIfEmpty(writer: Writer): Promise<number> {
  return writer.transaction(async (tx) => {
    const logged = await tx.getFirst<{ present: number }>(
      "SELECT 1 AS present FROM _devdaj_log LIMIT 1",
    );
    if (logged) return 0;
    const populated: { table: string; key: string; rows: Record<string, SqlParam>[] }[] = [];
    for (const [table, key] of Object.entries(PRIVATE_KEYS)) {
      const rows = await tx.getAll<Record<string, SqlParam>>(`SELECT * FROM ${table}`);
      if (rows.length > 0) populated.push({ table, key, rows });
    }
    if (populated.length === 0) return 0;
    let written = 0;
    for (const { table, key, rows } of populated) {
      const changes: Change[] = [];
      for (const row of rows) {
        const fields = { ...row };
        const value = fields[key];
        delete fields[key];
        if (value === null || value === undefined) continue;
        changes.push({ kind: "set", row: String(value), fields });
      }
      await tx.write(table, changes);
      written += changes.length;
    }
    return written;
  });
}

export type SharedData = ReturnType<typeof createSharedData>;
