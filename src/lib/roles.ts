export const APP_ROLES = [
  "owner",
  "manager",
  "agent",
  "buyer",
  "farmer",
  "accountant",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Normalizes an Indian phone number to 10 digits. */
export function normalizePhone(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function isValidPhone(input: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizePhone(input));
}

export function formatPhone(input: string): string {
  const p = normalizePhone(input);
  return p.length === 10 ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : input;
}

export const ROLE_HOME: Record<AppRole, string> = {
  owner: "/owner",
  manager: "/manager",
  agent: "/agent",
  buyer: "/buyer",
  farmer: "/farmer",
  accountant: "/accountant",
};
