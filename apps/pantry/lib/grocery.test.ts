import { describe, expect, test } from "vite-plus/test";
import { buildGroceryItems, normalizeName } from "./grocery";
import type { Ingredient, PantryItem, Recipe } from "./types";

function recipe(title: string, ingredients: Ingredient[]): Recipe {
  return { title, ingredients, steps: [], sourceUrl: null, extractionId: null };
}

function pantry(name: string): PantryItem[] {
  return [{ name, category: "pantry" }];
}

describe("normalizeName", () => {
  test("lowercases, trims and collapses spaces", () => {
    expect(normalizeName("  JASMINE   Rice  ")).toBe("jasmine rice");
  });

  test("strips a trailing plural s from words longer than three letters", () => {
    expect(normalizeName("Tomatoes")).toBe("tomatoe");
    expect(normalizeName("Apples")).toBe("apple");
  });

  test("only strips a plural from the last word of a multi-word name", () => {
    expect(normalizeName("Tomatoes oil")).toBe("tomatoes oil");
    expect(normalizeName("Tomato tongues")).toBe("tomato tongue");
  });

  test("keeps short words and words ending in ss", () => {
    expect(normalizeName("bus")).toBe("bus");
    expect(normalizeName("Glass")).toBe("glass");
    expect(normalizeName("oil")).toBe("oil");
  });
});

describe("buildGroceryItems", () => {
  test("skips ingredients covered exactly by the pantry", () => {
    const items = buildGroceryItems(
      [recipe("Rice", [{ name: "Rice", quantity: 1, unit: "cup" }])],
      pantry("rice"),
    );
    expect(items).toEqual([]);
  });

  test("skips an ingredient when a pantry word is a whole word inside it", () => {
    const items = buildGroceryItems(
      [
        recipe("Fried rice", [
          { name: "Jasmine rice", quantity: 2, unit: "cup" },
          { name: "Rice vinegar", quantity: 1, unit: "tbsp" },
        ]),
      ],
      pantry("rice"),
    );
    expect(items).toEqual([]);
  });

  test("keeps ingredients that only share part of a word", () => {
    const items = buildGroceryItems(
      [recipe("Soup", [{ name: "Ricotta", quantity: 1, unit: "cup" }])],
      pantry("rice"),
    );
    expect(items).toEqual([{ name: "Ricotta", quantity: 1, unit: "cup" }]);
  });

  test("merges the same normalized name with the same unit", () => {
    const items = buildGroceryItems(
      [
        recipe("A", [
          { name: "Tomatoes", quantity: 2, unit: "cup" },
          { name: " tomatoes ", quantity: 3, unit: "cup" },
        ]),
      ],
      [],
    );
    expect(items).toEqual([{ name: "Tomatoes", quantity: 5, unit: "cup" }]);
  });

  test("adds a quantity to a missing quantity and keeps all null null", () => {
    const items = buildGroceryItems(
      [
        recipe("A", [
          { name: "Salt", quantity: null, unit: "tsp" },
          { name: "salt", quantity: 2, unit: "tsp" },
          { name: "Pepper", quantity: null, unit: "tsp" },
          { name: "pepper", quantity: null, unit: "tsp" },
        ]),
      ],
      [],
    );
    expect(items).toEqual([
      { name: "Pepper", quantity: null, unit: "tsp" },
      { name: "Salt", quantity: 2, unit: "tsp" },
    ]);
  });

  test("keeps different units as separate lines", () => {
    const items = buildGroceryItems(
      [
        recipe("A", [
          { name: "Flour", quantity: 1, unit: "cup" },
          { name: "Flour", quantity: 200, unit: "g" },
          { name: "Flour", quantity: 1, unit: null },
        ]),
      ],
      [],
    );
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.unit)).toEqual(["cup", "g", null]);
  });

  test("sorts by name", () => {
    const items = buildGroceryItems(
      [
        recipe("A", [
          { name: "Rice", quantity: 1, unit: null },
          { name: "apples", quantity: 1, unit: null },
          { name: "Bread", quantity: 1, unit: null },
        ]),
      ],
      [],
    );
    expect(items.map((item) => item.name)).toEqual(["apples", "Bread", "Rice"]);
  });

  test("returns nothing when recipes have no ingredients", () => {
    expect(buildGroceryItems([recipe("Empty", [])], [])).toEqual([]);
  });
});
