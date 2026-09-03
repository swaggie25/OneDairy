import { formatCurrency } from "@/lib/pricing";

export type ReceiptData = {
  farmerName: string;
  farmerCode: string;
  session: string;
  quantityLitres: number;
  fatPct: number | null;
  snfPct: number | null;
  ratePerLitre: number;
  totalAmount: number;
  collectedAt: string | Date;
};

/**
 * Opens a receipt preview window with its own in-page "Print" button.
 *
 * Deliberately does NOT call `window.print()` itself — the agent reviews the
 * receipt first and prints on demand, instead of a print dialog firing the
 * instant the window opens. Used both right after saving an entry and for
 * reprinting a past entry from My collections.
 */
export function openReceiptPreview(data: ReceiptData): boolean {
  const win = window.open("", "_blank", "width=340,height=560");
  if (!win) return false;

  const when = new Date(data.collectedAt).toLocaleString();

  win.document.write(`<!doctype html>
<html>
<head>
<title>DairyOne receipt — ${data.farmerName}</title>
<style>
  body { font-family: ui-monospace, monospace; padding: 16px; color: #0f172a; }
  pre { font-size: 12px; white-space: pre-wrap; }
  button {
    margin-top: 12px;
    width: 100%;
    height: 44px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 8px;
    border: 1px solid #0f172a;
    background: #0f172a;
    color: #fff;
    cursor: pointer;
  }
  @media print {
    button { display: none; }
  }
</style>
</head>
<body>
<pre>
DairyOne receipt
-----------------------------
Farmer : ${data.farmerName} (${data.farmerCode})
Session: ${data.session}
Qty    : ${data.quantityLitres} L
Fat    : ${data.fatPct ?? "-"} %   SNF: ${data.snfPct ?? "-"}
Rate   : ${formatCurrency(data.ratePerLitre)}/L
Amount : ${formatCurrency(data.totalAmount)}
Time   : ${when}
-----------------------------
</pre>
<button onclick="window.print()">Print receipt</button>
</body>
</html>`);
  win.document.close();
  return true;
}
