import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPin, Users, Route as RouteIcon, LocateFixed, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading } from "@/components/app-shell";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { navForRole } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCoords } from "@/lib/geo";
import { requireRole } from "@/lib/route-guards";

const VEHICLE_TYPES = [
  { value: "bike", label: "Bike" },
  { value: "car", label: "Car" },
  { value: "van", label: "Milk pickup van" },
  { value: "truck", label: "Truck" },
] as const;

export const Route = createFileRoute("/_authenticated/field-setup")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["manager", "owner"]),
  head: () => ({
    meta: [
      { title: "Field setup — agents, routes & farmers | DairyOne" },
      {
        name: "description",
        content:
          "Add collection agents, build routes with ordered stops, register farmers and assign them to route points.",
      },
      { property: "og:title", content: "Field setup — agents, routes & farmers | DairyOne" },
      {
        property: "og:description",
        content: "Manage agents, routes, collection stops and farmer assignments for your centre.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FieldSetup,
});

function FieldSetup() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [mccId, setMccId] = useState<string>("");

  const { data: centres } = useQuery({
    queryKey: ["centres"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mcc_centres")
        .select("id, name, code")
        .eq("active", true)
        .order("name");
      const first = data?.[0];
      if (first && !mccId) setMccId(first.id);
      return data ?? [];
    },
  });

  const invalidate = (key: string) => queryClient.invalidateQueries({ queryKey: [key] });

  return (
    <AppShell nav={navForRole(user?.role)}>
      <PageHeading
        title="Field setup"
        subtitle="Agents, routes, collection stops and farmer assignments for your centre."
      />

      <div className="mb-6 flex items-end gap-3">
        <div className="w-full max-w-xs">
          <Label htmlFor="centre">Collection centre</Label>
          <Select value={mccId} onValueChange={setMccId}>
            <SelectTrigger id="centre" className="mt-1.5">
              <SelectValue placeholder="Select centre" />
            </SelectTrigger>
            <SelectContent>
              {(centres ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!mccId ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">
          No collection centre available to you yet.
        </div>
      ) : (
        <Tabs defaultValue="agents">
          <TabsList>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="routes">Routes & stops</TabsTrigger>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="farmers">Farmers</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="mt-4">
            <AgentsTab mccId={mccId} onChange={() => invalidate("setup-agents")} />
          </TabsContent>
          <TabsContent value="routes" className="mt-4">
            <RoutesTab mccId={mccId} />
          </TabsContent>
          <TabsContent value="assignments" className="mt-4">
            <AssignmentsTab mccId={mccId} />
          </TabsContent>
          <TabsContent value="farmers" className="mt-4">
            <FarmersTab mccId={mccId} />
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}

function AgentsTab({ mccId, onChange }: { mccId: string; onChange: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ full_name: "", employee_code: "", phone: "" });

  const { data: agents } = useQuery({
    queryKey: ["setup-agents", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("agents")
        .select("id, full_name, employee_code, phone, status")
        .eq("mcc_id", mccId)
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: routes } = useQuery({
    queryKey: ["setup-routes", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("routes")
        .select("id, name, assigned_agent_id")
        .eq("mcc_id", mccId)
        .order("name");
      return data ?? [];
    },
  });

  const addAgent = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim() || !form.employee_code.trim())
        throw new Error("Name and employee code are required.");
      const { error } = await supabase.from("agents").insert({
        mcc_id: mccId,
        full_name: form.full_name.trim(),
        employee_code: form.employee_code.trim(),
        phone: form.phone.trim() || null,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Agent added");
      setForm({ full_name: "", employee_code: "", phone: "" });
      await queryClient.invalidateQueries({ queryKey: ["setup-agents"] });
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: async ({ routeId, agentId }: { routeId: string; agentId: string }) => {
      const { error } = await supabase
        .from("routes")
        .update({ assigned_agent_id: agentId })
        .eq("id", routeId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Route assigned");
      await queryClient.invalidateQueries({ queryKey: ["setup-routes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <form
        className="surface-card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          addAgent.mutate();
        }}
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <Users className="h-4 w-4 text-primary" /> Add agent
        </h2>
        <div>
          <Label htmlFor="agent-name">Full name</Label>
          <Input
            id="agent-name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Ramesh Patel"
          />
        </div>
        <div>
          <Label htmlFor="agent-code">Employee code</Label>
          <Input
            id="agent-code"
            value={form.employee_code}
            onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
            placeholder="AGT-002"
          />
        </div>
        <div>
          <Label htmlFor="agent-phone">Phone</Label>
          <Input
            id="agent-phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="9876543210"
            inputMode="numeric"
          />
        </div>
        <Button type="submit" disabled={addAgent.isPending} className="w-full">
          <Plus className="h-4 w-4" /> Add agent
        </Button>
        <p className="text-xs text-muted-foreground">
          The agent signs in with this phone number; their account links automatically once a
          matching agent profile exists.
        </p>
      </form>

      <div className="surface-card p-5">
        <h2 className="font-semibold">Agents & route assignment</h2>
        <ul className="mt-3 divide-y divide-border">
          {(agents ?? []).map((a) => {
            const current = (routes ?? []).find((r) => r.assigned_agent_id === a.id);
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{a.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.employee_code}
                    {a.phone ? ` · ${a.phone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{a.status}</Badge>
                  <Select
                    value={current?.id ?? ""}
                    onValueChange={(routeId) => assign.mutate({ routeId, agentId: a.id })}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Assign route" />
                    </SelectTrigger>
                    <SelectContent>
                      {(routes ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </li>
            );
          })}
          {(agents ?? []).length === 0 && (
            <li className="py-6 text-sm text-muted-foreground">No agents yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function RoutesTab({ mccId }: { mccId: string }) {
  const queryClient = useQueryClient();
  const [routeName, setRouteName] = useState("");
  const [pointName, setPointName] = useState("");
  const [activeRoute, setActiveRoute] = useState<string>("");
  const [pointCoords, setPointCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });
  const [pointRadius, setPointRadius] = useState("");
  const [locating, setLocating] = useState(false);

  const { data: routes } = useQuery({
    queryKey: ["setup-routes", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("routes")
        .select(
          "id, name, description, route_points(id, name, sequence, lat, lng, geofence_radius_m)",
        )
        .eq("mcc_id", mccId)
        .order("name");
      return data ?? [];
    },
  });

  const { data: centreGeofence } = useQuery({
    queryKey: ["centre-geofence", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mcc_centres")
        .select("default_geofence_radius_m, min_gps_accuracy_m")
        .eq("id", mccId)
        .maybeSingle();
      return data;
    },
  });
  const [radiusDraft, setRadiusDraft] = useState("");
  const [accuracyDraft, setAccuracyDraft] = useState("");

  const saveGeofenceDefaults = useMutation({
    mutationFn: async () => {
      const patch: { default_geofence_radius_m?: number; min_gps_accuracy_m?: number } = {};
      if (radiusDraft.trim()) patch.default_geofence_radius_m = Number(radiusDraft);
      if (accuracyDraft.trim()) patch.min_gps_accuracy_m = Number(accuracyDraft);
      const { error } = await supabase.from("mcc_centres").update(patch).eq("id", mccId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Geofence defaults updated");
      setRadiusDraft("");
      setAccuracyDraft("");
      await queryClient.invalidateQueries({ queryKey: ["centre-geofence"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addRoute = useMutation({
    mutationFn: async () => {
      if (!routeName.trim()) throw new Error("Route name is required.");
      const { error } = await supabase
        .from("routes")
        .insert({ mcc_id: mccId, name: routeName.trim(), active: true });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Route created");
      setRouteName("");
      await queryClient.invalidateQueries({ queryKey: ["setup-routes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function captureHere() {
    setLocating(true);
    const coords = await getCoords();
    setLocating(false);
    if (coords.lat == null || coords.lng == null) {
      toast.error("Couldn't get a GPS fix. Try again in open sky.");
      return;
    }
    setPointCoords({ lat: coords.lat, lng: coords.lng });
    toast.success(`Location captured (±${coords.accuracy ? Math.round(coords.accuracy) : "?"}m)`);
  }

  const addPoint = useMutation({
    mutationFn: async (routeId: string) => {
      if (!pointName.trim()) throw new Error("Stop name is required.");
      const route = (routes ?? []).find((r) => r.id === routeId);
      const sequence = (route?.route_points?.length ?? 0) + 1;
      const { error } = await supabase.from("route_points").insert({
        route_id: routeId,
        name: pointName.trim(),
        sequence,
        lat: pointCoords.lat,
        lng: pointCoords.lng,
        geofence_radius_m: pointRadius.trim() ? Number(pointRadius) : null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Stop added");
      setPointName("");
      setPointCoords({ lat: null, lng: null });
      setPointRadius("");
      await queryClient.invalidateQueries({ queryKey: ["setup-routes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <div className="space-y-4">
        <div className="surface-card space-y-3 p-5">
          <h2 className="font-semibold">Collection geofence defaults</h2>
          <p className="text-xs text-muted-foreground">
            Owner-configurable minimum an agent must be within to unlock a collection at any stop
            without its own radius override. Applies centre-wide.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="def-radius">Default radius (m)</Label>
              <Input
                id="def-radius"
                inputMode="numeric"
                className="mt-1"
                value={radiusDraft}
                onChange={(e) => setRadiusDraft(e.target.value)}
                placeholder={String(centreGeofence?.["default_geofence_radius_m"] ?? 50)}
              />
            </div>
            <div>
              <Label htmlFor="def-acc">Min GPS accuracy (m)</Label>
              <Input
                id="def-acc"
                inputMode="numeric"
                className="mt-1"
                value={accuracyDraft}
                onChange={(e) => setAccuracyDraft(e.target.value)}
                placeholder={String(centreGeofence?.["min_gps_accuracy_m"] ?? 100)}
              />
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => saveGeofenceDefaults.mutate()}
            disabled={
              saveGeofenceDefaults.isPending || (!radiusDraft.trim() && !accuracyDraft.trim())
            }
          >
            Save defaults
          </Button>
        </div>

        <form
          className="surface-card space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            addRoute.mutate();
          }}
        >
          <h2 className="flex items-center gap-2 font-semibold">
            <RouteIcon className="h-4 w-4 text-primary" /> New route
          </h2>
          <div>
            <Label htmlFor="route-name">Route name</Label>
            <Input
              id="route-name"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="Morning Route 2"
            />
          </div>
          <Button type="submit" disabled={addRoute.isPending} className="w-full">
            <Plus className="h-4 w-4" /> Create route
          </Button>
        </form>
      </div>

      <div className="surface-card p-5">
        <h2 className="font-semibold">Routes & stops</h2>
        <div className="mt-3 space-y-4">
          {(routes ?? []).map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-4">
              <p className="font-medium">{r.name}</p>
              <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                {[...(r.route_points ?? [])]
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-accent" />
                      {p.sequence}. {p.name}
                      {p.lat != null && p.lng != null ? (
                        <span className="text-xs text-emerald-600">
                          · pinned{p.geofence_radius_m ? ` · ${p.geofence_radius_m}m radius` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600">· no GPS pin yet</span>
                      )}
                    </li>
                  ))}
                {(r.route_points ?? []).length === 0 && <li>No stops yet.</li>}
              </ol>
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={activeRoute === r.id ? pointName : ""}
                    onFocus={() => setActiveRoute(r.id)}
                    onChange={(e) => {
                      setActiveRoute(r.id);
                      setPointName(e.target.value);
                    }}
                    placeholder="Add stop e.g. Point C — Well"
                  />
                  <Button
                    variant="outline"
                    onClick={() => addPoint.mutate(r.id)}
                    disabled={addPoint.isPending || activeRoute !== r.id}
                  >
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
                {activeRoute === r.id && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={captureHere}
                      disabled={locating}
                    >
                      <LocateFixed className="h-3.5 w-3.5" />
                      {locating ? "Locating…" : "Use my location for this stop"}
                    </Button>
                    {pointCoords.lat != null && (
                      <span className="text-emerald-600">
                        {pointCoords.lat.toFixed(5)}, {pointCoords.lng?.toFixed(5)}
                      </span>
                    )}
                    <Input
                      className="h-8 w-36"
                      value={pointRadius}
                      onChange={(e) => setPointRadius(e.target.value)}
                      placeholder="Radius override (m)"
                      inputMode="numeric"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          {(routes ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No routes yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * PART 1 §4 — Route assignment: owner/manager pick a saved route, an agent,
 * a date, a shift and a vehicle, and can lock the stop sequence or reassign.
 * This is separate from the legacy "default route" quick-pick in the Agents
 * tab, which still works for centres that don't need per-day scheduling.
 */
function AssignmentsTab({ mccId }: { mccId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    routeId: "",
    agentId: "",
    date: todayStr(),
    shift: "morning",
    vehicleType: "bike",
    locked: true,
  });

  const { data: routes } = useQuery({
    queryKey: ["setup-routes-lite", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("routes")
        .select("id, name")
        .eq("mcc_id", mccId)
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: agents } = useQuery({
    queryKey: ["setup-agents-lite", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("agents")
        .select("id, full_name, employee_code")
        .eq("mcc_id", mccId)
        .eq("status", "active")
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ["route-assignments", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("route_assignments")
        .select(
          "id, assignment_date, shift, vehicle_type, sequence_locked, status, routes(name), agents(full_name, employee_code)",
        )
        .eq("mcc_id", mccId)
        .gte("assignment_date", todayStr())
        .order("assignment_date")
        .order("shift");
      return data ?? [];
    },
  });

  const createAssignment = useMutation({
    mutationFn: async () => {
      if (!form.routeId || !form.agentId) throw new Error("Pick a route and an agent.");
      const { error } = await supabase.from("route_assignments").insert({
        mcc_id: mccId,
        route_id: form.routeId,
        agent_id: form.agentId,
        assignment_date: form.date,
        shift: form.shift,
        vehicle_type: form.vehicleType,
        sequence_locked: form.locked,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Route assigned");
      await queryClient.invalidateQueries({ queryKey: ["route-assignments"] });
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("route_assignments_agent_slot_unique")
          ? "This agent already has an active assignment for that date & shift. Reassign or cancel it first."
          : e.message,
      ),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("route_assignments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["route-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleLock = useMutation({
    mutationFn: async ({ id, locked }: { id: string; locked: boolean }) => {
      const { error } = await supabase
        .from("route_assignments")
        .update({ sequence_locked: locked })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["route-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <form
        className="surface-card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          createAssignment.mutate();
        }}
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" /> Assign a route
        </h2>
        <div>
          <Label>Route</Label>
          <Select value={form.routeId} onValueChange={(v) => setForm({ ...form, routeId: v })}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Choose a saved route" />
            </SelectTrigger>
            <SelectContent>
              {(routes ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Agent</Label>
          <Select value={form.agentId} onValueChange={(v) => setForm({ ...form, agentId: v })}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Choose an agent" />
            </SelectTrigger>
            <SelectContent>
              {(agents ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.full_name} ({a.employee_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="assign-date">Date</Label>
            <Input
              id="assign-date"
              type="date"
              className="mt-1"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div>
            <Label>Shift</Label>
            <Select value={form.shift} onValueChange={(v) => setForm({ ...form, shift: v })}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Morning</SelectItem>
                <SelectItem value="evening">Evening</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Vehicle</Label>
          <Select
            value={form.vehicleType}
            onValueChange={(v) => setForm({ ...form, vehicleType: v })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VEHICLE_TYPES.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Lock stop sequence</p>
            <p className="text-xs text-muted-foreground">
              Agent must complete stops in order when locked.
            </p>
          </div>
          <Switch checked={form.locked} onCheckedChange={(v) => setForm({ ...form, locked: v })} />
        </div>
        <Button type="submit" disabled={createAssignment.isPending} className="w-full">
          <Plus className="h-4 w-4" /> Assign route
        </Button>
      </form>

      <div className="surface-card p-5">
        <h2 className="font-semibold">Upcoming & active assignments</h2>
        <ul className="mt-3 divide-y divide-border">
          {(assignments ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {a.routes?.name} → {a.agents?.full_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {a.assignment_date} · {a.shift} · {a.vehicle_type}
                  {" · "}
                  <Badge variant={a.status === "active" ? "secondary" : "outline"} className="ml-1">
                    {a.status}
                  </Badge>
                </p>
              </div>
              {a.status === "active" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => toggleLock.mutate({ id: a.id, locked: !a.sequence_locked })}
                  >
                    <Switch
                      checked={a.sequence_locked}
                      onCheckedChange={() =>
                        toggleLock.mutate({ id: a.id, locked: !a.sequence_locked })
                      }
                    />
                    Locked
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatus.mutate({ id: a.id, status: "cancelled" })}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </li>
          ))}
          {(assignments ?? []).length === 0 && (
            <li className="py-6 text-sm text-muted-foreground">
              No upcoming assignments. Agents without a dated assignment fall back to their default
              route from the Agents tab, if any.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function FarmersTab({ mccId }: { mccId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ full_name: "", farmer_code: "", phone: "", village: "" });

  const { data: farmers } = useQuery({
    queryKey: ["setup-farmers", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("farmers")
        .select("id, full_name, farmer_code, village, phone, route_point_farmers(route_point_id)")
        .eq("mcc_id", mccId)
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: points } = useQuery({
    queryKey: ["setup-points", mccId],
    queryFn: async () => {
      const { data } = await supabase
        .from("route_points")
        .select("id, name, sequence, routes!inner(id, name, mcc_id)")
        .eq("routes.mcc_id", mccId)
        .order("sequence");
      return data ?? [];
    },
  });

  const addFarmer = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim() || !form.farmer_code.trim())
        throw new Error("Name and farmer code are required.");
      const { error } = await supabase.from("farmers").insert({
        mcc_id: mccId,
        full_name: form.full_name.trim(),
        farmer_code: form.farmer_code.trim(),
        phone: form.phone.trim() || null,
        village: form.village.trim() || null,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Farmer added");
      setForm({ full_name: "", farmer_code: "", phone: "", village: "" });
      await queryClient.invalidateQueries({ queryKey: ["setup-farmers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const attach = useMutation({
    mutationFn: async ({ farmerId, pointId }: { farmerId: string; pointId: string }) => {
      await supabase.from("route_point_farmers").delete().eq("farmer_id", farmerId);
      const { count } = await supabase
        .from("route_point_farmers")
        .select("id", { count: "exact", head: true })
        .eq("route_point_id", pointId);
      const { error } = await supabase
        .from("route_point_farmers")
        .insert({ farmer_id: farmerId, route_point_id: pointId, sequence: (count ?? 0) + 1 });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Farmer assigned to stop");
      await queryClient.invalidateQueries({ queryKey: ["setup-farmers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <form
        className="surface-card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          addFarmer.mutate();
        }}
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <Users className="h-4 w-4 text-primary" /> Add farmer
        </h2>
        <div>
          <Label htmlFor="farmer-name">Full name</Label>
          <Input
            id="farmer-name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="farmer-code">Farmer code</Label>
          <Input
            id="farmer-code"
            value={form.farmer_code}
            onChange={(e) => setForm({ ...form, farmer_code: e.target.value })}
            placeholder="FRM-007"
          />
        </div>
        <div>
          <Label htmlFor="farmer-phone">Phone</Label>
          <Input
            id="farmer-phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            inputMode="numeric"
          />
        </div>
        <div>
          <Label htmlFor="farmer-village">Village</Label>
          <Input
            id="farmer-village"
            value={form.village}
            onChange={(e) => setForm({ ...form, village: e.target.value })}
          />
        </div>
        <Button type="submit" disabled={addFarmer.isPending} className="w-full">
          <Plus className="h-4 w-4" /> Add farmer
        </Button>
      </form>

      <div className="surface-card p-5">
        <h2 className="font-semibold">Farmers & route stop</h2>
        <ul className="mt-3 divide-y divide-border">
          {(farmers ?? []).map((f) => {
            const current = f.route_point_farmers?.[0]?.route_point_id ?? "";
            return (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{f.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.farmer_code}
                    {f.village ? ` · ${f.village}` : ""}
                  </p>
                </div>
                <Select
                  value={current}
                  onValueChange={(pointId) => attach.mutate({ farmerId: f.id, pointId })}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Assign to stop" />
                  </SelectTrigger>
                  <SelectContent>
                    {(points ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.routes?.name} · {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            );
          })}
          {(farmers ?? []).length === 0 && (
            <li className="py-6 text-sm text-muted-foreground">No farmers yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
