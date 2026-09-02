import { AlertTriangle, CheckCircle2, Clock, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared status vocabulary (§4/§5.3/§5.11) used by StatusBadge and, via the
 * same tone names, by Icon. Six meanings, one palette each — components
 * should reach for these rather than success/warning colors directly, so a
 * "delayed" trip and a "danger" device check always look the same.
 */
export type Status = "success" | "warning" | "danger" | "muted" | "info" | "active";

const STATUS_ICON: Record<Status, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  muted: Clock,
  info: Info,
  active: CheckCircle2,
};

const STATUS_CLASSES: Record<Status, string> = {
  success: "bg-status-success-soft text-status-success",
  warning: "bg-status-warning-soft text-status-warning",
  danger: "bg-status-danger-soft text-status-danger",
  muted: "bg-status-muted-soft text-status-muted",
  info: "bg-status-info-soft text-status-info",
  active: "bg-status-active-soft text-status-active",
};

const SIZE_CLASSES = {
  sm: "gap-1.5 rounded-full px-2.5 py-1 text-xs",
  md: "gap-2 rounded-full px-3 py-1.5 text-sm",
  lg: "gap-2 rounded-full px-4 py-2 text-base",
} as const;

const ICON_SIZE_CLASSES = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;

export function StatusBadge({
  status,
  label,
  detail,
  icon,
  size = "md",
  className,
}: {
  status: Status;
  label: string;
  detail?: string | undefined;
  icon?: LucideIcon | undefined;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const StatusIcon = icon ?? STATUS_ICON[status];
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold",
        SIZE_CLASSES[size],
        STATUS_CLASSES[status],
        className,
      )}
    >
      <StatusIcon className={cn(ICON_SIZE_CLASSES[size], "shrink-0")} aria-hidden="true" />
      <span>{label}</span>
      {detail && <span className="font-normal opacity-80">· {detail}</span>}
    </span>
  );
}
