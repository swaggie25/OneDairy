/**
 * LIVE TRACKING PLAN — PHASE 7
 *
 * Single source of truth for trip_exceptions.type — both the existing
 * manually-reported types (Part 1 / Phase 3) and the tracking-derived
 * types this phase adds. Previously duplicated as a local const in
 * manager.tsx; centralised here so the label set can't drift.
 */

export const MANUAL_EXCEPTION_TYPES = [
  "farmer_unavailable",
  "farmer_skipped",
  "route_issue",
  "other",
  "quality_issue",
  "quantity_mismatch",
] as const;

/** Detected from GPS/schedule state, not typed in by an agent or manager. */
export const AUTO_EXCEPTION_TYPES = [
  "route_deviation",
  "unplanned_stop",
  "delay",
  "gps_failure",
  "tracking_failure",
  "sync_failure",
] as const;

export type ManualExceptionType = (typeof MANUAL_EXCEPTION_TYPES)[number];
export type AutoExceptionType = (typeof AUTO_EXCEPTION_TYPES)[number];
export type ExceptionType = ManualExceptionType | AutoExceptionType;

export const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  farmer_unavailable: "Farmer unavailable",
  farmer_skipped: "Farmer skipped",
  route_issue: "Route issue",
  other: "Other",
  quality_issue: "Quality issue",
  quantity_mismatch: "MCC handover variance",
  route_deviation: "Route deviation",
  unplanned_stop: "Unplanned stop",
  delay: "Delay",
  gps_failure: "GPS failure",
  tracking_failure: "Tracking failure",
  sync_failure: "Sync failure",
};

/** Safe lookup for a type string coming straight off a DB row (not yet narrowed). */
export function exceptionLabel(type: string): string {
  return (EXCEPTION_LABELS as Record<string, string>)[type] ?? type;
}

export function isAutoExceptionType(type: string): type is AutoExceptionType {
  return (AUTO_EXCEPTION_TYPES as readonly string[]).includes(type);
}
