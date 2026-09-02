import { Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Numbered stop marker for a route trip's stop list (§5.3 trip screen).
 * Mirrors the four states SegmentedProgress uses so a stop's pin and its
 * slice of the progress bar always agree.
 */
export type StopState = "completed" | "current" | "problem" | "pending";

const STATE_CLASSES: Record<StopState, string> = {
  completed: "bg-status-success text-status-success-foreground",
  current: "bg-status-active text-status-active-foreground ring-4 ring-status-active/20",
  problem: "bg-status-danger text-status-danger-foreground",
  pending: "bg-status-muted-soft text-status-muted",
};

const SIZE_CLASSES = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
} as const;

export function StopPin({
  state,
  sequence,
  size = "md",
  className,
}: {
  state: StopState;
  sequence: number;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        SIZE_CLASSES[size],
        STATE_CLASSES[state],
        className,
      )}
    >
      {state === "completed" ? (
        <Check className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
      ) : state === "problem" ? (
        <AlertTriangle className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
      ) : (
        sequence
      )}
    </span>
  );
}
