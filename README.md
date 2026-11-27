# DevDAJ Apps

Monorepo for the DevDAJ phone apps and their shared backend: privacy-first,
local-first apps that keep personal data on the device and share one account,
one Supabase project and one API.

## Workspaces

| Path                 | Package             | Description                                                                               |
| -------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `apps/web`           | `web`               | Website, admin dashboard and API (`/api/v<n>/...`) ([README](apps/web/README.md))         |
| `apps/fitnexx`       | `fitnexx`           | Fitnexx Expo mobile app ([README](apps/fitnexx/README.md))                                |
| `packages/auth`      | `@devdaj/auth`      | Shared headless Supabase login ([README](packages/auth/README.md))                        |
| `packages/app-data`  | `@devdaj/app-data`  | On-device SQLite shared between apps ([README](packages/app-data/README.md))              |
| `packages/telemetry` | `@devdaj/telemetry` | Errors-only PostHog capture, one key per project ([README](packages/telemetry/README.md)) |
| `packages/db`        | `@devdaj/db`        | Single Supabase migration history shared by every app ([README](packages/db/README.md))   |

## Quick start

Requires bun 1.4.4 (downloaded automatically) and Node >= 22.18.

```bash
bun install                 # install every workspace
bun run ready               # gate: lint + format + type check, all tests, all builds
bun run dev                 # website + API at http://localhost:3001
bun run fitnexx             # Expo dev server for the Fitnexx mobile app
```

Copy the root `.env.example` to `.env` first. It covers every app. Fitnexx
sign-in, Pro and food analysis setup:
[apps/fitnexx/docs/ai-setup.md](apps/fitnexx/docs/ai-setup.md).

## How the repo is organised

- `apps/` ships products. App-specific glue (screens, API clients, settings)
  lives in the app, never in a shared package.
- `packages/` holds app-agnostic, headless building blocks: shared login,
  on-device SQLite, errors-only telemetry, the single Supabase migration
  history. No package renders UI.
- `docs/` holds the repo-wide guides; [AGENTS.md](AGENTS.md) is the entry
  point for AI agents working here.

## Documentation

- [Development workflow](docs/development.md): setup, commands, tests,
  migrations, releases, commit style.
- [Architecture](docs/architecture.md): how the apps, API, database and
  shared packages fit together.
- [Coding guidelines](docs/coding-guidelines.md): conventions used across the
  repo.
- [AI agent reference](docs/ai-reference.md): where things live and the
  invariants to preserve.
