import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Milk } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { requireRole } from "@/lib/route-guards";

const searchSchema = z.object({
  trip: z.string().uuid(),
});

export const Route = createFileRoute("/_authenticated/handover")({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => requireRole(context.profile, ["agent"]),
  head: () => ({
    meta: [
      { title: "MCC handover — DairyOne" },
      {
        name: "description",
        content:
          "Track your declared milk handover at the centre and any variance with what's received.",
      },
    ],
  }),
  component: HandoverStatusScreen,
});

/**
 * PHASE 3 — Agent-facing handover status. The Agent's operational workflow
 * ends here: they declared a quantity when they closed the trip, and this
 * screen shows what the MCC operator recorded against it, without letting
 * the Agent edit anything after the fact (all writes go through the
 * SECURITY DEFINER RPCs — see trip.tsx `proceedToMcc` and the manager-side
 * `handovers.tsx`).
 */
function HandoverStatusScreen() {
  const { trip: tripId } = useSearch({ from: "/_authenticated/handover" });
  const queryClient = useQueryClient();

  const { data: handover, isLoading } = useQuery({
    queryKey: ["mcc-handover", tripId],
    enabled: Boolean(tripId),
    refetchInterval: 15_000, // poll — the MCC operator may receipt this any time after the agent leaves
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcc_handovers")
        .select(
          "id, status, declared_quantity_litres, declared_collection_count, received_quantity_litres, variance_litres, variance_reason, receipt_notes, received_at",
        )
        .eq("trip_id", tripId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <AppShell mobileFirst>
        <PageHeading title="Loading handover..." subtitle="Please wait." />
      </AppShell>
    );
  }

  if (!handover) {
    return (
      <AppShell mobileFirst>
        <PageHeading title="No handover found" subtitle="This trip hasn't been handed over yet." />
        <Button asChild size="lg" className="h-14 w-full text-base">
          <Link to="/agent">
            <ArrowLeft className="h-5 w-5" />
            Back to home
          </Link>
        </Button>
      </AppShell>
    );
  }

  type StatusMeta = { label: string; status: Status };
  const defaultMeta: StatusMeta = {
    label: "Waiting for MCC to receive",
    status: "muted",
  };
  const statusMeta: Record<string, StatusMeta> = {
    declared: defaultMeta,
    received: {
      label: "Received — matches your declaration",
      status: "success",
    },
    variance_flagged: {
      label: "Variance flagged — pending manager review",
      status: "warning",
    },
    acknowledged: {
      label: "Variance acknowledged and closed",
      status: "success",
    },
  };

  const meta: StatusMeta = statusMeta[handover.status] ?? defaultMeta;

  return (
    <AppShell mobileFirst>
      <PageHeading
        title="MCC handover"
        subtitle="Your route is closed. Here's what happened at the centre."
      />

      <div className="surface-card flex flex-col items-center gap-3 p-6 text-center">
        <Icon icon={Milk} size="xl" tone="active" />
        <StatusBadge status={meta.status} label={meta.label} size="lg" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard
          label="You declared"
          value={`${handover.declared_quantity_litres.toFixed(1)} L`}
        />
        <StatCard
          label="MCC received"
          value={
            handover.received_quantity_litres != null
              ? `${handover.received_quantity_litres.toFixed(1)} L`
              : "—"
          }
        />
      </div>

      {handover.status === "variance_flagged" && (
        <div className="surface-card mt-4 border-status-warning/30 bg-status-warning-soft p-4 text-sm">
          <p className="font-medium text-status-warning">
            {Math.abs(Number(handover.variance_litres ?? 0)).toFixed(1)} L difference from what you
            declared.
          </p>
          <p className="mt-1 text-muted-foreground">
            Your manager has been notified and will review this. No action needed from you right
            now.
          </p>
        </div>
      )}

      {handover.status === "acknowledged" && handover.variance_reason && (
        <div className="surface-card mt-4 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Resolution</p>
          <p className="mt-1">{handover.variance_reason}</p>
        </div>
      )}

      <div className="mt-6 grid gap-3">
        <Button
          variant="outline"
          className="h-12"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ["mcc-handover", tripId] })}
        >
          Refresh status
        </Button>
        <Button asChild size="lg" className="h-14 text-base">
          <Link to="/agent">
            <ArrowLeft className="h-5 w-5" />
            Back to home
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}
