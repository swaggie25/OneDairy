/**
 * LIVE TRACKING PLAN — PHASE 5
 *
 * Pure helpers for turning real road-routing data (Google Routes API, via
 * the existing `computeRoute` server function) into schedule/ETA/timing
 * figures. Deliberately dependency-free and unit-testable — no supabase or
 * browser APIs here.
 *
 * Design note: there is no "planned schedule" table anywhere in DairyOne.
 * Per the plan ("Do not hard-code arbitrary business rules"), we do NOT
 * invent one. Instead a stop's "scheduled" time is derived from something
 * that already exists and is real — the trip's actual start time
 * (route_trips.started_at) plus the cumulative real driving time to reach
 * that stop, taken from a single computeRoute call over the whole route.
 * This is the same "prefer actual road routing over distance ÷ fixed
 * speed" rule the plan requires for ETA.
 */

export type TimingStatus = "ON_TIME" | "SLIGHTLY_LATE" | "DELAYED";

/**
 * Classify how late something is against the centre's configured
 * thresholds (mcc_centres.on_time_threshold_min / delayed_threshold_min —
 * owner-configurable, Phase 5 migration). Negative delay (early) is
 * ON_TIME.
 */
export function classifyTimingStatus(
  delayMinutes: number,
  onTimeThresholdMin: number,
  delayedThresholdMin: number,
): TimingStatus {
  if (delayMinutes <= onTimeThresholdMin) return "ON_TIME";
  if (delayMinutes <= delayedThresholdMin) return "SLIGHTLY_LATE";
  return "DELAYED";
}

export const TIMING_STATUS_LABEL: Record<TimingStatus, string> = {
  ON_TIME: "ON TIME",
  SLIGHTLY_LATE: "SLIGHTLY LATE",
  DELAYED: "DELAYED",
};

/**
 * Cumulative seconds-from-route-start to arrive at each leg's destination,
 * given the ordered legs of a single computeRoute call across every stop
 * (origin → stop1 → stop2 → ... → stopN). offsets[i] is the planned time
 * to reach stop i+1 (i.e. legs[0..i] summed).
 */
export function cumulativeOffsetsSeconds(legs: { durationSeconds: number }[]): number[] {
  let acc = 0;
  return legs.map((l) => {
    acc += l.durationSeconds;
    return acc;
  });
}

export function addSeconds(iso: string, seconds: number): Date {
  return new Date(new Date(iso).getTime() + seconds * 1000);
}

/** Minutes from `a` to `b` (positive if b is after a — i.e. late). */
export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export function formatDelay(minutes: number): string {
  if (minutes <= 0) return minutes === 0 ? "On time" : `${Math.abs(minutes)} min early`;
  return `${minutes} min late`;
}
