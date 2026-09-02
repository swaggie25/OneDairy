-- ============================================================
-- PART 1: Routes, multi-stop journeys, GPS tracking & navigation
-- Adds: configurable geofence radii, route assignment (date/shift/
-- vehicle/lock), server-side geofence-verified collection RPC,
-- vehicle type widening, and supporting indexes.
--
-- NOTE: this file mirrors the migration already applied directly to
-- the Supabase project (uuhhyzxagzswcjfhngom) via the management API
-- under the same name. Keep this in sync if you edit it further.
-- ============================================================

-- ---- 1. Configurable geofence radius (owner-configurable, sensible default) ----
alter table public.mcc_centres
  add column if not exists default_geofence_radius_m integer not null default 50;

alter table public.route_points
  add column if not exists geofence_radius_m integer null;

alter table public.farmers
  add column if not exists geofence_radius_m integer null;

alter table public.mcc_centres
  add column if not exists min_gps_accuracy_m integer not null default 100;

comment on column public.mcc_centres.default_geofence_radius_m is 'Default radius (metres) an agent must be within to mark a collection. Owner-configurable.';
comment on column public.route_points.geofence_radius_m is 'Per-stop override of the centre default geofence radius.';
comment on column public.farmers.geofence_radius_m is 'Per-farmer override of the geofence radius (finest-grained).';
comment on column public.mcc_centres.min_gps_accuracy_m is 'Reject a collection GPS fix worse (higher) than this accuracy, in metres.';

-- ---- 2. Widen vehicle types: Bike / Car / Milk Pickup Van / Truck ----
alter table public.routes drop constraint if exists routes_default_vehicle_type_check;
alter table public.routes add constraint routes_default_vehicle_type_check
  check (default_vehicle_type = any (array['bike','car','van','truck']));

alter table public.route_trips drop constraint if exists route_trips_vehicle_type_check;
alter table public.route_trips add constraint route_trips_vehicle_type_check
  check (vehicle_type = any (array['bike','car','van','truck']));

-- ---- 3. Route assignment (date, shift, vehicle, lock/unlock, reassign) ----
create table if not exists public.route_assignments (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  mcc_id uuid not null references public.mcc_centres(id) on delete cascade,
  assignment_date date not null default (now() at time zone 'utc')::date,
  shift text not null default 'morning' check (shift = any (array['morning','evening'])),
  vehicle_type text not null default 'bike' check (vehicle_type = any (array['bike','car','van','truck'])),
  sequence_locked boolean not null default true,
  status text not null default 'active' check (status = any (array['active','completed','cancelled','reassigned'])),
  notes text null,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- an agent can only have one active assignment per date+shift
create unique index if not exists route_assignments_agent_slot_unique
  on public.route_assignments (agent_id, assignment_date, shift)
  where status = 'active';

create index if not exists route_assignments_route_idx on public.route_assignments(route_id);
create index if not exists route_assignments_mcc_date_idx on public.route_assignments(mcc_id, assignment_date);

drop trigger if exists route_assignments_touch_updated_at on public.route_assignments;
create trigger route_assignments_touch_updated_at
  before update on public.route_assignments
  for each row execute function public.touch_updated_at();

alter table public.route_assignments enable row level security;

drop policy if exists "assignments managed" on public.route_assignments;
create policy "assignments managed" on public.route_assignments
  for all
  using (
    public.has_role(auth.uid(), 'owner')
    or (public.has_role(auth.uid(), 'manager') and mcc_id in (select public.user_mcc_ids(auth.uid())))
  )
  with check (
    public.has_role(auth.uid(), 'owner')
    or (public.has_role(auth.uid(), 'manager') and mcc_id in (select public.user_mcc_ids(auth.uid())))
  );

drop policy if exists "assignments readable" on public.route_assignments;
create policy "assignments readable" on public.route_assignments
  for select
  using (
    public.has_role(auth.uid(), 'owner')
    or mcc_id in (select public.user_mcc_ids(auth.uid()))
    or agent_id in (select a.id from public.agents a where a.profile_id = auth.uid())
  );

-- link a trip back to the assignment that spawned it (nullable: legacy trips have none)
alter table public.route_trips
  add column if not exists route_assignment_id uuid null references public.route_assignments(id) on delete set null;

-- ---- 4. milk_collections: geofence verification record ----
alter table public.milk_collections
  add column if not exists gps_accuracy_m numeric null,
  add column if not exists distance_from_point_m numeric null,
  add column if not exists geofence_radius_m numeric null,
  add column if not exists verification_result text null default 'not_required';

comment on column public.milk_collections.verification_result is
  'verified | out_of_range | low_accuracy | unconfigured | not_required (centre walk-in) | bypassed (owner override)';

-- ---- 5. Helper: haversine distance in metres ----
create or replace function public.haversine_meters(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
parallel safe
as $$
  select 2 * 6371000 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2
      + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
    )
  )
