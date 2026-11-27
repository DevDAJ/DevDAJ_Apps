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
