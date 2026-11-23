/**
 * OpenRouter connection policy shared by every AI call site (Pro chat and the
 * food scanner). Zero Data Retention is enforced per request with the body
 * field provider.zdr; OpenRouter has no header for it.
 * https://openrouter.ai/docs/guides/features/zdr
 */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Route only to endpoints that do not retain prompts or responses. */
export const OPENROUTER_MODEL_KWARGS = { provider: { zdr: true } };
