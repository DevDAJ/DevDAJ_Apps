# Pantry Helper

Privacy-first household recipes, pantry and grocery lists (Expo SDK 57, Tamagui,
expo-router, AsyncStorage, zustand). Household data stays on the device and syncs through the
[`apps/web`](../web/README.md) API at `/api/v1/pantry/*`; point `EXPO_PUBLIC_API_URL` at that
server (locally `http://localhost:3001`, run with `vp run web#dev`). One DevDAJ account works
across apps, and every household member sees the same synced data. The server API routes are
listed in the "Pantry Helper v1" section of the web README.

## Layout

| Path                  | What                                                               |
| --------------------- | ------------------------------------------------------------------ |
| `app/`                | expo-router screens, including detail routes for recipes and lists |
| `components/`, `lib/` | UI and app logic (tests live next to code as `*.test.ts`)          |
| `public/`             | Web PWA shell, manifest, icon and service worker                   |

## Development

From the repo root:

```bash
bun install
cp apps/pantry/.env.example apps/pantry/.env
vp run pantry#dev        # expo start
bun run pantry           # same dev server
vp run pantry#test       # unit tests (Vite+ / Vitest)
vp run pantry#typecheck  # TypeScript
```

Or from `apps/pantry`: `bun run web`, `bun run android`, `bun run ios`.

## Web / PWA

`bun run build` runs `expo export --platform web` into `dist/` and is also part of `bun run ready`.
In production, [`apps/web`](../web/README.md) serves that export at `/pantry/app/` on the same
origin as the API, so no CORS setup is needed there. The `public/` files become the single-page web
shell: `index.html` registers the service worker under `/pantry/app/` over HTTPS or localhost,
`manifest.json` makes the app installable, and `sw.js` serves cached app assets offline. API
responses are never cached, and signed-out web users are sent to the same email and social login
screens.

For local web development, run `vp run pantry#dev` from the repo root, then press `w`, or run
`bun run --cwd apps/pantry web`. The app opens at `http://localhost:8081/pantry/app`.

CORS is only needed when the web app runs on a different origin than the API. In that case add the
web origin to `API_CORS_ORIGINS` in `apps/web/.env` and set `EXPO_PUBLIC_API_URL` to the API origin
before building.
