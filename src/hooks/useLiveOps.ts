import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LiveTrip = {
  id: string;
  status: string;
  session: string;
  started_at: string | null;
  ended_at: string | null;
  route_id: string;
  agent_id: string;
  current_route_point_id: string | null;
  agents: { full_name: string; employee_code: string } | null;
  routes: { name: string } | null;
};

export type LivePing = {
  id: string;
  agent_id: string;
  trip_id: string | null;
  event_type: string;
  lat: number | null;
  lng: number | null;
  recorded_at: string;
  speed_kmh: number | null;
  accuracy: number | null;
  quality: string | null;
};

export type LiveCollection = {
  id: string;
  quantity_litres: number;
  total_amount: number;
  status: string;
  collected_at: string;
  risk_score: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  trip_id: string | null;
  route_point_id: string | null;
  distance_from_point_m: number | null;
  farmers: { full_name: string; farmer_code: string } | null;
  agents: { full_name: string } | null;
};

export type LiveRoutePoint = {
  id: string;
  route_id: string;
  name: string;
  sequence: number;
  lat: number | null;
  lng: number | null;
  geofence_radius_m: number | null;
};

export type LiveRoutePointFarmer = {
  route_point_id: string;
  farmer_id: string;
  sequence: number;
  full_name: string;
};

/** Farmers assigned to each stop, for the routes belonging to this centre — used by the Agent Detail panel's Current/Next farmer fields. */
export function useRoutePointFarmers(mccId: string | undefined) {
  return useQuery<LiveRoutePointFarmer[]>({
    queryKey: ["live-route-point-farmers", mccId],
    enabled: Boolean(mccId),
    staleTime: 300_000,
    queryFn: async () => {
      const { data: routes } = await supabase
        .from("routes")
        .select("id")
        .eq("mcc_id", mccId!)
        .eq("active", true);
      const routeIds = (routes ?? []).map((r) => r.id);
      if (routeIds.length === 0) return [];
      const { data: pointRows } = await supabase
        .from("route_points")
        .select("id, route_id")
        .in("route_id", routeIds);
      const pointIds = (pointRows ?? []).map((p) => p.id);
      if (pointIds.length === 0) return [];
      const { data } = await supabase
        .from("route_point_farmers")
        .select("route_point_id, farmer_id, sequence, farmers(full_name)")
        .in("route_point_id", pointIds);
      return (
        (data ?? []) as unknown as Array<{
          route_point_id: string;
          farmer_id: string;
          sequence: number;
          farmers: { full_name: string } | null;
        }>
      ).map((r) => ({
        route_point_id: r.route_point_id,
        farmer_id: r.farmer_id,
        sequence: r.sequence,
        full_name: r.farmers?.full_name ?? "Farmer",
      }));
    },
  });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Today's trips for a centre, newest first. */
export function useLiveTrips(mccId: string | undefined) {
  return useQuery<LiveTrip[]>({
    queryKey: ["live-trips", mccId],
    enabled: Boolean(mccId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("route_trips")
        .select(
          "id, status, session, started_at, ended_at, route_id, agent_id, current_route_point_id, agents(full_name, employee_code), routes(name)",
        )
        .eq("mcc_id", mccId!)
        .gte("created_at", startOfToday())
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as LiveTrip[];
    },
  });
}

/** Today's GPS breadcrumbs for a centre. */
export function useLivePings(mccId: string | undefined) {
  return useQuery<LivePing[]>({
    queryKey: ["live-pings", mccId],
    enabled: Boolean(mccId),
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("gps_pings")
        .select(
          "id, agent_id, trip_id, event_type, lat, lng, recorded_at, speed_kmh, accuracy, quality",
        )
        .eq("mcc_id", mccId!)
        .gte("recorded_at", startOfToday())
        .order("recorded_at", { ascending: true })
        .limit(1000);
      return (data ?? []) as LivePing[];
    },
  });
}

/** Today's collections feed for a centre. */
export function useLiveCollections(mccId: string | undefined) {
  return useQuery<LiveCollection[]>({
    queryKey: ["live-collections", mccId],
    enabled: Boolean(mccId),
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("milk_collections")
        .select(
          "id, quantity_litres, total_amount, status, collected_at, risk_score, gps_lat, gps_lng, trip_id, route_point_id, distance_from_point_m, farmers(full_name, farmer_code), agents(full_name)",
        )
        .eq("mcc_id", mccId!)
        .gte("collected_at", startOfToday())
        .order("collected_at", { ascending: false })
        .limit(60);
      return (data ?? []) as unknown as LiveCollection[];
    },
  });
}

export function useRoutePoints(mccId: string | undefined) {
  return useQuery<LiveRoutePoint[]>({
    queryKey: ["live-route-points", mccId],
    enabled: Boolean(mccId),
    staleTime: 300_000,
    queryFn: async () => {
      const { data: routes } = await supabase
        .from("routes")
        .select("id")
        .eq("mcc_id", mccId!)
        .eq("active", true);
      const ids = (routes ?? []).map((r) => r.id);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("route_points")
        .select("id, route_id, name, sequence, lat, lng, geofence_radius_m")
        .in("route_id", ids)
        .order("sequence");
      return (data ?? []) as LiveRoutePoint[];
    },
  });
}

export function useCentreLocation(mccId: string | undefined) {
  return useQuery({
    queryKey: ["centre-location", mccId],
    enabled: Boolean(mccId),
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("mcc_centres")
        .select("name, lat, lng, default_geofence_radius_m")
        .eq("id", mccId!)
        .maybeSingle();
      return data;
    },
  });
}

