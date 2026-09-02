import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MapPin, MapPinned, Wifi, BatteryMedium, Bell, ArrowLeft, ChevronDown } from "lucide-react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { requireRole } from "@/lib/route-guards";
import {
  runReadinessChecks,
  requestLocationPermission,
  requestNotificationPermission,
  type ReadinessCheck,
} from "@/lib/device-readiness";

export const Route = createFileRoute("/_authenticated/device-check")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["agent"]),
  head: () => ({
    meta: [
      { title: "Device check — DairyOne" },
      {
        name: "description",
        content:
          "Check location, tracking, connectivity, battery and notifications are ready before you start your shift.",
      },
    ],
  }),
  component: DeviceCheckScreen,
});

const CHECK_ICON: Record<ReadinessCheck["id"], typeof MapPin> = {
  location: MapPin,
  tracking: MapPinned,
  internet: Wifi,
  battery: BatteryMedium,
  notifications: Bell,
};

/** ReadinessLevel → the shared Status vocabulary used by StatusBadge everywhere else. */
function toStatus(level: ReadinessCheck["level"]): Status {
  if (level === "success") return "success";
  if (level === "warning") return "warning";
  if (level === "danger") return "danger";
  return "muted";
}

function DeviceCheckScreen() {
  const navigate = useNavigate();
  const [checks, setChecks] = useState<ReadinessCheck[] | null>(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<ReadinessCheck["id"] | null>(null);
  const [fixing, setFixing] = useState<ReadinessCheck["id"] | null>(null);

  async function runAll() {
    setRunning(true);
    const result = await runReadinessChecks();
    setChecks(result);
    setRunning(false);
    // Auto-expand the first thing that needs attention so it's not hidden
    // behind a tap — the agent should see why at a glance, not go hunting.
    const firstIssue = result.find((c) => c.level === "danger" || c.level === "warning");
    setExpanded(firstIssue?.id ?? null);
  }

  useEffect(() => {
    void runAll();
    const onChange = () => void runAll();
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }, []);

  async function fixNow(check: ReadinessCheck) {
    setFixing(check.id);
    if (check.id === "location") await requestLocationPermission();
    if (check.id === "notifications") await requestNotificationPermission();
    await runAll();
    setFixing(null);
  }

  const allGood = checks?.every((c) => c.level === "success" || c.level === "muted") ?? false;
  const hasBlocking = checks?.some((c) => c.level === "danger") ?? false;

  return (
    <AppShell mobileFirst>
      <PageHeading
        title="Device check"
        subtitle="Make sure your phone is ready before you start your shift."
      />

      {/* Overall summary — answers "can I safely start?" at a glance (§2). */}
      <div className="surface-card mb-4 flex items-center gap-3 p-4">
        {running || !checks ? (
          <StatusBadge status="muted" label="Checking…" size="lg" />
        ) : allGood ? (
          <StatusBadge status="success" label="Ready to go" size="lg" />
        ) : hasBlocking ? (
          <StatusBadge status="danger" label="Needs attention" size="lg" />
        ) : (
          <StatusBadge status="warning" label="Mostly ready" size="lg" />
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => void runAll()}
          disabled={running}
        >
          Recheck
        </Button>
      </div>

      <div className="surface-card divide-y divide-border overflow-hidden">
        {(checks ?? []).map((check) => {
          const isOpen = expanded === check.id;
          const needsAttention = check.level === "warning" || check.level === "danger";
          return (
            <div key={check.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 p-4 text-left"
                onClick={() => setExpanded(isOpen ? null : check.id)}
              >
                <Icon icon={CHECK_ICON[check.id]} size="md" tone="muted" />
                <span className="flex-1 text-sm font-semibold">{check.label}</span>
                <StatusBadge status={toStatus(check.level)} label={check.detail} size="sm" />
                {check.explanation && (
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                )}
              </button>
              {isOpen && check.explanation && (
                <div className="flex flex-col gap-3 px-4 pb-4 pl-[3.25rem]">
                  <p className="text-sm text-muted-foreground">{check.explanation}</p>
                  {check.fixable && needsAttention && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="self-start"
                      onClick={() => void fixNow(check)}
                      disabled={fixing === check.id}
                    >
                      {fixing === check.id ? "Checking…" : "Fix now"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-2">
        <Button size="lg" className="h-14 text-base" onClick={() => navigate({ to: "/agent" })}>
          {hasBlocking ? "Continue anyway" : "Continue to home"}
        </Button>
        <Button asChild size="lg" variant="ghost" className="h-12 text-base">
          <Link to="/agent">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}
