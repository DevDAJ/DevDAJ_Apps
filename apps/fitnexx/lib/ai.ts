import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { storage } from "./storage";
import { requireSupabase } from "./supabase";

/**
 * Pro-only AI: every call goes through the Fitnexx API, which runs LangChain
 * over OpenRouter. The app never stores or sends provider keys.
 */

export type AIMessage = { role: "system" | "user" | "assistant"; content: string };
export type AIModel = { id: string; name: string };
export type AIUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type AIResponse = { content: string; usage: AIUsage };
export type AISettings = { model: string };
export type UsageRecord = AIUsage & {
  id: string;
  timestamp: string;
  model: string;
  durationMs: number;
};

export function summarizeUsage(records: UsageRecord[]) {
  return records.reduce(
    (summary, record) => ({
      calls: summary.calls + 1,
      promptTokens: summary.promptTokens + record.promptTokens,
      completionTokens: summary.completionTokens + record.completionTokens,
      totalTokens: summary.totalTokens + record.totalTokens,
    }),
    { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");
  if (!apiUrl) throw new Error("The Fitnexx API URL is not configured.");
  const { data } = await requireSupabase().auth.getSession();
  if (!data.session) throw new Error("Sign in to use Fitnexx Pro.");
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const result = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(result.error ?? `Fitnexx request failed (${response.status}).`);
  }
  return result;
}

/** Pro model catalog (OpenRouter ids), served by the API. */
export async function getAIModels(): Promise<AIModel[]> {
  return apiRequest<AIModel[]>("/api/v1/fitnexx/ai/models");
}

export async function saveAIConfiguration(settings: AISettings): Promise<void> {
  await storage.saveAISettings(settings);
}

export async function callAI(
  messages: AIMessage[],
  options?: { maxTokens?: number; temperature?: number },
): Promise<AIResponse> {
  const settings = await storage.getAISettings();
  const startedAt = Date.now();
  const response = await apiRequest<AIResponse>("/api/v1/fitnexx/ai/chat", {
    method: "POST",
    body: JSON.stringify({ model: settings.model, messages, ...options }),
  });
  const records = await storage.getAIUsage();
  await storage.saveAIUsage(
    [
      {
        id: Crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        model: settings.model,
        durationMs: Date.now() - startedAt,
        ...response.usage,
      },
      ...records,
    ].slice(0, 500),
  );
  return response;
}

/** Removes provider keys stored by the retired bring-your-own-key mode. */
export async function clearLegacyAIKeys(): Promise<void> {
  await Promise.all(
    ["openai", "anthropic", "google", "openrouter", "custom"].map((provider) =>
      SecureStore.deleteItemAsync(`fitnexx_ai_api_key_${provider}`),
    ),
  );
}
