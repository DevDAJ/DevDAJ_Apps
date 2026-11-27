import type { AuthUser } from "../../../shared/auth";
import { ApiError, messageOf } from "../../../shared/errors";
import { getSupabaseAdmin } from "../../../shared/supabase";
import { pantryEnv } from "../env";
import { parseRecipeText, type ParsedRecipe } from "../lib/ingredient-parser";
import { extractRecipeWithLlm } from "../lib/recipe-llm";
import { parseVideoUrl, type ParsedVideoUrl, type RecipeSource } from "../lib/source";
import { weekStartUtc } from "../lib/week";
import { requireMember } from "./households.service";

export const WEEKLY_IMPORT_LIMIT = 3;
const UPSTREAM_TIMEOUT_MS = 8_000;
const MAX_CAPTION_LENGTH = 12_000;

type FullVideo = { source: RecipeSource; sourceId: string; url: string };

export interface FetchedSource extends FullVideo {
  title: string | null;
  texts: string[];
}

export interface ImportUsage {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
}

export interface ImportResult {
  extractionId: string;
  source: RecipeSource;
  url: string;
  title: string | null;
  recipe: ParsedRecipe;
  method: "rules" | "llm";
  cached: boolean;
  usage: ImportUsage;
}

interface ExtractionRow {
  id: string;
  source: string;
  url: string;
  title: string | null;
  recipe: ParsedRecipe;
  method: "rules" | "llm";
}

interface YouTubeVideoResponse {
  items?: Array<{
    snippet?: { title?: unknown; description?: unknown; channelId?: unknown };
  }>;
}

interface YouTubeCommentResponse {
  items?: Array<{
    snippet?: {
      topLevelComment?: {
        snippet?: {
          textOriginal?: unknown;
          textDisplay?: unknown;
          authorChannelId?: { value?: unknown };
        };
      };
    };
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function limitError(resetsAt: string): ApiError {
  return new ApiError(429, "This household has used its 3 recipe imports this week.", {
    code: "import_limit",
    resetsAt,
  });
}

async function getJson(url: string, platform: "YouTube" | "TikTok"): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!response.ok) throw new ApiError(502, `Could not reach ${platform}.`);
  return response.json();
}

