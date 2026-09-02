/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import type { RoutePointLite } from "@/lib/trip-history";

export type ReplayMapProps = {
  centre: { name: string; lat: number | null; lng: number | null } | null | undefined;
  trail: { lat: number; lng: number }[];
  routePoints: RoutePointLite[];
  collections: { lat: number | null; lng: number | null; label: string }[];
  /** Interpolated current position from useReplayPlayback — updates every animation frame while playing. */
  position: { lat: number; lng: number } | null;
};

const DEFAULT_CENTRE = { lat: 22.3072, lng: 73.1812 };

function dotIcon(maps: typeof google.maps, color: string, scale: number, stroke = "#ffffff") {
  return { path: maps.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: stroke, strokeWeight: 2 };
}

/**
 * LIVE TRACKING PLAN — PHASE 9
 *
 * Sibling of google-live-map.tsx, not a replacement — that component is
 * tuned for "many agents, latest position, growing trail"; this one is
 * tuned for "one trip, full trail already known, marker scrubs back and
 * forth as playback seeks/replays". Sharing one component across both
 * jobs would mean branching most of its internals on a mode flag, which
 * is harder to follow than two small focused components (matches
 * final-integration's "no duplicate map system" as long as this stays
 * genuinely trip-replay-only rather than growing a second live-tracking
 * code path).
 */
export default function ReplayMap({ centre, trail, routePoints, collections, position }: ReplayMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const staticOverlaysRef = useRef<Array<google.maps.Marker | google.maps.Polyline>>([]);
  const fitOnceRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new maps.Map(containerRef.current, {
          center: DEFAULT_CENTRE,
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const trailPath = useMemo(() => trail.map((p) => ({ lat: p.lat, lng: p.lng })), [trail]);

  // Static overlays: full recorded trail, route-point stop pins, collection dots. Built once per trip.
  useEffect(() => {
    const map = mapRef.current;
    const maps = typeof window !== "undefined" ? window.google?.maps : undefined;
    if (!ready || !map || !maps) return;

    for (const o of staticOverlaysRef.current) o.setMap(null);
    staticOverlaysRef.current = [];

    const bounds = new maps.LatLngBounds();
    let hasBounds = false;

    if (trailPath.length > 1) {
      const line = new maps.Polyline({
        map,
        path: trailPath,
        strokeColor: "#2563eb",
        strokeOpacity: 0.55,
        strokeWeight: 5,
      });
      staticOverlaysRef.current.push(line);
      for (const p of trailPath) {
        bounds.extend(p);
        hasBounds = true;
      }
    }

    if (centre?.lat != null && centre.lng != null) {
      const marker = new maps.Marker({
        map,
        position: { lat: centre.lat, lng: centre.lng },
        icon: dotIcon(maps, "#0f172a", 9),
        title: `${centre.name} (centre)`,
        zIndex: 5,
      });
      staticOverlaysRef.current.push(marker);
      bounds.extend({ lat: centre.lat, lng: centre.lng });
      hasBounds = true;
    }

    for (const rp of routePoints) {
      if (rp.lat == null || rp.lng == null) continue;
      const marker = new maps.Marker({
        map,
        position: { lat: rp.lat, lng: rp.lng },
        icon: dotIcon(maps, "#94a3b8", 8),
        title: `Stop ${rp.sequence}: ${rp.name}`,
        label: { text: String(rp.sequence), color: "#ffffff", fontSize: "10px", fontWeight: "700" },
        zIndex: 2,
      });
      staticOverlaysRef.current.push(marker);
      bounds.extend({ lat: rp.lat, lng: rp.lng });
      hasBounds = true;
    }

    for (const c of collections) {
      if (c.lat == null || c.lng == null) continue;
      const marker = new maps.Marker({
        map,
        position: { lat: c.lat, lng: c.lng },
        icon: dotIcon(maps, "#16a34a", 5),
        title: c.label,
        zIndex: 3,
      });
      staticOverlaysRef.current.push(marker);
    }

    if (hasBounds && !fitOnceRef.current) {
      map.fitBounds(bounds, 48);
      fitOnceRef.current = true;
    }
  }, [ready, trailPath, centre, routePoints, collections]);

  // Replay marker: updated in place every animation frame, never recreated.
  useEffect(() => {
    const map = mapRef.current;
    const maps = typeof window !== "undefined" ? window.google?.maps : undefined;
    if (!ready || !map || !maps || !position) return;

    if (!markerRef.current) {
      markerRef.current = new maps.Marker({
        map,
        position,
        icon: dotIcon(maps, "#ea580c", 9),
        zIndex: 20,
      });
    } else {
      markerRef.current.setPosition(position);
    }
  }, [ready, position]);

  if (error) {
    return (
      <div className="flex h-[380px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  return <div ref={containerRef} className="h-[380px] w-full rounded-xl lg:h-[480px]" />;
}
