import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Gauge, MapPinned, Milk, Navigation, Radio, Users } from "lucide-react";
import { ClientOnly } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStaffMcc } from "@/hooks/useStaffMcc";
import {
  useCentreLocation,
  useLiveCollections,
  useLiveExceptions,
  useLiveOpsRealtime,
  useLivePings,
  useLiveTrackingSessions,
  useLiveTrips,
  useMccExceptionConfig,
  useMccTimingConfig,
  useRoutePointFarmers,
  useRoutePoints,
} from "@/hooks/useLiveOps";
import { computeRoute } from "@/lib/maps.functions";
import { formatCurrency } from "@/lib/pricing";
import { MANAGER_NAV } from "@/lib/nav";
import { distanceToPathMeters, haversineMeters } from "@/lib/geo";
import { classifyLiveStatus } from "@/lib/tracking-quality";
import { decodePolyline } from "@/lib/google-maps-loader";
import { exceptionLabel, isAutoExceptionType } from "@/lib/exceptions";
import { detectRouteDeviation, detectUnplannedStop } from "@/lib/route-exceptions";
import { requireRole } from "@/lib/route-guards";
import {
  TIMING_STATUS_LABEL,
  addSeconds,
  classifyTimingStatus,
  cumulativeOffsetsSeconds,
  formatClock,
  formatDelay,
  minutesBetween,
} from "@/lib/route-intelligence";
import {
  deriveStopVisit,
  formatDurationShort,
  stopDurationSeconds,
  travelTimeSeconds,
} from "@/lib/stop-intelligence";

const LiveMap = lazy(() => import("@/components/google-live-map"));

