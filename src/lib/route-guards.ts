import { redirect } from "@tanstack/react-router";
import type { AppRole } from "@/lib/roles";
import type { SessionProfile } from "@/hooks/useCurrentUser";

/**
 * AUDIT ITEM #4 — role-based route protection.
 *
 * Previously the only `beforeLoad` guard in the app checked "are you logged
 * in", full stop — which role can see which page was enforced only by the
 * nav bar not showing the link. RLS still returns empty data for the wrong
 * role, so nothing was insecure, but typing /owner or /finance into the
 * address bar (or opening a bookmark/shared link) landed anyone on a
 * confusing blank/broken-looking dashboard instead of a clear message.
 *
 * `requireRole` runs in a route's `beforeLoad`, using the profile the parent
 * `_authenticated` route already fetched (see routes/_authenticated/route.tsx),
 * and redirects to a dedicated "Access denied" screen when the signed-in
 * user's role isn't one of the roles allowed on that page.
 *
 * Usage:
 *   export const Route = createFileRoute("/_authenticated/owner")({
 *     beforeLoad: ({ context }) => requireRole(context.profile, ["owner"]),
 *     component: OwnerDashboard,
 *   });
 */
export function requireRole(profile: SessionProfile | null | undefined, allowedRoles: AppRole[]) {
  const role = profile?.role ?? null;
  if (!role || !allowedRoles.includes(role)) {
    throw redirect({ to: "/forbidden" });
  }
}
