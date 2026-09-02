import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, BrandMark } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { qrDataUrl } from "@/lib/qr";

export const Route = createFileRoute("/_authenticated/card/$code")({
  head: () => ({
    meta: [
      { title: "Digital QR card — DairyOne" },
      {
        name: "description",
        content:
          "Shareable digital identity card for a DairyOne farmer or collection agent, with a scannable QR code.",
      },
      { property: "og:title", content: "Digital QR card — DairyOne" },
      {
        property: "og:description",
        content: "Scan this card at a route point to pull up the profile and start a collection.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DigitalCard,
});

function DigitalCard() {
  const { code } = Route.useParams();
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void qrDataUrl(code, 320).then((url) => alive && setQr(url));
    return () => {
      alive = false;
    };
  }, [code]);

  const { data, isLoading } = useQuery({
    queryKey: ["digital-card", code],
    queryFn: async () => {
      const { data: card } = await supabase
        .from("qr_cards")
        .select("entity_type, entity_id, issued_at, active")
        .eq("code_value", code)
        .maybeSingle();
      if (!card) return null;
      if (card.entity_type === "farmer") {
        const { data: farmer } = await supabase
          .from("farmers")
          .select("full_name, farmer_code, village, phone, mcc_centres(name)")
          .eq("id", card.entity_id)
          .maybeSingle();
        return {
          type: "Farmer",
          name: farmer?.full_name ?? "Farmer",
          code: farmer?.farmer_code ?? "",
          extra: farmer?.village ?? "",
          phone: farmer?.phone ?? "",
          centre: farmer?.mcc_centres?.name ?? "",
          issuedAt: card.issued_at,
          active: card.active,
        };
      }
      const { data: agent } = await supabase
        .from("agents")
        .select("full_name, employee_code, phone, mcc_centres(name)")
        .eq("id", card.entity_id)
        .maybeSingle();
      return {
        type: "Collection agent",
        name: agent?.full_name ?? "Agent",
        code: agent?.employee_code ?? "",
        extra: "",
        phone: agent?.phone ?? "",
        centre: agent?.mcc_centres?.name ?? "",
        issuedAt: card.issued_at,
        active: card.active,
      };
    },
  });

  return (
    <AppShell mobileFirst>
      {isLoading && <p className="text-sm text-muted-foreground">Loading card…</p>}
      {!isLoading && !data && (
        <div className="surface-card p-8 text-center">
          <h1 className="text-lg font-semibold">Card not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            No DairyOne card matches the code {code}.
          </p>
        </div>
      )}
      {data && (
        <>
          <div className="surface-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 bg-primary-soft p-4">
              <div className="flex items-center gap-2.5">
                <BrandMark />
                <div>
                  <p className="text-sm font-extrabold tracking-tight">DairyOne</p>
                  <p className="text-xs text-muted-foreground">{data.centre}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary">{data.type}</Badge>
                <StatusBadge
                  status={data.active ? "success" : "muted"}
                  label={data.active ? "Active" : "Inactive"}
                  size="sm"
                />
              </div>
            </div>
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              {qr && (
                <img
                  src={qr}
                  alt={`QR code for ${data.name}`}
                  className="h-56 w-56 rounded-xl border border-border"
                />
              )}
              <h1 className="text-xl font-bold tracking-tight">{data.name}</h1>
              <p className="text-sm text-muted-foreground">
                {data.code}
                {data.extra ? ` · ${data.extra}` : ""}
              </p>
              {data.phone && <p className="text-sm text-muted-foreground">{data.phone}</p>}
              <p className="text-xs text-muted-foreground">
                Issued {new Date(data.issuedAt).toLocaleDateString()} · {code}
              </p>
            </div>
          </div>
          <Button variant="outline" className="mt-4 h-12 w-full" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print physical card
          </Button>
        </>
      )}
    </AppShell>
  );
}
