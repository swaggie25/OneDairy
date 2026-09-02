-- LIVE TRACKING PLAN — PHASE 5: Route Intelligence + Farmer ETA
--
-- Spec: "Use existing DairyOne configuration if available. Do not
-- hard-code arbitrary business rules." No existing timing/schedule config
-- was found anywhere in the schema, so this adds the minimum: two
-- owner-configurable thresholds on mcc_centres, following the exact same
-- pattern as the existing default_geofence_radius_m / min_gps_accuracy_m /
-- handover_variance_tolerance_litres columns already on this table.
--
-- Deliberately NOT creating a schedule/timing table. "Scheduled" times per
-- stop are derived at read-time from route_trips.started_at (already
-- exists) plus real road-routing leg durations from the existing
-- computeRoute (Google Routes API) server function — reusing Phase 4's
-- infrastructure rather than inventing a parallel schedule model.
--
-- NOTE: applied directly to the live project (uuhhyzxagzswcjfhngom) via
-- apply_migration under the same name. This file mirrors that migration
-- for repo history — keep the two in sync if you edit further.

alter table public.mcc_centres
  add column on_time_threshold_min integer not null default 5,
  add column delayed_threshold_min integer not null default 15;

comment on column public.mcc_centres.on_time_threshold_min is 'Delay (minutes) up to which an agent stop/route/MCC arrival is classified ON_TIME. Owner-configurable.';
comment on column public.mcc_centres.delayed_threshold_min is 'Delay (minutes) beyond which a stop/route/MCC arrival is classified DELAYED (between the two thresholds is SLIGHTLY_LATE). Owner-configurable.';

alter table public.mcc_centres
  add constraint mcc_centres_thresholds_ordered
    check (delayed_threshold_min >= on_time_threshold_min);
