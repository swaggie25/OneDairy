import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, FlaskConical, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/buyer")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["buyer"]),
  head: () => ({
    meta: [
      { title: "Incoming milk transfers — DairyOne" },
      {
        name: "description",
        content:
          "Dairy plant view of incoming tanker transfers with litres, fat/SNF quality and receipt confirmation.",
      },
      { property: "og:title", content: "Incoming milk transfers — DairyOne" },
      {
        property: "og:description",
        content: "Confirm receipt of milk dispatched from connected collection centres.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BuyerDashboard,
});

function BuyerDashboard() {
  const queryClient = useQueryClient();

  const { data: transfers } = useQuery({
    queryKey: ["buyer-transfers"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("transfers")
        .select(
          "id, transfer_date, session, quantity_litres, avg_fat, avg_snf, vehicle_no, tanker_id, status, dispatched_at, received_at, mcc_centres(name, code)",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "received" | "rejected" }) => {
      const { error } = await supabase
        .from("transfers")
        .update({
          status,
          received_at: status === "received" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer updated");
      void queryClient.invalidateQueries({ queryKey: ["buyer-transfers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = new Date().toISOString().slice(0, 10);
  const todays = (transfers ?? []).filter((t) => t.transfer_date === today);
  const received = (transfers ?? []).filter((t) => t.status === "received");
  const litres = received.reduce((s, t) => s + Number(t.quantity_litres ?? 0), 0);
  const fatRows = received.filter((t) => t.avg_fat != null);
  const avgFat = fatRows.length
    ? fatRows.reduce((s, t) => s + Number(t.avg_fat), 0) / fatRows.length
    : null;

  return (
    <AppShell>
      <PageHeading
        title="Incoming transfers"
        subtitle="Milk dispatched to your plant from connected collection centres."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Transfers today" value={todays.length} icon={<Truck className="h-4 w-4" />} />
        <StatCard label="Litres received" value={litres.toFixed(1)} icon={<Truck className="h-4 w-4" />} />
        <StatCard
          label="Avg fat %"
          value={avgFat != null ? avgFat.toFixed(2) : "—"}
          icon={<FlaskConical className="h-4 w-4" />}
        />
      </div>

      <ul className="surface-card mt-6 divide-y divide-border overflow-hidden">
        {(transfers ?? []).map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-48 flex-1">
              <p className="font-medium">{t.mcc_centres?.name ?? "Collection centre"}</p>
              <p className="text-xs text-muted-foreground">
                {t.transfer_date} · {t.session} · vehicle {t.vehicle_no ?? "—"} · tanker{" "}
                {t.tanker_id ?? "—"}
              </p>
              {t.dispatched_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Dispatched {new Date(t.dispatched_at).toLocaleString()}
                </p>
              )}
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{Number(t.quantity_litres).toFixed(1)} L</p>
              <p className="text-muted-foreground">
                Fat {t.avg_fat ?? "—"} · SNF {t.avg_snf ?? "—"}
              </p>
            </div>
            <Badge variant={t.status === "received" ? "secondary" : "outline"}>{t.status}</Badge>
            {t.status === "dispatched" && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decide.mutate({ id: t.id, status: "received" })}>
                  <Check className="h-4 w-4" /> Confirm receipt
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => decide.mutate({ id: t.id, status: "rejected" })}
                >
                  <X className="h-4 w-4" /> Flag issue
                </Button>
              </div>
            )}
          </li>
        ))}
        {(transfers?.length ?? 0) === 0 && (
          <li className="p-8 text-center text-sm text-muted-foreground">
            No transfers dispatched to your plant yet.
          </li>
        )}
      </ul>
    </AppShell>
  );
}
