import { lazy, Suspense } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  MapPin,
  Milk,
  AlertTriangle,
  LogIn,
  LogOut,
  Truck,
} from "lucide-react";
import { z } from "zod";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTripHistory } from "@/hooks/useTripHistory";
import { useReplayPlayback, type ReplaySpeed } from "@/hooks/useReplayPlayback";
import { formatDurationShort, type TimelineEvent } from "@/lib/trip-history";
import { MANAGER_NAV, OWNER_NAV, FINANCE_NAV } from "@/lib/nav";
import { requireRole } from "@/lib/route-guards";

const ReplayMap = lazy(() => import("@/components/replay-map"));

// AUDIT ITEM #5 — the "Back" button used to always go to /handovers, even
// when a manager reached this trip from the live map or from reports. The
// linking page now tells us where it came from via ?from=, so Back can
// return there instead of guessing. Restricted to the pages that actually
// link here, so this can't be used as an open redirect.
const BACK_DESTINATIONS = ["/handovers", "/reports"] as const;
const searchSchema = z.object({
  from: z.enum(BACK_DESTINATIONS).optional().default("/handovers"),
});

export const Route = createFileRoute("/_authenticated/trip-history/$tripid")({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => requireRole(context.profile, ["manager", "owner", "accountant"]),
  head: () => ({
    meta: [
      { title: "Trip history — DairyOne" },
      { name: "description", content: "Replay the actual recorded route, timeline, and metrics for a collection trip." },
    ],
  }),
  component: TripHistoryScreen,
});

const TIMELINE_ICONS: Record<TimelineEvent["kind"], typeof MapPin> = {
  punch_in: LogIn,
  arrival: MapPin,
  collection: Milk,
  departure: Truck,
  exception: AlertTriangle,
  handover: Milk,
  punch_out: LogOut,
};

/**
 * LIVE TRACKING PLAN — PHASE 9
 *
 * "Allow users to replay the actual historical journey. Do not simulate
 * anything that was not recorded." Everything shown here — the trail,
 * the timeline, every metric — is derived from useTripHistory's read of
 * route_trips/gps_pings/milk_collections/trip_exceptions/mcc_handovers.
 * No separate reporting table, no invented figures.
 */
