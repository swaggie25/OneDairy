/**
 * LIVE TRACKING PLAN — PHASE 3
 *
 * Pure helpers for two things gps_pings/useLiveLocation need and neither
 * had before Phase 3:
 *
 *  1. Classifying how much to trust a given GPS fix (`classifyQuality`).
 *  2. Deciding how long to wait before the *next* fix is worth writing
 *     (`nextSampleIntervalMs`) — "adaptive tracking": frequent while
 *     moving, backed off while stationary, and further backed off when the
 *     signal is poor or the battery is low.
 *
 * Kept dependency-free and easily unit-testable — no supabase/browser APIs
 * here, those live in useLiveLocation.ts.
 */

export type FixQuality = "good" | "weak" | "stale";

/** A fix worse than this accuracy (metres) is still usable but flagged "weak". */
export const WEAK_ACCURACY_M = 20;
/** A fix worse than this accuracy is so poor it barely helps the map — still stored (never silently dropped), just classified accordingly. */
export const POOR_ACCURACY_M = 75;
/** A fix older than this by the time we're about to use it is "stale" — do not treat it as the agent's exact current position. */
export const STALE_FIX_MS = 30_000;

/**
 * Classify a single fix. `ageMs` is how long ago the browser/OS actually
 * captured it (Date.now() - position.timestamp), which can lag the "now"
 * we're sampling at — e.g. a cached fix returned instantly by maximumAge.
 */
export function classifyQuality(accuracyM: number | null, ageMs: number): FixQuality {
  if (ageMs > STALE_FIX_MS) return "stale";
  if (accuracyM == null) return "weak"; // unknown accuracy: don't claim "good"
  if (accuracyM <= WEAK_ACCURACY_M) return "good";
  return "weak"; // includes accuracyM > POOR_ACCURACY_M — still real data, just untrustworthy for tight geofencing
}

export type SamplingInputs = {
  /** Metres moved since the last *sent* sample. */
  distanceSinceLastM: number;
  /** Instantaneous speed from the fix, km/h, if the device reports one. */
  speedKmh: number | null;
  quality: FixQuality;
  /** navigator.onLine — no point sampling aggressively if we can't ship it anyway. */
  online: boolean;
  /** 0–1 battery level if the Battery Status API is available, else null (treat as "unknown", not "low"). */
  batteryLevel: number | null;
};

const MOVING_INTERVAL_MS = 10_000;
const WALKING_INTERVAL_MS = 15_000;
const STATIONARY_INTERVAL_MS = 45_000;
const LOW_BATTERY_INTERVAL_MS = 90_000;
const OFFLINE_INTERVAL_MS = 60_000; // still sample while offline (Phase 8 queues these), just less eagerly

const LOW_BATTERY_THRESHOLD = 0.15;
const MOVING_SPEED_KMH = 8; // roughly bike/vehicle pace
const WALKING_SPEED_KMH = 2;
const MOVING_DISTANCE_M = 30;
const WALKING_DISTANCE_M = 8;

/**
 * How long to wait before the next sample is worth taking, in ms.
 * "Use more frequent updates while moving. Reduce unnecessary updates
 * while stationary." (Phase 3 spec) — plus battery/network/DB-load as
 * secondary modifiers on top of the movement-driven base interval.
 */
export function nextSampleIntervalMs(inputs: SamplingInputs): number {
  const { distanceSinceLastM, speedKmh, quality, online, batteryLevel } = inputs;

  const isMoving =
    (speedKmh != null && speedKmh >= MOVING_SPEED_KMH) || distanceSinceLastM >= MOVING_DISTANCE_M;
  const isWalking =
    !isMoving &&
    ((speedKmh != null && speedKmh >= WALKING_SPEED_KMH) ||
      distanceSinceLastM >= WALKING_DISTANCE_M);

  let base = isMoving
    ? MOVING_INTERVAL_MS
    : isWalking
      ? WALKING_INTERVAL_MS
      : STATIONARY_INTERVAL_MS;

  // A weak/stale fix won't get more trustworthy by asking again in 10s —
  // back off a bit so we're not just filling the DB with noisy points.
  if (quality !== "good") base = Math.max(base, WALKING_INTERVAL_MS);

  if (!online) base = Math.max(base, OFFLINE_INTERVAL_MS);
  if (batteryLevel != null && batteryLevel <= LOW_BATTERY_THRESHOLD) {
    base = Math.max(base, LOW_BATTERY_INTERVAL_MS);
  }

  return base;
}

/** Best-effort battery level via the (non-standard, Chromium-only) Battery Status API. Resolves null everywhere else — callers must treat null as "unknown", not "low". */
export async function getBatteryLevel(): Promise<number | null> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
    if (typeof nav.getBattery !== "function") return null;
    const battery = await nav.getBattery();
    return typeof battery.level === "number" ? battery.level : null;
  } catch {
    return null;
  }
}

/**
 * LIVE TRACKING PLAN — PHASE 4
 *
 * "Never fake LIVE status" — a manager's live map must say LIVE only while
 * data is actually fresh, and switch to a labelled STALE state (with the
 * real elapsed time) the moment it isn't, rather than leaving a marker
 * looking live forever. Threshold is set just above the tightest adaptive
 * sampling interval (Phase 3's MOVING_INTERVAL_MS = 10s) so a normal
 * in-between-samples gap during active movement doesn't itself read STALE.
 */
export const LIVE_THRESHOLD_MS = 25_000;

export type LiveStatus = { isLive: boolean; label: string };

export function classifyLiveStatus(lastUpdateIso: string | null, nowMs = Date.now()): LiveStatus {
  if (!lastUpdateIso) return { isLive: false, label: "No location yet" };
  const ageMs = nowMs - new Date(lastUpdateIso).getTime();
  if (ageMs < 0) return { isLive: true, label: "Updated just now" }; // clock skew guard
  if (ageMs <= LIVE_THRESHOLD_MS) {
    const secs = Math.round(ageMs / 1000);
    return { isLive: true, label: secs < 5 ? "Updated just now" : `Updated ${secs} sec ago` };
  }
  const totalSecs = Math.floor(ageMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const label =
    mins < 1
      ? `Last update ${totalSecs}s ago`
      : mins < 60
        ? `Last update ${mins}m ${secs}s ago`
        : `Last update ${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  return { isLive: false, label };
}
