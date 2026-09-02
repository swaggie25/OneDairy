import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * LIVE TRACKING PLAN — PHASE 3
 *
 * `useTrackingSession` (Phase 2) owns *creating and transitioning* a
 * tracking session, but it holds sessionId in local component state, which
 * only exists on agent.tsx (where Punch In happens). trip.tsx and
 * route-marking.tsx are separate route components that mount later/fresh —
 * they have no way to see that state.
 *
 * This hook independently resolves "the session Punch In already created
 * for this agent today" from the database, so continuous GPS (Phase 3) can
 * be linked to the right tracking_session_id from any page, and so pings
 * can start flowing as soon as the session is ACTIVE — not only once a
 * trip exists.
 */
export function useActiveTrackingSession(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["active-tracking-session", agentId],
    enabled: Boolean(agentId),
    // Cheap row, changes rarely relative to how often callers re-render —
    // avoid hammering it, but don't go stale for the whole session either.
    staleTime: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("tracking_sessions")
        .select("id, status")
        .eq("agent_id", agentId as string)
        .in("status", ["NOT_STARTED", "ACTIVE", "DEGRADED"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });
}
