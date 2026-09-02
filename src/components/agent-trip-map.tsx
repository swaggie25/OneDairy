/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from "react";
import { decodePolyline, loadGoogleMaps } from "@/lib/google-maps-loader";
import type { LiveCoords } from "@/hooks/useLiveLocation";

export type TripStop = {
  id: string;
  name: string;
  sequence: number;
  lat: number | null;
  lng: number | null;
  status: "done" | "current" | "upcoming" | "problem";
};

export type AgentTripMapProps = {
  currentPos: LiveCoords | null;
  centre: { name: string; lat: number | null; lng: number | null } | null | undefined;
  stops: TripStop[];
  directionsPolyline?: string | null;
  heightClassName?: string;
};

/*
 * Google Maps' Marker API takes a raw hex fillColor — it renders on a
 * canvas, not the DOM, so it can't read our --color-status-* CSS custom
 * properties directly. These hex values are computed from the exact same
 * oklch definitions in styles.css, so the map pins and the StopPin/
 * StatusBadge components elsewhere in the app read as the same palette,
 * even though this one spot can't share the token at runtime.
 */
const STATUS_COLOR: Record<TripStop["status"], string> = {
  done: "#269e5f", // --success
  current: "#0058c9", // --primary / --status-active
  upcoming: "#94a3b8", // --muted-foreground family
  problem: "#ebaa2d", // --warning
};

export default function AgentTripMap({
  currentPos,
  centre,
  stops,
  directionsPolyline,
  heightClassName = "h-56",
}: AgentTripMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<Array<google.maps.Marker | google.maps.Polyline>>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fittedOnceRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new maps.Map(containerRef.current, {
          center:
            centre?.lat != null && centre.lng != null
              ? { lat: centre.lat, lng: centre.lng }
              : { lat: 22.3072, lng: 73.1812 },
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validStops = useMemo(() => stops.filter((s) => s.lat != null && s.lng != null), [stops]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = typeof window !== "undefined" ? window.google?.maps : undefined;
    if (!ready || !map || !maps) return;

    for (const o of overlaysRef.current) o.setMap(null);
    overlaysRef.current = [];

    const bounds = new maps.LatLngBounds();
    let hasBounds = false;

    for (const s of validStops) {
      const marker = new maps.Marker({
        map,
        position: { lat: s.lat!, lng: s.lng! },
        label: {
          text: String(s.sequence),
          color: "#ffffff",
          fontSize: "11px",
          fontWeight: "700",
        },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: s.status === "current" || s.status === "problem" ? 11 : 9,
          fillColor: STATUS_COLOR[s.status],
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        zIndex: s.status === "current" ? 20 : s.status === "problem" ? 15 : 5,
        title: s.status === "problem" ? `${s.name} — open exception` : s.name,
      });
      overlaysRef.current.push(marker);
      bounds.extend({ lat: s.lat!, lng: s.lng! });
      hasBounds = true;
    }

    if (currentPos) {
      const marker = new maps.Marker({
        map,
        position: { lat: currentPos.lat, lng: currentPos.lng },
        icon:
          currentPos.heading != null
            ? {
                path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 6,
                rotation: currentPos.heading,
                fillColor: STATUS_COLOR.current,
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              }
            : {
                path: maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: STATUS_COLOR.current,
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 3,
              },
        zIndex: 30,
        title: "You",
      });
      overlaysRef.current.push(marker);
      bounds.extend({ lat: currentPos.lat, lng: currentPos.lng });
      hasBounds = true;
    }

    if (directionsPolyline) {
      const path = decodePolyline(directionsPolyline);
      const line = new maps.Polyline({
        map,
        path,
        strokeColor: STATUS_COLOR.current,
        strokeOpacity: 0.7,
        strokeWeight: 5,
      });
      overlaysRef.current.push(line);
    }

    if (hasBounds && !fittedOnceRef.current) {
      map.fitBounds(bounds, 40);
      fittedOnceRef.current = true;
    } else if (hasBounds && currentPos) {
      // Keep following the agent without yanking zoom around on every ping.
      map.panTo({ lat: currentPos.lat, lng: currentPos.lng });
    }
  }, [ready, validStops, currentPos, directionsPolyline]);

  if (error) {
    return (
      <div
        className={`flex ${heightClassName} items-center justify-center rounded-xl bg-secondary px-4 text-center text-xs text-muted-foreground`}
      >
        {error}
      </div>
    );
  }

  return <div ref={containerRef} className={`${heightClassName} w-full rounded-xl`} />;
}
