import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import {
  MapPin,
  Play,
  Square,
  Plus,
  Trash2,
  Save,
  Navigation2,
  Clock,
  Ruler,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAgentContext } from "@/hooks/useAgentContext";
import { useLiveLocation } from "@/hooks/useLiveLocation";
import { useGpsSync } from "@/hooks/useGpsSync";
import { useActiveTrackingSession } from "@/hooks/useActiveTrackingSession";
import { getCoords, haversineMeters } from "@/lib/geo";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/route-marking")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["agent"]),
  head: () => ({
    meta: [
      { title: "Mark a route — DairyOne" },
      {
        name: "description",
        content:
          "Walk or drive a new collection route with live GPS tracking and save it for reuse.",
      },
    ],
  }),
  component: RouteMarkingScreen,
});

type Stop = { name: string; lat: number; lng: number };

const HALT_RADIUS_M = 12;
const HALT_SECONDS = 40;

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

function RouteMarkingScreen() {
  const { data: agent } = useAgentContext();
  const navigate = useNavigate();

  const [tripId, setTripId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [distance, setDistance] = useState(0);
  const [stops, setStops] = useState<Stop[]>([]);
  const [haltSuggestion, setHaltSuggestion] = useState<Stop | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [addingStop, setAddingStop] = useState(false);

  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const haltRefRef = useRef<{ lat: number; lng: number; since: number } | null>(null);
  const haltDismissedRef = useRef(false);

  // Resume an unfinished marking trip after a reload/app-close instead of
  // silently orphaning it (the unique "one in-progress trip per agent"
  // index would otherwise block starting anything else). Stops added
  // before the reload can't be recovered client-side — the banner below
  // makes that explicit so the agent can choose to discard and restart.
  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    if (!agent || tripId) return;
    let cancelled = false;
    void supabase
      .from("route_trips")
      .select("id, started_at")
      .eq("agent_id", agent.agentId)
      .eq("trip_type", "marking")
      .eq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setTripId(data.id);
        setStartedAt(data.started_at ? new Date(data.started_at).getTime() : Date.now());
        setResumed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [agent, tripId]);

  const { data: activeSession } = useActiveTrackingSession(agent?.agentId ?? null);
  // Keeps the local gps_pings queue flushing in the background while this
  // screen is mounted (Phase 8) — same re-entrancy-safe pattern as agent.tsx/trip.tsx.
  useGpsSync();

  const { coords: livePos } = useLiveLocation({
    enabled: Boolean(tripId && agent),
    tripId,
    trackingSessionId: activeSession?.id ?? null,
    agentId: agent?.agentId ?? null,
    mccId: agent?.mccId ?? null,
    routePointId: null,
  });

  // Local tick so the elapsed-time readout updates every second.
  useEffect(() => {
    if (!tripId) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [tripId]);

  // Accumulate distance + detect halts from every raw fix (useLiveLocation
  // updates its `coords` on every watchPosition callback, not just the
  // throttled ones it writes to the DB).
  useEffect(() => {
    if (!tripId || !livePos) return;
    const prev = lastCoordsRef.current;
    if (prev) {
      const d = haversineMeters(prev.lat, prev.lng, livePos.lat, livePos.lng);
      if (d != null && d < 500) setDistance((total) => total + d); // ignore GPS jumps
    }
    lastCoordsRef.current = { lat: livePos.lat, lng: livePos.lng };

    const haltRef = haltRefRef.current;
    if (!haltRef) {
      haltRefRef.current = { lat: livePos.lat, lng: livePos.lng, since: Date.now() };
    } else {
      const movedFromRef = haversineMeters(haltRef.lat, haltRef.lng, livePos.lat, livePos.lng);
      if (movedFromRef != null && movedFromRef > HALT_RADIUS_M) {
        haltRefRef.current = { lat: livePos.lat, lng: livePos.lng, since: Date.now() };
        haltDismissedRef.current = false;
        setHaltSuggestion(null);
      } else if (
        !haltDismissedRef.current &&
        Date.now() - haltRef.since > HALT_SECONDS * 1000 &&
        !haltSuggestion
      ) {
        setHaltSuggestion({ name: `Stop ${stops.length + 1}`, lat: livePos.lat, lng: livePos.lng });
      }
    }
  }, [livePos, tripId, stops.length, haltSuggestion]);

  const startMarking = useMutation({
    mutationFn: async () => {
      if (!agent) throw new Error("No agent profile linked to this account.");
      const { data, error } = await supabase
        .from("route_trips")
        .insert({
          agent_id: agent.agentId,
          mcc_id: agent.mccId,
          route_id: null,
          trip_type: "marking",
          vehicle_type: agent.vehicleType ?? "bike",
          status: "in_progress",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      setTripId(id);
      setStartedAt(Date.now());
      setDistance(0);
      setStops([]);
      lastCoordsRef.current = null;
      haltRefRef.current = null;
      toast.success("Route marking started — walk or drive the route now.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function addStopHere(prefill?: Stop) {
    setAddingStop(true);
    const point = prefill ?? (await getCoords());
    setAddingStop(false);
    if (point.lat == null || point.lng == null) {
      toast.error("Couldn't get a GPS fix for this stop. Try again.");
      return;
    }
    const stop: Stop = {
      name: `Stop ${stops.length + 1}`,
      lat: point.lat,
      lng: point.lng,
    };
    setStops((s) => [...s, stop]);
    setHaltSuggestion(null);
    haltDismissedRef.current = true;
    if (tripId && agent) {
      void supabase.from("gps_pings").insert({
        trip_id: tripId,
        agent_id: agent.agentId,
        mcc_id: agent.mccId,
        event_type: "halt",
        lat: point.lat,
        lng: point.lng,
        halt_seconds: HALT_SECONDS,
      });
    }
  }

  function renameStop(index: number, name: string) {
    setStops((s) => s.map((stop, i) => (i === index ? { ...stop, name } : stop)));
  }

  function removeStop(index: number) {
    setStops((s) => s.filter((_, i) => i !== index));
  }

  const saveRoute = useMutation({
    mutationFn: async () => {
      if (!tripId) throw new Error("No active marking trip.");
      if (!routeName.trim()) throw new Error("Route name is required.");
      if (stops.length === 0) throw new Error("Add at least one stop before saving.");
      const { data, error } = await supabase.rpc("save_marked_route", {
        p_trip_id: tripId,
        p_name: routeName.trim(),
        p_stops: stops.map((s, i) => ({ ...s, sequence: i + 1 })),
        p_distance_meters: Math.round(distance),
        p_duration_seconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
        p_polyline: null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Route saved. It's ready to assign from Field setup.");
      setSaveOpen(false);
      setTripId(null);
      navigate({ to: "/agent" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discard = useMutation({
    mutationFn: async () => {
      if (!tripId) return;
      const { error } = await supabase
        .from("route_trips")
        .update({ status: "cancelled", ended_at: new Date().toISOString() })
        .eq("id", tripId);
      if (error) throw error;
    },
    onSuccess: () => {
      setTripId(null);
      toast("Route marking discarded.");
      navigate({ to: "/agent" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const elapsedMs = startedAt ? now - startedAt : 0;

  return (
    <AppShell mobileFirst>
      <PageHeading
        title="Mark a route"
        subtitle="Walk or drive the route once, drop stops along the way, then save it for reuse."
      />

      {!tripId ? (
        <div className="surface-card flex flex-col items-center gap-4 p-8 text-center">
          <Icon icon={Navigation2} size="lg" tone="active" />
          <p className="text-sm text-muted-foreground">
            Starting will track your GPS continuously so the exact path, distance and duration are
            recorded. Add a stop each time you reach a farmer or collection point.
          </p>
          <Button
            size="lg"
            className="h-14 w-full text-base"
            onClick={() => startMarking.mutate()}
            disabled={startMarking.isPending || !agent}
          >
            <Play className="h-5 w-5" /> Start marking
          </Button>
          {!agent && (
            <p className="text-xs text-muted-foreground">
              Your agent profile isn't linked yet — ask your Centre Manager.
            </p>
          )}
        </div>
      ) : (
        <>
          {resumed && (
            <div className="surface-card mb-4 flex items-start gap-3 border-status-warning/30 bg-status-warning-soft p-4 text-sm">
              <Icon icon={AlertTriangle} size="sm" tone="warning" className="mt-0.5" />
              <p>
                Resumed an unfinished marking trip. Stops added before you left couldn't be
                recovered — re-add any you need, or discard and start fresh.
              </p>
            </div>
          )}
          <div className="surface-card mb-4 grid grid-cols-3 gap-3 p-4 text-center">
            <div>
              <Clock className="mx-auto h-4 w-4 text-muted-foreground" />
              <p className="mt-1 text-lg font-bold tabular-nums">{formatDuration(elapsedMs)}</p>
              <p className="text-xs text-muted-foreground">Duration</p>
            </div>
            <div>
              <Ruler className="mx-auto h-4 w-4 text-muted-foreground" />
              <p className="mt-1 text-lg font-bold tabular-nums">
                {(distance / 1000).toFixed(2)} km
              </p>
              <p className="text-xs text-muted-foreground">Distance</p>
            </div>
            <div>
              <MapPin className="mx-auto h-4 w-4 text-muted-foreground" />
              <p className="mt-1 text-lg font-bold tabular-nums">{stops.length}</p>
              <p className="text-xs text-muted-foreground">Stops</p>
            </div>
          </div>

          {haltSuggestion && (
            <div className="surface-card mb-4 flex items-center justify-between gap-3 border-status-warning/30 bg-status-warning-soft p-4">
              <div className="flex items-start gap-3">
                <Icon icon={AlertTriangle} size="sm" tone="warning" className="mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">You've stopped moving</p>
                  <p className="text-xs text-muted-foreground">Mark this as a collection stop?</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void addStopHere(haltSuggestion)}>
                  <Plus className="h-3.5 w-3.5" /> Add stop
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    haltDismissedRef.current = true;
                    setHaltSuggestion(null);
                  }}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          <Button
            variant="outline"
            className="mb-4 h-12 w-full"
            onClick={() => void addStopHere()}
            disabled={addingStop}
          >
            <Plus className="h-4 w-4" /> {addingStop ? "Getting location…" : "Add stop here"}
          </Button>

          <div className="surface-card p-4">
            <h2 className="mb-3 font-semibold">Stops on this route</h2>
            {stops.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No stops yet. Tap "Add stop here" at each farmer / collection point.
              </p>
            ) : (
              <ol className="space-y-2">
                {stops.map((stop, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
                    <Input
                      value={stop.name}
                      onChange={(e) => renameStop(i, e.target.value)}
                      className="h-9"
                    />
                    <Button size="icon" variant="ghost" onClick={() => removeStop(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Button
              size="lg"
              className="h-14 text-base"
              onClick={() => setSaveOpen(true)}
              disabled={stops.length === 0}
            >
              <Save className="h-5 w-5" /> Finish & save route
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 text-base"
              onClick={() => discard.mutate()}
              disabled={discard.isPending}
            >
              <Square className="h-5 w-5" /> Discard
            </Button>
          </div>
        </>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this route</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="route-name-input">Route name</Label>
              <Input
                id="route-name-input"
                className="mt-1"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                placeholder="e.g. Morning Route — East villages"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {stops.length} stops · {(distance / 1000).toFixed(2)} km · {formatDuration(elapsedMs)}
            </p>
            <Button
              className="w-full"
              onClick={() => saveRoute.mutate()}
              disabled={saveRoute.isPending}
            >
              <Save className="h-4 w-4" /> Save route
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
