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

### 4. Ledger: finance tracker (new)

Transactions, budgets, Malaysian tax relief tracking and a year-end export,
with transactions captured from bank and wallet notifications on Android.
Targeted around the end of September; the largest app in the plan.

**Decisions (2026-11-28):** named Ledger (`tech.devdaj.app.ledger`);
multi-currency from the start (each account has a currency, totals convert to
a home currency, MYR by default); tax relief categories and per-year limits
are a server-hosted list, cached on the device; CSV and PDF statements both
supported in the first import; exchange rates from Bank Negara Malaysia's
daily rates via the server; first templates for Maybank, CIMB, Touch 'n Go
eWallet and GrabPay.

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
3. Accounts (each with a currency) and manual transactions with all six
   types; amounts stored as integer minor units with their currency code.
4. Exchange rates and home-currency totals: the server fetches Bank Negara
   Malaysia's published daily rates and serves the whole table (no per-user
   query, so nothing about the user's currencies leaks); the device caches it
   and works offline on the last copy. Each foreign transaction stores the
   rate used, editable to the bank's actual rate, so history never shifts.
5. Categories and budgets.
6. Template engine: slot-only pattern matching as pure functions with tests
   (app-local, since templates are finance-specific).
7. Capture inbox and the tap-to-build template editor; first templates for
   Maybank, CIMB, Touch 'n Go eWallet and GrabPay.
8. Duplicate linking and own-account transfer pairing.
9. Tax relief catalog on the server (one Supabase migration and a read-only
   endpoint, cached on the device), category tagging and the year-end export.
10. Receipt and invoice photos on the shared attachment service, through the
    import pipeline (parser first, model fallback, line items must sum to the
    total, user confirms, cached by image hash).
11. Invoices as expected income, matching and overdue reminders (recurrence
    engine).
12. Statement import (CSV and PDF; PDF through the import pipeline with
    totals checked against the statement) and reconciliation.
13. iOS share and paste fallback.
14. Imports from Garage and Pantry.
15. Community template library: repository format, on-device scrubbing,
    sample tests, breakage detection; seeded with the step 7 templates.

### 5. Pillbox: medication and supplement tracker (new)

Schedules, a dose log, stock countdown, run-out dates, refill planning and a
travel pack calculator. It records what the user sets up and never advises:
no medical advice, no dosing suggestions, no model anywhere near doses.

**Decisions (2026-11-28):** named Pillbox (`tech.devdaj.app.pillbox`);
each item chooses how it follows time zones (same local clock time by
default, or same interval since the last dose for time-critical items); a
carer view waits for the hosted sync phase, reusing Pantry's per-member key
sharing.

**Core features:**

- Medications and supplements, user-entered (name, form, strength, unit); no
  drug database.
- Schedules: fixed times (daily or chosen weekdays), every N days, cycles (N
  days on, M days off) and as-needed. Any limits shown for as-needed doses are
  the user's own entries, displayed as notes.
- Dose log, append-only: taken, skipped or late, with the time.
- Stock countdown: each taken dose syncs as a decrement operation (never an
  absolute value), so two devices logging at once never lose a dose.
- Run-out date from current stock and the schedule's consumption, and refill
  reminders with a lead time.
- Travel pack calculator: trip dates in, doses needed per item plus buffer
  days out, flagging anything the current stock cannot cover.

**Sibling links (read and import):** a `public_v1_*` view of the dose log for
the sleep and mood journal's correlations (for example magnesium against
sleep quality); Ledger can import refill purchases.

**Planned, in commit-sized steps:**

1. App scaffold with `@devdaj/app-data`, schema, `public_v1_*` views, change
   log, signed-out by default.
2. Items and schedules on the recurrence engine, with the per-item time zone
   rule (adding every-N-days and on/off cycles to the engine if Garage has
   not needed them).
3. Dose log with notification actions (taken, skip, snooze).
4. Stock as decrement operations, refills that add stock, run-out dates.
5. Refill reminders.
6. Travel pack calculator.
7. "Your data" screen and encrypted export on the shared logic.

### 6. Kin: keep-in-touch reminder (new)

Contact cadences, birthdays (including lunar dates), a small weekly digest and
fair rotation so nobody is always the one left out.

**Decisions (2026-11-28):** named Kin (`tech.devdaj.app.kin`); birthdays on
the Chinese and Hijri calendars as well as Gregorian; the weekly digest
arrives Sunday evening listing three people, both changeable in settings.

**Core features:**

- People, stored in the app's own data; any import from the phone's contacts
  copies only the contacts the user picks.
- A cadence per person (every N days, weeks or months) and a log of each
  catch-up, entered by hand. No call log or message access.
- Birthdays on the Gregorian or a lunar calendar, converted to this year's
  Gregorian date for reminders.
- Weekly digest: one notification listing who is due, capped to a few people.
- Fair rotation: due people ranked by how overdue they are relative to their
  cadence, with recent digest appearances pushed down so the same names do not
  repeat every week.

**Sibling links:** none needed at first; it reads no other app's data.

**Planned, in commit-sized steps:**

1. App scaffold with `@devdaj/app-data`, schema, `public_v1_*` views, change
   log, signed-out by default.
2. People, cadences and the catch-up log, on the recurrence engine.
3. Chinese and Hijri date conversion as pure functions with tests
   (table-based, since on-device `Intl` calendar support is not reliable on
   every Android build). Official Malaysian Hijri dates can differ from a
   computed table by a day, so each Hijri birthday allows a one-day
   adjustment.
