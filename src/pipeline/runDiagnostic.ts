import { config } from "../config.js";
import { calculateMarginRows, summarize } from "../margin/calculate.js";
import { fetchAllVariants, fetchUnitsSoldByVariant } from "../shopify/queries.js";
import { writeDiagnostic } from "../sheets/diagnosticSheet.js";

async function main() {
  console.log(`Fetching products and variants from ${config.shopify.shop}...`);
  const variants = await fetchAllVariants();
  console.log(`Found ${variants.length} variants.`);

  console.log(`Fetching orders from the last ${config.lookbackDays} days...`);
  const sales = await fetchUnitsSoldByVariant(config.lookbackDays);

  const rows = calculateMarginRows(variants, sales, config.lowMarginThreshold);
  const summary = summarize(rows);

  console.log(`${summary.lowMarginCount} products below ${config.lowMarginThreshold * 100}% margin.`);
  console.log(
    `${summary.belowCostCount} products below cost — ${summary.belowCostLoss.toFixed(2)} ${summary.currencyCode} lost in the last ${config.lookbackDays} days.`,
  );
  console.log(`${summary.noCostCount} products have no cost recorded.`);

  console.log("Writing to Google Sheet...");
  const { preservedCount } = await writeDiagnostic(rows, summary);
  if (preservedCount > 0) {
    console.log(`Preserved ${preservedCount} pending edits from the Fix tab.`);
  }
  console.log("Done. Diagnostic and Fix tabs updated.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
