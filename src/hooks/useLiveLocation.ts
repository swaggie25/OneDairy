import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  classifyQuality,
  getBatteryLevel,
  nextSampleIntervalMs,
  type FixQuality,
} from "@/lib/tracking-quality";
import { enqueuePing } from "@/lib/gps-offline-queue";
import { watchLivePosition, type GeoFix } from "@/lib/native-geo";

export type LiveCoords = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  quality: FixQuality;
};

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** m/s (what the Geolocation API gives us) → km/h. */
function speedToKmh(speedMs: number | null): number | null {
  return speedMs == null ? null : speedMs * 3.6;
}

/**
 * LIVE TRACKING PLAN — PHASE 3: Continuous GPS + Location Storage
 *
 * Continuously watches the device position (like a delivery-partner app)
 * whenever `enabled`, writing breadcrumbs to `gps_pings` so the manager's
 * live map (Phase 4) updates in near real time, while returning the
 * freshest coords locally for in-app route/ETA rendering.
 *
 * What changed from the pre-Phase-3 version:
 *  - Sampling is adaptive (`nextSampleIntervalMs`) instead of a flat
 *    15s/25m throttle: tighter while moving, backed off while stationary,
 *    weak-signal, offline, or on low battery.
 *  - Every fix is classified `good` | `weak` | `stale` and stored as such
 *    (never silently treated as exact) — see tracking-quality.ts.
 *  - Writes now carry `tracking_session_id` (so tracking starts at Punch
 *    In per Phase 2, not only once a trip exists) alongside the existing
 *    `trip_id`, plus heading/altitude, and a client-generated `client_id`
 *    so a duplicate watchPosition fire or retry can never double-insert.
 *
 * PHASE 8 UPDATE: every fix that clears the adaptive-sampling check is now
 * ALWAYS written to the local queue first (`enqueuePing`, synchronous,
 * cannot fail) instead of attempting a direct Supabase insert here. A
 * background flush (`useGpsSync.ts`, mounted once at the app shell level)
 * pushes queued pings to the server whenever online, preserving the
 * original GPS `recorded_at` and de-duping via `client_id`. This means a
 * fix captured while offline — permission fine, GPS fine, just no network
 * — is never silently skipped; it waits in the queue and syncs once
 * connectivity returns, in the order it was captured.
 */
export function useLiveLocation(params: {
  enabled: boolean;
  tripId: string | null;
  trackingSessionId: string | null;
  agentId: string | null;
  mccId: string | null;
  routePointId?: string | null;
}) {
  const { enabled, tripId, trackingSessionId, agentId, mccId, routePointId } = params;
  const [coords, setCoords] = useState<LiveCoords | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const lastSentRef = useRef<{ at: number; coords: { lat: number; lng: number } } | null>(null);
  const batteryRef = useRef<number | null>(null);
  const watcherRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    void getBatteryLevel().then((level) => {
      if (!cancelled) batteryRef.current = level;
    });
    // Battery level can change materially over a multi-hour shift; refresh
    // occasionally rather than trusting the value read at mount forever.
    const batteryPoll = setInterval(() => {
      void getBatteryLevel().then((level) => {
        if (!cancelled) batteryRef.current = level;
      });
    }, 5 * 60_000);

    const handleFix = (fix: GeoFix) => {
      const ageMs = Math.max(0, Date.now() - fix.timestamp);
      const quality = classifyQuality(fix.accuracy, ageMs);
      const next: LiveCoords = {
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        heading: fix.heading,
        speed: fix.speed,
        quality,
      };
      setCoords(next);

      // Always update local state (for in-app ETA/map) even for stale/weak
      // fixes, but decide independently whether THIS fix is worth writing.
      const now = Date.now();
      const last = lastSentRef.current;
      const distanceSinceLastM = last ? haversineMeters(last.coords, next) : Infinity;
      const dueByInterval =
        !last ||
        now - last.at >=
          nextSampleIntervalMs({
            distanceSinceLastM,
            speedKmh: speedToKmh(next.speed),
            quality,
            online: typeof navigator !== "undefined" ? navigator.onLine : true,
            batteryLevel: batteryRef.current,
          });

      if (!agentId || !mccId || !dueByInterval) return;

      lastSentRef.current = { at: now, coords: { lat: next.lat, lng: next.lng } };
      const clientId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${agentId}-${now}-${Math.random()}`;

      // Local-first: this can't fail the caller. A background flush
      // (useGpsSync) ships it whenever online; recorded_at stays the real
      // device fix time even if that sync happens minutes/hours later.
      const { droppedCount } = enqueuePing({
        client_id: clientId,
        trip_id: tripId,
        tracking_session_id: trackingSessionId,
        agent_id: agentId,
        mcc_id: mccId,
        route_point_id: routePointId ?? null,
        event_type: "ping",
        lat: next.lat,
        lng: next.lng,
        accuracy: next.accuracy,
        heading: next.heading,
        altitude: fix.altitude,
        speed_kmh: speedToKmh(next.speed),
        quality: next.quality,
        recorded_at: new Date(fix.timestamp).toISOString(),
      });

      // Extreme edge case (device offline long enough to fill the local
      // queue cap): oldest points were dropped rather than silently grown
      // forever. Per Phase 8 "do not hide sync failures", raise it as a
      // real, reviewable exception rather than just a console warning —
      // best-effort (if we're this offline the insert itself may queue
      // behind reconnection, which is fine, it just needs to land eventually).
      // trip_exceptions.trip_id is required, and tracking can be ACTIVE
      // before a trip exists (Phase 2/3) — nothing to attach the exception
      // to yet in that window, so just skip; the drop itself already only
      // happens after hours of continuous offline queueing.
      if (droppedCount > 0 && mccId && tripId) {
        void supabase.from("trip_exceptions").insert({
          trip_id: tripId,
          agent_id: agentId,
          mcc_id: mccId,
          type: "sync_failure",
          reason: `${droppedCount} offline location point(s) dropped locally after exceeding the on-device queue limit.`,
          lat: next.lat,
          lng: next.lng,
        });
      }
    };

    const handleError = (deniedPermanently: boolean) => {
      if (deniedPermanently) setPermissionDenied(true);
    };

    watcherRef.current = watchLivePosition(handleFix, handleError);

    return () => {
      cancelled = true;
      clearInterval(batteryPoll);
      watcherRef.current?.stop();
      watcherRef.current = null;
    };
  }, [enabled, tripId, trackingSessionId, agentId, mccId, routePointId]);

  return { coords, permissionDenied };
}
