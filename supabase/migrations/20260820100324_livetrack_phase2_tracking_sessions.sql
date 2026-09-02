-- LIVE TRACKING PLAN — PHASE 2: Tracking Session + Punch In Integration
-- Prefixed "livetrack_" to avoid colliding with the unrelated existing
-- "phase2_quality_gate" / "phase3_mcc_handover_*" migrations already in
-- this project, which track a different numbered plan (quality/MCC work).
--
-- Creates a `tracking_sessions` table representing the GPS tracking
-- lifecycle tied 1:1 to a Punch In (attendance row), distinct from
-- `route_trips` (the physical route-walk entity created later by
-- "Start trip"). This lets tracking begin at Punch In, before an agent
-- has necessarily started walking a route.
--
-- NOTE: applied directly to the live project (uuhhyzxagzswcjfhngom) via
-- apply_migration under the same name. This file mirrors that migration
-- for repo history — keep the two in sync if you edit further.

create table public.tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null unique references public.attendance(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  mcc_id uuid not null references public.mcc_centres(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  shift text check (shift in ('morning','evening')),

  status text not null default 'NOT_STARTED'
    check (status in ('NOT_STARTED','ACTIVE','DEGRADED','COMPLETED')),
  failure_reason text
    check (failure_reason in (
      'permission_denied','gps_disabled','network_unavailable',
      'location_unavailable','backend_failure'
    )),

  start_at timestamptz,
  start_lat double precision,
  start_lng double precision,

  last_location_lat double precision,
  last_location_lng double precision,
  last_location_at timestamptz,

  end_at timestamptz,
  end_lat double precision,
  end_lng double precision,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Defense-in-depth against duplicate active tracking sessions for the same
-- agent, mirroring the existing enforce_single_in_progress_trip_per_agent
-- pattern on route_trips. The attendance_id uniqueness above already ties
-- one session per punch-in; this partial index additionally guarantees no
-- agent ever has two non-terminal sessions open at once (e.g. after a
-- crash that skipped punch-out).
create unique index tracking_sessions_one_active_per_agent
  on public.tracking_sessions(agent_id)
  where status in ('NOT_STARTED','ACTIVE','DEGRADED');

create index tracking_sessions_agent_idx on public.tracking_sessions(agent_id, created_at desc);
create index tracking_sessions_mcc_idx on public.tracking_sessions(mcc_id);

create trigger t_tracking_sessions_touch before update on public.tracking_sessions
  for each row execute function public.touch_updated_at();

grant select, insert, update on public.tracking_sessions to authenticated;
grant all on public.tracking_sessions to service_role;
alter table public.tracking_sessions enable row level security;

-- Same read pattern as route_trips/gps_pings: owner/accountant see all,
-- manager scoped to their MCC(s), agent sees their own sessions.
create policy "tracking sessions readable" on public.tracking_sessions for select to authenticated
  using (has_role(auth.uid(),'owner') or has_role(auth.uid(),'accountant')
     or mcc_id in (select user_mcc_ids(auth.uid()))
     or agent_id in (select a.id from public.agents a where a.profile_id = auth.uid()));

-- Same write pattern as route_trips/attendance: owner or scoped manager can
-- write any row in their MCC; an agent can only write their own session row.
create policy "tracking sessions written by agent or manager" on public.tracking_sessions for all to authenticated
  using (has_role(auth.uid(),'owner')
     or (has_role(auth.uid(),'manager') and mcc_id in (select user_mcc_ids(auth.uid())))
     or agent_id in (select a.id from public.agents a where a.profile_id = auth.uid()))
  with check (has_role(auth.uid(),'owner')
     or (has_role(auth.uid(),'manager') and mcc_id in (select user_mcc_ids(auth.uid())))
     or agent_id in (select a.id from public.agents a where a.profile_id = auth.uid()));

alter publication supabase_realtime add table public.tracking_sessions;
