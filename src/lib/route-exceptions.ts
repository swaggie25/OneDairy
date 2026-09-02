/**
 * LIVE TRACKING PLAN — PHASE 7
 *
 * Pure, dependency-free detection rules for the two genuinely new
 * tracking-derived exception types. "Delay" reuses Phase 5's timing
 * classification directly (no new logic needed); "gps_failure" /
 * "tracking_failure" reuse tracking_sessions.status/failure_reason
 * (Phase 2) directly — neither needs a detector here.
 *
 * Both detectors require the crossing to hold for 2 consecutive usable
 * pings, mirroring Phase 6's arrival/departure jitter filter, so ordinary
 * GPS noise near a threshold doesn't raise a false exception.
 */

import { distanceToPathMeters, haversineMeters } from "@/lib/geo";

export type DetectorPing = {
  lat: number | null;
  lng: number | null;
  recorded_at: string;
  quality: string | null;
};

function usable(pings: DetectorPing[]): { lat: number; lng: number; recorded_at: string }[] {
  const out: { lat: number; lng: number; recorded_at: string }[] = [];
  for (const p of pings) {
    if (p.lat != null && p.lng != null && p.quality !== "unavailable") {
      out.push({ lat: p.lat, lng: p.lng, recorded_at: p.recorded_at });
    }
  }
  return out;
}

export type DeviationResult = { at: Date; lat: number; lng: number; distanceM: number };

/** Ping trail must be chronologically ascending. */
export function detectRouteDeviation(
  pings: DetectorPing[],
  routePath: { lat: number; lng: number }[],
  thresholdM: number,
): DeviationResult | null {
  if (routePath.length < 2) return null;
  const pts = usable(pings);
  for (let i = 0; i < pts.length - 1; i++) {
    const d0 = distanceToPathMeters(pts[i]!.lat, pts[i]!.lng, routePath);
    const d1 = distanceToPathMeters(pts[i + 1]!.lat, pts[i + 1]!.lng, routePath);
    if (d0 != null && d1 != null && d0 > thresholdM && d1 > thresholdM) {
      return {
        at: new Date(pts[i]!.recorded_at),
        lat: pts[i]!.lat,
        lng: pts[i]!.lng,
        distanceM: d0,
      };
    }
  }
  return null;
}

export type UnplannedStopResult = { since: Date; lat: number; lng: number };

/**
 * Flags a stationary cluster of recent pings that isn't near any known
 * stop or the MCC. "Stationary" = every ping in the trailing window is
 * within `clusterRadiusM` of the latest one; "unknown" = the latest fix
 * is further than `knownPlaceRadiusM` from every point in `knownPlaces`.
 */
export function detectUnplannedStop(
  pings: DetectorPing[],
  knownPlaces: { lat: number; lng: number }[],
  minMinutes: number,
  clusterRadiusM = 50,
  knownPlaceRadiusM = 150,
): UnplannedStopResult | null {
  const pts = usable(pings);
  if (pts.length < 2) return null;

  const last = pts[pts.length - 1]!;
  const cutoff = new Date(last.recorded_at).getTime() - minMinutes * 60_000;

  let windowStart = -1;
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    if (new Date(p.recorded_at).getTime() < cutoff) break;
    const d = haversineMeters(p.lat, p.lng, last.lat, last.lng) ?? Infinity;
    if (d > clusterRadiusM) return null; // moved during the window — not stationary
    windowStart = i;
  }
  if (windowStart === -1) return null; // not enough history to cover the full window yet

  const first = pts[windowStart]!;
  if (new Date(first.recorded_at).getTime() > cutoff + 60_000) return null; // window too short

  const nearKnownPlace = knownPlaces.some(
    (kp) => (haversineMeters(last.lat, last.lng, kp.lat, kp.lng) ?? Infinity) <= knownPlaceRadiusM,
  );
  if (nearKnownPlace) return null;

  return { since: new Date(first.recorded_at), lat: last.lat, lng: last.lng };
}
