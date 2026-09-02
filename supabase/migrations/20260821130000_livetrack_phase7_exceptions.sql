-- LIVE TRACKING PLAN — PHASE 7: Route Deviation, Delays & Exceptions
--
-- "Use existing DairyOne exception infrastructure if present." It is
-- present (trip_exceptions, since Part 1 / Phase 3) — this extends it
-- rather than creating a parallel system.
--
-- NOTE: applied directly to the live project (uuhhyzxagzswcjfhngom) via
-- apply_migration under the same name. This file mirrors that migration
-- for repo history.

-- 1. Widen the type vocabulary to the 6 tracking-related exception types.
alter table public.trip_exceptions drop constraint trip_exceptions_type_check;
alter table public.trip_exceptions add constraint trip_exceptions_type_check
  check (type = any (array[
    'farmer_unavailable', 'farmer_skipped', 'route_issue', 'other',
    'quality_issue', 'quantity_mismatch',
    'route_deviation', 'unplanned_stop', 'delay', 'gps_failure',
    'tracking_failure', 'sync_failure'
  ]));

-- 2. "Location" — the spec requires every exception to carry a location.
-- The existing manual types (farmer_unavailable etc.) don't currently
-- record one; the new tracking-derived types always will.
alter table public.trip_exceptions add column lat double precision;
alter table public.trip_exceptions add column lng double precision;

-- 3. Auto-detected exceptions are derived from live GPS/schedule state
-- (computed in the app, not a background job) each time a manager has an
-- agent focused on the live map. Without this, a flaky detection re-run
-- would insert duplicate open exceptions of the same kind for the same
-- trip. This is a hard DB-level guarantee, not just an app-side check.
create unique index trip_exceptions_auto_open_unique
  on public.trip_exceptions (trip_id, type)
  where status = 'open' and type in (
    'route_deviation', 'unplanned_stop', 'delay', 'gps_failure',
    'tracking_failure', 'sync_failure'
  );

-- 4. Owner-configurable thresholds for the two genuinely new detection
-- rules (deviation distance, unplanned-stop duration) — same reuse
-- pattern as Phase 5's timing thresholds. Delay detection reuses those
-- existing on_time/delayed thresholds; gps_failure/tracking_failure reuse
-- tracking_sessions.status/failure_reason (Phase 2) as-is, no new config
-- needed for them.
alter table public.mcc_centres
  add column route_deviation_threshold_m integer not null default 300,
  add column unplanned_stop_minutes integer not null default 5;

comment on column public.trip_exceptions.lat is 'Where the exception was detected/reported. Required for tracking-derived types (route_deviation, unplanned_stop, gps_failure, tracking_failure); optional for manually-reported types.';
comment on column public.trip_exceptions.lng is 'See lat.';
comment on column public.mcc_centres.route_deviation_threshold_m is 'Perpendicular distance from the planned route polyline (metres) that counts as a genuine deviation, not GPS noise. Owner-configurable.';
comment on column public.mcc_centres.unplanned_stop_minutes is 'Minutes an agent must remain stationary away from any known stop/MCC before it is flagged as an unplanned stop. Owner-configurable.';
