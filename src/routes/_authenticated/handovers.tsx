import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, AlertTriangle, Milk, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useStaffMcc } from "@/hooks/useStaffMcc";
import { navForRole } from "@/lib/nav";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/handovers")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["manager", "owner", "accountant"]),
  head: () => ({
    meta: [
      { title: "MCC handovers — DairyOne" },
      {
        name: "description",
        content:
          "Receive agent milk handovers at the centre, reconcile against what was declared, and clear variance.",
      },
    ],
  }),
  component: HandoversScreen,
});

type HandoverRow = {
  id: string;
  trip_id: string;
  trip_date: string;
  session: string;
  status: string;
  declared_quantity_litres: number;
  declared_collection_count: number;
  received_quantity_litres: number | null;
  variance_litres: number | null;
  variance_reason: string | null;
  agents: { full_name: string; employee_code: string } | null;
};

/**
 * PHASE 3 — MCC handover receipt + reconciliation queue.
 *
 * All writes go through record_mcc_handover_receipt / acknowledge_handover_variance
 * (SECURITY DEFINER RPCs) — never a direct update to mcc_handovers, which is
 * locked down by an RLS policy that rejects client writes outright. This
 * keeps the received quantity, the variance math, and the tolerance check
 * fully server-side so a manager can independently confirm what actually
 * arrived, exactly as PHASE 3 §"MCC HANDOVER" requires.
 */
