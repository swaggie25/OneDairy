import { supabase } from "@/integrations/supabase/client";

/**
 * LIVE TRACKING PLAN — PHASE 8: Offline Tracking + Sync + Reliability
 *
 * Local-first queue for gps_pings, mirroring the existing milk-collection
 * queue (`lib/offline-queue.ts`) so the app has one consistent offline
 * pattern rather than two. useLiveLocation.ts now ALWAYS enqueues a fix
 * here first (synchronous, can't fail) and a background flush pushes it to
 * Supabase whenever we're online — the write is never attempted "live" and
 * silently dropped on failure like pre-Phase-8.
 *
 * Guarantees this file is responsible for:
 *  - Original GPS timestamp preserved: `recorded_at` is set by the caller
 *    from `position.timestamp` before the item ever reaches this queue, and
 *    flushing never rewrites it — a fix captured at 08:10 while offline is
 *    still stored as 08:10 once it syncs at 08:20, never as "now".
 *  - Idempotency: every item carries the `client_id` already used by
 *    Phase 3 (`gps_pings_client_id_uidx` partial unique index). A retried
 *    flush that partially succeeded server-side just hits a duplicate-key
 *    error (23505) on the rows that already landed — treated as success,
 *    not an error, and never re-queued.
 *  - Visible sync state: every item tracks pending → syncing → synced, or
 *    failed (surfaced via `syncing`/`failed` in QueueStats — see
 *    useGpsSync.ts). Failures are never hidden; they stay queued and keep
 *    retrying on the next flush tick rather than being silently dropped.
 *  - Bounded local storage: `MAX_QUEUE_SIZE` caps how much a single device
 *    holds locally. If a device is offline long enough to hit the cap, the
 *    OLDEST points are dropped (not the newest — the freshest position is
 *    more operationally useful than an ancient one) and the drop is
 *    reported back to the caller so it can raise a visible
 *    `sync_failure` exception (Phase 7 infra) rather than losing history
 *    silently.
 */

const KEY = "dairyone.gps-queue.v1";

/** ~an 8+ hour shift even at the most aggressive (10s, moving) sampling interval. */
const MAX_QUEUE_SIZE = 3000;

/** Give up retrying a single item after this many failed attempts and mark it "failed" (still kept, still shown, no longer retried every tick — manual flush can still pick it up). */
const MAX_AUTO_RETRIES = 8;

export type QueuedPing = {
  client_id: string;
  trip_id: string | null;
  tracking_session_id: string | null;
  agent_id: string;
  mcc_id: string;
  route_point_id: string | null;
  event_type: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  altitude: number | null;
  speed_kmh: number | null;
  quality: "good" | "weak" | "stale";
  /** Original device/GPS fix timestamp — never touched after enqueue. */
  recorded_at: string;
};

type StoredPing = QueuedPing & {
  syncState: "pending" | "syncing" | "failed";
  attempts: number;
};

export type QueueStats = {
  pending: number;
  syncing: number;
  failed: number;
  total: number;
};

type Listener = (stats: QueueStats) => void;
const listeners = new Set<Listener>();

function statsOf(items: StoredPing[]): QueueStats {
  let pending = 0;
  let syncing = 0;
  let failed = 0;
  for (const item of items) {
    if (item.syncState === "pending") pending += 1;
    else if (item.syncState === "syncing") syncing += 1;
    else failed += 1;
  }
  return { pending, syncing, failed, total: items.length };
}

function read(): StoredPing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredPing[]) : [];
  } catch {
    // Corrupt local data must never crash tracking — start clean rather
    // than throwing on every read.
    return [];
  }
}

function write(items: StoredPing[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Quota exceeded or storage unavailable — nothing more we can do
    // locally; next enqueue will keep trying and trimming.
  }
  const stats = statsOf(items);
  listeners.forEach((l) => l(stats));
}

export function queueStats(): QueueStats {
  return statsOf(read());
}

export function subscribeGpsQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(statsOf(read()));
  return () => listeners.delete(listener);
}

