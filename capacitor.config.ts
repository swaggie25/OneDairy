import type { CapacitorConfig } from "@capacitor/cli";

/*
 * DairyOne is a server-rendered TanStack Start app (src/server.ts runs
 * server functions like computeRoute and Supabase-auth-aware SSR) — there
 * is no static `index.html`/`dist` to bundle into the app the way a plain
 * SPA would. So this config points the native WebView at a real server
 * instead of local files, the same pattern hybrid apps like early
 * Twitter/Instagram used.
 *
 * IMPORTANT — this URL must be either https://, or the literal hostname
 * `localhost`/`127.0.0.1`, even over http. Geolocation and camera
 * (getUserMedia — your QR scanner) are "powerful features" gated by the
 * browser's Secure Contexts spec: on any other http:// origin — including
 * a LAN IP like 192.168.x.x, or the emulator's 10.0.2.2 alias — Chromium
 * silently refuses to even ask for permission. No dialog, no error, the
 * call just does nothing. This is a WebView/browser-engine restriction,
 * not something a Capacitor flag can override.
 *
 * The fix for real-device testing: forward a port over USB with adb, then
 * point the app at localhost so it's exempt from that check:
 *
 *   adb reverse tcp:8080 tcp:8080
 *   CAP_ENV=dev npx cap sync android    # uses the default below
 *
 * (For the emulator, same idea: `adb -s emulator-5554 reverse tcp:8080
 * tcp:8080`, then still load localhost — 10.0.2.2 alone doesn't help here
 * the way it does for plain network requests, precisely because it isn't
 * "localhost" as far as the secure-context check is concerned.)
 *
 * Once DairyOne is actually deployed (Cloudflare/Vercel/etc. — real TLS),
 * set CAP_PROD_URL to that https:// URL and none of this matters anymore.
 */

const isDev = process.env.CAP_ENV === "dev";
const DEV_SERVER_URL = process.env.CAP_DEV_URL ?? "http://192.168.1.6:8080/auth";
const PROD_SERVER_URL = process.env.CAP_PROD_URL ?? "http://192.168.1.6:8080/auth";

const config: CapacitorConfig = {
  appId: "com.dairyone.agent",
  appName: "DairyOne",
  // Not actually served from — see comment above — but required by the
  // Capacitor CLI as a sync source. Kept intentionally empty.
  webDir: "www",
  server: {
    url: isDev ? DEV_SERVER_URL : PROD_SERVER_URL,
    // Always on, not just `isDev`, because neither URL above is behind
    // real TLS yet — the previous `cleartext: isDev` was exactly what
    // produced ERR_CLEARTEXT_NOT_PERMITTED as soon as PROD_SERVER_URL (or
    // an env override) pointed at another http:// address. Switch this
    // back to `isDev` once PROD_SERVER_URL is a genuine https:// deployment
    // and you want the release build to actually enforce TLS.
    cleartext: true,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    // Required by @capacitor-community/background-geolocation: without it,
    // Android stops delivering location updates ~5 minutes after the app is
    // backgrounded/screen-locked, defeating the point of background
    // tracking. See node_modules/@capacitor-community/background-geolocation/README.md.
    useLegacyBridge: true,
  },
};

export default config;
