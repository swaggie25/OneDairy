import { Capacitor } from "@capacitor/core";
import { Device } from "@capacitor/device";
import { Geolocation } from "@capacitor/geolocation";
import { getBatteryLevel } from "@/lib/tracking-quality";

/**
 * §5.1 — Pre-shift Device Readiness.
 *
 * "Continuous tracking" mirrors the same permission signal as "Precise
 * location" rather than being an independent check. That was originally
 * because this was a plain web app with no OS-level background-location
 * permission to query — now that the Android build runs a real foreground
 * service (@capacitor-community/background-geolocation, see
 * src/lib/native-geo.ts), there IS a more precise thing this could check on
 * native. Left as-is for now since foreground location being granted is
 * the practical gate either way (the service can't do anything without it)
 * — revisit if "Continuous tracking" showing green while background access
 * is separately blocked turns out to be a real support headache.
 */

export type ReadinessLevel = "success" | "warning" | "danger" | "muted";

export type ReadinessCheck = {
  id: "location" | "tracking" | "internet" | "battery" | "notifications";
  label: string;
  level: ReadinessLevel;
  detail: string;
  /** Plain-language explanation shown when a row isn't fully green. */
  explanation?: string;
  /** Whether a "Fix now" action is available for this row. */
  fixable: boolean;
};

const LOW_BATTERY_THRESHOLD = 0.2;
const CRITICAL_BATTERY_THRESHOLD = 0.1;

async function checkLocationPermission(): Promise<{
  level: ReadinessLevel;
  detail: string;
  explanation?: string;
}> {
  // Native: `navigator.permissions.query` inside the WebView doesn't
  // reliably reflect the real Android runtime permission, and there's no
  // web equivalent of a system permission dialog to fall back on anyway —
  // ask the @capacitor/geolocation plugin directly, same plugin "Fix now"
  // uses below to actually trigger that dialog.
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Geolocation.checkPermissions();
      if (status.location === "granted") return { level: "success", detail: "Allowed" };
      if (status.location === "denied")
        return {
          level: "danger",
          detail: "Blocked",
          explanation:
            "Location is blocked for DairyOne. Trips can't be tracked or verified until you allow it in your phone's app settings.",
        };
      return {
        level: "warning",
        detail: "Not yet granted",
        explanation: "Tap \"Fix now\" to allow location for DairyOne.",
      };
    } catch {
      return { level: "muted", detail: "Couldn't check" };
    }
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      level: "danger",
      detail: "Not supported",
      explanation: "This browser doesn't support location services at all.",
    };
  }
  if (!navigator.permissions?.query) {
    // Older Safari/WebViews: no Permissions API. Not a failure, just unknown
    // until the agent actually punches in and the browser prompts.
    return { level: "muted", detail: "Will prompt when needed" };
  }
  try {
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });
    if (status.state === "granted") return { level: "success", detail: "Allowed" };
    if (status.state === "prompt")
      return {
        level: "warning",
        detail: "Not yet granted",
        explanation: "You'll be asked to allow location the first time you punch in.",
      };
    return {
      level: "danger",
      detail: "Blocked",
      explanation:
        "Location is blocked for DairyOne. Trips can't be tracked or verified until you allow it in your browser/app settings.",
    };
  } catch {
    return { level: "muted", detail: "Couldn't check" };
  }
}

function checkInternet(): { level: ReadinessLevel; detail: string; explanation?: string } {
  if (typeof navigator === "undefined") return { level: "muted", detail: "Unknown" };
  if (navigator.onLine) return { level: "success", detail: "Connected" };
  return {
    level: "warning",
    detail: "Offline",
    explanation:
      "You can still collect — entries and location are saved on this phone and sync automatically once you're back online.",
  };
}

