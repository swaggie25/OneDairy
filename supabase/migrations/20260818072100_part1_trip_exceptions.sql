-- PART 1 §5 / PHASE 3 — Structured trip exceptions
--
-- NOTE: reconstructed from the live schema on 2026-08-19 to close a drift
-- gap (see phase3_mcc_handover_reconciliation.sql for context). Covers
-- farmer_unavailable / farmer_skipped / route_issue / other (Part 1) plus
-- quality_issue / quantity_mismatch (Phase 2/3).

create table if not exists public.trip_exceptions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.route_trips(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  mcc_id uuid not null references public.mcc_centres(id) on delete cascade,
  route_point_id uuid references public.route_points(id) on delete set null,
  farmer_id uuid references public.farmers(id) on delete set null,
  type text not null check (
    type = any (array[
      'farmer_unavailable', 'farmer_skipped', 'route_issue', 'other',
      'quality_issue', 'quantity_mismatch'
    ])
  ),
  reason text,
  status text not null default 'open' check (status = any (array['open', 'resolved'])),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

create index if not exists trip_exceptions_trip_id_idx on public.trip_exceptions (trip_id);
create index if not exists trip_exceptions_farmer_id_idx on public.trip_exceptions (farmer_id);

grant select, insert, update, delete on public.trip_exceptions to authenticated;
grant all on public.trip_exceptions to service_role;

alter table public.trip_exceptions enable row level security;

create policy "exceptions readable" on public.trip_exceptions for select to authenticated
  using (
    public.has_role(auth.uid(), 'owner')
    or mcc_id in (select public.user_mcc_ids(auth.uid()))
    or agent_id in (select a.id from public.agents a where a.profile_id = auth.uid())
  );

create policy "exceptions inserted by agent or manager" on public.trip_exceptions for insert to authenticated
  with check (
    public.has_role(auth.uid(), 'owner')
    or (public.has_role(auth.uid(), 'manager') and mcc_id in (select public.user_mcc_ids(auth.uid())))
    or agent_id in (select a.id from public.agents a where a.profile_id = auth.uid())
  );

create policy "exceptions updated by agent or manager" on public.trip_exceptions for update to authenticated
  using (
    public.has_role(auth.uid(), 'owner')
    or (public.has_role(auth.uid(), 'manager') and mcc_id in (select public.user_mcc_ids(auth.uid())))
    or agent_id in (select a.id from public.agents a where a.profile_id = auth.uid())
  )
  with check (
    public.has_role(auth.uid(), 'owner')
    or (public.has_role(auth.uid(), 'manager') and mcc_id in (select public.user_mcc_ids(auth.uid())))
    or agent_id in (select a.id from public.agents a where a.profile_id = auth.uid())
  );
