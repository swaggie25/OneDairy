import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, QrCode, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { MilkEntryForm } from "@/components/milk-entry-form";
import { QrScanner } from "@/components/qr-scanner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStaffMcc } from "@/hooks/useStaffMcc";
import { formatCurrency } from "@/lib/pricing";
import { navForRole } from "@/lib/nav";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/collect")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["manager", "owner", "accountant"]),
  head: () => ({
    meta: [
      { title: "Collect milk queue — DairyOne" },
      {
        name: "description",
        content:
          "Verify agent field collections and record walk-in farmer entries at the collection centre.",
      },
      { property: "og:title", content: "Collect milk queue — DairyOne" },
      {
        property: "og:description",
        content: "Manager queue for verifying agent entries and weighing centre walk-ins.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CollectScreen,
});

type Farmer = { id: string; full_name: string; farmer_code: string; village: string | null };

function CollectScreen() {
  const { data: mcc } = useStaffMcc();
  const { data: user } = useCurrentUser();

  return (
    <AppShell nav={navForRole(user?.role)}>
      <PageHeading
        title="Collect milk"
        subtitle={
          mcc ? `${mcc.name} · ${mcc.code}` : "No collection centre assigned to you yet."
        }
      />
      <Tabs defaultValue="agent">
        <TabsList>
          <TabsTrigger value="agent">From agent</TabsTrigger>
          <TabsTrigger value="centre">From farmers at centre</TabsTrigger>
        </TabsList>
        <TabsContent value="agent" className="mt-4">
          <AgentQueue mccId={mcc?.mccId} />
        </TabsContent>
        <TabsContent value="centre" className="mt-4">
          <CentreWalkIn mccId={mcc?.mccId} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function AgentQueue({ mccId }: { mccId: string | undefined }) {
  const queryClient = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["pending-collections", mccId],
    enabled: Boolean(mccId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("milk_collections")
        .select(
          "id, collected_at, session, animal_type, quantity_litres, fat_pct, snf_pct, rate_per_litre, total_amount, risk_score, status, quality_override_reason, farmers(full_name, farmer_code), agents(full_name, employee_code)",
        )
        .eq("mcc_id", mccId!)
        .eq("source", "agent")
        .eq("status", "pending")
        .order("collected_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "verified" | "rejected" }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("milk_collections")
        .update({
          status,
          verified_by: auth.user?.id ?? null,
          verified_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === "verified" ? "Collection verified" : "Collection rejected");
      void queryClient.invalidateQueries({ queryKey: ["pending-collections"] });
      void queryClient.invalidateQueries({ queryKey: ["transfer-pool"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const litres = (rows ?? []).reduce((s, r) => s + Number(r.quantity_litres ?? 0), 0);
  const flagged = (rows ?? []).filter((r) => Number(r.risk_score ?? 0) >= 40).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting verification" value={rows?.length ?? 0} />
        <StatCard label="Litres pending" value={litres.toFixed(1)} />
        <StatCard label="Flagged as suspect" value={flagged} />
      </div>

      <ul className="surface-card divide-y divide-border overflow-hidden">
        {(rows ?? []).map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-48 flex-1">
              <p className="font-medium">{row.farmers?.full_name ?? "Farmer"}</p>
              <p className="text-xs text-muted-foreground">
                {row.farmers?.farmer_code} · {row.session} · {row.animal_type} · agent{" "}
                {row.agents?.full_name ?? "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Fat {row.fat_pct ?? "—"}% · SNF {row.snf_pct ?? "—"}% · ₹
                {Number(row.rate_per_litre ?? 0).toFixed(2)}/L ·{" "}
                {new Date(row.collected_at).toLocaleString()}
              </p>
              {row.quality_override_reason && (
                <p className="mt-1 text-xs font-medium text-amber-600">
                  Agent continued despite alert: "{row.quality_override_reason}"
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="font-semibold">{Number(row.quantity_litres ?? 0).toFixed(1)} L</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(Number(row.total_amount ?? 0))}
              </p>
            </div>
            {Number(row.risk_score ?? 0) >= 40 && <Badge variant="destructive">Suspect</Badge>}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => decide.mutate({ id: row.id, status: "verified" })}
                disabled={decide.isPending}
              >
                <Check className="h-4 w-4" /> Verify
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => decide.mutate({ id: row.id, status: "rejected" })}
                disabled={decide.isPending}
              >
                <X className="h-4 w-4" /> Reject
              </Button>
            </div>
          </li>
        ))}
        {(rows?.length ?? 0) === 0 && (
          <li className="p-8 text-center text-sm text-muted-foreground">
            No agent entries waiting for verification.
          </li>
        )}
      </ul>
    </div>
  );
}

function CentreWalkIn({ mccId }: { mccId: string | undefined }) {
  const [search, setSearch] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [selected, setSelected] = useState<Farmer | null>(null);

  const { data: farmers } = useQuery<Farmer[]>({
    queryKey: ["centre-farmers", mccId],
    enabled: Boolean(mccId),
    queryFn: async () => {
      const { data } = await supabase
        .from("farmers")
        .select("id, full_name, farmer_code, village")
        .eq("mcc_id", mccId!)
        .eq("status", "active")
        .order("full_name");
      return (data ?? []) as Farmer[];
    },
  });

  const term = search.trim().toLowerCase();
  const list = (farmers ?? []).filter(
    (f) =>
      !term ||
      f.full_name.toLowerCase().includes(term) ||
      f.farmer_code.toLowerCase().includes(term),
  );

  async function lookupCard(code: string) {
    setScanOpen(false);
    const { data: card } = await supabase
      .from("qr_cards")
      .select("entity_type, entity_id")
      .eq("code_value", code)
      .maybeSingle();
    if (!card || card.entity_type !== "farmer") {
      toast.error("No farmer card matches that code.");
      return;
    }
    const match = (farmers ?? []).find((f) => f.id === card.entity_id);
    if (!match) {
      toast.error("That farmer belongs to another centre.");
      return;
    }
    setSelected(match);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search farmer name or code"
            className="h-12 pl-9"
          />
        </div>
        <Button variant="outline" className="h-12" onClick={() => setScanOpen(true)}>
          <QrCode className="h-4 w-4" /> Scan card
        </Button>
      </div>

      <ul className="surface-card divide-y divide-border overflow-hidden">
        {list.slice(0, 50).map((farmer) => (
          <li key={farmer.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{farmer.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {farmer.farmer_code}
                {farmer.village ? ` · ${farmer.village}` : ""}
              </p>
            </div>
            <Button size="sm" onClick={() => setSelected(farmer)}>
              Record milk
            </Button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="p-8 text-center text-sm text-muted-foreground">
            No farmers found for this centre.
          </li>
        )}
      </ul>

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan farmer card</DialogTitle>
          </DialogHeader>
          {scanOpen && <QrScanner onResult={(c) => void lookupCard(c)} onClose={() => setScanOpen(false)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selected?.full_name} · {selected?.farmer_code}
            </DialogTitle>
          </DialogHeader>
          {selected && mccId && (
            <MilkEntryForm
              target={{
                farmerId: selected.id,
                farmerName: selected.full_name,
                farmerCode: selected.farmer_code,
                mccId,
                agentId: null,
                source: "centre",
              }}
              onSaved={() => setSelected(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}