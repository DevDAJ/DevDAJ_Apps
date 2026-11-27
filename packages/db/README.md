# @devdaj/db

Every DevDAJ app shares one Supabase project, so there is one schema and one
migration history. All migrations live here, in a single ordered sequence.
Apps do not keep their own `supabase/` folders.

## Layout

```text
supabase/config.toml     Supabase CLI project config (link/push target)
supabase/migrations/     the single ordered schema history
```

## Index

| Version        | Owner   | File                                      | Purpose                                                                          |
| -------------- | ------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| 20260901000000 | shared  | `20260901000000_shared_baseline.sql`      | `user`, `interest_list_entry`, `consume_ai_rate_limit` (former fitnexx init.sql) |
| 20260916000000 | fitnexx | `20260916000000_create_bug_report.sql`    | `bug_report` table and public insert policy                                      |
| 20260919000000 | fitnexx | `20260919000000_food_analysis.sql`        | Per-user daily food-analysis limits and persistent idempotency                   |
| 20260920000000 | fitnexx | `20260920000000_food_model_learning.sql`  | Private `food-scan-images` bucket, consented `food_scan`, model releases         |
| 20261119000000 | web     | `20261119000000_platform.sql`             | `dataset_gyms`, `dataset_contributions`, `app_store_metrics`                     |
| 20261123000000 | fitnexx | `20261123000000_food_scanner.sql`         | `food_component` library, `food_scan_component` portions, usage tracking         |
| 20261123000001 | fitnexx | `20261123000001_bug_report_telemetry.sql` | `bug_report` correlation columns for PostHog error events                        |
| 20261127000000 | pantry  | `20261127000000_pantry.sql`               | Households, invite codes, recipe cache, weekly imports and sync rows             |

## Applying migrations

Requires the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
(`brew install supabase/tap/supabase`).

```bash
cd packages/db
supabase link --project-ref <your-project-ref>   # once per machine
SUPABASE_DB_PASSWORD=<db-password> bun run db:push
```

`db push` applies every migration the remote has not recorded, in version
order, and records each one in `supabase_migrations.schema_migrations`.

### Existing database applied by hand

If the project was previously set up by pasting SQL into the dashboard, the
CLI does not know those migrations ran. Mark them applied once, then push:

```bash
cd packages/db
supabase migration repair --status applied \
  20260901000000 20260916000000 20260919000000 20260920000000 \
  20261119000000 20261123000000 20261123000001
bun run db:push
```

Only repair versions you are certain already exist in the database.

## Conventions

- One file per change, named `<YYYYMMDDHHMMSS>_<snake_case_purpose>.sql`.
  Versions must be unique; the CLI rejects duplicates.
- Statements are idempotent where practical (`if not exists`,
  `drop policy if exists` before `create policy`, `create or replace`).
- The first header line states the purpose; the index above records the owner
  app. Cross-app foreign keys are expected: this is one shared schema.
- New apps add migrations here, never in their own folder.
