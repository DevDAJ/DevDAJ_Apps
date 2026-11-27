# AI and Pro setup

AI chat (exercise suggestions) is Pro-only and runs on the API. Fitnexx Pro
requires Supabase authentication, RevenueCat, the API (`apps/web`), and an
OpenRouter key. Food analysis is the exception: every signed-in user gets it.

## Supabase authentication

Fitnexx signs in through the shared DevDAJ login (`packages/auth`): one Supabase project
holds the accounts for every DevDAJ app. Set the project up once as described in
`packages/auth/README.md` (Email, Google and Apple providers, and the redirect URL
`fitnexx://auth-callback`), then:

1. Copy `apps/fitnexx/.env.example` to `apps/fitnexx/.env` and set
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the shared project.
2. Copy `apps/web/.env.example` to `apps/web/.env` and set `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` to the same values.
3. Guests (optional, on by default in the examples): set `EXPO_PUBLIC_AUTH_ALLOW_GUEST="true"` in
   the app and `FITNEXX_ALLOW_GUESTS="true"` on the API, and enable anonymous sign-ins and manual
   linking in Supabase. Guests get no food-analysis allowance (usage
   reads 0, analysis returns 403 `account_required`) and Pro always requires a full account, so
   neither can be farmed with throwaway guest sessions.

Fitnexx stores user entitlements and interest-list signups in the Supabase
database. All apps share one Supabase project; the single migration history
lives in [`packages/db`](../../../packages/db). Apply it before deploying:

```bash
cd packages/db
supabase link --project-ref <your-project-ref>   # once per machine
SUPABASE_DB_PASSWORD=<db-password> bun run db:push
```

The baseline migration creates the `user` and `interest_list_entry` tables,
enables row-level security, and creates the `consume_ai_rate_limit` function.
See the `packages/db` README for reconciling a database set up by hand.

The server uses the `SUPABASE_SERVICE_ROLE_KEY` (service role) to bypass RLS.
Add it to `apps/web/.env` alongside `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## RevenueCat subscription

1. Create a RevenueCat project and add iOS and Android apps with identifier
   `tech.devdaj.app.fitnexx`.
2. Connect App Store Connect and Google Play, then create a monthly subscription
   priced at $3.99 USD in each store.
3. Create an entitlement named `pro` and attach both store products.
4. Create an offering, make it current, and add the monthly package. The app
   purchases the first package in the current offering.
5. Put the public Apple and Google SDK keys in
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and
   `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`. Keep
   `EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT=pro`.
6. Add an HTTPS webhook pointing to
   `https://YOUR_API_HOST/api/v1/fitnexx/webhooks/revenuecat`.
7. Enable HMAC webhook signing. Store the signing secret as
   `FITNEXX_REVENUECAT_WEBHOOK_SECRET` in the API deployment (`apps/web`) and set
   `FITNEXX_REVENUECAT_PRO_ENTITLEMENT=pro`.
8. Create a RevenueCat secret API key with read access to customer information
   and set it as `FITNEXX_REVENUECAT_SECRET_API_KEY`. The webhook uses it to check the
   customer's current entitlement state.
9. Send a test webhook from RevenueCat after deploying.

Use Supabase user UUIDs as RevenueCat App User IDs. The mobile integration does
this automatically after sign-in. Real purchases need an Expo development
build; Expo Go only provides RevenueCat preview behavior.

## AI providers

All AI chat runs on the API through LangChain and OpenRouter, the same stack
as the food scanner. There is no bring-your-own-key mode; the app never stores
or sends provider keys.

1. Set `OPENROUTER_API_KEY` in the API deployment (`apps/web`).
2. `FITNEXX_AI_MODELS` is a comma-separated allowlist of OpenRouter model ids.
   Only allowlisted models appear to Pro users and pass the proxy. The default is:

```text
openai/gpt-4.1-mini,anthropic/claude-sonnet-4,google/gemini-2.5-flash
```

Every OpenRouter request (chat and both scanner steps) enforces Zero Data
Retention with `provider.zdr: true` and denies data collection with
`provider.data_collection: "deny"`, so model endpoints do not retain prompts
or responses and providers that store or train on them are excluded.
OpenRouter expresses this as request body fields, not headers; the shared
policy lives in `apps/web/src/server/shared/openrouter.ts`.

