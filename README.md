# Vite+ Monorepo Starter

A starter for creating a Vite+ monorepo.

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run -r test
```

- Build the monorepo:

```bash
vp run -r build
```

- Run the development server:

```bash
vp run dev
```

## Workspaces

| Path                 | Package             | Description                                                                               |
| -------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `apps/web`           | `web`               | Website, admin dashboard and API (`/api/v<n>/...`) ([README](apps/web/README.md))         |
| `apps/fitnexx`       | `fitnexx`           | Fitnexx Expo mobile app ([README](apps/fitnexx/README.md))                                |
| `packages/utils`     | `utils`             | Starter TypeScript library                                                                |
| `packages/auth`      | `@devdaj/auth`      | Shared headless Supabase login ([README](packages/auth/README.md))                        |
| `packages/app-data`  | `@devdaj/app-data`  | On-device SQLite shared between apps ([README](packages/app-data/README.md))              |
| `packages/telemetry` | `@devdaj/telemetry` | Errors-only PostHog capture, one key per project ([README](packages/telemetry/README.md)) |
| `packages/db`        | `@devdaj/db`        | Single Supabase migration history shared by every app ([README](packages/db/README.md))   |
