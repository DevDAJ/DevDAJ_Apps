-- Server-side food vision, explicit training consent, and model releases.
-- Run after 20260919_food_analysis.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'food-scan-images',
  'food-scan-images',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.food_scan (
  id uuid primary key,
  user_id text not null references public.user(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 8388608),
  status text not null default 'pending'
    check (status in (
      'pending', 'processing', 'analyzed', 'eligible', 'review', 'rejected', 'discarded'
    )),
  model_version text,
  normalized_hash text,
  dataset_version text,
  prediction jsonb,
  reviewed_label jsonb,
  gate_decision text check (gate_decision in ('eligible', 'review', 'reject')),
  gate_confidence double precision
    check (gate_confidence is null or gate_confidence between 0 and 1),
  contribution_policy_version text,
  contributed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz default now() + interval '1 day'
);

create index if not exists food_scan_training_idx
  on public.food_scan (status, created_at)
  where status = 'eligible' and withdrawn_at is null;
create index if not exists food_scan_expiry_idx
  on public.food_scan (expires_at)
  where expires_at is not null;
create unique index if not exists food_scan_normalized_hash_idx
  on public.food_scan (normalized_hash)
  where normalized_hash is not null and status = 'eligible';

alter table public.food_scan enable row level security;
-- Service-role access only. Uploads use short-lived signed Storage tokens.

create table if not exists public.food_model_release (
  version text primary key,
  base_model text not null,
  adapter_uri text not null,
  dataset_hash text not null,
  metrics jsonb not null,
  status text not null default 'candidate'
    check (status in ('candidate', 'canary', 'active', 'retired', 'failed')),
  created_at timestamptz not null default now(),
  promoted_at timestamptz
);

create unique index if not exists food_model_one_active_idx
  on public.food_model_release ((status))
  where status = 'active';

alter table public.food_model_release enable row level security;
-- Service-role access only.

-- The earlier idempotency functions accept caller-supplied user IDs, so only
-- the server's service role may execute them.
alter function public.claim_food_analysis_request(text, text, text)
  set search_path = '';
alter function public.complete_food_analysis_request(text, text, jsonb)
  set search_path = '';
revoke all on function public.claim_food_analysis_request(text, text, text)
  from public, anon, authenticated;
revoke all on function public.complete_food_analysis_request(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_food_analysis_request(text, text, text)
  to service_role;
grant execute on function public.complete_food_analysis_request(text, text, jsonb)
  to service_role;
