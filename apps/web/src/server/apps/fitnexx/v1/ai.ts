import { chat, listModels } from "@fitnexx/ai";
import { Elysia, t } from "elysia";
import { bodyLimits } from "../../../shared/body";
import { ApiError, messageOf } from "../../../shared/errors";
import {
  allowedModels,
  isServerProvider,
  parseServerAIRequest,
  providerKey,
} from "../lib/ai-request";
import { fitnexxAuth } from "../auth";
import { getSupabaseAdmin } from "../../../shared/supabase";

async function consumeAIRateLimit(userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("consume_ai_rate_limit", {
    p_user_id: userId,
  });
  if (error) throw error;
  return data ?? false;
}

/** Fitnexx Pro AI proxy: `/ai/models`, `/ai/chat`. */
export const ai = new Elysia({ prefix: "/ai", tags: ["fitnexx"] })
  .use(fitnexxAuth)
  .use(bodyLimits)
  .get(
    "/models",
    async ({ query, set }) => {
      if (!isServerProvider(query.provider)) {
        throw new ApiError(400, "Select a supported AI provider.");
      }
      const provider = query.provider;
      try {
        const enabled = allowedModels();
        const models = await listModels({ provider, apiKey: providerKey(provider) });
        set.headers["cache-control"] = "private, max-age=300";
        return models.filter((model) => enabled.has(`${provider}:${model.id}`));
      } catch (error) {
        throw new ApiError(400, messageOf(error, "Could not load models."));
      }
    },
    { pro: true, query: t.Object({ provider: t.Optional(t.String()) }) },
  )
  .post(
    "/chat",
    async ({ body, user, set }) => {
      set.headers["cache-control"] = "no-store";
      if (!(await consumeAIRateLimit(user.id))) {
        throw new ApiError(429, "Too many AI requests. Try again in a minute.");
      }
      try {
        return await chat(parseServerAIRequest(body));
      } catch (error) {
        throw new ApiError(400, messageOf(error, "AI request failed."));
      }
    },
    { pro: true, jsonLimit: 200_000 },
  );
