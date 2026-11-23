import type {
  FoodAnalysisItem,
  FoodAnalysisJob,
  FoodAnalysisResult,
  FoodAnalysisTotals,
  NutrientValues,
} from "./types";

export const FOOD_ANALYSIS_MAX_ATTEMPTS = 25;
export const FOOD_ANALYSIS_JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const FOOD_ANALYSIS_MAX_DELAY_MS = 60 * 60 * 1000;
const BASE_DELAY_MS = 30 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Portion changes are pure arithmetic: grams multiplied by values saved per gram. */
export function calculateItemMacros(perGram: NutrientValues, grams: number): NutrientValues {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) {
    throw new Error("Grams must be between 0 and 5000.");
  }
  for (const [key, value] of Object.entries(perGram)) {
    if (!Number.isFinite(value) || value < 0 || value > 1000) {
      throw new Error(`Invalid per-gram value: ${key}.`);
    }
  }
  return {
    calories: round(perGram.calories * grams),
    protein: round(perGram.protein * grams),
    carbs: round(perGram.carbs * grams),
    fat: round(perGram.fat * grams),
    fiber: round(perGram.fiber * grams),
  };
}

export function calculateComponentTotals(
  components: FoodAnalysisItem[],
  gramsById: Record<string, number>,
): FoodAnalysisTotals {
  return components.reduce<FoodAnalysisTotals>(
    (total, component) => {
      const grams = gramsById[component.id] ?? component.grams;
      const macros = calculateItemMacros(component.perGram, grams);
      return {
        grams: round(total.grams + grams),
        calories: round(total.calories + macros.calories),
        protein: round(total.protein + macros.protein),
        carbs: round(total.carbs + macros.carbs),
        fat: round(total.fat + macros.fat),
        fiber: round(total.fiber + macros.fiber),
      };
    },
    { grams: 0, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

export function sumTotals(items: FoodAnalysisItem[]): FoodAnalysisTotals {
  return calculateComponentTotals(
    items,
    Object.fromEntries(items.map((item) => [item.id, item.grams])),
  );
}

function isNutrientValues(value: unknown): value is NutrientValues {
  if (!isRecord(value)) return false;
  return ["calories", "protein", "carbs", "fat", "fiber"].every(
    (key) =>
      typeof value[key] === "number" && Number.isFinite(value[key]) && (value[key] as number) >= 0,
  );
}

function parseAnalysisItem(value: unknown): FoodAnalysisItem {
  if (!isRecord(value)) throw new Error("Invalid analysis item.");
  const text = (field: string, max: number): string => {
    const item = value[field];
    if (typeof item !== "string" || !item.trim() || item.length > max) {
      throw new Error(`Invalid analysis item field: ${field}.`);
    }
    return item.trim();
  };
  const amount = (field: string, max: number): number => {
    const item = value[field];
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > max) {
      throw new Error(`Invalid analysis item field: ${field}.`);
    }
    return item;
  };
  const consistency = value.consistency;
  if (!isRecord(consistency)) throw new Error("Invalid consistency check.");
  return {
    id: text("id", 120),
    componentId: typeof value.componentId === "string" ? value.componentId : null,
    name: text("name", 120),
    preparation: typeof value.preparation === "string" ? value.preparation.slice(0, 120) : null,
    portionDescription: text("portionDescription", 280),
    grams: amount("grams", 5000),
    estimatedGrams: amount("estimatedGrams", 5000),
    per100: isNutrientValues(value.per100)
      ? value.per100
      : (() => {
          throw new Error("Invalid per-100g values.");
        })(),
    perGram: isNutrientValues(value.perGram)
      ? value.perGram
      : (() => {
          throw new Error("Invalid per-gram values.");
        })(),
    source: value.source === "usda" ? "usda" : "ai",
    fdcId: typeof value.fdcId === "string" ? value.fdcId : null,
    confidence: amount("confidence", 1),
    consistency: {
      expectedCalories:
        typeof consistency.expectedCalories === "number" && consistency.expectedCalories >= 0
          ? consistency.expectedCalories
          : 0,
      delta:
        typeof consistency.delta === "number" && Number.isFinite(consistency.delta)
          ? consistency.delta
          : 0,
      ok: consistency.ok === true,
      note: typeof consistency.note === "string" ? consistency.note.slice(0, 280) : "",
    },
  };
}

export function parseAnalysisResult(value: unknown): FoodAnalysisResult {
  if (!isRecord(value)) throw new Error("Invalid analysis result.");
  if (typeof value.requestId !== "string" || !value.requestId) {
    throw new Error("Analysis result needs a request ID.");
  }
  if (typeof value.scanId !== "string" || !value.scanId) {
    throw new Error("Analysis result needs a scan ID.");
  }
  if (!Array.isArray(value.components) || value.components.length === 0) {
    throw new Error("Analysis result needs at least one component.");
  }
  const components = value.components.map(parseAnalysisItem);
  return {
    requestId: value.requestId,
    scanId: value.scanId,
    components,
    totals: sumTotals(components),
    visionModel: typeof value.visionModel === "string" ? value.visionModel : "unknown",
    nutritionModel: typeof value.nutritionModel === "string" ? value.nutritionModel : "unknown",
    cacheHits: typeof value.cacheHits === "number" ? value.cacheHits : 0,
  };
}

export function parseAnalysisJob(value: unknown): FoodAnalysisJob {
  if (!isRecord(value)) throw new Error("Invalid analysis job.");
  if (typeof value.id !== "string" || !value.id) {
    throw new Error("Analysis job needs an ID.");
  }
  if (typeof value.ownerId !== "string" || !value.ownerId) {
    throw new Error("Analysis job needs an owner.");
  }
  if (typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))) {
    throw new Error("Analysis job needs a creation date.");
  }
  if (typeof value.nextAttemptAt !== "string" || Number.isNaN(Date.parse(value.nextAttemptAt))) {
    throw new Error("Analysis job needs a retry date.");
  }
  if (
    typeof value.attempts !== "number" ||
    !Number.isInteger(value.attempts) ||
    value.attempts < 0
  ) {
    throw new Error("Analysis job needs an attempt count.");
  }
  if (value.status !== "pending" && value.status !== "ready" && value.status !== "failed") {
    throw new Error("Analysis job needs a valid status.");
  }
  if (!isRecord(value.request)) throw new Error("Analysis job needs a request.");
  const request = value.request;
  if (request.requestId !== value.id) {
    throw new Error("Analysis request ID must match the job ID.");
  }
  if (typeof request.scanId !== "string" || !request.scanId) {
    throw new Error("Analysis request needs a scan ID.");
  }
  const job: FoodAnalysisJob = {
    id: value.id,
    ownerId: value.ownerId,
    createdAt: value.createdAt,
    nextAttemptAt: value.nextAttemptAt,
    attempts: value.attempts,
    status: value.status,
    request: { requestId: value.id, scanId: request.scanId },
  };
  if (value.result !== undefined) {
    const result = parseAnalysisResult(value.result);
    if (result.requestId !== value.id) {
      throw new Error("Analysis result must match the job ID.");
    }
    job.result = result;
  }
  if (value.lastError !== undefined) {
    if (typeof value.lastError !== "string") throw new Error("Invalid job error.");
    job.lastError = value.lastError;
  }
  return job;
}

export function parseAnalysisJobs(value: unknown): FoodAnalysisJob[] {
  if (!Array.isArray(value)) return [];
  const jobs: FoodAnalysisJob[] = [];
  for (const item of value) {
    try {
      jobs.push(parseAnalysisJob(item));
    } catch {
      // Drop corrupt entries so one bad job cannot block the queue.
    }
  }
  return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Exponential backoff with full jitter, capped at one hour. */
export function nextRetryAt(
  attempts: number,
  now = Date.now(),
  random: () => number = Math.random,
): string {
  const delay = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts), FOOD_ANALYSIS_MAX_DELAY_MS);
  return new Date(now + Math.floor(random() * delay)).toISOString();
}

export function isJobExpired(job: FoodAnalysisJob, now = Date.now()): boolean {
  return now - Date.parse(job.createdAt) > FOOD_ANALYSIS_JOB_TTL_MS;
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  return /timeout|network|fetch|econn|enotfound|socket/i.test(error.message);
}
