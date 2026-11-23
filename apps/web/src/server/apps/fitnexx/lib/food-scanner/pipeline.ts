import { randomUUID } from "node:crypto";
import { findCachedProfiles, saveComponentProfile, saveScanResult } from "./cache";
import {
  checkNutrientConsistency,
  componentKey,
  normalizeNutrients,
  summarizeNutrients,
  toPerGram,
} from "./nutrition";
import { createNutritionChain, createVisionChain, nutritionInput, visionMessages } from "./models";
import {
  FOOD_SCAN_PIPELINE_VERSION,
  NutritionResultSchema,
  VisionResultSchema,
  type FoodScanComponent,
  type FoodScanResult,
  type Nutrients,
  type VisionComponent,
} from "./schemas";
import { formatReferences, parseUsdaToolOutput, usdaTool } from "./usda";

const CONFIDENCE_SCORE = { low: 0.4, medium: 0.65, high: 0.85 } as const;

type PipelineInput = {
  requestId: string;
  scanId: string;
  imageUrl: string;
  openrouterKey: string;
  usdaKey?: string;
  visionModel: string;
  nutritionModel: string;
};

type CandidateProfile = {
  per100: Nutrients;
  fdcId: string | null;
  source: "usda" | "ai";
  note: string;
  consistent: boolean;
};

function noteProblem(input: string): Error {
  return new Error(input);
}

/** Step 1: vision identifies components and estimates grams. Step 2: nutrition model profiles only new components. */
export async function runFoodScanPipeline(input: PipelineInput): Promise<FoodScanResult> {
  const vision = createVisionChain(input.openrouterKey, input.visionModel);
  const detected = VisionResultSchema.parse(await vision.invoke(visionMessages(input.imageUrl)));

  const cachedProfiles = await findCachedProfiles(detected.items);
  const referenceTool = input.usdaKey ? usdaTool(input.usdaKey) : null;
  const references = new Map<number, string>();
  const referenceIds = new Map<number, Set<string>>();

  for (const [index, component] of detected.items.entries()) {
    if (cachedProfiles.has(componentKey(component))) continue;
    const query = [component.preparation, component.name].filter(Boolean).join(" ").slice(0, 120);
    let raw = "";
    if (referenceTool) {
      try {
        raw = String(await referenceTool.invoke({ query }));
      } catch {
        raw = "";
      }
    }
    const candidates = parseUsdaToolOutput(raw);
    references.set(index, formatReferences(candidates));
    referenceIds.set(index, new Set(candidates.map((candidate) => candidate.fdcId)));
  }

  const missing = detected.items.filter(
    (component) => !cachedProfiles.has(componentKey(component)),
  );
  const profiles = new Map<number, CandidateProfile>();

  if (missing.length > 0) {
    const nutrition = createNutritionChain(input.openrouterKey, input.nutritionModel);
    const indexed = missing.map((component) => ({
      index: detected.items.indexOf(component),
      ...component,
    }));
    const request = nutritionInput({
      components: indexed,
      references: indexed.map(
        (component) => references.get(component.index) ?? "No USDA reference available.",
      ),
    });
    const generated = NutritionResultSchema.parse(await nutrition.invoke(request));
    const byIndex = new Map(generated.items.map((item) => [item.index, item]));

    const corrections: string[] = [];
    for (const component of indexed) {
      const item = byIndex.get(component.index);
      if (!item) throw noteProblem(`Nutrition model skipped component ${component.index}.`);
      const per100 = normalizeNutrients(item.per100);
      const check = checkNutrientConsistency(per100, item.note);
      if (!check.ok) {
        corrections.push(
          `Index ${component.index}: calories ${per100.calories} differs from macro-derived ${check.expectedCalories}. Correct the profile so calories match macros.`,
        );
      }
      const validFdcId =
        item.fdcId && referenceIds.get(component.index)?.has(item.fdcId) ? item.fdcId : null;
      profiles.set(component.index, {
        per100,
        fdcId: validFdcId,
        source: validFdcId ? "usda" : "ai",
        note: item.note,
        consistent: check.ok,
      });
    }

    if (corrections.length > 0) {
      const corrected = NutritionResultSchema.parse(
        await nutrition.invoke(
          nutritionInput({
            components: indexed,
            references: indexed.map((c) => references.get(c.index) ?? ""),
            correction: corrections.join(" "),
          }),
        ),
      );
      for (const item of corrected.items) {
        const previous = profiles.get(item.index);
        if (!previous) continue;
        const per100 = normalizeNutrients(item.per100);
        const check = checkNutrientConsistency(per100, item.note);
        const finalPer100 = check.ok ? per100 : { ...per100, calories: check.expectedCalories };
        const validFdcId =
          item.fdcId && referenceIds.get(item.index)?.has(item.fdcId) ? item.fdcId : null;
        profiles.set(item.index, {
          per100: finalPer100,
          fdcId: validFdcId,
          source: validFdcId ? "usda" : "ai",
          note: check.ok
            ? item.note
            : `${item.note} Calories corrected to match macros.`.trim().slice(0, 280),
          consistent: true,
        });
      }
    }
  }

  const components: FoodScanComponent[] = [];
  for (const [index, component] of detected.items.entries()) {
    const key = componentKey(component);
    let profile = cachedProfiles.get(key);
    if (!profile) {
      const generated = profiles.get(index);
      if (!generated) throw noteProblem(`No nutrition profile for component ${index}.`);
      profile = await saveComponentProfile({
        component,
        per100: generated.per100,
        fdcId: generated.fdcId,
        source: generated.source,
        modelVersion: input.nutritionModel,
        confidence: CONFIDENCE_SCORE[component.confidence],
      });
    }
    const check = checkNutrientConsistency(profile.per100);
    components.push({
      id: randomUUID(),
      componentId: profile.id,
      name: component.name.slice(0, 120),
      preparation: component.preparation?.slice(0, 120) ?? null,
      portionDescription: component.portionDescription.slice(0, 280),
      grams: component.estimatedGrams,
      estimatedGrams: component.estimatedGrams,
      per100: profile.per100,
      perGram: toPerGram(profile.per100),
      source: profile.source,
      fdcId: profile.fdcId,
      confidence: profile.confidence,
      consistency: check,
    });
  }

  const result: FoodScanResult = {
    requestId: input.requestId,
    scanId: input.scanId,
    components,
    totals: summarizeNutrients(components),
    visionModel: input.visionModel,
    nutritionModel: input.nutritionModel,
    cacheHits: detected.items.length - missing.length,
  };
  await saveScanResult(input.scanId, result, detected.items);
  return {
    ...result,
    components: components.map((component) => ({ ...component, id: component.id })),
  };
}

export { FOOD_SCAN_PIPELINE_VERSION, type VisionComponent };
