# Roadmap

Ten small, local-first personal apps sharing one on-device data layer. Users
install only the apps they want; each works alone and gains features when
siblings are installed. There is no hub app. This file is the plan; each app
is added and refined here one at a time before any of its code is written.

## Decisions

- **Stack is fixed:** bun + Vite+ monorepo, Expo apps, TanStack Start +
  Elysia API (`apps/web`), one Supabase project.
- **Accounts are optional.** Device-only, no account, is the free default and a
  complete product. Signing in adds sync and sharing.
- **Cross-app contract is versioned views.** Siblings read only
  `public_v<n>_*` views; internal tables may change freely. A breaking change
  adds `public_v<n+1>_*` beside the old view.
- **Writes stay in the owning app.** Cross-app actions are "read and import":
  the receiving app creates its own record pointing back to the source.
- **Data outlives uninstall.** Only an explicit request deletes it; every app
  has a "Your data" screen covering all apps' data.
- **Encryption at rest is the operating system's** (Android file-based
  encryption, iOS Data Protection), with app databases excluded from cloud
  backup. SQLCipher is deferred: it would only add protection on an unlocked,
  rooted or forensically extracted phone. Exports and sync are end-to-end
  encrypted with libsodium.
- **Sync carries an encrypted change log, never the SQLite file.** Transports:
  manual export/restore (free), LAN, the user's Google Drive, hosted sync
  (server stores ciphertext only). Pantry Helper's plaintext row sync moves
  onto this log.
- **AI:** any app may call a model, always server-side through OpenRouter with
  Zero Data Retention (see [architecture.md](architecture.md)). Plain code
  still does anything computable (totals, schedules, correlations, matching),
  and every app works with AI switched off.

## Foundations

Shared pieces, built once and reused. Each lands as its own small commits.

| Piece                     | Where                 | Notes                                                   |
| ------------------------- | --------------------- | ------------------------------------------------------- |
| Public views + migrations | `@devdaj/app-data`    | Schema version per file, ordered migrations             |
| Change log                | `@devdaj/app-data`    | Written from day one, even before any sync exists       |
| Backup exclusion          | `@devdaj/app-data`    | Config plugin marks the shared folder as not backed up  |
| "Your data" logic         | `@devdaj/app-data`    | Headless: list, export, delete; each app draws the UI   |
| Encrypted export/restore  | new headless package  | libsodium, passphrase-derived key, recovery key         |
| Optional sign-in          | `@devdaj/auth` + apps | Every feature except sync and sharing works signed out  |
| Recurrence engine         | new headless package  | Used by vehicle, vault, medication, keep-in-touch       |
| Import pipeline           | new headless package  | Parser first, model fallback, user confirms, hash cache |

## Apps

Added one at a time below, in build order.

### 1. Fitnexx (in progress)

Gym and macro tracker; the first app on the foundations.

**Shipped:** workout logging with templates and analysis, meal log with
barcode lookup (Open Food Facts) and the AI food scanner, body metrics, water,
gyms, LAN sync, Pro AI chat. Shared tables in `data.db`: `meals`, `workouts`,
`workout_exercises`, `workout_sets`, `body_metrics`, `water_log`,
`preferences`.

**Planned, in commit-sized steps:**

1. Publish `public_v1_*` views over the shared tables; siblings switch to them.
2. Write the change log for every insert, update and delete.
3. Exclude `data.db` from cloud backup.
4. "Your data" screen on the shared headless logic.
5. Encrypted export/restore replacing the plain export.
6. Optional sign-in: every screen works signed out; Pro and sync ask for an
   account.
7. Weight trend with a moving average.
8. Progression rules (suggest the next weight or reps from recent sets).
9. Verified local food data: cache barcode results on the device so known
   foods work offline.

**Open questions:** which tables siblings actually need in `public_v1`
(`preferences` probably stays internal); moving-average window; the
progression rule set.

### 2. Pantry Helper (in progress)

Recipes, pantry and grocery lists for a household; the brief's "grocery list
generator".

**Shipped:** recipe import from YouTube and TikTok links (deterministic
parser with English and Malay section headers, model fallback on the server),
pantry items by category, grocery lists built from recipes minus pantry items
(name match, same-unit quantities merged), households with invites, web PWA.
Data lives in AsyncStorage and syncs as plaintext rows through
`/api/v1/pantry/*` (per-row last write wins). Sign-in is required today.

**Planned, in commit-sized steps:**

1. Move local data from AsyncStorage into `@devdaj/app-data` SQLite with
   `public_v1_*` views (recipes, grocery lists) and the change log.
2. Optional sign-in: a single-device household works signed out.
3. Recipe import from structured data (schema.org `Recipe` JSON-LD on recipe
   sites) before any parser or model; this becomes the first user of the
   shared import pipeline.
4. Canonical ingredients with local synonyms (for example "bawang merah" and
   "shallot"), replacing the plural-stripping name match.
5. Unit conversion so "200 g" and "0.5 kg" of one ingredient merge.
6. Quantity-aware pantry subtraction (pantry items gain an optional amount).
7. Pack-size rounding (need 300 g, buy one 500 g pack).
8. Shop-section grouping on the grocery list.
9. Rework household sync onto the encrypted change log; the server keeps only
   ciphertext.

**Open questions:**

- Household sharing needs per-member key sharing, which the build order places
  in hosted sync (step 8). Keep today's plaintext household sync until then,
  or pull the encrypted household work forward?
- The web PWA has no shared SQLite folder. Keep it as a signed-in, sync-only
  client, or drop it?
- Where do canonical ingredients, synonyms and pack sizes come from: a curated
  list in the repo, the server, or user-built only?
