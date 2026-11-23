-- LangChain food scanner: reusable component nutrition profiles and per-scan portions.
-- Run after 20260920_food_model_learning.sql.

alter table public.food_scan
  add column if not exists pipeline_version text;

-- Global component library. AI profiles are written here once and reused by every later scan,
-- so a recognised food costs no nutrition-model tokens.
create table if not exists public.food_component (
  id uuid primary key,
  key text not null unique,
  name text not null,
  preparation text,
  fdc_id text,
  source text not null default 'ai' check (source in ('usda', 'ai', 'user')),
  kcal_per_100 double precision not null
    check (kcal_per_100 >= 0 and kcal_per_100 <= 2000),
  protein_per_100 double precision not null
    check (protein_per_100 >= 0 and protein_per_100 <= 100),
  carbs_per_100 double precision not null
    check (carbs_per_100 >= 0 and carbs_per_100 <= 100),
  fat_per_100 double precision not null
    check (fat_per_100 >= 0 and fat_per_100 <= 100),
  fiber_per_100 double precision not null
    check (fiber_per_100 >= 0 and fiber_per_100 <= 100),
  kcal_per_gram double precision generated always as (kcal_per_100 / 100.0) stored,
  protein_per_gram double precision generated always as (protein_per_100 / 100.0) stored,
  carbs_per_gram double precision generated always as (carbs_per_100 / 100.0) stored,
  fat_per_gram double precision generated always as (fat_per_100 / 100.0) stored,
  fiber_per_gram double precision generated always as (fiber_per_100 / 100.0) stored,
  consistency_note text,
  model_version text,
  confidence double precision not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists food_component_source_idx on public.food_component (source, updated_at);

alter table public.food_component enable row level security;
-- Service-role access only. Clients receive profiles through the API.

create or replace function public.touch_food_component_usage(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.food_component
  set usage_count = usage_count + 1,
      updated_at = now()
  where id = any(p_ids);
$$;

revoke all on function public.touch_food_component_usage(uuid[]) from public, anon, authenticated;
grant execute on function public.touch_food_component_usage(uuid[]) to service_role;

-- Exact values returned to the client. The mobile app changes grams locally and multiplies
-- per_gram, so editing a portion never calls the AI again.
create table if not exists public.food_scan_component (
  id uuid primary key,
  scan_id uuid not null references public.food_scan(id) on delete cascade,
  component_id uuid references public.food_component(id) on delete set null,
  position integer not null check (position >= 0 and position <= 9),
  name text not null,
  preparation text,
  grams double precision not null check (grams > 0 and grams <= 5000),
  estimated_grams double precision not null check (estimated_grams > 0 and estimated_grams <= 5000),
  per100 jsonb not null,
  per_gram jsonb not null,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  consistency jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (scan_id, position)
);

create index if not exists food_scan_component_component_idx
  on public.food_scan_component (component_id);

alter table public.food_scan_component enable row level security;
-- Service-role access only.
