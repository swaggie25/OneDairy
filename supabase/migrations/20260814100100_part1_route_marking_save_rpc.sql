-- Track who created a saved route (spec §1 "Created by").
alter table public.routes
  add column if not exists created_by uuid null references auth.users(id);

-- Widen route_trips.trip_type check to be sure 'marking' is allowed
-- (defensive — earlier migration already introduced trip_type, this just
-- guarantees the value set matches what the UI now uses).
alter table public.route_trips drop constraint if exists route_trips_trip_type_check;
alter table public.route_trips add constraint route_trips_trip_type_check
  check (trip_type = any (array['assigned','marking']));

-- Lets an agent finish a GPS-tracked "marking" trip and atomically save it
-- as a reusable route + ordered stops. SECURITY DEFINER because normal RLS
-- only lets owner/manager insert into `routes`/`route_points` — this function
-- re-verifies the trip belongs to the calling agent and is a marking trip
-- before doing anything, so the elevated privilege stays narrowly scoped.
create or replace function public.save_marked_route(
  p_trip_id uuid,
  p_name text,
  p_stops jsonb,
  p_distance_meters numeric,
  p_duration_seconds integer,
  p_polyline text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trip record;
  v_agent record;
  v_route_id uuid;
  v_stop jsonb;
  v_seq integer := 1;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Route name is required.';
  end if;
  if p_stops is null or jsonb_array_length(p_stops) = 0 then
    raise exception 'Add at least one stop before saving the route.';
  end if;

  select a.* into v_agent from public.agents a where a.profile_id = v_uid;
  if v_agent.id is null then
    raise exception 'No agent profile linked to this account.';
  end if;

  select * into v_trip from public.route_trips where id = p_trip_id;
  if not found then
    raise exception 'Marking trip not found.';
  end if;
  if v_trip.agent_id is distinct from v_agent.id then
    raise exception 'This marking trip does not belong to you.';
  end if;
  if v_trip.trip_type is distinct from 'marking' then
    raise exception 'This trip is not a route-marking trip.';
  end if;

  insert into public.routes (mcc_id, name, source, created_from_trip_id, active, distance_meters, duration_seconds, polyline, created_by)
  values (v_trip.mcc_id, trim(p_name), 'agent_marked', p_trip_id, true, p_distance_meters, p_duration_seconds, p_polyline, v_uid)
  returning id into v_route_id;

  for v_stop in select * from jsonb_array_elements(p_stops) loop
    insert into public.route_points (route_id, name, sequence, lat, lng)
    values (
      v_route_id,
      coalesce(v_stop->>'name', 'Stop ' || v_seq),
      v_seq,
      (v_stop->>'lat')::double precision,
      (v_stop->>'lng')::double precision
    );
    v_seq := v_seq + 1;
  end loop;

  update public.route_trips
  set status = 'completed',
      ended_at = now(),
      route_id = v_route_id,
      actual_distance_meters = p_distance_meters,
      actual_duration_seconds = p_duration_seconds,
      planned_polyline = p_polyline
  where id = p_trip_id;

  return v_route_id;
end;
$$;

revoke all on function public.save_marked_route from public;
grant execute on function public.save_marked_route to authenticated;
