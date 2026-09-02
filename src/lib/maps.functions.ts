import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const pointSchema = z.object({ lat: z.number(), lng: z.number() });

const routeInput = z.object({
  origin: pointSchema,
  destination: pointSchema,
  waypoints: z.array(pointSchema).max(23).optional(),
});

export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  startLat: number;
  startLng: number;
};

export type RouteDirections = {
  polyline: string;
  distanceMeters: number;
  durationSeconds: number;
  legs: { distanceMeters: number; durationSeconds: number }[];
  steps: RouteStep[];
};

/**
 * Resolves the server-side Google Maps key. We accept a dedicated
 * GOOGLE_MAPS_API_KEY (recommended — an unrestricted or IP-restricted key
 * used only from the server), falling back to the browser key so a single
 * key works everywhere while you're getting set up.
 */
function resolveServerMapsKey(): string {
  const key =
    process.env["GOOGLE_MAPS_API_KEY"] ??
    process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"];
  if (!key) {
    throw new Error(
      "Google Maps API key missing. Add GOOGLE_MAPS_API_KEY to your .env (or reuse your browser key).",
    );
  }
  return key;
}

/** Computes a driving route (Google Routes API) through the given stops, called directly with your own key. */
export const computeRoute = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => routeInput.parse(input))
  .handler(async ({ data }): Promise<RouteDirections> => {
    const mapsKey = resolveServerMapsKey();

    const toWaypoint = (p: { lat: number; lng: number }) => ({
      location: { latLng: { latitude: p.lat, longitude: p.lng } },
    });

    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": mapsKey,
        "X-Goog-FieldMask":
          "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.startLocation",
      },
      body: JSON.stringify({
        origin: toWaypoint(data.origin),
        destination: toWaypoint(data.destination),
        intermediates: (data.waypoints ?? []).map(toWaypoint),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    });

    if (response.status === 403) {
      const details: Array<{ reason?: string }> = (await response.json())?.error?.details ?? [];
      const reason = details.find((d) => d.reason)?.reason;
      if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
        throw new Error(
          'Google Maps key is referrer-restricted. In Google Cloud Console, either add a separate unrestricted/IP-restricted key as GOOGLE_MAPS_API_KEY for server use, or set this key\'s application restrictions to "None".',
        );
      }
      if (reason === "API_KEY_SERVICE_BLOCKED") {
        throw new Error(
          "This Google Maps key doesn't allow the Routes API. Enable 'Routes API' for it in Google Cloud Console → APIs & Services.",
        );
      }
      throw new Error(
        "Google Maps request was denied (403). Check the key's restrictions and enabled APIs.",
      );
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Routes request failed [${response.status}]: ${errorBody}`);
    }

    const json = (await response.json()) as {
      routes?: Array<{
        polyline?: { encodedPolyline?: string };
        distanceMeters?: number;
        duration?: string;
        legs?: Array<{
          distanceMeters?: number;
          duration?: string;
          steps?: Array<{
            navigationInstruction?: { instructions?: string };
            distanceMeters?: number;
            staticDuration?: string;
            startLocation?: { latLng?: { latitude?: number; longitude?: number } };
          }>;
        }>;
      }>;
    };

    const route = json.routes?.[0];
    if (!route?.polyline?.encodedPolyline)
      throw new Error("No driving route found for these stops.");

    const secs = (d?: string) => Number(String(d ?? "0s").replace("s", "")) || 0;

    const steps: RouteStep[] = (route.legs ?? []).flatMap((l) =>
      (l.steps ?? []).map((s) => ({
        instruction: s.navigationInstruction?.instructions ?? "Continue",
        distanceMeters: s.distanceMeters ?? 0,
        durationSeconds: secs(s.staticDuration),
        startLat: s.startLocation?.latLng?.latitude ?? 0,
        startLng: s.startLocation?.latLng?.longitude ?? 0,
      })),
    );

    return {
      polyline: route.polyline.encodedPolyline,
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds: secs(route.duration),
      legs: (route.legs ?? []).map((l) => ({
        distanceMeters: l.distanceMeters ?? 0,
        durationSeconds: secs(l.duration),
      })),
      steps,
    };
  });
