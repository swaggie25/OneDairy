/**
 * LIVE TRACKING PLAN — PHASE 6
 *
 * Farmer arrival / departure / stop-duration, derived from the real GPS
 * ping trail (Phase 3) rather than a manual button tap. Pure and
 * dependency-free so it's unit-testable and reusable by Phase 9 (trail /
 * replay / reports) without duplicating the detection logic.
 *
 * IMPORTANT (per the plan): this NEVER creates or touches a milk
 * collection. It only reads gps_pings + route_points.geofence_radius_m
 * (already stored) and, separately, milk_collections for display context.
 * GPS provides operational context; the collection stays a distinct,
 * manually-entered transaction.
 */

import { haversineMeters } from "@/lib/geo";

export type StopPing = {
  lat: number | null;
  lng: number | null;
  recorded_at: string;
  quality: string | null;
};

export type StopVisit = {
  /** First moment the agent was confirmed inside the geofence (2 consecutive fixes). */
  arrivedAt: Date | null;
  /** First moment the agent was confirmed to have left, after arriving. Null = still there / never left. */
  departedAt: Date | null;
};

/**
 * A ping counts toward geofence math only if it has coordinates and isn't
 * flagged "unavailable" quality — per Phase 3, "do not treat poor-quality
 * GPS as exact." Pings without an accuracy fix at all are excluded rather
 * than assumed to be inside/outside.
 */
function isUsable(p: StopPing): p is StopPing & { lat: number; lng: number } {
  return p.lat != null && p.lng != null && p.quality !== "unavailable";
}

/**
 * Walks a trip's chronologically-ordered ping trail and finds when the
 * agent entered and left a stop's geofence. Requires two consecutive
 * pings on each side of the crossing to absorb ordinary GPS jitter near
 * the boundary (a single stray fix doesn't count as arrival or departure).
 */
export function deriveStopVisit(
  pings: StopPing[],
  point: { lat: number | null; lng: number | null; geofence_radius_m: number | null },
  defaultRadiusM: number,
): StopVisit {
  if (point.lat == null || point.lng == null) return { arrivedAt: null, departedAt: null };
  const targetLat = point.lat;
  const targetLng = point.lng;
  const radius = point.geofence_radius_m ?? defaultRadiusM;

  const usable: { lat: number; lng: number; recorded_at: string }[] = [];
  for (const p of pings) {
    if (isUsable(p)) usable.push({ lat: p.lat, lng: p.lng, recorded_at: p.recorded_at });
  }
  const inside = usable.map(
    (p) => (haversineMeters(p.lat, p.lng, targetLat, targetLng) ?? Infinity) <= radius,
  );

  let arrivedAt: Date | null = null;
  let arrivedIndex = -1;
  for (let i = 0; i < usable.length - 1; i++) {
    if (inside[i] && inside[i + 1]) {
      arrivedAt = new Date(usable[i]!.recorded_at);
      arrivedIndex = i;
      break;
    }
  }
  if (!arrivedAt) return { arrivedAt: null, departedAt: null };

  let departedAt: Date | null = null;
  for (let i = arrivedIndex + 1; i < usable.length - 1; i++) {
    if (!inside[i] && !inside[i + 1]) {
      departedAt = new Date(usable[i]!.recorded_at);
      break;
    }
  }

  return { arrivedAt, departedAt };
}

export function stopDurationSeconds(visit: StopVisit, now: Date = new Date()): number | null {
  if (!visit.arrivedAt) return null;
  const end = visit.departedAt ?? now;
  return Math.max(0, Math.round((end.getTime() - visit.arrivedAt.getTime()) / 1000));
}

export function travelTimeSeconds(from: Date | null, arrivedAt: Date | null): number | null {
  if (!from || !arrivedAt) return null;
  return Math.max(0, Math.round((arrivedAt.getTime() - from.getTime()) / 1000));
}

export function formatDurationShort(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
