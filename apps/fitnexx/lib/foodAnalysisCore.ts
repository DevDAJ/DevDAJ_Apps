import { parseDetectedFoods } from "./foodVision";
import type {
  FoodAnalysisItem,
  FoodAnalysisJob,
  FoodAnalysisResult,
  FoodAnalysisTotals,
} from "./types";

export const FOOD_ANALYSIS_MAX_ATTEMPTS = 25;
export const FOOD_ANALYSIS_JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const FOOD_ANALYSIS_MAX_DELAY_MS = 60 * 60 * 1000;
const BASE_DELAY_MS = 30 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function calculateItemMacros(
  per100: { calories: number; protein: number; carbs: number; fat: number },
  grams: number,
): { calories: number; protein: number; carbs: number; fat: number } {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) {
    throw new Error("Grams must be between 0 and 5000.");
  }
  for (const [key, value] of Object.entries(per100)) {
    if (!Number.isFinite(value) || value < 0 || value > 1000) {
      throw new Error(`Invalid per-100g value: ${key}.`);
    }
  }
  const scale = grams / 100;
  return {
    calories: Math.round(per100.calories * scale),
    protein: Math.round(per100.protein * scale),
    carbs: Math.round(per100.carbs * scale),
    fat: Math.round(per100.fat * scale),
  };
}

export function sumTotals(items: FoodAnalysisItem[]): FoodAnalysisTotals {
  return items.reduce(
    (total, item) => ({
      grams: total.grams + item.grams,
      calories: total.calories + item.calories,
      protein: total.protein + item.protein,
      carbs: total.carbs + item.carbs,
      fat: total.fat + item.fat,
    }),
    { grams: 0, calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function parseAnalysisItem(value: unknown): FoodAnalysisItem {
  if (!isRecord(value)) throw new Error("Invalid analysis item.");
  const text = (field: string): string => {
    const text = value[field];
    if (typeof text !== "string" || !text.trim() || text.length > 200) {
      throw new Error(`Invalid analysis item field: ${field}.`);
    }
    return text.trim();
  };
  const amount = (field: string, max: number): number => {
    const amount = value[field];
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      throw new Error(`Invalid analysis item field: ${field}.`);
    }
    if (field === "confidence") {
      if (amount < 0 || amount > 1) throw new Error("Invalid confidence.");
      return amount;
    }
    if (amount < 0 || amount > max || (field === "grams" && amount === 0)) {
      throw new Error(`Invalid analysis item field: ${field}.`);
    }
    return amount;
  };
  return {
    name: text("name"),
    fdcId: text("fdcId"),
    grams: amount("grams", 5000),
    calories: amount("calories", 20000),
    protein: amount("protein", 5000),
    carbs: amount("carbs", 5000),
    fat: amount("fat", 5000),
    confidence: amount("confidence", 1),
  };
}

export function parseAnalysisResult(value: unknown): FoodAnalysisResult {
  if (!isRecord(value)) throw new Error("Invalid analysis result.");
  if (typeof value.requestId !== "string" || !value.requestId) {
    throw new Error("Analysis result needs a request ID.");
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    throw new Error("Analysis result needs at least one item.");
  }
  const items = value.items.map(parseAnalysisItem);
  return { requestId: value.requestId, items, totals: sumTotals(items) };
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
  if (typeof value.request !== "object" || value.request === null) {
    throw new Error("Analysis job needs a request.");
  }
  const request = value.request as Record<string, unknown>;
  if (request.requestId !== value.id) {
    throw new Error("Analysis request ID must match the job ID.");
  }
  const detectedItems = parseDetectedFoods(request.detectedItems);
  const job: FoodAnalysisJob = {
    id: value.id,
    ownerId: value.ownerId,
    createdAt: value.createdAt,
    nextAttemptAt: value.nextAttemptAt,
    attempts: value.attempts,
    status: value.status,
    request: { requestId: value.id, detectedItems },
  };
  if (typeof request.scanId === "string") job.request.scanId = request.scanId;
  if (value.result !== undefined) {
    const result = parseAnalysisResult(value.result);
    if (result.requestId !== value.id) {
      throw new Error("Analysis result must match the job ID.");
    }
    job.result = result;
  }
  if (value.lastError !== undefined) {
    if (typeof value.lastError !== "string") {
      throw new Error("Invalid job error.");
    }
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
