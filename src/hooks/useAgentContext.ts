import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "./useCurrentUser";

export type AgentContext = {
  agentId: string;
  mccId: string;
  fullName: string;
  employeeCode: string;
  routeId: string | null;
  routeName: string | null;
  /** Present when today's route came from a proper date/shift assignment. */
  assignmentId: string | null;
  shift: "morning" | "evening" | null;
  vehicleType: string | null;
  sequenceLocked: boolean;
};

/**
 * Phase 3 — Shift Intelligence: resolves "what shift is it right now" from
 * the owner/manager-configurable `shift_definitions` table (via the
 * `get_shift_status` RPC) instead of a hardcoded "hour < 14 => morning"
 * rule, so shift windows, grace periods, and per-route overrides are all
 * configurable without a code change.
 *
 * Falls back to the previous hardcoded split only if the RPC is unreachable
 * (e.g. transient network failure), so agent context resolution never hard-
 * fails just because the shift lookup did.
 */
async function currentShift(mccId: string): Promise<"morning" | "evening"> {
  try {
    const { data, error } = await supabase.rpc("get_shift_status", { p_mcc_id: mccId });
    if (error) throw error;
    const code = data?.[0]?.shift_code ?? data?.[0]?.next_shift_code;
    if (code === "morning" || code === "evening") return code;
  } catch {
    // fall through to the legacy heuristic below
  }
  return new Date().getHours() < 14 ? "morning" : "evening";
}

/**
 * Resolves the signed-in user's agent record and today's route.
 *
 * Prefers a proper `route_assignments` row for today (date + shift, set by
 * a manager/owner from Field setup → Assignments) and falls back to the
 * legacy "default route" on `routes.assigned_agent_id` for agents who
 * haven't been given a dated assignment yet, so nothing existing breaks.
 */
export function useAgentContext() {
  const { data: user } = useCurrentUser();
  return useQuery<AgentContext | null>({
    queryKey: ["agent-context", user?.userId],
    enabled: Boolean(user?.userId),
    // A null result right after sign-in usually means the session token wasn't
    // attached yet — keep retrying briefly instead of caching "not linked".
    staleTime: (query) => (query.state.data ? 60_000 : 0),
    refetchInterval: (query) => (query.state.data ? false : 2_000),
    queryFn: async () => {
      const { data: agent } = await supabase
        .from("agents")
        .select("id, mcc_id, full_name, employee_code")
        .eq("profile_id", user!.userId)
        .maybeSingle();
      if (!agent) return null;

      const today = new Date().toISOString().slice(0, 10);
      const shift = await currentShift(agent.mcc_id);

      const { data: assignment } = await supabase
        .from("route_assignments")
        .select("id, shift, vehicle_type, sequence_locked, routes(id, name)")
        .eq("agent_id", agent.id)
        .eq("assignment_date", today)
        .eq("status", "active")
        .order("shift", { ascending: shift === "morning" })
        .limit(1)
        .maybeSingle();

      if (assignment?.routes) {
        return {
          agentId: agent.id,
          mccId: agent.mcc_id,
          fullName: agent.full_name,
          employeeCode: agent.employee_code,
          routeId: assignment.routes.id,
          routeName: assignment.routes.name,
          assignmentId: assignment.id,
          shift: assignment.shift as "morning" | "evening",
          vehicleType: assignment.vehicle_type,
          sequenceLocked: assignment.sequence_locked,
        };
      }

      // Legacy fallback: a route with no dated assignment, just a default owner.
      const { data: route } = await supabase
        .from("routes")
        .select("id, name, default_vehicle_type")
        .eq("assigned_agent_id", agent.id)
        .eq("active", true)
        .maybeSingle();

      return {
        agentId: agent.id,
        mccId: agent.mcc_id,
        fullName: agent.full_name,
        employeeCode: agent.employee_code,
        routeId: route?.id ?? null,
        routeName: route?.name ?? null,
        assignmentId: null,
        shift: null,
        vehicleType: route?.default_vehicle_type ?? null,
        sequenceLocked: true,
      };
    },
  });
}
