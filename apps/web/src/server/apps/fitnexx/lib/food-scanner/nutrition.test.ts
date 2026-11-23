import { describe, expect, test } from "vite-plus/test";
import {
  caloriesFromMacros,
  checkNutrientConsistency,
  componentKey,
  normalizeNutrients,
  summarizeNutrients,
  toPerGram,
} from "./nutrition";

const per100 = {
  calories: 265,
  protein: 12,
  carbs: 33,
  fat: 9,
  fiber: 2,
};

describe("nutrition math", () => {
  test("derives calories from macros using fiber at 2 kcal/g", () => {
    expect(caloriesFromMacros(per100)).toBe(265);
  });

  test("flags an inconsistent profile and accepts a consistent one", () => {
    expect(checkNutrientConsistency(per100).ok).toBe(true);
    expect(checkNutrientConsistency({ ...per100, calories: 900 }).ok).toBe(false);
  });

  test("stores per-gram values that multiply back to per-100g values", () => {
    expect(toPerGram(per100).calories).toBe(2.65);
    expect(toPerGram(per100).fat).toBe(0.09);
  });

  test("sums portions by their gram weights", () => {
    expect(
      summarizeNutrients([
        { grams: 180, per100 },
        { grams: 100, per100 },
      ]).calories,
    ).toBe(742);
  });

  test("rounds model output before saving", () => {
    expect(normalizeNutrients({ ...per100, calories: 265.46 }).calories).toBe(265.5);
  });
});

describe("component reuse key", () => {
  test("normalizes case, accents and punctuation", () => {
    expect(componentKey({ name: "  Steamed  RICE ", preparation: "steamed" })).toBe(
      "steamed rice|steamed",
    );
    expect(componentKey({ name: "Crème Brûlée", preparation: null })).toBe("creme brulee|");
  });

  test("keeps preparation distinct", () => {
    expect(componentKey({ name: "Rice", preparation: "fried" })).not.toBe(
      componentKey({ name: "Rice", preparation: "boiled" }),
    );
  });
});
