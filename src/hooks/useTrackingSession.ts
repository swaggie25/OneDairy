import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TrackingSessionStatus = "NOT_STARTED" | "ACTIVE" | "DEGRADED" | "COMPLETED";

export type TrackingFailureReason =
  | "permission_denied"
  | "gps_disabled"
  | "network_unavailable"
  | "location_unavailable"
  | "backend_failure";

export type TrackingSessionResult = {
  status: TrackingSessionStatus;
  failureReason: TrackingFailureReason | null;
};

type InitParams = {
  attendanceId: string;
  agentId: string;
  mccId: string;
  routeId: string | null;
  shift: "morning" | "evening" | null;
};

/** Human-readable copy for each failure reason, for the Punch In safety banner. */
export const TRACKING_FAILURE_MESSAGES: Record<TrackingFailureReason, string> = {
  permission_denied: "Location permission was denied. Enable it in your browser/app settings.",
  gps_disabled: "GPS looks disabled on this device. Turn on location services and retry.",
  network_unavailable: "No network connection. Tracking will start once you're back online.",
  location_unavailable: "Couldn't get a GPS fix (weak signal). Move to open sky and retry.",
  backend_failure: "Couldn't reach the server to start tracking. Retry in a moment.",
};

function classifyGeolocationError(err: GeolocationPositionError): TrackingFailureReason {
  if (err.code === err.PERMISSION_DENIED) return "permission_denied";
  if (err.code === err.POSITION_UNAVAILABLE) return "gps_disabled";
  return "location_unavailable"; // TIMEOUT
}

/**
 * Owns the `tracking_sessions` lifecycle (NOT_STARTED → ACTIVE/DEGRADED →
 * COMPLETED) tied 1:1 to a Punch In (attendance row). This is deliberately
 * separate from `route_trips`: tracking begins the moment an agent punches
 * in, before they've necessarily pressed "Start trip".
 *
 * Punch In itself always succeeds independently of this hook — callers must
 * never let a tracking-init failure block or hide a successful Punch In.
 * Instead surface the returned status/failureReason clearly (see
 * TRACKING_FAILURE_MESSAGES) so the agent knows tracking is not silently
 * active when it isn't.
 */
export function useTrackingSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<TrackingSessionStatus | null>(null);
  const [failureReason, setFailureReason] = useState<TrackingFailureReason | null>(null);

  async function markDegraded(id: string | null, reason: TrackingFailureReason) {
    setStatus("DEGRADED");
    setFailureReason(reason);
    if (!id) return;
    // Best-effort — if this write itself fails (e.g. we're offline), the
    // local state above is still correct and is what the UI reads from.
    await supabase
      .from("tracking_sessions")
      .update({ status: "DEGRADED", failure_reason: reason })
      .eq("id", id);
  }

  async function acquireAndActivate(id: string): Promise<TrackingSessionResult> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      await markDegraded(id, "gps_disabled");
      return { status: "DEGRADED", failureReason: "gps_disabled" };
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const now = new Date().toISOString();
          try {
            const { error } = await supabase
              .from("tracking_sessions")
              .update({
                status: "ACTIVE",
                failure_reason: null,
                start_at: now,
                start_lat: lat,
                start_lng: lng,
                last_location_lat: lat,
                last_location_lng: lng,
                last_location_at: now,
              })
              .eq("id", id);
            if (error) throw error;
            setStatus("ACTIVE");
            setFailureReason(null);
            resolve({ status: "ACTIVE", failureReason: null });
          } catch {
            const reason: TrackingFailureReason = navigator.onLine
              ? "backend_failure"
              : "network_unavailable";
            await markDegraded(id, reason);
            resolve({ status: "DEGRADED", failureReason: reason });
          }
        },
        async (err) => {
          const reason = classifyGeolocationError(err);
          await markDegraded(id, reason);
          resolve({ status: "DEGRADED", failureReason: reason });
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
      );
    });
  }

  /** Call right after a successful Punch In (attendance insert). */
  async function initSession(params: InitParams): Promise<TrackingSessionResult> {
    setStatus(null);
    setFailureReason(null);

    let id: string | null = null;
    try {
      const { data, error } = await supabase
        .from("tracking_sessions")
        .insert({
          attendance_id: params.attendanceId,
          agent_id: params.agentId,
          mcc_id: params.mccId,
          route_id: params.routeId,
          shift: params.shift,
        })
        .select("id")
        .single();
      if (error) throw error;
      id = data.id;
      setSessionId(id);
    } catch {
      const reason: TrackingFailureReason = navigator.onLine ? "backend_failure" : "network_unavailable";
      setStatus("DEGRADED");
      setFailureReason(reason);
      return { status: "DEGRADED", failureReason: reason };
    }

    return acquireAndActivate(id);
  }

  /** Re-attempt GPS acquisition for the current session (the banner's Retry button). */
  async function retry(): Promise<TrackingSessionResult | null> {
    if (!sessionId) return null;
    return acquireAndActivate(sessionId);
  }

  /**
   * Architecture only for now (per Phase 2 scope) — call this once the
   * existing Punch Out flow is fully wired to stop tracking. Marks the
   * session tied to this attendance row as COMPLETED.
   */
  async function completeSession(
    attendanceId: string,
    coords: { lat: number | null; lng: number | null },
  ) {
    await supabase
      .from("tracking_sessions")
      .update({
        status: "COMPLETED",
        end_at: new Date().toISOString(),
        end_lat: coords.lat,
        end_lng: coords.lng,
      })
      .eq("attendance_id", attendanceId)
      .in("status", ["NOT_STARTED", "ACTIVE", "DEGRADED"]);
  }

  return { sessionId, status, failureReason, initSession, retry, completeSession };
}
