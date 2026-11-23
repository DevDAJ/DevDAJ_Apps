import { describe, expect, test } from "vite-plus/test";
import {
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

const detected = {
  name: "pizza",
  count: null,
  portionDescription: "two slices",
  portionBucket: "typical",
  preparation: null,
  confidence: "high",
};

function job(overrides = {}) {
  return {
    id: "job-1",
    ownerId: "user-1",
    createdAt: "2026-09-19T00:00:00.000Z",
    nextAttemptAt: "2026-09-19T00:00:00.000Z",
    attempts: 0,
    status: "pending",
    request: { requestId: "job-1", detectedItems: [detected] },
    ...overrides,
  };
}

describe("calculateItemMacros", () => {
  test("scales per-100g values", () => {
    expect(calculateItemMacros({ calories: 270, protein: 12, carbs: 33, fat: 10 }, 200)).toEqual({
      calories: 540,
      protein: 24,
      carbs: 66,
      fat: 20,
    });
  });

  test("rejects bad grams and nutrients", () => {
    expect(() => calculateItemMacros({ calories: 100, protein: 1, carbs: 1, fat: 1 }, 0)).toThrow();
    expect(() =>
      calculateItemMacros({ calories: -1, protein: 1, carbs: 1, fat: 1 }, 100),
    ).toThrow();
  });
});

describe("parseAnalysisResult", () => {
  test("derives totals from items", () => {
    const result = parseAnalysisResult({
      requestId: "job-1",
      items: [
        {
          name: "Pizza",
          fdcId: "123",
          grams: 200,
          calories: 540,
          protein: 24,
          carbs: 66,
          fat: 20,
          confidence: 0.8,
        },
      ],
    });
    expect(result.totals).toEqual(sumTotals(result.items));
    expect(result.totals.calories).toBe(540);
  });

  test("accepts foods with zero-valued macros", () => {
    const result = parseAnalysisResult({
      requestId: "job-1",
      items: [
        {
          name: "Olive oil",
          fdcId: "123",
          grams: 14,
          calories: 119,
          protein: 0,
          carbs: 0,
          fat: 14,
          confidence: 0.8,
        },
      ],
    });
    expect(result.totals.protein).toBe(0);
  });

  test("rejects confidence outside 0 to 1", () => {
    expect(() =>
      parseAnalysisResult({
        requestId: "job-1",
        items: [
          {
            name: "Pizza",
            fdcId: "123",
            grams: 200,
            calories: 540,
            protein: 24,
            carbs: 66,
            fat: 20,
            confidence: 2,
          },
        ],
      }),
    ).toThrow();
  });
});

describe("parseAnalysisJobs", () => {
  test("sorts oldest first and drops corrupt jobs", () => {
    const newer = job({
      id: "job-2",
      createdAt: "2026-09-20T00:00:00.000Z",
      request: { requestId: "job-2", detectedItems: [detected] },
    });
    const jobs = parseAnalysisJobs([newer, job(), { nope: true }]);
    expect(jobs.map((item) => item.id)).toEqual(["job-1", "job-2"]);
  });

  test("rejects request ID mismatch", () => {
    expect(() =>
      parseAnalysisJob(job({ request: { requestId: "other", detectedItems: [detected] } })),
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
