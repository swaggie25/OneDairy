import { useEffect, useMemo, useRef, useState } from "react";
import type { Ping } from "@/lib/trip-history";

/**
 * LIVE TRACKING PLAN — PHASE 9
 *
 * "Allow users to replay the actual historical journey. Do not simulate
 * anything that was not recorded." — this drives a marker through the
 * REAL gps_pings trail, timed against the REAL gaps between recorded
 * fixes (scaled by the speed multiplier). Between two consecutive real
 * fixes the marker's screen position is linearly interpolated in
 * proportion to elapsed real time — that's a rendering technique (how
 * every GPS replay/flight-tracker UI smooths a marker between samples),
 * not a fabricated GPS reading: no new lat/lng value is ever invented,
 * stored, or reported as data: it's simply how getPositionAt() draws the
 * line between two real points while time passes between them.
 */

export type ReplaySpeed = 1 | 2 | 4;

export function useReplayPlayback(pings: Ping[]) {
  const sorted = useMemo(
    () =>
      [...pings]
        .filter((p) => p.lat != null && p.lng != null)
        .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)),
    [pings],
  );

  const startMs = sorted[0] ? new Date(sorted[0].recorded_at).getTime() : 0;
  const endMs = sorted[sorted.length - 1] ? new Date(sorted[sorted.length - 1]!.recorded_at).getTime() : 0;
  const totalMs = Math.max(0, endMs - startMs);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const [elapsedMs, setElapsedMs] = useState(0);

  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      lastFrameRef.current = null;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = (now: number) => {
      if (lastFrameRef.current != null) {
        const deltaMs = (now - lastFrameRef.current) * speed;
        setElapsedMs((prev) => {
          const next = prev + deltaMs;
          if (next >= totalMs) {
            setPlaying(false);
            return totalMs;
          }
          return next;
        });
      }
      lastFrameRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, totalMs]);

  // Reset when the underlying trail changes (e.g. navigating to a different trip).
  useEffect(() => {
    setElapsedMs(0);
    setPlaying(false);
  }, [sorted.length, startMs]);

  const currentMs = startMs + elapsedMs;

  /** Interpolated {lat, lng} at the current playback time, plus the bracketing real fixes for context. */
  const position = useMemo(() => {
    if (sorted.length === 0) return null;
    if (sorted.length === 1) return { lat: sorted[0]!.lat!, lng: sorted[0]!.lng!, index: 0 };

    let i = 0;
    while (i < sorted.length - 1 && new Date(sorted[i + 1]!.recorded_at).getTime() < currentMs) i++;
    const a = sorted[i]!;
    const b = sorted[Math.min(i + 1, sorted.length - 1)]!;
    const aMs = new Date(a.recorded_at).getTime();
    const bMs = new Date(b.recorded_at).getTime();
    const t = bMs > aMs ? Math.min(1, Math.max(0, (currentMs - aMs) / (bMs - aMs))) : 0;
    return {
      lat: a.lat! + (b.lat! - a.lat!) * t,
      lng: a.lng! + (b.lng! - a.lng!) * t,
      index: i,
    };
  }, [sorted, currentMs]);

  const seekTo = (ms: number) => setElapsedMs(Math.min(totalMs, Math.max(0, ms)));
  const seekToFraction = (frac: number) => seekTo(frac * totalMs);

  return {
    fullTrail: sorted.map((p) => ({ lat: p.lat!, lng: p.lng! })),
    hasData: sorted.length > 0,
    startAt: sorted[0]?.recorded_at ?? null,
    endAt: sorted[sorted.length - 1]?.recorded_at ?? null,
    totalMs,
    elapsedMs,
    currentTimeIso: sorted.length > 0 ? new Date(currentMs).toISOString() : null,
    position,
    playing,
    speed,
    play: () => totalMs > 0 && setPlaying(true),
    pause: () => setPlaying(false),
    setSpeed,
    seekTo,
    seekToFraction,
    restart: () => {
      setElapsedMs(0);
      setPlaying(true);
    },
  };
}
