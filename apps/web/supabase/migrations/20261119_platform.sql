-- DevDAJ platform tables in the shared Supabase project: global dataset + store metrics.
-- The web API uses the service role; RLS keeps direct client access read-only.

-- ---- Global dataset: gyms --------------------------------------------------
create table if not exists public.dataset_gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  address text check (address is null or char_length(address) <= 240),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  equipment text[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dataset_gyms_location_idx on public.dataset_gyms (latitude, longitude);

alter table public.dataset_gyms enable row level security;
drop policy if exists "Gyms are public" on public.dataset_gyms;
create policy "Gyms are public" on public.dataset_gyms for select using (true);

-- ---- Contributions (review queue) ------------------------------------------
create table if not exists public.dataset_contributions (
  id uuid primary key default gen_random_uuid(),
  dataset text not null check (dataset in ('gyms')),
  -- null: propose a new row; otherwise the full new state of that row
  target_id uuid,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid not null references auth.users (id) on delete cascade,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dataset_contributions_queue_idx
  on public.dataset_contributions (status, created_at);
create index if not exists dataset_contributions_user_idx
  on public.dataset_contributions (submitted_by, created_at desc);

alter table public.dataset_contributions enable row level security;
drop policy if exists "Contributors read their own" on public.dataset_contributions;
create policy "Contributors read their own" on public.dataset_contributions
  for select using (auth.uid() = submitted_by);

-- Applies a pending contribution and marks it approved, in one transaction.
-- Returns the affected gym id. Raises 'not_pending' or 'target_missing'.
create or replace function public.approve_dataset_contribution(
  p_id uuid,
  p_reviewer uuid,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.dataset_contributions%rowtype;
  gym_id uuid;
  v_equipment text[];
begin
  select * into c from public.dataset_contributions where id = p_id for update;
  if not found or c.status <> 'pending' then
    raise exception 'not_pending';
  end if;

  if c.dataset = 'gyms' then
    v_equipment := array(select jsonb_array_elements_text(coalesce(c.payload -> 'equipment', '[]'::jsonb)));
    if c.target_id is null then
      insert into public.dataset_gyms (name, address, latitude, longitude, equipment, created_by)
      values (
        c.payload ->> 'name',
        c.payload ->> 'address',
        (c.payload ->> 'latitude')::double precision,
        (c.payload ->> 'longitude')::double precision,
        v_equipment,
        c.submitted_by
      )
      returning id into gym_id;
    else
      update public.dataset_gyms set
        name = c.payload ->> 'name',
        address = c.payload ->> 'address',
        latitude = (c.payload ->> 'latitude')::double precision,
        longitude = (c.payload ->> 'longitude')::double precision,
        equipment = v_equipment,
        updated_at = now()
      where id = c.target_id
      returning id into gym_id;
      if gym_id is null then
        raise exception 'target_missing';
      end if;
    end if;
  end if;

  update public.dataset_contributions
    set status = 'approved', review_note = p_note, reviewed_by = p_reviewer, reviewed_at = now()
    where id = p_id;
  return gym_id;
end;
$$;

revoke all on function public.approve_dataset_contribution(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_dataset_contribution(uuid, uuid, text) to service_role;

-- ---- Store metrics (admin dashboard) ---------------------------------------
create table if not exists public.app_store_metrics (
  app text not null,
  store text not null check (store in ('google_play', 'app_store')),
  day date not null,
  downloads integer,
  active_devices integer,
  synced_at timestamptz not null default now(),
  primary key (app, store, day)
);

-- No policies: only the service role (web API) reads or writes metrics.
alter table public.app_store_metrics enable row level security;
