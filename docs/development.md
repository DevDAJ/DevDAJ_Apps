# Development workflow

## Prerequisites

- bun 1.4.4 (pinned in the root `package.json` `devEngines`, downloaded
  automatically when missing).
- Node >= 22.18.
- Supabase CLI, only when applying migrations:
  `brew install supabase/tap/supabase`.

## Setup

```bash
bun install                              # installs every workspace, runs vp config
cp .env.example .env                     # one file for every app: shared values, API, AI and app config
```

Fill in the shared Supabase project values (`packages/auth/README.md` has the
one-time project setup). Never commit `.env` files or real keys.

## Commands

Run from the repo root unless noted.

| Command                              | What it does                                                         |
| ------------------------------------ | -------------------------------------------------------------------- |
| `bun run ready`                      | The gate: `vp check` + every workspace's tests + every build         |
| `bun run dev`                        | Website + API dev server, http://localhost:3001 (`vp run web#dev`)   |
| `bun run fitnexx`                    | Expo dev server (`vp run fitnexx#dev`)                               |
| `vp run <workspace>#<script>`        | One workspace script, e.g. `vp run web#test`, `vp run web#typecheck` |
| `vp run -r test` / `vp run -r build` | Recursive across workspaces; skips packages without the script       |
| `vp check`                           | Lint (type-aware oxlint), format check, type check, whole repo       |
| `bunx vp check --fix`                | Auto-fix formatting and fixable lint issues                          |

Inside a single workspace, `vp test`, `vp check` and `tsc --noEmit` work
directly. `vp run` caches results (`vite.config.ts`), so repeated gates are
fast; a changed file invalidates its workspace.

A staged-file hook runs `vp check --fix` on commit (root `vite.config.ts`
`staged`), so formatting fixes land automatically. Still run `bun run ready`
before committing: the hook does not run tests or builds.

## Tests

- Unit tests import from `vite-plus/test` (Vitest-compatible API: `test`,
  `expect`, `describe`, `vi`), not from `vitest` directly.
- Tests live next to the code as `*.test.ts`.
- Server tests stub Supabase and `fetch` with `vi.mock` / `vi.stubGlobal`;
  see `apps/web/src/server/auth.test.ts` and
  `apps/web/src/server/apps/fitnexx/lib/ai-chat.test.ts` for the patterns.
- Add or update tests for every behavior change; never edit a test just to
  make a failure disappear.

## Database migrations

One Supabase project for every app, one ordered migration history in
`packages/db`. Apps never keep their own `supabase/` folders.

```bash
cd packages/db
supabase link --project-ref <your-project-ref>   # once per machine
SUPABASE_DB_PASSWORD=<db-password> bun run db:push
```

New change = new file `supabase/migrations/<YYYYMMDDHHMMSS>_<purpose>.sql`
with a unique version, idempotent statements, and an entry in the
`packages/db` README index. Databases previously applied by hand need
`supabase migration repair --status applied <versions>` once; the README has
the exact workflow. Never edit a migration that may already be applied.

## Builds and releases

- Web production: `vp run web#build && bun apps/web/server.ts` (static assets
  - TanStack Start handler + Elysia API on one Bun server).
- Fitnexx Android: push a tag `fitnexx-vX.Y.Z` (or run the workflow manually).
  `.github/workflows/fitnexx-android-release.yml` builds a signed AAB/APK and
  attaches them to a GitHub release. Real RevenueCat purchases need a
  development build, not Expo Go.

## Commit style

Conventional commits with a workspace scope, imperative summary, body
explaining why:

```text
feat(fitnexx): add LangChain food scanner
refactor(db): consolidate Supabase migrations into shared @devdaj/db
docs(web): fix the Fitnexx v1 route table
```

Types in use: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`. One purpose
per commit; keep diffs focused; `bun run ready` green before committing.
