import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "./useCurrentUser";

export type StaffMcc = { mccId: string; name: string; code: string } | null;

/**
 * Resolves the collection centre a staff user (manager/owner/accountant) works
 * with. Managers use their assigned centre; owners fall back to the first one.
 */
export function useStaffMcc() {
  const { data: user } = useCurrentUser();
  return useQuery<StaffMcc>({
    queryKey: ["staff-mcc", user?.userId, user?.mccIds.join(",")],
    enabled: Boolean(user?.userId),
    staleTime: 60_000,
    queryFn: async () => {
      const assigned = user?.mccIds?.[0];
      let query = supabase.from("mcc_centres").select("id, name, code").eq("active", true);
      if (assigned) query = query.eq("id", assigned);
      const { data } = await query.order("created_at").limit(1);
      const row = data?.[0];
      return row ? { mccId: row.id, name: row.name, code: row.code } : null;
    },
  });
}
