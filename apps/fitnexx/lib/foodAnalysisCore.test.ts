import { describe, expect, test } from "vite-plus/test";
import {
  calculateComponentTotals,
  calculateItemMacros,
  isJobExpired,
  isRetryableError,
  isRetryableStatus,
  nextRetryAt,
  parseAnalysisJob,
  parseAnalysisJobs,
  parseAnalysisResult,
  sumTotals,
} from "./foodAnalysisCore";
import type { FoodAnalysisItem } from "./types";

const nutrients = {
  calories: 2.7,
  protein: 0.12,
  carbs: 0.33,
  fat: 0.1,
  fiber: 0.02,
};

function component(overrides: Partial<FoodAnalysisItem> = {}): FoodAnalysisItem {
  return {
    id: "component-1",
    componentId: "profile-1",
    name: "Pizza",
    preparation: null,
    portionDescription: "two slices",
    grams: 200,
    estimatedGrams: 200,
    per100: {
      calories: 270,
      protein: 12,
      carbs: 33,
      fat: 10,
      fiber: 2,
    },
    perGram: nutrients,
    source: "usda",
    fdcId: "123",
    confidence: 0.8,
    consistency: {
      expectedCalories: 270,
      delta: 0,
      ok: true,
      note: "",
    },
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    id: "job-1",
    ownerId: "user-1",
    createdAt: "2026-09-19T00:00:00.000Z",
    nextAttemptAt: "2026-09-19T00:00:00.000Z",
    attempts: 0,
    status: "pending",
    request: { requestId: "job-1", scanId: "scan-1" },
    ...overrides,
  };
}

describe("calculateItemMacros", () => {
  test("multiplies saved per-gram values by the edited weight", () => {
    expect(calculateItemMacros(nutrients, 200)).toEqual({
      calories: 540,
      protein: 24,
      carbs: 66,
      fat: 20,
      fiber: 4,
    });
  });

  test("rejects bad grams and nutrients", () => {
    expect(() => calculateItemMacros(nutrients, 0)).toThrow();
    expect(() => calculateItemMacros({ ...nutrients, calories: -1 }, 100)).toThrow();
  });
});

describe("component totals", () => {
  test("recalculates from edited weights without AI", () => {
    const components = [component()];
    expect(calculateComponentTotals(components, { "component-1": 100 }).calories).toBe(270);
    expect(sumTotals(components).calories).toBe(540);
  });
});

describe("parseAnalysisResult", () => {
  const result = {
    requestId: "job-1",
    scanId: "scan-1",
    visionModel: "vision",
    nutritionModel: "nutrition",
    cacheHits: 1,
    components: [component()],
  };

  test("derives totals from components", () => {
    const parsed = parseAnalysisResult(result);
    expect(parsed.totals).toEqual(sumTotals(parsed.components));
    expect(parsed.totals.calories).toBe(540);
    expect(parsed.cacheHits).toBe(1);
  });

  test("accepts zero-valued macros", () => {
    const oil = component({
      per100: { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 },
      perGram: { calories: 8.84, protein: 0, carbs: 0, fat: 1, fiber: 0 },
    });
    expect(parseAnalysisResult({ ...result, components: [oil] }).totals.protein).toBe(0);
  });

  test("rejects confidence outside 0 to 1", () => {
    expect(() =>
      parseAnalysisResult({ ...result, components: [component({ confidence: 2 })] }),
    ).toThrow();
  });
});

describe("parseAnalysisJobs", () => {
  test("sorts oldest first and drops corrupt jobs", () => {
    const newer = job({
      id: "job-2",
      createdAt: "2026-09-20T00:00:00.000Z",
      request: { requestId: "job-2", scanId: "scan-2" },
    });
    const jobs = parseAnalysisJobs([newer, job(), { nope: true }]);
    expect(jobs.map((item) => item.id)).toEqual(["job-1", "job-2"]);
  });

  test("rejects request ID mismatch", () => {
    expect(() =>
      parseAnalysisJob(job({ request: { requestId: "other", scanId: "scan-1" } })),
    ).toThrow();
  });
});

describe("retry policy", () => {
  test("backoff grows and caps at one hour", () => {
    const now = Date.parse("2026-09-19T00:00:00.000Z");
    const first = Date.parse(nextRetryAt(0, now, () => 1));
    const tenth = Date.parse(nextRetryAt(10, now, () => 1));
    expect(first - now).toBe(30_000);
    expect(tenth - now).toBe(3_600_000);
  });

  test("seven-day expiry", () => {
    const expired = parseAnalysisJob(job({ createdAt: "2026-09-01T00:00:00.000Z" }));
    expect(isJobExpired(expired, Date.parse("2026-09-19T00:00:00.000Z"))).toBe(true);
    expect(isJobExpired(expired, Date.parse("2026-09-05T00:00:00.000Z"))).toBe(false);
  });

  test("retryable statuses and errors", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableError(new Error("Network request failed"))).toBe(true);
    expect(isRetryableError(new Error("Fitnexx Pro is required."))).toBe(false);
  });
});
