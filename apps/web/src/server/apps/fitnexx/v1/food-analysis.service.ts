import { createHash, randomUUID } from "node:crypto";
import { ApiError, messageOf, statusOf } from "../../../shared/errors";
import { fitnexxEnv } from "../env";
import {
  type AnalysisItem,
  buildFoodChoiceQuestion,
  buildPortionChoiceQuestion,
  buildTrainingGateQuestion,
  calculateMacros,
  callJevDecisions,
  callQwenFoodVision,
  FOOD_ANALYSIS_MODEL,
  FOOD_SCAN_BUCKET,
  FOOD_TRAINING_POLICY_VERSION,
  fetchUsdaCandidates,
  fetchUsdaDetails,
  parseChoiceAnswer,
  parseFoodAnalysisInput,
  parseFoodReviewInput,
  parseFoodVisionInput,
  toUsdaQuery,
} from "../lib/food-analysis";
import { getSupabaseAdmin } from "../../../shared/supabase";

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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A vision request names a scan but has no detected items yet. */
export function isVisionRequest(body: unknown): boolean {
  return isRecord(body) && "scanId" in body && !("detectedItems" in body);
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

/** Active model release, with 1 in 20 users (stable by id) on the canary when one exists. */
async function getFoodModel(userId: string): Promise<string> {
  const fallback = fitnexxEnv.foodVisionModel;
  const { data } = await getSupabaseAdmin()
    .from("food_model_release")
    .select("version,status")
    .in("status", ["active", "canary"]);
  const active = data?.find((release) => release.status === "active")?.version;
  const canary = data?.find((release) => release.status === "canary")?.version;
  if (!canary) return active ?? fallback;
  const bucket = Number.parseInt(createHash("sha256").update(userId).digest("hex").slice(0, 8), 16);
  return bucket % 20 === 0 ? canary : (active ?? fallback);
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

/** Runs the server vision model on an uploaded scan (cached per scan). */
export async function analyzeScan(userId: string, body: unknown) {
  const usage = await getUsage(userId);
  try {
    const { scanId } = parseFoodVisionInput(body);
    const admin = getSupabaseAdmin();
    const { data: scan, error: scanError } = await admin
      .from("food_scan")
      .select("storage_path,status,prediction,model_version")
      .eq("id", scanId)
      .eq("user_id", userId)
      .maybeSingle();
    if (scanError) throw scanError;
    if (!scan) throw new ApiError(404, "Food scan was not found.");
    if (scan.prediction && scan.model_version) {
      return { scanId, items: scan.prediction, modelVersion: scan.model_version };
    }
    if (usage.remaining <= 0) {
      throw new ApiError(429, "Daily food analysis limit reached.", { retryable: false });
    }

    const { foodVisionUrl: endpoint, foodVisionKey: apiKey } = fitnexxEnv;
    const model = await getFoodModel(userId);
    if (!endpoint || !apiKey) {
      throw new ApiError(503, "Server food vision is not configured.", { retryable: true });
    }
    const { data: signed, error: signedError } = await admin.storage
      .from(FOOD_SCAN_BUCKET)
      .createSignedUrl(scan.storage_path, 120);
    if (signedError) throw signedError;
    const result = await callQwenFoodVision(signed.signedUrl, endpoint, apiKey, model);
    const { error: updateError } = await admin
      .from("food_scan")
      .update({
        status: "analyzed",
        prediction: result.items,
        model_version: result.modelVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId)
      .eq("user_id", userId);
    if (updateError) throw updateError;
    await consumeUsage(userId, usage.isPro);
    return { scanId, items: result.items, modelVersion: result.modelVersion };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const status = statusOf(error);
    throw new ApiError(status ?? 502, messageOf(error, "Food vision failed."), {
      retryable: status === undefined ? true : status >= 500,
    });
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

/** Matches detected foods to USDA records and portions, returning macros. Idempotent per requestId. */
export async function analyzeNutrition(userId: string, body: unknown) {
  const usage = await getUsage(userId);
  let input: ReturnType<typeof parseFoodAnalysisInput>;
  try {
    input = parseFoodAnalysisInput(body);
  } catch (error) {
    throw new ApiError(400, messageOf(error, "Invalid request."));
  }
  if (!input.scanId && usage.remaining <= 0) {
    throw new ApiError(
      429,
      usage.isPro
        ? "Daily food analysis limit reached. Try again tomorrow."
        : `Free food analysis limit reached (${usage.limit}/day). Try again tomorrow.`,
      { retryable: false },
    );
  }
  if (input.scanId) {
    const { data: scan, error } = await getSupabaseAdmin()
      .from("food_scan")
      .select("status,reviewed_label")
      .eq("id", input.scanId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (
      !scan ||
      !["eligible", "review", "discarded"].includes(scan.status) ||
      JSON.stringify(scan.reviewed_label) !== JSON.stringify(input.detectedItems)
    ) {
      throw new ApiError(400, "Review the food scan before nutrition lookup.");
    }
  }

  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  let claim: ClaimResult;
  try {
    claim = await claimRequest(userId, input.requestId, requestHash);
  } catch (error) {
    if ((error as { code?: unknown }).code === "23505") {
      throw new ApiError(409, messageOf(error, "Duplicate request."), { retryable: false });
    }
    throw new ApiError(500, messageOf(error, "Request failed."));
  }
  if (claim.action === "cached") return claim.response;
  if (claim.action === "in-progress") {
    throw new ApiError(429, "Analysis already in progress. Try again shortly.", {
      retryable: true,
    });
  }

  const { usdaApiKey: usdaKey, openrouterApiKey: openrouterKey } = fitnexxEnv;
  if (!usdaKey) {
    throw new ApiError(503, "Nutrition lookup is not configured.", { retryable: true });
  }
  if (!openrouterKey) {
    throw new ApiError(503, "Food decisions are not configured.", { retryable: true });
  }

  try {
    const items: AnalysisItem[] = [];
    for (const food of input.detectedItems) {
      const candidates = await fetchUsdaCandidates(toUsdaQuery(food), usdaKey);
      if (candidates.length === 0) throw new Error(`No nutrition match for "${food.name}".`);
      const foodQuestion = buildFoodChoiceQuestion(candidates);
      const foodAnswers = await callJevDecisions(
        {
          food: food.name,
          preparation: food.preparation,
          portion: food.portionDescription,
          portionBucket: food.portionBucket,
        },
        { food: foodQuestion },
        openrouterKey,
        FOOD_ANALYSIS_MODEL,
      );
      const foodAnswer = parseChoiceAnswer(foodAnswers.food, Object.keys(foodQuestion.criteria));
      const match = candidates.find((item) => `fdc_${item.fdcId}` === foodAnswer.choice);
      if (!match) throw new Error("Jev returned an unknown food.");

      // Full record for the selected food only, so serving indexes below
      // always refer to this food and never to another candidate.
      const detail = await fetchUsdaDetails(match.fdcId, usdaKey);
      const portionQuestion = buildPortionChoiceQuestion(food.portionDescription, detail.servings);
      const portionAnswers = await callJevDecisions(
        {
          food: detail.description,
          portion: food.portionDescription,
          portionBucket: food.portionBucket,
        },
        { portion: portionQuestion },
        openrouterKey,
        FOOD_ANALYSIS_MODEL,
      );
      const portionAnswer = parseChoiceAnswer(
        portionAnswers.portion,
        Object.keys(portionQuestion.criteria),
      );
      const portionIndex = Number(portionAnswer.choice.split("_")[1]);
      const serving = detail.servings[portionIndex] ?? detail.servings[0];
      const macros = calculateMacros(
        {
          kcal: detail.kcalPer100,
          protein: detail.proteinPer100,
          carbs: detail.carbsPer100,
          fat: detail.fatPer100,
        },
        serving.grams,
      );
      items.push({
        name: detail.description,
        fdcId: detail.fdcId,
        grams: serving.grams,
        ...macros,
        confidence: Math.min(1, Math.max(0, foodAnswer.confidence)),
      });
    }
    const totals = items.reduce(
      (total, item) => ({
        grams: total.grams + item.grams,
        calories: total.calories + item.calories,
        protein: total.protein + item.protein,
        carbs: total.carbs + item.carbs,
        fat: total.fat + item.fat,
      }),
      { grams: 0, calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
    const response = { requestId: input.requestId, items, totals };

    // Count usage only after a successful analysis.
    if (!input.scanId) await consumeUsage(userId, usage.isPro);
    await getSupabaseAdmin().rpc("complete_food_analysis_request", {
      p_user_id: userId,
      p_request_id: input.requestId,
      p_response: response,
    });
    return response;
  } catch (error) {
    const status = statusOf(error);
    const retryable =
      status !== undefined
        ? status === 408 || status === 429 || status >= 500
        : /timeout|network|fetch|econn|enotfound|socket/i.test(messageOf(error, ""));
    throw new ApiError(status ?? 400, messageOf(error, "Food analysis failed."), { retryable });
  }
}

/** Saves the user's corrected labels; optionally gates the scan for model training. */
export async function reviewScan(userId: string, body: unknown) {
  try {
    const input = parseFoodReviewInput(body);
    const admin = getSupabaseAdmin();
    const { data: scan, error: scanError } = await admin
      .from("food_scan")
      .select("storage_path,prediction")
      .eq("id", input.scanId)
      .eq("user_id", userId)
      .maybeSingle();
    if (scanError) throw scanError;
    if (!scan?.prediction) throw new ApiError(404, "Food scan was not found or has not finished.");

    if (!input.contribute) {
      const { error: removeError } = await admin.storage
        .from(FOOD_SCAN_BUCKET)
        .remove([scan.storage_path]);
      if (removeError) throw removeError;
      const now = new Date().toISOString();
      const { error: updateError } = await admin
        .from("food_scan")
        .update({
          status: "discarded",
          reviewed_label: input.reviewedItems,
          updated_at: now,
          expires_at: now,
        })
        .eq("id", input.scanId)
        .eq("user_id", userId);
      if (updateError) throw updateError;
      return { decision: "discarded" as const };
    }

    const openrouterKey = fitnexxEnv.openrouterApiKey;
    if (!openrouterKey) throw new ApiError(503, "Training review is not configured.");
    const gateQuestion = buildTrainingGateQuestion();
    const answers = await callJevDecisions(
      { prediction: scan.prediction, reviewedItems: input.reviewedItems },
      { training: gateQuestion },
      openrouterKey,
    );
    const gate = parseChoiceAnswer(answers.training, Object.keys(gateQuestion.criteria));
    const decision = gate.choice as "eligible" | "review" | "reject";
    const confidence = Math.min(1, Math.max(0, gate.confidence));
    const now = new Date().toISOString();
    if (decision === "reject") {
      const { error: removeError } = await admin.storage
        .from(FOOD_SCAN_BUCKET)
        .remove([scan.storage_path]);
      if (removeError) throw removeError;
    }
    const { error: updateError } = await admin
      .from("food_scan")
      .update({
        status: decision === "reject" ? "rejected" : decision,
        reviewed_label: input.reviewedItems,
        gate_decision: decision,
        gate_confidence: confidence,
        contribution_policy_version: FOOD_TRAINING_POLICY_VERSION,
        contributed_at: now,
        withdrawn_at: decision === "reject" ? now : null,
        updated_at: now,
        expires_at: null,
      })
      .eq("id", input.scanId)
      .eq("user_id", userId);
    if (updateError) throw updateError;
    return { decision, confidence };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(statusOf(error) ?? 400, messageOf(error, "Could not save food review."));
  }
}

/** Deletes a scan and its image. Missing scans are treated as already deleted. */
export async function deleteScan(userId: string, body: unknown): Promise<void> {
  try {
    const { scanId } = parseFoodVisionInput(body);
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
