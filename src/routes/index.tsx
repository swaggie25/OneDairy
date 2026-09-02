import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  MapPin,
  ShieldCheck,
  Fingerprint,
  Route as RouteIcon,
} from "lucide-react";
import { Logo } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DairyOne — Verified milk collection for MCC networks" },
      {
        name: "description",
        content:
          "Run your milk collection centre network end to end: GPS-verified field collection, quality testing, farmer payments and dairy plant transfers.",
      },
      { property: "og:title", content: "DairyOne — Verified milk collection for MCC networks" },
      {
        property: "og:description",
        content:
          "Route-based collection, offline-first agent app, quality alerts and settlements for Indian dairy procurement.",
      },
    ],
  }),
  component: Landing,
});

const chips = [
  "Geofencing",
  "Routes",
  "Quality tests",
  "Corrections",
  "Transfers",
  "Audit log",
  "Payouts",
  "Payroll-ready",
];

function Landing() {
  return (
    <div className="min-h-screen hero-surface">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-14 lg:grid-cols-2 lg:items-center lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <BadgeCheck className="h-3.5 w-3.5 text-primary" />
            Built for milk collection centres across India
          </span>
          <h1 className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Milk collection that
            <span className="block text-primary">verifies itself.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted-foreground sm:text-lg">
            GPS-stamped route collection, fat/SNF quality testing, auto rate calculation and a full
            approval and audit trail — from the farmer&apos;s can to the dairy plant tanker.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link to="/auth">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["GPS verified", "Offline ready", "Role-based access", "Audit trail"].map((f) => (
              <li key={f} className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-accent" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="surface-card relative overflow-hidden p-6 shadow-[var(--shadow-float)]">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Route 04 · Morning</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> LIVE
              </span>
            </div>
            <div className="my-10 flex justify-center">
              <span className="brand-mark flex h-24 w-24 items-center justify-center rounded-full shadow-[var(--shadow-float)]">
                <Fingerprint className="h-10 w-10" />
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { v: "09:02", l: "Punch in" },
                { v: "128 L", l: "Collected" },
                { v: "OK", l: "Geo" },
              ].map((s) => (
                <div key={s.l} className="rounded-lg border border-border bg-secondary/60 p-3 text-center">
                  <p className="text-sm font-bold">{s.v}</p>
                  <p className="text-[11px] text-muted-foreground">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="surface-card absolute -left-3 -top-4 flex items-center gap-2 px-3 py-2 text-xs">
            <RouteIcon className="h-4 w-4 text-primary" />
            <span>
              <strong>128 present</strong> across 4 centres
            </span>
          </div>
          <div className="surface-card absolute -bottom-4 -right-2 flex items-center gap-2 px-3 py-2 text-xs">
            <MapPin className="h-4 w-4 text-accent" />
            <span>
              <strong>Inside geofence</strong> ±8 m
            </span>
          </div>
        </div>
      </section>

      <div className="border-y border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-5 text-sm text-muted-foreground">
          {chips.map((c) => (
            <span key={c} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {c}
            </span>
          ))}
        </div>
      </div>

      <footer className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground">
        © {new Date().getFullYear()} DairyOne · Milk collection centre operations
      </footer>
    </div>
  );
}
