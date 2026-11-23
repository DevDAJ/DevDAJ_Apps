import { ApiError } from "../../shared/errors";
import { getSupabaseAdmin } from "../../shared/supabase";
import { boundingBox, distanceKm, type Gym, type GymProposal, parseGymProposal } from "./gyms";

export const DATASETS = ["gyms"] as const;
export type Dataset = (typeof DATASETS)[number];
export type ContributionStatus = "pending" | "approved" | "rejected";

export interface Contribution {
  id: string;
  dataset: Dataset;
  target_id: string | null;
  payload: GymProposal;
  status: ContributionStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  submitted_by?: string;
}

/** Pending submissions one contributor may have open at a time. */
export const MAX_PENDING_PER_USER = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTRIBUTION_COLUMNS =
  "id, dataset, target_id, payload, status, review_note, created_at, reviewed_at";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseUuid(value: unknown, what: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new ApiError(400, `Invalid ${what}.`);
  return value;
}

/** Approved gyms near a point, closest first. */
export async function listGyms(query: {
  lat?: string;
  lng?: string;
  radiusKm?: string;
}): Promise<{ gyms: (Gym & { distanceKm?: number })[] }> {
  const db = getSupabaseAdmin();
  let request = db
    .from("dataset_gyms")
    .select("id, name, address, latitude, longitude, equipment, updated_at")
    .limit(500);
  const lat = query.lat === undefined ? undefined : Number(query.lat);
  const lng = query.lng === undefined ? undefined : Number(query.lng);
  const hasPoint = lat !== undefined || lng !== undefined;
  if (hasPoint) {
    if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ApiError(400, "Pass both lat and lng.");
    }
    const radius = Math.min(Math.max(Number(query.radiusKm ?? 10) || 10, 0.1), 100);
    const box = boundingBox(lat, lng, radius);
    request = request
      .gte("latitude", box.minLat)
      .lte("latitude", box.maxLat)
      .gte("longitude", box.minLng)
      .lte("longitude", box.maxLng);
    const { data, error } = await request;
    if (error) throw error;
    const gyms = (data as Gym[])
      .map((gym) => ({ ...gym, distanceKm: distanceKm({ latitude: lat, longitude: lng }, gym) }))
      .filter((gym) => gym.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return { gyms };
  }
  const { data, error } = await request.order("updated_at", { ascending: false });
  if (error) throw error;
  return { gyms: data as Gym[] };
}

/** `{ dataset: "gyms", targetId?, payload }` → a pending contribution for review. */
export async function submitContribution(userId: string, body: unknown): Promise<Contribution> {
  if (!isRecord(body)) throw new ApiError(400, "Body must be an object.");
  if (!DATASETS.includes(body.dataset as Dataset)) throw new ApiError(400, "Unknown dataset.");
  const targetId =
    body.targetId === undefined || body.targetId === null
      ? null
      : parseUuid(body.targetId, "targetId");
  const payload = parseGymProposal(body.payload);
  const db = getSupabaseAdmin();

  const { count, error: countError } = await db
    .from("dataset_contributions")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by", userId)
    .eq("status", "pending");
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_PENDING_PER_USER) {
    throw new ApiError(429, "You have too many submissions waiting for review. Try again later.");
  }
  if (targetId) {
    const { data, error } = await db
      .from("dataset_gyms")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, "That gym does not exist.");
  }

  const { data, error } = await db
    .from("dataset_contributions")
    .insert({ dataset: body.dataset, target_id: targetId, payload, submitted_by: userId })
    .select(CONTRIBUTION_COLUMNS)
    .single();
  if (error) throw error;
  return data as Contribution;
}

export async function listMyContributions(
  userId: string,
): Promise<{ contributions: Contribution[] }> {
  const { data, error } = await getSupabaseAdmin()
    .from("dataset_contributions")
    .select(CONTRIBUTION_COLUMNS)
    .eq("submitted_by", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return { contributions: data as Contribution[] };
}

const STATUSES: readonly ContributionStatus[] = ["pending", "approved", "rejected"];

/** Review queue, oldest first, with the current gym for edits so admins can compare. */
export async function listContributions(status: string | undefined): Promise<{
  contributions: (Contribution & { current: Gym | null })[];
}> {
  const wanted = (status ?? "pending") as ContributionStatus;
  if (!STATUSES.includes(wanted)) throw new ApiError(400, "Unknown status.");
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("dataset_contributions")
    .select(`${CONTRIBUTION_COLUMNS}, submitted_by`)
    .eq("status", wanted)
    .order("created_at", { ascending: wanted === "pending" })
    .limit(200);
  if (error) throw error;
  const rows = data as Contribution[];
  const targetIds = [
    ...new Set(rows.map((row) => row.target_id).filter((id): id is string => !!id)),
  ];
  const current = new Map<string, Gym>();
  if (targetIds.length) {
    const { data: gyms, error: gymError } = await db
      .from("dataset_gyms")
      .select("id, name, address, latitude, longitude, equipment, updated_at")
      .in("id", targetIds);
    if (gymError) throw gymError;
    for (const gym of gyms as Gym[]) current.set(gym.id, gym);
  }
  return {
    contributions: rows.map((row) => ({
      ...row,
      current: row.target_id ? (current.get(row.target_id) ?? null) : null,
    })),
  };
}

function parseNote(body: unknown): string | null {
  if (!isRecord(body) || body.note === undefined || body.note === null) return null;
  if (typeof body.note !== "string" || body.note.length > 500) {
    throw new ApiError(400, "Note must be text of at most 500 characters.");
  }
  return body.note.trim() || null;
}

/** Applies the contribution to the dataset atomically (SQL function) and marks it approved. */
export async function approveContribution(
  reviewerId: string,
  id: string,
  body: unknown,
): Promise<{ id: string; gymId: string }> {
  const { data, error } = await getSupabaseAdmin().rpc("approve_dataset_contribution", {
    p_id: parseUuid(id, "contribution id"),
    p_reviewer: reviewerId,
    p_note: parseNote(body),
  });
  if (error) {
    if (error.message.includes("not_pending")) {
      throw new ApiError(409, "This contribution was already reviewed.");
    }
    if (error.message.includes("target_missing")) {
      throw new ApiError(409, "The gym this edit targets no longer exists.");
    }
    throw error;
  }
  return { id, gymId: data as string };
}

export async function rejectContribution(
  reviewerId: string,
  id: string,
  body: unknown,
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from("dataset_contributions")
    .update({
      status: "rejected",
      review_note: parseNote(body),
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", parseUuid(id, "contribution id"))
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(409, "This contribution was already reviewed.");
  return { id };
}
