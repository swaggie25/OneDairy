import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Printer,
  Save,
  CloudOff,
  MapPin,
  LockKeyhole,
  LockKeyholeOpen,
  ShieldAlert,
  RotateCcw,
  FileWarning,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignaturePad } from "@/components/signature-pad";
import { getCoords, haversineMeters, watchCoords, type Coords } from "@/lib/geo";
import { enqueue, flushQueue, newClientRef, type QueuedCollection } from "@/lib/offline-queue";
import {
  formatCurrency,
  qualityStatus,
  ratePerLitre,
  riskScore,
  snfFromClr,
  totalAmount,
  type RateSlab,
} from "@/lib/pricing";
import { evaluateCollection } from "@/lib/quality";
import { openReceiptPreview } from "@/lib/receipt";

export type MilkEntryTarget = {
  farmerId: string;
  farmerName: string;
  farmerCode: string;
  mccId: string;
  agentId: string | null;
  routePointId?: string | null;
  tripId?: string | null;
  source: "agent" | "centre";
};

function num(value: string): number | null {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Collection geofence lock: field entries stay disabled until the agent's
 * live GPS is inside the stop's radius. Mirrors the server-side check in
 * `record_milk_collection` exactly, so the button state the agent sees is
 * never a lie — but the backend re-verifies independently regardless, so a
 * tampered client still can't force a collection through (PART 1 §9).
 */
function useGeofenceLock(target: MilkEntryTarget) {
  const enabled = target.source === "agent" && !!target.routePointId;

  const { data: point } = useQuery({
    queryKey: ["geofence-point", target.routePointId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("route_points")
        .select("name, lat, lng, geofence_radius_m")
        .eq("id", target.routePointId as string)
        .maybeSingle();
      return data;
    },
  });

  const { data: mcc } = useQuery({
    queryKey: ["geofence-mcc", target.mccId],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("mcc_centres")
        .select("default_geofence_radius_m, min_gps_accuracy_m")
        .eq("id", target.mccId)
        .maybeSingle();
      return data;
    },
  });

  const [coords, setCoords] = useState<Coords>({ lat: null, lng: null, accuracy: null });
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setWatching(true);
    const stop = watchCoords((c) => setCoords(c));
    return () => {
      stop();
      setWatching(false);
    };
  }, [enabled, target.routePointId]);

  const radius = point?.geofence_radius_m ?? mcc?.default_geofence_radius_m ?? 50;
  const minAccuracy = mcc?.min_gps_accuracy_m ?? 100;
  const hasPin = point?.lat != null && point?.lng != null;
  const distance = hasPin ? haversineMeters(coords.lat, coords.lng, point!.lat, point!.lng) : null;
  const accuracyOk = coords.accuracy == null || coords.accuracy <= minAccuracy;
  const withinRadius = distance != null && distance <= radius;

  // Not applicable (centre walk-in), or the stop simply has no GPS pin
  // configured yet — allowed through, matching backend "unconfigured" path.
  const locked = enabled && hasPin && (!withinRadius || !accuracyOk);
  const ready = !enabled || !hasPin || (withinRadius && accuracyOk);

  return {
    enabled,
    hasPin,
    watching,
    coords,
    distance,
    radius,
    accuracyOk,
    locked,
    ready,
    pointName: point?.name,
  };
}