$$;

-- ---- 6. Server-side, geofence-verified collection insert ----
-- Independently re-verifies agent identity, farmer/stop linkage, GPS
-- freshness/accuracy and geofence radius before ever writing a row.
-- QR-scan flows call this exact same function, so scanning cannot bypass it.
create or replace function public.record_milk_collection(
  p_client_ref text,
  p_farmer_id uuid,
  p_mcc_id uuid,
  p_route_point_id uuid,
  p_trip_id uuid,
  p_source text,
  p_session text,
  p_animal_type text,
  p_quantity_litres numeric,
  p_fat_pct numeric,
  p_snf_pct numeric,
  p_clr numeric,
  p_temperature numeric,
  p_acidity numeric,
  p_water_adulteration_pct numeric,
  p_antibiotic_test_result text,
  p_water_adulteration_flag boolean,
  p_rate_per_litre numeric,
  p_total_amount numeric,
  p_risk_score numeric,
  p_signature_url text,
  p_gps_lat double precision,
  p_gps_lng double precision,
  p_gps_accuracy numeric,
  p_collected_at timestamptz
) returns public.milk_collections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_owner boolean := public.has_role(v_uid, 'owner');
  v_is_manager boolean := public.has_role(v_uid, 'manager');
  v_agent record;
  v_farmer record;
  v_point record;
  v_mcc record;
  v_radius numeric;
  v_distance numeric := null;
  v_verification text := 'not_required';
  v_existing public.milk_collections;
  v_row public.milk_collections;
