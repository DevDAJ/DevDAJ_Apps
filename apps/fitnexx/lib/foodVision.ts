import type { DetectedFood, PortionBucket } from "./types";

export const MAX_DETECTED_ITEMS = 10;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 280;
const MAX_PREPARATION_LENGTH = 120;

const BUCKETS: readonly PortionBucket[] = ["small", "typical", "large", "unknown"];
const CONFIDENCES = ["low", "medium", "high"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export function parseDetectedFood(value: unknown): DetectedFood {
  if (!isRecord(value)) throw new Error("Detected food must be an object.");
  const name = cleanText(value.name, MAX_NAME_LENGTH);
  if (!name) throw new Error("Detected food needs a name.");
  const portionDescription = cleanText(value.portionDescription, MAX_DESCRIPTION_LENGTH);
  if (!portionDescription) throw new Error("Detected food needs a portion description.");
  if (
    typeof value.portionBucket !== "string" ||
    !BUCKETS.includes(value.portionBucket as PortionBucket)
  ) {
    throw new Error("Detected food needs a valid portion bucket.");
  }
  if (
    typeof value.confidence !== "string" ||
    !(CONFIDENCES as readonly string[]).includes(value.confidence)
  ) {
    throw new Error("Detected food needs a valid confidence.");
  }
  let count: number | null = null;
  if (value.count !== null && value.count !== undefined) {
    if (
      typeof value.count !== "number" ||
      !Number.isInteger(value.count) ||
      value.count < 1 ||
      value.count > 20
    ) {
      throw new Error("Detected food count must be an integer from 1 to 20.");
    }
    count = value.count;
  }
  let preparation: string | null = null;
  if (value.preparation !== null && value.preparation !== undefined) {
    preparation = cleanText(value.preparation, MAX_PREPARATION_LENGTH);
    if (!preparation) throw new Error("Invalid preparation.");
  }
  return {
    name,
    count,
    portionDescription,
    portionBucket: value.portionBucket as PortionBucket,
    preparation,
    confidence: value.confidence as DetectedFood["confidence"],
  };
}

export function parseDetectedFoods(value: unknown): DetectedFood[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Add at least one detected food.");
  }
  if (value.length > MAX_DETECTED_ITEMS) {
    throw new Error(`Send at most ${MAX_DETECTED_ITEMS} detected foods.`);
  }
  return value.map(parseDetectedFood);
}

/** Normalize a local description into a USDA search query. */
export function toUsdaQuery(food: DetectedFood): string {
  const parts = [food.preparation, food.name].filter(Boolean).join(" ");
  return parts.slice(0, MAX_NAME_LENGTH);
}
