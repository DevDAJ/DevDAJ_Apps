import { createHash, randomUUID } from "node:crypto";
import { messageOf, statusOf, ApiError } from "../../../shared/errors";
import { getSupabaseAdmin } from "../../../shared/supabase";
import { fitnexxEnv } from "../env";
import { FOOD_SCAN_BUCKET } from "../lib/food-scanner/constants";
import { FOOD_SCAN_PIPELINE_VERSION, type FoodScanResult } from "../lib/food-scanner/schemas";
import { runFoodScanPipeline } from "../lib/food-scanner/pipeline";

const FREE_DAILY_LIMIT = 10;
const PRO_DAILY_LIMIT = 100;
const MAX_PENDING_UPLOADS = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export interface Usage {
  isPro: boolean;
  limit: number;
  remaining: number;
}

type ClaimResult =
  | { action: "claimed" }
  | { action: "in-progress" }
  | { action: "cached"; response: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validId(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function parseScanRequest(body: unknown): { requestId: string; scanId: string } {
  if (!isRecord(body)) throw new Error("Invalid food scan request.");
  return {
    requestId: validId(body.requestId, "request ID"),
    scanId: validId(body.scanId, "scan ID"),
  };
}

export async function getUsage(userId: string): Promise<Usage> {
  const { data: account } = await getSupabaseAdmin()
    .from("user")
    .select("isPro,foodAnalysisDay,foodAnalysisCount")
    .eq("id", userId)
    .maybeSingle();
  const isPro = account?.isPro === true;
  const limit = isPro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const today = new Date().toISOString().slice(0, 10);
  const used = account?.foodAnalysisDay === today ? Number(account.foodAnalysisCount ?? 0) : 0;
  return { isPro, limit, remaining: Math.max(0, limit - used) };
}

async function consumeUsage(userId: string, isPro: boolean): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("consume_food_analysis_rate_limit", {
    p_user_id: userId,
    p_is_pro: isPro,
  });
  if (error) throw error;
}

/** Reserves a food_scan row and returns a signed Storage upload URL for the image. */
export async function prepareUpload(userId: string, body: unknown) {
  const usage = await getUsage(userId);
  if (usage.remaining <= 0) throw new ApiError(429, "Daily food analysis limit reached.");
  try {
    if (!isRecord(body)) throw new Error("Invalid image upload request.");
    const { contentType, byteSize } = body;
    if (typeof contentType !== "string" || !(contentType in IMAGE_TYPES)) {
      throw new Error("Use a JPEG, PNG, or WebP image.");
    }
    if (
      typeof byteSize !== "number" ||
      !Number.isInteger(byteSize) ||
      byteSize <= 0 ||
      byteSize > MAX_IMAGE_BYTES
    ) {
      throw new Error("Image must be no larger than 8 MB.");
    }

    const scanId = randomUUID();
    const extension = IMAGE_TYPES[contentType as keyof typeof IMAGE_TYPES];
    const path = `${userId}/${scanId}.${extension}`;
    const admin = getSupabaseAdmin();
    const { count, error: countError } = await admin
      .from("food_scan")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending");
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_PENDING_UPLOADS) {
      throw new ApiError(429, "Finish or delete an existing food upload first.");
    }
    const { error: insertError } = await admin.from("food_scan").insert({
      id: scanId,
      user_id: userId,
      storage_path: path,
      mime_type: contentType,
      byte_size: byteSize,
    });
    if (insertError) throw insertError;
    const { data, error } = await admin.storage
      .from(FOOD_SCAN_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error) {
      await admin.from("food_scan").delete().eq("id", scanId);
      throw error;
    }
    return { scanId, path: data.path, token: data.token };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, messageOf(error, "Could not prepare image upload."));
  }
}

async function claimRequest(
  userId: string,
  requestId: string,
  requestHash: string,
): Promise<ClaimResult> {
  const { data, error } = await getSupabaseAdmin().rpc("claim_food_analysis_request", {
    p_user_id: userId,
    p_request_id: requestId,
    p_request_hash: requestHash,
  });
  if (error) throw error;
  return data as ClaimResult;
}

