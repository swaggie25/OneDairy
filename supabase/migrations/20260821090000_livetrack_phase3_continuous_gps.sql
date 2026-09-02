-- LIVE TRACKING PLAN — PHASE 3: Continuous GPS + Location Storage
-- Extends the existing gps_pings table (created earlier for Part 1 route
-- tracking) rather than creating a new location_events table, since it
-- already has agent/mcc/trip/route_point linkage, RLS, and realtime wired.
-- Adds: heading/altitude, an explicit link to tracking_sessions (Phase 2)
-- so pings can start at Punch In before a trip exists, a quality
-- classification, and idempotency/sync-state columns (client_id is used
-- now to de-dupe watchPosition double-fires; sync_state/synced_at lay the
-- groundwork Phase 8's offline queue will fill in — writes are still
-- direct/online-only as of this phase).
--
-- NOTE: applied directly to the live project (uuhhyzxagzswcjfhngom) via
-- apply_migration under the same name. This file mirrors that migration
-- for repo history — keep the two in sync if you edit further.

alter table public.gps_pings
  add column heading double precision,
  add column altitude double precision,
  add column tracking_session_id uuid references public.tracking_sessions(id) on delete set null,
  add column quality text check (quality in ('good','weak','stale')) default 'good',
  add column client_id text,
  add column sync_state text not null default 'synced'
    check (sync_state in ('synced','pending','syncing','failed')),
  add column synced_at timestamptz not null default now();

comment on column public.gps_pings.recorded_at is 'Original device/GPS timestamp of the fix (authoritative for ordering/replay).';
comment on column public.gps_pings.synced_at is 'When the server actually received/stored this row — may lag recorded_at once Phase 8 offline queueing lands.';
comment on column public.gps_pings.quality is 'good: accuracy <=20m fresh fix. weak: accuracy >20m but still usable. stale: fix older than the staleness window when written (defensive; client should avoid sending these).';

-- Idempotency: retried uploads (double watchPosition fires, client retry
-- logic) must never duplicate a row. Partial unique index since client_id
-- is only populated going forward; historical/NULL rows are unaffected.
create unique index gps_pings_client_id_uidx
  on public.gps_pings(client_id) where client_id is not null;

create index gps_pings_tracking_session_idx
  on public.gps_pings(tracking_session_id, recorded_at desc)
  where tracking_session_id is not null;

-- Keep tracking_sessions.last_location_* in sync with the freshest good/weak
-- ping for that session, so Phase 4's live map (and anything else reading
-- tracking_sessions) doesn't need to separately poll gps_pings. Stale-quality
-- pings intentionally do NOT update last_location — a stale fix must never
-- make a session look more current than it is.
create or replace function public.touch_tracking_session_from_ping()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tracking_session_id is not null and new.quality <> 'stale' then
    update public.tracking_sessions
    set last_location_lat = new.lat,
        last_location_lng = new.lng,
        last_location_at = new.recorded_at,
        -- A ping proves live GPS is flowing again; a session parked in
        -- DEGRADED (e.g. after a transient gps_disabled/network failure)
        -- recovers to ACTIVE rather than staying stuck.
        status = case when status = 'DEGRADED' then 'ACTIVE' else status end,
        failure_reason = case when status = 'DEGRADED' then null else failure_reason end
    where id = new.tracking_session_id
      and status in ('ACTIVE','DEGRADED');
  end if;
  return new;
end;
$$;

create trigger t_gps_pings_touch_session
  after insert on public.gps_pings
  for each row execute function public.touch_tracking_session_from_ping();
