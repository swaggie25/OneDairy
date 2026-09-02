import { haversineMeters } from "@/lib/geo";

/**
 * LIVE TRACKING PLAN — PHASE 9: Complete Trail, Timeline, Replay & Reports
 *
 * Pure, dependency-free helpers that turn REAL recorded rows — gps_pings,
 * route_points, milk_collections, trip_exceptions, mcc_handovers — into
 * the stop list, timeline, and metrics Phase 9 needs. Nothing here
 * invents a data point: every number is derived from rows that already
 * exist, mirroring the "prefer actual road routing / actual timestamps
 * over invented figures" rule already used by route-intelligence.ts.
 *
 * Why this exists instead of reading `trip_stops`: that table (Phase 6)
 * has the right shape — and `get_trip_stops()` already reads from it —
 * but nothing writes to it (no trigger, no edge function; verified against
 * the live project). Rather than leaving Phase 9 depending on a table
 * that's always empty, `deriveStopSegments` computes the same
 * arrived/departed/duration figures directly from the gps_pings trail on
 * the client. If `trip_stops` gets a write path in a later phase, this
 * can be swapped for `get_trip_stops()` without changing any caller's
 * shape (see `StopSegment`, which matches the RPC's fields).
 */

export type Ping = {
  lat: number | null;
  lng: number | null;
  recorded_at: string;
  speed_kmh: number | null;
  event_type: string;
};

export type RoutePointLite = {
  id: string;
  name: string;
  sequence: number;
  lat: number | null;
  lng: number | null;
  geofence_radius_m: number | null;
};

const DEFAULT_GEOFENCE_M = 150;

export type StopSegment = {
  route_point_id: string;
  stop_name: string;
  sequence: number;
  arrived_at: string | null;
  departed_at: string | null;
  stop_duration_seconds: number | null;
};

/**
 * Walks the real ping trail once, and for each route point records the
 * first moment the agent's actual GPS fix entered its geofence and the
 * last moment before it left for good. A stop with no ping ever inside
 * its radius is legitimately "not visited" — reported as such (arrived_at
 * null), never backfilled.
 */
export function deriveStopSegments(pings: Ping[], routePoints: RoutePointLite[]): StopSegment[] {
  const sorted = [...pings]
    .filter((p) => p.lat != null && p.lng != null)
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

  return [...routePoints]
    .sort((a, b) => a.sequence - b.sequence)
    .map((rp) => {
      if (rp.lat == null || rp.lng == null) {
        return {
          route_point_id: rp.id,
          stop_name: rp.name,
          sequence: rp.sequence,
          arrived_at: null,
          departed_at: null,
          stop_duration_seconds: null,
        };
      }
      const radius = rp.geofence_radius_m ?? DEFAULT_GEOFENCE_M;
      const inside = sorted.filter((p) => (haversineMeters(p.lat, p.lng, rp.lat, rp.lng) ?? Infinity) <= radius);
      if (inside.length === 0) {
        return {
          route_point_id: rp.id,
          stop_name: rp.name,
          sequence: rp.sequence,
          arrived_at: null,
          departed_at: null,
          stop_duration_seconds: null,
        };
      }
      const arrived = inside[0]!.recorded_at;
      const departed = inside[inside.length - 1]!.recorded_at;
      const durationSeconds = Math.max(
        0,
        Math.round((new Date(departed).getTime() - new Date(arrived).getTime()) / 1000),
      );
      return {
        route_point_id: rp.id,
        stop_name: rp.name,
        sequence: rp.sequence,
        arrived_at: arrived,
        departed_at: departed,
        stop_duration_seconds: durationSeconds,
      };
    });
}

/** Shift = moving vs stationary, derived from consecutive real fixes (Phase 3's own MOVING_SPEED_KMH threshold used the same way it's used live). */
const MOVING_SPEED_KMH = 8;

export function computeShiftMetrics(pings: Ping[], startAt: string | null, endAt: string | null) {
  const sorted = [...pings].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  let movingSeconds = 0;
  let stationarySeconds = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const gapSeconds = (new Date(cur.recorded_at).getTime() - new Date(prev.recorded_at).getTime()) / 1000;
    if (gapSeconds <= 0 || gapSeconds > 600) continue; // skip offline gaps — not real moving/stationary time, just a sync gap
    const speed = cur.speed_kmh ?? prev.speed_kmh;
    if (speed != null && speed >= MOVING_SPEED_KMH) movingSeconds += gapSeconds;
    else stationarySeconds += gapSeconds;
  }
  const shiftSeconds =
    startAt && endAt ? Math.max(0, (new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000) : null;
  return {
    shiftSeconds,
    movingSeconds: Math.round(movingSeconds),
    stationarySeconds: Math.round(stationarySeconds),
  };
}

export function computeRouteMetrics(
  plannedDurationSeconds: number | null,
  actualDurationSeconds: number | null,
  stops: StopSegment[],
) {
  const visited = stops.filter((s) => s.arrived_at != null).length;
  const total = stops.length;
  const delaySeconds =
    plannedDurationSeconds != null && actualDurationSeconds != null
      ? actualDurationSeconds - plannedDurationSeconds
      : null;
  return {
    plannedDurationSeconds,
    actualDurationSeconds,
    delaySeconds,
    routeCompletionPct: total > 0 ? Math.round((visited / total) * 100) : null,
    stopsVisited: visited,
    stopsTotal: total,
  };
}

export type CollectionLite = { route_point_id: string | null; collected_at: string; status: string };

