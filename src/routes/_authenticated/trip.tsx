import { Suspense, lazy, useState } from "react";
import { createFileRoute, ClientOnly, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  Home,
  Navigation2,
  QrCode,
  AlertTriangle,
  CloudOff,
  Phone,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { StopPin, type StopState } from "@/components/ui/stop-pin";
import { SegmentedProgress } from "@/components/ui/segmented-progress";

import { MilkEntryForm, type MilkEntryTarget } from "@/components/milk-entry-form";
import type { TripStop } from "@/components/agent-trip-map";

import { useAgentContext } from "@/hooks/useAgentContext";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { useLiveLocation } from "@/hooks/useLiveLocation";
import { useGpsSync } from "@/hooks/useGpsSync";
import { useActiveTrackingSession } from "@/hooks/useActiveTrackingSession";
import { getCoords } from "@/lib/geo";
import { computeRoute } from "@/lib/maps.functions";
import { QrScanner } from "@/components/qr-scanner";
import { cardCodeFor } from "@/lib/qr";
import { exceptionLabel } from "@/lib/exceptions";
import { requireRole } from "@/lib/route-guards";

const AgentTripMap = lazy(() => import("@/components/agent-trip-map"));

/** Opens native turn-by-turn navigation, the same one-tap pattern delivery-partner apps use. */
function navigationUrl(dest: { lat: number; lng: number }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`;
}

export const Route = createFileRoute("/_authenticated/trip")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["agent"]),
  head: () => ({
    meta: [
      { title: "Live trip — DairyOne field collection" },
      {
        name: "description",
        content:
          "Work your route stop by stop: farmer lists, milk entry with auto rate, GPS log and offline sync.",
      },
    ],
  }),
  component: TripScreen,
});

type Farmer = {
  id: string;
  full_name: string;
  farmer_code: string;
  village: string | null;
  phone: string | null;
};

type RoutePoint = {
  id: string;
  name: string;
  sequence: number;
  lat: number | null;
  lng: number | null;
};

type Assignment = {
  id: string;
  route_point_id: string;
  farmer_id: string;
  sequence: number;
};

type PointWithFarmers = RoutePoint & {
  farmers: Farmer[];
};

function TripScreen() {
  const { data: agent } = useAgentContext();

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { pending, online } = useOfflineQueue();
  const gpsSync = useGpsSync();

  const [openPoint, setOpenPoint] = useState<string | null>(null);

  const [target, setTarget] = useState<MilkEntryTarget | null>(null);

  const [scanOpen, setScanOpen] = useState(false);

  // PHASE 1 §5 — Exception Basics. `exceptionTarget` is either a farmer
  // (unavailable/skipped) or null with routePointId set (route issue/other).
  const [exceptionTarget, setExceptionTarget] = useState<{
    farmerId: string | null;
    farmerName: string | null;
    routePointId: string | null;
  } | null>(null);
  const [exceptionType, setExceptionType] = useState("farmer_unavailable");
  const [exceptionReason, setExceptionReason] = useState("");

  // ITEM 5 — after a point/route-level "Report issue" is logged, ask the
  // agent whether to divert (navigate on) or keep working the current stop,
  // instead of leaving them to figure out what to do next on their own.
  const [postIssuePrompt, setPostIssuePrompt] = useState(false);

  // PHASE 3 — Route Completion Summary shown before the Agent commits to
  // closing the trip, so "Proceed to MCC" is a deliberate step with the
  // day's numbers in front of them, not a silent status flip.
  const [completionOpen, setCompletionOpen] = useState(false);

  /*
   * ACTIVE TRIP
   */

  const {
    data: trip,
    isLoading: tripLoading,
    error: tripError,
  } = useQuery({
    queryKey: ["active-trip", agent?.agentId],

    enabled: Boolean(agent?.agentId),

    queryFn: async () => {
      if (!agent?.agentId) return null;

      const { data, error } = await supabase
        .from("route_trips")
        .select(
          `
          id,
          route_id,
          status,
          current_route_point_id,
          started_at
        `,
        )
        .eq("agent_id", agent.agentId)
        .eq("status", "in_progress")
        .order("created_at", {
          ascending: false,
        })
        // Defensive: there should only ever be one in_progress trip per agent
        // (enforced by a DB unique index), but .limit(1) guarantees this query
        // can never throw PGRST116 even if that invariant is ever violated.
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("ACTIVE TRIP ERROR:", error);
        throw error;
      }

      return data;
    },
  });

  /*
   * ROUTE POINTS
   *
   * We fetch ONLY points here.
   * Do not depend on nested Supabase relations.
   */

  const {
    data: routePoints = [],
    isLoading: pointsLoading,
    error: pointsError,
  } = useQuery({
    queryKey: ["trip-route-points", trip?.route_id],

    enabled: Boolean(trip?.route_id),

    queryFn: async () => {
      if (!trip?.route_id) return [];

      const { data, error } = await supabase
        .from("route_points")
        .select(
          `
          id,
          name,
          sequence,
          lat,
          lng
        `,
        )
        .eq("route_id", trip.route_id)
        .order("sequence");

      if (error) {
        console.error("ROUTE POINTS ERROR:", error);
        throw error;
      }

      return (data ?? []) as RoutePoint[];
    },
  });

  /*
   * FARMER ASSIGNMENTS
   *
   * Fetch all farmer <-> route point mappings separately.
   */

  const pointIds = routePoints.map((point) => point.id);

  const {
    data: assignments = [],
    isLoading: assignmentsLoading,
    error: assignmentsError,
  } = useQuery({
    queryKey: ["trip-farmer-assignments", trip?.route_id, pointIds],

    enabled: pointIds.length > 0,

    queryFn: async () => {
      if (pointIds.length === 0) return [];

      const { data, error } = await supabase
        .from("route_point_farmers")
        .select(
          `
          id,
          route_point_id,
          farmer_id,
          sequence
        `,
        )
        .in("route_point_id", pointIds)
        .order("sequence");

      if (error) {
        console.error("ROUTE POINT FARMERS ERROR:", error);

        throw error;
      }

      return (data ?? []) as Assignment[];
    },
  });

  /*
   * FARMERS
   *
   * Fetch farmer records separately.
   */

  const farmerIds = assignments.map((assignment) => assignment.farmer_id);

  const {
    data: farmers = [],
    isLoading: farmersLoading,
    error: farmersError,
  } = useQuery({
    queryKey: ["trip-farmers", farmerIds],

    enabled: farmerIds.length > 0,

    queryFn: async () => {
      if (farmerIds.length === 0) return [];

      const { data, error } = await supabase
        .from("farmers")
        .select(
          `
          id,
          full_name,
          farmer_code,
          village,
          phone
        `,
        )
        .in("id", farmerIds)
        .eq("status", "active")
        .order("full_name");

      if (error) {
        console.error("FARMERS ERROR:", error);
        throw error;
      }

      return (data ?? []) as Farmer[];
    },
  });

  /*
   * BUILD POINT + FARMERS STRUCTURE
   */

  const points: PointWithFarmers[] = routePoints.map((point) => {
    const pointAssignments = assignments
      .filter((assignment) => assignment.route_point_id === point.id)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

    const pointFarmers = pointAssignments
      .map((assignment) => farmers.find((farmer) => farmer.id === assignment.farmer_id))
      .filter((farmer): farmer is Farmer => Boolean(farmer));

    return {
      ...point,
      farmers: pointFarmers,
    };
  });

  /*
   * TODAY COLLECTIONS
   */

  const { data: todayCollections = [] } = useQuery({
    queryKey: ["trip-collections", trip?.id],

    enabled: Boolean(trip?.id),

    queryFn: async () => {
      if (!trip?.id) return [];

      const { data, error } = await supabase
        .from("milk_collections")
        .select(
          `
          id,
          farmer_id,
          quantity_litres,
          total_amount
        `,
        )
        .eq("trip_id", trip.id);

      if (error) {
        console.error("TRIP COLLECTION ERROR:", error);
        throw error;
      }

      return data ?? [];
    },
  });

  const collectedFarmers = new Set(todayCollections.map((collection) => collection.farmer_id));

  const totalLitres = todayCollections.reduce(
    (sum, collection) => sum + Number(collection.quantity_litres ?? 0),
    0,
  );

  /*
   * TRIP EXCEPTIONS — farmer unavailable/skipped resolves a stop without a
   * collection; route issue/other are trip-level and don't block anything.
   */

  const { data: exceptions = [] } = useQuery({
    queryKey: ["trip-exceptions", trip?.id],
    enabled: Boolean(trip?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_exceptions")
        .select("id, farmer_id, route_point_id, type, reason, status")
        .eq("trip_id", trip!.id);
      if (error) {
        console.error("TRIP EXCEPTIONS ERROR:", error);
        throw error;
      }
      return data ?? [];
    },
  });

  const exceptedFarmers = new Set(
    exceptions.filter((e) => e.farmer_id).map((e) => e.farmer_id as string),
  );
  const openExceptionCount = exceptions.filter((e) => e.status === "open").length;
  // Purely a display-layer derivation from the exceptions already fetched
  // above — no new query, no schema change. Used to mark a stop's pin as
  // "problem" (map + timeline) when it has an open, unresolved exception.
  const openExceptionPointIds = new Set(
    exceptions
      .filter((e) => e.status === "open" && e.route_point_id)
      .map((e) => e.route_point_id as string),
  );

  const logException = useMutation({
    mutationFn: async () => {
      if (!trip || !agent || !exceptionTarget) return;
      const { error } = await supabase.from("trip_exceptions").insert({
        trip_id: trip.id,
        agent_id: agent.agentId,
        mcc_id: agent.mccId,
        route_point_id: exceptionTarget.routePointId,
        farmer_id: exceptionTarget.farmerId,
        type: exceptionType,
        reason: exceptionReason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exception logged");
      const wasPointLevel = Boolean(exceptionTarget && !exceptionTarget.farmerId);
      setExceptionTarget(null);
      setExceptionReason("");
      void queryClient.invalidateQueries({ queryKey: ["trip-exceptions"] });
      if (wasPointLevel) setPostIssuePrompt(true);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // BUGFIX — route/point-level "Report issue" was inserting correctly (the
  // toast just faded away), but nothing on the Trip screen ever showed the
  // report afterwards: a stop's "problem" pin is masked by "current" while
  // it's the stop you're standing at (see tripStops below), so the exact
  // stop you just reported on never visibly changed. This resolves that —
  // open point-level reports for the current stop are now listed right in
  // its card, with a way to mark them fixed once actually resolved.
  const resolvePointException = useMutation({
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
      toast.success("Marked fixed");
      void queryClient.invalidateQueries({ queryKey: ["trip-exceptions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /*
   * ALL FARMERS FOR QR SCANNING
   */

  const allFarmers = points.flatMap((point) =>
    point.farmers.map((farmer) => ({
      id: farmer.id,
      full_name: farmer.full_name,
      farmer_code: farmer.farmer_code,
      pointId: point.id,
    })),
  );

  /*
   * LIVE LOCATION
   *
   * Continuously tracks the device (like a delivery-partner app) while the
   * trip is active, throttling writes to gps_pings so the manager's live
   * map updates in near real time, and giving us fresh coords locally for
   * in-app distance/ETA and the mini route map below.
   */

  const { data: activeSession } = useActiveTrackingSession(agent?.agentId ?? null);

  const { coords: livePos } = useLiveLocation({
    enabled: Boolean(trip?.id && agent),
    tripId: trip?.id ?? null,
    trackingSessionId: activeSession?.id ?? null,
    agentId: agent?.agentId ?? null,
    mccId: agent?.mccId ?? null,
    routePointId: trip?.current_route_point_id ?? null,
  });

  /*
   * CURRENT STOP (Zepto/Blinkit-style: one stop front-and-centre, rest as a stepper)
   *
   * A stop is "done" once every farmer assigned to it has a collection
   * logged. The first stop that isn't done is the one the agent is working
   * toward right now.
   */

  const stopStatus = (point: PointWithFarmers): "done" | "upcoming" | "problem" => {
    // BUGFIX — a stop with zero farmers assigned (e.g. "Point C — Alai" in
    // your live route) could never reach "done": the check below required
    // farmers.length > 0, so an empty stop stayed "upcoming"/"problem"
    // forever and would eventually become the permanent currentStop with
    // nothing to collect and no way to move past it. Zero farmers now
    // means nothing to do here, so it's immediately done.
    if (
      point.farmers.length === 0 ||
      point.farmers.every((f) => collectedFarmers.has(f.id) || exceptedFarmers.has(f.id))
    ) {
      return "done";
    }
    return openExceptionPointIds.has(point.id) ? "problem" : "upcoming"; // resolved to "current" for the first incomplete one below
  };

  const firstIncompleteIndex = points.findIndex((p) => stopStatus(p) !== "done");

  const tripStops: TripStop[] = points.map((point, i) => ({
    id: point.id,
    name: point.name,
    sequence: point.sequence,
    lat: point.lat,
    lng: point.lng,
    status: i === firstIncompleteIndex ? "current" : stopStatus(point),
  }));

  const currentStop = firstIncompleteIndex >= 0 ? points[firstIncompleteIndex]! : null;

  // ITEM 5/6 — next stop by route sequence (not by completion state), used
  // both for the "divert to next stop?" prompt after reporting an issue,
  // and to tell the agent about farmer-less stops ahead so they know to
  // just carry on from wherever they are instead of detouring for nothing.
  const currentIndex = currentStop ? points.findIndex((p) => p.id === currentStop.id) : -1;
  const nextStop = currentIndex >= 0 ? (points[currentIndex + 1] ?? null) : null;
  const emptyStopsAhead = points.filter(
    (p, i) => p.farmers.length === 0 && (currentIndex < 0 || i >= currentIndex),
  );

  // Route/point-level (farmer_id null) exceptions logged against the stop
  // currently front-and-centre — see resolvePointException above.
  const currentStopIssues = currentStop
    ? exceptions.filter((e) => e.route_point_id === currentStop.id && !e.farmer_id)
    : [];

  // PART 1 §4 — a manager/owner can lock the stop sequence when assigning a
  // route; while locked, only the current stop's farmers can be collected
  // from the "All stops" list (the featured card above is always the
  // current stop anyway). Defaults to locked, matching the DB default.
  const sequenceLocked = agent?.sequenceLocked ?? true;

  const { data: centre } = useQuery({
    queryKey: ["trip-centre", agent?.mccId],
    enabled: Boolean(agent?.mccId),
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("mcc_centres")
        .select("name, lat, lng")
        .eq("id", agent!.mccId)
        .maybeSingle();
      return data;
    },
  });

  const originForEta = livePos
    ? { lat: livePos.lat, lng: livePos.lng }
    : centre?.lat != null && centre.lng != null
      ? { lat: centre.lat, lng: centre.lng }
      : null;

  const currentStopDest =
    currentStop?.lat != null && currentStop?.lng != null
      ? { lat: currentStop.lat, lng: currentStop.lng }
      : null;

  const runComputeRoute = useServerFn(computeRoute);
  const directions = useQuery({
    queryKey: [
      "trip-directions",
      currentStop?.id,
      originForEta ? Math.round(originForEta.lat * 2000) : null,
      originForEta ? Math.round(originForEta.lng * 2000) : null,
    ],
    enabled: Boolean(originForEta && currentStopDest),
    staleTime: 30_000,
    retry: false,
    queryFn: () =>
      runComputeRoute({
        data: { origin: originForEta!, destination: currentStopDest! },
      }),
  });

  const etaKm = directions.data ? (directions.data.distanceMeters / 1000).toFixed(1) : null;
  const etaMin = directions.data
    ? Math.max(1, Math.round(directions.data.durationSeconds / 60))
    : null;

  /*
   * ARRIVE AT POINT
   */

  const arrive = useMutation({
    mutationFn: async (pointId: string) => {
      if (!trip || !agent) return;

      const coords = await getCoords();

      const { error: gpsError } = await supabase.from("gps_pings").insert({
        trip_id: trip.id,
        agent_id: agent.agentId,
        mcc_id: agent.mccId,
        route_point_id: pointId,
        event_type: "arrival",
        lat: coords.lat,
        lng: coords.lng,
      });

      if (gpsError) {
        console.error("ARRIVAL GPS ERROR:", gpsError);
      }

      const { error } = await supabase
        .from("route_trips")
        .update({
          current_route_point_id: pointId,
        })
        .eq("id", trip.id);

      if (error) throw error;
    },

    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["active-trip"],
      });
    },

    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  /*
   * END TRIP
   */

  const proceedToMcc = useMutation({
    mutationFn: async () => {
      if (!trip || !agent) return;

      const coords = await getCoords();

      const { error: gpsError } = await supabase.from("gps_pings").insert({
        trip_id: trip.id,
        agent_id: agent.agentId,
        mcc_id: agent.mccId,
        event_type: "return_to_mcc",
        lat: coords.lat,
        lng: coords.lng,
      });

      if (gpsError) {
        console.error("RETURN GPS ERROR:", gpsError);
      }

      const { error } = await supabase
        .from("route_trips")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
        })
        .eq("id", trip.id);

      if (error) throw error;

      // PHASE 3 — declare the handover now that the route is closed. This is
      // idempotent server-side (create_mcc_handover returns the existing row
      // on retry), so a flaky network here can never create two handovers
      // for the same trip.
      const { error: handoverError } = await supabase.rpc("create_mcc_handover", {
        p_trip_id: trip.id,
      });

      if (handoverError) throw handoverError;
    },

    onSuccess: async () => {
      toast.success("Trip closed. Handover declared at the centre.");

      await queryClient.invalidateQueries({
        queryKey: ["active-trip"],
      });

      setCompletionOpen(false);

      navigate({
        to: "/handover",
        search: { trip: trip!.id },
      });
    },

    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  /*
   * LOADING
   */

  if (tripLoading) {
    return (
      <AppShell mobileFirst>
        <PageHeading title="Loading trip..." subtitle="Please wait." />
      </AppShell>
    );
  }

  /*
   * ERROR DISPLAY
   */

  if (tripError || pointsError || assignmentsError || farmersError) {
    const error = tripError || pointsError || assignmentsError || farmersError;

    console.error("TRIP SCREEN ERROR:", error);

    return (
      <AppShell mobileFirst>
        <PageHeading
          title="Unable to load route"
          subtitle={error instanceof Error ? error.message : "Unknown database error"}
        />

        <Button
          onClick={() => {
            void queryClient.invalidateQueries({
              queryKey: ["active-trip"],
            });

            void queryClient.invalidateQueries({
              queryKey: ["trip-route-points"],
            });

            void queryClient.invalidateQueries({
              queryKey: ["trip-farmer-assignments"],
            });

            void queryClient.invalidateQueries({
              queryKey: ["trip-farmers"],
            });
          }}
        >
          Try again
        </Button>
      </AppShell>
    );
  }

  /*
   * NO ACTIVE TRIP
   */

  if (!trip) {
    return (
      <AppShell mobileFirst>
        <PageHeading title="No active trip" subtitle="Start a trip from your home screen." />

        <Button asChild size="lg" className="h-14 w-full text-base">
          <Link to="/agent">
            <ArrowLeft className="h-5 w-5" />
            Back to home
          </Link>
        </Button>
      </AppShell>
    );
  }

  function farmerAction(farmer: Farmer, pointId: string) {
    if (collectedFarmers.has(farmer.id)) {
      return <StatusBadge status="success" label="Done" size="sm" />;
    }
    const exception = exceptions.find((e) => e.farmer_id === farmer.id);
    if (exception) {
      return (
        <StatusBadge
          status="muted"
          label={exception.type === "farmer_unavailable" ? "Unavailable" : "Skipped"}
          icon={AlertTriangle}
          size="sm"
        />
      );
    }
    return (
      <div className="flex shrink-0 gap-1.5">
        <Button
          size="sm"
          onClick={() =>
            setTarget({
              farmerId: farmer.id,
              farmerName: farmer.full_name,
              farmerCode: farmer.farmer_code,
              mccId: agent!.mccId,
              agentId: agent!.agentId,
              routePointId: pointId,
              tripId: trip!.id,
              source: "agent",
            })
          }
        >
          Collect
        </Button>
        <Button
          size="sm"
          variant="outline"
          title="Farmer unavailable / skip"
          onClick={() => {
            setExceptionType("farmer_unavailable");
            setExceptionTarget({
              farmerId: farmer.id,
              farmerName: farmer.full_name,
              routePointId: pointId,
            });
          }}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const loadingFarmers = pointsLoading || assignmentsLoading || farmersLoading;

  return (
    <AppShell mobileFirst>
      <PageHeading
        title={agent?.routeName ?? "Today's route"}
        subtitle={`${collectedFarmers.size} farmers done · ${totalLitres.toFixed(1)} L collected${
          openExceptionCount > 0
            ? ` · ${openExceptionCount} open exception${openExceptionCount === 1 ? "" : "s"}`
            : ""
        }`}
      />

      {!online && (
        <div className="surface-card mb-4 flex items-center gap-3 border-status-warning/30 bg-status-warning-soft p-3">
          <Icon icon={CloudOff} size="sm" tone="warning" />
          <p className="flex-1 text-sm text-muted-foreground">
            Offline — {pending} entr
            {pending === 1 ? "y" : "ies"} waiting to sync. Your work is safely saved.
          </p>
        </div>
      )}

      {gpsSync.status !== "synced" && gpsSync.total > 0 && (
        <div
          className={`surface-card mb-4 flex items-center gap-3 p-3 ${
            gpsSync.status === "failed" ? "border-status-danger/30 bg-status-danger-soft" : ""
          }`}
        >
          <Icon icon={MapPin} size="sm" tone={gpsSync.status === "failed" ? "danger" : "warning"} />
          <p className="flex-1 text-sm text-muted-foreground">
            {gpsSync.status === "failed"
              ? `Sync failed — ${gpsSync.failed} location point${gpsSync.failed === 1 ? "" : "s"} couldn't reach the server.`
              : gpsSync.status === "syncing"
                ? `Syncing ${gpsSync.syncing} location point${gpsSync.syncing === 1 ? "" : "s"}…`
                : `Pending sync — ${gpsSync.pending} location point${gpsSync.pending === 1 ? "" : "s"} saved on this phone.`}
          </p>
        </div>
      )}

      {points.length > 0 && (
        <SegmentedProgress
          className="mb-4"
          segments={points.map((point): StopState => {
            const s = tripStops.find((ts) => ts.id === point.id)?.status ?? "upcoming";
            if (s === "done") return "completed";
            if (s === "current") return "current";
            if (s === "problem") return "problem";
            return "pending";
          })}
        />
      )}

      {/* CURRENT STOP — live map, ETA and one-tap navigation, delivery-partner style */}
      {currentStop && (
        <div className="surface-card mb-4 overflow-hidden">
          <ClientOnly
            fallback={
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                Loading map…
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                  Loading map…
                </div>
              }
            >
              <AgentTripMap
                currentPos={livePos}
                centre={centre}
                stops={tripStops}
                directionsPolyline={directions.data?.polyline ?? null}
              />
            </Suspense>
          </ClientOnly>

          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  Stop {currentStop.sequence} of {points.length}
                </p>
                <p className="text-lg font-semibold">{currentStop.name}</p>
                <p className="text-xs text-muted-foreground">
                  {currentStop.farmers.length} farmer{currentStop.farmers.length === 1 ? "" : "s"}{" "}
                  here
                </p>
              </div>
              {etaKm && etaMin && (
                <Badge variant="secondary" className="shrink-0">
                  {etaKm} km · {etaMin} min
                </Badge>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              {currentStop.lat != null && currentStop.lng != null && (
                <Button asChild className="h-11 flex-1">
                  <a
                    href={navigationUrl({ lat: currentStop.lat, lng: currentStop.lng })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation2 className="h-4 w-4" />
                    Navigate
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                className="h-11 flex-1"
                onClick={() => {
                  const next = openPoint === currentStop.id ? null : currentStop.id;
                  setOpenPoint(next);
                  if (next) arrive.mutate(currentStop.id);
                }}
              >
                <MapPin className="h-4 w-4" />
                {openPoint === currentStop.id ? "Hide farmers" : "View farmers"}
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  setExceptionType("route_issue");
                  setExceptionTarget({
                    farmerId: null,
                    farmerName: null,
                    routePointId: currentStop.id,
                  });
                }}
              >
                <AlertTriangle className="h-4 w-4" />
                Report issue
              </Button>
            </div>

            {/* Persistent confirmation that "Report issue" actually did
                something — was previously only a toast that vanished,
                leaving the card looking unchanged. See bugfix note above. */}
            {currentStopIssues.length > 0 && (
              <ul className="mt-3 space-y-2">
                {currentStopIssues.map((issue) => (
                  <li
                    key={issue.id}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${
                      issue.status === "open"
                        ? "border-status-warning/30 bg-status-warning-soft"
                        : "border-border bg-muted/30"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{exceptionLabel(issue.type)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {issue.reason || "No note added"}
                      </p>
                    </div>
                    {issue.status === "open" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={resolvePointException.isPending}
                        onClick={() => resolvePointException.mutate(issue.id)}
                      >
                        Mark fixed
                      </Button>
                    ) : (
                      <StatusBadge status="success" label="Fixed" size="sm" />
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* ITEM 6 — farmer-less stops ahead are auto-skipped (see
                stopStatus bugfix above), but the agent should still be told
                so an empty pin on the map doesn't look like a missed stop. */}
            {emptyStopsAhead.length > 0 && (
              <p className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                {emptyStopsAhead.map((p) => p.name).join(", ")}{" "}
                {emptyStopsAhead.length === 1 ? "has" : "have"} no farmers assigned — no need to
                detour there, just continue on to the next stop after you finish collecting here.
              </p>
            )}

            {openPoint === currentStop.id && (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {currentStop.farmers.map((farmer) => (
                  <li key={farmer.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{farmer.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {farmer.farmer_code}
                        {farmer.village ? ` · ${farmer.village}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {farmerAction(farmer, currentStop.id)}
                      {farmer.phone && (
                        <Button
                          asChild
                          size="icon"
                          variant="outline"
                          className="h-9 w-9 shrink-0"
                          title={`Call ${farmer.full_name}`}
                        >
                          <a href={`tel:${farmer.phone}`} onClick={(e) => e.stopPropagation()}>
                            <Phone className="h-4 w-4" />
                            <span className="sr-only">Call {farmer.full_name}</span>
                          </a>
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
                {currentStop.farmers.length === 0 && (
                  <li className="p-3 text-sm text-muted-foreground">
                    No farmers linked to this stop yet.
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}

      {!currentStop && points.length > 0 && (
        <div className="surface-card mb-4 flex flex-col items-center gap-2 p-6 text-center">
          <Icon icon={CheckCircle2} size="xl" tone="success" />
          <p className="text-sm font-medium">All stops collected</p>
          <p className="text-xs text-muted-foreground">
            Head back to the centre and close out the trip.
          </p>
        </div>
      )}

      <Button variant="outline" className="mb-4 h-12 w-full" onClick={() => setScanOpen(true)}>
        <QrCode className="h-4 w-4" />
        Scan farmer QR card
      </Button>

      {loadingFarmers && (
        <div className="mb-4 text-center text-sm text-muted-foreground">Loading farmers...</div>
      )}

      {/*
        ALL STOPS — compact route overview only. Farmers are intentionally
        NOT listed/expandable here: the per-farmer Collect/exception actions
        live solely in the CURRENT STOP card above (map + "View farmers"),
        so this list stays a quick glance at stop order/status instead of a
        second, distracting place to manage farmers.
      */}
      <p className="mb-2 text-sm font-semibold text-muted-foreground">All stops</p>
      <div className="space-y-2">
        {points.map((point) => {
          const status = tripStops.find((s) => s.id === point.id)?.status ?? "upcoming";
          const hasOpenIssue = openExceptionPointIds.has(point.id);
          const pinState: StopState =
            status === "done"
              ? "completed"
              : status === "current"
                ? "current"
                : status === "problem"
                  ? "problem"
                  : "pending";

          return (
            <div
              key={point.id}
              className={`surface-card flex items-center gap-3 p-3.5 ${status === "current" ? "ring-1 ring-status-active/40" : ""}`}
            >
              <StopPin state={pinState} sequence={point.sequence} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {point.sequence}. {point.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {point.farmers.length === 0
                    ? "No farmers — skipped"
                    : `${point.farmers.length} farmer${point.farmers.length === 1 ? "" : "s"}`}
                </p>
              </div>
              {status === "done" && <StatusBadge status="success" label="Done" size="sm" />}
              {/* Show the "Issue" badge even when this is also the current
                  stop — previously "current" overrode "problem" here, so
                  the exact stop you just reported an issue on never showed
                  it (see bugfix note by resolvePointException above). */}
              {hasOpenIssue && status !== "done" && (
                <StatusBadge status="danger" label="Issue" size="sm" />
              )}
            </div>
          );
        })}
      </div>

      <Button
        size="lg"
        variant="outline"
        className="mt-6 h-14 w-full text-base"
        onClick={() => setCompletionOpen(true)}
      >
        <Home className="h-5 w-5" />
        Return to MCC & close trip
      </Button>

      {/* QR SCANNER */}

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan farmer card</DialogTitle>
          </DialogHeader>

          <QrScanner
            onResult={(code) => {
              const normalizedCode = code.toUpperCase();

              const match = allFarmers.find(
                (farmer) =>
                  cardCodeFor("farmer", farmer.farmer_code).toUpperCase() === normalizedCode,
              );

              if (!match) {
                toast.error("No farmer on this route matches that card.");

                return;
              }

              if (collectedFarmers.has(match.id)) {
                setScanOpen(false);
                toast.error(`${match.full_name} is already marked Done on this trip.`);
                return;
              }

              setScanOpen(false);

              setTarget({
                farmerId: match.id,

                farmerName: match.full_name,

                farmerCode: match.farmer_code,

                mccId: agent!.mccId,

                agentId: agent!.agentId,

                routePointId: match.pointId,

                tripId: trip.id,

                source: "agent",
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* MILK ENTRY */}

      <Dialog
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{target?.farmerName}</DialogTitle>
          </DialogHeader>

          {target && (
            <MilkEntryForm
              target={target}
              onSaved={() => {
                setTarget(null);

                void queryClient.invalidateQueries({
                  queryKey: ["trip-collections"],
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* EXCEPTION — farmer unavailable/skipped, or a route-level issue */}

      <Dialog
        open={Boolean(exceptionTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setExceptionTarget(null);
            setExceptionReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {exceptionTarget?.farmerName
                ? `Report issue — ${exceptionTarget.farmerName}`
                : "Report route issue"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Select value={exceptionType} onValueChange={setExceptionType}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {exceptionTarget?.farmerId ? (
                  <>
                    <SelectItem value="farmer_unavailable">Farmer unavailable</SelectItem>
                    <SelectItem value="farmer_skipped">Farmer skipped</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="route_issue">Route issue</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>

            <Textarea
              placeholder="Reason (optional)"
              value={exceptionReason}
              onChange={(e) => setExceptionReason(e.target.value)}
            />

            <Button
              size="lg"
              className="h-12 w-full"
              disabled={logException.isPending}
              onClick={() => logException.mutate()}
            >
              Log exception
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ITEM 5 — after reporting a point-level issue, ask whether to
          divert on to the next stop or keep working this one. */}
      <Dialog open={postIssuePrompt} onOpenChange={setPostIssuePrompt}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Issue reported at {currentStop?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {nextStop
              ? `What would you like to do — keep working this stop, or head on to ${nextStop.name} now?`
              : "This is the last stop on the route — keep working it, or head back to the MCC."}
          </p>
          <div className="flex flex-col gap-2">
            {nextStop?.lat != null && nextStop?.lng != null && (
              <Button asChild size="lg" className="h-12 w-full">
                <a
                  href={navigationUrl({ lat: nextStop.lat, lng: nextStop.lng })}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setPostIssuePrompt(false)}
                >
                  <Navigation2 className="h-4 w-4" />
                  Navigate to {nextStop.name}
                </a>
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full"
              onClick={() => setPostIssuePrompt(false)}
            >
              Stay at this stop
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PHASE 3 — ROUTE COMPLETION SUMMARY, shown before the Agent commits
          to closing the trip and declaring the MCC handover. */}
      <Dialog open={completionOpen} onOpenChange={setCompletionOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Route completion summary</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="surface-card p-3 text-center">
                <p className="text-2xl font-semibold">{allFarmers.length}</p>
                <p className="text-xs text-muted-foreground">Farmers assigned</p>
              </div>
              <div className="surface-card p-3 text-center">
                <p className="text-2xl font-semibold">{collectedFarmers.size}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="surface-card p-3 text-center">
                <p className="text-2xl font-semibold">{exceptedFarmers.size}</p>
                <p className="text-xs text-muted-foreground">Missed / unavailable</p>
              </div>
              <div className="surface-card p-3 text-center">
                <p className="text-2xl font-semibold">{totalLitres.toFixed(1)} L</p>
                <p className="text-xs text-muted-foreground">Total collected</p>
              </div>
            </div>

            {openExceptionCount > 0 && (
              <div className="surface-card flex items-center gap-2 border-status-warning/30 bg-status-warning-soft p-3 text-sm">
                <Icon icon={AlertTriangle} size="sm" tone="warning" />
                {openExceptionCount} open exception{openExceptionCount === 1 ? "" : "s"} on this
                route.
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Closing the trip declares this total at the centre. The MCC operator will
              independently record what they receive.
            </p>

            <Button
              size="lg"
              className="h-12 w-full"
              disabled={proceedToMcc.isPending}
              onClick={() => proceedToMcc.mutate()}
            >
              Proceed to MCC
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}