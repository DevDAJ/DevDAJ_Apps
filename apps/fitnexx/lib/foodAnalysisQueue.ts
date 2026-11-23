import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import { KEYS } from "./backupSchema";
import {
  FOOD_ANALYSIS_MAX_ATTEMPTS,
  isJobExpired,
  isRetryableError,
  isRetryableStatus,
  nextRetryAt,
  parseAnalysisJobs,
  parseAnalysisResult,
} from "./foodAnalysisCore";
import { requireSupabase } from "./supabase";
import type { FoodAnalysisJob, FoodAnalysisResult } from "./types";

const listeners = new Set<() => void>();
let draining = false;

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeFoodAnalysisJobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getFoodAnalysisJobs(): Promise<FoodAnalysisJob[]> {
  const raw = await AsyncStorage.getItem(KEYS.FOOD_ANALYSIS_JOBS);
  if (!raw) return [];
  try {
    return parseAnalysisJobs(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function saveJobs(jobs: FoodAnalysisJob[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.FOOD_ANALYSIS_JOBS, JSON.stringify(jobs));
  notify();
}

async function updateJob(
  id: string,
  update: (job: FoodAnalysisJob) => FoodAnalysisJob | null,
): Promise<void> {
  const jobs = await getFoodAnalysisJobs();
  const next: FoodAnalysisJob[] = [];
  for (const job of jobs) {
    if (job.id !== id) {
      next.push(job);
      continue;
    }
    const updated = update(job);
    if (updated) next.push(updated);
  }
  await saveJobs(next);
}

export async function enqueueFoodAnalysis(
  ownerId: string,
  scanId: string,
): Promise<FoodAnalysisJob> {
  if (!ownerId) throw new Error("Sign in to analyze food.");
  if (!scanId) throw new Error("A food scan is required.");
  const now = new Date().toISOString();
  const job: FoodAnalysisJob = {
    id: Crypto.randomUUID(),
    ownerId,
    createdAt: now,
    nextAttemptAt: now,
    attempts: 0,
    status: "pending",
    request: { requestId: "", scanId },
  };
  job.request.requestId = job.id;
  const jobs = await getFoodAnalysisJobs();
  await saveJobs([...jobs, job]);
  return job;
}

async function foodAnalysisApi(
  method: "PUT" | "POST" | "PATCH" | "DELETE",
  body: unknown,
): Promise<unknown> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");
  if (!apiUrl) throw new Error("The Fitnexx API URL is not configured.");
  const { data } = await requireSupabase().auth.getSession();
  if (!data.session) throw new Error("Sign in to use food analysis.");
  const response = await fetch(`${apiUrl}/api/v1/fitnexx/food-analysis`, {
    method,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    const error = new Error(
      String(
        (payload as { error?: unknown }).error ?? `Food analysis failed (${response.status}).`,
      ),
    );
    (error as { status?: number }).status = response.status;
    if (typeof (payload as { retryable?: unknown }).retryable === "boolean") {
      (error as { retryable?: boolean }).retryable = (payload as { retryable: boolean }).retryable;
    }
    throw error;
  }
  return payload;
}

export async function analyzeFoodPhotoOnServer(photoUri: string): Promise<{ scanId: string }> {
  const photo = await fetch(photoUri);
  if (!photo.ok) throw new Error("Could not read the food photo.");
  const blob = await photo.blob();
  const contentType = blob.type || "image/jpeg";
  const upload = (await foodAnalysisApi("PUT", {
    contentType,
    byteSize: blob.size,
  })) as { scanId?: unknown; path?: unknown; token?: unknown };
  if (
    typeof upload.scanId !== "string" ||
    typeof upload.path !== "string" ||
    typeof upload.token !== "string"
  ) {
    throw new Error("Invalid image upload response.");
  }
  try {
    const { error } = await requireSupabase()
      .storage.from("food-scan-images")
      .uploadToSignedUrl(upload.path, upload.token, blob, { contentType });
    if (error) throw error;
    return { scanId: upload.scanId };
  } catch (error) {
    await foodAnalysisApi("DELETE", { scanId: upload.scanId }).catch(() => undefined);
    throw error;
  }
}

export async function removeFoodAnalysisJob(id: string): Promise<void> {
  await updateJob(id, () => null);
}

export async function retryFoodAnalysisJob(id: string): Promise<void> {
  await updateJob(id, (job) => ({
    ...job,
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
    lastError: undefined,
  }));
}

async function postFoodAnalysis(job: FoodAnalysisJob): Promise<FoodAnalysisResult> {
  return parseAnalysisResult(await foodAnalysisApi("POST", job.request));
}

export interface FoodAnalysisUsage {
  isPro: boolean;
  limit: number;
  remaining: number;
}

export async function getFoodAnalysisUsage(): Promise<FoodAnalysisUsage | null> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");
  if (!apiUrl) return null;
  const { data } = await requireSupabase().auth.getSession();
  if (!data.session) return null;
  const response = await fetch(`${apiUrl}/api/v1/fitnexx/food-analysis`, {
    headers: { Authorization: `Bearer ${data.session.access_token}` },
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as unknown;
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as FoodAnalysisUsage).remaining !== "number"
  ) {
    return null;
  }
  return payload as FoodAnalysisUsage;
}

export async function isInternetReachable(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isInternetReachable ?? state.isConnected ?? false;
  } catch {
    return false;
  }
}

interface DrainOptions {
  ownerId: string;
  reachable?: () => Promise<boolean>;
  post?: (job: FoodAnalysisJob) => Promise<FoodAnalysisResult>;
  now?: () => number;
}

/** Process pending jobs oldest-first. Safe to call from startup, foreground, and reconnect. */
export async function drainFoodAnalysisQueue(options: DrainOptions): Promise<void> {
  if (draining) return;
  if (!options.ownerId) return;
  const reachable = options.reachable ?? isInternetReachable;
  if (!(await reachable())) return;
  draining = true;
  try {
    const now = options.now ?? Date.now;
    const post = options.post ?? postFoodAnalysis;
    const jobs = (await getFoodAnalysisJobs()).filter(
      (job) => job.ownerId === options.ownerId && job.status === "pending",
    );
    for (const job of jobs) {
      if (isJobExpired(job, now())) {
        await updateJob(job.id, (current) =>
          current.status === "pending"
            ? {
                ...current,
                status: "failed",
                lastError: "Expired after 7 days without a connection.",
              }
            : current,
        );
        continue;
      }
      if (Date.parse(job.nextAttemptAt) > now()) continue;
      try {
        const result = await post(job);
        if (result.requestId !== job.id) {
          throw new Error("Analysis result did not match the request.");
        }
        await updateJob(job.id, (current) =>
          current.status === "pending"
            ? { ...current, status: "ready", result, lastError: undefined }
            : current,
        );
      } catch (error) {
        const status = (error as { status?: unknown }).status;
        const serverRetryable = (error as { retryable?: unknown }).retryable;
        const retryable =
          typeof serverRetryable === "boolean"
            ? serverRetryable
            : typeof status === "number"
              ? isRetryableStatus(status)
              : isRetryableError(error);
        const message = error instanceof Error ? error.message : "Food analysis failed.";
        if (!retryable) {
          await updateJob(job.id, (current) =>
            current.status === "pending"
              ? { ...current, status: "failed", lastError: message }
              : current,
          );
          continue;
        }
        const attempts = job.attempts + 1;
        if (attempts >= FOOD_ANALYSIS_MAX_ATTEMPTS) {
          await updateJob(job.id, (current) =>
            current.status === "pending"
              ? { ...current, status: "failed", lastError: message }
              : current,
          );
          continue;
        }
        await updateJob(job.id, (current) =>
          current.status === "pending"
            ? {
                ...current,
                attempts,
                nextAttemptAt: nextRetryAt(attempts),
                lastError: message,
              }
            : current,
        );
      }
    }
  } finally {
    draining = false;
  }
}
