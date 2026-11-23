-- Food photo analysis: daily limits for free users and persistent idempotency.
-- Run once in the Supabase SQL editor (or via `supabase db push`).

alter table public.user
  add column if not exists "foodAnalysisDay" date;
alter table public.user
  add column if not exists "foodAnalysisCount" integer not null default 0;

-- Daily remote-analysis budget. Free users get 10/day, Pro users 100/day.
-- Only counts requests that reach the server, never offline queue attempts.
create or replace function public.consume_food_analysis_rate_limit(
  p_user_id text,
  p_is_pro boolean
)
returns boolean
language sql
security invoker
set search_path = public
as $$
  with updated as (
    update public.user
    set "foodAnalysisCount" = case
          when "foodAnalysisDay" is distinct from CURRENT_DATE then 1
          else "foodAnalysisCount" + 1
        end,
        "foodAnalysisDay" = CURRENT_DATE
    where id = p_user_id
      and ("foodAnalysisDay" is distinct from CURRENT_DATE
           or "foodAnalysisCount" < case when p_is_pro then 100 else 10 end)
    returning id
  )
  select exists (select 1 from updated)
$$;

-- Idempotency claims. A retried request returns the cached response instead
-- of repeating the paid Jev call. Records expire after 7 days to match the
-- mobile queue retry window.
create table if not exists public.food_analysis_request (
  user_id text not null,
  request_id text not null,
  request_hash text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed')),
  lease_until timestamptz not null default now(),
  response jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  primary key (user_id, request_id)
);

create index if not exists food_analysis_request_expires_at_idx
  on public.food_analysis_request (expires_at);

alter table public.food_analysis_request enable row level security;
-- Service-role key only. No public policies by design.

-- Atomically claim a request. Returns one of:
--   {"action":"claimed"}            caller must process and complete it
--   {"action":"in-progress"}        another worker holds the lease, retry later
--   {"action":"cached",...}         completed response included
-- Raises 409 (raise exception) when the same ID carries a different payload.
create or replace function public.claim_food_analysis_request(
  p_user_id text,
  p_request_id text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing record;
begin
  delete from public.food_analysis_request
  where expires_at < now();

  select * into existing
  from public.food_analysis_request
  where user_id = p_user_id and request_id = p_request_id
  for update;

  if not found then
    insert into public.food_analysis_request
      (user_id, request_id, request_hash, status, lease_until)
    values
      (p_user_id, p_request_id, p_request_hash, 'processing', now() + interval '5 minutes');
    return jsonb_build_object('action', 'claimed');
  end if;

  if existing.status = 'completed' then
    if existing.request_hash != p_request_hash then
      raise exception 'Request ID already used with a different payload.'
        using errcode = '23505';
    end if;
    return jsonb_build_object('action', 'cached', 'response', existing.response);
  end if;

  if existing.lease_until > now() then
    if existing.request_hash != p_request_hash then
      raise exception 'Request is already being processed.'
        using errcode = '23505';
    end if;
    return jsonb_build_object('action', 'in-progress');
  end if;

  -- Abandoned lease: reclaim it for this attempt.
  update public.food_analysis_request
  set request_hash = p_request_hash,
      lease_until = now() + interval '5 minutes',
      expires_at = now() + interval '7 days'
  where user_id = p_user_id and request_id = p_request_id;
  return jsonb_build_object('action', 'claimed');
end;
$$;

create or replace function public.complete_food_analysis_request(
  p_user_id text,
  p_request_id text,
  p_response jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.food_analysis_request
  set status = 'completed',
      response = p_response,
      expires_at = now() + interval '7 days'
  where user_id = p_user_id and request_id = p_request_id;
$$;
