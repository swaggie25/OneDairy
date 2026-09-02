import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStaffMcc } from "@/hooks/useStaffMcc";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cardCodeFor, cardUrl, qrDataUrl } from "@/lib/qr";
import { navForRole } from "@/lib/nav";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/cards")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["manager", "owner"]),
  head: () => ({
    meta: [
      { title: "QR cards — DairyOne" },
      {
        name: "description",
        content:
          "Issue, view and print scannable QR identity cards for every farmer and collection agent.",
      },
      { property: "og:title", content: "QR cards — DairyOne" },
      {
        property: "og:description",
        content: "Digital and printable QR cards that agents scan to start a collection instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CardsScreen,
});

type CardRow = {
  id: string;
  name: string;
  code: string;
  entityId: string;
  cardCode: string | null;
};

function CardsScreen() {
  const { data: mcc } = useStaffMcc();
  const { data: user } = useCurrentUser();
  return (
    <AppShell nav={navForRole(user?.role)}>
      <PageHeading
        title="QR cards"
        subtitle="Every farmer and agent gets a scannable card — digital link plus printable layout."
      />
      <Tabs defaultValue="farmer">
        <TabsList>
          <TabsTrigger value="farmer">Farmers</TabsTrigger>
          <TabsTrigger value="agent">Agents</TabsTrigger>
        </TabsList>
        <TabsContent value="farmer" className="mt-4">
          <CardList entityType="farmer" mccId={mcc?.mccId} />
        </TabsContent>
        <TabsContent value="agent" className="mt-4">
          <CardList entityType="agent" mccId={mcc?.mccId} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function CardList({
  entityType,
  mccId,
}: {
  entityType: "farmer" | "agent";
  mccId: string | undefined;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: rows } = useQuery<CardRow[]>({
    queryKey: ["qr-card-list", entityType, mccId],
    enabled: Boolean(mccId),
    queryFn: async () => {
      const table = entityType === "farmer" ? "farmers" : "agents";
      const codeField = entityType === "farmer" ? "farmer_code" : "employee_code";
      const { data: people } = await supabase
        .from(table)
        .select(`id, full_name, ${codeField}`)
        .eq("mcc_id", mccId!)
        .order("full_name");
      const { data: cards } = await supabase
        .from("qr_cards")
        .select("entity_id, code_value")
        .eq("entity_type", entityType);
      const byEntity = new Map((cards ?? []).map((c) => [c.entity_id, c.code_value]));
      return ((people ?? []) as unknown as Record<string, string>[]).map((p) => ({
        id: p["id"] as string,
        name: p["full_name"] as string,
        code: p[codeField] as string,
        entityId: p["id"] as string,
        cardCode: byEntity.get(p["id"] as string) ?? null,
      }));
    },
  });

  const issue = useMutation({
    mutationFn: async () => {
      const missing = (rows ?? []).filter((r) => !r.cardCode);
      if (missing.length === 0) throw new Error("Every card is already issued.");
      const { error } = await supabase.from("qr_cards").insert(
        missing.map((r) => ({
          entity_type: entityType,
          entity_id: r.entityId,
          mcc_id: mccId ?? null,
          code_value: cardCodeFor(entityType, r.code),
        })),
      );
      if (error) throw error;
      return missing.length;
    },
    onSuccess: (count) => {
      toast.success(`Issued ${count} card${count === 1 ? "" : "s"}`);
      void queryClient.invalidateQueries({ queryKey: ["qr-card-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const term = search.trim().toLowerCase();
  const list = (rows ?? []).filter(
    (r) => !term || r.name.toLowerCase().includes(term) || r.code.toLowerCase().includes(term),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          className="h-11 min-w-56 flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or code"
        />
        <Button variant="outline" className="h-11" onClick={() => issue.mutate()}>
          <RefreshCw className="h-4 w-4" /> Issue missing cards
        </Button>
        <Button className="h-11" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print sheet
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((row) => (
          <CardTile key={row.id} row={row} entityType={entityType} />
        ))}
        {list.length === 0 && (
          <p className="surface-card p-8 text-center text-sm text-muted-foreground">
            No {entityType}s at this centre yet.
          </p>
        )}
      </div>
    </div>
  );
}

function CardTile({ row, entityType }: { row: CardRow; entityType: "farmer" | "agent" }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!row.cardCode) return;
    let alive = true;
    void qrDataUrl(row.cardCode).then((url) => alive && setQr(url));
    return () => {
      alive = false;
    };
  }, [row.cardCode]);

  return (
    <div className="surface-card flex items-center gap-4 p-4">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-secondary">
        {qr ? (
          <img src={qr} alt={`QR card for ${row.name}`} className="h-24 w-24 rounded-xl" />
        ) : (
          <QrCode className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold">{row.name}</p>
        <p className="text-xs text-muted-foreground">
          {row.code} · {entityType}
        </p>
        {row.cardCode ? (
          <>
            <p className="mt-1 break-all text-xs text-muted-foreground">{row.cardCode}</p>
            <Button asChild size="sm" variant="ghost" className="mt-1 px-0">
              <Link to="/card/$code" params={{ code: row.cardCode }}>
                Open digital card
              </Link>
            </Button>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Card not issued yet</p>
        )}
        {row.cardCode && (
          <p className="sr-only">{cardUrl(row.cardCode)}</p>
        )}
      </div>
    </div>
  );
}
