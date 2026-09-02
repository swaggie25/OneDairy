import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requestOtp, verifyOtp } from "@/lib/auth.functions";
import { APP_ROLES, ROLE_HOME, formatPhone, isValidPhone, type AppRole } from "@/lib/roles";
import { roleLabel } from "@/lib/i18n";
import { BrandMark } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — DairyOne" },
      { name: "description", content: "Sign in to DairyOne with your mobile number and OTP." },
      { property: "og:title", content: "Sign in — DairyOne" },
      { property: "og:description", content: "Mobile OTP sign in for DairyOne milk collection." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("agent");
  const [code, setCode] = useState("");

  const send = useServerFn(requestOtp);
  const verify = useServerFn(verifyOtp);

  const sendMutation = useMutation({
    mutationFn: () => send({ data: { phone, role } }),
    onSuccess: (res) => {
      setStep("code");
      if (res.devMode && res.devCode) {
        setCode(res.devCode);
        toast.success(`Development OTP: ${res.devCode}`, { duration: 15000 });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyMutation = useMutation({
    mutationFn: () => verify({ data: { phone, code, fullName } }),
    onSuccess: async (res) => {
      const { error } = await supabase.auth.setSession({
        access_token: res.accessToken,
        refresh_token: res.refreshToken,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      navigate({ to: ROLE_HOME[res.role as AppRole] ?? "/farmer", replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="hero-surface flex min-h-screen items-center justify-center px-4 py-10">
      <div className="surface-card w-full max-w-md p-7">
        <div className="flex flex-col items-center text-center">
          <BrandMark className="h-11 w-11" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Sign in to DairyOne</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "phone"
              ? "We'll send a one-time code to your mobile number."
              : `Code sent to ${formatPhone(phone)}`}
          </p>
        </div>

        {step === "phone" ? (
          <form
            className="mt-7 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!isValidPhone(phone)) {
                toast.error("Enter a valid 10-digit Indian mobile number.");
                return;
              }
              sendMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile number</Label>
              <div className="flex items-center gap-2">
                <span className="flex h-12 items-center rounded-md border border-input bg-secondary px-3 text-sm font-medium">
                  +91
                </span>
                <Input
                  id="phone"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="98765 43210"
                  className="h-12 text-base"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                placeholder="Ramesh Kumar"
                className="h-12 text-base"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>I am a</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APP_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only used the first time you sign in. Existing accounts keep their role.
              </p>
            </div>

            <Button type="submit" size="lg" className="h-12 w-full" disabled={sendMutation.isPending}>
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Smartphone className="h-4 w-4" />
              )}
              Send OTP
            </Button>
          </form>
        ) : (
          <form
            className="mt-7 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              verifyMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="code">Enter 6-digit OTP</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-14 text-center text-2xl font-bold tracking-[0.4em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-12 w-full"
              disabled={verifyMutation.isPending || code.length < 6}
            >
              {verifyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify &amp; continue
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("phone");
                setCode("");
              }}
            >
              <ArrowLeft className="h-4 w-4" /> Change number
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Development mode: the OTP is shown on screen. MSG91 SMS delivery plugs in without any
          other change.
        </p>
      </div>
    </div>
  );
}
