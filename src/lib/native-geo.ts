import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * A single location fix, normalized across both location sources below so
 * callers (useLiveLocation.ts) never need to know which one produced it.
 */
export type GeoFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  altitude: number | null;
  /** ms since epoch */
  timestamp: number;
};

export type GeoWatchHandle = { stop: () => void };

/**
 * Minimal shape of @capacitor-community/background-geolocation's plugin —
 * declared locally rather than importing its type so this file still
 * type-checks even in a checkout that hasn't run `npm install` yet.
 */
type BackgroundLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  bearing: number | null;
  speed: number | null;
  time: number;
};
type BackgroundGeolocationPlugin = {
  addWatcher(
    options: {
      backgroundTitle?: string;
      backgroundMessage?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (location: BackgroundLocation | null, error: { code: string } | null) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
};

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

/**
 * Continuously watches device position, surviving the screen locking or the
 * app being backgrounded when running as a native app (Android/iOS) —
 * required for live route tracking (§ live tracking, useLiveLocation.ts) to
 * keep sending GPS pings while an agent's phone is in their pocket.
 *
 * On the web (no native shell), this is a thin wrapper over
 * navigator.geolocation.watchPosition, which the browser pauses once the
 * tab is backgrounded — there's no web equivalent to a native foreground
 * service, so background tracking only works in the Capacitor app.
 */
export function watchLivePosition(
  onFix: (fix: GeoFix) => void,
  onError: (deniedPermanently: boolean) => void,
): GeoWatchHandle {
  if (!Capacitor.isNativePlatform()) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return { stop: () => {} };
    }
    const id = navigator.geolocation.watchPosition(
      (position) =>
        onFix({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
          heading: position.coords.heading ?? null,
          speed: position.coords.speed ?? null,
          altitude: position.coords.altitude ?? null,
          timestamp: position.timestamp,
        }),
      (err) => onError(err.code === err.PERMISSION_DENIED),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return { stop: () => navigator.geolocation.clearWatch(id) };
  }

  let watcherId: string | null = null;
  let stopped = false;

  void BackgroundGeolocation.addWatcher(
    {
      // Defining backgroundMessage is what tells the plugin to keep
      // delivering fixes in the background, not just the foreground — see
      // the plugin's README. The persistent notification it forces is an
      // Android requirement for any app that tracks location with the
      // screen off, not something we can suppress.
      backgroundTitle: "DairyOne is tracking your route",
      backgroundMessage: "Recording your live location for this trip. Tap to reopen DairyOne.",
      requestPermissions: true,
      stale: false,
      distanceFilter: 15,
    },
    (location, error) => {
      if (stopped) return;
      if (error) {
        onError(error.code === "NOT_AUTHORIZED");
        return;
      }
      if (!location) return;
      onFix({
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy ?? null,
        heading: location.bearing ?? null,
        speed: location.speed ?? null,
        altitude: location.altitude ?? null,
        timestamp: location.time,
      });
    },
  )
    .then((id) => {
      if (stopped) {
        void BackgroundGeolocation.removeWatcher({ id });
      } else {
        watcherId = id;
      }
    })
    .catch(() => onError(false));

  return {
    stop: () => {
      stopped = true;
      if (watcherId) void BackgroundGeolocation.removeWatcher({ id: watcherId });
    },
  };
}