Set `EXPO_PUBLIC_API_URL` in the mobile environment to the deployed API origin.
For local device testing, use a URL reachable from the device rather than
`localhost`.

AI chat is Pro-only and rate-limited per minute (`consume_ai_rate_limit`).
Food analysis stays available to every signed-in user, see below.

## Food photo analysis

Food analysis runs entirely on the API as a two-step LangChain pipeline over
OpenRouter. It needs:

- `OPENROUTER_API_KEY` (both pipeline steps)
- `FITNEXX_USDA_API_KEY` (optional; FoodData Central reference search. Without
  it the nutrition model profiles components without USDA references)
- `FITNEXX_FOOD_VISION_MODEL` (default `google/gemini-2.5-flash`)
- `FITNEXX_FOOD_NUTRITION_MODEL` (default `openai/gpt-4.1-mini`)

### Request flow

All routes live at `/api/v1/fitnexx/food-analysis` and require a signed-in
account (guests read usage 0 and get 403 `account_required` on the spending
routes):

1. `GET` returns `{ isPro, limit, remaining }` for the current UTC day.
2. `PUT { contentType, byteSize }` reserves a `food_scan` row and returns
   `{ scanId, path, token }`: a short-lived signed upload URL for the private
   `food-scan-images` bucket. JPEG, PNG or WebP, at most 8 MB, at most 3
   pending uploads per user.
3. The app uploads the image directly to Supabase Storage with that token,
   then queues `POST { requestId, scanId }`. One POST runs the whole pipeline
   and returns the editable result. There is no separate vision or nutrition
   call and no PATCH route.
4. `DELETE { scanId }` removes the scan and its image.

### Pipeline

1. The vision model identifies each visible component and estimates its grams
   (structured output; it describes only visible evidence, never hidden
   ingredients).
2. Cached profiles are looked up in the permanent `food_component` library,
   one query per scan. Recognised foods cost no nutrition-model tokens.
3. For uncached components the server searches USDA FoodData Central, and the
   nutrition model writes a per-100 g profile grounded in the USDA reference
   when one fits. Calories must match the macros; an inconsistent profile gets
   one correction pass.
4. New profiles are saved to `food_component` permanently and reused by every
   later scan, for every user. Per-scan portions are saved to
   `food_scan_component` with exact per-gram values, so editing grams in the
   app never calls the AI again.

Requests are idempotent: `claim_food_analysis_request` leases a `requestId`
for 5 minutes and keeps completed responses for 7 days, matching the mobile
retry window. A retried POST returns the cached result instead of paying for
another analysis.

### Allowance and queue

Food analysis is available to every signed-in user, not just Pro. Free users
get 10 remote analyses per UTC day, Pro users get 100. Only successful
analyses count against the limit (`consume_food_analysis_rate_limit`).

The mobile queue stays device-local in AsyncStorage under
`fitnexx_food_analysis_jobs` and is excluded from backups and peer sync. Jobs
retry with backoff while a connection is available and fail after 7 days
offline or repeated non-retryable errors.

### Migrations and retention

The food migrations live in `packages/db` and are applied in order by
`supabase db push`:

```text
packages/db/supabase/migrations/20260919000000_food_analysis.sql
packages/db/supabase/migrations/20260920000000_food_model_learning.sql
packages/db/supabase/migrations/20261123000000_food_scanner.sql
```

They create the daily-limit and idempotency functions, the private image
bucket and `food_scan` table, and the `food_component` / `food_scan_component`
scanner tables. Pending uploads expire after 1 day; analyzed scans are kept
(`expires_at` cleared).

This is still a spike and the app was never published, so there is no
scheduled retention job: expired pending uploads are not physically purged.
They linger (and still count toward the pending-upload cap) until the user
deletes or analyzes them. Add a retention job before publishing.

The consent/training columns on `food_scan` and the `food_model_release`
table belong to a retired self-hosted Qwen design and are unused by the
current pipeline; the schema is left in place. The old `scripts/food-model/`
tooling (dataset export, Tinker training, evaluation, release and the
expired-upload cleanup) has been removed entirely.

## Checks

From the repo root, the full gate (lint, format, type check, tests, builds):

```bash
bun run ready
```

Per workspace: `vp run fitnexx#test`, `vp run fitnexx#typecheck`,
`vp run web#test`, `vp run web#typecheck`.
