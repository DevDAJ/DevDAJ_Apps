import { z } from "zod";

/** Nutrients are always stored per 100 g so any portion can be derived by multiplication. */
export const NutrientsSchema = z.object({
  calories: z.number().min(0).max(2000),
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
  fiber: z.number().min(0).max(100),
});

export type Nutrients = z.infer<typeof NutrientsSchema>;

export const VisionComponentSchema = z.object({
  name: z.string().min(1).max(120),
  preparation: z.string().max(120).nullable(),
  portionDescription: z.string().min(1).max(280),
  estimatedGrams: z.number().min(1).max(2000),
  confidence: z.enum(["low", "medium", "high"]),
});

export const VisionResultSchema = z.object({
  items: z.array(VisionComponentSchema).min(1).max(10),
});

export type VisionComponent = z.infer<typeof VisionComponentSchema>;
export type VisionResult = z.infer<typeof VisionResultSchema>;

export const NutritionComponentSchema = z.object({
  index: z.number().int().min(0).max(9),
  per100: NutrientsSchema,
  fdcId: z.string().max(40).nullable(),
  source: z.enum(["usda", "ai"]),
  note: z.string().max(280),
});

export const NutritionResultSchema = z.object({
  items: z.array(NutritionComponentSchema).min(1).max(10),
});

export type NutritionComponent = z.infer<typeof NutritionComponentSchema>;
export type NutritionResult = z.infer<typeof NutritionResultSchema>;

export type ConsistencyCheck = {
  expectedCalories: number;
  delta: number;
  ok: boolean;
  note: string;
};

export type FoodScanComponent = {
  id: string;
  /** Primary key of the reusable food_component profile, when one was saved. */
  componentId: string | null;
  name: string;
  preparation: string | null;
  portionDescription: string;
  grams: number;
  estimatedGrams: number;
  per100: Nutrients;
  perGram: Nutrients;
  source: "usda" | "ai";
  fdcId: string | null;
  confidence: number;
  consistency: ConsistencyCheck;
};

export type FoodScanTotals = Nutrients & { grams: number };

export type FoodScanResult = {
  requestId: string;
  scanId: string;
  components: FoodScanComponent[];
  totals: FoodScanTotals;
  visionModel: string;
  nutritionModel: string;
  cacheHits: number;
};

export const FOOD_SCAN_PIPELINE_VERSION = "langchain-1";
