# Web

The DevDAJ website, admin dashboard and API in one [TanStack Start](https://tanstack.com/start)
app (React, SSR) on Bun. The [Elysia](https://elysiajs.com) API is mounted at `/api/*`, so the mobile
apps call the same server: `/api/v<version>/<app>/...`, e.g. `/api/v1/fitnexx/ai/chat`.

```bash
cp .env.example .env
vp run web#dev            # http://localhost:3001, API docs at /api/docs (not in production)
vp run web#test
vp run web#build && bun apps/web/server.ts   # production
```

Apply the shared schema migrations from [`packages/db`](../../packages/db)
(`supabase db push`); every DevDAJ app uses the same Supabase project.

## Pages

| Path            | What                                                                      |
| --------------- | ------------------------------------------------------------------------- |
| `/`             | Landing page: every app in `src/catalog.ts`, how the apps keep data local |
| `/apps/<slug>`  | App page with store download links                                        |
| `/contribute`   | Signed in: suggest a gym or an edit to one, see your suggestions          |
| `/signin`       | Shared DevDAJ account (email + password, Google)                          |
| `/dashboard`    | Dataset dashboard for admins, maintainers and contributors (preview data) |
| `/admin`        | Admins only (`ADMIN_USER_IDS`): downloads and active devices per app      |
| `/admin/review` | Admins only: approve or reject dataset suggestions                        |

Add an app by adding it to `src/catalog.ts` (its store ids drive the metrics sync too).

## Pantry Helper web app

In production the same server serves `/pantry/app/` from the Pantry web export. Run
`vp run pantry#build` or `bun run ready` first. `vp dev` does not serve it; use the Expo dev server
(`vp run pantry#dev`, then `w`) while working on the PWA.

## Layout

```
server.ts               production server (Bun): static assets + Start handler
src/
  catalog.ts            every DevDAJ app (client + server safe)
  routes/               pages; routes/api/$.ts hands /api/* to Elysia
  components/, lib/     UI pieces, browser auth (lib/auth.ts) and API helper (lib/api.ts)
  server/
    app.ts              root: /api prefix, CORS, OpenAPI, /health, shared error shape
    v1.ts               mounts each app's and the platform's v1 modules under /v1
    shared/             shared login (auth.ts), Supabase client, errors, body-size macros
    platform/           cross-app features
      admin.ts          `admin: true` route option
      dataset/          global dataset (gyms) + review queue
      metrics/          store downloads/usage sync (Google Play, App Store Connect)
    apps/<app>/
      env.ts            config, app-specific vars prefixed <APP>_
      lib/              version-agnostic logic + unit tests (reused by future versions)
      v1/               Elysia controllers for v1 (+ services)
```

### Adding an app API

1. `src/server/apps/<app>/v1/index.ts` exporting `new Elysia({ name: "<app>.v1", prefix: "/<app>" })`.
2. `.use()` it in `src/server/v1.ts`.
3. Add its `<APP>_*` variables to the root `.env.example`.

### Versioning

Never break a published version in place. For breaking changes create `src/server/v2.ts` and
`src/server/apps/<app>/v2/`, reuse `lib/`, and keep v1 mounted until clients have moved.

## Global dataset

Public data every app can rely on (starting with gyms and their equipment). Anyone signed in can
suggest a new gym or a full new version of an existing one; nothing is public until an admin
approves it. Approval runs `approve_dataset_contribution` (SQL), which applies the change and marks
it approved in one transaction.

| Method | Path                                       | Notes                                                                     |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------- |
| GET    | `/api/v1/dataset/gyms?lat=&lng=&radiusKm=` | Public. Approved gyms, nearest first (radius ≤ 100)                       |
| POST   | `/api/v1/dataset/contributions`            | Signed in. `{ dataset: "gyms", targetId?, payload }`; max 20 pending each |
| GET    | `/api/v1/dataset/contributions/mine`       | Signed in. Your suggestions and their status                              |
| GET    | `/api/v1/admin/contributions?status=`      | Admin. Queue (`pending` / `approved` / `rejected`)                        |
| POST   | `/api/v1/admin/contributions/:id/approve`  | Admin. `{ note? }`                                                        |
| POST   | `/api/v1/admin/contributions/:id/reject`   | Admin. `{ note? }`                                                        |

## Dataset dashboard (`/dashboard`, design preview)

Runs on seeded, in-memory data (`src/lib/dashboard/mock.ts`) so the charts can be designed before the
database work; a "View as" switch shows the admin, maintainer and contributor views. Pages read only
`useDashboard()` (`src/lib/dashboard/store.tsx`); swap that provider for the platform API when ready.

- **Admin**: analytics (contributions by outcome, dataset growth, queue age, review speed per
  maintainer, top contributors, activity heatmap, maintainer pipeline), review, people/applications.
- **Maintainer**: owns one or more datasets. Approves, rejects or marks contributor requests as spam /
  unreliable; adds items directly (live at once, then checked or flagged by another maintainer).
- **Contributor**: suggests new items or edits. May apply to maintain a dataset with ≥ 20 contributions
  in the last 30 days and ≤ 10% of reviewed contributions marked spam or unreliable
  (`src/lib/dashboard/rules.ts`).
- **API (every role)**: the dataset is free in DevDAJ apps and in the dashboard; developers who want
  it in their own app buy a monthly plan (Starter / Growth / Scale, placeholder prices in
  `src/lib/dashboard/api.ts`) and call the API with `ddk_live_…` tokens. Non-admins pick a plan,
  create and revoke tokens, and see usage against the quota; admins see revenue (MRR by plan),
  paid usage by dataset, top developers and refused (429) calls. Preview only: no payments, and
  the dataset endpoints don't check tokens yet.

## Store metrics

`POST /api/v1/admin/metrics/sync { days }` pulls numbers into `app_store_metrics`;
`GET /api/v1/admin/metrics?days=` serves the dashboard. Sync from the dashboard button, or call it
from a daily cron with an admin token.

- **Google Play**: monthly installs reports from the Play Console Cloud Storage bucket. Downloads =
  "Daily User Installs", active devices = "Active Device Installs".
- **App Store**: daily Sales and Trends reports (first-time download units per Apple id). Active
  devices need the Analytics Reports API and are not collected yet.

Stores without credentials show as "not configured"; nothing else breaks.

## Route options (macros)

- `auth: "<401 message>"`: shared DevDAJ login (`shared/auth.ts`, any app). Requires a Supabase
  bearer token from the shared project and adds `user: { id, email, isGuest }`. Guests get
  `403 { code: "account_required" }`; use `auth: { message, guests: true }` to let them through
- `member: "<401 message>"`: Fitnexx. Same check, and also makes sure the Fitnexx `user` row exists.
  Guests pass only while `FITNEXX_ALLOW_GUESTS=true`
- `pro: true`: Fitnexx. Also requires Fitnexx Pro (403) and a full account (never guests)
- `admin: true`: a full account listed in `ADMIN_USER_IDS` (403 otherwise)
- `jsonLimit: bytes` / `textLimit: bytes` – per-route body limit, enforced while streaming (413)

## Fitnexx v1

| Method | Path                                  | Notes                                                                |
| ------ | ------------------------------------- | -------------------------------------------------------------------- |
| GET    | `/api/v1/fitnexx/ai/models`           | Pro; OpenRouter model catalog (`FITNEXX_AI_MODELS`)                  |
| POST   | `/api/v1/fitnexx/ai/chat`             | Pro; rate limited; LangChain chat over OpenRouter                    |
| GET    | `/api/v1/fitnexx/food-analysis`       | Daily usage (guests: 0)                                              |
| PUT    | `/api/v1/fitnexx/food-analysis`       | Reserve an image upload (signed Storage URL); full accounts only     |
| POST   | `/api/v1/fitnexx/food-analysis`       | `{requestId, scanId}` → full vision + nutrition pipeline, idempotent |
| DELETE | `/api/v1/fitnexx/food-analysis`       | Delete a scan and its image                                          |
| POST   | `/api/v1/fitnexx/webhooks/revenuecat` | Signed RevenueCat webhook                                            |

AI chat and the food scanner both run on LangChain over OpenRouter
(`apps/fitnexx/lib/food-scanner/`, `lib/ai-chat.ts`). Setup and request bodies
are documented in [`apps/fitnexx/docs/ai-setup.md`](../fitnexx/docs/ai-setup.md);
the mobile clients are `apps/fitnexx/lib/ai.ts` and `lib/foodAnalysisQueue.ts`.

## Pantry Helper v1

| Method | Path                                       | Notes                                        |
| ------ | ------------------------------------------ | -------------------------------------------- |
| GET    | `/api/v1/pantry/households`                | Your households                              |
| POST   | `/api/v1/pantry/households`                | `{ name }`; creates household and membership |
| POST   | `/api/v1/pantry/households/join`           | `{ code }`; join by invite code              |
| GET    | `/api/v1/pantry/households/:id/members`    | Members of a household you belong to         |
| POST   | `/api/v1/pantry/households/:id/invites`    | New 7-day invite code                        |
| DELETE | `/api/v1/pantry/households/:id/members/me` | Leave; deletes an empty household            |
| POST   | `/api/v1/pantry/households/:id/sync`       | Row-level sync; `{ cursor, rows }`           |
| GET    | `/api/v1/pantry/households/:id/imports`    | Weekly recipe import usage                   |
| POST   | `/api/v1/pantry/households/:id/imports`    | `{ url }`; YouTube/TikTok recipe extraction  |
| POST   | `/api/v1/pantry/recipes/parse`             | `{ text, title? }`; caption parse, no quota  |

All pantry routes require a full DevDAJ account, never guests. Recipe imports
use `PANTRY_YOUTUBE_API_KEY` and the shared `OPENROUTER_API_KEY`; the fallback
model comes from `PANTRY_RECIPE_MODEL` (see the root `.env.example`).
