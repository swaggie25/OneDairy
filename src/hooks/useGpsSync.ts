import { useEffect, useState } from "react";
import {
  flushGpsQueue,
  queueStats,
  retryFailedGpsPings,
  subscribeGpsQueue,
  type QueueStats,
} from "@/lib/gps-offline-queue";

/**
 * LIVE TRACKING PLAN — PHASE 8
 *
 * Drives the background flush of queued gps_pings and exposes the sync
 * state a Punch In / trip screen needs to render "Synced" / "Pending
 * Sync" / "Syncing" / "Sync Failed" — never hidden, per spec. Safe to
 * mount on multiple screens at once (same pattern as useOfflineQueue):
 * flushGpsQueue() has its own re-entrancy guard, so overlapping intervals
 * across pages just no-op instead of double-flushing.
 */
export function useGpsSync() {
  const [stats, setStats] = useState<QueueStats>({ pending: 0, syncing: 0, failed: 0, total: 0 });
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setStats(queueStats());
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const unsubscribe = subscribeGpsQueue(setStats);

    const sync = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void flushGpsQueue();
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    // Shorter tick than the milk-collection queue: location trail
    // completeness (Phase 9 replay/reports) degrades the longer pings sit
    // unsynced, and pings are cheap/small to retry often.
    const timer = window.setInterval(sync, 10_000);
    sync();

    return () => {
      unsubscribe();
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.clearInterval(timer);
    };
  }, []);

  const status: "synced" | "pending" | "syncing" | "failed" =
    stats.failed > 0 ? "failed" : stats.syncing > 0 ? "syncing" : stats.pending > 0 ? "pending" : "synced";

  return { ...stats, online, status, flush: flushGpsQueue, retryFailed: retryFailedGpsPings };
}
