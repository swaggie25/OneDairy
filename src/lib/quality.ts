import { riskScore } from "./pricing";

export type AlertSeverity = "info" | "warning" | "critical";

export type QualityAlertDraft = {
  collection_id: string;
  farmer_id: string;
  alert_type: string;
  severity: AlertSeverity;
  message: string;
};

export type ScanCollection = {
  id: string;
  farmer_id: string;
  quantity_litres: number | null;
  fat_pct: number | null;
  snf_pct: number | null;
  water_adulteration_pct: number | null;
  antibiotic_test_result: string | null;
  collected_at: string;
};

export type FarmerBaseline = { fatAvg: number | null; snfAvg: number | null; count: number };

/** Rolling per-farmer averages used as the "historical normal" for alerts. */
export function buildBaselines(rows: ScanCollection[]): Record<string, FarmerBaseline> {
  const acc: Record<string, { fat: number[]; snf: number[] }> = {};
  for (const r of rows) {
    const bucket = (acc[r.farmer_id] ??= { fat: [], snf: [] });
    if (r.fat_pct != null) bucket.fat.push(Number(r.fat_pct));
    if (r.snf_pct != null) bucket.snf.push(Number(r.snf_pct));
  }
  const out: Record<string, FarmerBaseline> = {};
  for (const [farmerId, b] of Object.entries(acc)) {
    out[farmerId] = {
      fatAvg: b.fat.length ? avg(b.fat) : null,
      snfAvg: b.snf.length ? avg(b.snf) : null,
      count: Math.max(b.fat.length, b.snf.length),
    };
  }
  return out;
}

/** Evaluates one collection against thresholds and the farmer's own history. */
export function evaluateCollection(
  row: ScanCollection,
  baseline: FarmerBaseline | undefined,
): QualityAlertDraft[] {
  const alerts: QualityAlertDraft[] = [];
  const base = { collection_id: row.id, farmer_id: row.farmer_id };
  const water = row.water_adulteration_pct != null ? Number(row.water_adulteration_pct) : null;
  const fat = row.fat_pct != null ? Number(row.fat_pct) : null;
  const snf = row.snf_pct != null ? Number(row.snf_pct) : null;

  if (water != null && water > 2) {
    alerts.push({
      ...base,
      alert_type: "water_adulteration",
      severity: water > 5 ? "critical" : "warning",
      message: `Added water measured at ${water.toFixed(1)}% (threshold 2%).`,
    });
  }
  if (row.antibiotic_test_result && row.antibiotic_test_result.toLowerCase() === "positive") {
    alerts.push({
      ...base,
      alert_type: "antibiotic_positive",
      severity: "critical",
      message: "Antibiotic residue test came back positive — quarantine this milk.",
    });
  }
  if (fat != null && fat < 3) {
    alerts.push({
      ...base,
      alert_type: "low_fat",
      severity: "warning",
      message: `Fat ${fat.toFixed(2)}% is below the acceptable floor of 3.0%.`,
    });
  }
  if (snf != null && snf < 8) {
    alerts.push({
      ...base,
      alert_type: "low_snf",
      severity: "warning",
      message: `SNF ${snf.toFixed(2)}% is below the acceptable floor of 8.0%.`,
    });
  }
  if (baseline && baseline.count >= 3) {
    if (fat != null && baseline.fatAvg != null && Math.abs(fat - baseline.fatAvg) > 1.5) {
      alerts.push({
        ...base,
        alert_type: "fat_deviation",
        severity: "warning",
        message: `Fat ${fat.toFixed(2)}% deviates from this farmer's usual ${baseline.fatAvg.toFixed(2)}%.`,
      });
    }
    if (snf != null && baseline.snfAvg != null && Math.abs(snf - baseline.snfAvg) > 1) {
      alerts.push({
        ...base,
        alert_type: "snf_deviation",
        severity: "warning",
        message: `SNF ${snf.toFixed(2)}% deviates from this farmer's usual ${baseline.snfAvg.toFixed(2)}%.`,
      });
    }
  }
  return alerts;
}

/** Same score the field app shows, reused so screens never disagree. */
export function scoreCollection(row: ScanCollection, baseline: FarmerBaseline | undefined): number {
  return riskScore({
    fatPct: row.fat_pct != null ? Number(row.fat_pct) : null,
    snfPct: row.snf_pct != null ? Number(row.snf_pct) : null,
    waterPct: row.water_adulteration_pct != null ? Number(row.water_adulteration_pct) : null,
    historyFatAvg: baseline?.fatAvg ?? null,
    historySnfAvg: baseline?.snfAvg ?? null,
  });
}

export const SEVERITY_VARIANT: Record<AlertSeverity, "default" | "secondary" | "destructive"> = {
  info: "secondary",
  warning: "default",
  critical: "destructive",
};

function avg(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}
