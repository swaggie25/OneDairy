-- Farmer photo for the Agent Verify Farmer screen.
alter table public.farmers
  add column if not exists photo_url text;

-- Representative-verification audit fields on the collection row itself
-- (PART "Farmer Verification" spec §9/§17). No separate table: the
-- verification always resolves into exactly one collection attempt, so it
-- rides along on milk_collections rather than duplicating a lifecycle
-- table alongside it.
alter table public.milk_collections
  add column if not exists person_present_type text not null default 'FARMER'
    check (person_present_type in ('FARMER','REPRESENTATIVE')),
  add column if not exists verification_method text not null default 'NONE'
    check (verification_method in ('NONE','PHONE')),
  add column if not exists verification_status text not null default 'NOT_REQUIRED'
    check (verification_status in ('NOT_REQUIRED','PENDING','VERIFIED','FAILED')),
  add column if not exists verification_attempted_at timestamptz,
  add column if not exists verification_completed_at timestamptz,
  add column if not exists farmer_phone_used text;

comment on column public.milk_collections.person_present_type is 'Who physically handed over the milk: the farmer or an authorized representative. Captured at scan time, spec §5-§7.';
comment on column public.milk_collections.verification_status is 'NOT_REQUIRED (farmer present) | PENDING (call not yet confirmed) | VERIFIED (farmer confirmed by phone) | FAILED (farmer denied authorization). Spec §8-§9.';

-- Agents currently have no read access to `payments` (only owner/manager/
-- accountant via is_staff, or the farmer themself). The Agent Verify screen
-- needs pending balance / last payment for a farmer at the agent's own
-- centre — add the minimal scoped policy rather than widening is_staff.
create policy "payments_agent_read_own_mcc" on public.payments
  for select
  using (
    exists (
      select 1 from public.agents a
      where a.profile_id = auth.uid() and a.mcc_id = payments.mcc_id
    )
  );

-- Server-side duplicate-collection guard (spec §12 / §13 Scenario 13): a
-- tampered client must not be able to force a second field collection for
-- the same farmer on the same trip. This was previously UI-only
-- (`collectedFarmers` in trip.tsx) with no backend enforcement.
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
  p_collected_at timestamp with time zone,
  p_quality_override_reason text default null::text,
  p_person_present_type text default 'FARMER',
  p_verification_method text default 'NONE',
  p_verification_status text default 'NOT_REQUIRED',
  p_verification_attempted_at timestamptz default null,
  p_verification_completed_at timestamptz default null,
  p_farmer_phone_used text default null
)
returns milk_collections
language plpgsql
security definer
set search_path to 'public'
as $function$
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

    if not exists (
      select 1 from public.route_point_farmers rpf
      where rpf.route_point_id = p_route_point_id and rpf.farmer_id = p_farmer_id
    ) then
      raise exception 'This farmer is not assigned to the selected stop.';
    end if;

    -- Duplicate-collection guard: one field collection per farmer per trip.
    if p_trip_id is not null and exists (
      select 1 from public.milk_collections mc
      where mc.trip_id = p_trip_id
        and mc.farmer_id = p_farmer_id
        and mc.status <> 'reversed'
    ) then
      raise exception 'This farmer has already been collected on this trip.';
    end if;

    v_radius := coalesce(v_farmer.geofence_radius_m, v_point.geofence_radius_m, v_mcc.default_geofence_radius_m);

    if v_point.lat is null or v_point.lng is null then
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
    if not (v_is_owner or (v_is_manager and p_mcc_id in (select public.user_mcc_ids(v_uid)))) then
      raise exception 'Only a manager or owner can record a centre walk-in collection.';
    end if;
    v_verification := 'not_required';
  end if;

  -- Representative-verification business rule (spec §7): if a
  -- representative brought the milk, the call must have actually
  -- succeeded before the backend accepts the collection. Mirrors the
  -- client-side gate (Continue disabled) so a modified client can't skip
  -- the phone check.
  if p_source = 'agent' and p_person_present_type = 'REPRESENTATIVE' and p_verification_status <> 'VERIFIED' then
    raise exception 'Representative collections require phone verification of the farmer before they can be recorded.';
  end if;

  insert into public.milk_collections (
    client_ref, farmer_id, agent_id, mcc_id, route_point_id, trip_id, source, session,
    animal_type, quantity_litres, fat_pct, snf_pct, clr, temperature, acidity,
    water_adulteration_pct, antibiotic_test_result, water_adulteration_flag,
    rate_per_litre, total_amount, risk_score, status, signature_url,
    gps_lat, gps_lng, gps_accuracy_m, distance_from_point_m, geofence_radius_m,
    verification_result, quality_override_reason, collected_at, offline_synced_at, created_by,
    person_present_type, verification_method, verification_status,
    verification_attempted_at, verification_completed_at, farmer_phone_used
  ) values (
    p_client_ref, p_farmer_id, v_agent.id, p_mcc_id, p_route_point_id, p_trip_id, p_source, p_session,
    p_animal_type, p_quantity_litres, p_fat_pct, p_snf_pct, p_clr, p_temperature, p_acidity,
    p_water_adulteration_pct, p_antibiotic_test_result, p_water_adulteration_flag,
    p_rate_per_litre, p_total_amount, p_risk_score,
    case when p_source = 'agent' then 'pending' else 'verified' end,
    p_signature_url, p_gps_lat, p_gps_lng, p_gps_accuracy, v_distance, v_radius,
    v_verification, p_quality_override_reason, coalesce(p_collected_at, now()), now(), v_uid,
    coalesce(p_person_present_type, 'FARMER'), coalesce(p_verification_method, 'NONE'),
    coalesce(p_verification_status, 'NOT_REQUIRED'), p_verification_attempted_at,
    p_verification_completed_at, p_farmer_phone_used
  )
  returning * into v_row;

  return v_row;
end;
$function$;
