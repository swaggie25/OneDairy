/** Browser geolocation helper with a safe timeout and no throwing. */
export type Coords = { lat: number | null; lng: number | null; accuracy: number | null };

export const NO_COORDS: Coords = { lat: null, lng: null, accuracy: null };

export function getCoords(timeoutMs = 8000): Promise<Coords> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(NO_COORDS);
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (c: Coords) => {
      if (!settled) {
        settled = true;
        resolve(c);
      }
    };
    navigator.geolocation.getCurrentPosition(
      (p) =>
        done({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy ?? null,
        }),
      () => done(NO_COORDS),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 },
    );
    setTimeout(() => done(NO_COORDS), timeoutMs + 500);
  });
}

/** Great-circle distance between two points, in metres. */
export function haversineMeters(
  lat1: number | null | undefined,
  lng1: number | null | undefined,
  lat2: number | null | undefined,
  lng2: number | null | undefined,
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Approximate perpendicular distance (metres) from a point to the nearest
 * segment of a path (e.g. a decoded route polyline). Projects onto each
 * segment in an equirectangular approximation — accurate enough for
 * deviation-threshold checks over the short segment lengths of a local
 * delivery route; not for long geodesics.
 */
export function distanceToPathMeters(
  lat: number,
  lng: number,
  path: { lat: number; lng: number }[],
): number | null {
  if (path.length === 0) return null;
  if (path.length === 1) return haversineMeters(lat, lng, path[0]!.lat, path[0]!.lng);

  const toRad = (d: number) => (d * Math.PI) / 180;
  const latRef = toRad(lat);
  const R = 6371000;
  // Local equirectangular projection (metres) around the query point.
  const toXY = (p: { lat: number; lng: number }) => ({
    x: toRad(p.lng - lng) * Math.cos(latRef) * R,
    y: toRad(p.lat - lat) * R,
  });

  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = toXY(path[i]!);
    const b = toXY(path[i + 1]!);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : (-a.x * dx - a.y * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const d = Math.hypot(px, py);
    if (d < best) best = d;
  }
  return best;
}

export function watchCoords(onUpdate: (c: Coords) => void): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (p) =>
      onUpdate({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy ?? null,
      }),
    () => onUpdate(NO_COORDS),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
