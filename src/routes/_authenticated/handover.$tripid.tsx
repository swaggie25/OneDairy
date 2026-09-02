import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, AlertTriangle, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge, type Status } from "@/components/ui/status-badge";

export const Route = createFileRoute("/_authenticated/handover/$tripid")({
  head: () => ({
    meta: [
      { title: "MCC handover — DairyOne" },
      {
        name: "description",
        content: "Declared milk handover status for a completed collection trip.",
      },
    ],
  }),
  component: HandoverStatus,
});

const STATUS_COPY: Record<string, { label: string; hint: string; status: Status }> = {
  declared: {
    label: "Awaiting MCC receipt",
    hint: "The centre hasn't confirmed the received quantity yet.",
    status: "muted",
  },
  received: {
    label: "Received — matched",
    hint: "The centre confirmed a matching quantity. Handover complete.",
    status: "success",
  },
  variance_flagged: {
    label: "Variance flagged",
    hint: "Declared and received quantities don't match. A manager needs to acknowledge it.",
    status: "warning",
  },
  acknowledged: {
    label: "Variance acknowledged",
    hint: "The variance has been reviewed and closed out.",
    status: "success",
  },
};

function HandoverStatus() {
  // NOTE: the route param is declared lower-case ($tripid → `tripid`), not
  // `tripId` — this was previously destructured as `tripId`, which was
  // always undefined, so this screen's query never actually ran. Fixed as
  // part of this pass since the restyle can't be verified against a screen
  // that never loads data; flagging separately per your guardrail rather
  // than folding it in silently.
  const { tripid: tripId } = Route.useParams();

  const { data: handover, isLoading } = useQuery({
    queryKey: ["mcc-handover", tripId],
    enabled: Boolean(tripId),
    // Keep polling lightly while we're waiting on the MCC to receipt it —
    // the Agent may be standing at the counter watching this screen.
    refetchInterval: (query) => (query.state.data?.status === "declared" ? 8_000 : false),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcc_handovers")
        .select(
          "id, status, declared_quantity_litres, declared_collection_count, received_quantity_litres, variance_litres, variance_reason, receipt_notes, created_at, received_at",
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
        <PageHeading title="Loading handover…" />
      </AppShell>
    );
  }

  if (!handover) {
    return (
      <AppShell mobileFirst>
        <PageHeading
          title="No handover found"
          subtitle="This trip hasn't been declared at the MCC yet."
        />
        <Button asChild size="lg" className="h-14 w-full text-base">
          <Link to="/agent">
            <ArrowLeft className="h-5 w-5" />
            Back to home
          </Link>
        </Button>
      </AppShell>
    );
  }

  const copy = STATUS_COPY[handover.status] ?? {
    label: handover.status,
    hint: "",
    status: "muted" as Status,
  };
  const StatusIcon =
    handover.status === "received"
      ? CheckCircle2
      : handover.status === "declared"
        ? Clock
        : AlertTriangle;

  return (
    <AppShell mobileFirst>
      <PageHeading title="MCC handover" subtitle="Your declared total for this trip." />

      <div className="surface-card flex items-center gap-3 p-4">
        <Icon icon={StatusIcon} size="lg" tone={copy.status} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold">{copy.label}</p>
            <StatusBadge status={copy.status} label={handover.status} size="sm" />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.hint}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard label="You declared" value={`${handover.declared_quantity_litres} L`} />
        <StatCard label="Entries" value={handover.declared_collection_count} />
      </div>

      {handover.received_quantity_litres != null && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <StatCard label="MCC received" value={`${handover.received_quantity_litres} L`} />
          <StatCard
            label="Variance"
            value={`${handover.variance_litres ?? 0} L`}
            hint={handover.variance_reason ?? undefined}
          />
        </div>
      )}

      <Button asChild size="lg" variant="outline" className="mt-6 h-14 w-full text-base">
        <Link to="/agent">
          <ArrowLeft className="h-5 w-5" />
          Back to home
        </Link>
      </Button>
    </AppShell>
  );
}
