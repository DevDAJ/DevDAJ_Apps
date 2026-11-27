# Fitnexx

Privacy-first, local-first fitness tracker (Expo SDK 57, React Native, expo-router, Tamagui, zustand).
Workouts, meals, body metrics, gym check-ins, AI coaching, and device-to-device sync.

Imported from the standalone `DevDAJ/fitnexx` repo (mobile app only). Its backend lives in
[`apps/web`](../web/README.md) under `/api/v1/fitnexx/*`; point `EXPO_PUBLIC_API_URL` at that server
(locally `http://localhost:3001`, run with `vp run web#dev`).

## Layout

| Path                  | What                                                       |
| --------------------- | ---------------------------------------------------------- |
| `app/`                | expo-router screens                                        |
| `components/`, `lib/` | UI and app logic (tests live next to code as `*.test.ts`)  |
| `android/`            | Native Android project (release builds via GitHub Actions) |
| `docs/ai-setup.md`    | Supabase, RevenueCat, AI chat and food analysis setup      |

Shared schema migrations: [`packages/db`](../../packages/db) (`@devdaj/db`), one Supabase project for all apps.

## Development

From the repo root:

```bash
bun install
cp .env.example .env
vp run fitnexx#dev        # expo start
vp run fitnexx#test       # unit tests (Vite+ / Vitest)
vp check                  # lint, format, type check (whole repo)
```

Or from `apps/fitnexx`: `vp run tunnel`, `vp run android`, `vp run ios`.

## Releases

Push a tag `fitnexx-vX.Y.Z` (or run the workflow manually) to trigger
[`.github/workflows/fitnexx-android-release.yml`](../../.github/workflows/fitnexx-android-release.yml),
which builds a signed AAB/APK and attaches them to a GitHub release.

## Data shared with other DevDAJ apps

Workouts (with exercises and sets), meals, body metrics, water, weight unit and calorie goal
live in a private SQLite database (`fitnexx-data.db`, tables in
[`lib/sharedData.ts`](lib/sharedData.ts)) that other apps cannot read. After each change Fitnexx
refreshes three summary views in its shared [`@devdaj/app-data`](../../packages/app-data/README.md)
database: `public_v1_workouts`, `public_v1_daily_nutrition` and `public_v1_body_weight`
(columns in [`lib/publicData.ts`](lib/publicData.ts)). Never edit a published view; add a
`public_v2_*` view beside it. Every change to the private database goes through
`@devdaj/app-data`'s writer, which records it in a change log for sync. Installs from before this
change copy their old shared tables into the private database once, then the shared copies are dropped.

Templates, schedule, gyms (they include locations), reminders, Pro status, AI settings and sync
secrets stay private in AsyncStorage. Data from older versions is copied into SQLite once, on
first launch.
