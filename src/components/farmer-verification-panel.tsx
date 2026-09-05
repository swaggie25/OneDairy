import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Phone,
  MapPin,
  Building2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  PhoneCall,
  User,
  Users,
  Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, ratePerLitre, type RateSlab } from "@/lib/pricing";
import { useShiftStatus } from "@/hooks/useShiftStatus";

export type FarmerVerificationResult = {
  personPresentType: "FARMER" | "REPRESENTATIVE";
  verificationMethod: "NONE" | "PHONE";
  verificationStatus: "NOT_REQUIRED" | "PENDING" | "VERIFIED" | "FAILED";
  verificationAttemptedAt: string | null;
  verificationCompletedAt: string | null;
  farmerPhoneUsed: string | null;
};

type AlreadyCollected = {
  quantityLitres: number;
  collectedAt: string;
} | null;

type Props = {
  farmerId: string;
  farmerName: string;
  farmerCode: string;
  mccId: string;
  routeName?: string | null | undefined;
  alreadyCollected: AlreadyCollected;
  onCancel: () => void;
  onContinue: (result: FarmerVerificationResult) => void;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
}

/**
 * FARMER VERIFICATION — shown after the farmer's card is scanned/selected
 * and before the milk-entry amount screen. Confirms identity (photo + who's
 * present), shows read-only payment context, and — when a representative
 * (not the farmer) is physically present — gates progress behind a phone
 * call to the registered farmer. Nothing here duplicates accounting or
 * duplicate-collection logic; both remain server-side (record_milk_collection).
 */
