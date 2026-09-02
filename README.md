# DairyOne — audit fixes #3, #4, #5, #7

This package contains the fix for four items from the live-repo audit,
applied against `swaggie25/DairyOne` (main).

## What's in here

- `dairyone-fixes.patch` — a single git patch with every change (24 modified
  files, 1 new lib file, 1 new route, 1 deleted route). Apply this and you're done.
- `changed-files/` — the same changes as plain files, mirroring the repo's
  folder structure, in case you'd rather copy them in by hand or diff them
  manually instead of using `git apply`.

## How to apply

From the root of your local `DairyOne` checkout, on a clean branch:

```bash
git checkout -b fix/audit-3-4-5-7
git apply --index /path/to/dairyone-fixes.patch
git status   # sanity check the changed files match the list below
npm install  # if you haven't already
npx vite build     # regenerates src/routeTree.gen.ts cleanly, confirms it builds
npx tsc --noEmit   # confirms no new type errors
git commit -m "fix: role-based route guards, contextual back button, restart aria-label, remove dead handover/$tripid route"
```

If `git apply` complains about the already-regenerated `src/routeTree.gen.ts`
being out of date with your branch, delete that hunk from the patch (or just
delete the file and run `npx vite build` once — it's fully generated, TanStack
Router will rebuild it from your route files) and apply the rest normally.

## What changed, by audit item

### #3 — Deleted dead `handover.$tripid.tsx`
Nothing in the app ever links to `/handover/$tripid` (the only navigation to
a handover-status page, in `trip.tsx`, goes to `/handover` — the search-param
version). It also failed to compile (`Property 'tripId' does not exist`,
plus a route-tree type error). Deleted the file; `routeTree.gen.ts`
regenerates without it and both compile errors are gone.

### #4 — Role-based route protection
Previously the only `beforeLoad` guard in the app checked "are you logged
in", full stop — nothing stopped an agent from typing `/owner` or `/finance`
into the address bar and landing on a blank/broken-looking dashboard once
RLS silently returned no rows.

- `src/hooks/useCurrentUser.ts` — extracted the query function into an
  exported `fetchCurrentUser()` so it can run outside React, in a router
  `beforeLoad`, and reuse the exact same react-query cache key
  (`CURRENT_USER_QUERY_KEY`) the hook already uses.
- `src/routes/_authenticated/route.tsx` — the top-level authenticated
  layout's `beforeLoad` now also warms that cache via
  `queryClient.ensureQueryData(...)` and puts `{ user, profile }` into
  router context, so every nested route knows the signed-in user's role
  with no extra network round-trip.
- `src/lib/route-guards.ts` (new) — exports `requireRole(profile, allowedRoles)`,
  which throws a redirect to `/forbidden` when the role isn't allowed.
- `src/routes/_authenticated/forbidden.tsx` (new) — a clean "You don't have
  access to this page" screen with a button back to the user's own
  dashboard (via `ROLE_HOME`), replacing the old silent-blank-page behavior.
- Applied `beforeLoad: ({ context }) => requireRole(context.profile, [...])`
  to every role-sensitive route:
  - `manager` → `["manager"]`
  - `owner` → `["owner"]`
  - `accountant` → `["accountant"]`
  - `agent`, `trip`, `handover`, `route-marking`, `collections` → `["agent"]`
  - `buyer` → `["buyer"]`
  - `farmer` → `["farmer"]`
  - `finance`, `quality`, `reports`, `handovers`, `transfers`, `collect`,
    `trip-history/$tripid` → `["manager", "owner", "accountant"]`
  - `live`, `cards`, `field-setup` → `["manager", "owner"]`

  (These allow-lists were derived directly from which links appear in
  `MANAGER_NAV`, `OWNER_NAV`, and `FINANCE_NAV` in `src/lib/nav.ts` — e.g.
  Finance/Reports/Quality/Collect/Handovers/Transfers appear in all three
  staff navs, so all three roles keep access; Live map/QR cards/Field setup
  don't appear in `FINANCE_NAV`, so Accountant is excluded from those.)

Note: no RLS/DB changes were needed or made — this only tightens the UI-level
gate. Supabase RLS was already correctly restricting the underlying data;
this just stops the confusing broken-page experience when someone hits a
page their role doesn't belong on.

### #5 — Inconsistent "Back" destination
`trip-history.$tripid.tsx`'s back button always pointed to `/handovers`,
even when reached from `/reports`.

- Added a `validateSearch` schema (zod) that accepts `?from=/handovers` or
  `?from=/reports` only (defaults to `/handovers`), so this can't become an
  open redirect.
- Both "Back" buttons (the error/not-found state and the normal page header)
  now link to `from` instead of a hardcoded path, and the label switches
  between "Back to handovers" / "Back to reports".
- Updated the two places that link into this route to pass the right value:
  `handovers.tsx` → `search={{ from: "/handovers" }}`,
  `reports.tsx` → `search={{ from: "/reports" }}`.

### #7 — Missing aria-label on the replay restart button
Added `aria-label="Restart replay"` to the icon-only `RotateCcw` button in
`trip-history.$tripid.tsx`, matching the accessible pattern already used by
the adjacent Play/Pause buttons (which have visible text next to their icons).

## Verification performed

- `npm install` — clean.
- `npx vite build` — succeeds, `routeTree.gen.ts` regenerates correctly with
  the new `/forbidden` route, the new search schema on `trip-history/$tripid`,
  and no reference to the deleted `/handover/$tripid` route.
- `npx tsc --noEmit` — zero new type errors. The only remaining errors are
  pre-existing and unrelated to this change (`src/lib/offline-queue.ts` and
  a couple of null-type mismatches in `route-marking.tsx`), present before
  any of these edits.

## Not included in this package

Audit items #1 (no mobile nav / hamburger menu), #2 (Owner/Accountant get
Manager's nav on collect/cards/transfers), and #6 (Accountant sees Manager's
nav on `/handovers`) were reviewed:

- **#6 was already fixed in the live repo** — `handovers.tsx` uses
  `navForRole(user?.role)` from `src/lib/nav.ts`, which correctly returns
  `FINANCE_NAV` for accountants.
- **#1 and #2 are unaddressed** and are good candidates for a follow-up pass
  — #2 in particular is a quick, well-scoped fix (swap the hardcoded
  `<AppShell nav={MANAGER_NAV}>` in the three affected files for
  `navForRole(user?.role)`, the same pattern already used elsewhere).
