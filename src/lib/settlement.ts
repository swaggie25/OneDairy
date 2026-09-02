export type SettlementSource = {
  farmer_id: string;
  quantity_litres: number | null;
  total_amount: number | null;
};

export type SettlementLine = {
  farmer_id: string;
  quantity_litres: number;
  gross_amount: number;
  deductions: number;
  net_amount: number;
};

/** Groups verified collections into one payout line per farmer. */
export function buildSettlementLines(
  rows: SettlementSource[],
  deductionPct = 0,
): SettlementLine[] {
  const acc = new Map<string, { litres: number; gross: number }>();
  for (const row of rows) {
    const cur = acc.get(row.farmer_id) ?? { litres: 0, gross: 0 };
    cur.litres += Number(row.quantity_litres ?? 0);
    cur.gross += Number(row.total_amount ?? 0);
    acc.set(row.farmer_id, cur);
  }
  return [...acc.entries()].map(([farmer_id, v]) => {
    const gross = round2(v.gross);
    const deductions = round2((gross * deductionPct) / 100);
    return {
      farmer_id,
      quantity_litres: round2(v.litres),
      gross_amount: gross,
      deductions,
      net_amount: round2(gross - deductions),
    };
  });
}

export function sumLines(lines: SettlementLine[]) {
  return {
    litres: round2(lines.reduce((s, l) => s + l.quantity_litres, 0)),
    net: round2(lines.reduce((s, l) => s + l.net_amount, 0)),
    farmers: lines.length,
  };
}

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
