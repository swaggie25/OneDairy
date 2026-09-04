-- PHASE — Item 7: single "purchase" ledger entry per shift.
--
-- create_mcc_handover already aggregates every milk_collections row for a
-- trip (= one agent's one shift) into a single declared quantity/count.
-- This adds the missing half: booking that same shift as ONE purchase
-- ledger entry (account = 'purchase', debit) instead of only ever being
-- captured later inside a manager's ad-hoc multi-day settlement run. The
-- narration/description references the agent (employee code + name) and
-- every farmer collected from in that shift (farmer_code list), so the
-- ledger row is self-explanatory and traceable back to both.
--
-- Booked at DECLARATION time (not receipt): the shift's rate-adjusted
-- amount is already fixed once collections are made, and idempotency
-- (retry-safe) piggybacks on create_mcc_handover's existing "return early
-- if a handover already exists for this trip" guard, so this insert can
-- never run twice for the same trip.

create or replace function public.create_mcc_handover(p_trip_id uuid)
returns public.mcc_handovers
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_trip record;
  v_agent record;
  v_existing public.mcc_handovers;
  v_row public.mcc_handovers;
  v_qty numeric;
  v_amount numeric;
  v_count integer;
  v_farmer_codes text;
  v_farmer_count integer;
  v_description text;
begin
  -- Idempotent: a retry (flaky network after the first success) returns the
  -- existing row instead of raising, creating a duplicate handover, or
  -- double-booking the purchase ledger entry below.
  select * into v_existing from public.mcc_handovers where trip_id = p_trip_id;
  if found then
    return v_existing;
  end if;

  select * into v_trip from public.route_trips where id = p_trip_id;
  if not found then
    raise exception 'Trip not found.';
  end if;

  select a.* into v_agent from public.agents a where a.id = v_trip.agent_id;

  if not (
    public.has_role(v_uid, 'owner')
    or (v_agent.profile_id = v_uid)
    or (v_trip.mcc_id in (select public.user_mcc_ids(v_uid)))
  ) then
    raise exception 'Not authorized to hand over this trip.';
  end if;

  if v_trip.status <> 'completed' then
    raise exception 'Complete the route before handing over at the MCC.';
  end if;

  select coalesce(sum(quantity_litres), 0), coalesce(sum(total_amount), 0), count(*)
    into v_qty, v_amount, v_count
    from public.milk_collections
    where trip_id = p_trip_id;

  insert into public.mcc_handovers (
    trip_id, agent_id, mcc_id, trip_date, session,
    declared_quantity_litres, declared_collection_count, created_by
  ) values (
    p_trip_id, v_trip.agent_id, v_trip.mcc_id, v_trip.trip_date, v_trip.session,
    v_qty, v_count, v_uid
  )
  returning * into v_row;

  -- One purchase entry for the whole shift, combining every farmer
  -- collected from on this trip, instead of one per farmer/collection.
  if v_amount > 0 then
    select string_agg(distinct f.farmer_code, ', ' order by f.farmer_code), count(distinct f.id)
      into v_farmer_codes, v_farmer_count
      from public.milk_collections mc
      join public.farmers f on f.id = mc.farmer_id
      where mc.trip_id = p_trip_id;

    v_description := format(
      'Milk purchase — %s shift %s — Agent %s (%s) — %s farmers: %s',
      initcap(coalesce(v_trip.session, 'trip')),
      v_trip.trip_date,
      coalesce(v_agent.employee_code, v_agent.id::text),
      coalesce(v_agent.full_name, 'Unknown'),
      v_farmer_count,
      coalesce(v_farmer_codes, 'n/a')
    );

    insert into public.ledger_entries (
      mcc_id, entry_date, account, direction, amount,
      ref_type, ref_id, description, created_by
    ) values (
      v_trip.mcc_id, v_trip.trip_date, 'purchase', 'debit', v_amount,
      'mcc_handover', v_row.id, v_description, v_uid
    );
  end if;

  return v_row;
end;
$function$;
