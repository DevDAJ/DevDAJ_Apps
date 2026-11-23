# Coding guidelines

Conventions observed across the repo. Match the surrounding code first; these
guidelines explain what "matching" means here.

## General

- Smallest reasonable change that solves the problem; no unrelated refactors.
- Prefer maintainable over clever; avoid new layers of abstraction and
  premature optimization.
- Requirements unclear? Ask before guessing business logic.
- Production quality by default: handle expected failure cases, no
  placeholder implementations unless requested.

## TypeScript

- ESM everywhere (`"type": "module"`), `nodenext` resolution; importing
  `.ts` extensions is allowed (`allowImportingTsExtensions`).
- Validate unknown input at the edge and narrow it: see
  `apps/web/src/server/apps/fitnexx/lib/ai-request.ts` and
  `v1/food-analysis.service.ts` (type guards, caps on sizes, lengths and
  token counts).
- Errors carry user-safe messages. Server: throw
  `ApiError(status, message, { retryable? })`; clients surface
  `error.message`. Never swallow exceptions silently without a documented
  reason (telemetry failures are swallowed by design).
- Internal imports use `workspace:*`; vite/vite-plus versions come from the
  root `catalog:`. Prefer existing dependencies; justify new ones.
- Lint enforces `vite-plus/prefer-vite-plus-imports`; tests import from
  `vite-plus/test`.

## File placement

- Server: `apps/web/src/server/apps/<app>/env.ts` for config, `lib/` for
  version-agnostic logic, `v1/` for controllers (+ `*.service.ts` when a
  controller needs a service layer). Shared cross-app code in
  `src/server/shared/` or `src/server/platform/`.
- Mobile: `apps/fitnexx/lib/` for logic, `components/` for UI,
  `app/` for expo-router screens.
- Tests: `*.test.ts` next to the code (the `utils` starter uses `tests/`).
- Shared packages: app-agnostic and headless. No UI, no app-specific types,
  no imports from apps. App glue lives in the app.

## React and React Native

- Fitnexx UI uses the theme tokens in `apps/fitnexx/lib/theme.ts` and the
  primitives in `components/shared/ui.tsx` (Card, AppButton, SectionLabel,
  ...), not ad-hoc colors or one-off buttons.
- State: zustand (`lib/store.ts`); persistence through `lib/storage.ts` with
  keys declared in `lib/backupSchema.ts`.
- Auth UI wraps the headless `@devdaj/auth/react` binding; keep screens in
  the app.
- Web design tokens and layout rules: `apps/web/DESIGN.md`.

## SQL and migrations

- One history in `packages/db/supabase/migrations/`, unique
  `YYYYMMDDHHMMSS` versions, purpose in the first header line, index entry
  in the package README.
- Idempotent where practical: `if not exists`, `drop policy if exists`
  before `create policy`, `create or replace`.
- RLS enabled on every table; service-role-only access is the default for
  app data. Grant function execution explicitly; lock `search_path`.
- Never edit an applied migration; add a new one.

## Environment and secrets

- Server app config: `<APP>_` prefix (`FITNEXX_...`), read through
  `apps/<app>/env.ts` getters with defaults.
- Shared server keys unprefixed: `SUPABASE_*`, `OPENROUTER_API_KEY`,
  `POSTHOG_HOST`. Mobile public values: `EXPO_PUBLIC_*`; browser: `VITE_*`.
- Secrets stay server-side. Never hardcode keys, never log sensitive data,
  never put service-role or provider keys in mobile/browser env.
- Every new variable gets a commented entry in the app's `.env.example`.

## Telemetry

- Errors only, opt-in on mobile, one PostHog key per project, no-op when
  unset. Capture through `@devdaj/telemetry` wrappers
  (`apps/fitnexx/lib/telemetry.ts`, `apps/web/src/server/shared/telemetry.ts`),
  never through a raw SDK. Expected 4xx responses are not errors to capture.

## Formatting and docs

- The vp formatter is authoritative: `bunx vp check --fix` before committing
  (a staged hook also runs it). `routeTree.gen.ts` is generated and ignored.
- No em dashes anywhere in generated content, and no double-dash
  substitutes; use commas, colons, semicolons or parentheses. Standard ASCII
  punctuation.
- Comments explain why, not what; keep them short. Update READMEs and
  `.env.example` when behavior or config changes; docs must match the code.