/**
 * Battery level, 0–1, for the readiness screen. Prefers the native
 * Capacitor Device plugin — the plain web `getBatteryLevel()` (Chromium's
 * old Battery Status API) was removed from every modern browser and
 * WebView years ago for fingerprinting reasons, which is why this showed
 * "Unknown" on the Android app specifically; the native plugin doesn't
 * have that restriction. Web build still falls back to the old API, so it
 * keeps behaving exactly as before there (i.e. usually "Unknown" too —
 * that part's a real, permanent web-platform gap, not something to paper
 * over here).
 */
async function readBatteryLevel(): Promise<number | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await Device.getBatteryInfo();
      return typeof info.batteryLevel === "number" ? info.batteryLevel : null;
    } catch {
      return null;
    }
  }
  return getBatteryLevel();
}

async function checkBattery(): Promise<{
  level: ReadinessLevel;
  detail: string;
  explanation?: string;
}> {
  const pct = await readBatteryLevel();
  if (pct == null) return { level: "muted", detail: "Unknown" };
  const percent = Math.round(pct * 100);
  if (pct <= CRITICAL_BATTERY_THRESHOLD) {
    return {
      level: "danger",
      detail: `${percent}%`,
      explanation:
        "Very low battery — location tracking may stop if the phone shuts down mid-shift.",
    };
  }
  if (pct <= LOW_BATTERY_THRESHOLD) {
    return {
      level: "warning",
      detail: `${percent}%`,
      explanation:
        "Consider charging before you head out — a full shift needs the battery to last.",
    };
  }
  return { level: "success", detail: `${percent}%` };
}

function checkNotifications(): { level: ReadinessLevel; detail: string; explanation?: string } {
  if (typeof Notification === "undefined") return { level: "muted", detail: "Not supported" };
  if (Notification.permission === "granted") return { level: "success", detail: "Allowed" };
  if (Notification.permission === "denied")
    return {
      level: "warning",
      detail: "Blocked",
      explanation: "You won't get alerts for handover updates or manager messages.",
    };
  return {
    level: "warning",
    detail: "Not yet granted",
    explanation: "Allow notifications so you don't miss handover or route updates.",
  };
}

export async function runReadinessChecks(): Promise<ReadinessCheck[]> {
  const [location, internet, battery] = await Promise.all([
    checkLocationPermission(),
    Promise.resolve(checkInternet()),
    checkBattery(),
  ]);
  const notifications = checkNotifications();

  // "Continuous tracking" mirrors the location permission — see note above
  // on why this isn't an independent check on the web.
  const tracking: { level: ReadinessLevel; detail: string; explanation?: string } =
    location.level === "success"
      ? { level: "success", detail: "Ready" }
      : {
          level: location.level,
          detail: location.detail,
          explanation: "Depends on Precise location above — fix that first.",
        };

  return [
    {
      id: "location",
      label: "Precise location",
      fixable: location.level !== "muted",
      ...location,
    },
    {
      id: "tracking",
      label: "Continuous tracking",
      fixable: false,
      ...tracking,
    },
    {
      id: "internet",
      label: "Internet connection",
      fixable: false,
      ...internet,
    },
    {
      id: "battery",
      label: "Battery",
      fixable: false,
      ...battery,
    },
    {
      id: "notifications",
      label: "Notifications",
      fixable: notifications.level !== "success" && typeof Notification !== "undefined",
      ...notifications,
    },
  ];
}

export async function requestLocationPermission(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // This is the actual fix: @capacitor/geolocation's requestPermissions()
    // calls Android's ActivityCompat.requestPermissions() under the hood,
    // which is what shows the system "Allow DairyOne to access this
    // device's location?" dialog. Plain navigator.geolocation calls (what
    // this used to do) have no way to trigger that dialog on native — they
    // just fail silently if the OS permission isn't already granted.
    try {
      await Geolocation.requestPermissions();
    } catch {
      // Ignored — runReadinessChecks() right after this will reflect
      // whatever the actual resulting permission state is.
    }
    return;
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  await new Promise<void>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(),
      () => resolve(),
      { timeout: 10_000 },
    );
  });
}

export async function requestNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined") return;
  await Notification.requestPermission();
}