/**
 * LIVE TRACKING PLAN — PHASE 5
 *
 * Owner-configurable timing thresholds (mcc_centres.on_time_threshold_min /
 * delayed_threshold_min) used to classify ON TIME / SLIGHTLY LATE /
 * DELAYED — "Use existing DairyOne configuration if available. Do not
 * hard-code arbitrary business rules." Long staleTime: this is config, not
 * live data, and rarely changes.
 */
export function useMccTimingConfig(mccId: string | undefined) {
  return useQuery({
    queryKey: ["mcc-timing-config", mccId],
    enabled: Boolean(mccId),
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("mcc_centres")
        .select("on_time_threshold_min, delayed_threshold_min")
        .eq("id", mccId!)
        .maybeSingle();
      return {
        onTimeThresholdMin: data?.on_time_threshold_min ?? 5,
        delayedThresholdMin: data?.delayed_threshold_min ?? 15,
      };
    },
  });
}

/**
 * LIVE TRACKING PLAN — PHASE 7
 *
 * Owner-configurable thresholds for the deviation/unplanned-stop
 * detectors (mcc_centres.route_deviation_threshold_m /
 * unplanned_stop_minutes) — same reuse pattern as Phase 5's timing
 * thresholds.
 */
export function useMccExceptionConfig(mccId: string | undefined) {
  return useQuery({
    queryKey: ["mcc-exception-config", mccId],
    enabled: Boolean(mccId),
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("mcc_centres")
        .select("route_deviation_threshold_m, unplanned_stop_minutes")
        .eq("id", mccId!)
        .maybeSingle();
      return {
        routeDeviationThresholdM: data?.route_deviation_threshold_m ?? 300,
        unplannedStopMinutes: data?.unplanned_stop_minutes ?? 5,
      };
    },
  });
}

export type LiveTrackingSession = {
  id: string;
  agent_id: string;
  status: string;
  failure_reason: string | null;
  last_location_at: string | null;
};

/**
 * LIVE TRACKING PLAN — PHASE 7
 *
 * Today's tracking_sessions for this centre — reused as-is (Phase 2) to
 * detect gps_failure / tracking_failure exceptions from a session that
 * went DEGRADED, rather than re-deriving GPS-health signals separately.
 */
export function useLiveTrackingSessions(mccId: string | undefined) {
  return useQuery<LiveTrackingSession[]>({
    queryKey: ["live-tracking-sessions", mccId],
    enabled: Boolean(mccId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("tracking_sessions")
        .select("id, agent_id, status, failure_reason, last_location_at")
        .eq("mcc_id", mccId!)
        .gte("created_at", startOfToday())
        .order("created_at", { ascending: false });
      return (data ?? []) as LiveTrackingSession[];
    },
  });
}

export type LiveException = {
  id: string;
  trip_id: string;
  agent_id: string;
  route_point_id: string | null;
  farmer_id: string | null;
  type: string;
  reason: string | null;
  status: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
  resolved_at: string | null;
};

/**
 * LIVE TRACKING PLAN — PHASE 7
 *
 * Open exceptions for this centre — used both to render the Agent
 * Detail panel's exception list and, client-side, to avoid attempting a
 * redundant insert for a type that's already open on a trip (the DB's
 * partial unique index is the real guarantee; this just saves a
 * round-trip).
 */
export function useLiveExceptions(mccId: string | undefined) {
  return useQuery<LiveException[]>({
    queryKey: ["live-exceptions", mccId],
    enabled: Boolean(mccId),
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("trip_exceptions")
        .select(
          "id, trip_id, agent_id, route_point_id, farmer_id, type, reason, status, lat, lng, created_at, resolved_at",
        )
        .eq("mcc_id", mccId!)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as LiveException[];
    },
  });
}

/**
 * LIVE TRACKING PLAN — PHASE 4
 *
 * Refreshes live queries as data changes. GPS pings are by far the highest-
 * frequency event here (one every ~10-45s per active agent, per Phase 3's
 * adaptive sampling) — invalidating the whole `live-pings` query on every
 * single insert would refetch up to 1000 rows and force the map to rebuild
 * every marker/trail/bounds on every tick ("Do not cause the entire map to
 * reload on every GPS update"). Instead, splice just the new row into the
 * existing cached array. Trips and collections are much lower-frequency
 * (a handful of events/day, not one every few seconds), so a plain
 * invalidate for those is cheap enough and keeps that code simple.
 */
export function useLiveOpsRealtime(mccId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!mccId) return;
    const invalidate = (key: string) => void queryClient.invalidateQueries({ queryKey: [key] });
    const channel = supabase
      .channel(`live-ops-${mccId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "gps_pings", filter: `mcc_id=eq.${mccId}` },
        (payload) => {
          const row = payload.new as LivePing;
          queryClient.setQueryData<LivePing[]>(["live-pings", mccId], (prev) => {
            if (!prev) return prev;
            if (prev.some((p) => p.id === row.id)) return prev; // already have it (e.g. own optimistic insert)
            return [...prev, row];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "route_trips", filter: `mcc_id=eq.${mccId}` },
        () => invalidate("live-trips"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "milk_collections", filter: `mcc_id=eq.${mccId}` },
        () => invalidate("live-collections"),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [mccId, queryClient]);
}
