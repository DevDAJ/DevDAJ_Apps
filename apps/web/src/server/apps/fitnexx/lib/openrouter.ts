/**
 * OpenRouter connection policy shared by every AI call site (Pro chat and the
 * food scanner). Privacy is enforced per request with body fields, not
 * headers: provider.zdr restricts routing to Zero Data Retention endpoints,
 * provider.data_collection excludes providers that store or train on prompts.
 * https://openrouter.ai/docs/guides/features/zdr
 * https://openrouter.ai/docs/guides/routing/provider-selection
 */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** No retained data and no data collection on any routed provider. */
export const OPENROUTER_MODEL_KWARGS = { provider: { zdr: true, data_collection: "deny" } };
