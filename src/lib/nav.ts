import type { AppRole } from "@/lib/roles";

/** Shared navigation sets so every staff screen exposes the same links. */
export const MANAGER_NAV = [
  { label: "Dashboard", to: "/manager" },
  { label: "Live map", to: "/live" },
  { label: "Collect milk", to: "/collect" },
  { label: "MCC handovers", to: "/handovers" },
  { label: "Transfers", to: "/transfers" },
  { label: "Quality", to: "/quality" },
  { label: "Finance", to: "/finance" },
  { label: "Reports", to: "/reports" },
  { label: "QR cards", to: "/cards" },
  { label: "Field setup", to: "/field-setup" },
];

export const OWNER_NAV = [
  { label: "Overview", to: "/owner" },
  { label: "Live map", to: "/live" },
  { label: "Collect milk", to: "/collect" },
  { label: "MCC handovers", to: "/handovers" },
  { label: "Transfers", to: "/transfers" },
  { label: "Quality", to: "/quality" },
  { label: "Finance", to: "/finance" },
  { label: "Reports", to: "/reports" },
  { label: "QR cards", to: "/cards" },
  { label: "Field setup", to: "/field-setup" },
];

/** Finance-facing screens (accountant home plus staff shortcuts). */
export const FINANCE_NAV = [
  { label: "Finance", to: "/finance" },
  { label: "Reports", to: "/reports" },
  { label: "Quality", to: "/quality" },
  { label: "Collect milk", to: "/collect" },
  { label: "Transfers", to: "/transfers" },
];

/**
 * Resolves the correct nav set for a role. Use this on every shared screen
 * (collect, cards, transfers, handovers, etc.) instead of hardcoding
 * MANAGER_NAV, so Owner/Accountant always see their own nav bar rather than
 * the Manager's when they land here from their own dashboard.
 */
export function navForRole(role: AppRole | null | undefined) {
  if (role === "owner") return OWNER_NAV;
  if (role === "accountant") return FINANCE_NAV;
  return MANAGER_NAV;
}
