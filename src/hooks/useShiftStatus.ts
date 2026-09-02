import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ShiftState = "active" | "grace_period" | "upcoming" | "no_active_shift";

export type ShiftStatus = {
  shiftId: string | null;
  /** Stable machine code, e.g. "morning" / "evening" — matches the values already
   *  stored on attendance.shift, route_trips.session, milk_collections.session. */
  shiftCode: string | null;
  shiftName: string | null;
  state: ShiftState;
  startsAt: string | null;
  endsAt: string | null;
  graceEndsAt: string | null;
  minutesToStart: number | null;
  minutesRemaining: number | null;
  endingSoon: boolean;
  nextShiftCode: string | null;
  nextShiftName: string | null;
  nextShiftStartsAt: string | null;
  timezone: string;
};

/**
 * Phase 3 — Shift Intelligence.
 *
 * Resolves the current shift (and whether it's active / in its grace period /
 * upcoming / or there's no active shift right now) from the owner/manager
 * configurable `shift_definitions` table via the `get_shift_status` RPC,
 * instead of a hardcoded "before/after 2pm" rule.
 *
 * This only tells you what shift it is *right now* — it must never be used
 * to recompute or overwrite a shift value already recorded on a historical
 * row (attendance, trip, collection). Those keep whatever shift they were
 * written with.
 */
export function useShiftStatus(params: {
  mccId: string | null | undefined;
  routeId?: string | null;
  collectionPointId?: string | null;
  /** Poll periodically so a session left open across a shift boundary
   *  notices the transition (e.g. "shift ending soon" -> "no active shift"). */
  refetchIntervalMs?: number;
}) {
  const { mccId, routeId = null, collectionPointId = null, refetchIntervalMs = 60_000 } = params;

  return useQuery<ShiftStatus | null>({
    queryKey: ["shift-status", mccId, routeId, collectionPointId],
    enabled: Boolean(mccId),
    refetchInterval: refetchIntervalMs,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_shift_status", {
        p_mcc_id: mccId!,
        p_route_id: routeId,
        p_collection_point_id: collectionPointId,
      });
      if (error) throw error;

      const row = data?.[0];
      if (!row) return null;

      return {
        shiftId: row.shift_id,
        shiftCode: row.shift_code,
        shiftName: row.shift_name,
        state: row.state as ShiftState,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        graceEndsAt: row.grace_ends_at,
        minutesToStart: row.minutes_to_start,
        minutesRemaining: row.minutes_remaining,
        endingSoon: row.ending_soon,
        nextShiftCode: row.next_shift_code,
        nextShiftName: row.next_shift_name,
        nextShiftStartsAt: row.next_shift_starts_at,
        timezone: row.timezone,
      };
    },
  });
}
