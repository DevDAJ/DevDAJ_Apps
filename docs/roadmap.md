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

**Decisions (2026-11-27):**

- Encrypted household sharing is pulled forward into Pantry: per-member key
  sharing is built here, not deferred to hosted sync.
- The web app stays and becomes local-first in the browser too: its own
  browser storage with the same schema and change log, no sibling reads.
- Canonical ingredients, synonyms, shop sections and pack sizes come from a
  server-hosted list, cached on the device; user additions stay local.

**Planned, in commit-sized steps:**

1. Move local data from AsyncStorage into `@devdaj/app-data` SQLite with
   `public_v1_*` views (recipes, grocery lists) and the change log.
2. Browser-local storage for the web app on the same schema and change log.
3. Optional sign-in: a single-device household works signed out.
4. Recipe import from structured data (schema.org `Recipe` JSON-LD on recipe
   sites) before any parser or model; this becomes the first user of the
   shared import pipeline.
5. Ingredient catalog on the server: one Supabase migration, a read-only
   `/api/v1/pantry/ingredients` endpoint, cached on the device for offline use.
6. Canonical ingredient matching with local synonyms (for example "bawang
   merah" and "shallot"), replacing the plural-stripping name match.
7. Unit conversion so "200 g" and "0.5 kg" of one ingredient merge.
8. Quantity-aware pantry subtraction (pantry items gain an optional amount).
9. Pack-size rounding (need 300 g, buy one 500 g pack).
10. Shop-section grouping on the grocery list.
11. Encrypted household sync: a random household key wrapped for each
    member's public key (libsodium), the encrypted change log replacing
    plaintext rows, and a one-time move of existing households. The server
    keeps only membership and ciphertext. Needs the encrypted export package
    from Foundations first.

**Risks:** step 11 is one of the three riskiest pieces in the plan (adding and
removing members, a member losing their device, key rotation after removal).
Until it lands, today's plaintext household sync stays as is.

### 3. Garage: vehicle log (new)

Service intervals, fuel economy, renewals and an odometer forecast. Built
together with the shared recurrence engine, which it is the first user of.

**Decisions (2026-11-27):** named Garage (`tech.devdaj.app.garage`); cars
and motorcycles, with the vehicle type picking starter templates; fuel economy
stored as litres and km, shown as km/L by default and switchable to L/100 km;
a small editable starter list of service templates per vehicle type.

**Core features:**

- Vehicles, with odometer readings taken from every fill-up and service.
- Fuel fill-ups; economy computed by the full-tank method (distance between
  two full fills over the fuel added), partial fills carried forward.
- Service items with intervals by distance, time, or both (whichever comes
  first), and service records that reset them.
- Road tax and insurance renewal dates with lead-time reminders (in Malaysia
  insurance must be renewed before road tax).
- Odometer forecast from recent readings (average distance per day), which
  turns distance-based intervals into due dates the reminder engine can use.

**Sibling links (read and import):** `public_v1_*` views of fuel and service
costs for the finance tracker to import as expenses, and of renewal dates for
the document vault's travel and expiry checks.

**Planned, in commit-sized steps:**

1. Recurrence engine package: interval by days or by distance with a
   forecast, "whichever first", lead times; pure functions with tests.
2. App scaffold with `@devdaj/app-data`, schema, `public_v1_*` views, change
   log, signed-out by default.
3. Vehicles and odometer readings.
4. Fuel log and economy.
5. Service items, records and due status, with starter templates per
   vehicle type.
6. Odometer forecast feeding due dates.
7. Road tax and insurance renewals.
8. Local notifications from the recurrence engine.
9. "Your data" screen and encrypted export on the shared logic.

### 4. Finance tracker (new)

Transactions, budgets, Malaysian tax relief tracking and a year-end export,
with transactions captured from bank and wallet notifications on Android.
Targeted around the end of September; the largest app in the plan.

**Core features:**

- Accounts and transactions typed money in, money out, transfer, declined,
  reversed or refunded.
- Budgets per category and period.
- Tax relief categories with limits stored per assessment year (LHDN), and a
  year-end export.
- **Notification capture (Android):** the user picks which banking and wallet
  apps to watch; nothing else is read and one-time passcodes are always
  discarded. A template is app + text pattern with named slots (amount,
  merchant, account, date, reference) + a fixed type; the template sets the
  direction, nothing is guessed. Users build templates by tapping the amount
  and merchant in a captured notification. Unmatched notifications wait in a
  "no template yet" inbox. Bank SMS arrive through the messaging app's
  notifications, never the SMS permission.
- **Photos:** receipt mode (money out, default) or invoice mode (money in).
  Invoices are expected income until matched to an incoming notification,
  with overdue reminders.
- **Matching:** one payment seen by bank, wallet and receipt links into one
  transaction; own-account transfers (wallet top-ups) pair up.
- **Monthly statement import** for reconciliation.
- **iOS fallback:** share or paste notification text into the same template
  engine, plus statement import.
- **Community templates:** a public, versioned library of slot-only patterns
  (cannot run code), each with test samples that must pass; samples scrubbed
  of amounts, names and account digits on the device before sharing; breakage
  detection when a bank changes its wording.

**Sibling links (read and import):** Garage fuel and service costs, and Pantry
grocery spend, imported as transactions that point back to their source.

**Planned, in commit-sized steps:**

1. Spike first, as the riskiest piece: an app-local Expo native module with a
   `NotificationListenerService`, an app allowlist and passcode discard,
   proving capture works on a real device. Confirm the current Google Play
   policy for notification access before going further.
2. App scaffold with `@devdaj/app-data`, schema, `public_v1_*` views, change
   log, signed-out by default.
3. Accounts and manual transactions with all six types.
4. Categories and budgets.
5. Template engine: slot-only pattern matching as pure functions with tests
   (app-local, since templates are finance-specific).
6. Capture inbox and the tap-to-build template editor.
7. Duplicate linking and own-account transfer pairing.
8. Tax relief categories, per-year limits and the year-end export.
9. Receipt and invoice photos on the shared attachment service, through the
   import pipeline (parser first, model fallback, line items must sum to the
   total, user confirms, cached by image hash).
10. Invoices as expected income, matching and overdue reminders (recurrence
    engine).
11. Statement import and reconciliation.
12. iOS share and paste fallback.
13. Imports from Garage and Pantry.
14. Community template library: repository format, on-device scrubbing,
    sample tests, breakage detection.

**Open questions:**

- App name (it sets the `tech.devdaj.app.<name>` id).
- Currency: MYR only, or multi-currency accounts?
- Tax relief limits per assessment year: shipped in the app, or a
  server-hosted list like Pantry's ingredient catalog?
- Statement formats to support first: CSV, PDF, or both (most Malaysian banks
  issue PDF)?
- Which banks and wallets to target first for templates?
