/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from "react";
import { decodePolyline, loadGoogleMaps } from "@/lib/google-maps-loader";
import type { LiveCollection, LivePing, LiveRoutePoint, LiveTrip } from "@/hooks/useLiveOps";

export type MapProps = {
  centre: { name: string; lat: number | null; lng: number | null } | null | undefined;
  trips: LiveTrip[];
  pings: LivePing[];
  points: LiveRoutePoint[];
  collections: LiveCollection[];
  focusAgentId: string | null;
  /** Encoded polyline of a computed driving route to overlay. */
  directionsPolyline?: string | null;
};

const TRAIL_COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#ea580c", "#be123c", "#0891b2"];
const DEFAULT_CENTRE = { lat: 22.3072, lng: 73.1812 };

function dotIcon(maps: typeof google.maps, color: string, scale: number, stroke = "#ffffff") {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: stroke,
    strokeWeight: 2,
  };
}

export default function GoogleLiveMap({
  centre,
  trips,
  pings,
  points,
  collections,
  focusAgentId,
  directionsPolyline,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Overlays that only change on route/collection/direction updates — NOT
  // on every GPS ping. Kept separate from the agent-marker refs below so a
  // ping from one agent never touches stop pins, collection dots, etc.
  const staticOverlaysRef = useRef<Array<google.maps.Marker | google.maps.Polyline>>([]);

  // LIVE TRACKING PLAN — PHASE 4 (performance)
  // "Do not cause the entire map to reload on every GPS update. Update
  // only the required Agent state." — one marker + one trail polyline per
  // shown agent, updated in place (setPosition/setPath) rather than
  // destroyed and recreated whenever a ping for ANY agent arrives.
  const agentOverlaysRef = useRef<
    Map<string, { marker: google.maps.Marker; line: google.maps.Polyline }>
  >(new Map());
  const lastShownAgentsRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new maps.Map(containerRef.current, {
          center: DEFAULT_CENTRE,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        infoRef.current = new maps.InfoWindow();
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const trailsByAgent = useMemo(() => {
    const map = new Map<string, google.maps.LatLngLiteral[]>();
    for (const p of pings) {
      if (p.lat == null || p.lng == null) continue;
      const list = map.get(p.agent_id) ?? [];
      list.push({ lat: p.lat, lng: p.lng });
      map.set(p.agent_id, list);
    }
    return map;
  }, [pings]);

  const shownAgents = useMemo(() => {
    if (focusAgentId) return [focusAgentId];
    return trips
      .filter((t) => t.status === "in_progress")
      .map((t) => t.agent_id)
      .filter((id, i, arr) => arr.indexOf(id) === i);
  }, [trips, focusAgentId]);

  const bindInfoWindow = (
    marker: google.maps.Marker,
    map: google.maps.Map,
    getTitle: () => string,
  ) => {
    marker.addListener("click", () => {
      infoRef.current?.setContent(`<div style="font-size:13px">${getTitle()}</div>`);
      infoRef.current?.open({ map, anchor: marker });
    });
  };

  // Static overlays: centre pin, route stops, collection dots, directions
  // polyline. Only rebuilt when THIS data changes — a GPS ping does not
  // touch any of these.
  useEffect(() => {
    const map = mapRef.current;
    const maps = typeof window !== "undefined" ? window.google?.maps : undefined;
    if (!ready || !map || !maps) return;

    for (const o of staticOverlaysRef.current) o.setMap(null);
    staticOverlaysRef.current = [];

    const bounds = new maps.LatLngBounds();
    let hasBounds = false;

    const addMarker = (
      position: google.maps.LatLngLiteral,
      title: string,
      icon: google.maps.Symbol,
      zIndex = 1,
      label?: google.maps.MarkerLabel,
    ) => {
      const marker = new maps.Marker({ map, position, icon, title, zIndex, label: label ?? null });
      bindInfoWindow(marker, map, () => title);
      staticOverlaysRef.current.push(marker);
      bounds.extend(position);
      hasBounds = true;
    };

    if (centre?.lat != null && centre.lng != null) {
      addMarker(
        { lat: centre.lat, lng: centre.lng },
        `${centre.name} (centre)`,
        dotIcon(maps, "#0f172a", 9),
        5,
      );
    }

    for (const p of points) {
      if (p.lat == null || p.lng == null) continue;
      const isCurrentForAgent = trips.some(
        (t) => t.status === "in_progress" && t.current_route_point_id === p.id,
      );
      addMarker(
        { lat: p.lat, lng: p.lng },
        `Stop ${p.sequence}: ${p.name}${isCurrentForAgent ? " (agent here now)" : ""}`,
        dotIcon(maps, isCurrentForAgent ? "#ea580c" : "#94a3b8", isCurrentForAgent ? 10 : 8),
        isCurrentForAgent ? 8 : 2,
        { text: String(p.sequence), color: "#ffffff", fontSize: "10px", fontWeight: "700" },
      );
    }

    for (const c of collections) {
      if (c.gps_lat == null || c.gps_lng == null) continue;
      const risky = Number(c.risk_score ?? 0) >= 40;
      addMarker(
        { lat: c.gps_lat, lng: c.gps_lng },
        `${c.farmers?.full_name ?? "Farmer"} · ${Number(c.quantity_litres).toFixed(1)} L`,
        dotIcon(maps, risky ? "#dc2626" : "#16a34a", 5),
      );
    }

    if (directionsPolyline) {
      const path = decodePolyline(directionsPolyline);
      const line = new maps.Polyline({
        map,
        path,
        strokeColor: "#1d4ed8",
        strokeOpacity: 0.55,
        strokeWeight: 7,
      });
      staticOverlaysRef.current.push(line);
      for (const p of path) {
        bounds.extend(p);
        hasBounds = true;
      }
    }

    if (hasBounds) map.fitBounds(bounds, 48);
  }, [ready, centre, points, collections, trips, directionsPolyline]);

  // Agent markers + trails: this is the effect that runs on every ping.
  // Updates existing markers/polylines in place; only creates/destroys
  // overlays when an agent actually starts/stops being shown.
  useEffect(() => {
    const map = mapRef.current;
    const maps = typeof window !== "undefined" ? window.google?.maps : undefined;
    if (!ready || !map || !maps) return;

    const shownSet = new Set(shownAgents);
    const store = agentOverlaysRef.current;

    // Remove overlays for agents no longer shown (trip ended, focus changed away).
    for (const [agentId, overlay] of store) {
      if (!shownSet.has(agentId)) {
        overlay.marker.setMap(null);
        overlay.line.setMap(null);
        store.delete(agentId);
      }
    }

    let addedAny = false;
    const bounds = new maps.LatLngBounds();
    let hasBounds = false;

    shownAgents.forEach((agentId, i) => {
      const trail = trailsByAgent.get(agentId) ?? [];
      if (trail.length === 0) return;
      const color = TRAIL_COLORS[i % TRAIL_COLORS.length]!;
      const position = trail[trail.length - 1]!;
      const trip = trips.find((t) => t.agent_id === agentId);
      const title = trip?.agents?.full_name ?? "Agent";

      let overlay = store.get(agentId);
      if (!overlay) {
        const marker = new maps.Marker({
          map,
          position,
          icon: dotIcon(maps, color, 8),
          title,
          zIndex: 10,
        });
        bindInfoWindow(marker, map, () => title);
        const line = new maps.Polyline({
          map,
          path: trail,
          strokeColor: color,
          strokeOpacity: 0.8,
          strokeWeight: 4,
        });
        overlay = { marker, line };
        store.set(agentId, overlay);
        addedAny = true;
      } else {
        // In-place update — no marker/polyline recreation, no flicker.
        overlay.marker.setPosition(position);
        overlay.marker.setTitle(title);
        overlay.line.setPath(trail);
      }
      for (const p of trail) {
        bounds.extend(p);
        hasBounds = true;
      }
    });

    // Only re-fit the viewport when the set of shown agents actually
    // changed (focus toggled, a trip started/ended) — not on every
    // position tick, which would otherwise re-centre/re-zoom the map out
    // from under someone watching it.
    const shownKey = [...shownSet].sort().join(",");
    if ((addedAny || shownKey !== lastShownAgentsRef.current) && hasBounds) {
      map.fitBounds(bounds, 48);
      const listener = maps.event.addListenerOnce(map, "idle", () => {
        if ((map.getZoom() ?? 0) > 16) map.setZoom(16);
      });
      lastShownAgentsRef.current = shownKey;
      return () => maps.event.removeListener(listener);
    }
    lastShownAgentsRef.current = shownKey;
    return;
  }, [ready, trailsByAgent, shownAgents, trips]);

  if (error) {
    return (
      <div className="flex h-[420px] items-center justify-center px-6 text-center text-sm text-muted-foreground lg:h-[560px]">
        {error}
      </div>
    );
  }

  return <div ref={containerRef} className="h-[420px] w-full rounded-xl lg:h-[560px]" />;
}
