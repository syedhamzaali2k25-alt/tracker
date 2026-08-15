import type { DiagnosticSummary, MarginRow } from "../types.js";
import { clearRange, ensureTab, writeRange } from "./client.js";
import { buildPendingEditsMap, readFixEntries, type PendingEdit } from "./fixSheet.js";

export const DIAGNOSTIC_TAB = "Diagnostic";
export const FIX_TAB = "Fix";

const DIAGNOSTIC_HEADER = [
  "Product",
  "Variant",
  "SKU",
  "Cost",
  "Price",
  "Margin %",
  "Sold (30d)",
  "Revenue (30d)",
  "Profit (30d)",
  "Flag",
  "Shopify Product ID",
  "Shopify Variant ID",
];

const FIX_HEADER = [
  "Product",
  "Variant",
  "SKU",
  "Current Price",
  "Current Cost",
  "New Price",
  "New Cost",
  "Shopify Product ID",
  "Shopify Variant ID",
  "Inventory Item ID",
];

const FLAG_LABEL: Record<MarginRow["flag"], string> = {
  "below-cost": "🔴 below cost",
  "low-margin": "🔴 low margin",
  "no-cost": "⚫ no cost data",
  ok: "🟢",
};

function summaryRows(summary: DiagnosticSummary): string[][] {
  return [
    [`${summary.lowMarginCount} products are selling below 20% margin.`],
    [
      `${summary.belowCostCount} products are selling BELOW COST — you lost ` +
        `${summary.belowCostLoss.toFixed(2)} ${summary.currencyCode} in the last 30 days.`,
    ],
    [`${summary.noCostCount} products have no cost recorded, so we can't check them.`],
    [],
  ];
}

function diagnosticDataRow(row: MarginRow): (string | number)[] {
  return [
    row.productTitle,
    row.variantTitle,
    row.sku,
    row.cost ?? "",
    row.price,
    row.marginPct === null ? "" : row.marginPct,
    row.unitsSold30d,
    row.revenue30d,
    row.profit30d ?? "",
    FLAG_LABEL[row.flag],
    row.productId,
    row.variantId,
  ];
}

function fixDataRow(row: MarginRow, pending: PendingEdit | undefined): (string | number)[] {
  return [
    row.productTitle,
    row.variantTitle,
    row.sku,
    row.price,
    row.cost ?? "",
    pending?.newPrice ?? "",
    pending?.newCost ?? "",
    row.productId,
    row.variantId,
    row.inventoryItemId,
  ];
}

export function buildFixRows(
  rows: MarginRow[],
  pendingEdits: Map<string, PendingEdit>,
): { values: (string | number)[][]; preservedCount: number } {
  let preservedCount = 0;
  const values = rows.map((row) => {
    const pending = pendingEdits.get(row.variantId);
    if (pending) preservedCount += 1;
    return fixDataRow(row, pending);
  });
  return { values, preservedCount };
}

export async function writeDiagnostic(
  rows: MarginRow[],
  summary: DiagnosticSummary,
): Promise<{ preservedCount: number }> {
  await ensureTab(DIAGNOSTIC_TAB);
  await ensureTab(FIX_TAB);

  const pendingEdits = buildPendingEditsMap(await readFixEntries());

  await clearRange(`${DIAGNOSTIC_TAB}!A1:Z10000`);
  const diagnosticValues = [
    ...summaryRows(summary),
    DIAGNOSTIC_HEADER,
    ...rows.map(diagnosticDataRow),
  ];
  await writeRange(`${DIAGNOSTIC_TAB}!A1`, diagnosticValues);

  const { values: fixDataRows, preservedCount } = buildFixRows(rows, pendingEdits);
  await clearRange(`${FIX_TAB}!A1:Z10000`);
  const fixValues = [FIX_HEADER, ...fixDataRows];
  await writeRange(`${FIX_TAB}!A1`, fixValues);

  return { preservedCount };
}
