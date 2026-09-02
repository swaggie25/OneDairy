import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/transfers")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["manager", "owner", "accountant"]),
  head: () => ({
    meta: [
      { title: "Transfers to dairy plant — DairyOne" },
      {
        name: "description",
        content:
          "Batch verified milk collections into a tanker transfer and dispatch it to a dairy plant buyer.",
      },
      { property: "og:title", content: "Transfers to dairy plant — DairyOne" },
      {
        property: "og:description",
        content: "Build transfer batches with quantity and fat/SNF summary, then hand off to a buyer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TransfersScreen,
});

function TransfersScreen() {
  const { data: mcc } = useStaffMcc();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [buyerId, setBuyerId] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [tanker, setTanker] = useState("");

  const { data: buyers } = useQuery({
    queryKey: ["buyers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("buyers")
        .select("id, name, code")
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: pool } = useQuery({
    queryKey: ["transfer-pool", mcc?.mccId],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const { data: taken } = await supabase.from("transfer_collections").select("collection_id");
      const used = new Set((taken ?? []).map((t) => t.collection_id));
      const { data } = await supabase
        .from("milk_collections")
        .select(
          "id, collected_at, session, source, quantity_litres, fat_pct, snf_pct, farmers(full_name, farmer_code)",
        )
        .eq("mcc_id", mcc!.mccId)
        .eq("status", "verified")
        .order("collected_at", { ascending: false })
        .limit(300);
      return (data ?? []).filter((row) => !used.has(row.id));
    },
  });

  const { data: transfers } = useQuery({
    queryKey: ["transfers", mcc?.mccId],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const { data } = await supabase
        .from("transfers")
        .select(
          "id, transfer_date, session, quantity_litres, avg_fat, avg_snf, vehicle_no, tanker_id, status, dispatched_at, received_at, buyers(name, code)",
        )
        .eq("mcc_id", mcc!.mccId)
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  const chosen = useMemo(
    () => (pool ?? []).filter((row) => selected[row.id]),
    [pool, selected],
  );
  const summary = useMemo(() => {
    const litres = chosen.reduce((s, r) => s + Number(r.quantity_litres ?? 0), 0);
    const weighted = (key: "fat_pct" | "snf_pct") => {
      const rows = chosen.filter((r) => r[key] != null && Number(r.quantity_litres) > 0);
      const total = rows.reduce((s, r) => s + Number(r.quantity_litres), 0);
      if (!total) return null;
      return (
        rows.reduce((s, r) => s + Number(r[key]) * Number(r.quantity_litres), 0) / total
      );
    };
    return { litres, fat: weighted("fat_pct"), snf: weighted("snf_pct") };
  }, [chosen]);

  const createTransfer = useMutation({
    mutationFn: async () => {
      if (!mcc?.mccId) throw new Error("No collection centre assigned.");
      if (!buyerId) throw new Error("Choose a dairy plant buyer.");
      if (chosen.length === 0) throw new Error("Select at least one collection.");
      const { data: auth } = await supabase.auth.getUser();
      const { data: transfer, error } = await supabase
        .from("transfers")
        .insert({
          mcc_id: mcc.mccId,
          buyer_id: buyerId,
          session: chosen[0]?.session ?? "morning",
          quantity_litres: Number(summary.litres.toFixed(2)),
          avg_fat: summary.fat != null ? Number(summary.fat.toFixed(2)) : null,
          avg_snf: summary.snf != null ? Number(summary.snf.toFixed(2)) : null,
          vehicle_no: vehicle || null,
          tanker_id: tanker || null,
          status: "dispatched",
          dispatched_at: new Date().toISOString(),
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: linkError } = await supabase.from("transfer_collections").insert(
        chosen.map((row) => ({ transfer_id: transfer.id, collection_id: row.id })),
      );
      if (linkError) throw linkError;
    },
    onSuccess: () => {
      toast.success("Transfer dispatched to the buyer");
      setSelected({});
      setVehicle("");
      setTanker("");
      void queryClient.invalidateQueries({ queryKey: ["transfer-pool"] });
      void queryClient.invalidateQueries({ queryKey: ["transfers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell nav={navForRole(user?.role)}>
      <PageHeading
        title="Transfer to dairy plant"
        subtitle="Batch verified collections — from agents and centre walk-ins — into a tanker load."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Selected entries" value={chosen.length} />
        <StatCard label="Litres in batch" value={summary.litres.toFixed(1)} />
        <StatCard
          label="Avg fat / SNF"
          value={`${summary.fat?.toFixed(2) ?? "—"} / ${summary.snf?.toFixed(2) ?? "—"}`}
        />
      </div>

      <div className="surface-card mt-4 grid gap-3 p-5 sm:grid-cols-4">
        <div>
          <Label>Buyer</Label>
          <Select value={buyerId} onValueChange={setBuyerId}>
            <SelectTrigger className="mt-1 h-11">
              <SelectValue placeholder="Select dairy plant" />
            </SelectTrigger>
            <SelectContent>
              {(buyers ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="vehicle">Vehicle no.</Label>
          <Input
            id="vehicle"
            className="mt-1 h-11"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            placeholder="GJ-07-AB-1234"
          />
        </div>
        <div>
          <Label htmlFor="tanker">Tanker ID</Label>
          <Input
            id="tanker"
            className="mt-1 h-11"
            value={tanker}
            onChange={(e) => setTanker(e.target.value)}
            placeholder="TNK-12"
          />
        </div>
        <div className="flex items-end">
          <Button
            className="h-11 w-full"
            onClick={() => createTransfer.mutate()}
            disabled={createTransfer.isPending}
          >
            <Truck className="h-4 w-4" /> Dispatch transfer
          </Button>
        </div>
      </div>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-muted-foreground">
        Verified milk not yet transferred
      </h2>
      <ul className="surface-card divide-y divide-border overflow-hidden">
        {(pool ?? []).map((row) => (
          <li key={row.id} className="flex items-center gap-3 p-4">
            <Checkbox
              checked={Boolean(selected[row.id])}
              onCheckedChange={(v) =>
                setSelected((prev) => ({ ...prev, [row.id]: Boolean(v) }))
              }
              aria-label={`Select ${row.farmers?.full_name ?? "collection"}`}
            />
            <div className="flex-1">
              <p className="font-medium">{row.farmers?.full_name ?? "Farmer"}</p>
              <p className="text-xs text-muted-foreground">
                {row.farmers?.farmer_code} · {row.session} · {row.source} ·{" "}
                {new Date(row.collected_at).toLocaleString()}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{Number(row.quantity_litres ?? 0).toFixed(1)} L</p>
              <p className="text-muted-foreground">
                Fat {row.fat_pct ?? "—"} · SNF {row.snf_pct ?? "—"}
              </p>
            </div>
          </li>
        ))}
        {(pool?.length ?? 0) === 0 && (
          <li className="p-8 text-center text-sm text-muted-foreground">
            Nothing to transfer — verify agent entries first.
          </li>
        )}
      </ul>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-muted-foreground">Recent transfers</h2>
      <ul className="surface-card divide-y divide-border overflow-hidden">
        {(transfers ?? []).map((t) => (
          <li key={t.id} className="flex items-center gap-3 p-4">
            <PackageCheck className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="font-medium">{t.buyers?.name ?? "Buyer"}</p>
              <p className="text-xs text-muted-foreground">
                {t.transfer_date} · {t.session} · {t.vehicle_no ?? "no vehicle"} ·{" "}
                {t.tanker_id ?? "no tanker"}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{Number(t.quantity_litres).toFixed(1)} L</p>
              <p className="text-muted-foreground">
                Fat {t.avg_fat ?? "—"} · SNF {t.avg_snf ?? "—"}
              </p>
            </div>
            <Badge variant={t.status === "received" ? "secondary" : "outline"}>{t.status}</Badge>
          </li>
        ))}
        {(transfers?.length ?? 0) === 0 && (
          <li className="p-8 text-center text-sm text-muted-foreground">No transfers yet.</li>
        )}
      </ul>
    </AppShell>
  );
}
