/**
 * Pantry Helper server configuration. App-specific values are prefixed with
 * `PANTRY_`; the OpenRouter key is shared with the other apps' AI call sites.
 */
export const pantryEnv = {
  get youtubeApiKey() {
    return process.env.PANTRY_YOUTUBE_API_KEY;
  },
  get openrouterApiKey() {
    return process.env.OPENROUTER_API_KEY;
  },
  get recipeModel() {
    return process.env.PANTRY_RECIPE_MODEL ?? "google/gemini-2.5-flash";
  },
};
