import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { IndianRupee, Droplets, HeartPulse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeading, PhaseCard, StatCard } from "@/components/app-shell";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/farmer")({
  beforeLoad: ({ context }) => requireRole(context.profile, ["farmer"]),
  component: FarmerHome,
});

function FarmerHome() {
  const { data: user } = useCurrentUser();
  const { data: farmer } = useQuery({
    queryKey: ["my-farmer-record", user?.userId],
    enabled: Boolean(user?.userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("farmers")
        .select("id, farmer_code, full_name, village, farmer_animals(id, animal_type, animal_count)")
        .eq("profile_id", user!.userId)
        .maybeSingle();
      return data;
    },
  });

  return (
    <AppShell mobileFirst>
      <PageHeading
        title={farmer?.full_name ?? user?.fullName ?? "My dairy"}
        subtitle={
          farmer
            ? `Farmer code ${farmer.farmer_code}${farmer.village ? ` · ${farmer.village}` : ""}`
            : "Your farmer record will appear once your centre registers you."
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Milk today" value="—" hint="Litres collected" icon={<Droplets className="h-4 w-4" />} />
        <StatCard label="Today's rate" value="—" hint="Per litre" icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard label="Animals" value={farmer?.farmer_animals?.length ?? 0} icon={<HeartPulse className="h-4 w-4" />} />
      </div>

      <div className="mt-6">
        <PhaseCard
          phase="Phase 2-6"
          title="Your DairyOne"
          items={[
            "Daily milk history with fat/SNF and amount earned",
            "Payment status and settlement history",
            "Vaccination reminders and feed order requests",
            "Raise a complaint and track its resolution",
          ]}
        />
      </div>
    </AppShell>
  );
}
