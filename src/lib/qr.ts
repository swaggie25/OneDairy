/** QR card helpers — one shared place for card code format and rendering. */
import QRCode from "qrcode";

export type CardEntityType = "farmer" | "agent";

export function cardCodeFor(entityType: CardEntityType, entityCode: string): string {
  return `${entityType === "farmer" ? "DO-F-" : "DO-A-"}${entityCode}`;
}

export function cardUrl(codeValue: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/card/${encodeURIComponent(codeValue)}`;
}

/** Renders a QR image (data URL) for a card code. */
export async function qrDataUrl(codeValue: string, size = 256): Promise<string> {
  return QRCode.toDataURL(cardUrl(codeValue), {
    width: size,
    margin: 1,
    color: { dark: "#0f2a3f", light: "#ffffff" },
  });
}

/** Accepts either a raw code (DO-F-XXX) or a full digital-card URL. */
export function normalizeScan(raw: string): string {
  const value = raw.trim();
  const match = value.match(/\/card\/([^/?#]+)/);
  return decodeURIComponent(match?.[1] ?? value).toUpperCase();
}
