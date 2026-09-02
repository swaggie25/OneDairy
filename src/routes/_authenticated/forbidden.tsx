import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { ROLE_HOME, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/forbidden")({
  head: () => ({
    meta: [{ title: "Access denied — DairyOne" }],
  }),
  component: ForbiddenScreen,
});

/**
 * AUDIT ITEM #4 — where role-guarded routes (lib/route-guards.ts) send
 * someone whose role isn't allowed on the page they tried to open, instead
 * of letting them land on a confusing blank/broken dashboard.
 */
function ForbiddenScreen() {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const home = user?.role ? ROLE_HOME[user.role as AppRole] : "/";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">You don't have access to this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page is for a different role than the one on your account. If you think this is a mistake, ask an
          owner or manager to check your account's role.
        </p>
        <div className="mt-6">
          <Button onClick={() => navigate({ to: home ?? "/", replace: true })}>Go to your dashboard</Button>
        </div>
      </div>
    </div>
  );
}