export type EnqueueResult = { droppedCount: number };

/** Always succeeds locally (synchronous, can't fail the caller). Returns how many OLDEST points were dropped to stay under MAX_QUEUE_SIZE, if any. */
export function enqueuePing(ping: QueuedPing): EnqueueResult {
  const items = read();
  // De-dupe defensively: a duplicate watchPosition fire producing the same
  // client_id before the first copy has flushed should never double-queue.
  if (items.some((i) => i.client_id === ping.client_id)) return { droppedCount: 0 };

  items.push({ ...ping, syncState: "pending", attempts: 0 });

  let droppedCount = 0;
  if (items.length > MAX_QUEUE_SIZE) {
    droppedCount = items.length - MAX_QUEUE_SIZE;
    items.splice(0, droppedCount); // drop oldest first
  }

  write(items);
  return { droppedCount };
}

let flushing = false;

export type FlushResult = { synced: number; failed: number; errors: string[] };

/**
 * Pushes queued pings to Supabase in original-recorded_at order. Safe to
 * call repeatedly/concurrently (re-entrant calls are no-ops). Items that
 * fail stay in the queue with syncState "failed" once MAX_AUTO_RETRIES is
 * hit — never dropped, so a manual retry (or the next successful flush
 * window) can still recover them.
 */
export async function flushGpsQueue(): Promise<FlushResult> {
  if (flushing) return { synced: 0, failed: 0, errors: [] };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, failed: 0, errors: [] };

  flushing = true;
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    let items = read();
    if (items.length === 0) return { synced: 0, failed: 0, errors: [] };

    // Mark everything we're about to attempt as "syncing" so the UI can
    // show "Syncing…" rather than a stale "Pending" while a flush is in
    // flight — an accurate state per the Phase 8 "do not hide sync
    // failures" / "sync status must be visible" requirement.
    items = items.map((i) => (i.syncState === "failed" && i.attempts >= MAX_AUTO_RETRIES ? i : { ...i, syncState: "syncing" as const }));
    write(items);

    const attempted = items.filter((i) => i.syncState === "syncing");
    const remaining: StoredPing[] = items.filter((i) => i.syncState !== "syncing");

    // Sequential, oldest-first: preserves the original recorded_at
    // ordering server-side and keeps this simple/predictable rather than
    // racing concurrent inserts against the same tracking_session trigger.
    attempted.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

    for (const item of attempted) {
      const { syncState: _s, attempts, ...ping } = item;
      const { error } = await supabase.from("gps_pings").insert({
        trip_id: ping.trip_id,
        tracking_session_id: ping.tracking_session_id,
        agent_id: ping.agent_id,
        mcc_id: ping.mcc_id,
        route_point_id: ping.route_point_id,
        event_type: ping.event_type,
        lat: ping.lat,
        lng: ping.lng,
        accuracy: ping.accuracy,
        heading: ping.heading,
        altitude: ping.altitude,
        speed_kmh: ping.speed_kmh,
        quality: ping.quality,
        client_id: ping.client_id,
        recorded_at: ping.recorded_at, // original device fix time, not now()
        sync_state: "synced",
      });

      if (error) {
        if (error.code === "23505") {
          // Already landed on a previous partial flush — success, not a failure.
          synced += 1;
          continue;
        }
        const nextAttempts = attempts + 1;
        remaining.push({
          ...item,
          attempts: nextAttempts,
          syncState: nextAttempts >= MAX_AUTO_RETRIES ? "failed" : "pending",
        });
        failed += 1;
        errors.push(error.message);
      } else {
        synced += 1;
      }
    }

    write(remaining);
  } finally {
    flushing = false;
  }

  return { synced, failed, errors };
}

/** Manual retry from the UI: resets "failed" items back to "pending" (fresh attempt budget) then flushes. */
export async function retryFailedGpsPings(): Promise<FlushResult> {
  const items = read().map((i) => (i.syncState === "failed" ? { ...i, syncState: "pending" as const, attempts: 0 } : i));
  write(items);
  return flushGpsQueue();
}