export function FarmerVerificationPanel({
  farmerId,
  farmerName,
  farmerCode,
  mccId,
  routeName,
  alreadyCollected,
  onCancel,
  onContinue,
}: Props) {
  const [presentType, setPresentType] = useState<"FARMER" | "REPRESENTATIVE">("FARMER");
  const [callState, setCallState] = useState<"idle" | "called" | "confirmed" | "failed">("idle");
  const [attemptedAt, setAttemptedAt] = useState<string | null>(null);

  const { data: farmer, isLoading: farmerLoading } = useQuery({
    queryKey: ["verify-farmer", farmerId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("farmers")
        .select("id, full_name, farmer_code, village, phone, photo_url, status")
        .eq("id", farmerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: mcc } = useQuery({
    queryKey: ["verify-mcc", mccId],
    staleTime: 5 * 60_000,
    enabled: Boolean(mccId),
    queryFn: async () => {
      const { data } = await supabase
        .from("mcc_centres")
        .select("name")
        .eq("id", mccId)
        .maybeSingle();
      return data;
    },
  });

  const shift = useShiftStatus({ mccId });

  const { data: slabs } = useQuery<RateSlab[]>({
    queryKey: ["rate-slabs", mccId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("rate_slabs")
        .select("id, animal_type, min_fat, max_fat, min_snf, max_snf, rate_per_litre, active")
        .eq("active", true);
      return (data ?? []) as RateSlab[];
    },
  });
  // Same estimate the milk-entry screen shows before any reading is typed —
  // reused, not recalculated, so the two screens never disagree.
  const currentRate = ratePerLitre(slabs, { animalType: "cow", fatPct: null, snfPct: null });

  const { data: payment, isLoading: paymentLoading } = useQuery({
    queryKey: ["verify-payment", farmerId],
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: pending }, { data: last }] = await Promise.all([
        supabase
          .from("payments")
          .select("net_amount")
          .eq("farmer_id", farmerId)
          .eq("status", "pending"),
        supabase
          .from("payments")
          .select("net_amount, paid_at")
          .eq("farmer_id", farmerId)
          .eq("status", "paid")
          .order("paid_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const pendingAmount = (pending ?? []).reduce((sum, p) => sum + Number(p.net_amount ?? 0), 0);
      return { pendingAmount, lastPayment: last ?? null };
    },
  });

  const dataFresh = !farmerLoading && !paymentLoading;

  function callFarmer(phone: string) {
    const now = new Date().toISOString();
    setAttemptedAt(now);
    setCallState("called");
    window.location.href = `tel:${phone}`;
  }

  function confirmContinue() {
    if (presentType === "FARMER") {
      onContinue({
        personPresentType: "FARMER",
        verificationMethod: "NONE",
        verificationStatus: "NOT_REQUIRED",
        verificationAttemptedAt: null,
        verificationCompletedAt: null,
        farmerPhoneUsed: null,
      });
      return;
    }
    onContinue({
      personPresentType: "REPRESENTATIVE",
      verificationMethod: "PHONE",
      verificationStatus: "VERIFIED",
      verificationAttemptedAt: attemptedAt,
      verificationCompletedAt: new Date().toISOString(),
      farmerPhoneUsed: farmer?.phone ?? null,
    });
  }

  if (farmerLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading farmer…</div>;
  }

  if (!farmer) {
    return (
      <div className="space-y-4 py-4 text-center">
        <Icon icon={XCircle} size="xl" tone="danger" className="mx-auto h-12 w-12" />
        <div>
          <p className="text-lg font-semibold">Farmer not found</p>
          <p className="text-sm text-muted-foreground">
            This card could not be matched with a registered farmer.
          </p>
        </div>
        <Button variant="outline" onClick={onCancel}>
          Scan Again
        </Button>
      </div>
    );
  }

  if (farmer.status && farmer.status !== "active") {
    return (
      <div className="space-y-4 py-4 text-center">
        <Icon icon={AlertTriangle} size="xl" tone="warning" className="mx-auto h-12 w-12" />
        <div>
          <p className="text-lg font-semibold">Farmer Account Inactive</p>
          <p className="text-sm text-muted-foreground">
            Please contact your supervisor before collecting milk.
          </p>
        </div>
        <Button variant="outline" onClick={onCancel}>
          Back
        </Button>
      </div>
    );
  }

  const continueDisabled =
    presentType === "REPRESENTATIVE" && callState !== "confirmed" && callState !== "failed"
      ? true
      : presentType === "REPRESENTATIVE" && callState === "failed";

  return (
    <div className="space-y-4">
      {/* IDENTITY HEADER */}
      <div className="surface-card space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-16 w-16 border border-border">
            {farmer.photo_url ? (
              <AvatarImage src={farmer.photo_url} alt={farmer.full_name} />
            ) : null}
            <AvatarFallback className="text-base font-semibold">
              {initials(farmer.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-lg font-semibold">{farmer.full_name}</p>
              {farmer.phone ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={`tel:${farmer.phone}`} title={`Call ${farmer.full_name}`}>
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Phone number unavailable</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{farmer.farmer_code}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {farmer.village && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {farmer.village}
                </span>
              )}
              {routeName && <span>{routeName}</span>}
              {mcc?.name && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> {mcc.name}
                </span>
              )}
              {shift.data?.shiftName && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {shift.data.shiftName}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* COLLECTION STATUS */}
      {alreadyCollected ? (
        <div className="surface-card space-y-1 border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> Collection Already Recorded
          </p>
          <p className="text-xs text-muted-foreground">
            This farmer has already been collected{" "}
            {shift.data?.shiftName ? `for the ${shift.data.shiftName}` : "on this trip"}.
          </p>
          <p className="text-sm">
            {alreadyCollected.quantityLitres.toFixed(1)} L ·{" "}
            {new Date(alreadyCollected.collectedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      ) : (
        <StatusBadge
          status="success"
          label={
            shift.data?.shiftName ? `Eligible for ${shift.data.shiftName}` : "Eligible to collect"
          }
          size="sm"
        />
      )}

      {/* PAYMENT */}
      <div className="surface-card space-y-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Payment
        </p>
        {paymentLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted-foreground">Current Rate</span>
            <span className="text-right font-semibold">{formatCurrency(currentRate)}/L</span>
            <span className="text-muted-foreground">Pending Amount</span>
            <span className="text-right font-semibold">
              {formatCurrency(payment?.pendingAmount ?? 0)}
            </span>
            <span className="text-muted-foreground">Last Payment</span>
            <span className="text-right font-semibold">
              {payment?.lastPayment
                ? `${formatCurrency(Number(payment.lastPayment.net_amount ?? 0))} · ${new Date(
                    payment.lastPayment.paid_at as string,
                  ).toLocaleDateString()}`
                : "—"}
            </span>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {dataFresh ? "Updated just now" : "Last synced"}
        </p>
      </div>

      {!alreadyCollected && (
        <>
          {/* WHO IS PRESENT */}
          <div className="surface-card space-y-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Who is present?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={presentType === "FARMER" ? "default" : "outline"}
                className="h-12 justify-start gap-2"
                onClick={() => {
                  setPresentType("FARMER");
                  setCallState("idle");
                }}
              >
                <User className="h-4 w-4" /> Farmer
              </Button>
              <Button
                type="button"
                variant={presentType === "REPRESENTATIVE" ? "default" : "outline"}
                className="h-12 justify-start gap-2"
                onClick={() => setPresentType("REPRESENTATIVE")}
              >
                <Users className="h-4 w-4" /> Authorized Person
              </Button>
            </div>
          </div>

          {/* VERIFICATION */}
          {presentType === "FARMER" ? (
            <StatusBadge
              status="success"
              icon={CheckCircle2}
              label="Farmer Present"
              detail="Identity verified using farmer card/photo"
            />
          ) : (
            <div className="surface-card space-y-3 border-amber-500/40 bg-amber-500/5 p-4">
              {callState === "idle" && (
                <>
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                    <AlertTriangle className="h-4 w-4" /> Farmer not present
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Please call the registered farmer to verify that this person is authorized to
                    submit milk.
                  </p>
                  {farmer.phone ? (
                    <Button
                      type="button"
                      className="h-11 w-full"
                      onClick={() => callFarmer(farmer.phone as string)}
                    >
                      <PhoneCall className="h-4 w-4" /> Call Farmer
                    </Button>
                  ) : (
                    <p className="text-xs font-medium text-destructive">
                      Phone number unavailable — Call disabled.
                    </p>
                  )}
                </>
              )}

              {callState === "called" && (
                <>
                  <p className="text-sm font-semibold">Was authorization confirmed?</p>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 justify-start"
                      onClick={() => setCallState("confirmed")}
                    >
                      <CheckCircle2 className="h-4 w-4 text-status-success" /> Yes, farmer confirmed
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 justify-start"
                      onClick={() => setCallState("failed")}
                    >
                      <XCircle className="h-4 w-4 text-destructive" /> No, farmer did not confirm
                    </Button>
                  </div>
                </>
              )}

              {callState === "confirmed" && (
                <StatusBadge
                  status="success"
                  icon={CheckCircle2}
                  label="Authorization Verified"
                  detail={attemptedAt ? `Verified ${timeAgo(attemptedAt)}` : undefined}
                />
              )}

              {callState === "failed" && (
                <div className="space-y-2">
                  <StatusBadge status="danger" icon={XCircle} label="Verification Failed" />
                  <p className="text-xs text-muted-foreground">
                    Collection cannot continue until the farmer is personally verified or another
                    valid verification method is completed.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCallState("idle")}
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12" onClick={onCancel}>
          {alreadyCollected ? "Back" : "Cancel"}
        </Button>
        {alreadyCollected ? (
          <Button type="button" variant="outline" className="h-12" onClick={onCancel}>
            <Eye className="h-4 w-4" /> View Collection
          </Button>
        ) : (
          <Button
            type="button"
            className="h-12"
            disabled={continueDisabled}
            onClick={confirmContinue}
          >
            Continue to Collection
          </Button>
        )}
      </div>
    </div>
  );
}