export function MilkEntryForm({
  target,
  onSaved,
}: {
  target: MilkEntryTarget;
  onSaved?: () => void;
}) {
  const [session, setSession] = useState("morning");
  const [animalType, setAnimalType] = useState("cow");
  const [quantity, setQuantity] = useState("");
  const [fat, setFat] = useState("");
  const [clr, setClr] = useState("");
  const [snf, setSnf] = useState("");
  const [temperature, setTemperature] = useState("");
  const [acidity, setAcidity] = useState("");
  const [water, setWater] = useState("");
  const [antibiotic, setAntibiotic] = useState("not_tested");
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // §5.9 — a distinct confirmation view after a successful save, not just a
  // toast: this screen repeats dozens of times per shift and needs to be
  // the fastest thing in the app to read at a glance.
  const [savedEntry, setSavedEntry] = useState<{
    quantityLitres: number;
    amount: number;
    offline: boolean;
    savedAt: Date;
    session: string;
    fatPct: number | null;
    snfPct: number | null;
    ratePerLitre: number;
  } | null>(null);

  // PHASE 2 §"Quality entry" — a critical reading (water/antibiotic/fat/SNF
  // over threshold) can't be saved silently. The agent must pick one of the
  // three actions below before Save unlocks again.
  const [qualityAction, setQualityAction] = useState<"retest" | "override" | "exception" | null>(
    null,
  );
  const [overrideReason, setOverrideReason] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");

  const geofence = useGeofenceLock(target);

  const { data: slabs } = useQuery<RateSlab[]>({
    queryKey: ["rate-slabs", target.mccId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("rate_slabs")
        .select("id, animal_type, min_fat, max_fat, min_snf, max_snf, rate_per_litre, active")
        .eq("active", true);
      return (data ?? []) as RateSlab[];
    },
  });

  const fatPct = num(fat);
  const clrValue = num(clr);
  const snfPct = num(snf) ?? snfFromClr(clrValue, fatPct);
  const quantityLitres = num(quantity) ?? 0;
  const waterPct = num(water);

  const rate = useMemo(
    () => ratePerLitre(slabs, { animalType, fatPct, snfPct }),
    [slabs, animalType, fatPct, snfPct],
  );
  const amount = totalAmount(quantityLitres, rate);
  const risk = riskScore({ fatPct, snfPct, waterPct: waterPct });
  const status = qualityStatus(risk);

  // Reuses the exact same threshold checks the manager's Quality screen scans
  // with after the fact (src/lib/quality.ts) — evaluated live here instead so
  // the agent sees them before saving, not after. No `id` yet since nothing's
  // saved; the function doesn't use it for severity.
  const alerts = useMemo(
    () =>
      evaluateCollection(
        {
          id: "",
          farmer_id: target.farmerId,
          quantity_litres: quantityLitres,
          fat_pct: fatPct,
          snf_pct: snfPct,
          water_adulteration_pct: waterPct,
          antibiotic_test_result: antibiotic === "not_tested" ? null : antibiotic,
          collected_at: new Date().toISOString(),
        },
        undefined,
      ),
    [target.farmerId, quantityLitres, fatPct, snfPct, waterPct, antibiotic],
  );

  // Critical blocks Save until the agent picks retest / override / exception.
  // Changing any reading resets that choice — it applies to the values it was
  // made against, not whatever gets typed next.
  useEffect(() => {
    setQualityAction(null);
    setOverrideReason("");
  }, [fatPct, snfPct, waterPct, antibiotic]);

  const gated = status === "critical" && qualityAction === null;
  const overrideReady = qualityAction === "override" && overrideReason.trim().length > 0;
  // trip_exceptions.trip_id/agent_id are NOT NULL — only a field collection
  // (agent source, on a trip) has both, so a centre walk-in gets Retest /
  // Continue-with-reason only, not Mark-as-exception.
  const canException =
    target.source === "agent" && Boolean(target.tripId) && Boolean(target.agentId);

  const logQualityException = useMutation({
    mutationFn: async () => {
      if (!canException || !target.tripId || !target.agentId) {
        throw new Error("Exceptions can only be logged for an active field collection trip.");
      }
      if (!exceptionReason.trim()) throw new Error("Add a short reason for the exception.");
      const { error } = await supabase.from("trip_exceptions").insert({
        trip_id: target.tripId,
        agent_id: target.agentId,
        mcc_id: target.mccId,
        route_point_id: target.routePointId ?? null,
        farmer_id: target.farmerId,
        type: "quality_issue",
        reason: `${exceptionReason.trim()} (${alerts.map((a) => a.alert_type).join(", ")})`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Quality exception logged — collection not recorded.");
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function save() {
    if (quantityLitres <= 0) {
      toast.error("Enter a quantity greater than zero.");
      return;
    }
    if (geofence.locked) {
      toast.error(
        `Move closer to ${geofence.pointName ?? "the collection point"} to record this entry.`,
      );
      return;
    }
    if (status === "critical" && qualityAction !== "override") {
      toast.error("Resolve the quality alert before saving.");
      return;
    }
    if (qualityAction === "override" && !overrideReady) {
      toast.error("Add a reason to continue with this reading.");
      return;
    }
    setSaving(true);
    // Grab one final fresh fix at the moment of save (not the possibly-stale
    // watched value) so the timestamped record reflects "right now".
    const coords = await getCoords();
    const entry: QueuedCollection = {
      client_ref: newClientRef(),
      farmer_id: target.farmerId,
      agent_id: target.agentId,
      mcc_id: target.mccId,
      route_point_id: target.routePointId ?? null,
      trip_id: target.tripId ?? null,
      source: target.source,
      session,
      animal_type: animalType,
      quantity_litres: quantityLitres,
      fat_pct: fatPct,
      snf_pct: snfPct,
      clr: clrValue,
      temperature: num(temperature),
      acidity: num(acidity),
      water_adulteration_pct: waterPct,
      antibiotic_test_result: antibiotic === "not_tested" ? null : antibiotic,
      water_adulteration_flag: (waterPct ?? 0) > 2,
      rate_per_litre: rate,
      total_amount: amount,
      risk_score: risk,
      // Field entries wait for manager verification; centre walk-ins post directly.
      status: target.source === "agent" ? "pending" : "verified",
      quality_override_reason: qualityAction === "override" ? overrideReason.trim() : null,
      signature_url: signature,
      gps_lat: coords.lat ?? geofence.coords.lat,
      gps_lng: coords.lng ?? geofence.coords.lng,
      gps_accuracy: coords.accuracy ?? geofence.coords.accuracy,
      collected_at: new Date().toISOString(),
    };

    enqueue(entry);
    const result = await flushQueue();
    setSaving(false);
    let succeeded = false;
    if (result.synced > 0) {
      succeeded = true;
    } else if (result.errors[0]) {
      // Backend independently rejected it (e.g. geofence/accuracy) — kept
      // queued, agent needs to know rather than think it silently synced.
      toast.error(result.errors[0]);
    } else {
      succeeded = true;
    }
    if (!succeeded) return;
    setSavedEntry({
      quantityLitres,
      amount,
      offline: result.synced === 0,
      savedAt: new Date(),
      session,
      fatPct,
      snfPct,
      ratePerLitre: rate,
    });
    setQuantity("");
    setFat("");
    setClr("");
    setSnf("");
    setWater("");
    setSignature(null);
    setQualityAction(null);
    setOverrideReason("");
  }

  function nextFarmer() {
    setSavedEntry(null);
    onSaved?.();
  }

  // PART — print is only offered AFTER the entry is saved (from the
  // confirmation screen below), never mid-entry. Opens a receipt preview
  // window with its own "Print receipt" button rather than triggering the
  // OS print dialog immediately — the agent reviews it first.
  function printSavedReceipt() {
    if (!savedEntry) return;
    const opened = openReceiptPreview({
      farmerName: target.farmerName,
      farmerCode: target.farmerCode,
      session: savedEntry.session,
      quantityLitres: savedEntry.quantityLitres,
      fatPct: savedEntry.fatPct,
      snfPct: savedEntry.snfPct,
      ratePerLitre: savedEntry.ratePerLitre,
      totalAmount: savedEntry.amount,
      collectedAt: savedEntry.savedAt,
    });
    if (!opened) {
      toast.error("Allow pop-ups to view the receipt.");
    }
  }

  if (savedEntry) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <Icon icon={CheckCircle2} size="xl" tone="success" className="h-14 w-14" />
        <div>
          <p className="text-3xl font-bold tracking-tight">
            {savedEntry.quantityLitres.toFixed(1)} L
          </p>
          <p className="mt-1 text-lg font-semibold text-status-success">
            {formatCurrency(savedEntry.amount)}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Saved at{" "}
          {savedEntry.savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
        {savedEntry.offline && (
          <StatusBadge
            status="warning"
            icon={CloudOff}
            label="Saved offline"
            detail="will sync automatically"
          />
        )}
        <div className="grid w-full gap-2 sm:grid-cols-2">
          <Button
            size="lg"
            variant="outline"
            className="h-14 text-base"
            onClick={printSavedReceipt}
          >
            <Printer className="h-5 w-5" /> Print receipt
          </Button>
          <Button size="lg" className="h-14 text-base" onClick={nextFarmer}>
            Next farmer
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {geofence.enabled && (
        <div
          className={`surface-card flex items-center gap-3 p-4 ${
            geofence.locked
              ? "border-destructive/40 bg-destructive/5"
              : "border-emerald-500/40 bg-emerald-500/5"
          }`}
        >
          {geofence.locked ? (
            <LockKeyhole className="h-5 w-5 shrink-0 text-destructive" />
          ) : (
            <LockKeyholeOpen className="h-5 w-5 shrink-0 text-emerald-600" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {!geofence.hasPin
                ? "Location not configured for this stop"
                : geofence.locked
                  ? "Too far to collect"
                  : "Collection enabled"}
            </p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {!geofence.hasPin
                ? "Ask your manager to set this stop's GPS pin."
                : geofence.distance != null
                  ? `${Math.round(geofence.distance)} m away · must be within ${geofence.radius} m`
                  : geofence.watching
                    ? "Getting your location…"
                    : "Location unavailable"}
              {geofence.hasPin && geofence.coords.accuracy != null && !geofence.accuracyOk
                ? ` · GPS accuracy ±${Math.round(geofence.coords.accuracy)}m too low`
                : ""}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="session">Session</Label>
          <Select value={session} onValueChange={setSession}>
            <SelectTrigger id="session" className="mt-1 h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="morning">Morning</SelectItem>
              <SelectItem value="evening">Evening</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="animal">Animal</Label>
          <Select value={animalType} onValueChange={setAnimalType}>
            <SelectTrigger id="animal" className="mt-1 h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cow">Cow</SelectItem>
              <SelectItem value="buffalo">Buffalo</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="qty">Quantity (litres)</Label>
        <Input
          id="qty"
          inputMode="decimal"
          className="mt-1 h-14 text-lg font-semibold"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="0.0"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="fat">Fat %</Label>
          <Input
            id="fat"
            inputMode="decimal"
            className="mt-1 h-12"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="clr">CLR</Label>
          <Input
            id="clr"
            inputMode="decimal"
            className="mt-1 h-12"
            value={clr}
            onChange={(e) => setClr(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="snf">SNF %</Label>
          <Input
            id="snf"
            inputMode="decimal"
            className="mt-1 h-12"
            value={snf}
            onChange={(e) => setSnf(e.target.value)}
            placeholder={snfPct != null ? String(snfPct) : ""}
          />
        </div>
      </div>

      <details className="surface-card p-4">
        <summary className="cursor-pointer text-sm font-medium">Quality tests (optional)</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="temp">Temperature °C</Label>
            <Input
              id="temp"
              inputMode="decimal"
              className="mt-1 h-12"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="acid">Acidity</Label>
            <Input
              id="acid"
              inputMode="decimal"
              className="mt-1 h-12"
              value={acidity}
              onChange={(e) => setAcidity(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="water">Water %</Label>
            <Input
              id="water"
              inputMode="decimal"
              className="mt-1 h-12"
              value={water}
              onChange={(e) => setWater(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="abx">Antibiotic</Label>
            <Select value={antibiotic} onValueChange={setAntibiotic}>
              <SelectTrigger id="abx" className="mt-1 h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not_tested">Not tested</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
                <SelectItem value="positive">Positive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </details>

      {/* Confirmation summary — farmer / quantity / quality / rate / value, the
          same numbers that get saved, visible before Save is pressed. */}
      <div className="surface-card space-y-2 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{target.farmerName}</p>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              status === "critical"
                ? "bg-destructive/10 text-destructive"
                : status === "warning"
                  ? "bg-amber-500/10 text-amber-600"
                  : "bg-emerald-500/10 text-emerald-600"
            }`}
          >
            {status === "critical"
              ? "Requires attention"
              : status === "warning"
                ? "Warning"
                : "Normal"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {quantityLitres || 0} L · Fat {fatPct ?? "—"}% · SNF {snfPct ?? "—"}%
        </p>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rate {formatCurrency(rate)}/L
          </p>
          <p className="text-2xl font-bold tracking-tight">{formatCurrency(amount)}</p>
        </div>
      </div>

      {/* PHASE 2 — non-blocking: visible but Save still works. */}
      {status === "warning" && (
        <div className="surface-card space-y-1 border-amber-500/40 bg-amber-500/5 p-3">
          {alerts.map((a) => (
            <p key={a.alert_type} className="flex items-start gap-2 text-xs text-amber-700">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a.message}
            </p>
          ))}
        </div>
      )}

      {/* PHASE 2 — blocking: Save is disabled until one of these is chosen. */}
      {status === "critical" && (
        <div className="surface-card space-y-3 border-destructive/40 bg-destructive/5 p-4">
          <div className="space-y-1">
            {alerts.map((a) => (
              <p key={a.alert_type} className="flex items-start gap-2 text-xs text-destructive">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a.message}
              </p>
            ))}
          </div>

          {qualityAction === null && (
            <div className={`grid gap-2 ${canException ? "grid-cols-3" : "grid-cols-2"}`}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 flex-col gap-1 text-xs"
                onClick={() => {
                  setFat("");
                  setClr("");
                  setSnf("");
                  setWater("");
                  toast("Re-enter the readings for a fresh test.");
                }}
              >
                <RotateCcw className="h-4 w-4" /> Retest
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 flex-col gap-1 text-xs"
                onClick={() => setQualityAction("override")}
              >
                <ShieldAlert className="h-4 w-4" /> Continue with reason
              </Button>
              {canException && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-11 flex-col gap-1 text-xs"
                  onClick={() => setQualityAction("exception")}
                >
                  <FileWarning className="h-4 w-4" /> Mark as exception
                </Button>
              )}
            </div>
          )}

          {qualityAction === "override" && (
            <div className="space-y-2">
              <Textarea
                placeholder="Why continue despite this reading? (required — the manager sees this at verification)"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setQualityAction(null)}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {qualityAction === "exception" && (
            <div className="space-y-2">
              <Textarea
                placeholder="Reason for the exception (e.g. farmer disputes the reading)"
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setQualityAction(null)}>
                  Back
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={logQualityException.isPending}
                  onClick={() => logQualityException.mutate()}
                >
                  Log exception — don't save collection
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sign pad removed for field/trip collections (target.source ===
          "agent") — kept for centre walk-in entries. */}
      {target.source !== "agent" && <SignaturePad onChange={setSignature} />}

      <Button
        size="lg"
        className="h-14 w-full text-base"
        onClick={save}
        disabled={saving || geofence.locked || gated}
      >
        <Save className="h-5 w-5" />
        {saving
          ? "Saving…"
          : geofence.locked
            ? "Move closer to collect"
            : gated
              ? "Resolve quality alert to save"
              : "Save entry"}
      </Button>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CloudOff className="h-3.5 w-3.5" /> Entries save on-device first and sync automatically.
      </p>
    </div>
  );
}
