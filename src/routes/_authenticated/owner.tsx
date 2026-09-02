import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, Route as RouteIcon, MapPinned } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, PhaseCard, StatCard } from "@/components/app-shell";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { OWNER_NAV } from "@/lib/nav";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/owner")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["owner"]),
  component: OwnerDashboard,
});

function OwnerDashboard() {
  const { data: user } = useCurrentUser();
  const { data: counts } = useQuery({
    queryKey: ["owner-counts"],
    queryFn: async () => {
      const [centres, agents, farmers, routes] = await Promise.all([
        supabase.from("mcc_centres").select("id", { count: "exact", head: true }),
        supabase.from("agents").select("id", { count: "exact", head: true }),
        supabase.from("farmers").select("id", { count: "exact", head: true }),
        supabase.from("routes").select("id", { count: "exact", head: true }),
      ]);
      return {
        centres: centres.count ?? 0,
        agents: agents.count ?? 0,
        farmers: farmers.count ?? 0,
        routes: routes.count ?? 0,
      };
    },
  });

  return (
    <AppShell nav={OWNER_NAV}>
      <PageHeading
        title={`Welcome${user?.fullName ? `, ${user.fullName}` : ""}`}
        subtitle="Network-wide view of every collection centre, agent and route."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Collection centres" value={counts?.centres ?? 0} icon={<Building2 className="h-4 w-4" />} />
        <StatCard label="Collection agents" value={counts?.agents ?? 0} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Registered farmers" value={counts?.farmers ?? 0} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Active routes" value={counts?.routes ?? 0} icon={<RouteIcon className="h-4 w-4" />} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="surface-card flex min-h-64 flex-col items-center justify-center p-6 text-center">
          <MapPinned className="h-8 w-8 text-primary" />
          <p className="mt-3 font-semibold">Consolidated live map</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Every active agent trip and route-point progress, updating live.
          </p>
          <Link to="/live" className="mt-4 text-sm font-medium text-primary underline">
            Open live operations
          </Link>
        </div>
        <PhaseCard
          phase="Next"
          title="Owner tools on the way"
          items={[
            "Add and edit Centre Managers and Agents",
            "Consolidated revenue and collection reports",
            "Agent monitoring: on-time %, collection accuracy",
            "Notification centre and audit log viewer",
          ]}
        />
      </div>
    </AppShell>
  );
}
