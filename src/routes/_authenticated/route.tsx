import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CURRENT_USER_QUERY_KEY, CURRENT_USER_STALE_TIME, fetchCurrentUser } from "@/hooks/useCurrentUser";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Warm the same "current-user" react-query cache entry `useCurrentUser`
    // reads from, so role guards (lib/route-guards.ts) have the profile/role
    // available synchronously in every child route's `beforeLoad`, with no
    // extra network round-trip and no flash of the wrong nav on first paint.
    const profile = await context.queryClient.ensureQueryData({
      queryKey: [...CURRENT_USER_QUERY_KEY],
      queryFn: fetchCurrentUser,
      staleTime: CURRENT_USER_STALE_TIME,
    });

    return { user: data.user, profile };
  },
  component: () => <Outlet />,
});
