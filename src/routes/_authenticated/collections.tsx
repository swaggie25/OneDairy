import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CloudUpload, Droplets, Printer, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgentContext } from "@/hooks/useAgentContext";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { formatCurrency } from "@/lib/pricing";
import { openReceiptPreview } from "@/lib/receipt";
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

/**
 * ITEM 4 — period presets used by the "When" dropdown. Each maps to a
 * `collected_at` lower bound computed at render time; "all" and "custom"
 * are handled separately (custom exposes two date inputs instead).
 */
type Period = "all" | "today" | "week" | "month" | "quarter" | "custom";

const PERIOD_LABEL: Record<Period, string> = {
  all: "All time",
  today: "Today",
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  custom: "Custom range",
};

// ITEM 4 (bugfix follow-up) — "Today" is now the default view; every other
// period (including "All time") is an opt-in filter the agent applies.
const DEFAULT_PERIOD: Period = "today";

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function periodStart(period: Period): Date | null {
  const now = new Date();
  if (period === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "week") return startOfWeek(now);
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1);
  }
  return null;
}

function CollectionsScreen() {
  const { data: agent } = useAgentContext();
  const { pending, online, flush } = useOfflineQueue();

  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");

  const rangeFrom =
    period === "custom" ? (customFrom ? new Date(customFrom) : null) : periodStart(period);
  const rangeTo = period === "custom" && customTo ? new Date(`${customTo}T23:59:59`) : null;

  const hasFilters =
    period !== DEFAULT_PERIOD || nameQuery.trim().length > 0 || locationQuery.trim().length > 0;

  const { data: rows, isLoading } = useQuery({
    queryKey: [
      "agent-collections",
      agent?.agentId,
      period,
      period === "custom" ? customFrom : null,
      period === "custom" ? customTo : null,
    ],
    enabled: Boolean(agent?.agentId),
    queryFn: async () => {
      let query = supabase
        .from("milk_collections")
        .select(
          "id, collected_at, session, animal_type, quantity_litres, fat_pct, snf_pct, rate_per_litre, total_amount, status, risk_score, farmers(full_name, farmer_code, village)",
        )
        .eq("agent_id", agent!.agentId)
        .order("collected_at", { ascending: false });

      // Date-filtered views may need to reach further back than the default
      // "recent activity" cap, so only limit the unfiltered/default view.
      if (rangeFrom) query = query.gte("collected_at", rangeFrom.toISOString());
      if (rangeTo) query = query.lte("collected_at", rangeTo.toISOString());
      query = rangeFrom || rangeTo ? query.limit(1000) : query.limit(100);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Name and location (village) are filtered client-side — no extra round
  // trip needed since the date-scoped query above already narrows things
  // down, and this keeps the search feeling instant as the agent types.
  const filteredRows = useMemo(() => {
    const name = nameQuery.trim().toLowerCase();
    const loc = locationQuery.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      const matchesName =
        !name ||
        row.farmers?.full_name?.toLowerCase().includes(name) ||
        row.farmers?.farmer_code?.toLowerCase().includes(name);
      const matchesLoc = !loc || row.farmers?.village?.toLowerCase().includes(loc);
      return matchesName && matchesLoc;
    });
  }, [rows, nameQuery, locationQuery]);

  const litres = filteredRows.reduce((s, r) => s + Number(r.quantity_litres ?? 0), 0);
  const amount = filteredRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);

  const groups = new Map<string, typeof filteredRows>();
  for (const row of filteredRows) {
    const day = new Date(row.collected_at).toISOString().slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), row]);
  }

  return (
    <AppShell mobileFirst>
      <PageHeading
        title="My collections"
        subtitle={
          hasFilters
            ? `${filteredRows.length} entr${filteredRows.length === 1 ? "y" : "ies"} matching your filters.`
            : `${filteredRows.length} entr${filteredRows.length === 1 ? "y" : "ies"} collected today.`
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Entries" value={filteredRows.length} />
        <StatCard label="Litres" value={litres.toFixed(1)} />
        <StatCard label="Value" value={formatCurrency(amount)} />
      </div>

      {/* FILTERS — when / name / location, per Item 4 */}
      <div className="surface-card mt-4 space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">When</label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PERIOD_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Farmer name / code
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="Search name or code"
                className="h-10 pl-8"
              />
            </div>
          </div>
        </div>

        {period === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">From</label>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-10"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">To</label>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Location / village
          </label>
          <Input
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
            placeholder="Search village"
            className="h-10"
          />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setPeriod(DEFAULT_PERIOD);
              setCustomFrom("");
              setCustomTo("");
              setNameQuery("");
              setLocationQuery("");
            }}
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
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
                      {row.farmers?.village ? ` · ${row.farmers.village}` : ""}
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
                    <div className="mt-1 flex items-center justify-end gap-1">
                      {Number(row.risk_score ?? 0) >= 40 && (
                        <StatusBadge status="danger" label="Flagged" size="sm" />
                      )}
                      <StatusBadge
                        status={row.status === "verified" ? "success" : "muted"}
                        label={row.status}
                        size="sm"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        title="Reprint receipt"
                        aria-label={`Reprint receipt for ${row.farmers?.full_name ?? "farmer"}`}
                        onClick={() => {
                          const opened = openReceiptPreview({
                            farmerName: row.farmers?.full_name ?? "Farmer",
                            farmerCode: row.farmers?.farmer_code ?? "",
                            session: row.session,
                            quantityLitres: Number(row.quantity_litres ?? 0),
                            fatPct: row.fat_pct != null ? Number(row.fat_pct) : null,
                            snfPct: row.snf_pct != null ? Number(row.snf_pct) : null,
                            ratePerLitre: Number(row.rate_per_litre ?? 0),
                            totalAmount: Number(row.total_amount ?? 0),
                            collectedAt: row.collected_at,
                          });
                          if (!opened) toast.error("Allow pop-ups to view the receipt.");
                        }}
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {!isLoading && filteredRows.length === 0 && (
          <div className="surface-card flex flex-col items-center p-8 text-center">
            <Icon icon={Droplets} size="xl" tone="active" />
            <p className="mt-2 text-sm text-muted-foreground">
              {hasFilters
                ? "No collections match these filters."
                : "No collections yet. Start a trip and record your first entry."}
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