function TripHistoryScreen() {
  const { tripid } = Route.useParams();
  const { from } = Route.useSearch();
  const backLabel = from === "/reports" ? "Back to reports" : "Back to handovers";
  const { data: user } = useCurrentUser();
  const nav = user?.role === "owner" ? OWNER_NAV : user?.role === "accountant" ? FINANCE_NAV : MANAGER_NAV;

  const { data, isLoading, error } = useTripHistory(tripid);
  const replay = useReplayPlayback(data?.pings ?? []);

  if (isLoading) {
    return (
      <AppShell nav={nav}>
        <PageHeading title="Loading trip history…" />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell nav={nav}>
        <PageHeading title="Trip not found" subtitle="This trip doesn't exist or you don't have access to it." />
        <Button asChild variant="ghost" className="mt-2">
          <Link to={from}>
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
      </AppShell>
    );
  }

  const { trip, stops, collections, metrics, timeline, routePoints } = data;
  const agent = trip.agents as { full_name: string; employee_code: string } | null;
  const route = trip.routes as { name: string } | null;
  const mcc = trip.mcc_centres as { name: string; lat: number | null; lng: number | null } | null;

  const collectionMarkers = collections
    .filter((c) => c.status !== "reversed")
    .map((c) => ({
      lat: c.gps_lat,
      lng: c.gps_lng,
      label: `${c.farmers?.full_name ?? "Farmer"} · ${Number(c.quantity_litres ?? 0).toFixed(1)} L`,
    }));

  return (
    <AppShell nav={nav}>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to={from}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>
      <PageHeading
        title={`${agent?.full_name ?? "Agent"}'s trip`}
        subtitle={`${trip.trip_date} · ${trip.session} · ${route?.name ?? "Route"}${mcc ? ` → ${mcc.name}` : ""}`}
      />

      {/* SHIFT / ROUTE / TRACKING metrics — Phase 9 REPORTS section, computed from this trip's real rows */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Shift duration" value={formatDurationShort(metrics.shift.shiftSeconds)} hint={`${formatDurationShort(metrics.shift.movingSeconds)} moving`} />
        <StatCard
          label="Route completion"
          value={metrics.route.routeCompletionPct != null ? `${metrics.route.routeCompletionPct}%` : "—"}
          hint={`${metrics.route.stopsVisited}/${metrics.route.stopsTotal} stops`}
        />
        <StatCard
          label="Delay vs plan"
          value={metrics.route.delaySeconds != null ? formatDurationShort(metrics.route.delaySeconds) : "—"}
          hint={metrics.route.delaySeconds != null && metrics.route.delaySeconds < 0 ? "Ahead of plan" : metrics.route.delaySeconds != null ? "Behind plan" : "No planned duration on file"}
        />
        <StatCard
          label="Tracking availability"
          value={metrics.tracking.trackingAvailabilityPct != null ? `${metrics.tracking.trackingAvailabilityPct}%` : "—"}
          hint={`${metrics.tracking.pingCount} points · ${metrics.tracking.syncFailureCount} sync failure${metrics.tracking.syncFailureCount === 1 ? "" : "s"}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <StatCard label="Farmers completed" value={`${metrics.farmers.farmersCompleted} / ${metrics.farmers.farmersCompleted + metrics.farmers.farmersMissed}`} hint={`${metrics.farmers.farmersMissed} missed`} />
        <StatCard
          label="Avg stop · Longest stop"
          value={`${formatDurationShort(metrics.farmers.avgStopSeconds)} · ${formatDurationShort(metrics.farmers.longestStopSeconds)}`}
        />
        <StatCard label="Travel time" value={formatDurationShort(metrics.farmers.travelSeconds)} hint="Between farmer stops" />
        <StatCard
          label="Route → MCC"
          value={formatDurationShort(metrics.mcc.routeToMccSeconds)}
          hint={
            metrics.mcc.mccDelaySeconds != null
              ? metrics.mcc.mccDelaySeconds <= 0
                ? `${formatDurationShort(Math.abs(metrics.mcc.mccDelaySeconds))} early at MCC`
                : `${formatDurationShort(metrics.mcc.mccDelaySeconds)} late at MCC`
              : "No MCC receipt yet"
          }
        />
      </div>

      {/* REPLAY */}
      <div className="surface-card mt-6 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Trail replay</h2>
          {!replay.hasData && <span className="text-xs text-muted-foreground">No recorded GPS points for this trip.</span>}
        </div>

        <Suspense fallback={<div className="flex h-[380px] items-center justify-center text-sm text-muted-foreground">Loading map…</div>}>
          <ReplayMap
            centre={mcc}
            trail={replay.fullTrail}
            routePoints={routePoints}
            collections={collectionMarkers}
            position={replay.position}
          />
        </Suspense>

        {replay.hasData && (
          <div className="mt-3 space-y-2">
            <Slider
              value={[replay.totalMs > 0 ? (replay.elapsedMs / replay.totalMs) * 100 : 0]}
              max={100}
              step={0.1}
              onValueChange={([v]) => replay.seekToFraction((v ?? 0) / 100)}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{replay.startAt ? new Date(replay.startAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
              <span>{replay.currentTimeIso ? new Date(replay.currentTimeIso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span>
              <span>{replay.endAt ? new Date(replay.endAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => replay.restart()} aria-label="Restart replay">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={() => (replay.playing ? replay.pause() : replay.play())}>
                {replay.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {replay.playing ? "Pause" : "Play"}
              </Button>
              {([1, 2, 4] as ReplaySpeed[]).map((s) => (
                <Button key={s} size="sm" variant={replay.speed === s ? "default" : "outline"} onClick={() => replay.setSpeed(s)}>
                  {s}×
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* TIMELINE */}
      <div className="surface-card mt-4 p-4">
        <h2 className="mb-3 text-sm font-semibold">Timeline</h2>
        {timeline.length === 0 && <p className="text-sm text-muted-foreground">No recorded events yet.</p>}
        <div className="space-y-3">
          {timeline.map((ev, i) => {
            const Icon = TIMELINE_ICONS[ev.kind];
            return (
              <div key={`${ev.at}-${i}`} className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    ev.kind === "exception" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm">
                    {ev.label}
                    {ev.detail && <span className="text-muted-foreground"> · {ev.detail}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(ev.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {stops.some((s) => !s.arrived_at) && (
        <div className="surface-card mt-4 flex items-center gap-2 p-4 text-sm">
          <Badge variant="secondary">Not visited</Badge>
          <span className="text-muted-foreground">
            {stops.filter((s) => !s.arrived_at).map((s) => s.stop_name).join(", ")}
          </span>
        </div>
      )}
    </AppShell>
  );
}
