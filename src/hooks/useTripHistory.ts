import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildTimeline,
  computeFarmerMetrics,
  computeMccMetrics,
  computeRouteMetrics,
  computeShiftMetrics,
  computeTrackingMetrics,
  deriveStopSegments,
  type Ping,
  type RoutePointLite,
  type StopSegment,
  type TimelineEvent,
} from "@/lib/trip-history";

/**
 * LIVE TRACKING PLAN — PHASE 9
 *
 * Single source of truth for a trip's history: fetches every real
 * operational row that touched this trip and hands them to the pure
 * helpers in `trip-history.ts`. Nothing here is a separate reporting
 * dataset — it's the same `route_trips` / `gps_pings` / `milk_collections`
 * / `trip_exceptions` / `mcc_handovers` rows the live map, handovers
 * queue, and manager dashboard already read, just joined for one trip.
 */
export function useTripHistory(tripId: string | undefined) {
  return useQuery({
    queryKey: ["trip-history", tripId],
    enabled: Boolean(tripId),
    queryFn: async () => {
      const { data: trip, error: tripError } = await supabase
        .from("route_trips")
        .select(
          "id, agent_id, route_id, mcc_id, trip_date, session, status, started_at, ended_at, actual_distance_meters, actual_duration_seconds, deviation_count, agents(full_name, employee_code), routes(name, duration_seconds, distance_meters), mcc_centres(name, lat, lng)",
        )
        .eq("id", tripId!)
        .single();
      if (tripError) throw tripError;

      const [{ data: pingsRaw }, { data: pointsRaw }, { data: collectionsRaw }, { data: exceptionsRaw }, { data: handoverRaw }, { data: sessionRaw }] =
        await Promise.all([
          supabase
            .from("gps_pings")
            .select("lat, lng, recorded_at, speed_kmh, event_type")
            .eq("trip_id", tripId!)
            .order("recorded_at", { ascending: true })
            .limit(20000),
          trip.route_id
            ? supabase
                .from("route_points")
                .select("id, name, sequence, lat, lng, geofence_radius_m")
                .eq("route_id", trip.route_id)
                .order("sequence", { ascending: true })
            : Promise.resolve({ data: [] as RoutePointLite[] }),
          supabase
            .from("milk_collections")
            .select("route_point_id, collected_at, status, quantity_litres, gps_lat, gps_lng, farmers(full_name)")
            .eq("trip_id", tripId!),
          supabase
            .from("trip_exceptions")
            .select("created_at, type, reason, status")
            .eq("trip_id", tripId!)
            .order("created_at", { ascending: true }),
          supabase
            .from("mcc_handovers")
            .select("received_at, declared_quantity_litres, received_quantity_litres, variance_litres, status")
            .eq("trip_id", tripId!)
            .maybeSingle(),
          supabase
            .from("tracking_sessions")
            .select("status, start_at, end_at, failure_reason")
            .eq("agent_id", trip.agent_id)
            .eq("mcc_id", trip.mcc_id)
            .lte("start_at", `${trip.trip_date}T23:59:59Z`)
            .gte("start_at", `${trip.trip_date}T00:00:00Z`)
            .order("start_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      const pings = (pingsRaw ?? []) as Ping[];
      const routePoints = (pointsRaw ?? []) as RoutePointLite[];
      const collections = (collectionsRaw ?? []) as Array<{
        route_point_id: string | null;
        collected_at: string;
        status: string;
        quantity_litres: number | null;
        gps_lat: number | null;
        gps_lng: number | null;
        farmers: { full_name: string } | null;
      }>;
      const exceptions = (exceptionsRaw ?? []) as Array<{ created_at: string; type: string; reason: string | null; status: string }>;
      const handover = handoverRaw as {
        received_at: string | null;
        declared_quantity_litres: number;
        received_quantity_litres: number | null;
        variance_litres: number | null;
        status: string;
      } | null;
      const session = sessionRaw as { status: string; start_at: string | null; end_at: string | null; failure_reason: string | null } | null;

      const startAt = session?.start_at ?? trip.started_at ?? null;
      const endAt = session?.end_at ?? trip.ended_at ?? null;

      const stops: StopSegment[] = deriveStopSegments(pings, routePoints);
      const lastVisited = [...stops].filter((s) => s.departed_at).sort((a, b) => a.sequence - b.sequence).pop();

      const shift = computeShiftMetrics(pings, startAt, endAt);
      const route = computeRouteMetrics(
        (trip.routes as { duration_seconds: number | null } | null)?.duration_seconds ?? null,
        trip.actual_duration_seconds != null ? Number(trip.actual_duration_seconds) : null,
        stops,
      );
      const farmers = computeFarmerMetrics(
        stops,
        collections.map((c) => ({ route_point_id: c.route_point_id, collected_at: c.collected_at, status: c.status })),
      );
      const mcc = computeMccMetrics(
        startAt,
        (trip.routes as { duration_seconds: number | null } | null)?.duration_seconds ?? null,
        lastVisited?.departed_at ?? null,
        handover?.received_at ?? null,
      );
      const syncFailureCount = exceptions.filter((e) => e.type === "sync_failure").length;
      const tracking = computeTrackingMetrics(session?.status ?? trip.status, startAt, endAt, pings, syncFailureCount);

      const timeline: TimelineEvent[] = buildTimeline({
        startAt,
        endAt,
        stops,
        collections: collections.map((c) => ({
          route_point_id: c.route_point_id,
          collected_at: c.collected_at,
          status: c.status,
          farmer_name: c.farmers?.full_name ?? null,
          quantity_litres: c.quantity_litres,
        })),
        exceptions,
        handoverReceivedAt: handover?.received_at ?? null,
      });

      return {
        trip,
        pings,
        routePoints,
        stops,
        collections,
        exceptions,
        handover,
        session,
        metrics: { shift, route, farmers, mcc, tracking },
        timeline,
      };
    },
  });
}
