/**
 * Fitnexx server configuration. App-specific values are prefixed with `FITNEXX_`
 * so several apps can share one API deployment. Supabase (shared login) and AI provider keys are shared.
 */
export const fitnexxEnv = {
  /** Let guest (anonymous) users use member routes such as food analysis. Pro routes never allow guests. */
  get allowGuests() {
    return process.env.FITNEXX_ALLOW_GUESTS === "true";
  },
  get usdaApiKey() {
    return process.env.FITNEXX_USDA_API_KEY;
  },
  get openrouterApiKey() {
    return process.env.OPENROUTER_API_KEY;
  },
  get foodVisionUrl() {
    return process.env.FITNEXX_QWEN_FOOD_API_URL;
  },
  get foodVisionKey() {
    return process.env.FITNEXX_QWEN_FOOD_API_KEY;
  },
  get foodVisionModel() {
    return process.env.FITNEXX_QWEN_FOOD_MODEL ?? "Qwen/Qwen3.5-4B";
  },
  get revenuecatWebhookSecret() {
    return process.env.FITNEXX_REVENUECAT_WEBHOOK_SECRET ?? "";
  },
  get revenuecatSecretApiKey() {
    return process.env.FITNEXX_REVENUECAT_SECRET_API_KEY;
  },
  get revenuecatProEntitlement() {
    return process.env.FITNEXX_REVENUECAT_PRO_ENTITLEMENT ?? "pro";
  },
};
