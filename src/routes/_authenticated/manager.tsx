import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Route as RouteIcon, ClipboardCheck, AlertTriangle, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, PhaseCard, StatCard } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useStaffMcc } from "@/hooks/useStaffMcc";
import { exceptionLabel } from "@/lib/exceptions";
import { MANAGER_NAV } from "@/lib/nav";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/manager")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["manager"]),
  component: ManagerDashboard,
});

function ManagerDashboard() {
  const { data: user } = useCurrentUser();
  const { data: mcc } = useStaffMcc();
  const { data: counts } = useQuery({
    queryKey: ["manager-counts"],
    queryFn: async () => {
      const [agents, farmers, routes] = await Promise.all([
        supabase.from("agents").select("id", { count: "exact", head: true }),
        supabase.from("farmers").select("id", { count: "exact", head: true }),
        supabase.from("routes").select("id", { count: "exact", head: true }),
      ]);
      return {
        agents: agents.count ?? 0,
        farmers: farmers.count ?? 0,
        routes: routes.count ?? 0,
      };
    },
  });

  // PHASE 3 — open exceptions at this centre, most recent first. Quantity
  // mismatches (MCC handover variance) live here too rather than being
  // buried in a note, per the "structured exceptions" requirement.
  const { data: exceptions = [] } = useQuery({
    queryKey: ["manager-open-exceptions", mcc?.mccId],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_exceptions")
        .select("id, type, reason, created_at, agents(full_name)")
        .eq("mcc_id", mcc!.mccId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pendingHandovers = 0 } = useQuery({
    queryKey: ["manager-pending-handovers", mcc?.mccId],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const { count } = await supabase
        .from("mcc_handovers")
        .select("id", { count: "exact", head: true })
        .eq("mcc_id", mcc!.mccId)
        .in("status", ["declared", "variance_flagged"]);
      return count ?? 0;
    },
  });

  return (
    <AppShell nav={MANAGER_NAV}>
      <PageHeading
        title="Centre dashboard"
        subtitle={
          user?.mccIds.length
            ? "Your assigned collection centre operations."
            : "No collection centre assigned to you yet — an Owner can assign one."
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Agents at my centre"
          value={counts?.agents ?? 0}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Farmers"
          value={counts?.farmers ?? 0}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Routes"
          value={counts?.routes ?? 0}
          icon={<RouteIcon className="h-4 w-4" />}
        />
      </div>

      {pendingHandovers > 0 && (
        <Link
          to="/handovers"
          className="surface-card mt-4 flex items-center gap-3 border-accent/40 bg-accent/5 p-4"
        >
          <Truck className="h-5 w-5 text-accent" />
          <p className="flex-1 text-sm text-muted-foreground">
            {pendingHandovers} MCC handover{pendingHandovers === 1 ? "" : "s"} waiting on you today.
          </p>
          <Badge variant="outline">Review</Badge>
        </Link>
      )}

      {exceptions.length > 0 && (
        <div className="surface-card mt-4 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent">
            <AlertTriangle className="h-4 w-4" />
            Open exceptions
          </p>
          <ul className="divide-y divide-border">
            {exceptions.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{exceptionLabel(e.type)}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.agents?.full_name ?? "Agent"}
                    {e.reason ? ` — ${e.reason}` : ""}
                  </p>
                </div>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PhaseCard
          phase="Phase 3"
          title="Collect Milk queue"
          items={[
            "From Agent — field entries flowing in from routes",
            "From Farmers at Centre — walk-in entries you weigh yourself",
            "Same milk-entry form as the agent, with QR scan-to-lookup",
          ]}
        />
        <PhaseCard
          phase="Phase 3"
          title="Verify & transfer"
          items={[
            "Verify/Confirm agent submissions before they count to MCC totals",
            "Live agent trip status, route-point progress and punch times",
            "Batch collected milk into a transfer for the dairy plant",
          ]}
        />
      </div>
      <div className="surface-card mt-4 flex items-center gap-3 p-5">
        <ClipboardCheck className="h-5 w-5 text-accent" />
        <p className="text-sm text-muted-foreground">
          Centre walk-in entries post directly; only agent field entries need your approval.
        </p>
      </div>
    </AppShell>
  );
}
