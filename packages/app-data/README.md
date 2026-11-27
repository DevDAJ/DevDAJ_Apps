# @devdaj/app-data

On-device data shared between DevDAJ apps. Each app keeps one SQLite database in its own folder,
and every other DevDAJ app on the phone can **read** it. That is what powers connected features,
for example another app showing today's Fitnexx calories.

```
<shared folder>/
  fitnexx/data.db      ← written only by Fitnexx
  <app_name>/data.db   ← written only by that app
```

|                | iOS                                       | Android                                                                 |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| Shared folder  | App group `group.tech.devdaj.shared`      | Each app's private `files/devdaj/` folder                               |
| Reading others | Opens the other app's `data.db` read-only | Queries the other app's ContentProvider `tech.devdaj.app.<app>.appdata` |
| Who can read   | Apps in the app group (same Apple team)   | Apps holding `tech.devdaj.permission.APP_DATA` (same signing key)       |

## Use

```ts
import { appData } from "@devdaj/app-data";

// This app's own database (read/write).
const db = await appData.open();
await db.execAsync("CREATE TABLE IF NOT EXISTS daily_totals (day TEXT PRIMARY KEY, calories REAL)");
await db.runAsync("INSERT OR REPLACE INTO daily_totals VALUES (?, ?)", ["2026-11-18", 2140]);

// Another app's data (read-only). Same call on iOS and Android.
if (await appData.has("fitnexx")) {
  const rows = await appData.query<{ calories: number }>(
    "fitnexx",
    "SELECT calories FROM daily_totals WHERE day = ?",
    ["2026-11-18"],
  );
}
```

`db` is a regular [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) database.

## Set up an app

1. Its ids must be `tech.devdaj.app.<app_name>` on both platforms. The plugin refuses to build otherwise.
2. Add the dependency and plugin:

   ```json
   // package.json
   "@devdaj/app-data": "workspace:*", "expo-sqlite": "~57.0.5"

   // app.json
   "plugins": [["@devdaj/app-data", { "app": "fitnexx", "readsFrom": ["other_app"] }]]
   ```

   `readsFrom` lists the apps whose data this one reads. Android 11+ hides other apps unless they are listed.

3. **iOS:** create the app group `group.tech.devdaj.shared` once in the Apple Developer portal and
   enable it on every app id. All apps must be under the same team.
4. **Android:** sign every DevDAJ app with the **same release key**. The permission is
   signature-level, so a differently signed app can neither read the data nor be installed
   next to one that declares the permission.
5. Rebuild the native app (it adds native code). Apps with a committed `android/` folder, like
   Fitnexx, need the manifest `meta-data` added by hand (see below), because `expo prebuild` would
   overwrite their customisations.

   ```xml
   <meta-data android:name="tech.devdaj.appdata.APP_NAME" android:value="fitnexx"/>
   <!-- and, for each app in readsFrom, inside <queries>: -->
   <provider android:authorities="tech.devdaj.app.other_app.appdata"/>
   ```

## Rules

- **Everything in `data.db` is readable by the other apps.** Keep secrets and private data in a
  separate database or AsyncStorage.
- Other apps only read. Each app owns its schema; treat its tables as a public API and only add columns.
- Values crossing apps are `TEXT`, `INTEGER`, `REAL` or `NULL`. BLOBs aren't shared (on Android they read back as `null`).
- Keep write transactions short. iOS terminates an app that is suspended while holding a lock in
  the shared container.
- On Android the provider keeps one connection open for the life of the process. Expo's SQLite and
  Android's SQLite are separate copies in the same process, and closing one copy's file handle would
  drop the other's locks.

## Change log (`@devdaj/app-data/changelog`)

Pure functions for sync, importable without Expo: a hybrid logical clock
(`hlcTick`, `hlcReceive`, sortable `encodeHlc` strings), the `Operation`
format (`set`, `increment`, `delete`, `purge_app`) with `parseOperation` for
untrusted input, and the merge rules (`applyOps`, `materialize`). Fields merge
last writer wins by HLC, counters merge as increments, deletes and app purges
hide everything older. Any order of the same operations gives the same result.
Design: [docs/roadmap.md](../../docs/roadmap.md#sync-and-encryption).

## Development

From `packages/app-data`: `vp test`, `tsc --noEmit`. From the repo root:
`bun run ready` is the full gate.
