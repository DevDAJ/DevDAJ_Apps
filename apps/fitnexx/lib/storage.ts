import type { AISettings, UsageRecord } from "./ai";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KEYS } from "./backupSchema";
import { sharedData } from "./database";
import { splitKeyedData } from "./sharedData";
import { createEmptySyncTombstones, parseSyncTombstones, type TombstoneKey } from "./syncProtocol";
import type {
  BodyMetrics,
  Gym,
  HabitReminders,
  Meal,
  MealTemplate,
  MetricsReminder,
  Schedule,
  WeightUnit,
  Workout,
  WorkoutTemplate,
} from "./types";

/** Records a deletion for LAN sync, then deletes the row from SQLite. */
async function deleteSharedWithTombstone(
  key: typeof KEYS.WORKOUTS | typeof KEYS.MEALS,
  id: string,
  remove: (id: string) => Promise<void>,
): Promise<void> {
  const operation = deletionQueue.then(async () => {
    const raw = await AsyncStorage.getItem(KEYS.SYNC_TOMBSTONES);
    const tombstones = raw ? parseSyncTombstones(JSON.parse(raw)) : createEmptySyncTombstones();
    tombstones[key] = [...new Set([...tombstones[key], id])];
    await AsyncStorage.setItem(KEYS.SYNC_TOMBSTONES, JSON.stringify(tombstones));
    await remove(id);
  });
  deletionQueue = operation.catch(() => undefined);
  return operation;
}

/** AsyncStorage-backed (private) data: remove the item and record a tombstone together. */
async function deleteWithTombstone(
  key: Exclude<TombstoneKey, typeof KEYS.WORKOUTS | typeof KEYS.MEALS>,
  id?: string,
): Promise<void> {
  const operation = deletionQueue.then(async () => {
    const [[, rawValue], [, rawTombstones]] = await AsyncStorage.multiGet([
      key,
      KEYS.SYNC_TOMBSTONES,
    ]);
    const value = rawValue ? JSON.parse(rawValue) : key === KEYS.SCHEDULE ? null : [];
    const deletedId = id ?? value?.id;
    if (!deletedId) return;
    const tombstones = rawTombstones
      ? parseSyncTombstones(JSON.parse(rawTombstones))
      : createEmptySyncTombstones();
    tombstones[key] = [...new Set([...tombstones[key], deletedId])];
    await AsyncStorage.multiSet([
      [
        key,
        JSON.stringify(
          key === KEYS.SCHEDULE
            ? null
            : value.filter((item: { id: string }) => item.id !== deletedId),
        ),
      ],
      [KEYS.SYNC_TOMBSTONES, JSON.stringify(tombstones)],
    ]);
  });
  deletionQueue = operation.catch(() => undefined);
  return operation;
}

let deletionQueue: Promise<void> = Promise.resolve();

