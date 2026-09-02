import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, IndianRupee, Wallet, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { useStaffMcc } from "@/hooks/useStaffMcc";
import { FINANCE_NAV } from "@/lib/nav";
import { formatCurrency } from "@/lib/pricing";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/accountant")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["accountant"]),
  head: () => ({
    meta: [
      { title: "Finance desk — DairyOne" },
      {
        name: "description",
        content:
          "Accountant home for a milk collection centre: payables to farmers, cash position, settlement runs and ledger activity.",
      },
      { property: "og:title", content: "Finance desk — DairyOne" },
      {
        property: "og:description",
        content: "Track payables, payouts and ledgers across the dairy network.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountantDashboard,
});

function AccountantDashboard() {
  const { data: mcc } = useStaffMcc();

  const { data: summary } = useQuery({
    queryKey: ["accountant-summary", mcc?.mccId],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const [payments, runs, ledger] = await Promise.all([
        supabase.from("payments").select("net_amount, status").eq("mcc_id", mcc!.mccId),
        supabase.from("settlement_runs").select("id", { count: "exact", head: true }).eq("mcc_id", mcc!.mccId),
        supabase.from("ledger_entries").select("account, direction, amount").eq("mcc_id", mcc!.mccId),
      ]);
      const payable = (payments.data ?? [])
        .filter((p) => p.status !== "paid")
        .reduce((s, p) => s + Number(p.net_amount ?? 0), 0);
      const cash = (ledger.data ?? []).reduce(
        (s, e) =>
          e.account === "cash"
            ? s + (e.direction === "debit" ? Number(e.amount ?? 0) : -Number(e.amount ?? 0))
            : s,
        0,
      );
      return { payable, cash, runs: runs.count ?? 0 };
    },
  });

  return (
    <AppShell nav={FINANCE_NAV}>
      <PageHeading
        title="Finance"
        subtitle={
          mcc ? `${mcc.name} · ledgers, settlements and payouts.` : "No collection centre assigned yet."
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Payable to farmers"
          value={formatCurrency(summary?.payable ?? 0)}
          icon={<IndianRupee className="h-4 w-4" />}
        />
        <StatCard
          label="Cash position"
          value={formatCurrency(summary?.cash ?? 0)}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Settlement runs"
          value={summary?.runs ?? 0}
          icon={<BookOpenCheck className="h-4 w-4" />}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <QuickLink
          to="/finance"
          title="Settlements & ledgers"
          body="Generate a payout run from verified milk, release UPI or bank payments and post ledger entries."
        />
        <QuickLink
          to="/reports"
          title="Reports"
          body="Daily volume and value, fat/SNF trends and village-wise collection charts."
        />
        <QuickLink
          to="/quality"
          title="Quality alerts"
          body="Adulteration, antibiotic and fat/SNF deviation flags that affect what you pay out."
        />
      </div>
    </AppShell>
  );
}

function QuickLink({ to, title, body }: { to: string; title: string; body: string }) {
  return (
    <Link to={to} className="surface-card block p-5 transition-colors hover:bg-secondary">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <ArrowRight className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </Link>
  );
}
