-- VM-LOG-P4-NOTIFY
-- Run manually in the Supabase SQL editor before enabling vm-logger-monitor.timer.

create table if not exists public.monitoring_incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  machine_id text not null check (length(btrim(machine_id)) > 0),
  check_name text not null check (length(btrim(check_name)) > 0),
  severity text not null default 'error'
    check (severity in ('warning', 'error', 'critical')),
  detail jsonb not null default '{}'::jsonb
    check (jsonb_typeof(detail) = 'object'),
  resolved_at timestamptz null
);

create index if not exists monitoring_incidents_unresolved_lookup_idx
  on public.monitoring_incidents (machine_id, check_name, created_at desc)
  where resolved_at is null;

alter table public.monitoring_incidents enable row level security;

-- The deployed monitor uses the same anon-key architecture as the logger services.
-- This table must therefore permit its read-before-insert de-duplication query and insert.
drop policy if exists "monitoring incidents readable by anon" on public.monitoring_incidents;
create policy "monitoring incidents readable by anon"
  on public.monitoring_incidents
  for select
  to anon
  using (true);

drop policy if exists "monitoring incidents insertable by anon" on public.monitoring_incidents;
create policy "monitoring incidents insertable by anon"
  on public.monitoring_incidents
  for insert
  to anon
  with check (
    length(btrim(machine_id)) > 0
    and length(btrim(check_name)) > 0
    and resolved_at is null
  );

grant select, insert on table public.monitoring_incidents to anon;
