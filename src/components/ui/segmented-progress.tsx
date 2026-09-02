import { cn } from "@/lib/utils";
import type { StopState } from "@/components/ui/stop-pin";

/**
 * Trip-wide progress strip — one segment per route stop, colored by the
 * same StopState each stop's StopPin uses, so the two never disagree about
 * where the agent stands on the route.
 */
const STATE_CLASSES: Record<StopState, string> = {
  completed: "bg-status-success",
  current: "bg-status-active",
  problem: "bg-status-danger",
  pending: "bg-status-muted-soft",
};

export function SegmentedProgress({
  segments,
  className,
}: {
  segments: StopState[];
  className?: string;
}) {
  if (segments.length === 0) return null;
  const completed = segments.filter((s) => s === "completed").length;

  return (
    <div className={cn("surface-card p-3.5", className)}>
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Route progress</span>
        <span className="font-medium text-foreground">
          {completed} of {segments.length} stops
        </span>
      </div>
      <div className="flex gap-1">
        {segments.map((state, i) => (
          <span
            key={i}
            className={cn("h-1.5 flex-1 rounded-full transition-colors", STATE_CLASSES[state])}
          />
        ))}
      </div>
    </div>
  );
}