/** Runs both AI steps, saves reusable component profiles, and returns editable portions. */
export async function analyzeScan(userId: string, body: unknown): Promise<FoodScanResult> {
  const usage = await getUsage(userId);
  let input: ReturnType<typeof parseScanRequest>;
  try {
    input = parseScanRequest(body);
  } catch (error) {
    throw new ApiError(400, messageOf(error, "Invalid request."));
  }

  const requestHash = createHash("sha256")
    .update(JSON.stringify({ scanId: input.scanId }))
    .digest("hex");
  let claim: ClaimResult;
  try {
    claim = await claimRequest(userId, input.requestId, requestHash);
  } catch (error) {
    if ((error as { code?: unknown }).code === "23505") {
      throw new ApiError(409, messageOf(error, "Duplicate request."), { retryable: false });
    }
    throw new ApiError(500, messageOf(error, "Request failed."));
  }
  if (claim.action === "cached") return claim.response as FoodScanResult;
  if (claim.action === "in-progress") {
    throw new ApiError(429, "Analysis already in progress. Try again shortly.", {
      retryable: true,
    });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: scan, error: scanError } = await admin
      .from("food_scan")
      .select("storage_path,status,prediction,pipeline_version")
      .eq("id", input.scanId)
      .eq("user_id", userId)
      .maybeSingle();
    if (scanError) throw scanError;
    if (!scan) throw new ApiError(404, "Food scan was not found.");
    if (scan.prediction && scan.pipeline_version === FOOD_SCAN_PIPELINE_VERSION) {
      const cached = { ...(scan.prediction as FoodScanResult), requestId: input.requestId };
      await complete(userId, input.requestId, cached);
      return cached;
    }
    if (usage.remaining <= 0) {
      throw new ApiError(429, "Daily food analysis limit reached.", { retryable: false });
    }

    const openrouterKey = fitnexxEnv.openrouterApiKey;
    if (!openrouterKey) {
      throw new ApiError(503, "Food analysis is not configured.", { retryable: true });
    }
    const { data: signed, error: signedError } = await admin.storage
      .from(FOOD_SCAN_BUCKET)
      .createSignedUrl(scan.storage_path, 120);
    if (signedError) throw signedError;

    const result = await runFoodScanPipeline({
      requestId: input.requestId,
      scanId: input.scanId,
      imageUrl: signed.signedUrl,
      openrouterKey,
      usdaKey: fitnexxEnv.usdaApiKey,
      visionModel: fitnexxEnv.foodVisionModel,
      nutritionModel: fitnexxEnv.foodNutritionModel,
    });
    await consumeUsage(userId, usage.isPro);
    await complete(userId, input.requestId, result);
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const status = statusOf(error);
    const retryable =
      status !== undefined
        ? status === 408 || status === 429 || status >= 500
        : /timeout|network|fetch|econn|enotfound|socket/i.test(messageOf(error, ""));
    throw new ApiError(status ?? 502, messageOf(error, "Food analysis failed."), { retryable });
  }
}

async function complete(userId: string, requestId: string, response: FoodScanResult) {
  await getSupabaseAdmin().rpc("complete_food_analysis_request", {
    p_user_id: userId,
    p_request_id: requestId,
    p_response: response,
  });
}

/** Deletes a scan and its image. Missing scans are treated as already deleted. */
export async function deleteScan(userId: string, body: unknown): Promise<void> {
  try {
    if (!isRecord(body)) throw new Error("Invalid request.");
    const scanId = validId(body.scanId, "scan ID");
    const admin = getSupabaseAdmin();
    const { data: scan, error } = await admin
      .from("food_scan")
      .select("storage_path")
      .eq("id", scanId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!scan) return;
    const { error: removeError } = await admin.storage
      .from(FOOD_SCAN_BUCKET)
      .remove([scan.storage_path]);
    if (removeError) throw removeError;
    const { error: deleteError } = await admin
      .from("food_scan")
      .delete()
      .eq("id", scanId)
      .eq("user_id", userId);
    if (deleteError) throw deleteError;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, messageOf(error, "Could not delete food scan."));
  }
}
