-- Pantry Helper: households, invite codes, recipe extraction cache, weekly imports, sync rows.
-- Service-role access only. RLS is enabled on every table with no policies; clients go through the API.

create table if not exists public.household (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);

alter table public.household enable row level security;

create table if not exists public.household_member (
  household_id uuid not null references public.household(id) on delete cascade,
  user_id uuid not null,
  email text,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_member_user_idx on public.household_member (user_id);

alter table public.household_member enable row level security;

create table if not exists public.household_invite (
  code text primary key,
  household_id uuid not null references household(id) on delete cascade,
  created_by uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.household_invite enable row level security;

create table if not exists public.recipe_extraction (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('youtube','tiktok')),
  source_id text not null,
  url text not null,
  title text,
  recipe jsonb not null,
  method text not null check (method in ('rules','llm')),
  created_at timestamptz not null default now(),
  unique (source, source_id)
);

alter table public.recipe_extraction enable row level security;

create table if not exists public.household_recipe_import (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  extraction_id uuid not null references recipe_extraction(id) on delete cascade,
  imported_by uuid not null,
  imported_at timestamptz not null default now()
);

create index if not exists household_recipe_import_household_idx
  on public.household_recipe_import (household_id, imported_at);

alter table public.household_recipe_import enable row level security;

create sequence if not exists public.pantry_sync_seq;

create table if not exists public.pantry_sync_row (
  household_id uuid not null references household(id) on delete cascade,
  entity text not null check (entity in ('recipe','pantry_item','grocery_list','grocery_item')),
  row_id uuid not null,
  data jsonb not null default '{}',
  deleted boolean not null default false,
  updated_at timestamptz not null,
  updated_by uuid not null,
  seq bigint not null default nextval('public.pantry_sync_seq'),
  primary key (household_id, entity, row_id)
);

create index if not exists pantry_sync_row_household_seq_idx
  on public.pantry_sync_row (household_id, seq);

alter table public.pantry_sync_row enable row level security;

create or replace function public.create_household(p_name text, p_user uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.household (name) values (p_name) returning id into v_id;
  insert into public.household_member (household_id, user_id, email)
    values (v_id, p_user, p_email);
  return v_id;
end;
$$;

revoke all on function public.create_household(text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_household(text, uuid, text) to service_role;

create or replace function public.push_pantry_rows(
  p_household uuid,
  p_user uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pantry_sync_row
    (household_id, entity, row_id, data, deleted, updated_at, updated_by)
  select
    p_household,
    r.value->>'entity',
    (r.value->>'rowId')::uuid,
    coalesce(r.value->'data', '{}'::jsonb),
    coalesce((r.value->>'deleted')::boolean, false),
    (r.value->>'updatedAt')::timestamptz,
    p_user
  from jsonb_array_elements(p_rows) as r(value)
  on conflict (household_id, entity, row_id) do update set
    data = excluded.data,
    deleted = excluded.deleted,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    seq = nextval('public.pantry_sync_seq')
  where pantry_sync_row.updated_at < excluded.updated_at;
end;
$$;

revoke all on function public.push_pantry_rows(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.push_pantry_rows(uuid, uuid, jsonb) to service_role;

create or replace function public.claim_recipe_import(
  p_household uuid,
  p_extraction uuid,
  p_user uuid,
  p_limit int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform 1 from public.household where id = p_household for update;

  select count(*) into v_count
  from public.household_recipe_import
  where household_id = p_household
    and imported_at >= date_trunc('week', now() at time zone 'utc') at time zone 'utc';

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.household_recipe_import (household_id, extraction_id, imported_by)
  values (p_household, p_extraction, p_user);
  return true;
end;
$$;

revoke all on function public.claim_recipe_import(uuid, uuid, uuid, int)
  from public, anon, authenticated;
grant execute on function public.claim_recipe_import(uuid, uuid, uuid, int) to service_role;