begin
  if p_quantity_litres is null or p_quantity_litres <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  -- idempotent replay of an already-synced offline entry
  if p_client_ref is not null then
    select * into v_existing from public.milk_collections where client_ref = p_client_ref;
    if found then
      return v_existing;
    end if;
  end if;

  select * into v_mcc from public.mcc_centres where id = p_mcc_id;
  if not found then
    raise exception 'Unknown collection centre.';
  end if;

  select * into v_farmer from public.farmers where id = p_farmer_id and mcc_id = p_mcc_id;
  if not found then
    raise exception 'Farmer does not belong to this collection centre.';
  end if;

  select a.* into v_agent from public.agents a where a.profile_id = v_uid;

  -- Permission: owner, a manager of this mcc, or the agent themselves.
  if not (
    v_is_owner
    or (v_is_manager and p_mcc_id in (select public.user_mcc_ids(v_uid)))
    or (v_agent.id is not null and p_source = 'agent')
  ) then
    raise exception 'Not authorized to record this collection.';
  end if;

  if p_source = 'agent' then
    if v_agent.id is null and not (v_is_owner or v_is_manager) then
      raise exception 'No agent profile linked to this account.';
    end if;
    if v_agent.id is not null and v_agent.mcc_id is distinct from p_mcc_id then
      raise exception 'Agent does not belong to this collection centre.';
    end if;

    if p_route_point_id is null then
      raise exception 'A route stop is required for a field collection.';
    end if;

    select * into v_point from public.route_points where id = p_route_point_id;
    if not found then
      raise exception 'Unknown route stop.';
    end if;

    -- Assigned-stop check: the farmer must actually be linked to this stop.
    if not exists (
      select 1 from public.route_point_farmers rpf
      where rpf.route_point_id = p_route_point_id and rpf.farmer_id = p_farmer_id
    ) then
      raise exception 'This farmer is not assigned to the selected stop.';
    end if;

    v_radius := coalesce(v_farmer.geofence_radius_m, v_point.geofence_radius_m, v_mcc.default_geofence_radius_m);

    if v_point.lat is null or v_point.lng is null then
      -- Stop has no GPS pin configured yet — allow through but flag clearly
      -- so the owner/manager knows to configure it (do not silently trust).
      v_verification := 'unconfigured';
    else
      if p_gps_lat is null or p_gps_lng is null then
        raise exception 'GPS location is required to record a field collection.';
      end if;
      if p_gps_accuracy is not null and p_gps_accuracy > v_mcc.min_gps_accuracy_m then
        v_verification := 'low_accuracy';
        raise exception 'GPS accuracy too low (±%m). Move to open sky and try again.', round(p_gps_accuracy);
      end if;

      v_distance := public.haversine_meters(p_gps_lat, p_gps_lng, v_point.lat, v_point.lng);

      if v_distance > v_radius then
        v_verification := 'out_of_range';
        raise exception 'Too far from % (% m away, must be within % m).', v_point.name, round(v_distance), v_radius;
      end if;

      v_verification := 'verified';
    end if;
  else
    -- Centre walk-in entered by the Manager: no geofence, posts directly.
    if not (v_is_owner or (v_is_manager and p_mcc_id in (select public.user_mcc_ids(v_uid)))) then
      raise exception 'Only a manager or owner can record a centre walk-in collection.';
    end if;
    v_verification := 'not_required';
  end if;

  insert into public.milk_collections (
    client_ref, farmer_id, agent_id, mcc_id, route_point_id, trip_id, source, session,
    animal_type, quantity_litres, fat_pct, snf_pct, clr, temperature, acidity,
    water_adulteration_pct, antibiotic_test_result, water_adulteration_flag,
    rate_per_litre, total_amount, risk_score, status, signature_url,
    gps_lat, gps_lng, gps_accuracy_m, distance_from_point_m, geofence_radius_m,
    verification_result, collected_at, offline_synced_at, created_by
  ) values (
    p_client_ref, p_farmer_id, v_agent.id, p_mcc_id, p_route_point_id, p_trip_id, p_source, p_session,
    p_animal_type, p_quantity_litres, p_fat_pct, p_snf_pct, p_clr, p_temperature, p_acidity,
    p_water_adulteration_pct, p_antibiotic_test_result, p_water_adulteration_flag,
    p_rate_per_litre, p_total_amount, p_risk_score,
    case when p_source = 'agent' then 'pending' else 'verified' end,
    p_signature_url, p_gps_lat, p_gps_lng, p_gps_accuracy, v_distance, v_radius,
    v_verification, coalesce(p_collected_at, now()), now(), v_uid
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.record_milk_collection from public;
grant execute on function public.record_milk_collection to authenticated;

-- ---- 7. Helpful indexes for scale (unlimited stops / large fleets) ----
create index if not exists route_points_route_seq_idx on public.route_points(route_id, sequence);
create index if not exists route_point_farmers_point_idx on public.route_point_farmers(route_point_id, sequence);
create index if not exists milk_collections_trip_idx on public.milk_collections(trip_id);
create index if not exists gps_pings_mcc_recorded_idx on public.gps_pings(mcc_id, recorded_at desc);
create index if not exists gps_pings_trip_recorded_idx on public.gps_pings(trip_id, recorded_at);
