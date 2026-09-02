import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Droplets,
  IndianRupee,
  TrendingUp,
  MapPin,
  Clock,
  AlertTriangle,
  Route as RouteIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, StatCard } from "@/components/app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStaffMcc } from "@/hooks/useStaffMcc";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { navForRole } from "@/lib/nav";
import { formatCurrency } from "@/lib/pricing";
import { isoDaysAgo } from "@/lib/settlement";
import {
  computeShiftMetrics,
  computeTrackingMetrics,
  formatDurationShort,
  type Ping,
} from "@/lib/trip-history";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/reports")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["manager", "owner", "accountant"]),
  head: () => ({
    meta: [
      { title: "Reports & trends — DairyOne" },
      {
        name: "description",
        content:
          "Daily collection volume, fat and SNF trends, village-wise procurement and payout totals for your milk collection centre.",
      },
      { property: "og:title", content: "Reports & trends — DairyOne" },
      {
        property: "og:description",
        content: "Charts that show where your milk and money are going.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsScreen,
});

type Row = {
  collected_at: string;
  quantity_litres: number | null;
  total_amount: number | null;
  fat_pct: number | null;
  snf_pct: number | null;
  session: string;
  farmers: { village: string | null } | null;
};

function ReportsScreen() {
  const { data: user } = useCurrentUser();
  const { data: mcc } = useStaffMcc();
  const from = isoDaysAgo(30);

  const { data: rows } = useQuery({
    queryKey: ["report-rows", mcc?.mccId],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const { data } = await supabase
        .from("milk_collections")
        .select(
          "collected_at, quantity_litres, total_amount, fat_pct, snf_pct, session, farmers(village)",
        )
        .eq("mcc_id", mcc!.mccId)
        .gte("collected_at", `${from}T00:00:00Z`)
        .order("collected_at")
        .limit(3000);
      return (data ?? []) as Row[];
    },
  });

  // LIVE TRACKING PLAN — PHASE 9: "Integrate with existing DairyOne
  // reporting" / "Reports MUST use actual operational records" — this is
  // the SAME reports.tsx, a second tab, reading route_trips /
  // tracking_sessions / trip_exceptions / mcc_handovers directly, not a
  // parallel tracking-reports page or a synthetic dataset.
  const { data: tracking } = useQuery({
    queryKey: ["report-tracking", mcc?.mccId],
    enabled: Boolean(mcc?.mccId),
    queryFn: async () => {
      const [{ data: trips }, { data: sessions }, { data: exceptions }, { data: handovers }] =
        await Promise.all([
          supabase
            .from("route_trips")
            .select(
              "id, trip_date, session, status, actual_duration_seconds, actual_distance_meters, deviation_count, agents(full_name)",
            )
            .eq("mcc_id", mcc!.mccId)
            .gte("trip_date", from)
            .order("trip_date", { ascending: false })
            .limit(500),
          supabase
            .from("tracking_sessions")
            .select("status, start_at, end_at")
            .eq("mcc_id", mcc!.mccId)
            .gte("start_at", `${from}T00:00:00Z`)
            .limit(500),
          supabase
            .from("trip_exceptions")
            .select("type")
            .eq("mcc_id", mcc!.mccId)
            .gte("created_at", `${from}T00:00:00Z`)
            .limit(2000),
          supabase
            .from("mcc_handovers")
            .select("status, declared_quantity_litres, received_quantity_litres, variance_litres")
            .eq("mcc_id", mcc!.mccId)
            .gte("trip_date", from)
            .limit(500),
        ]);
      return {
        trips: trips ?? [],
        sessions: (sessions ?? []) as {
          status: string;
          start_at: string | null;
          end_at: string | null;
        }[],
        exceptions: (exceptions ?? []) as { type: string }[],
        handovers: handovers ?? [],
      };
    },
  });

  const trackingSummary = useMemo(() => {
    const trips = tracking?.trips ?? [];
    const sessions = tracking?.sessions ?? [];
    const exceptions = tracking?.exceptions ?? [];
    const handovers = tracking?.handovers ?? [];

    const completedTrips = trips.filter((t) => t.status === "completed").length;
    const avgDeviation = trips.length ? mean(trips.map((t) => t.deviation_count ?? 0)) : 0;
    const totalDistanceKm =
      trips.reduce((s, t) => s + Number(t.actual_distance_meters ?? 0), 0) / 1000;

    const shiftDurations = sessions
      .filter((s) => s.start_at && s.end_at)
      .map((s) => computeShiftMetrics([] as Ping[], s.start_at, s.end_at).shiftSeconds)
      .filter((s): s is number => s != null);
    const avgShiftSeconds = shiftDurations.length ? mean(shiftDurations) : null;

    const degradedOrFailed = sessions.filter(
      (s) => s.status === "degraded" || s.status === "failed",
    ).length;
    const trackingAvailabilityPct = sessions.length
      ? Math.round(((sessions.length - degradedOrFailed) / sessions.length) * 100)
      : null;

    const syncFailures = exceptions.filter((e) => e.type === "sync_failure").length;
    const gpsFailures = exceptions.filter(
      (e) => e.type === "gps_failure" || e.type === "tracking_failure",
    ).length;
    const deviations = exceptions.filter((e) => e.type === "route_deviation").length;
    const unplannedStops = exceptions.filter((e) => e.type === "unplanned_stop").length;

    const variances = handovers.map((h) => Number(h.variance_litres ?? 0));
    const avgVarianceLitres = variances.length ? mean(variances.map(Math.abs)) : 0;

    return {
      totalTrips: trips.length,
      completedTrips,
      avgDeviation: round1(avgDeviation),
      totalDistanceKm: round1(totalDistanceKm),
      avgShiftSeconds,
      trackingAvailabilityPct,
      sessionCount: sessions.length,
      syncFailures,
      gpsFailures,
      deviations,
      unplannedStops,
      handoverCount: handovers.length,
      avgVarianceLitres: round1(avgVarianceLitres),
      recentTrips: trips.slice(0, 10),
    };
  }, [tracking]);

  const daily = useMemo(() => {
    const acc = new Map<
      string,
      { day: string; litres: number; amount: number; fat: number[]; snf: number[] }
    >();
    for (const row of rows ?? []) {
      const day = row.collected_at.slice(0, 10);
      const cur = acc.get(day) ?? { day, litres: 0, amount: 0, fat: [], snf: [] };
      cur.litres += Number(row.quantity_litres ?? 0);
      cur.amount += Number(row.total_amount ?? 0);
      if (row.fat_pct != null) cur.fat.push(Number(row.fat_pct));
      if (row.snf_pct != null) cur.snf.push(Number(row.snf_pct));
      acc.set(day, cur);
    }
    return [...acc.values()].map((d) => ({
      day: d.day.slice(5),
      litres: round1(d.litres),
      amount: round1(d.amount),
      fat: d.fat.length ? round2(mean(d.fat)) : null,
      snf: d.snf.length ? round2(mean(d.snf)) : null,
    }));
  }, [rows]);

  const villages = useMemo(() => {
    const acc = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = row.farmers?.village || "Unassigned";
      acc.set(key, (acc.get(key) ?? 0) + Number(row.quantity_litres ?? 0));
    }
    return [...acc.entries()]
      .map(([village, litres]) => ({ village, litres: round1(litres) }))
      .sort((a, b) => b.litres - a.litres)
      .slice(0, 8);
  }, [rows]);

  const totals = useMemo(() => {
    const litres = (rows ?? []).reduce((s, r) => s + Number(r.quantity_litres ?? 0), 0);
    const amount = (rows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
    return {
      litres: round1(litres),
      amount: round1(amount),
      avgRate: litres ? amount / litres : 0,
    };
  }, [rows]);

  return (
    <AppShell nav={navForRole(user?.role)}>
      <PageHeading
        title="Reports"
        subtitle="Last 30 days of procurement and field tracking at your collection centre."
      />

      <Tabs defaultValue="procurement" className="mt-2">
        <TabsList>
          <TabsTrigger value="procurement">Procurement</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="procurement">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Milk collected"
              value={`${totals.litres} L`}
              icon={<Droplets className="h-4 w-4" />}
            />
            <StatCard
              label="Procurement value"
              value={formatCurrency(totals.amount)}
              icon={<IndianRupee className="h-4 w-4" />}
            />
            <StatCard
              label="Average rate"
              value={formatCurrency(totals.avgRate)}
              hint="Per litre"
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>

          <div className="surface-card mt-4 p-5">
            <h2 className="mb-3 text-sm font-semibold">Daily volume &amp; value</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="litres"
                    name="Litres"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.15}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    name="₹"
                    stroke="hsl(var(--accent))"
                    fill="hsl(var(--accent))"
                    fillOpacity={0.1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="surface-card p-5">
              <h2 className="mb-3 text-sm font-semibold">Fat &amp; SNF trend</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="fat"
                      name="Fat %"
                      stroke="hsl(var(--primary))"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="snf"
                      name="SNF %"
                      stroke="hsl(var(--accent))"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="surface-card p-5">
              <h2 className="mb-3 text-sm font-semibold">Collection by village</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={villages}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="village" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar
                      dataKey="litres"
                      name="Litres"
                      fill="hsl(var(--primary))"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {(rows?.length ?? 0) === 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              No collections in the last 30 days yet — charts fill in as milk comes in.
            </p>
          )}
        </TabsContent>

        <TabsContent value="tracking">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Trips"
              value={trackingSummary.totalTrips}
              hint={`${trackingSummary.completedTrips} completed`}
              icon={<RouteIcon className="h-4 w-4" />}
            />
            <StatCard
              label="Avg deviation events"
              value={trackingSummary.avgDeviation}
              hint="Per trip"
              icon={<MapPin className="h-4 w-4" />}
            />
            <StatCard
              label="Avg shift"
              value={formatDurationShort(trackingSummary.avgShiftSeconds)}
              icon={<Clock className="h-4 w-4" />}
            />
            <StatCard
              label="Tracking availability"
              value={
                trackingSummary.trackingAvailabilityPct != null
                  ? `${trackingSummary.trackingAvailabilityPct}%`
                  : "—"
              }
              hint={`${trackingSummary.sessionCount} sessions`}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Route deviations" value={trackingSummary.deviations} />
            <StatCard label="Unplanned stops" value={trackingSummary.unplannedStops} />
            <StatCard label="Sync failures" value={trackingSummary.syncFailures} />
            <StatCard label="GPS/tracking failures" value={trackingSummary.gpsFailures} />
          </div>

          <div className="surface-card mt-4 p-5">
            <h2 className="mb-1 text-sm font-semibold">MCC handovers</h2>
            <p className="text-sm text-muted-foreground">
              {trackingSummary.handoverCount} handover
              {trackingSummary.handoverCount === 1 ? "" : "s"} · average variance{" "}
              {trackingSummary.avgVarianceLitres} L
            </p>
          </div>

          <div className="surface-card mt-4 p-5">
            <h2 className="mb-3 text-sm font-semibold">Recent trips</h2>
            <div className="space-y-2">
              {trackingSummary.recentTrips.map((t) => (
                <Link
                  key={t.id}
                  to="/trip-history/$tripid"
                  params={{ tripid: t.id }}
                  search={{ from: "/reports" }}
                  className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:bg-muted/50"
                >
                  <span>
                    {(t.agents as { full_name: string } | null)?.full_name ?? "Agent"} ·{" "}
                    {t.trip_date} · {t.session}
                  </span>
                  <span className="text-muted-foreground">{t.status}</span>
                </Link>
              ))}
              {trackingSummary.recentTrips.length === 0 && (
                <p className="text-sm text-muted-foreground">No trips in the last 30 days yet.</p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function mean(values: number[]) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
