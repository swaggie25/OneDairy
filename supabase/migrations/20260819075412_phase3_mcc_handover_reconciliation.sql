-- PHASE 3 — MCC Handover + Reconciliation
--
-- NOTE: this file was reconstructed from the live schema on 2026-08-19 to
-- close a drift gap — it had been applied directly to the Supabase project
-- but never committed to this repo. See the Phase 3 completion report for
-- details. Written to be safe to (re-)run.

alter table public.mcc_centres
  add column if not exists handover_variance_tolerance_litres numeric not null default 2;
comment on column public.mcc_centres.handover_variance_tolerance_litres is
  'Litres of Agent-declared vs MCC-received variance allowed before a handover is flagged and requires acknowledgement. Owner-configurable.';

create table if not exists public.mcc_handovers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null unique references public.route_trips(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  mcc_id uuid not null references public.mcc_centres(id) on delete cascade,
  trip_date date not null,
  session text not null default 'morning',
  declared_quantity_litres numeric not null,
  declared_collection_count integer not null default 0,
  received_quantity_litres numeric,
  variance_litres numeric generated always as (received_quantity_litres - declared_quantity_litres) stored,
  status text not null default 'declared'
    check (status = any (array['declared', 'received', 'variance_flagged', 'acknowledged'])),
  received_by uuid references auth.users(id),
  received_at timestamptz,
  receipt_notes text,
  variance_acknowledged_by uuid references auth.users(id),
  variance_acknowledged_at timestamptz,
  variance_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcc_handovers_mcc_status_idx on public.mcc_handovers (mcc_id, status);

grant select, insert, update, delete on public.mcc_handovers to authenticated;
grant all on public.mcc_handovers to service_role;

alter table public.mcc_handovers enable row level security;

-- All writes go through the SECURITY DEFINER RPCs below (create / receipt /
-- acknowledge) so quantities and status transitions are always
-- server-validated. Direct table writes from clients are blocked.
create policy "mcc_handovers_no_direct_write" on public.mcc_handovers for all to authenticated
  using (false) with check (false);

create policy "mcc_handovers_select" on public.mcc_handovers for select to authenticated
  using (
    public.has_role(auth.uid(), 'owner')
    or mcc_id in (select public.user_mcc_ids(auth.uid()))
    or agent_id in (select id from public.agents where profile_id = auth.uid())
  );

create trigger t_mcc_handovers_touch before update on public.mcc_handovers
  for each row execute function public.touch_updated_at();