export function computeFarmerMetrics(stops: StopSegment[], collections: CollectionLite[]) {
  const completedPointIds = new Set(
    collections.filter((c) => c.status !== "reversed").map((c) => c.route_point_id).filter(Boolean),
  );
  const completed = stops.filter((s) => completedPointIds.has(s.route_point_id)).length;
  const missed = stops.length - completed;

  const durations = stops.map((s) => s.stop_duration_seconds).filter((d): d is number => d != null);
  const avgStopSeconds = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const longestStopSeconds = durations.length ? Math.max(...durations) : null;

  // Travel time = sum of the gaps between one stop's departure and the
  // next visited stop's arrival — real elapsed time on the road between
  // real recorded events, not distance ÷ assumed speed.
  const visitedInOrder = stops
    .filter((s) => s.arrived_at != null && s.departed_at != null)
    .sort((a, b) => a.sequence - b.sequence);
  let travelSeconds = 0;
  for (let i = 1; i < visitedInOrder.length; i++) {
    const prevDeparture = new Date(visitedInOrder[i - 1]!.departed_at!).getTime();
    const nextArrival = new Date(visitedInOrder[i]!.arrived_at!).getTime();
    const gap = (nextArrival - prevDeparture) / 1000;
    if (gap > 0) travelSeconds += gap;
  }

  return {
    farmersCompleted: completed,
    farmersMissed: missed,
    avgStopSeconds,
    longestStopSeconds,
    travelSeconds: Math.round(travelSeconds),
  };
}

export function computeMccMetrics(
  startAt: string | null,
  plannedDurationSeconds: number | null,
  lastStopDepartedAt: string | null,
  receivedAt: string | null,
) {
  const plannedEta = startAt && plannedDurationSeconds != null ? new Date(startAt).getTime() + plannedDurationSeconds * 1000 : null;
  const mccDelaySeconds = plannedEta != null && receivedAt != null ? (new Date(receivedAt).getTime() - plannedEta) / 1000 : null;
  const routeToMccSeconds =
    lastStopDepartedAt && receivedAt
      ? Math.max(0, (new Date(receivedAt).getTime() - new Date(lastStopDepartedAt).getTime()) / 1000)
      : null;
  return {
    plannedEtaIso: plannedEta != null ? new Date(plannedEta).toISOString() : null,
    actualArrivalIso: receivedAt,
    mccDelaySeconds: mccDelaySeconds != null ? Math.round(mccDelaySeconds) : null,
    routeToMccSeconds: routeToMccSeconds != null ? Math.round(routeToMccSeconds) : null,
  };
}

export function computeTrackingMetrics(
  sessionStatus: string | null,
  startAt: string | null,
  endAt: string | null,
  pings: Ping[],
  syncFailureCount: number,
) {
  const sorted = [...pings].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const shiftSeconds =
    startAt && endAt ? Math.max(0, (new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000) : null;

  // "Offline duration" here means gaps in the recorded trail bigger than
  // the sampling interval could ever legitimately be (Phase 3's most
  // relaxed interval is 90s battery-saver) — i.e. windows where no fix
  // landed at all, which on a device that's queueing (Phase 8) usually
  // means it was offline, not that the agent vanished.
  let offlineSeconds = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i]!.recorded_at).getTime() - new Date(sorted[i - 1]!.recorded_at).getTime()) / 1000;
    if (gap > 120) offlineSeconds += gap;
  }

  const trackingAvailabilityPct =
    shiftSeconds && shiftSeconds > 0 ? Math.round(Math.max(0, ((shiftSeconds - offlineSeconds) / shiftSeconds) * 100)) : null;

  return {
    sessionStatus,
    offlineSeconds: Math.round(offlineSeconds),
    syncFailureCount,
    pingCount: sorted.length,
    trackingAvailabilityPct,
    // "Tracking completeness" — same idea as availability but framed as
    // the metric name the spec uses; kept identical rather than inventing
    // a second, subtly different definition.
    trackingCompletenessPct: trackingAvailabilityPct,
  };
}

export type TimelineEvent = {
  at: string;
  kind: "punch_in" | "arrival" | "collection" | "departure" | "exception" | "handover" | "punch_out";
  label: string;
  detail?: string | null;
};

export function buildTimeline(input: {
  startAt: string | null;
  endAt: string | null;
  stops: StopSegment[];
  collections: (CollectionLite & { farmer_name?: string | null; quantity_litres?: number | null })[];
  exceptions: { created_at: string; type: string; reason: string | null }[];
  handoverReceivedAt: string | null;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (input.startAt) events.push({ at: input.startAt, kind: "punch_in", label: "Punch in — tracking started" });

  for (const s of input.stops) {
    if (s.arrived_at) events.push({ at: s.arrived_at, kind: "arrival", label: `Arrived — ${s.stop_name}` });
    for (const c of input.collections.filter((c) => c.route_point_id === s.route_point_id && c.status !== "reversed")) {
      events.push({
        at: c.collected_at,
        kind: "collection",
        label: `Collected${c.farmer_name ? ` — ${c.farmer_name}` : ""}`,
        detail: c.quantity_litres != null ? `${Number(c.quantity_litres).toFixed(1)} L` : null,
      });
    }
    if (s.departed_at) events.push({ at: s.departed_at, kind: "departure", label: `Departed — ${s.stop_name}` });
  }

  for (const e of input.exceptions) {
    events.push({ at: e.created_at, kind: "exception", label: `Exception — ${e.type.replace(/_/g, " ")}`, detail: e.reason ?? null });
  }

  if (input.handoverReceivedAt) {
    events.push({ at: input.handoverReceivedAt, kind: "handover", label: "MCC handover received" });
  }
  if (input.endAt) events.push({ at: input.endAt, kind: "punch_out", label: "Punch out — tracking ended" });

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export function formatDurationShort(seconds: number | null): string {
  if (seconds == null) return "—";
  const s = Math.abs(Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const sec = s % 60;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
