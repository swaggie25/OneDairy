import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Fingerprint,
  Navigation,
  CloudOff,
  Milk,
  CheckCircle2,
  RefreshCw,
  MapPinned,
  AlertTriangle,
  LocateFixed,
  ShieldCheck,
  IndianRupee,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAgentContext } from "@/hooks/useAgentContext";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { useTrackingSession, TRACKING_FAILURE_MESSAGES } from "@/hooks/useTrackingSession";
import { useActiveTrackingSession } from "@/hooks/useActiveTrackingSession";
import { useLiveLocation } from "@/hooks/useLiveLocation";
import { useGpsSync } from "@/hooks/useGpsSync";
import { useCentreLocation, useMccTimingConfig, useRoutePoints } from "@/hooks/useLiveOps";
import { getCoords } from "@/lib/geo";
import { formatCurrency } from "@/lib/pricing";
import { requireRole } from "@/lib/route-guards";
import { computeRoute } from "@/lib/maps.functions";
import {
  classifyTimingStatus,
  cumulativeOffsetsSeconds,
  addSeconds,
  minutesBetween,
  formatClock,
  formatDelay,
  TIMING_STATUS_LABEL,
  type TimingStatus,
} from "@/lib/route-intelligence";

export const Route = createFileRoute("/_authenticated/agent")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["agent"]),
  head: () => ({
    meta: [
      { title: "Agent home — DairyOne field collection" },
      {
        name: "description",
        content:
          "Punch GPS attendance, start your milk collection trip and track today's litres — works offline.",
      },
      { property: "og:title", content: "Agent home — DairyOne field collection" },
      {
        property: "og:description",
        content: "GPS attendance, route trips and offline milk entry for collection agents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentHome,
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

function AgentHome() {
  const { data: user } = useCurrentUser();
  const { data: agent, isLoading: agentLoading } = useAgentContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pending, online, flush } = useOfflineQueue();
  const gpsSync = useGpsSync();
  const trackingSession = useTrackingSession();
  // trackingSession.sessionId only exists in memory for the Punch In that
  // just happened on this page load; useActiveTrackingSession re-resolves
  // it from the DB so a reload mid-shift still finds the live session.
  const { data: resumedSession } = useActiveTrackingSession(agent?.agentId ?? null);
  const activeSessionId = trackingSession.sessionId ?? resumedSession?.id ?? null;
  const activeSessionStatus = trackingSession.sessionId
    ? trackingSession.status
    : (resumedSession?.status ?? null);

  const { data: attendance } = useQuery({
    queryKey: ["attendance-today", agent?.agentId],
    enabled: Boolean(agent?.agentId),
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("id, punch_in_at, punch_out_at")
        .eq("agent_id", agent!.agentId)
        .gte("punch_in_at", `${today()}T00:00:00Z`)
        .order("punch_in_at", { ascending: false })
        .maybeSingle();
      return data;
    },
  });

  const { data: trip } = useQuery({
    queryKey: ["active-trip", agent?.agentId],
    enabled: Boolean(agent?.agentId),
    queryFn: async () => {
      // Look for ANY open trip for this agent, not just today's. A trip that
      // was never closed out (e.g. app closed mid-route) must still be found
      // here, otherwise startTrip below can't see it and will insert a
      // duplicate in_progress row instead of resuming the old one.
      const { data } = await supabase
        .from("route_trips")
        .select("id, status, route_id, started_at")
        .eq("agent_id", agent!.agentId)
        .eq("status", "in_progress")
        .eq("trip_type", "assigned")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  /*
   * LIVE TRACKING PLAN — PHASE 3
   *
   * GPS collection begins the moment the tracking session goes ACTIVE
   * (i.e. right after Punch In succeeds and a GPS fix is acquired) rather
   * than waiting for "Start trip" — this closes the Phase 2→3 gap: Phase 2
   * already models tracking as starting at Punch In, but nothing was
   * writing gps_pings until a trip existed. trip.tsx/route-marking.tsx keep
   * their own useLiveLocation calls running too (each supplies its own
   * trip_id/route_point_id context); duplicate writes across mounted pages
   * aren't a concern in practice since only one of these routes is ever
   * mounted at a time.
   */
  useLiveLocation({
    enabled: activeSessionStatus === "ACTIVE",
    tripId: trip?.id ?? null,
    trackingSessionId: activeSessionId,
    agentId: agent?.agentId ?? null,
    mccId: agent?.mccId ?? null,
    routePointId: null,
  });

  const { data: totals } = useQuery({
    queryKey: ["agent-today-totals", agent?.agentId],
    enabled: Boolean(agent?.agentId),
    queryFn: async () => {
      const { data } = await supabase
        .from("milk_collections")
        .select("quantity_litres, total_amount")
        .eq("agent_id", agent!.agentId)
        .gte("collected_at", `${today()}T00:00:00Z`);
      return {
        litres: (data ?? []).reduce((s, r) => s + Number(r.quantity_litres ?? 0), 0),
        amount: (data ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0),
        entries: data?.length ?? 0,
      };
    },
  });

  const { data: openExceptions } = useQuery({
    queryKey: ["agent-open-exceptions", agent?.agentId],
    enabled: Boolean(agent?.agentId),
    queryFn: async () => {
      const { count } = await supabase
        .from("trip_exceptions")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent!.agentId)
        .eq("status", "open")
        .gte("created_at", `${today()}T00:00:00Z`);
      return count ?? 0;
    },
  });

  // Next action: the first farmer on the active trip's route who is neither
  // collected nor already excused via an exception.
  const { data: nextFarmer } = useQuery({
    queryKey: ["agent-next-farmer", trip?.id],
    enabled: Boolean(trip?.id && trip.route_id),
    queryFn: async () => {
      const { data: points } = await supabase
        .from("route_points")
        .select("id, sequence, route_point_farmers(farmer_id, sequence, farmers(full_name))")
        .eq("route_id", trip!.route_id as string)
        .order("sequence");
      const [{ data: collections }, { data: excepted }] = await Promise.all([
        supabase.from("milk_collections").select("farmer_id").eq("trip_id", trip!.id),
        supabase
          .from("trip_exceptions")
          .select("farmer_id")
          .eq("trip_id", trip!.id)
          .not("farmer_id", "is", null),
      ]);
      const resolved = new Set([
        ...(collections ?? []).map((c) => c.farmer_id),
        ...(excepted ?? []).map((e) => e.farmer_id as string),
      ]);
      for (const point of points ?? []) {
        const farmers = [...(point.route_point_farmers ?? [])].sort(
          (a, b) => a.sequence - b.sequence,
        );
        for (const f of farmers) {
          if (!resolved.has(f.farmer_id)) {
            return { name: f.farmers?.full_name ?? null, pointId: point.id as string };
          }
        }
      }
      return null;
    },
  });

  /*
   * TIME PERFORMANCE — surfaces the same road-routing ETA/delay math the
   * Manager's live map already uses (route-intelligence.ts, Phase 5) on the
   * Agent's own home screen, so the agent never has to guess whether
   * they're ahead, on time, at risk, or delayed. Reuses the existing
   * mcc_centres-configured thresholds; no new tables, no hard-coded
   * schedule — same "derive scheduled time from actual trip start + real
   * driving time" design already established for the manager view.
   */
  const centre = useCentreLocation(agent?.mccId);
  const timingConfig = useMccTimingConfig(agent?.mccId);
  const { data: mccRoutePoints } = useRoutePoints(agent?.mccId);
  const routeStopsFull = useMemo(
    () =>
      (mccRoutePoints ?? [])
        .filter((p) => p.route_id === trip?.route_id && p.lat != null && p.lng != null)
        .sort((a, b) => a.sequence - b.sequence),
    [mccRoutePoints, trip?.route_id],
  );
  const nextFarmerPoint = routeStopsFull.find((p) => p.id === nextFarmer?.pointId) ?? null;

  const startPoint =
    centre.data?.lat != null && centre.data.lng != null
      ? { lat: centre.data.lat, lng: centre.data.lng }
      : routeStopsFull[0]
        ? { lat: routeStopsFull[0].lat!, lng: routeStopsFull[0].lng! }
        : null;

  const runComputeRoute = useServerFn(computeRoute);

  // One computeRoute call across the whole route (same call shape as
  // live.tsx) to derive each stop's real-driving-time "scheduled" arrival
  // from this trip's actual started_at.
  const directions = useQuery({
    queryKey: [
      "agent-directions",
      trip?.route_id,
      routeStopsFull.length,
      startPoint?.lat,
      startPoint?.lng,
    ],
    enabled: Boolean(trip?.status === "in_progress" && startPoint && routeStopsFull.length > 0),
    staleTime: 300_000,
    retry: false,
    queryFn: () =>
      runComputeRoute({
        data: {
          origin: startPoint!,
          destination: {
            lat: routeStopsFull[routeStopsFull.length - 1]!.lat!,
            lng: routeStopsFull[routeStopsFull.length - 1]!.lng!,
          },
          waypoints: routeStopsFull.slice(0, -1).map((p) => ({ lat: p.lat!, lng: p.lng! })),
        },
      }),
  });

  const scheduledOffsetByPointId = useMemo(() => {
    const map = new Map<string, number>();
    if (!directions.data) return map;
    const offsets = cumulativeOffsetsSeconds(directions.data.legs);
    routeStopsFull.forEach((p, i) => {
      if (offsets[i] != null) map.set(p.id, offsets[i]!);
    });
    return map;
  }, [directions.data, routeStopsFull]);

  const nextScheduledAt = useMemo(() => {
    if (!trip?.started_at || !nextFarmerPoint) return null;
    const offset = scheduledOffsetByPointId.get(nextFarmerPoint.id);
    return offset != null ? addSeconds(trip.started_at, offset) : null;
  }, [trip?.started_at, nextFarmerPoint, scheduledOffsetByPointId]);

  // Live ETA from the agent's current GPS fix to the next stop, refreshed
  // periodically (not on every render) — same cadence as live.tsx.
  const nextStopDest =
    nextFarmerPoint?.lat != null && nextFarmerPoint?.lng != null
      ? { lat: nextFarmerPoint.lat, lng: nextFarmerPoint.lng }
      : null;
  const etaToNext = useQuery({
    queryKey: ["agent-eta-next", nextFarmerPoint?.id],
    enabled: trip?.status === "in_progress" && Boolean(nextStopDest),
    staleTime: 30_000,
    refetchInterval: 45_000,
    retry: false,
    queryFn: async () => {
      const coords = await getCoords();
      return runComputeRoute({ data: { origin: coords, destination: nextStopDest! } });
    },
  });

  const predictedNextArrival = etaToNext.data
    ? new Date(Date.now() + etaToNext.data.durationSeconds * 1000)
    : null;
  const nextDelayMin =
    nextScheduledAt && predictedNextArrival
      ? minutesBetween(nextScheduledAt, predictedNextArrival)
      : null;
  const nextTimingStatus: TimingStatus | null =
    nextDelayMin != null
      ? classifyTimingStatus(
          nextDelayMin,
          timingConfig.data?.onTimeThresholdMin ?? 5,
          timingConfig.data?.delayedThresholdMin ?? 15,
        )
      : null;
  const TIMING_STATUS_TO_BADGE: Record<TimingStatus, Status> = {
    ON_TIME: "success",
    SLIGHTLY_LATE: "warning",
    DELAYED: "danger",
  };

  const punch = useMutation({
    mutationFn: async () => {
      const coords = await getCoords();
      if (attendance && !attendance.punch_out_at) {
        const { error } = await supabase
          .from("attendance")
          .update({
            punch_out_at: new Date().toISOString(),
            punch_out_lat: coords.lat,
            punch_out_lng: coords.lng,
          })
          .eq("id", attendance.id);
        if (error) throw error;
        // Architecture only for now (Phase 2 scope): mark the tracking
        // session for this shift as done. Full "stop tracking" behaviour
        // (e.g. tearing down an in-flight watchPosition on trip.tsx) is
        // handled where the watch actually lives, not here.
        await trackingSession.completeSession(attendance.id, coords);
        return "out" as const;
      }
      const { data, error } = await supabase
        .from("attendance")
        .insert({
          agent_id: agent!.agentId,
          mcc_id: agent!.mccId,
          route_id: agent!.routeId,
          punch_in_lat: coords.lat,
          punch_in_lng: coords.lng,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Punch In has already succeeded at this point — tracking init below
      // must never block or hide that. Any failure is surfaced separately
      // via trackingSession.status/failureReason (see the banner below),
      // never silently swallowed.
      await trackingSession.initSession({
        attendanceId: data.id,
        agentId: agent!.agentId,
        mccId: agent!.mccId,
        routeId: agent!.routeId,
        shift: agent!.shift,
      });
      return "in" as const;
    },
    onSuccess: async (kind) => {
      toast.success(kind === "in" ? "Punched in with GPS" : "Punched out. Have a good day!");
      await queryClient.invalidateQueries({ queryKey: ["attendance-today"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startTrip = useMutation({
    mutationFn: async () => {
      if (!agent?.routeId) throw new Error("No route assigned yet.");
      if (trip?.status === "in_progress") return trip.id;
      const { data, error } = await supabase
        .from("route_trips")
        .insert({
          agent_id: agent.agentId,
          mcc_id: agent.mccId,
          route_id: agent.routeId,
          route_assignment_id: agent.assignmentId,
          vehicle_type: agent.vehicleType ?? "bike",
          status: "in_progress",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["active-trip"] });
      navigate({ to: "/trip" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const punchedIn = Boolean(attendance && !attendance.punch_out_at);

  return (
    <AppShell mobileFirst>
      <PageHeading
        title={`Namaste${user?.fullName ? `, ${user.fullName}` : ""}`}
        subtitle={
          trip?.status === "in_progress" && nextFarmer?.name
            ? `Next: ${nextFarmer.name}`
            : trip?.status === "in_progress"
              ? "All farmers on this route are done."
              : agent?.routeName
                ? `Route: ${agent.routeName}`
                : "Punch in, then start your route."
        }
      />

      {!agentLoading && !agent && (
        <div className="surface-card mb-4 p-4 text-sm text-muted-foreground">
          Your agent profile isn't linked yet. Ask your Centre Manager to add you as an agent.
        </div>
      )}

      {/*
        TIME PERFORMANCE — the most important card on the screen (§5.3).
        Large status badge answers "am I ahead/on-time/at-risk/delayed" at a
        glance; the delay figure and next-stop context are a secondary line,
        not buried in prose the agent has to read while walking.
      */}
      {trip?.status === "in_progress" && nextFarmer?.name && (
        <div className="surface-card mb-3 p-4">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Time performance</p>
          {nextTimingStatus ? (
            <StatusBadge
              status={TIMING_STATUS_TO_BADGE[nextTimingStatus]}
              label={TIMING_STATUS_LABEL[nextTimingStatus]}
              detail={nextDelayMin != null ? formatDelay(nextDelayMin) : undefined}
              size="lg"
            />
          ) : (
            <StatusBadge status="muted" label="Calculating…" size="lg" />
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Next: {nextFarmer.name}
            {predictedNextArrival && ` · ETA ${formatClock(predictedNextArrival)}`}
          </p>
        </div>
      )}

      {/* NEXT ACTION — the one dominant CTA on the screen (§2, §5.3). Device
          check is a light-touch link, not a button, so it doesn't compete
          with Punch attendance for the agent's attention. */}
      <div className="mb-3 flex justify-center">
        <Link
          to="/device-check"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon icon={ShieldCheck} size="sm" className="text-current" />
          Device check
        </Link>
      </div>

      <div className="grid gap-3">
        <Button
          size="lg"
          className="touch-tile h-16 text-base shadow-soft"
          disabled={!agent || punch.isPending}
          onClick={() => punch.mutate()}
        >
          {punchedIn ? (
            <Icon icon={CheckCircle2} size="md" className="text-current" />
          ) : (
            <Icon icon={Fingerprint} size="md" className="text-current" />
          )}
          {punchedIn ? "Punch out" : "Punch attendance"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="touch-tile h-16 text-base"
          disabled={!agent || !punchedIn || startTrip.isPending}
          onClick={() =>
            trip?.status === "in_progress" ? navigate({ to: "/trip" }) : startTrip.mutate()
          }
        >
          <Icon icon={Navigation} size="md" className="text-current" />
          {trip?.status === "in_progress" ? "Continue trip" : "Start trip"}
        </Button>
        {!punchedIn && agent && (
          <p className="text-center text-xs text-muted-foreground">
            Punch attendance first to unlock your trip.
          </p>
        )}

        {/* Secondary navigation — grouped together at a lighter visual
            weight than the punch/trip actions above, so the hierarchy
            reads primary action → secondary action → navigation. */}
        <div className="mt-1 grid grid-cols-2 gap-3">
          <Button asChild size="lg" variant="ghost" className="h-12 text-sm">
            <Link to="/collections">
              <Icon icon={ListChecks} size="sm" className="text-current" />
              My collections
            </Link>
          </Button>
          {agent && (
            <Button asChild size="lg" variant="ghost" className="h-12 text-sm">
              <Link to="/route-marking">
                <Icon icon={MapPinned} size="sm" className="text-current" />
                Mark a new route
              </Link>
            </Button>
          )}
        </div>
      </div>

      {trackingSession.status === "DEGRADED" && trackingSession.failureReason && (
        <div className="surface-card mt-5 flex items-center gap-3 border-status-danger/30 bg-status-danger-soft p-4">
          <Icon icon={LocateFixed} size="md" tone="danger" />
          <p className="flex-1 text-sm text-muted-foreground">
            Punched in, but live tracking isn't active.{" "}
            {TRACKING_FAILURE_MESSAGES[trackingSession.failureReason]}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void trackingSession.retry()}>
            <Icon icon={RefreshCw} size="sm" className="text-current" />
          </Button>
        </div>
      )}

      {/* TODAY'S PERFORMANCE — compact stat strip, consistent numeral typography (§5.3). */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard
          label="Litres today"
          value={(totals?.litres ?? 0).toFixed(1)}
          icon={<Icon icon={Milk} size="sm" tone="active" />}
        />
        <StatCard
          label="Entries"
          value={totals?.entries ?? 0}
          icon={<Icon icon={ListChecks} size="sm" tone="active" />}
        />
        <StatCard
          label="Value"
          value={formatCurrency(totals?.amount ?? 0)}
          icon={<Icon icon={IndianRupee} size="sm" tone="active" />}
        />
      </div>

      {/*
        SYSTEM STATUS — persistent, low-profile strip, never a modal (§5.3,
        §5.11). Sync/connectivity/GPS/exceptions all render through the same
        StatusBadge + Icon system so they read consistently even though each
        comes from a different data source.
      */}
      <div className="surface-card mt-5 flex items-center gap-3 p-4">
        <Icon icon={CloudOff} size="md" tone={online ? "muted" : "warning"} />
        <p className="flex-1 text-sm text-muted-foreground">
          {online
            ? pending > 0
              ? `${pending} entries syncing…`
              : "All entries synced. Offline capture is ready if network drops."
            : `Offline — ${pending} entries saved on this phone. Your work is safely saved.`}
        </p>
        {pending > 0 && (
          <Button size="sm" variant="ghost" onClick={() => void flush()}>
            <Icon icon={RefreshCw} size="sm" className="text-current" />
          </Button>
        )}
      </div>

      {gpsSync.total > 0 && (
        <div
          className={`surface-card mt-3 flex items-center gap-3 p-4 ${
            gpsSync.status === "failed" ? "border-status-danger/30 bg-status-danger-soft" : ""
          }`}
        >
          <Icon
            icon={MapPinned}
            size="md"
            tone={
              gpsSync.status === "failed"
                ? "danger"
                : gpsSync.status === "synced"
                  ? "muted"
                  : "warning"
            }
          />
          <p className="flex-1 text-sm text-muted-foreground">
            {gpsSync.status === "failed"
              ? `Sync failed — ${gpsSync.failed} location point${gpsSync.failed === 1 ? "" : "s"} couldn't reach the server. Kept on this phone.`
              : gpsSync.status === "syncing"
                ? `Syncing ${gpsSync.syncing} location point${gpsSync.syncing === 1 ? "" : "s"}…`
                : gpsSync.status === "pending"
                  ? `Pending sync — ${gpsSync.pending} location point${gpsSync.pending === 1 ? "" : "s"} saved on this phone.`
                  : "Location trail synced."}
          </p>
          {(gpsSync.status === "failed" || gpsSync.status === "pending") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void (gpsSync.status === "failed" ? gpsSync.retryFailed() : gpsSync.flush())
              }
            >
              <Icon icon={RefreshCw} size="sm" className="text-current" />
            </Button>
          )}
        </div>
      )}

      {Boolean(openExceptions) && (
        <div className="surface-card mt-3 flex items-center gap-3 border-status-warning/30 bg-status-warning-soft p-4">
          <Icon icon={AlertTriangle} size="md" tone="warning" />
          <p className="flex-1 text-sm text-muted-foreground">
            {openExceptions} open exception{openExceptions === 1 ? "" : "s"} logged today.
          </p>
        </div>
      )}

      {!agent?.routeId && agent && (
        <div className="surface-card mt-5 flex flex-col items-center p-8 text-center">
          <Icon icon={Milk} size="xl" tone="active" />
          <p className="mt-2 text-sm text-muted-foreground">
            No route assigned yet. Your Centre Manager will assign one.
          </p>
        </div>
      )}
    </AppShell>
  );
}
