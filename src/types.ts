export interface VariantRow {
  productId: string;
  productTitle: string;
  variantId: string;
  variantTitle: string;
  sku: string;
  inventoryItemId: string;
  cost: number | null;
  price: number;
  currencyCode: string;
}

export interface MarginRow extends VariantRow {
  marginPct: number | null;
  unitsSold30d: number;
  revenue30d: number;
  profit30d: number | null;
  flag: "below-cost" | "low-margin" | "no-cost" | "ok";
}

export interface DiagnosticSummary {
  lowMarginCount: number;
  belowCostCount: number;
  belowCostLoss: number;
  noCostCount: number;
  currencyCode: string;
}
