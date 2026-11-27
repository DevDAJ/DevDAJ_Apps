# AI agent reference

A map of the codebase and the invariants to preserve. Start with
[AGENTS.md](../AGENTS.md) for the working rules; this file is the lookup
table. Verify against the code before relying on any detail here.

## Where things live

| Concern                 | Location                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| API root, CORS, errors  | `apps/web/src/server/app.ts`, `shared/errors.ts`, `shared/auth.ts`, `shared/supabase.ts`                                                        |
| API version mounting    | `apps/web/src/server/v1.ts`, `apps/<app>/v1/index.ts`                                                                                           |
| Fitnexx server config   | `apps/web/src/server/apps/fitnexx/env.ts` (`FITNEXX_*` getters)                                                                                 |
| Pro AI chat (server)    | `apps/fitnexx/lib/ai-chat.ts`, `lib/ai-request.ts`, `v1/ai.ts` (all under `apps/web/src/server/apps/`)                                          |
| Food scanner (server)   | `apps/web/src/server/apps/fitnexx/lib/food-scanner/` (pipeline, models, cache, nutrition, schemas, usda), `v1/food-analysis.ts` + `.service.ts` |
| Auth (shared, headless) | `packages/auth/src/index.ts` (core), `src/react.tsx` (context + hook, no UI)                                                                    |
| Auth (Fitnexx screens)  | `apps/fitnexx/components/auth/`, `lib/supabase.ts`                                                                                              |
| Pro AI chat (mobile)    | `apps/fitnexx/lib/ai.ts`, `components/settings/AISettingsCard.tsx`, `components/ExerciseSuggestions.tsx`                                        |
| Food queue (mobile)     | `apps/fitnexx/lib/foodAnalysisQueue.ts`, `lib/foodAnalysisCore.ts`, key in `lib/backupSchema.ts`                                                |
| Mobile storage          | `apps/fitnexx/lib/storage.ts` (AsyncStorage + shared SQLite), `lib/sharedData.ts`                                                               |
| On-device sharing       | `packages/app-data/` (expo-sqlite, Expo plugin, native infra)                                                                                   |
| Telemetry               | `packages/telemetry/src/index.ts`; wrappers: `apps/fitnexx/lib/telemetry.ts`, `apps/web/src/server/shared/telemetry.ts`                         |
| Migrations              | `packages/db/supabase/migrations/` + README index and push/repair workflow                                                                      |
| RevenueCat              | `apps/web/src/server/apps/fitnexx/lib/revenuecat.ts`, `v1/webhooks.ts`                                                                          |
| Website catalog         | `apps/web/src/catalog.ts`; design: `apps/web/DESIGN.md`                                                                                         |
| Fitnexx setup doc       | `apps/fitnexx/docs/ai-setup.md` (Supabase, RevenueCat, AI, food analysis)                                                                       |
| Pantry Helper (mobile)  | `apps/pantry/` (Expo, AsyncStorage + zustand, row sync through `/api/v1/pantry/*`)                                                              |
| Android release         | `.github/workflows/fitnexx-android-release.yml` (tag `fitnexx-vX.Y.Z`)                                                                          |

## Invariants (do not break)

1. Shared packages are app-agnostic and headless. App glue belongs in the
   app; no package renders UI or imports from an app.
2. One Supabase project, one migration history in `packages/db`. New schema
   change = new uniquely-versioned migration + README index entry; never
   edit applied migrations.
3. Never break a published API version in place; breaking changes get v2
   modules reusing `lib/`.
4. All AI is server-side on LangChain + OpenRouter. No provider keys in
   apps. Pro chat stays allowlisted (`FITNEXX_AI_MODELS`) and rate-limited;
   the food scanner stays two-step with the permanent `food_component`
   library and idempotent requests. Every OpenRouter request enforces Zero
   Data Retention and denies data collection
   (`provider: { zdr: true, data_collection: "deny" }`, `shared/openrouter.ts`).
5. Telemetry is errors-only, opt-in on mobile, one PostHog key per project,
   anonymous (no person profiles, no user ids), no-op without a key.
6. Guests never get Pro or a food-analysis allowance; Pro routes require a
   full account.
7. Shared SQLite tables are a public API: add columns, never rename or
   remove. Secrets and private data stay out of the shared database.
8. Secrets server-side only; RLS enabled, service-role access explicit.
9. `bun run ready` green before every commit; the vp formatter is
   authoritative.

## Common tasks

- **Add an API route**: controller in `apps/<app>/v1/`, logic + tests in
  `lib/`, mount in the app's `v1/index.ts`; pick the right macro
  (`auth`/`member`/`pro`/`admin`) and `jsonLimit`. See `apps/web/README.md`.
- **Add a migration**: new file in `packages/db/supabase/migrations/`,
  idempotent SQL, unique version, README index row; apply with `db:push`.
- **Change the Pro model catalog**: `FITNEXX_AI_MODELS` (comma-separated
  OpenRouter ids); the server validates against it, the mobile picker reads
  `/ai/models`. No mobile release needed.
- **Change scanner models**: `FITNEXX_FOOD_VISION_MODEL` /
  `FITNEXX_FOOD_NUTRITION_MODEL` env vars; defaults in `env.ts`.
- **Capture an error**: mobile `captureAppError` (consent-gated), server
  `shared/telemetry.ts` (5xx/unhandled only). Correlate bug reports via
  `error_event_id`.
- **Add a shared package**: `packages/<name>`, `workspace:*` consumers,
  `vp test` script, headless and app-agnostic, README, root README table row.

## Gotchas

- Tests import from `vite-plus/test`, not `vitest`.
- `vp run -r` skips workspaces without the script (`packages/db` has no
  tests); `vp run` caches, so a stale pass can hide a changed file outside
  the workspace.
- The staged hook auto-fixes formatting on commit; it does not run tests.
- `@fitnexx/ai` and the Next.js routes in `apps/web/src/app/api` no longer
  exist; older docs or memories referencing them are stale.
- `apps/fitnexx/scripts/food-model/` (Tinker/Qwen training tooling and the
  expired-upload cleanup) was removed entirely; the app is an unpublished
  spike with no retention job. `food_model_release` and the consent columns
  on `food_scan` are legacy schema, unused by the current pipeline.
- The Supabase CLI may not be installed locally; the live database was
  hand-applied, so first push needs `migration repair` (packages/db README).
- No em dashes in any generated content, including docs and commit messages.
