import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Milk, LogOut, Menu } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { roleLabel } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "brand-mark inline-flex h-9 w-9 items-center justify-center rounded-xl",
        className,
      )}
    >
      <Milk className="h-5 w-5" />
    </span>
  );
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <BrandMark />
      <span className="text-lg font-extrabold tracking-tight">
        Dairy<span className="text-primary">One</span>
      </span>
    </Link>
  );
}

type NavItem = { label: string; to: string };

export function AppShell({
  children,
  nav = [],
  mobileFirst = false,
}: {
  children: ReactNode;
  nav?: NavItem[];
  mobileFirst?: boolean;
}) {
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="app-shell-safe-area min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
        <div
          className={cn(
            "mx-auto flex h-16 items-center justify-between gap-4 px-4",
            mobileFirst ? "max-w-2xl" : "max-w-7xl",
          )}
        >
          <div className="flex items-center gap-6">
            <Logo />
            {nav.length > 0 && (
              <nav className="hidden items-center gap-1 md:flex">
                {nav.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    activeProps={{ className: "bg-primary-soft text-primary" }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3">
            {user?.role && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {roleLabel(user.role)}
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
            {nav.length > 0 && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Open menu" className="md:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex w-3/4 max-w-xs flex-col p-0 sm:max-w-sm">
                  <SheetHeader className="border-b border-border px-4 py-4 text-left">
                    <SheetTitle>
                      <Logo />
                    </SheetTitle>
                    {user?.role && (
                      <Badge variant="secondary" className="w-fit">
                        {roleLabel(user.role)}
                      </Badge>
                    )}
                  </SheetHeader>
                  <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
                    {nav.map((item) => (
                      <SheetClose asChild key={item.to}>
                        <Link
                          to={item.to}
                          className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          activeProps={{ className: "bg-primary-soft text-primary" }}
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </nav>
                  <div className="border-t border-border p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={signOut}
                      className="w-full justify-start"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
      </header>
      <main className={cn("mx-auto w-full px-4 py-6", mobileFirst ? "max-w-2xl" : "max-w-7xl")}>
        {children}
      </main>
    </div>
  );
}

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string | undefined;
  icon?: ReactNode | undefined;
}) {
  return (
    <div className="surface-card min-w-0 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
        {icon && <span className="shrink-0 text-primary">{icon}</span>}
      </div>
      <p className="mt-2 truncate text-xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PhaseCard({
  title,
  items,
  phase,
}: {
  title: string;
  items: string[];
  phase: string;
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <Badge variant="outline">{phase}</Badge>
      </div>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
