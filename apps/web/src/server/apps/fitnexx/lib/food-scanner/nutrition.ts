import type { ConsistencyCheck, Nutrients, VisionComponent } from "./schemas";

const ROUND_1 = 10;
const ROUND_3 = 1000;

function round(value: number, factor: number): number {
  return Math.round(value * factor) / factor;
}

/** Approximate energy from macros. Fiber is counted at 2 kcal/g, the usual labeling convention. */
export function caloriesFromMacros(per100: Nutrients): number {
  return round(per100.protein * 4 + per100.carbs * 4 + per100.fat * 9 + per100.fiber * 2, ROUND_1);
}

export function checkNutrientConsistency(per100: Nutrients, note = ""): ConsistencyCheck {
  const expectedCalories = caloriesFromMacros(per100);
  const delta = round(per100.calories - expectedCalories, ROUND_1);
  const tolerance = Math.max(20, expectedCalories * 0.2);
  return {
    expectedCalories,
    delta,
    ok: Math.abs(delta) <= tolerance,
    note: note.slice(0, 280),
  };
}

/** The client multiplies perGram by the edited weight, so no AI call is needed for a portion change. */
export function toPerGram(per100: Nutrients): Nutrients {
  return {
    calories: round(per100.calories / 100, ROUND_3),
    protein: round(per100.protein / 100, ROUND_3),
    carbs: round(per100.carbs / 100, ROUND_3),
    fat: round(per100.fat / 100, ROUND_3),
    fiber: round(per100.fiber / 100, ROUND_3),
  };
}

export function summarizeNutrients(
  entries: Array<{ grams: number; per100: Nutrients }>,
): Nutrients & { grams: number } {
  return entries.reduce(
    (total, entry) => {
      const scale = entry.grams / 100;
      return {
        grams: round(total.grams + entry.grams, ROUND_1),
        calories: round(total.calories + entry.per100.calories * scale, ROUND_1),
        protein: round(total.protein + entry.per100.protein * scale, ROUND_1),
        carbs: round(total.carbs + entry.per100.carbs * scale, ROUND_1),
        fat: round(total.fat + entry.per100.fat * scale, ROUND_1),
        fiber: round(total.fiber + entry.per100.fiber * scale, ROUND_1),
      };
    },
    { grams: 0, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

/** Stable reuse key. Preparation matters: "boiled rice" and "fried rice" are different profiles. */
export function componentKey(component: Pick<VisionComponent, "name" | "preparation">): string {
  const normalize = (value: string | null): string =>
    value
      ?.normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ") ?? "";
  return `${normalize(component.name)}|${normalize(component.preparation)}`;
}

export function normalizeNutrients(value: Nutrients): Nutrients {
  return {
    calories: round(value.calories, ROUND_1),
    protein: round(value.protein, ROUND_1),
    carbs: round(value.carbs, ROUND_1),
    fat: round(value.fat, ROUND_1),
    fiber: round(value.fiber, ROUND_1),
  };
}
