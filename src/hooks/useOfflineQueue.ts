import { useEffect, useState } from "react";
import { flushQueue, queueSize, subscribeQueue } from "@/lib/offline-queue";

/** Tracks pending offline entries and flushes them when the network returns. */
export function useOfflineQueue() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    setPending(queueSize());
    setOnline(navigator.onLine);
    const unsubscribe = subscribeQueue(setPending);

    const sync = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        void flushQueue().then((result) => {
          setLastError(result.errors[0] ?? null);
        });
      }
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const timer = window.setInterval(sync, 20_000);
    sync();

    return () => {
      unsubscribe();
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.clearInterval(timer);
    };
  }, []);

  return { pending, online, lastError, flush: flushQueue };
}
