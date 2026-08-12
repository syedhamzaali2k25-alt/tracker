import type { VariantSales } from "../shopify/queries.js";
import type { DiagnosticSummary, MarginRow, VariantRow } from "../types.js";

function flagFor(marginPct: number | null, lowMarginThreshold: number): MarginRow["flag"] {
  if (marginPct === null) return "no-cost";
  if (marginPct < 0) return "below-cost";
  if (marginPct < lowMarginThreshold) return "low-margin";
  return "ok";
}

export function calculateMarginRows(
  variants: VariantRow[],
  salesByVariant: Map<string, VariantSales>,
  lowMarginThreshold: number,
): MarginRow[] {
  return variants
    .map((variant): MarginRow => {
      const sales = salesByVariant.get(variant.variantId) ?? { unitsSold: 0, revenue: 0 };
      const marginPct =
        variant.cost === null || variant.price === 0
          ? null
          : (variant.price - variant.cost) / variant.price;
      const profit30d = variant.cost === null ? null : (variant.price - variant.cost) * sales.unitsSold;

      return {
        ...variant,
        marginPct,
        unitsSold30d: sales.unitsSold,
        revenue30d: sales.revenue,
        profit30d,
        flag: flagFor(marginPct, lowMarginThreshold),
      };
    })
    .sort((a, b) => {
      if (a.marginPct === null) return 1;
      if (b.marginPct === null) return -1;
      return a.marginPct - b.marginPct;
    });
}

export function summarize(rows: MarginRow[]): DiagnosticSummary {
  const lowMarginCount = rows.filter((r) => r.flag === "low-margin" || r.flag === "below-cost").length;
  const belowCostRows = rows.filter((r) => r.flag === "below-cost");
  const belowCostLoss = belowCostRows.reduce(
    (sum, r) => sum + Math.abs(Math.min(r.profit30d ?? 0, 0)),
    0,
  );
  const noCostCount = rows.filter((r) => r.flag === "no-cost").length;

  return {
    lowMarginCount,
    belowCostCount: belowCostRows.length,
    belowCostLoss,
    noCostCount,
    currencyCode: rows.find((r) => r.currencyCode)?.currencyCode ?? "",
  };
}