/** Follow a TikTok short link just far enough to learn the source id, before spending quota. */
async function resolveSource(parsed: ParsedVideoUrl): Promise<FullVideo> {
  if ("source" in parsed) return parsed;
  const response = await fetch(parsed.shortLink, {
    redirect: "follow",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new ApiError(502, "Could not reach TikTok.");
  const redirectUrl = response.url;
  await response.body?.cancel();
  let resolved: ParsedVideoUrl;
  try {
    resolved = parseVideoUrl(redirectUrl);
  } catch {
    throw new ApiError(422, "Could not read that TikTok link.");
  }
  if (!("source" in resolved) || resolved.source !== "tiktok") {
    throw new ApiError(422, "Could not read that TikTok link.");
  }
  return resolved;
}

/** Read the description, creator comments or TikTok caption that may contain a recipe. */
export async function fetchSourceText(parsed: ParsedVideoUrl): Promise<FetchedSource> {
  const source = await resolveSource(parsed);

  if (source.source === "youtube") {
    const key = pantryEnv.youtubeApiKey;
    if (!key) throw new ApiError(503, "YouTube import is not configured.");
    const base = "https://www.googleapis.com/youtube/v3";
    const videos = (await getJson(
      `${base}/videos?part=snippet&id=${encodeURIComponent(source.sourceId)}&key=${encodeURIComponent(key)}`,
      "YouTube",
    )) as YouTubeVideoResponse;
    const snippet = videos.items?.[0]?.snippet;
    if (!snippet) throw new ApiError(404, "Video not found.");
    const title = typeof snippet.title === "string" ? snippet.title : null;
    const description = typeof snippet.description === "string" ? snippet.description : "";
    const channelId = snippet.channelId;
    const creatorComments: string[] = [];

    if (typeof channelId === "string" && channelId) {
      try {
        const comments = (await getJson(
          `${base}/commentThreads?part=snippet&videoId=${encodeURIComponent(source.sourceId)}&maxResults=50&order=relevance&textFormat=plainText&key=${encodeURIComponent(key)}`,
          "YouTube",
        )) as YouTubeCommentResponse;
        for (const thread of comments.items ?? []) {
          const comment = thread.snippet?.topLevelComment?.snippet;
          // The API does not flag pinned comments, so creator replies are the closest signal.
          if (comment?.authorChannelId?.value !== channelId) continue;
          const text = comment.textOriginal ?? comment.textDisplay;
          if (typeof text === "string") creatorComments.push(text);
        }
      } catch {
        // Comments can be disabled or unavailable; the description still stands on its own.
      }
    }
    return {
      ...source,
      title,
      texts: [description, ...creatorComments],
    };
  }

  // oEmbed exposes the caption only; creator comments have no public TikTok API.
  const oembed = (await getJson(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(source.url)}`,
    "TikTok",
  )) as { title?: unknown };
  const caption = typeof oembed.title === "string" ? oembed.title : "";
  const title = caption.split("\n")[0].trim().slice(0, 120) || null;
  return { ...source, title, texts: [caption] };
}

/** Rules first; the LLM runs only for sparse results and only on the video path. */
export async function extractRecipe(
  fetched: FetchedSource,
): Promise<{ recipe: ParsedRecipe; method: "rules" | "llm" }> {
  let best = parseRecipeText("", fetched.title);
  for (const text of fetched.texts) {
    const candidate = parseRecipeText(text, fetched.title);
    if (candidate.ingredients.length > best.ingredients.length) best = candidate;
  }

  let method: "rules" | "llm" = "rules";
  const key = pantryEnv.openrouterApiKey;
  if (best.ingredients.length < 3 && key) {
    try {
      const candidate = await extractRecipeWithLlm(
        fetched.texts.join("\n\n"),
        fetched.title,
        key,
        pantryEnv.recipeModel,
      );
      if (candidate.ingredients.length > best.ingredients.length) {
        best = candidate;
        method = "llm";
      }
    } catch (error) {
      console.warn("[pantry] recipe LLM fallback failed", messageOf(error, "unknown error"));
    }
  }
  if (best.ingredients.length === 0) {
    throw new ApiError(422, "No recipe found in that video's description or comments.");
  }
  return { recipe: best, method };
}

export async function getImportUsage(householdId: string, userId: string): Promise<ImportUsage> {
  await requireMember(householdId, userId);
  const start = weekStartUtc(new Date());
  const { count, error } = await getSupabaseAdmin()
    .from("household_recipe_import")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .gte("imported_at", start.toISOString());
  if (error) throw error;
  const used = count ?? 0;
  return {
    limit: WEEKLY_IMPORT_LIMIT,
    used,
    remaining: Math.max(0, WEEKLY_IMPORT_LIMIT - used),
    resetsAt: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
  };
}

/** Import one video recipe, reusing the global extraction cache and the household's weekly quota. */
export async function importRecipe(
  householdId: string,
  user: AuthUser,
  body: unknown,
): Promise<ImportResult> {
  await requireMember(householdId, user.id);
  if (!isRecord(body)) throw new ApiError(400, "Paste a YouTube or TikTok video link.");
  const source = await resolveSource(parseVideoUrl(body.url));
  const usage = await getImportUsage(householdId, user.id);
  if (usage.remaining <= 0) throw limitError(usage.resetsAt);

  const admin = getSupabaseAdmin();
  const columns = "id,source,url,title,recipe,method";
  const { data: found, error: lookupError } = await admin
    .from("recipe_extraction")
    .select(columns)
    .eq("source", source.source)
    .eq("source_id", source.sourceId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  let extraction: ExtractionRow;
  let cached = false;
  if (found) {
    extraction = found as unknown as ExtractionRow;
    cached = true;
  } else {
    const fetched = await fetchSourceText(source);
    const { recipe, method } = await extractRecipe(fetched);
    const { error: insertError } = await admin.from("recipe_extraction").upsert(
      {
        source: fetched.source,
        source_id: fetched.sourceId,
        url: fetched.url,
        title: fetched.title,
        recipe,
        method,
      },
      { onConflict: "source,source_id", ignoreDuplicates: true },
    );
    if (insertError) throw insertError;
    // Another household may have won the insert race; read back the winning row.
    const { data: stored, error: readError } = await admin
      .from("recipe_extraction")
      .select(columns)
      .eq("source", source.source)
      .eq("source_id", source.sourceId)
      .maybeSingle();
    if (readError) throw readError;
    if (!stored) throw new ApiError(500, "Could not save the recipe extraction.");
    extraction = stored as unknown as ExtractionRow;
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_recipe_import", {
    p_household: householdId,
    p_extraction: extraction.id,
    p_user: user.id,
    p_limit: WEEKLY_IMPORT_LIMIT,
  });
  if (claimError) throw claimError;
  if (!claimed) throw limitError(usage.resetsAt);

  if (cached) {
    // Product choice: cache hits still cost a weekly import, and a short wait keeps them feeling like real work.
    await Bun.sleep(2_000 + Math.floor(Math.random() * 2_000));
  }

  return {
    extractionId: extraction.id,
    source: extraction.source as RecipeSource,
    url: extraction.url,
    title: extraction.title,
    recipe: extraction.recipe,
    method: extraction.method,
    cached,
    usage: await getImportUsage(householdId, user.id),
  };
}

/** Paste-a-caption path: rules only, no LLM, no cache and no quota. */
export function parseText(body: unknown): ParsedRecipe {
  if (!isRecord(body) || typeof body.text !== "string") {
    throw new ApiError(400, "Paste a recipe caption.");
  }
  const text = body.text.trim();
  if (text.length < 1 || text.length > MAX_CAPTION_LENGTH) {
    throw new ApiError(400, "Recipe caption must be 1 to 12,000 characters.");
  }
  if (body.title !== undefined && typeof body.title !== "string") {
    throw new ApiError(400, "Invalid recipe title.");
  }
  return parseRecipeText(text, body.title);
}
