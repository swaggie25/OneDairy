import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CloudUpload, Droplets, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAgentContext } from "@/hooks/useAgentContext";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { formatCurrency } from "@/lib/pricing";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/collections")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["agent"]),
  head: () => ({
    meta: [
      { title: "My collections — DairyOne" },
      {
        name: "description",
        content:
          "Every milk entry you captured, with litres, fat/SNF, amount and sync status — including entries still waiting offline.",
      },
      { property: "og:title", content: "My collections — DairyOne" },
      {
        property: "og:description",
        content: "Agent collection history with quality readings, payouts and offline sync status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CollectionsScreen,
});

function CollectionsScreen() {
  const { data: agent } = useAgentContext();
  const { pending, online, flush } = useOfflineQueue();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["agent-collections", agent?.agentId],
    enabled: Boolean(agent?.agentId),
    queryFn: async () => {
      const { data } = await supabase
        .from("milk_collections")
        .select(
          "id, collected_at, session, animal_type, quantity_litres, fat_pct, snf_pct, rate_per_litre, total_amount, status, risk_score, farmers(full_name, farmer_code)",
        )
        .eq("agent_id", agent!.agentId)
        .order("collected_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const litres = (rows ?? []).reduce((s, r) => s + Number(r.quantity_litres ?? 0), 0);
  const amount = (rows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0);

  const groups = new Map<string, typeof rows>();
  for (const row of rows ?? []) {
    const day = new Date(row.collected_at).toISOString().slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), row]);
  }

  return (
    <AppShell mobileFirst>
      <PageHeading title="My collections" subtitle="Last 100 entries captured on this account." />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Entries" value={rows?.length ?? 0} />
        <StatCard label="Litres" value={litres.toFixed(1)} />
        <StatCard label="Value" value={formatCurrency(amount)} />
      </div>

      {pending > 0 && (
        <div className="surface-card mt-4 flex items-center gap-3 p-4">
          <Icon icon={CloudUpload} size="md" tone={online ? "active" : "warning"} />
          <p className="flex-1 text-sm text-muted-foreground">
            {pending} entr{pending === 1 ? "y" : "ies"} saved on this phone
            {online ? " — syncing now." : " — will sync when network returns."}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void flush()} aria-label="Sync now">
            <Icon icon={RefreshCw} size="sm" className="text-current" />
          </Button>
        </div>
      )}

      <div className="mt-5 space-y-5">
        {[...groups.entries()].map(([day, dayRows]) => (
          <section key={day}>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
              {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </h2>
            <ul className="surface-card divide-y divide-border overflow-hidden">
              {(dayRows ?? []).map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.farmers?.full_name ?? "Farmer"}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.farmers?.farmer_code} · {row.session} · {row.animal_type}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Fat {row.fat_pct ?? "—"}% · SNF {row.snf_pct ?? "—"}% · ₹
                      {Number(row.rate_per_litre ?? 0).toFixed(2)}/L
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{Number(row.quantity_litres ?? 0).toFixed(1)} L</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(Number(row.total_amount ?? 0))}
                    </p>
                    <div className="mt-1 flex justify-end gap-1">
                      {Number(row.risk_score ?? 0) >= 40 && (
                        <StatusBadge status="danger" label="Flagged" size="sm" />
                      )}
                      <StatusBadge
                        status={row.status === "verified" ? "success" : "muted"}
                        label={row.status}
                        size="sm"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {!isLoading && (rows?.length ?? 0) === 0 && (
          <div className="surface-card flex flex-col items-center p-8 text-center">
            <Icon icon={Droplets} size="xl" tone="active" />
            <p className="mt-2 text-sm text-muted-foreground">
              No collections yet. Start a trip and record your first entry.
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
