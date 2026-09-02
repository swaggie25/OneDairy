# DairyOne Live Tracking — Phase 8 Report: Offline Tracking + Sync + Reliability

## 0. Audit finding before Phase 8 work started

The repo on `main` did not actually build. `live.tsx` and `manager.tsx` import
from `@/lib/exceptions` and `@/lib/route-exceptions`, and `useLiveOps.ts`
imports `useMccExceptionConfig`/`useLiveTrackingSessions`/`useLiveExceptions`
— all added by `phase7-changes.patch`, which was committed to the repo root
but never actually applied to the source tree. The Supabase project itself
was fine (the Phase 7 migration was applied live), but three source files
were simply missing. This blocked `vite build` entirely, independent of any
Phase 8 change.

**Fixed as part of this session:** applied the unapplied parts of
`phase7-changes.patch` — restored `src/lib/exceptions.ts`,
`src/lib/route-exceptions.ts`, the `distanceToPathMeters` addition to
`src/lib/geo.ts`, and the missing hook block in `src/hooks/useLiveOps.ts`
(a first attempt at re-applying via `patch` duplicated code that already
existed elsewhere in the file under a different line offset — caught by
`tsc` reporting duplicate exports, and removed). Also restored the missing
migration file `supabase/migrations/20260821130000_livetrack_phase7_exceptions.sql`
for repo history (no DB action needed — already live).

**Verified:** `npx tsc --noEmit` and `npx vite build` both succeed now, with
only pre-existing, unrelated type issues remaining (Supabase generated-type
strictness in the *pre-existing* `offline-queue.ts`, and two unrelated route
files) — none of these touch tracking code and none are new.

---

## 1. What already existed (Phase 8 scope)

- `gps_pings` already had `client_id` (partial unique index for idempotency),
  `sync_state`, and `synced_at` columns, added in the Phase 3 migration with
  a comment explicitly flagging them as groundwork for Phase 8.
- `useLiveLocation.ts` (the GPS watcher) wrote **directly and only** to
  Supabase. Its own comment said a failed write "is simply skipped (never
  queued yet, never faked as sent)" — i.e. offline location points were
  silently lost. This was the actual gap.
- An offline-queue pattern already existed for milk collections
  (`lib/offline-queue.ts` / `useOfflineQueue.ts`, localStorage-backed,
  `client_ref`-idempotent) — reused as the architectural template rather
  than inventing a new pattern.
- Platform: TanStack Start web app / PWA (manifest only, no service worker,
  no Capacitor/native wrapper) — confirmed in Phase 1. No true
  background/screen-locked GPS; "offline" here means the tab stays open
  without a network connection, not the OS killing the page in the
  background. This limitation is unchanged by Phase 8.

## 2. What was implemented

**`src/lib/gps-offline-queue.ts`** (new) — local-first queue for `gps_pings`:
- `enqueuePing()` is synchronous and cannot fail the caller; every fix that
  clears Phase 3's adaptive-sampling check goes here first.
- `flushGpsQueue()` pushes queued pings to Supabase in original
  `recorded_at` order (oldest first) whenever `navigator.onLine`. A device
  offline 08:10–08:20 still ships rows timestamped 08:10/11/12/13 — the
  actual insert never rewrites `recorded_at` to "now".
- Idempotent via the existing `client_id` unique index: a `23505` duplicate
  error on retry is treated as success, not failure — never re-queued,
  never duplicated.
- Visible sync state per item: `pending → syncing → synced`, or `failed`
  after 8 auto-retries (kept, not dropped — a manual retry can still
  recover it). Nothing is ever hidden.
- Bounded storage: capped at 3000 points (~8+ hours even at the most
  aggressive 10s/moving sampling interval). On overflow, **oldest** points
  are dropped (freshest position is operationally more useful than an
  ancient one), and the caller is told how many were dropped.

**`src/hooks/useLiveLocation.ts`** — now enqueues instead of inserting
directly. On a queue overflow it raises a `sync_failure` row in
`trip_exceptions` (reusing Phase 7 infra) so a dropped-history event is a
reviewable exception, not a silent gap — skipped only in the (rare) window
before a trip exists yet, since `trip_exceptions.trip_id` is required.

