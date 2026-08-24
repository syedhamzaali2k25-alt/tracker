import { config } from "../config.js";
import { calculateMarginRows, summarize } from "../margin/calculate.js";
import type { ShopContext } from "../shopify/client.js";
import { fetchAllVariants, fetchUnitsSoldByVariant } from "../shopify/queries.js";
import type { DiagnosticSummary, MarginRow } from "../types.js";

export interface DiagnosticResult {
  rows: MarginRow[];
  summary: DiagnosticSummary;
}

/**
 * Fetches Shopify data and computes margins. Deliberately does not touch
 * Google Sheets — the app's dashboard needs to show these numbers with
 * Sheets completely disconnected. Sheet writing is a separate step (see the
 * CLI wrapper below, and the app's own "Create sheet" action).
 */
export async function runDiagnostic(
  shopContext: ShopContext,
  onProgress?: (message: string) => void,
): Promise<DiagnosticResult> {
  const report = onProgress ?? (() => {});

  report(`Fetching products and variants from ${shopContext.shop}...`);
  const variants = await fetchAllVariants(shopContext);
  report(`Found ${variants.length} variants.`);

  report(`Fetching orders from the last ${config.lookbackDays} days...`);
  const sales = await fetchUnitsSoldByVariant(shopContext, config.lookbackDays);

  const rows = calculateMarginRows(variants, sales, config.lowMarginThreshold);
  const summary = summarize(rows);

  report(`${summary.lowMarginCount} products below ${config.lowMarginThreshold * 100}% margin.`);
  report(
    `${summary.belowCostCount} products below cost, ${summary.belowCostLoss.toFixed(2)} ${summary.currencyCode} lost in the last ${config.lookbackDays} days.`,
  );
  report(`${summary.noCostCount} products have no cost recorded.`);

  return { rows, summary };
}