function HandoversScreen() {
  const { data: user } = useCurrentUser();
  const { data: mcc } = useStaffMcc();
  const queryClient = useQueryClient();
  const nav = navForRole(user?.role);

  const [receiptTarget, setReceiptTarget] = useState<HandoverRow | null>(null);
  const [receivedQty, setReceivedQty] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");

  const [ackTarget, setAckTarget] = useState<HandoverRow | null>(null);
  const [ackReason, setAckReason] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["mcc-handovers", mcc?.mccId],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcc_handovers")
        .select(
          "id, trip_id, trip_date, session, status, declared_quantity_litres, declared_collection_count, received_quantity_litres, variance_litres, variance_reason, agents(full_name, employee_code)",
        )
        .eq("mcc_id", mcc!.mccId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as HandoverRow[];
    },
  });

  const pending = rows.filter((r) => r.status === "declared");
  const flagged = rows.filter((r) => r.status === "variance_flagged");
  const settled = rows.filter((r) => r.status === "received" || r.status === "acknowledged");

  const recordReceipt = useMutation({
    mutationFn: async () => {
      if (!receiptTarget) return;
      const qty = Number(receivedQty);
      if (!Number.isFinite(qty) || qty < 0) throw new Error("Enter a valid received quantity.");
      const { error } = await supabase.rpc("record_mcc_handover_receipt", {
        p_handover_id: receiptTarget.id,
        p_received_quantity_litres: qty,
        ...(receiptNotes ? { p_notes: receiptNotes } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Receipt recorded");
      setReceiptTarget(null);
      setReceivedQty("");
      setReceiptNotes("");
      void queryClient.invalidateQueries({ queryKey: ["mcc-handovers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const acknowledgeVariance = useMutation({
    mutationFn: async () => {
      if (!ackTarget) return;
      if (!ackReason.trim()) throw new Error("A reason is required to acknowledge this variance.");
      const { error } = await supabase.rpc("acknowledge_handover_variance", {
        p_handover_id: ackTarget.id,
        p_reason: ackReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Variance acknowledged");
      setAckTarget(null);
      setAckReason("");
      void queryClient.invalidateQueries({ queryKey: ["mcc-handovers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function HandoverCard({ row, action }: { row: HandoverRow; action?: ReactNode }) {
    return (
      <div className="surface-card flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">{row.agents?.full_name ?? "Agent"}</p>
          <p className="text-xs text-muted-foreground">
            {row.agents?.employee_code} · {row.trip_date} · {row.session}
          </p>
          <p className="mt-1 text-sm">
            Declared{" "}
            <span className="font-semibold">{row.declared_quantity_litres.toFixed(1)} L</span>
            {row.received_quantity_litres != null && (
              <>
                {" "}
                · Received{" "}
                <span className="font-semibold">{row.received_quantity_litres.toFixed(1)} L</span>
              </>
            )}
          </p>
          {row.variance_litres != null && Math.abs(row.variance_litres) > 0 && (
            <p className="text-xs text-accent">
              {Math.abs(row.variance_litres).toFixed(1)} L variance
              {row.variance_reason ? ` — ${row.variance_reason}` : ""}
            </p>
          )}
          <Link
            to="/trip-history/$tripid"
            params={{ tripid: row.trip_id }}
            search={{ from: "/handovers" }}
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <History className="h-3 w-3" />
            View trail &amp; timeline
          </Link>
        </div>
        {action}
      </div>
    );
  }

  return (
    <AppShell nav={nav}>
      <PageHeading
        title="MCC handovers"
        subtitle="Confirm what agents actually brought in and reconcile against their declaration."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Awaiting receipt"
          value={pending.length}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Variance flagged"
          value={flagged.length}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="Settled"
          value={settled.length}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading handovers...</p>}

      {flagged.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-accent">Needs acknowledgement</p>
          <div className="space-y-2">
            {flagged.map((row) => (
              <HandoverCard
                key={row.id}
                row={row}
                action={
                  <Button size="sm" onClick={() => setAckTarget(row)}>
                    Acknowledge
                  </Button>
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="mb-2 text-sm font-semibold text-muted-foreground">Awaiting receipt</p>
        <div className="space-y-2">
          {pending.map((row) => (
            <HandoverCard
              key={row.id}
              row={row}
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setReceiptTarget(row);
                    setReceivedQty(row.declared_quantity_litres.toFixed(1));
                  }}
                >
                  <Milk className="h-3.5 w-3.5" />
                  Record receipt
                </Button>
              }
            />
          ))}
          {pending.length === 0 && !isLoading && (
            <p className="surface-card p-4 text-sm text-muted-foreground">
              No handovers waiting on a receipt right now.
            </p>
          )}
        </div>
      </div>

      {settled.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-muted-foreground">Settled</p>
          <div className="space-y-2">
            {settled.map((row) => (
              <HandoverCard
                key={row.id}
                row={row}
                action={
                  <Badge variant="secondary">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    {row.status === "acknowledged" ? "Acknowledged" : "Matched"}
                  </Badge>
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* RECORD RECEIPT */}
      <Dialog
        open={Boolean(receiptTarget)}
        onOpenChange={(open) => !open && setReceiptTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record receipt — {receiptTarget?.agents?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Agent declared {receiptTarget?.declared_quantity_litres.toFixed(1)} L from{" "}
              {receiptTarget?.declared_collection_count} collection
              {receiptTarget?.declared_collection_count === 1 ? "" : "s"}. Weigh and enter what you
              actually received.
            </p>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              className="h-12 text-base"
              placeholder="Received litres"
              value={receivedQty}
              onChange={(e) => setReceivedQty(e.target.value)}
            />
            <Textarea
              placeholder="Notes (optional)"
              value={receiptNotes}
              onChange={(e) => setReceiptNotes(e.target.value)}
            />
            <Button
              size="lg"
              className="h-12 w-full"
              disabled={recordReceipt.isPending}
              onClick={() => recordReceipt.mutate()}
            >
              Confirm receipt
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ACKNOWLEDGE VARIANCE */}
      <Dialog open={Boolean(ackTarget)} onOpenChange={(open) => !open && setAckTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Acknowledge variance — {ackTarget?.agents?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {ackTarget?.variance_litres != null &&
                `${Math.abs(ackTarget.variance_litres).toFixed(1)} L difference between declared and received.`}{" "}
              A reason is required to close this out.
            </p>
            <Textarea
              placeholder="Reason for variance"
              value={ackReason}
              onChange={(e) => setAckReason(e.target.value)}
            />
            <Button
              size="lg"
              className="h-12 w-full"
              disabled={acknowledgeVariance.isPending}
              onClick={() => acknowledgeVariance.mutate()}
            >
              Acknowledge
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