export const storage = {
  // Shared with other DevDAJ apps (SQLite, see sharedData.ts).
  getWorkouts: (): Promise<Workout[]> => sharedData.getWorkouts(),
  saveWorkout: (workout: Workout): Promise<void> => sharedData.saveWorkout(workout),
  deleteWorkout: (id: string): Promise<void> =>
    deleteSharedWithTombstone(KEYS.WORKOUTS, id, sharedData.deleteWorkout),

  async getTemplates(): Promise<WorkoutTemplate[]> {
    const raw = await AsyncStorage.getItem(KEYS.TEMPLATES);
    return raw ? JSON.parse(raw) : [];
  },

  async saveTemplate(template: WorkoutTemplate): Promise<void> {
    const templates = await this.getTemplates();
    const idx = templates.findIndex((t) => t.id === template.id);
    if (idx >= 0) {
      templates[idx] = template;
    } else {
      templates.push(template);
    }
    await AsyncStorage.setItem(KEYS.TEMPLATES, JSON.stringify(templates));
  },

  async deleteTemplate(id: string): Promise<void> {
    await deleteWithTombstone(KEYS.TEMPLATES, id);
  },

  getWeightUnit: (): Promise<WeightUnit> => sharedData.getWeightUnit(),
  setWeightUnit: (unit: WeightUnit): Promise<void> => sharedData.setWeightUnit(unit),

  async getSchedule(): Promise<Schedule | null> {
    const raw = await AsyncStorage.getItem(KEYS.SCHEDULE);
    return raw ? JSON.parse(raw) : null;
  },

  async saveSchedule(schedule: Schedule): Promise<void> {
    await AsyncStorage.setItem(KEYS.SCHEDULE, JSON.stringify(schedule));
  },

  async deleteSchedule(): Promise<void> {
    await deleteWithTombstone(KEYS.SCHEDULE);
  },

  getMeals: (): Promise<Meal[]> => sharedData.getMeals(),
  saveMeal: (meal: Meal): Promise<void> => sharedData.saveMeal(meal),
  deleteMeal: (id: string): Promise<void> =>
    deleteSharedWithTombstone(KEYS.MEALS, id, sharedData.deleteMeal),
  updateMeal: (id: string, updates: Partial<Meal>): Promise<void> =>
    sharedData.updateMeal(id, updates),

  async getMealTemplates(): Promise<MealTemplate[]> {
    const raw = await AsyncStorage.getItem(KEYS.MEAL_TEMPLATES);
    return raw ? JSON.parse(raw) : [];
  },

  async saveMealTemplate(template: MealTemplate): Promise<void> {
    const templates = await this.getMealTemplates();
    const idx = templates.findIndex((t) => t.id === template.id);
    if (idx >= 0) {
      templates[idx] = template;
    } else {
      templates.push(template);
    }
    await AsyncStorage.setItem(KEYS.MEAL_TEMPLATES, JSON.stringify(templates));
  },

  async deleteMealTemplate(id: string): Promise<void> {
    await deleteWithTombstone(KEYS.MEAL_TEMPLATES, id);
  },

  getBodyMetrics: (): Promise<BodyMetrics[]> => sharedData.getBodyMetrics(),
  saveBodyMetrics: (metrics: BodyMetrics): Promise<void> => sharedData.saveBodyMetrics(metrics),

  async getGyms(): Promise<Gym[]> {
    const raw = await AsyncStorage.getItem(KEYS.GYMS);
    return raw ? JSON.parse(raw) : [];
  },

  async saveGym(gym: Gym): Promise<void> {
    const gyms = await this.getGyms();
    const idx = gyms.findIndex((g) => g.id === gym.id);
    if (idx >= 0) {
      gyms[idx] = gym;
    } else {
      gyms.push(gym);
    }
    await AsyncStorage.setItem(KEYS.GYMS, JSON.stringify(gyms));
  },

  async deleteGym(id: string): Promise<void> {
    await deleteWithTombstone(KEYS.GYMS, id);
  },

  async getMetricsReminder(): Promise<MetricsReminder | null> {
    const raw = await AsyncStorage.getItem(KEYS.METRICS_REMINDER);
    return raw ? JSON.parse(raw) : null;
  },

  async setMetricsReminder(reminder: MetricsReminder): Promise<void> {
    await AsyncStorage.setItem(KEYS.METRICS_REMINDER, JSON.stringify(reminder));
  },

  getDailyCalorieGoal: (): Promise<number | null> => sharedData.getDailyCalorieGoal(),
  setDailyCalorieGoal: (goal: number | null): Promise<void> => sharedData.setDailyCalorieGoal(goal),
  getWaterLog: (): Promise<Record<string, number>> => sharedData.getWaterLog(),
  saveWaterLog: (log: Record<string, number>): Promise<void> => sharedData.saveWaterLog(log),

  /**
   * Writes a validated backup or sync payload (keyed like `KEYS`): shared data replaces what's in
   * SQLite, everything else goes to AsyncStorage.
   */
  async replaceKeyedData(data: Record<string, unknown>): Promise<void> {
    const { shared, rest } = splitKeyedData(data);
    await sharedData.replaceAll(shared);
    if (rest.length > 0) await AsyncStorage.multiSet(rest);
  },
  /** Wipes all shared data ("Clear all data"). */
  clearSharedData: (): Promise<void> => sharedData.clearAll(),

  async getHabitReminders(): Promise<HabitReminders | null> {
    const raw = await AsyncStorage.getItem(KEYS.REMINDERS);
    return raw ? (JSON.parse(raw) as HabitReminders) : null;
  },

  async saveHabitReminders(reminders: HabitReminders): Promise<void> {
    await AsyncStorage.setItem(KEYS.REMINDERS, JSON.stringify(reminders));
  },

  async getPro(): Promise<boolean> {
    const raw = await AsyncStorage.getItem(KEYS.PRO);
    return raw === "true";
  },

  async setPro(pro: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.PRO, String(pro));
  },

  async getAISettings(): Promise<AISettings> {
    const raw = await AsyncStorage.getItem(KEYS.AI_SETTINGS);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    // Settings saved before the OpenRouter switch hold provider-scoped model
    // ids (no vendor prefix); reset those to the default catalog model.
    if (
      saved &&
      typeof saved === "object" &&
      "model" in saved &&
      typeof saved.model === "string" &&
      saved.model.includes("/")
    ) {
      return { model: saved.model };
    }
    return { model: "openai/gpt-4.1-mini" };
  },

  async saveAISettings(settings: AISettings): Promise<void> {
    await AsyncStorage.setItem(KEYS.AI_SETTINGS, JSON.stringify(settings));
  },

  async getAIUsage(): Promise<UsageRecord[]> {
    const raw = await AsyncStorage.getItem(KEYS.AI_USAGE);
    return raw ? JSON.parse(raw) : [];
  },

  async saveAIUsage(records: UsageRecord[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.AI_USAGE, JSON.stringify(records));
  },

  async getSyncTombstones() {
    const raw = await AsyncStorage.getItem(KEYS.SYNC_TOMBSTONES);
    return raw ? parseSyncTombstones(JSON.parse(raw)) : createEmptySyncTombstones();
  },

  async isInitialized(): Promise<boolean> {
    return (await AsyncStorage.getItem(KEYS.INITIALIZED)) === "true";
  },

  async markInitialized(): Promise<void> {
    await AsyncStorage.setItem(KEYS.INITIALIZED, "true");
  },
};
