# Architecture

## Shape of the system

Privacy-first, local-first phone apps around one shared backend:

- Personal data (workouts, meals, metrics) stays on the device in SQLite.
- One Supabase project holds every account and all server-side data.
- One API deployment (`apps/web`) serves every app under
  `/api/v<version>/<app>/...`.
- Shared packages are app-agnostic and headless. App-specific glue (screens,
  API clients, settings, storage keys) lives in the app. The retired
  `@fitnexx/ai` package is the precedent: it was dissolved into app-local
  code because it coupled one app to the API.

```text
apps/fitnexx (Expo)  ──┐
apps/<future app>    ──┼──> apps/web API (/api/v1/...) ──> Supabase (one project)
apps/web (browser)   ──┘         │
                                 └──> OpenRouter (all AI, LangChain)
packages/auth       shared headless login (core + React context/hook binding)
packages/app-data   on-device SQLite, cross-app read-only sharing
packages/telemetry  errors-only PostHog capture, one key per project
packages/db         the single ordered Supabase migration history
packages/utils      starter library template
```

## Headless packages

No package renders UI. `@devdaj/auth/react` is a context provider plus
`useAuth()` hook only (no screens, no styles); each app builds its own
screens, e.g. `apps/fitnexx/components/auth/`. `@devdaj/app-data` ships an
Expo config plugin and native sharing infrastructure (iOS app group, Android
ContentProvider), not components. Keep it that way: if a change needs UI, the
UI belongs in the app.

## Data tiers

| Tier                       | What lives there                                                                       | Rules                                                               |
| -------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Shared SQLite (`app-data`) | Workouts, meals, metrics, water, gyms: data other apps read                            | Public API: add columns, never rename or remove; no secrets         |
| Private AsyncStorage       | Templates, settings, reminders, Pro cache, sync secrets, AI settings/usage, food queue | Device-local; the food queue is excluded from backups and peer sync |
| Supabase (server)          | Accounts, entitlements, bug reports, food scans, component library, dataset, metrics   | RLS enabled; clients never touch service-role tables directly       |

## API (`apps/web`)

TanStack Start (React, SSR) for the website and admin dashboard; Elysia
mounted at `/api/*` for the apps. Layout and route macros (`auth`, `member`,
`pro`, `admin`, `jsonLimit`) are documented in `apps/web/README.md`.

- Per-app code: `src/server/apps/<app>/` with `env.ts` (app vars prefixed
  `<APP>_`), `lib/` (version-agnostic logic + tests) and `v1/` controllers.
- Versioning: never break a published version in place. Breaking changes get
  `v2/` modules reusing `lib/`, with v1 kept mounted until clients move.
- Errors: `ApiError(status, message)` from `shared/errors.ts`, one shared
  error shape; expected 4xx responses are not telemetry events.

## Accounts, guests and Pro

- `@devdaj/auth`: one shared login (email, Google, Apple). Guests are
  Supabase anonymous users, enabled per app (`allowGuest` client toggle +
  `<APP>_ALLOW_GUESTS` server toggle); the server enforces access, the toggle
  only hides UI.
- Fitnexx Pro: RevenueCat subscription, HMAC-signed webhook sets `user.isPro`.
  Pro routes use `pro: true` (full account required, never guests).
- Guests get no Pro and no food-analysis allowance (403 `account_required`).

## AI: one stack, server-side only

All AI runs on the API through LangChain (`@langchain/openai` `ChatOpenAI`)
over OpenRouter (`https://openrouter.ai/api/v1`, one `OPENROUTER_API_KEY`).
No bring-your-own-key mode; apps never store or send provider keys.

- Pro AI chat (`apps/fitnexx` exercise suggestions): plain chain,
  `FITNEXX_AI_MODELS` allowlist of OpenRouter model ids, Pro-only, 20
  requests/minute (`consume_ai_rate_limit`). Code:
  `apps/web/src/server/apps/fitnexx/lib/ai-chat.ts`, `v1/ai.ts`.
- Food scanner: two-step pipeline, free 10 analyses/UTC day, Pro 100, guests
  none. Vision identifies and weighs components; a permanent
  `food_component` library caches nutrition profiles forever (recognised
  foods cost no nutrition tokens); USDA FoodData Central grounds new
  profiles; per-scan portions store per-gram values so local edits never
  re-call the AI. Requests are idempotent (7-day response cache). Code:
  `apps/web/src/server/apps/fitnexx/lib/food-scanner/`,
  `v1/food-analysis.service.ts`. Setup:
  `apps/fitnexx/docs/ai-setup.md`.

Plain chains today; wrapping them as agent tools later should be a small
step, not a rework.

## Telemetry

`@devdaj/telemetry`: errors only, opt-in (off by default on mobile), one
PostHog project key per app (`<APP>_POSTHOG_API_KEY` server,
`EXPO_PUBLIC_POSTHOG_KEY` mobile), no-op when unset. Anonymous by
construction: no person profiles, no user ids, no autocapture. Bug reports
correlate with PostHog exceptions via `error_event_id` /
`telemetry_distinct_id` on the `bug_report` row.

## Website and admin

`apps/web` also serves the landing page (apps from `src/catalog.ts`), the
global gym dataset with contribution review, and store-metrics dashboards
(Google Play, App Store Connect). The dataset dashboard currently runs on
seeded preview data. Details: `apps/web/README.md`; visual design:
`apps/web/DESIGN.md`.
