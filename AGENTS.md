# AGENTS.md

Instructions for AI agents working in this repository. These repo rules
complement any user-level agent config; for this codebase, they win.

## What this repo is

DevDAJ Apps: a bun + Vite+ monorepo of privacy-first, local-first phone apps
(`apps/fitnexx`, Expo) around one TanStack Start website and Elysia API
(`apps/web`), one shared Supabase project, and app-agnostic headless packages
(`packages/*`). Read [docs/architecture.md](docs/architecture.md) before
non-trivial work.

## Commands

```bash
bun install                  # install workspaces (bun 1.4.4, Node >= 22.18)
bun run ready                # THE GATE: vp check + all tests + all builds
bunx vp check --fix          # auto-fix formatting / fixable lint
vp run web#dev               # website + API at http://localhost:3001
vp run fitnexx#dev           # Expo dev server
vp run <workspace>#<script>  # e.g. vp run web#test, vp run web#typecheck
```

- Run `bun run ready` before every commit; it must pass.
- Tests import from `vite-plus/test`, live next to code as `*.test.ts`.
- A staged hook runs `vp check --fix` on commit; it does not run tests.
- `vp run -r` skips workspaces without the script and caches results.

## Hard rules

1. **Shared packages stay app-agnostic and headless.** No UI, no
   app-specific types, no imports from apps. App glue lives in the app
   (precedent: `@fitnexx/ai` was dissolved for exactly this).
2. **One migration history**, in `packages/db/supabase/migrations/`. New
   schema change = new file with a unique `YYYYMMDDHHMMSS` version,
   idempotent SQL, README index entry. Never edit applied migrations; never
   add `supabase/` folders to apps. Workflow: `packages/db/README.md`.
3. **Never break a published API version in place.** Breaking changes get
   `v2/` modules reusing `lib/`; keep v1 mounted until clients move.
4. **All AI is server-side on LangChain + OpenRouter.** No provider keys in
   apps, no bring-your-own-key mode. Pro chat stays allowlisted
   (`FITNEXX_AI_MODELS`) and rate-limited; the food scanner stays two-step
   with the permanent `food_component` library and idempotent requests.
   Every OpenRouter request enforces Zero Data Retention and denies data
   collection (`provider: { zdr: true, data_collection: "deny" }`, shared
   policy in `lib/openrouter.ts`).
5. **Telemetry is errors-only**, opt-in on mobile (off by default), one
   PostHog key per project, anonymous, no-op without a key. Expected 4xx
   responses are not captured.
6. **Guests never get Pro or a food-analysis allowance.** Pro routes require
   a full account (`pro: true`).
7. **Shared SQLite tables are a public API**: add columns, never rename or
   remove. Secrets stay out of the shared database and out of client env.
8. **No secrets in code, logs or commits.** Server app config uses `<APP>_`
   prefixes via `env.ts`; mobile public values `EXPO_PUBLIC_*`; browser
   `VITE_*`. New vars get a commented `.env.example` entry.
9. **Formatting**: the vp formatter is authoritative. No em dashes anywhere
   in generated content (code comments, docs, commit messages), and no
   double-dash substitutes; use commas, colons, semicolons or parentheses.

## Working style

- Smallest reasonable change; match surrounding structure, naming and style;
  no unrelated refactors. Investigate unfamiliar files before overwriting.
- Requirements incomplete? Ask clarifying technical questions before writing
  code (exceptions: explicit prototypes/examples, or sufficient detail given).
- For large tasks, present a concise plan before implementing.
- Add or update tests for behavior changes; never edit tests just to silence
  a failure. Update READMEs, `.env.example` and docs when behavior changes.
- Prefer existing dependencies; internal deps use `workspace:*`, vite versions
  use the root `catalog:`.

## Where things live

Full map: [docs/ai-reference.md](docs/ai-reference.md). Quick pointers:

- API: `apps/web/src/server/` (`app.ts`, `v1.ts`, `shared/`, `platform/`,
  `apps/<app>/{env.ts,lib/,v1/}`). Route macros and layout:
  `apps/web/README.md`.
- Fitnexx AI: server `apps/web/src/server/apps/fitnexx/lib/ai-chat.ts` +
  `lib/food-scanner/`; mobile `apps/fitnexx/lib/ai.ts`,
  `lib/foodAnalysisQueue.ts`. Setup: `apps/fitnexx/docs/ai-setup.md`.
- Guides: [docs/development.md](docs/development.md) (commands, tests,
  migrations, releases), [docs/coding-guidelines.md](docs/coding-guidelines.md).

## Commits

Conventional style with a workspace scope, imperative summary, body
explaining why: `feat(fitnexx): ...`, `refactor(db): ...`, `docs(web): ...`.
One purpose per commit, focused diff, gate green. Do not push unless asked.
