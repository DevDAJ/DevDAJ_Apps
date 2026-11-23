import { Elysia } from "elysia";
import { bodyLimits } from "../../../shared/body";
import { ApiError, messageOf } from "../../../shared/errors";
import { getSupabaseAdmin } from "../../../shared/supabase";
import { fitnexxAuth } from "../auth";
import { aiCatalog, chatCompletion } from "../lib/ai-chat";
import { parseChatRequest } from "../lib/ai-request";

async function consumeAIRateLimit(userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("consume_ai_rate_limit", {
    p_user_id: userId,
  });
  if (error) throw error;
  return data ?? false;
}

/** Fitnexx Pro AI (LangChain over OpenRouter): `/ai/models`, `/ai/chat`. */
export const ai = new Elysia({ prefix: "/ai", tags: ["fitnexx"] })
  .use(fitnexxAuth)
  .use(bodyLimits)
  .get(
    "/models",
    ({ set }) => {
      set.headers["cache-control"] = "private, max-age=300";
      return aiCatalog();
    },
    { pro: true },
  )
  .post(
    "/chat",
    async ({ body, user, set }) => {
      set.headers["cache-control"] = "no-store";
      if (!(await consumeAIRateLimit(user.id))) {
        throw new ApiError(429, "Too many AI requests. Try again in a minute.");
      }
      try {
        return await chatCompletion(parseChatRequest(body));
      } catch (error) {
        throw new ApiError(400, messageOf(error, "AI request failed."));
      }
    },
    { pro: true, jsonLimit: 200_000 },
  );