export const Route = createFileRoute("/_authenticated/live")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["manager", "owner"]),
  head: () => ({
    meta: [
      { title: "Live operations map — DairyOne" },
      {
        name: "description",
        content:
          "Track every active collection agent, route-point progress and incoming milk entries live on one map.",
      },
      { property: "og:title", content: "Live operations map — DairyOne" },
      {
        property: "og:description",
        content: "Realtime agent GPS trails, trip status and collection feed for your centre.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LiveOpsScreen,
});

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function LiveOpsScreen() {
  const { data: mcc } = useStaffMcc();
  const mccId = mcc?.mccId;
  const [focusAgentId, setFocusAgentId] = useState<string | null>(null);

  useLiveOpsRealtime(mccId);
  const { data: trips } = useLiveTrips(mccId);
  const { data: pings } = useLivePings(mccId);
  const { data: points } = useRoutePoints(mccId);
  const { data: pointFarmers } = useRoutePointFarmers(mccId);
  const { data: collections } = useLiveCollections(mccId);
  const { data: centre } = useCentreLocation(mccId);
  const { data: timingConfig } = useMccTimingConfig(mccId);
  const { data: exceptionConfig } = useMccExceptionConfig(mccId);
  const { data: trackingSessions } = useLiveTrackingSessions(mccId);
  const { data: openExceptions } = useLiveExceptions(mccId);
  const queryClient = useQueryClient();

  const tripList = trips ?? [];
  const pingList = useMemo(() => pings ?? [], [pings]);
  const collectionList = useMemo(() => collections ?? [], [collections]);
  const active = tripList.filter((t) => t.status === "in_progress");
  const litres = collectionList.reduce((s, c) => s + Number(c.quantity_litres ?? 0), 0);
  const value = collectionList.reduce((s, c) => s + Number(c.total_amount ?? 0), 0);

  const lastPingFor = (agentId: string) =>
    [...pingList].reverse().find((p) => p.agent_id === agentId) ?? null;

  /*
   * LIVE TRACKING PLAN — PHASE 4/5: Agent detail
   *
   * Everything through farmer progress is derived from data already on
   * this page (pings, points, point-farmers, collections) — no new
   * per-click query. ETA / scheduled time / delay / MCC ETA (Phase 5,
   * below) use real road routing via the existing computeRoute server
   * function rather than a distance÷fixed-speed guess.
   */
  const focusedTrip = focusAgentId
    ? (tripList.find((t) => t.agent_id === focusAgentId) ?? null)
    : null;
  const focusedPing = focusAgentId ? lastPingFor(focusAgentId) : null;
  const focusedLive = classifyLiveStatus(focusedPing?.recorded_at ?? null);

  const routePointsForFocusedRoute = useMemo(() => {
    if (!focusedTrip) return [];
    return (points ?? [])
      .filter((p) => p.route_id === focusedTrip.route_id)
      .sort((a, b) => a.sequence - b.sequence);
  }, [points, focusedTrip]);

  const farmersForFocusedRoute = useMemo(() => {
    const pointIds = new Set(routePointsForFocusedRoute.map((p) => p.id));
    return (pointFarmers ?? [])
      .filter((f) => pointIds.has(f.route_point_id))
      .sort((a, b) => a.sequence - b.sequence);
  }, [pointFarmers, routePointsForFocusedRoute]);

  const tripCollections = useMemo(
    () =>
      focusedTrip
        ? collectionList.filter((c) => c.agents?.full_name === focusedTrip.agents?.full_name)
        : [],
    [collectionList, focusedTrip],
  );
  // Collections don't carry farmer_id on this feed, only farmer name — match
  // on name (same limitation as the rest of this feed, which already keys
  // collection→agent by name for display).
  const collectedFarmerNames = useMemo(
    () => new Set(tripCollections.map((c) => c.farmers?.full_name).filter(Boolean)),
    [tripCollections],
  );

  const nextUncollectedFarmer = farmersForFocusedRoute.find(
    (f) => !collectedFarmerNames.has(f.full_name),
  );
  const nextFarmerIndex = nextUncollectedFarmer
    ? farmersForFocusedRoute.findIndex((f) => f.farmer_id === nextUncollectedFarmer.farmer_id)
    : -1;
  const currentFarmer = nextFarmerIndex >= 0 ? nextUncollectedFarmer : null;
  const upcomingFarmer =
    nextFarmerIndex >= 0 && nextFarmerIndex + 1 < farmersForFocusedRoute.length
      ? farmersForFocusedRoute[nextFarmerIndex + 1]
      : null;

  const farmersTotal = farmersForFocusedRoute.length;
  const farmersCompleted = farmersForFocusedRoute.filter((f) =>
    collectedFarmerNames.has(f.full_name),
  ).length;
  const litresThisTrip = tripCollections.reduce((s, c) => s + Number(c.quantity_litres ?? 0), 0);

  const nextFarmerPoint = upcomingFarmer
    ? (routePointsForFocusedRoute.find((p) => p.id === upcomingFarmer.route_point_id) ?? null)
    : null;
  const distanceToNextM =
    focusedPing?.lat != null &&
    focusedPing?.lng != null &&
    nextFarmerPoint?.lat != null &&
    nextFarmerPoint?.lng != null
      ? haversineMeters(focusedPing.lat, focusedPing.lng, nextFarmerPoint.lat, nextFarmerPoint.lng)
      : null;

  const currentFarmerPoint = currentFarmer
    ? (routePointsForFocusedRoute.find((p) => p.id === currentFarmer.route_point_id) ?? null)
    : null;

  /*
   * LIVE TRACKING PLAN — PHASE 6: farmer arrival / departure / stop duration
   *
   * Derived entirely from this trip's own ping trail (already loaded
   * above, Phase 3) crossing the stop's geofence — route_points'
   * geofence_radius_m, falling back to the centre's configured
   * default_geofence_radius_m (Phase 1 config), never a hard-coded
   * number. This is deliberately independent of the "View farmers" tap
   * in the agent app (trip.tsx's `arrive` mutation) — that's a manual UI
   * action, not a location signal, and per the plan a GPS arrival must
   * never touch the collection workflow either way.
   */
  const tripPingTrail = useMemo(() => {
    if (!focusedTrip) return [];
    return pingList
      .filter((p) => p.trip_id === focusedTrip.id)
      .map((p) => ({ lat: p.lat, lng: p.lng, recorded_at: p.recorded_at, quality: p.quality }));
  }, [pingList, focusedTrip]);

  const defaultRadiusM = centre?.default_geofence_radius_m ?? 150;

  const currentStopIndex = currentFarmerPoint
    ? routePointsForFocusedRoute.findIndex((p) => p.id === currentFarmerPoint.id)
    : -1;
  const previousStopPoint =
    currentStopIndex > 0 ? (routePointsForFocusedRoute[currentStopIndex - 1] ?? null) : null;

  const previousStopVisit = useMemo(
    () =>
      previousStopPoint ? deriveStopVisit(tripPingTrail, previousStopPoint, defaultRadiusM) : null,
    [tripPingTrail, previousStopPoint, defaultRadiusM],
  );
  const currentStopVisit = useMemo(
    () =>
      currentFarmerPoint
        ? deriveStopVisit(tripPingTrail, currentFarmerPoint, defaultRadiusM)
        : null,
    [tripPingTrail, currentFarmerPoint, defaultRadiusM],
  );

  // Collections logged at this stop, for this trip — reused, not duplicated.
  const currentStopCollections = useMemo(() => {
    if (!focusedTrip || !currentFarmerPoint) return [];
    return collectionList.filter(
      (c) => c.trip_id === focusedTrip.id && c.route_point_id === currentFarmerPoint.id,
    );
  }, [collectionList, focusedTrip, currentFarmerPoint]);
  const lastCollectionAt = currentStopCollections.length
    ? new Date(Math.max(...currentStopCollections.map((c) => new Date(c.collected_at).getTime())))
    : null;

  const travelToCurrentStopFrom =
    previousStopVisit?.departedAt ??
    (currentStopIndex === 0 && focusedTrip?.started_at ? new Date(focusedTrip.started_at) : null);
  const travelTimeToCurrentSec = currentStopVisit
    ? travelTimeSeconds(travelToCurrentStopFrom, currentStopVisit.arrivedAt)
    : null;
  const currentStopDurationSec = currentStopVisit ? stopDurationSeconds(currentStopVisit) : null;

  // Stops for the directions request: focused agent's route, else every active stop.
  const focusedRouteId = focusAgentId
    ? (tripList.find((t) => t.agent_id === focusAgentId)?.route_id ?? null)
    : null;

  const [showDirections, setShowDirections] = useState(false);
  // Keep the underlying route_point rows (not just lat/lng) so a computeRoute
  // leg can be matched back to the stop it arrives at — needed for Phase 5's
  // per-stop scheduled time.
  const routeStopsFull = useMemo(() => {
    return (points ?? [])
      .filter((p) => p.lat != null && p.lng != null)
      .filter((p) => (focusedRouteId ? p.route_id === focusedRouteId : true))
      .sort((a, b) => a.sequence - b.sequence)
      .slice(0, 25);
  }, [points, focusedRouteId]);
  const routeStops = useMemo(
    () => routeStopsFull.map((p) => ({ lat: p.lat!, lng: p.lng! })),
    [routeStopsFull],
  );

  const startPoint =
    centre?.lat != null && centre.lng != null
      ? { lat: centre.lat, lng: centre.lng }
      : (routeStops[0] ?? null);

  const runComputeRoute = useServerFn(computeRoute);
  /*
   * LIVE TRACKING PLAN — PHASE 5: full-route schedule
   *
   * One computeRoute call over every stop of the focused agent's route,
   * origin at the centre (where the trip starts). Its per-leg durations,
   * summed cumulatively from route_trips.started_at, give each stop a real
   * road-routing-derived "scheduled" time — reused for both the visual
   * polyline (existing "Show directions" toggle) and the schedule/delay
   * numbers below. Auto-enabled (no toggle needed) only when an agent is
   * focused, so this never runs for the "all active stops" overview and
   * never fires per-agent-in-a-list — matching Phase 4's "no excessive
   * traffic" rule.
   */
  const directions = useQuery({
    queryKey: ["directions", focusedRouteId, routeStops.length, startPoint?.lat, startPoint?.lng],
    enabled:
      (showDirections || Boolean(focusedTrip)) && Boolean(startPoint) && routeStops.length > 0,
    staleTime: 300_000,
    retry: false,
    queryFn: () =>
      runComputeRoute({
        data: {
          origin: startPoint!,
          destination: routeStops[routeStops.length - 1]!,
          waypoints: routeStops.slice(0, -1),
        },
      }),
  });

  const km = directions.data ? (directions.data.distanceMeters / 1000).toFixed(1) : null;
  const mins = directions.data ? Math.round(directions.data.durationSeconds / 60) : null;

  // stop id → planned seconds-from-trip-start to reach it.
  const scheduledOffsetByPointId = useMemo(() => {
    const map = new Map<string, number>();
    if (!directions.data) return map;
    const offsets = cumulativeOffsetsSeconds(directions.data.legs);
    routeStopsFull.forEach((p, i) => {
      if (offsets[i] != null) map.set(p.id, offsets[i]!);
    });
    return map;
  }, [directions.data, routeStopsFull]);

  const scheduledAtForPoint = (pointId: string | undefined) => {
    if (!focusedTrip?.started_at || !pointId) return null;
    const offset = scheduledOffsetByPointId.get(pointId);
    return offset != null ? addSeconds(focusedTrip.started_at, offset) : null;
  };

  const nextScheduledAt = scheduledAtForPoint(nextFarmerPoint?.id);

  /*
   * LIVE TRACKING PLAN — PHASE 5: live ETA to next stop
   *
   * "ETA should update as the Agent moves" — a fresh computeRoute from the
   * agent's current GPS fix to the next stop, refetched periodically (not
   * on every ping) while there's a focused, in-progress trip with a known
   * next stop.
   */
  const etaOrigin =
    focusedPing?.lat != null && focusedPing?.lng != null
      ? { lat: focusedPing.lat, lng: focusedPing.lng }
      : null;
  const nextStopDest =
    nextFarmerPoint?.lat != null && nextFarmerPoint?.lng != null
      ? { lat: nextFarmerPoint.lat, lng: nextFarmerPoint.lng }
      : null;
  const etaToNext = useQuery({
    queryKey: ["eta-next", focusAgentId, nextFarmerPoint?.id, etaOrigin?.lat, etaOrigin?.lng],
    enabled: focusedTrip?.status === "in_progress" && Boolean(etaOrigin) && Boolean(nextStopDest),
    staleTime: 30_000,
    refetchInterval: 45_000,
    retry: false,
    queryFn: () => runComputeRoute({ data: { origin: etaOrigin!, destination: nextStopDest! } }),
  });

  const predictedNextArrival =
    etaToNext.data && etaOrigin
      ? new Date(Date.now() + etaToNext.data.durationSeconds * 1000)
      : null;
  const nextDelayMin =
    nextScheduledAt && predictedNextArrival
      ? minutesBetween(nextScheduledAt, predictedNextArrival)
      : null;
  const nextTimingStatus =
    nextDelayMin != null
      ? classifyTimingStatus(
          nextDelayMin,
          timingConfig?.onTimeThresholdMin ?? 5,
          timingConfig?.delayedThresholdMin ?? 15,
        )
      : null;

  /*
   * LIVE TRACKING PLAN — PHASE 5: MCC ETA
   *
   * "After the route or near route completion" — only computed once the
   * agent has no farmers left to collect from (or the trip is already
   * marked completed), and only for the focused agent.
   */
  const routeExhausted = farmersTotal > 0 && farmersCompleted >= farmersTotal;
  const nearMccPhase =
    Boolean(focusedTrip) && (routeExhausted || focusedTrip?.status === "completed");
  const mccDest =
    centre?.lat != null && centre?.lng != null ? { lat: centre.lat, lng: centre.lng } : null;
  const mccEta = useQuery({
    queryKey: ["eta-mcc", focusAgentId, etaOrigin?.lat, etaOrigin?.lng, mccDest?.lat, mccDest?.lng],
    enabled: nearMccPhase && Boolean(etaOrigin) && Boolean(mccDest),
    staleTime: 30_000,
    refetchInterval: 45_000,
    retry: false,
    queryFn: () => runComputeRoute({ data: { origin: etaOrigin!, destination: mccDest! } }),
  });

  const mccEtaAt =
    mccEta.data && etaOrigin ? new Date(Date.now() + mccEta.data.durationSeconds * 1000) : null;
  const scheduledMccAt =
    focusedTrip?.started_at && directions.data
      ? addSeconds(focusedTrip.started_at, directions.data.durationSeconds)
      : null;
  const mccDelayMin = scheduledMccAt && mccEtaAt ? minutesBetween(scheduledMccAt, mccEtaAt) : null;

  /*
   * LIVE TRACKING PLAN — PHASE 7: Route Deviation, Delays & Exceptions
   *
   * Detection candidates for the focused agent, built entirely from data
   * already loaded above (Phases 4-6) plus the two Phase 7 config
   * thresholds. "Delay" reuses Phase 5's classification as-is. GPS/
   * tracking failure reuse tracking_sessions.status (Phase 2) as-is.
   * Deviation and unplanned-stop run the new pure detectors over this
   * trip's own ping trail. Nothing here writes anything by itself — see
   * the effect below.
   */
  const openExceptionsForTrip = useMemo(
    () => (focusedTrip ? (openExceptions ?? []).filter((e) => e.trip_id === focusedTrip.id) : []),
    [openExceptions, focusedTrip],
  );
  const openTypesForTrip = useMemo(
    () => new Set(openExceptionsForTrip.map((e) => e.type)),
    [openExceptionsForTrip],
  );

  const routePath = useMemo(
    () => (directions.data ? decodePolyline(directions.data.polyline) : []),
    [directions.data],
  );
  const deviation = useMemo(
    () =>
      focusedTrip?.status === "in_progress" && routePath.length >= 2
        ? detectRouteDeviation(
            tripPingTrail,
            routePath,
            exceptionConfig?.routeDeviationThresholdM ?? 300,
          )
        : null,
    [tripPingTrail, routePath, focusedTrip, exceptionConfig],
  );

  const knownPlaces = useMemo(() => {
    const places = routeStopsFull.map((p) => ({ lat: p.lat!, lng: p.lng! }));
    if (centre?.lat != null && centre?.lng != null)
      places.push({ lat: centre.lat, lng: centre.lng });
    return places;
  }, [routeStopsFull, centre]);
  const unplannedStop = useMemo(
    () =>
      focusedTrip?.status === "in_progress"
        ? detectUnplannedStop(
            tripPingTrail,
            knownPlaces,
            exceptionConfig?.unplannedStopMinutes ?? 5,
          )
        : null,
    [tripPingTrail, knownPlaces, focusedTrip, exceptionConfig],
  );

  const delayCandidate =
    nearMccPhase && mccDelayMin != null && mccDelayMin > (timingConfig?.delayedThresholdMin ?? 15)
      ? { reason: `Running ${formatDelay(mccDelayMin)} against the scheduled MCC arrival.` }
      : nextTimingStatus === "DELAYED" && nextDelayMin != null && upcomingFarmer
        ? {
            reason: `Running ${formatDelay(nextDelayMin)} for the next stop (${upcomingFarmer.full_name}).`,
          }
        : null;

  const trackingSessionForAgent = focusAgentId
    ? (trackingSessions ?? []).find((s) => s.agent_id === focusAgentId)
    : null;
  const gpsFailureCandidate =
    trackingSessionForAgent?.status === "DEGRADED" && trackingSessionForAgent.failure_reason
      ? {
          type: (["permission_denied", "gps_disabled", "location_unavailable"].includes(
            trackingSessionForAgent.failure_reason,
          )
            ? "gps_failure"
            : "tracking_failure") as "gps_failure" | "tracking_failure",
          reason: `Tracking session degraded: ${trackingSessionForAgent.failure_reason.replace(/_/g, " ")}.`,
        }
      : null;

  const logException = useMutation({
    mutationFn: async (input: {
      type: string;
      reason: string;
      lat: number | null;
      lng: number | null;
    }) => {
      if (!focusedTrip || !mccId) return;
      const { error } = await supabase.from("trip_exceptions").insert({
        trip_id: focusedTrip.id,
        agent_id: focusedTrip.agent_id,
        mcc_id: mccId,
        type: input.type,
        reason: input.reason,
        lat: input.lat,
        lng: input.lng,
      });
      // 23505 = the DB's partial unique index already has this trip/type
      // open — another detection pass beat us to it. Not an error.
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["live-exceptions"] }),
  });

  // Fire-and-forget: raise each detected condition once per trip, only if
  // nothing of that type is already open. Best-effort — this only runs
  // while a manager has this agent focused on the live map; there is no
  // background job in this architecture (see Known limitations).
  useEffect(() => {
    if (!focusedTrip || logException.isPending) return;
    if (deviation && !openTypesForTrip.has("route_deviation")) {
      logException.mutate({
        type: "route_deviation",
        reason: `${Math.round(deviation.distanceM)}m off the planned route.`,
        lat: deviation.lat,
        lng: deviation.lng,
      });
    } else if (unplannedStop && !openTypesForTrip.has("unplanned_stop")) {
      logException.mutate({
        type: "unplanned_stop",
        reason: "Stationary away from any known stop or the MCC.",
        lat: unplannedStop.lat,
        lng: unplannedStop.lng,
      });
    } else if (delayCandidate && !openTypesForTrip.has("delay")) {
      logException.mutate({
        type: "delay",
        reason: delayCandidate.reason,
        lat: focusedPing?.lat ?? null,
        lng: focusedPing?.lng ?? null,
      });
    } else if (gpsFailureCandidate && !openTypesForTrip.has(gpsFailureCandidate.type)) {
      logException.mutate({
        type: gpsFailureCandidate.type,
        reason: gpsFailureCandidate.reason,
        lat: focusedPing?.lat ?? null,
        lng: focusedPing?.lng ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    focusedTrip?.id,
    deviation,
    unplannedStop,
    delayCandidate,
    gpsFailureCandidate,
    openTypesForTrip,
  ]);

  const resolveException = useMutation({
    mutationFn: async (id: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("trip_exceptions")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: auth.user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["live-exceptions"] });
      toast.success("Exception resolved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell nav={MANAGER_NAV}>
      <PageHeading
        title="Live operations"
        subtitle={
          mcc
            ? `${mcc.name} · ${mcc.code} — agent positions and collections update in realtime.`
            : "No collection centre assigned to you yet."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Agents on route"
          value={active.length}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="GPS pings today"
          value={pingList.length}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Litres collected"
          value={litres.toFixed(1)}
          icon={<Milk className="h-4 w-4" />}
        />
        <StatCard label="Value today" value={formatCurrency(value)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="surface-card overflow-hidden p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 pt-1">
            <p className="text-sm text-muted-foreground">
              {focusedRouteId ? "Route for selected agent" : "All active route stops"} ·{" "}
              {routeStops.length} stops
            </p>
            <div className="flex items-center gap-2">
              {directions.data && (
                <Badge variant="secondary">
                  {km} km · {mins} min drive
                </Badge>
              )}
              <Button
                size="sm"
                variant={showDirections ? "default" : "outline"}
                disabled={routeStops.length === 0}
                onClick={() => setShowDirections((v) => !v)}
              >
                <Navigation className="mr-1 h-4 w-4" />
                {showDirections ? "Hide directions" : "Show directions"}
              </Button>
            </div>
          </div>
          {showDirections && directions.isError && (
            <p className="px-2 pb-2 text-xs text-destructive">
              {(directions.error as Error).message}
            </p>
          )}
          <ClientOnly
            fallback={
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground lg:h-[560px]">
                Loading map…
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground lg:h-[560px]">
                  Loading map…
                </div>
              }
            >
              <LiveMap
                centre={centre ?? null}
                trips={tripList}
                pings={pingList}
                points={points ?? []}
                collections={collectionList}
                focusAgentId={focusAgentId}
                directionsPolyline={showDirections ? (directions.data?.polyline ?? null) : null}
              />
            </Suspense>
          </ClientOnly>
        </div>

        <div className="space-y-4">
          <div className="surface-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Agents today</h2>
              {focusAgentId && (
                <Button size="sm" variant="ghost" onClick={() => setFocusAgentId(null)}>
                  Show all
                </Button>
              )}
            </div>
            <ul className="space-y-2">
              {tripList.map((trip) => {
                const ping = lastPingFor(trip.agent_id);
                const stop = (points ?? []).find((p) => p.id === trip.current_route_point_id);
                const live = classifyLiveStatus(ping?.recorded_at ?? null);
                return (
                  <li
                    key={trip.id}
                    className={`cursor-pointer rounded-lg border border-border p-3 transition-colors hover:bg-secondary ${
                      focusAgentId === trip.agent_id ? "bg-primary-soft" : ""
                    }`}
                    onClick={() =>
                      setFocusAgentId(focusAgentId === trip.agent_id ? null : trip.agent_id)
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{trip.agents?.full_name ?? "Agent"}</p>
                      <Badge variant={trip.status === "in_progress" ? "default" : "secondary"}>
                        {trip.status === "in_progress" ? "On route" : trip.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {trip.routes?.name ?? "Route"} · {trip.session} · started{" "}
                      {timeAgo(trip.started_at)}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPinned className="h-3 w-3" />
                      {stop ? `At ${stop.name}` : "No stop marked"}
                    </p>
                    <p
                      className={`mt-1 flex items-center gap-1 text-xs font-medium ${
                        live.isLive ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      <Radio className="h-3 w-3" />
                      {live.isLive ? "LIVE" : "LOCATION STALE"} · {live.label}
                    </p>
                  </li>
                );
              })}
              {tripList.length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">
                  No trips started today.
                </li>
              )}
            </ul>
          </div>

          {focusedTrip && (
            <div className="surface-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">{focusedTrip.agents?.full_name ?? "Agent"}</h2>
                <span
                  className={`flex items-center gap-1 text-xs font-semibold ${
                    focusedLive.isLive ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  <Radio className="h-3 w-3" />
                  {focusedLive.isLive ? "LIVE" : "STALE"}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Route</dt>
                <dd className="text-right font-medium">{focusedTrip.routes?.name ?? "—"}</dd>

                <dt className="text-muted-foreground">Current location</dt>
                <dd className="text-right font-medium">
                  {focusedPing?.lat != null && focusedPing?.lng != null
                    ? `${focusedPing.lat.toFixed(4)}, ${focusedPing.lng.toFixed(4)}`
                    : "—"}
                </dd>

                <dt className="text-muted-foreground">Current farmer</dt>
                <dd className="text-right font-medium">{currentFarmer?.full_name ?? "—"}</dd>

                <dt className="text-muted-foreground">Next farmer</dt>
                <dd className="text-right font-medium">{upcomingFarmer?.full_name ?? "—"}</dd>

                <dt className="flex items-center gap-1 text-muted-foreground">
                  <Gauge className="h-3 w-3" /> Speed
                </dt>
                <dd className="text-right font-medium">
                  {focusedPing?.speed_kmh != null
                    ? `${focusedPing.speed_kmh.toFixed(0)} km/h`
                    : "—"}
                </dd>

                <dt className="text-muted-foreground">Distance to next</dt>
                <dd className="text-right font-medium">
                  {distanceToNextM != null ? `${(distanceToNextM / 1000).toFixed(2)} km` : "—"}
                </dd>

                <dt className="text-muted-foreground">Farmers completed</dt>
                <dd className="text-right font-medium">
                  {farmersCompleted} / {farmersTotal}
                </dd>

                <dt className="text-muted-foreground">Farmers remaining</dt>
                <dd className="text-right font-medium">
                  {Math.max(farmersTotal - farmersCompleted, 0)}
                </dd>

                <dt className="text-muted-foreground">Milk collected</dt>
                <dd className="text-right font-medium">{litresThisTrip.toFixed(1)} L</dd>

                <dt className="text-muted-foreground">Last update</dt>
                <dd className="text-right font-medium">{focusedLive.label}</dd>
              </dl>

              {/* LIVE TRACKING PLAN — PHASE 6: arrival / departure / stop duration for the current stop */}
              {currentFarmerPoint && (
                <div className="mt-3 rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    Current stop — {currentFarmerPoint.name}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-muted-foreground">Arrived</dt>
                    <dd className="text-right font-medium">
                      {currentStopVisit?.arrivedAt ? formatClock(currentStopVisit.arrivedAt) : "—"}
                    </dd>

                    <dt className="text-muted-foreground">Collection completed</dt>
                    <dd className="text-right font-medium">
                      {lastCollectionAt ? formatClock(lastCollectionAt) : "—"}
                    </dd>

                    <dt className="text-muted-foreground">Departed</dt>
                    <dd className="text-right font-medium">
                      {currentStopVisit?.departedAt
                        ? formatClock(currentStopVisit.departedAt)
                        : currentStopVisit?.arrivedAt
                          ? "Still here"
                          : "—"}
                    </dd>

                    <dt className="text-muted-foreground">Stop duration</dt>
                    <dd className="text-right font-medium">
                      {currentStopDurationSec != null
                        ? formatDurationShort(currentStopDurationSec)
                        : "—"}
                    </dd>

                    <dt className="text-muted-foreground">Travel time to reach</dt>
                    <dd className="text-right font-medium">
                      {travelTimeToCurrentSec != null
                        ? formatDurationShort(travelTimeToCurrentSec)
                        : "—"}
                    </dd>
                  </dl>
                  {!currentStopVisit?.arrivedAt && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No GPS confirmation of arrival at this stop yet.
                    </p>
                  )}
                </div>
              )}

              {/* LIVE TRACKING PLAN — PHASE 5: schedule / ETA / delay for the next stop */}
              {upcomingFarmer && (
                <div className="mt-3 rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    Next stop — {upcomingFarmer.full_name}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-muted-foreground">Scheduled</dt>
                    <dd className="text-right font-medium">
                      {nextScheduledAt ? formatClock(nextScheduledAt) : "—"}
                    </dd>

                    <dt className="text-muted-foreground">Predicted</dt>
                    <dd className="text-right font-medium">
                      {etaToNext.isFetching && !predictedNextArrival
                        ? "Calculating…"
                        : predictedNextArrival
                          ? formatClock(predictedNextArrival)
                          : "—"}
                    </dd>

                    <dt className="text-muted-foreground">Delay</dt>
                    <dd className="text-right font-medium">
                      {nextDelayMin != null ? formatDelay(nextDelayMin) : "—"}
                    </dd>
                  </dl>
                  {nextTimingStatus && (
                    <Badge
                      className="mt-2"
                      variant={
                        nextTimingStatus === "ON_TIME"
                          ? "default"
                          : nextTimingStatus === "SLIGHTLY_LATE"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {TIMING_STATUS_LABEL[nextTimingStatus]}
                    </Badge>
                  )}
                </div>
              )}

              {/* LIVE TRACKING PLAN — PHASE 5: MCC ETA, once the route is done/near-done */}
              {nearMccPhase && (
                <div className="mt-3 rounded-lg border border-primary/30 bg-primary-soft p-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    Heading to {mcc?.name ?? "MCC"}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-muted-foreground">Distance to MCC</dt>
                    <dd className="text-right font-medium">
                      {mccEta.data ? `${(mccEta.data.distanceMeters / 1000).toFixed(1)} km` : "—"}
                    </dd>

                    <dt className="text-muted-foreground">Travel time</dt>
                    <dd className="text-right font-medium">
                      {mccEta.data ? `${Math.round(mccEta.data.durationSeconds / 60)} min` : "—"}
                    </dd>

                    <dt className="text-muted-foreground">MCC ETA</dt>
                    <dd className="text-right font-medium">
                      {mccEta.isFetching && !mccEtaAt
                        ? "Calculating…"
                        : mccEtaAt
                          ? formatClock(mccEtaAt)
                          : "—"}
                    </dd>

                    <dt className="text-muted-foreground">Scheduled arrival</dt>
                    <dd className="text-right font-medium">
                      {scheduledMccAt ? formatClock(scheduledMccAt) : "—"}
                    </dd>

                    <dt className="text-muted-foreground">Expected delay</dt>
                    <dd className="text-right font-medium">
                      {mccDelayMin != null ? formatDelay(mccDelayMin) : "—"}
                    </dd>
                  </dl>
                </div>
              )}

              {/* LIVE TRACKING PLAN — PHASE 7: open exceptions for this trip */}
              {openExceptionsForTrip.length > 0 && (
                <div className="mt-3 rounded-lg border border-destructive/30 p-3">
                  <p className="mb-2 text-xs font-semibold text-destructive">
                    Open exceptions ({openExceptionsForTrip.length})
                  </p>
                  <ul className="space-y-2">
                    {openExceptionsForTrip.map((e) => (
                      <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                        <div>
                          <p className="font-medium">
                            {exceptionLabel(e.type)}
                            {isAutoExceptionType(e.type) && (
                              <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                                auto-detected
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {e.reason ?? "—"} · {timeAgo(e.created_at)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          disabled={resolveException.isPending}
                          onClick={() => resolveException.mutate(e.id)}
                        >
                          Resolve
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="surface-card p-4">
            <h2 className="mb-3 font-semibold">Live collection feed</h2>
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {collectionList.slice(0, 25).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">{c.farmers?.full_name ?? "Farmer"}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.agents?.full_name ?? "Centre"} · {timeAgo(c.collected_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{Number(c.quantity_litres).toFixed(1)} L</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(Number(c.total_amount ?? 0))}
                    </p>
                  </div>
                  {Number(c.risk_score ?? 0) >= 40 && <Badge variant="destructive">Suspect</Badge>}
                </li>
              ))}
              {collectionList.length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">
                  No collections recorded today yet.
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
