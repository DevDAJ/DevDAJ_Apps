import { expect, test } from "vite-plus/test";

import {
  buildFoodChoiceQuestion,
  buildPortionChoiceQuestion,
  buildTrainingGateQuestion,
  calculateMacros,
  parseChoiceAnswer,
  parseFoodAnalysisInput,
  parseFoodReviewInput,
  parseFoodVisionInput,
  parseQwenFoodResponse,
  parseUsdaFoods,
  toUsdaQuery,
} from "./food-analysis";

const detected = {
  name: "chicken breast",
  count: 1,
  portionDescription: "one medium breast",
  portionBucket: "typical",
  preparation: "grilled",
  confidence: "high",
};

test("accepts a valid food analysis request", () => {
  expect(parseFoodAnalysisInput({ requestId: "req-1", detectedItems: [detected] })).toMatchObject({
    requestId: "req-1",
  });
});

test("rejects empty items and bad buckets", () => {
  expect(() => parseFoodAnalysisInput({ requestId: "req-1", detectedItems: [] })).toThrow();
  expect(() =>
    parseFoodAnalysisInput({
      requestId: "req-1",
      detectedItems: [{ ...detected, portionBucket: "huge" }],
    }),
  ).toThrow();
});

test("validates server vision and explicit review consent", () => {
  const scanId = "123e4567-e89b-12d3-a456-426614174000";
  expect(parseFoodVisionInput({ scanId })).toEqual({ scanId });
  expect(
    parseFoodReviewInput({
      scanId,
      reviewedItems: [detected],
      contribute: false,
    }),
  ).toMatchObject({ scanId, contribute: false });
  expect(() => parseFoodReviewInput({ scanId, reviewedItems: [detected] })).toThrow(
    "Contribution choice is required",
  );
});

test("parses schema-bound Qwen food output", () => {
  expect(
    parseQwenFoodResponse({
      model: "Qwen/Qwen3.5-4B",
      choices: [
        {
          message: {
            content: `Result:\n${JSON.stringify({ items: [detected] })}`,
          },
        },
      ],
    }),
  ).toEqual([detected]);
  expect(() =>
    parseQwenFoodResponse({
      choices: [{ message: { content: '{"items":[]}' } }],
    }),
  ).toThrow();
});

test("builds USDA queries from preparation and name", () => {
  const [item] = parseFoodAnalysisInput({
    requestId: "req-1",
    detectedItems: [detected],
  }).detectedItems;
  expect(toUsdaQuery(item)).toBe("grilled chicken breast");
});

test("parses USDA foods with household servings", () => {
  const candidates = parseUsdaFoods({
    foods: [
      {
        fdcId: 123,
        description: "Chicken breast, grilled",
        foodNutrients: [
          { nutrientId: 1008, value: 165 },
          { nutrientId: 1003, value: 31 },
          { nutrientId: 1005, value: 0 },
          { nutrientId: 1004, value: 3.6 },
        ],
        servingSize: 174,
        householdServingFullText: "1 breast",
      },
    ],
  });
  expect(candidates).toEqual([
    {
      fdcId: "123",
      description: "Chicken breast, grilled",
      kcalPer100: 165,
      proteinPer100: 31,
      carbsPer100: 0,
      fatPer100: 3.6,
      servings: [{ description: "1 breast", grams: 174 }],
    },
  ]);
});

test("parses a single USDA food detail record", async () => {
  const { parseUsdaFoodDetail } = await import("./food-analysis");
  expect(
    parseUsdaFoodDetail({
      fdcId: 123,
      description: "Chicken breast, grilled",
      foodNutrients: [{ nutrientId: 1008, value: 165 }],
      servingSize: 174,
      householdServingFullText: "1 breast",
    }),
  ).toMatchObject({ fdcId: "123", kcalPer100: 165 });
  expect(() => parseUsdaFoodDetail({})).toThrow();
});

test("falls back to a 100g serving without USDA serving data", () => {
  const [candidate] = parseUsdaFoods({
    foods: [{ fdcId: 9, description: "Rice", foodNutrients: [] }],
  });
  expect(candidate.servings).toEqual([{ description: "100g reference", grams: 100 }]);
});

test("builds bounded Jev choice questions", () => {
  const [candidate] = parseUsdaFoods({
    foods: [{ fdcId: 9, description: "Rice", foodNutrients: [] }],
  });
  expect(buildFoodChoiceQuestion([candidate]).criteria).toEqual({
    fdc_9: "Rice",
  });
  const portions = buildPortionChoiceQuestion("about one cup", candidate.servings);
  expect(Object.keys(portions.criteria)).toEqual(["portion_0"]);
  expect(Object.keys(buildTrainingGateQuestion().criteria)).toEqual([
    "eligible",
    "review",
    "reject",
  ]);
});

test("validates Jev choice answers against known options", () => {
  expect(
    parseChoiceAnswer({ type: "choice", choice: "fdc_9", confidence: 0.8 }, ["fdc_9"]),
  ).toEqual({ choice: "fdc_9", confidence: 0.8 });
  expect(() => parseChoiceAnswer({ type: "choice", choice: "fdc_1" }, ["fdc_9"])).toThrow();
});

test("calculates macros deterministically", () => {
  expect(calculateMacros({ kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, 174)).toEqual({
    calories: Math.round((165 * 174) / 100),
    protein: Math.round((31 * 174) / 100),
    carbs: 0,
    fat: Math.round((3.6 * 174) / 100),
  });
});
