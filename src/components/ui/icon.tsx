import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Status } from "@/components/ui/status-badge";

/**
 * Shared icon wrapper (§5.11 icon system) — every icon in the app should be
 * sized and toned through this component rather than styled ad hoc, so the
 * same warning triangle, danger cross, etc. always reads the same way
 * regardless of which screen it's on.
 */

const SIZE_CLASSES = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-8 w-8",
} as const;

export type IconSize = keyof typeof SIZE_CLASSES;

const TONE_CLASSES: Record<Status, string> = {
  success: "text-status-success",
  warning: "text-status-warning",
  danger: "text-status-danger",
  muted: "text-status-muted",
  info: "text-status-info",
  active: "text-status-active",
};

export function Icon({
  icon: IconComponent,
  size = "md",
  tone,
  className,
}: {
  icon?: LucideIcon;
  size?: IconSize;
  tone?: Status;
  className?: string;
}) {
  if (!IconComponent) return null;
  return (
    <IconComponent
      className={cn(SIZE_CLASSES[size], tone && TONE_CLASSES[tone], className)}
      aria-hidden="true"
    />
  );
}
