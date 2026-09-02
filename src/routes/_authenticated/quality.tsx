import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, ScanSearch, CheckCircle2, Droplets } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStaffMcc } from "@/hooks/useStaffMcc";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { navForRole } from "@/lib/nav";
import {
  buildBaselines,
  evaluateCollection,
  SEVERITY_VARIANT,
  scoreCollection,
  type AlertSeverity,
  type ScanCollection,
} from "@/lib/quality";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/quality")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["manager", "owner", "accountant"]),
  head: () => ({
    meta: [
      { title: "Quality alerts — DairyOne" },
      {
        name: "description",
        content:
          "Smart alerts for adulterated or off-spec milk: water content, antibiotic residue and fat/SNF drift against each farmer's own history.",
      },
      { property: "og:title", content: "Quality alerts — DairyOne" },
      {
        property: "og:description",
        content: "Catch suspicious collections before they reach the tanker.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QualityScreen,
});

function QualityScreen() {
  const { data: user } = useCurrentUser();
  const { data: mcc } = useStaffMcc();
  const queryClient = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);

  const { data: alerts } = useQuery({
    queryKey: ["quality-alerts", mcc?.mccId, showResolved],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      let query = supabase
        .from("quality_alerts")
        .select(
          "id, alert_type, severity, message, status, created_at, farmers(full_name, farmer_code, village), milk_collections(collected_at, quantity_litres, fat_pct, snf_pct)",
        )
        .eq("mcc_id", mcc!.mccId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!showResolved) query = query.eq("status", "open");
      const { data } = await query;
      return data ?? [];
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["quality-recent", mcc?.mccId],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from("milk_collections")
        .select(
          "id, farmer_id, quantity_litres, fat_pct, snf_pct, water_adulteration_pct, antibiotic_test_result, collected_at",
        )
        .eq("mcc_id", mcc!.mccId)
        .gte("collected_at", since.toISOString())
        .order("collected_at", { ascending: false })
        .limit(1000);
      return (data ?? []) as ScanCollection[];
    },
  });

  const riskiest = useMemo(() => {
    const rows = recent ?? [];
    const baselines = buildBaselines(rows);
    return rows
      .map((row) => ({ row, score: scoreCollection(row, baselines[row.farmer_id]) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [recent]);

  const openCount = (alerts ?? []).filter((a) => a.status === "open").length;
  const criticalCount = (alerts ?? []).filter(
    (a) => a.severity === "critical" && a.status === "open",
  ).length;

  const scan = useMutation({
    mutationFn: async () => {
      if (!mcc?.mccId) throw new Error("No collection centre assigned.");
      const rows = recent ?? [];
      if (rows.length === 0) throw new Error("No collections in the last 30 days to scan.");
      const baselines = buildBaselines(rows);
      const drafts = rows.flatMap((row) => evaluateCollection(row, baselines[row.farmer_id]));

      const { data: existing } = await supabase
        .from("quality_alerts")
        .select("collection_id, alert_type")
        .eq("mcc_id", mcc.mccId);
      const seen = new Set((existing ?? []).map((e) => `${e.collection_id}:${e.alert_type}`));
      const fresh = drafts.filter((d) => !seen.has(`${d.collection_id}:${d.alert_type}`));
      if (fresh.length === 0) return 0;

      const { error } = await supabase
        .from("quality_alerts")
        .insert(fresh.map((d) => ({ ...d, mcc_id: mcc.mccId })));
      if (error) throw error;
      return fresh.length;
    },
    onSuccess: (count) => {
      toast.success(count ? `${count} new alert(s) raised` : "No new issues found");
      void queryClient.invalidateQueries({ queryKey: ["quality-alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("quality_alerts")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: auth.user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["quality-alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell nav={navForRole(user?.role)}>
      <PageHeading
        title="Quality & smart alerts"
        subtitle="Every collection is checked against hard limits and the farmer's own fat/SNF history."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Open alerts"
          value={openCount}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <StatCard
          label="Critical"
          value={criticalCount}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <StatCard
          label="Collections scanned"
          value={recent?.length ?? 0}
          hint="Last 30 days"
          icon={<Droplets className="h-4 w-4" />}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => scan.mutate()} disabled={scan.isPending}>
          <ScanSearch className="h-4 w-4" /> Run quality scan
        </Button>
        <Button variant="outline" onClick={() => setShowResolved((v) => !v)}>
          {showResolved ? "Show open only" : "Include resolved"}
        </Button>
      </div>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-muted-foreground">Alerts</h2>
      <ul className="surface-card divide-y divide-border overflow-hidden">
        {(alerts ?? []).map((alert) => (
          <li key={alert.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-56 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{alert.farmers?.full_name ?? "Unknown farmer"}</p>
                <Badge variant={SEVERITY_VARIANT[alert.severity as AlertSeverity] ?? "secondary"}>
                  {alert.severity}
                </Badge>
                <Badge variant="outline">{alert.alert_type.replace(/_/g, " ")}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {alert.farmers?.farmer_code ?? "—"} ·{" "}
                {alert.milk_collections?.collected_at
                  ? new Date(alert.milk_collections.collected_at).toLocaleString()
                  : new Date(alert.created_at).toLocaleString()}
                {alert.milk_collections?.quantity_litres != null &&
                  ` · ${Number(alert.milk_collections.quantity_litres).toFixed(1)} L`}
              </p>
            </div>
            {alert.status === "open" ? (
              <Button size="sm" variant="outline" onClick={() => resolve.mutate(alert.id)}>
                <CheckCircle2 className="h-4 w-4" /> Resolve
              </Button>
            ) : (
              <Badge variant="secondary">Resolved</Badge>
            )}
          </li>
        ))}
        {(alerts?.length ?? 0) === 0 && (
          <li className="p-8 text-center text-sm text-muted-foreground">
            No alerts — run a quality scan to check recent collections.
          </li>
        )}
      </ul>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-muted-foreground">
        Highest risk collections
      </h2>
      <ul className="surface-card divide-y divide-border overflow-hidden">
        {riskiest.map(({ row, score }) => (
          <li key={row.id} className="flex items-center gap-3 p-4">
            <div className="flex-1">
              <p className="text-sm font-medium">{new Date(row.collected_at).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                Fat {row.fat_pct ?? "—"} · SNF {row.snf_pct ?? "—"} · Water{" "}
                {row.water_adulteration_pct ?? "—"}%
              </p>
            </div>
            <Badge variant={score >= 60 ? "destructive" : "default"}>Risk {score}</Badge>
          </li>
        ))}
        {riskiest.length === 0 && (
          <li className="p-8 text-center text-sm text-muted-foreground">
            Nothing suspicious in the last 30 days.
          </li>
        )}
      </ul>
    </AppShell>
  );
}