**`src/hooks/useGpsSync.ts`** (new) — drives the background flush loop
(10s tick + `online`/`offline` listeners) and exposes
`Synced / Pending Sync / Syncing / Sync Failed` status, mirroring the
existing `useOfflineQueue` UX pattern.

**UI wiring:**
- `agent.tsx` — new sync-status card next to the existing milk-collection
  sync card, showing pending/syncing/failed counts with a manual retry
  button when relevant.
- `trip.tsx` — compact banner alongside the existing offline banner.
- `route-marking.tsx` — mounts `useGpsSync()` to keep the background flush
  running while marking a route (no dedicated banner; this screen isn't
  the primary sync-status surface).

## 3. Idempotency

Unchanged mechanism, now actually used: `gps_pings_client_id_uidx` (Phase 3)
is the server-side guarantee. The client-side de-dupe in `enqueuePing`
(skip if `client_id` already queued) is a secondary guard against a
duplicate `watchPosition` fire queuing the same point twice locally.

## 4. Recovery

| Scenario | Behaviour |
|---|---|
| App restart | Queue persisted in `localStorage`; `useGpsSync` resumes flushing on next mount. |
| Network interruption | `online`/`offline` listeners + 10s interval both trigger flush attempts; no data loss, just delay. |
| GPS interruption | Unchanged (Phase 3) — `classifyQuality` marks fixes `stale`/`weak`, out of Phase 8 scope. |
| Backend interruption | Failed inserts stay `pending` and retry up to 8 times before flipping to `failed` (still visible, still retryable manually). |
| Repeated retry | Retries are idempotent (23505 → treated as synced), so no duplicate rows regardless of retry count. |
| Partial sync | Sequential per-item inserts; one failure doesn't block the rest of the batch — matches the existing milk-collection queue's behaviour. |

## 5. Performance / storage

Queue capped at 3000 points locally; oldest dropped on overflow with a
visible exception raised. No unlimited local growth.

## 6. Tests performed

No test framework exists in this repo (`package.json` has no `test`
script, no Vitest/Jest). Verification performed instead:
- `npx tsc --noEmit` — zero errors introduced by Phase 8 files (confirmed
  by diffing against a clean extraction of the original repo state).
- `npx vite build` — full production build succeeds end-to-end after the
  Phase 7 restoration above; failed before it for the pre-existing reason
  described in §0.
- Manual code-path review against each Phase 8 spec scenario (offline
  1 min / 10 min, restart, reconnect, duplicate retry, partial upload) —
  see §4 table.

**Not done (recommend before shipping):** an actual on-device/browser
manual test — throttle network in devkit dev tools, watch the queue grow
in `localStorage`, restore network, confirm rows land in `gps_pings` with
correct `recorded_at` and no duplicates. I don't have a way to drive a
real browser + Geolocation API from here, so this is the one thing I
couldn't verify directly.

## 7. Known limitations (unchanged from Phase 1, still true)

- No true background GPS: tracking only runs while the tab/PWA is open and
  foregrounded (or backgrounded but not suspended by the OS) — a browser
  tab, not a native app.
- `localStorage` has a practical ~5–10MB ceiling; the 3000-item cap is
  chosen to stay well inside that for typical payload sizes, but very long
  continuous offline stretches will still eventually drop old points.

## 8. Files changed

- `src/lib/gps-offline-queue.ts` (new)
- `src/hooks/useGpsSync.ts` (new)
- `src/hooks/useLiveLocation.ts` (modified — queue-first writes)
- `src/routes/_authenticated/agent.tsx` (modified — sync banner)
- `src/routes/_authenticated/trip.tsx` (modified — sync banner)
- `src/routes/_authenticated/route-marking.tsx` (modified — mount flush loop)
- `src/lib/exceptions.ts`, `src/lib/route-exceptions.ts`, `src/lib/geo.ts`,
  `src/hooks/useLiveOps.ts`, `supabase/migrations/20260821130000_livetrack_phase7_exceptions.sql`
  (restored — pre-existing Phase 7 work that wasn't actually applied)

No database migration was needed for Phase 8 itself — `gps_pings` already
had every column this phase needed.
