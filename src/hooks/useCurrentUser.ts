import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/roles";

export type SessionProfile = {
  userId: string;
  fullName: string | null;
  phone: string | null;
  role: AppRole | null;
  mccIds: string[];
};

export const CURRENT_USER_QUERY_KEY = ["current-user"] as const;
export const CURRENT_USER_STALE_TIME = 60_000;

/**
 * Fetches the signed-in user's profile + role. Extracted from the hook below
 * so route `beforeLoad` guards (see lib/route-guards.ts) can warm the exact
 * same react-query cache entry instead of issuing a second, divergent fetch.
 */
export async function fetchCurrentUser(): Promise<SessionProfile | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role, mcc_id").eq("user_id", user.id),
  ]);

  return {
    userId: user.id,
    fullName: profile?.full_name ?? null,
    phone: profile?.phone ?? null,
    role: (roles?.[0]?.role as AppRole | undefined) ?? null,
    mccIds: (roles ?? []).map((r) => r.mcc_id).filter((v): v is string => Boolean(v)),
  };
}

export function useCurrentUser() {
  return useQuery<SessionProfile | null>({
    queryKey: [...CURRENT_USER_QUERY_KEY],
    queryFn: fetchCurrentUser,
    staleTime: CURRENT_USER_STALE_TIME,
  });
}
