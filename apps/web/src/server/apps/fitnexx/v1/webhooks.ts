import { Elysia } from "elysia";
import { bodyLimits } from "../../../shared/body";
import { ApiError } from "../../../shared/errors";
import { fitnexxEnv } from "../env";
import { getRevenueCatProState, verifyRevenueCatWebhook } from "../lib/revenuecat";
import { getSupabaseAdmin } from "../../../shared/supabase";

type RevenueCatEvent = {
  app_user_id?: string;
  aliases?: string[];
  original_app_user_id?: string;
  transferred_from?: string[];
  transferred_to?: string[];
};

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** RevenueCat webhook: re-reads entitlement state for every user id in the event. */
export const webhooks = new Elysia({ prefix: "/webhooks", tags: ["fitnexx"] }).use(bodyLimits).post(
  "/revenuecat",
  async ({ body, headers }) => {
    const raw = body as string;
    if (
      !verifyRevenueCatWebhook(
        raw,
        headers["x-revenuecat-webhook-signature"] ?? null,
        fitnexxEnv.revenuecatWebhookSecret,
      )
    ) {
      throw new ApiError(401, "Invalid signature.");
    }

    let event: RevenueCatEvent;
    try {
      event = (JSON.parse(raw) as { event?: RevenueCatEvent }).event ?? {};
    } catch {
      throw new ApiError(400, "Invalid JSON.");
    }

    const apiKey = fitnexxEnv.revenuecatSecretApiKey;
    if (!apiKey) throw new ApiError(500, "RevenueCat API is not configured.");
    const entitlement = fitnexxEnv.revenuecatProEntitlement;
    const userIds = [
      event.app_user_id,
      event.original_app_user_id,
      ...(event.aliases ?? []),
      ...(event.transferred_from ?? []),
      ...(event.transferred_to ?? []),
    ].filter((id): id is string => Boolean(id && USER_ID.test(id)));

    for (const userId of new Set(userIds)) {
      const pro = await getRevenueCatProState(userId, apiKey, entitlement);
      const { error } = await getSupabaseAdmin()
        .from("user")
        .upsert(
          { id: userId, isPro: pro, proUpdatedAt: new Date().toISOString() },
          { onConflict: "id" },
        );
      if (error) console.error("[fitnexx/revenuecat] upsert", error);
    }
    return { ok: true };
  },
  { textLimit: 100_000 },
);