4. Birthdays with reminders.
5. Fair rotation ranking as pure functions with tests.
6. Weekly digest notification.
7. Pick-from-contacts import.
8. "Your data" screen and encrypted export on the shared logic.

### 7. Papers: document expiry vault (new)

Documents with expiry dates and scans, renewal reminders with lead times per
document type, passport machine-readable zone (MRZ) parsing and a travel
check.

**Decisions (2026-11-28):** named Papers (`tech.devdaj.app.papers`); camera
MRZ reading by on-device text recognition, with typed MRZ as the fallback;
scans additionally encrypted with an app key held in the iOS keychain or
Android keystore; passport validity checked against an editable default of
six months past the return date.

**Core features:**

- Documents: type, holder, number, issuing country, issue and expiry dates,
  scans stored through the shared attachment service.
- Lead times per document type (for example a passport reminder months
  before expiry, a visa weeks before), editable by the user.
- MRZ parsing for passports (TD3, two lines of 44 characters): fields
  extracted and every check digit verified (weights 7, 3, 1), so a misread is
  caught before saving rather than stored silently.
- Travel check: trip dates and destination in, warnings out when a passport
  will not stay valid long enough past the return date (six months by
  default, editable per trip) or a visa expires
  during the trip.

**Sibling links (read and import):** Garage's road tax and insurance dates
appear in the expiry list read-only; a `public_v1_*` view of trips lets
Pillbox's travel pack calculator import trip dates.

**Planned, in commit-sized steps:**

1. App scaffold with `@devdaj/app-data`, schema, `public_v1_*` views, change
   log, signed-out by default.
2. Documents, document types and lead times on the recurrence engine.
3. Scans on the shared attachment service, encrypted with the app key
   (libsodium). The key is included, passphrase-wrapped, in encrypted exports
   and sync: an Android reinstall wipes keystore keys, so without a restore
   the scans could not be opened.
4. MRZ parser and check digits as pure functions with tests; typed or pasted
   MRZ first.
5. Camera MRZ capture by on-device text recognition (app-local native
   module) feeding the same parser.
6. Trips and the travel check.
7. Garage renewals shown read-only; trips view for Pillbox.
8. "Your data" screen and encrypted export on the shared logic.

### 8. Dayfold: sleep and mood journal (new)

Quick morning and evening entries, yes/no factors, a correlation engine with
lag and personal experiments. All statistics are plain code; no model.

**Decisions (2026-11-28):** named Dayfold (`tech.devdaj.app.dayfold`);
optional read-only sleep import from Apple Health or Health Connect, with
manual entry as the default; correlation results need at least 14 days in
each group, use lags of 0 to 2 days and a false discovery rate correction.

**Core features:**

- Morning entry (bedtime, wake time, sleep quality 1 to 5) and evening entry
  (mood and energy 1 to 5), each a few taps.
- Yes/no factors defined by the user (for example caffeine after 2 pm,
  alcohol, screens in bed), ticked in the evening entry.
- Factors imported from siblings: trained today (Fitnexx), took a given item
  (Pillbox).
- Correlation engine: each factor on day d against each outcome on day d to
  d+2. Results appear only once both the "yes" and "no" groups reach a minimum
  number of days, shown as a difference with its uncertainty, worded as an
  association, not a cause. Many factors times several lags produce false hits
  by chance, so results are filtered with a multiple-comparison correction.
- Personal experiments: two weeks on, two weeks off (repeatable), with the
  comparison shown only when the schedule completes.

**Sibling links (read and import):** reads Fitnexx workouts and Pillbox doses
through their `public_v1_*` views; exposes daily sleep and mood as a view
Fitnexx could show beside training.

**Planned, in commit-sized steps:**

1. App scaffold with `@devdaj/app-data`, schema, `public_v1_*` views, change
   log, signed-out by default.
2. Morning and evening entries with reminders.
3. User-defined factors.
4. Correlation engine as pure functions with tests: lagged group comparison,
   sample-size threshold, multiple-comparison correction.
5. Insights screen.
6. Factors imported from Fitnexx and Pillbox.
7. Personal experiments (on/off schedule and the completed comparison).
8. Optional sleep import from Apple Health or Health Connect (read-only, on
   request, filling days without a manual entry).
9. "Your data" screen and encrypted export on the shared logic.

### 9. Work achievements journal (new)

A weekly prompt to record wins, entries tagged by project, impact and skills,
competency coverage and resume bullets built from templates.

**Core features:**

- Weekly prompt notification on a chosen day; an entry takes a minute.
- Entries: what happened, project, impact (with an optional number and unit,
  for example "cut build time 40%"), skills used, date.
- Competency coverage: entries mapped to the user's competency list, showing
  which competencies have recent evidence and which have none.
- Resume bullets from templates ("Did X for Y, resulting in Z"), filled from
  an entry's fields; copy or export as plain text or Markdown.
- Filters by project, skill and date range for review season.

**Sibling links:** none needed; it reads no other app's data.

**Planned, in commit-sized steps:**

1. App scaffold with `@devdaj/app-data`, schema, `public_v1_*` views, change
   log, signed-out by default.
2. Entries with projects and skills.
3. Weekly prompt on the recurrence engine.
4. Competency list and coverage view.
5. Bullet templates as pure functions with tests, and export.
6. Review filters.
7. "Your data" screen and encrypted export on the shared logic.

**Open questions:**

- App name (it sets the `tech.devdaj.app.<name>` id).
- Competency list: user-built only, or a few editable starter frameworks
  (for example a generic engineering ladder)?
- Bullets: templates only, or also an optional model rewrite through the
  server (opt-in per bullet, since entries describe the user's employer)?
