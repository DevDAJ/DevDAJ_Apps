import { tool } from "@langchain/core/tools";
import { z } from "zod";

export type UsdaReference = {
  fdcId: string;
  description: string;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  fiberPer100: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nutrient(nutrients: Array<Record<string, unknown>>, ids: number[]): number {
  for (const id of ids) {
    const match = nutrients.find(
      (item) => item.nutrientId === id && typeof item.value === "number" && item.value >= 0,
    );
    if (match && typeof match.value === "number") return match.value;
  }
  return 0;
}

function toReference(entry: unknown): UsdaReference | null {
  if (!isRecord(entry)) return null;
  const { fdcId, description, foodNutrients } = entry;
  if (typeof fdcId !== "number" || typeof description !== "string") return null;
  const nutrients = Array.isArray(foodNutrients) ? foodNutrients.filter(isRecord) : [];
  return {
    fdcId: String(fdcId),
    description: description.slice(0, 200),
    kcalPer100: nutrient(nutrients, [1008, 2047, 2048]),
    proteinPer100: nutrient(nutrients, [1003, 203]),
    carbsPer100: nutrient(nutrients, [1005, 205]),
    fatPer100: nutrient(nutrients, [1004, 204]),
    fiberPer100: nutrient(nutrients, [1079, 2033]),
  };
}

/** USDA is grounding data for the nutrition model, not the source of truth for the final profile. */
export async function fetchUsdaReferences(
  query: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<UsdaReference[]> {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: query.slice(0, 120),
      pageSize: 3,
      dataType: ["SR Legacy", "Foundation", "Branded"],
    }),
  });
  if (!response.ok) throw new Error(`USDA lookup failed (${response.status}).`);
  const payload: unknown = await response.json().catch(() => ({}));
  if (!isRecord(payload) || !Array.isArray(payload.foods)) return [];
  return payload.foods
    .slice(0, 3)
    .map(toReference)
    .filter((value): value is UsdaReference => value !== null);
}

export function usdaTool(apiKey: string) {
  return tool(
    async ({ query }: { query: string }) => {
      const references = await fetchUsdaReferences(query, apiKey);
      if (references.length === 0) return "No USDA reference found.";
      return JSON.stringify(references);
    },
    {
      name: "usda_reference",
      description:
        "Look up USDA FoodData Central nutrition per 100 g for a food. Use it as a reference, then adapt it to the preparation and cooking method visible on the plate.",
      schema: z.object({
        query: z.string().min(1).max(120).describe("Food name and preparation"),
      }),
    },
  );
}

const UsdaReferenceSchema = z.object({
  fdcId: z.string(),
  description: z.string(),
  kcalPer100: z.number(),
  proteinPer100: z.number(),
  carbsPer100: z.number(),
  fatPer100: z.number(),
  fiberPer100: z.number(),
});

export function parseUsdaToolOutput(raw: unknown): UsdaReference[] {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value === "No USDA reference found.") return [];
  try {
    return z.array(UsdaReferenceSchema).parse(JSON.parse(value));
  } catch {
    return [];
  }
}

export function formatReferences(references: UsdaReference[]): string {
  return references.length ? JSON.stringify(references) : "No USDA reference available.";
}
