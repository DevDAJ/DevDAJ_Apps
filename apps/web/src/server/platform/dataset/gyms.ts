import { ApiError } from "../../shared/errors";

/** A gym in the global dataset, as stored in `dataset_gyms`. */
export interface Gym {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  equipment: string[];
  updated_at: string;
}

/** What a contributor proposes for a new gym, or as the full new state of an existing one. */
export interface GymProposal {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  equipment: string[];
}

export const MAX_EQUIPMENT = 100;
const MAX_EQUIPMENT_NAME = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bad(message: string): never {
  throw new ApiError(400, message);
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/** Validates and normalizes a gym proposal (trimmed, de-duplicated equipment). */
export function parseGymProposal(value: unknown): GymProposal {
  if (!isRecord(value)) bad("Gym details must be an object.");
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (name.length < 2 || name.length > 120) bad("Gym name must be 2 to 120 characters.");
  let address: string | null = null;
  if (value.address !== undefined && value.address !== null) {
    if (typeof value.address !== "string") bad("Address must be text.");
    address = value.address.trim() || null;
    if (address && address.length > 240) bad("Address must be at most 240 characters.");
  }
  if (!inRange(value.latitude, -90, 90)) bad("Latitude must be between -90 and 90.");
  if (!inRange(value.longitude, -180, 180)) bad("Longitude must be between -180 and 180.");
  if (!Array.isArray(value.equipment)) bad("Equipment must be a list.");
  const seen = new Set<string>();
  const equipment: string[] = [];
  for (const item of value.equipment) {
    if (typeof item !== "string") bad("Each equipment item must be text.");
    const clean = item.trim().replace(/\s+/g, " ");
    if (!clean) continue;
    if (clean.length > MAX_EQUIPMENT_NAME)
      bad(`Equipment names must be at most ${MAX_EQUIPMENT_NAME} characters.`);
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    equipment.push(clean);
  }
  if (equipment.length > MAX_EQUIPMENT) bad(`List at most ${MAX_EQUIPMENT} equipment items.`);
  return { name, address, latitude: value.latitude, longitude: value.longitude, equipment };
}

/** Bounding box around a point, used to pre-filter gyms before the exact distance check. */
export function boundingBox(latitude: number, longitude: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const cos = Math.cos((latitude * Math.PI) / 180);
  const dLng = cos > 1e-6 ? radiusKm / (111.32 * cos) : 180;
  return {
    minLat: Math.max(-90, latitude - dLat),
    maxLat: Math.min(90, latitude + dLat),
    minLng: Math.max(-180, longitude - dLng),
    maxLng: Math.min(180, longitude + dLng),
  };
}

export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
