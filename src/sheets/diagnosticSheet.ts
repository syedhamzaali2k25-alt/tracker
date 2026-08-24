import type { DiagnosticSummary, MarginRow } from "../types.js";
import { clearRange, ensureTab, writeRange, type GoogleContext } from "./client.js";
import { buildPendingEditsMap, readFixEntries, type PendingEdit } from "./fixSheet.js";
import { ensureDiagnosticFormatting, ensureFixFormatting } from "./sheetFormatting.js";

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
      `${summary.belowCostCount} products are selling BELOW COST: you lost ` +
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

/**
 * Formatting is cosmetic — a merchant's diagnostic data must still get
 * written even if a formatting request fails (wrong enum value, a
 * transient API error, whatever). Logs and swallows rather than letting a
 * formatting bug take down writeDiagnostic() entirely, which is exactly
 * what an unguarded call here already did once.
 */
async function applyFormattingSafely(label: string, apply: () => Promise<void>): Promise<void> {
  try {
    await apply();
  } catch (error) {
    console.error(`Warning: ${label} formatting failed — continuing without it.`, error);
  }
}

export async function writeDiagnostic(
  ctx: GoogleContext,
  rows: MarginRow[],
  summary: DiagnosticSummary,
): Promise<{ preservedCount: number }> {
  const { sheetId: diagnosticSheetId } = await ensureTab(ctx, DIAGNOSTIC_TAB);
  const { sheetId: fixSheetId } = await ensureTab(ctx, FIX_TAB);

  // No-ops after the first run (or after a deliberate format-version bump)
  // — see sheetFormatting.ts's ensureFormatted for how that's tracked
  // without re-sending the formatting requests on every sync. Wrapped so a
  // formatting failure can never block the data write below.
  await applyFormattingSafely("Diagnostic tab", () =>
    ensureDiagnosticFormatting(ctx, diagnosticSheetId, summary.currencyCode),
  );
  await applyFormattingSafely("Fix tab", () => ensureFixFormatting(ctx, fixSheetId));

  const pendingEdits = buildPendingEditsMap(await readFixEntries(ctx));

  await clearRange(ctx, `${DIAGNOSTIC_TAB}!A1:Z10000`);
  const diagnosticValues = [
    ...summaryRows(summary),
    DIAGNOSTIC_HEADER,
    ...rows.map(diagnosticDataRow),
  ];
  await writeRange(ctx, `${DIAGNOSTIC_TAB}!A1`, diagnosticValues);

  const { values: fixDataRows, preservedCount } = buildFixRows(rows, pendingEdits);
  await clearRange(ctx, `${FIX_TAB}!A1:Z10000`);
  const fixValues = [FIX_HEADER, ...fixDataRows];
  await writeRange(ctx, `${FIX_TAB}!A1`, fixValues);

  return { preservedCount };
}
