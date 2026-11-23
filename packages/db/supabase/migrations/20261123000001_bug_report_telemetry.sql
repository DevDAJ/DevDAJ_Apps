-- Bug report correlation with PostHog error events (opt-in error reporting).
-- Run after 20260916000000_create_bug_report.sql.

alter table public.bug_report
  add column if not exists context jsonb,
  add column if not exists telemetry_distinct_id text,
  add column if not exists error_event_id uuid;

comment on column public.bug_report.context is
  'Diagnostics from the error screen or a failed scan: source, error message/stack, request/scan ids.';
comment on column public.bug_report.telemetry_distinct_id is
  'Anonymous install id used as the PostHog distinct_id when the user opted in to error reporting.';
comment on column public.bug_report.error_event_id is
  'Uuid of the PostHog $exception event for this error, when one was captured.';