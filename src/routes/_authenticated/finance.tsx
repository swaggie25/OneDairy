import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IndianRupee, Wallet, Users, ReceiptIndianRupee, BookOpenCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStaffMcc } from "@/hooks/useStaffMcc";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { navForRole } from "@/lib/nav";
import { formatCurrency } from "@/lib/pricing";
import { buildSettlementLines, isoDaysAgo, sumLines, today } from "@/lib/settlement";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/finance")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["manager", "owner", "accountant"]),
  head: () => ({
    meta: [
      { title: "Settlements & ledgers — DairyOne" },
      {
        name: "description",
        content:
          "Run farmer settlement cycles, release UPI or bank payouts and keep the centre cash and purchase ledgers balanced.",
      },
      { property: "og:title", content: "Settlements & ledgers — DairyOne" },
      {
        property: "og:description",
        content: "Generate payout runs from verified milk and track every rupee in the ledger.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FinanceScreen,
});

function FinanceScreen() {
  const { data: user } = useCurrentUser();
  const { data: mcc } = useStaffMcc();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(today());
  const [deductionPct, setDeductionPct] = useState("0");
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [method, setMethod] = useState("upi");

  const { data: pending } = useQuery({
    queryKey: ["settlement-source", mcc?.mccId, from, to],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const { data } = await supabase
        .from("milk_collections")
        .select("id, farmer_id, quantity_litres, total_amount")
        .eq("mcc_id", mcc!.mccId)
        .eq("status", "verified")
        .gte("collected_at", `${from}T00:00:00Z`)
        .lte("collected_at", `${to}T23:59:59Z`)
        .limit(2000);
      return data ?? [];
    },
  });

  const preview = useMemo(() => {
    const lines = buildSettlementLines(pending ?? [], Number(deductionPct) || 0);
    return { lines, ...sumLines(lines) };
  }, [pending, deductionPct]);

  const { data: runs } = useQuery({
    queryKey: ["settlement-runs", mcc?.mccId],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const { data } = await supabase
        .from("settlement_runs")
        .select(
          "id, period_start, period_end, status, total_litres, total_amount, farmer_count, created_at",
        )
        .eq("mcc_id", mcc!.mccId)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const runId = activeRun ?? runs?.[0]?.id ?? null;

  const { data: payments } = useQuery({
    queryKey: ["settlement-payments", runId],
    enabled: Boolean(runId),
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select(
          "id, quantity_litres, gross_amount, deductions, net_amount, status, method, paid_at, farmers(full_name, farmer_code, upi_id, bank_account)",
        )
        .eq("settlement_run_id", runId!)
        .order("net_amount", { ascending: false });
      return data ?? [];
    },
  });

  const { data: ledger } = useQuery({
    queryKey: ["ledger", mcc?.mccId],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const { data } = await supabase
        .from("ledger_entries")
        .select("id, entry_date, account, direction, amount, description")
        .eq("mcc_id", mcc!.mccId)
        .order("entry_date", { ascending: false })
        .limit(40);
      return data ?? [];
    },
  });

  const outstanding = useMemo(
    () =>
      (payments ?? [])
        .filter((p) => p.status !== "paid")
        .reduce((s, p) => s + Number(p.net_amount ?? 0), 0),
    [payments],
  );

  const createRun = useMutation({
    mutationFn: async () => {
      if (!mcc?.mccId) throw new Error("No collection centre assigned.");
      if (preview.lines.length === 0) throw new Error("No verified milk in this period.");
      const { data: auth } = await supabase.auth.getUser();
      const { data: run, error } = await supabase
        .from("settlement_runs")
        .insert({
          mcc_id: mcc.mccId,
          period_start: from,
          period_end: to,
          status: "open",
          total_litres: preview.litres,
          total_amount: preview.net,
          farmer_count: preview.farmers,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: payError } = await supabase.from("payments").insert(
        preview.lines.map((line) => ({
          settlement_run_id: run.id,
          mcc_id: mcc.mccId,
          farmer_id: line.farmer_id,
          period_start: from,
          period_end: to,
          quantity_litres: line.quantity_litres,
          gross_amount: line.gross_amount,
          deductions: line.deductions,
          net_amount: line.net_amount,
          method: "upi",
          status: "pending",
        })),
      );
      if (payError) throw payError;

      const { error: ledgerError } = await supabase.from("ledger_entries").insert({
        mcc_id: mcc.mccId,
        entry_date: to,
        account: "purchase",
        direction: "debit",
        amount: preview.net,
        ref_type: "settlement_run",
        ref_id: run.id,
        description: `Milk purchase ${from} to ${to} · ${preview.farmers} farmers`,
        created_by: auth.user?.id ?? null,
      });
      if (ledgerError) throw ledgerError;
      return run.id;
    },
    onSuccess: (id) => {
      toast.success("Settlement run created");
      setActiveRun(id);
      void queryClient.invalidateQueries({ queryKey: ["settlement-runs"] });
      void queryClient.invalidateQueries({ queryKey: ["ledger"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payAll = useMutation({
    mutationFn: async () => {
      if (!runId || !mcc?.mccId) throw new Error("Select a settlement run first.");
      const due = (payments ?? []).filter((p) => p.status !== "paid");
      if (due.length === 0) throw new Error("Every farmer in this run is already paid.");
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("payments")
        .update({ status: "paid", method, paid_at: now })
        .eq("settlement_run_id", runId)
        .neq("status", "paid");
      if (error) throw error;

      const total = due.reduce((s, p) => s + Number(p.net_amount ?? 0), 0);
      const { data: auth } = await supabase.auth.getUser();
      await supabase.from("ledger_entries").insert({
        mcc_id: mcc.mccId,
        entry_date: today(),
        account: method === "cash" ? "cash" : "bank",
        direction: "credit",
        amount: Math.round(total * 100) / 100,
        ref_type: "settlement_payout",
        ref_id: runId,
        description: `Payout to ${due.length} farmers via ${method.toUpperCase()}`,
        created_by: auth.user?.id ?? null,
      });
      await supabase.from("settlement_runs").update({ status: "paid" }).eq("id", runId);
    },
    onSuccess: () => {
      toast.success("Payouts released");
      void queryClient.invalidateQueries({ queryKey: ["settlement-payments"] });
      void queryClient.invalidateQueries({ queryKey: ["settlement-runs"] });
      void queryClient.invalidateQueries({ queryKey: ["ledger"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markOne = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from("payments")
        .update({ status: "paid", method, paid_at: new Date().toISOString() })
        .eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settlement-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell nav={navForRole(user?.role)}>
      <PageHeading
        title="Settlements & ledgers"
        subtitle={
          mcc
            ? `${mcc.name} · payouts generated from verified milk only.`
            : "No collection centre assigned to you yet."
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Payable in period"
          value={formatCurrency(preview.net)}
          hint={`${preview.litres.toFixed(1)} L`}
          icon={<IndianRupee className="h-4 w-4" />}
        />
        <StatCard
          label="Farmers in period"
          value={preview.farmers}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Outstanding in run"
          value={formatCurrency(outstanding)}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Settlement runs"
          value={runs?.length ?? 0}
          icon={<BookOpenCheck className="h-4 w-4" />}
        />
      </div>

      <div className="surface-card mt-4 grid gap-3 p-5 sm:grid-cols-4">
        <div>
          <Label htmlFor="from">Period from</Label>
          <Input
            id="from"
            type="date"
            className="mt-1 h-11"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="to">Period to</Label>
          <Input
            id="to"
            type="date"
            className="mt-1 h-11"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ded">Deduction %</Label>
          <Input
            id="ded"
            inputMode="decimal"
            className="mt-1 h-11"
            value={deductionPct}
            onChange={(e) => setDeductionPct(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="flex items-end">
          <Button
            className="h-11 w-full"
            onClick={() => createRun.mutate()}
            disabled={createRun.isPending}
          >
            <ReceiptIndianRupee className="h-4 w-4" /> Generate run
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Settlement runs</h2>
          <ul className="surface-card divide-y divide-border overflow-hidden">
            {(runs ?? []).map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => setActiveRun(run.id)}
                  className={`flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary ${
                    run.id === runId ? "bg-primary-soft" : ""
                  }`}
                >
                  <div className="flex-1">
                    <p className="font-medium">
                      {run.period_start} → {run.period_end}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {run.farmer_count} farmers · {Number(run.total_litres ?? 0).toFixed(1)} L
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(Number(run.total_amount ?? 0))}</p>
                    <Badge variant={run.status === "paid" ? "secondary" : "outline"}>
                      {run.status}
                    </Badge>
                  </div>
                </button>
              </li>
            ))}
            {(runs?.length ?? 0) === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground">
                No settlement runs yet — pick a period and generate one.
              </li>
            )}
          </ul>

          <h2 className="mt-6 mb-2 text-sm font-semibold text-muted-foreground">Ledger</h2>
          <ul className="surface-card divide-y divide-border overflow-hidden">
            {(ledger ?? []).map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="text-sm font-medium capitalize">
                    {entry.account} · {entry.direction}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.entry_date} · {entry.description ?? "—"}
                  </p>
                </div>
                <p
                  className={`text-sm font-semibold ${
                    entry.direction === "credit" ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {formatCurrency(Number(entry.amount ?? 0))}
                </p>
              </li>
            ))}
            {(ledger?.length ?? 0) === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground">
                Ledger entries appear as soon as you run a settlement.
              </li>
            )}
          </ul>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-muted-foreground">Farmer payouts</h2>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => payAll.mutate()} disabled={payAll.isPending || !runId}>
              Pay all
            </Button>
          </div>
          <ul className="surface-card divide-y divide-border overflow-hidden">
            {(payments ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="font-medium">{p.farmers?.full_name ?? "Farmer"}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.farmers?.farmer_code} · {Number(p.quantity_litres ?? 0).toFixed(1)} L ·{" "}
                    {p.farmers?.upi_id ?? p.farmers?.bank_account ?? "no payout account"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(Number(p.net_amount ?? 0))}</p>
                  {Number(p.deductions ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      less {formatCurrency(Number(p.deductions))}
                    </p>
                  )}
                </div>
                {p.status === "paid" ? (
                  <Badge variant="secondary">Paid</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => markOne.mutate(p.id)}>
                    Mark paid
                  </Button>
                )}
              </li>
            ))}
            {(payments?.length ?? 0) === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground">
                Select or generate a settlement run to see farmer payout lines.
              </li>
            )}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
