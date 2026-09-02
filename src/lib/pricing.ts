/**
 * Single shared pricing calculation. Every screen (agent field entry, manager
 * centre walk-in, reports) must use these helpers — never duplicate the math.
 */

export type RateSlab = {
  id: string;
  animal_type: string;
  min_fat: number;
  max_fat: number;
  min_snf: number;
  max_snf: number;
  rate_per_litre: number;
  active: boolean;
};

/** Fallback used when no slab matches (or none are configured yet). */
export const FALLBACK_BASE_RATE = 30;
const FAT_STEP = 3.5;
const SNF_STEP = 8.5;

export function fallbackRate(fatPct: number | null, snfPct: number | null): number {
  const fat = Number.isFinite(fatPct as number) ? (fatPct as number) : FAT_STEP;
  const snf = Number.isFinite(snfPct as number) ? (snfPct as number) : SNF_STEP;
  const rate = FALLBACK_BASE_RATE + (fat - FAT_STEP) * 4 + (snf - SNF_STEP) * 2;
  return Math.max(10, round2(rate));
}

export function findSlab(
  slabs: RateSlab[] | undefined,
  opts: { animalType?: string; fatPct: number | null; snfPct: number | null },
): RateSlab | undefined {
  if (!slabs?.length) return undefined;
  const fat = opts.fatPct ?? 0;
  const snf = opts.snfPct ?? 0;
  return slabs.find(
    (s) =>
      s.active &&
      (!opts.animalType || s.animal_type === opts.animalType) &&
      fat >= s.min_fat &&
      fat <= s.max_fat &&
      snf >= s.min_snf &&
      snf <= s.max_snf,
  );
}

export function ratePerLitre(
  slabs: RateSlab[] | undefined,
  opts: { animalType?: string; fatPct: number | null; snfPct: number | null },
): number {
  const slab = findSlab(slabs, opts);
  return slab ? round2(Number(slab.rate_per_litre)) : fallbackRate(opts.fatPct, opts.snfPct);
}

export function totalAmount(quantityLitres: number, rate: number): number {
  if (!Number.isFinite(quantityLitres) || quantityLitres <= 0) return 0;
  return round2(quantityLitres * rate);
}

/** CLR ≈ (SNF - 0.21*Fat - 0.36) * 4 ; inverted to estimate SNF from CLR + fat. */
export function snfFromClr(clr: number | null, fatPct: number | null): number | null {
  if (clr == null || !Number.isFinite(clr)) return null;
  const fat = fatPct ?? 0;
  return round2(clr / 4 + 0.21 * fat + 0.36);
}

/** Rule-based suspicion score (0-100). No ML needed for MVP. */
export function riskScore(input: {
  fatPct: number | null;
  snfPct: number | null;
  waterPct: number | null;
  historyFatAvg?: number | null;
  historySnfAvg?: number | null;
}): number {
  let score = 0;
  if ((input.waterPct ?? 0) > 2) score += 40;
  if ((input.fatPct ?? 99) < 3) score += 20;
  if ((input.snfPct ?? 99) < 8) score += 20;
  if (input.historyFatAvg && input.fatPct != null) {
    if (Math.abs(input.fatPct - input.historyFatAvg) > 1.5) score += 20;
  }
  if (input.historySnfAvg && input.snfPct != null) {
    if (Math.abs(input.snfPct - input.historySnfAvg) > 1) score += 15;
  }
  return Math.min(100, score);
}

/** PHASE 2 — Quality state shown/gated in the entry form. Same 40-point line
 * `evaluateCollection` (src/lib/quality.ts) uses for "critical", so the field
 * gate and the manager's alert scan never disagree. */
export function qualityStatus(score: number): "normal" | "warning" | "critical" {
  if (score >= 40) return "critical";
  if (score > 0) return "warning";
  return "normal";
}

export function formatCurrency(value: number): string {
  return `₹${value.toFixed(2)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}