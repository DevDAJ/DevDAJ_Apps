import { Platform } from "react-native";

import type { SyncRow } from "./types";
import { requireSupabase } from "./supabase";

const BASE_PATH = "/api/v1/pantry";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string | undefined,
    public resetsAt: string | undefined,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");
  if (!apiUrl && Platform.OS !== "web") {
    throw new Error("The Pantry API URL is not configured.");
  }
  const { data } = await requireSupabase().auth.getSession();
  if (!data.session) throw new Error("Sign in to use Pantry Helper.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiUrl ?? ""}${BASE_PATH}${path}`, { ...init, headers });
  const result = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
    resetsAt?: string;
  };
  if (!response.ok) {
    throw new ApiRequestError(
      result.error ?? `Pantry request failed (${response.status}).`,
      response.status,
      result.code,
      result.resetsAt,
    );
  }
  return result;
}

export interface HouseholdSummary {
  id: string;
  name: string;
  joinedAt: string;
}

export interface CreatedHousehold {
  id: string;
  name: string;
}

export interface Member {
  userId: string;
  email: string | null;
  joinedAt: string;
}

export interface Invite {
  code: string;
  expiresAt: string;
}

export interface ImportUsage {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
}

export interface ParsedIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  raw: string;
}

export interface ParsedRecipe {
  title: string | null;
  ingredients: ParsedIngredient[];
  steps: string[];
}

export interface ImportResult {
  extractionId: string;
  source: "youtube" | "tiktok";
  url: string;
  title: string | null;
  recipe: ParsedRecipe;
  method: "rules" | "llm";
  cached: boolean;
  usage: ImportUsage;
}

export interface SyncRequestBody {
  cursor: number;
  rows: SyncRow[];
}

export interface SyncResponseBody {
  cursor: number;
  rows: SyncRow[];
  more: boolean;
}

export function listHouseholds(): Promise<HouseholdSummary[]> {
  return apiRequest<HouseholdSummary[]>("/households");
}

export function createHousehold(name: string): Promise<CreatedHousehold> {
  return apiRequest<CreatedHousehold>("/households", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function joinHousehold(code: string): Promise<CreatedHousehold> {
  return apiRequest<CreatedHousehold>("/households/join", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function listMembers(id: string): Promise<Member[]> {
  return apiRequest<Member[]>(`/households/${encodeURIComponent(id)}/members`);
}

export function createInvite(id: string): Promise<Invite> {
  return apiRequest<Invite>(`/households/${encodeURIComponent(id)}/invites`, {
    method: "POST",
  });
}

export function leaveHousehold(id: string): Promise<void> {
  return apiRequest<void>(`/households/${encodeURIComponent(id)}/members/me`, {
    method: "DELETE",
  });
}

export function syncHousehold(id: string, body: SyncRequestBody): Promise<SyncResponseBody> {
  return apiRequest<SyncResponseBody>(`/households/${encodeURIComponent(id)}/sync`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getImportUsage(id: string): Promise<ImportUsage> {
  return apiRequest<ImportUsage>(`/households/${encodeURIComponent(id)}/imports`);
}

export function importRecipe(id: string, url: string): Promise<ImportResult> {
  return apiRequest<ImportResult>(`/households/${encodeURIComponent(id)}/imports`, {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function parseCaption(text: string, title?: string): Promise<ParsedRecipe> {
  return apiRequest<ParsedRecipe>("/recipes/parse", {
    method: "POST",
    body: JSON.stringify({ text, ...(title ? { title } : {}) }),
  });
}
