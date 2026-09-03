import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { useAgentContext } from "@/hooks/useAgentContext";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/agent-handovers")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["agent"]),
  head: () => ({
    meta: [
      { title: "My handovers — DairyOne" },
      {
        name: "description",
        content:
          "Every milk handover you declared at the MCC, with received quantity, variance and status.",
      },
    ],
  }),
  component: AgentHandoversScreen,
});

const STATUS_COPY: Record<string, { label: string; status: Status }> = {
  declared: { label: "Awaiting MCC receipt", status: "muted" },
  received: { label: "Received — matched", status: "success" },
  variance_flagged: { label: "Variance flagged", status: "warning" },
  acknowledged: { label: "Acknowledged", status: "success" },
};

/**
 * ITEM 2 — Agent-facing handover status/history. Reuses the same
 * mcc_handovers table and RLS ("agent_id in ... profile_id = auth.uid()")
 * as the single-trip /handover screen, but lists every handover this agent
 * has ever declared instead of just one trip, so Agent home can link to a
 * "check status or history" card. Read-only: all writes stay on the
 * SECURITY DEFINER RPCs used by trip.tsx / the manager's handovers.tsx.
 */
function AgentHandoversScreen() {
  const { data: agent } = useAgentContext();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["agent-handover-history", agent?.agentId],
    enabled: Boolean(agent?.agentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcc_handovers")
        .select(
          "id, trip_id, trip_date, session, status, declared_quantity_litres, received_quantity_litres, variance_litres, variance_reason",
        )
        .eq("agent_id", agent!.agentId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pending = rows.filter(
    (r) => r.status === "declared" || r.status === "variance_flagged",
  ).length;

  return (
    <AppShell mobileFirst>
      <PageHeading
        title="My handovers"
        subtitle="What you declared at the MCC, and what the centre confirmed against it."
      />

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total handovers" value={rows.length} />
        <StatCard label="Need MCC action" value={pending} />
      </div>

      <div className="surface-card mt-5 divide-y divide-border overflow-hidden">
        {rows.map((row) => {
          const copy = STATUS_COPY[row.status] ?? { label: row.status, status: "muted" as Status };
          return (
            <Link
              key={row.id}
              to="/handover"
              search={{ trip: row.trip_id }}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {new Date(`${row.trip_date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {row.session}
                </p>
                <p className="text-xs text-muted-foreground">
                  Declared {Number(row.declared_quantity_litres).toFixed(1)} L
                  {row.received_quantity_litres != null
                    ? ` · Received ${Number(row.received_quantity_litres).toFixed(1)} L`
                    : ""}
                  {row.variance_litres != null && Number(row.variance_litres) !== 0
                    ? ` · Δ ${Number(row.variance_litres).toFixed(1)} L`
                    : ""}
                </p>
              </div>
              <StatusBadge status={copy.status} label={copy.label} size="sm" />
            </Link>
          );
        })}

        {!isLoading && rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <Icon icon={Truck} size="xl" tone="active" />
            <p className="text-sm text-muted-foreground">
              No handovers yet. They're created automatically when you close out a trip.
            </p>
          </div>
        )}
      </div>

      <Button asChild variant="outline" className="mt-6 h-12 w-full">
        <Link to="/agent">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      </Button>
    </AppShell>
  );
}
