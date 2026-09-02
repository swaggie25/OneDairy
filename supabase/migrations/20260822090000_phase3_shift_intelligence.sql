-- PHASE 3: SHIFT INTELLIGENCE
--
-- NOTE: This migration was already applied directly to the live project
-- (uuhhyzxagzswcjfhngom) in a prior session. It is added here now purely so
-- the git history / migrations folder stays in sync with the real schema.
-- Every statement is written to be safe to (re)run on a database that
-- already has these objects.
--
-- Replaces the hardcoded "hour < 14 => morning else evening" rule that used
-- to live in src/hooks/useAgentContext.ts with an owner/manager-configurable
-- shift table plus a single source-of-truth RPC (get_shift_status) that
-- returns the current shift + its state (active / grace_period / upcoming /
-- no_active_shift), following spec section 3.1-3.3.
--
-- IMPORTANT: nothing here recalculates or rewrites shift values already
-- stored on attendance / route_trips / route_assignments / milk_collections.
-- Those tables keep capturing their own shift value at write time, per the
-- "do not recalculate historical shift from the current clock" rule (3.4).

-- ---- 1. Configurable shift windows ----------------------------------------

create table if not exists public.shift_definitions (
  id uuid primary key default gen_random_uuid(),
  mcc_id uuid not null references public.mcc_centres(id),
  name text not null,
  code text not null,
  start_time time not null,
  end_time time not null,
  grace_period_minutes integer not null default 0,
  applicable_days smallint[] not null default '{0,1,2,3,4,5,6}',
  active boolean not null default true,
  -- Optional narrowing: NULL means "applies to every route / point at this MCC".
  route_id uuid references public.routes(id),
  collection_point_id uuid references public.route_points(id),
  -- Optional seasonal window. NULL start = always valid from the beginning,
  -- NULL end = never expires.
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shift_definitions is
  'Phase 3: owner/manager-configurable shift windows per MCC. Replaces the '
  'hardcoded morning/evening 2pm split in useAgentContext.ts. A collection''s '
  'own shift value (attendance.shift / route_trips.session / '
  'milk_collections.session) is still captured at write time and never '
  'recomputed later from this table, per the "do not recalculate historical '
  'shift from the current clock" rule.';

comment on column public.shift_definitions.route_id is
  'Optional: restrict this shift window to a single route. NULL = applies to every route at this MCC.';
comment on column public.shift_definitions.collection_point_id is
  'Optional: restrict this shift window to a single collection point/route point. NULL = applies to every point.';
comment on column public.shift_definitions.valid_from is
  'Optional: seasonal schedule start date (inclusive). NULL = always valid.';
comment on column public.shift_definitions.valid_to is
  'Optional: seasonal schedule end date (inclusive). NULL = never expires.';

alter table public.shift_definitions enable row level security;

drop policy if exists "shift definitions managed" on public.shift_definitions;
create policy "shift definitions managed" on public.shift_definitions
  for all
  using (
    public.has_role(auth.uid(), 'owner')
    or (public.has_role(auth.uid(), 'manager') and mcc_id in (select public.user_mcc_ids(auth.uid())))
  )
  with check (
    public.has_role(auth.uid(), 'owner')
    or (public.has_role(auth.uid(), 'manager') and mcc_id in (select public.user_mcc_ids(auth.uid())))
  );

drop policy if exists "shift definitions readable" on public.shift_definitions;
create policy "shift definitions readable" on public.shift_definitions
  for select
  using (
    public.has_role(auth.uid(), 'owner')
    or public.has_role(auth.uid(), 'accountant')
    or mcc_id in (select public.user_mcc_ids(auth.uid()))
    or mcc_id in (select a.mcc_id from public.agents a where a.profile_id = auth.uid())
  );

-- Seed the two shifts that replace the previous hardcoded split, only if this
-- MCC has no shift definitions yet (keeps this migration idempotent and
-- avoids clobbering owner-edited config on repeated runs).
insert into public.shift_definitions (mcc_id, name, code, start_time, end_time, grace_period_minutes, applicable_days)
select mc.id, 'Morning', 'morning', '00:00:00', '14:00:00', 0, '{0,1,2,3,4,5,6}'
from public.mcc_centres mc
where not exists (select 1 from public.shift_definitions sd where sd.mcc_id = mc.id);

insert into public.shift_definitions (mcc_id, name, code, start_time, end_time, grace_period_minutes, applicable_days)
select mc.id, 'Evening', 'evening', '14:00:00', '23:59:59', 0, '{0,1,2,3,4,5,6}'
from public.mcc_centres mc
where not exists (
  select 1 from public.shift_definitions sd where sd.mcc_id = mc.id and sd.code = 'evening'
);

-- ---- 2. Auto shift determination + shift state RPC ------------------------
--
-- Single source of truth for "what shift is it right now, and what state is
-- it in" (3.2, 3.3). Handles overnight-wrapping shifts (e.g. 22:00-04:00),
-- per-route / per-collection-point narrowing, seasonal validity windows, and
-- uses the MCC's configured operational timezone rather than assuming the
-- device/browser timezone is correct.

create or replace function public.get_shift_status(
  p_mcc_id uuid,
  p_at timestamptz default now(),
  p_route_id uuid default null,
  p_collection_point_id uuid default null
)
returns table (
  shift_id uuid,
  shift_code text,
  shift_name text,
  state text,
  starts_at timestamptz,
  ends_at timestamptz,
  grace_ends_at timestamptz,
  minutes_to_start integer,
  minutes_remaining integer,
  ending_soon boolean,
  next_shift_code text,
  next_shift_name text,
  next_shift_starts_at timestamptz,
  timezone text
)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_tz text;
  v_local_ts timestamp;
  v_local_date date;
  v_ending_soon_minutes constant integer := 15;
  v_upcoming_window constant interval := interval '2 hours';
  r record;
  v_offset integer;
  v_anchor_date date;
  v_start_ts timestamp;
  v_end_ts timestamp;
  v_grace_ts timestamp;
  v_dow integer;

  a_id uuid; a_code text; a_name text; a_start timestamp; a_end timestamp;
  g_id uuid; g_code text; g_name text; g_start timestamp; g_end timestamp; g_grace timestamp;
  u_id uuid; u_code text; u_name text; u_start timestamp; u_end timestamp;
  n_code text; n_name text; n_start timestamp;
begin
  select coalesce(mc.timezone, 'Asia/Kolkata') into v_tz
  from public.mcc_centres mc
  where mc.id = p_mcc_id;

  if v_tz is null then
    v_tz := 'Asia/Kolkata';
  end if;

  v_local_ts := p_at at time zone v_tz;
  v_local_date := v_local_ts::date;

  for r in
    select sd.*
    from public.shift_definitions sd
    where sd.mcc_id = p_mcc_id
      and sd.active = true
      and (sd.route_id is null or p_route_id is null or sd.route_id = p_route_id)
      and (sd.collection_point_id is null or p_collection_point_id is null or sd.collection_point_id = p_collection_point_id)
      and (sd.valid_from is null or sd.valid_from <= v_local_date)
      and (sd.valid_to is null or sd.valid_to >= v_local_date)
  loop
    for v_offset in -1..1 loop
      v_anchor_date := v_local_date + v_offset;
      v_dow := extract(dow from v_anchor_date)::integer;

      if not (v_dow = any(r.applicable_days)) then
        continue;
      end if;

      v_start_ts := v_anchor_date + r.start_time;
      if r.end_time > r.start_time then
        v_end_ts := v_anchor_date + r.end_time;
      else
        v_end_ts := (v_anchor_date + 1) + r.end_time;
      end if;
      v_grace_ts := v_end_ts + make_interval(mins => coalesce(r.grace_period_minutes, 0));

      if v_local_ts >= v_start_ts and v_local_ts < v_end_ts then
        if a_start is null or v_start_ts > a_start then
          a_id := r.id; a_code := r.code; a_name := r.name; a_start := v_start_ts; a_end := v_end_ts;
        end if;
      elsif v_local_ts >= v_end_ts and v_local_ts < v_grace_ts then
        if g_end is null or v_end_ts > g_end then
          g_id := r.id; g_code := r.code; g_name := r.name; g_start := v_start_ts; g_end := v_end_ts; g_grace := v_grace_ts;
        end if;
      elsif v_local_ts < v_start_ts and (v_start_ts - v_local_ts) <= v_upcoming_window then
        if u_start is null or v_start_ts < u_start then
          u_id := r.id; u_code := r.code; u_name := r.name; u_start := v_start_ts; u_end := v_end_ts;
        end if;
      end if;

      if v_start_ts > v_local_ts and (n_start is null or v_start_ts < n_start) then
        n_code := r.code; n_name := r.name; n_start := v_start_ts;
      end if;
    end loop;
  end loop;

  if a_id is not null then
    return query select
      a_id, a_code, a_name, 'active'::text,
      (a_start at time zone v_tz), (a_end at time zone v_tz),
      null::timestamptz,
      null::integer,
      greatest(0, ceil(extract(epoch from (a_end - v_local_ts)) / 60))::integer,
      (extract(epoch from (a_end - v_local_ts)) / 60) <= v_ending_soon_minutes,
      n_code, n_name,
      (case when n_start is not null then (n_start at time zone v_tz) else null end),
      v_tz;
    return;
  end if;

  if g_id is not null then
    return query select
      g_id, g_code, g_name, 'grace_period'::text,
      (g_start at time zone v_tz), (g_end at time zone v_tz),
      (g_grace at time zone v_tz),
      null::integer,
      greatest(0, ceil(extract(epoch from (g_grace - v_local_ts)) / 60))::integer,
      false,
      n_code, n_name,
      (case when n_start is not null then (n_start at time zone v_tz) else null end),
      v_tz;
    return;
  end if;

  if u_id is not null then
    return query select
      u_id, u_code, u_name, 'upcoming'::text,
      (u_start at time zone v_tz), (u_end at time zone v_tz),
      null::timestamptz,
      greatest(0, ceil(extract(epoch from (u_start - v_local_ts)) / 60))::integer,
      null::integer, false,
      u_code, u_name,
      (u_start at time zone v_tz),
      v_tz;
    return;
  end if;

  return query select
    null::uuid, null::text, null::text, 'no_active_shift'::text,
    null::timestamptz, null::timestamptz, null::timestamptz,
    (case when n_start is not null then greatest(0, ceil(extract(epoch from (n_start - v_local_ts)) / 60))::integer else null end),
    null::integer, false,
    n_code, n_name,
    (case when n_start is not null then (n_start at time zone v_tz) else null end),
    v_tz;
end;
$function$;

grant execute on function public.get_shift_status(uuid, timestamptz, uuid, uuid) to authenticated;
