import { describe, expect, test } from "vite-plus/test";
import { parseDetectedFoods, toUsdaQuery } from "./foodVision";

const valid = {
  name: "grilled chicken breast",
  count: 1,
  portionDescription: "one medium sliced chicken breast",
  portionBucket: "typical",
  preparation: "grilled",
  confidence: "high",
};

describe("parseDetectedFoods", () => {
  test("accepts valid vision output", () => {
    expect(parseDetectedFoods([valid])).toEqual([valid]);
  });

  test("allows null count and preparation", () => {
    const [item] = parseDetectedFoods([{ ...valid, count: null, preparation: null }]);
    expect(item.count).toBeNull();
    expect(item.preparation).toBeNull();
  });

  test("rejects empty names and missing portions", () => {
    expect(() => parseDetectedFoods([{ ...valid, name: "  " }])).toThrow();
    expect(() => parseDetectedFoods([{ ...valid, portionDescription: "" }])).toThrow();
  });

  test("rejects bad buckets, confidence, and counts", () => {
    expect(() => parseDetectedFoods([{ ...valid, portionBucket: "huge" }])).toThrow();
    expect(() => parseDetectedFoods([{ ...valid, confidence: "certain" }])).toThrow();
    expect(() => parseDetectedFoods([{ ...valid, count: 0 }])).toThrow();
  });

  test("caps item count", () => {
    expect(() => parseDetectedFoods(new Array(11).fill(valid))).toThrow();
  });
});

describe("toUsdaQuery", () => {
  test("combines preparation and name", () => {
    const [item] = parseDetectedFoods([valid]);
    expect(toUsdaQuery(item)).toBe("grilled grilled chicken breast");
  });
});
