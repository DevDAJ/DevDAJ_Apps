import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../../../../shared/supabase";
import { componentKey } from "./nutrition";
import {
  FOOD_SCAN_PIPELINE_VERSION,
  type FoodScanResult,
  type Nutrients,
  type VisionComponent,
} from "./schemas";

type CachedComponentRow = {
  id: string;
  key: string;
  name: string;
  preparation: string | null;
  fdc_id: string | null;
  source: "usda" | "ai";
  kcal_per_100: number;
  protein_per_100: number;
  carbs_per_100: number;
  fat_per_100: number;
  fiber_per_100: number;
  model_version: string | null;
  confidence: number;
};

export type ComponentProfile = {
  id: string;
  key: string;
  per100: Nutrients;
  fdcId: string | null;
  source: "usda" | "ai";
  modelVersion: string | null;
  confidence: number;
  cached: boolean;
};

function toNutrients(row: CachedComponentRow): Nutrients {
  return {
    calories: Number(row.kcal_per_100),
    protein: Number(row.protein_per_100),
    carbs: Number(row.carbs_per_100),
    fat: Number(row.fat_per_100),
    fiber: Number(row.fiber_per_100),
  };
}

/** One query for the whole scan, so repeated foods in a meal only cost one AI profile. */
export async function findCachedProfiles(
  components: VisionComponent[],
): Promise<Map<string, ComponentProfile>> {
  const keys = [...new Set(components.map(componentKey))];
  const { data, error } = await getSupabaseAdmin()
    .from("food_component")
    .select(
      "id,key,name,preparation,fdc_id,source,kcal_per_100,protein_per_100,carbs_per_100,fat_per_100,fiber_per_100,model_version,confidence",
    )
    .in("key", keys);
  if (error) throw error;
  const profiles = new Map<string, ComponentProfile>();
  for (const row of (data ?? []) as CachedComponentRow[]) {
    profiles.set(row.key, {
      id: row.id,
      key: row.key,
      per100: toNutrients(row),
      fdcId: row.fdc_id,
      source: row.source,
      modelVersion: row.model_version,
      confidence: Number(row.confidence),
      cached: true,
    });
  }
  if (profiles.size > 0) {
    const { error: usageError } = await getSupabaseAdmin().rpc("touch_food_component_usage", {
      p_ids: [...profiles.values()].map((profile) => profile.id),
    });
    if (usageError) throw usageError;
  }
  return profiles;
}

export async function saveComponentProfile(input: {
  component: VisionComponent;
  per100: Nutrients;
  fdcId: string | null;
  source: "usda" | "ai";
  modelVersion: string;
  confidence: number;
}): Promise<ComponentProfile> {
  const key = componentKey(input.component);
  const { data, error } = await getSupabaseAdmin()
    .from("food_component")
    .upsert(
      {
        key,
        name: input.component.name.slice(0, 120),
        preparation: input.component.preparation?.slice(0, 120) ?? null,
        fdc_id: input.fdcId,
        source: input.source,
        kcal_per_100: input.per100.calories,
        protein_per_100: input.per100.protein,
        carbs_per_100: input.per100.carbs,
        fat_per_100: input.per100.fat,
        fiber_per_100: input.per100.fiber,
        consistency_note: null,
        model_version: input.modelVersion,
        confidence: input.confidence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key", ignoreDuplicates: false },
    )
    .select(
      "id,key,name,preparation,fdc_id,source,kcal_per_100,protein_per_100,carbs_per_100,fat_per_100,fiber_per_100,model_version,confidence",
    )
    .single();
  if (error) throw error;
  const row = data as CachedComponentRow;
  return {
    id: row.id,
    key: row.key,
    per100: toNutrients(row),
    fdcId: row.fdc_id,
    source: row.source,
    modelVersion: row.model_version,
    confidence: Number(row.confidence),
    cached: false,
  };
}

/** Persists the exact per-100 g and per-gram values returned to the client. */
export async function saveScanResult(
  scanId: string,
  result: FoodScanResult,
  components: VisionComponent[],
): Promise<void> {
  const admin = getSupabaseAdmin();
  const rows = result.components.map((component, index) => ({
    id: component.id || randomUUID(),
    scan_id: scanId,
    component_id: component.componentId,
    position: index,
    name: component.name,
    preparation: component.preparation,
    grams: component.grams,
    estimated_grams: component.estimatedGrams,
    per100: component.per100,
    per_gram: component.perGram,
    confidence: component.confidence,
    consistency: component.consistency,
  }));
  const { error: componentsError } = await admin.from("food_scan_component").upsert(rows, {
    onConflict: "scan_id,position",
  });
  if (componentsError) throw componentsError;

  const { error: scanError } = await admin
    .from("food_scan")
    .update({
      status: "analyzed",
      model_version: `${result.visionModel}+${result.nutritionModel}`,
      pipeline_version: FOOD_SCAN_PIPELINE_VERSION,
      prediction: result,
      expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scanId);
  if (scanError) throw scanError;

  // Keep the legacy columns in sync for existing dashboards and exports.
  await admin.from("food_scan").update({ reviewed_label: components }).eq("id", scanId);
}
