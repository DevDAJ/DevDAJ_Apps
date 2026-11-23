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

Set `EXPO_PUBLIC_API_URL` in the mobile environment to the deployed API origin.
For local device testing, use a URL reachable from the device rather than
`localhost`.

AI chat is Pro-only and rate-limited per minute (`consume_ai_rate_limit`).
Food analysis stays available to every signed-in user, see below.

## Food photo analysis

Food analysis needs USDA, Jev, and the hosted Qwen endpoint:

- `FITNEXX_USDA_API_KEY` (FoodData Central candidate search)
- `OPENROUTER_API_KEY` (Jev `typesafe/jev-1.13` bounded food and serving
  choices)
- `FITNEXX_QWEN_FOOD_API_URL` (OpenAI-compatible `/v1/chat/completions` endpoint)
- `FITNEXX_QWEN_FOOD_API_KEY`
- `FITNEXX_QWEN_FOOD_MODEL` (default `Qwen/Qwen3.5-4B`)

The app uploads images through a short-lived Supabase Storage token. Qwen only
describes visible food. The user reviews that structure, USDA supplies nutrient
data, and Jev only chooses among bounded USDA or training-gate options. Images
are never sent to Jev. Queue data stays device-local under
`fitnexx_food_analysis_jobs` and is excluded from backups and peer sync.

Food analysis is available to every signed-in user, not just Pro. Free users
get 10 remote analyses per UTC day, Pro users get 100. Only successful
analyses count against the limit. The food migrations live in `packages/db`
and are applied in order by `supabase db push`:

```text
packages/db/supabase/migrations/20260919000000_food_analysis.sql
packages/db/supabase/migrations/20260920000000_food_model_learning.sql
```

The second migration creates the private image bucket, consented scan records,
model-release records, and locks the idempotency functions to `service_role`.
Schedule the retention cleanup at least daily in a secret-bearing job runner:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  python scripts/food-model/cleanup_expired.py
```

### SovernStack Qwen deployment

1. Create a SovernStack workspace with the full RTX 3090 (four 6 GB slices).
2. Install a current vLLM release that supports Qwen3.5 vision.
3. Set a random API key and start the OpenAI-compatible server:

```bash
vllm serve Qwen/Qwen3.5-4B \
  --host 0.0.0.0 \
  --port 8000 \
  --api-key "$FITNEXX_QWEN_FOOD_API_KEY" \
  --limit-mm-per-prompt image=1 \
  --max-model-len 8192
```

4. Expose port 8000 through SovernStack's HTTPS endpoint. Set
   `FITNEXX_QWEN_FOOD_API_URL=https://YOUR_ENDPOINT/v1/chat/completions` in the API server.
5. Keep the service private to the API (`apps/web`) where SovernStack networking permits;
   never put `FITNEXX_QWEN_FOOD_API_KEY` in the mobile environment.

### Consented training with Tinker

Install the current SDK and image dependency in an isolated Python environment:

```bash
uv pip install tinker tinker-cookbook pillow
```

Create an immutable dataset. This exports only `eligible`, non-withdrawn rows,
removes EXIF by re-encoding, deduplicates normalized SHA-256 bytes, and assigns
entire users to either train or eval:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  python scripts/food-model/prepare_dataset.py
```

Train a rank-16 LoRA using Tinker's supported `Qwen/Qwen3.5-4B` vision model:

```bash
TINKER_API_KEY=... python scripts/food-model/train_tinker.py \
  food-datasets/DATASET_HASH
```

Export the resulting Tinker checkpoint as a PEFT adapter with the official
`tinker_cookbook.weights.download` and `build_lora_adapter` APIs, then serve it
on SovernStack:

```bash
vllm serve Qwen/Qwen3.5-4B \
  --enable-lora \
  --lora-modules fitnexx-food=/path/to/peft_adapter \
  --api-key "$FITNEXX_QWEN_FOOD_API_KEY"
```

Evaluate the frozen base and candidate against the same user-separated holdout,
then enforce promotion gates:

```bash
python scripts/food-model/evaluate_endpoint.py food-datasets/DATASET_HASH \
  --url https://ENDPOINT/v1/chat/completions --key "$KEY" \
  --model Qwen/Qwen3.5-4B --output baseline.json
python scripts/food-model/evaluate_endpoint.py food-datasets/DATASET_HASH \
  --url https://ENDPOINT/v1/chat/completions --key "$KEY" \
  --model fitnexx-food --output candidate.json
python scripts/food-model/promotion_gate.py baseline.json candidate.json
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  python scripts/food-model/release.py canary fitnexx-food-v1 \
  --adapter-uri /models/fitnexx-food-v1 --dataset-hash DATASET_HASH \
  --baseline baseline.json --metrics candidate.json
```

Promotion requires 98% schema validity, at least +0.02 item F1, no hallucination
regression, and no more than 20% p95 latency regression. Deploy passing adapters
as a canary first. Keep the prior adapter mounted until canary metrics pass, so
rollback is only a model-name switch. The web API sends a stable 5% user cohort
to the database release marked `canary`. Promote or roll back without an API
deployment:

```bash
python scripts/food-model/release.py promote fitnexx-food-v1 \
  --baseline baseline.json --metrics canary.json
python scripts/food-model/release.py rollback PREVIOUS_VERSION
```

## Checks

```bash
bun test
bunx tsc --noEmit -p apps/fitnexx/tsconfig.json
vp run web#typecheck
bun run build
```
