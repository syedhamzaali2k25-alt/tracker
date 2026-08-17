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

/**
 * The before-values for one variant touched by an applyChanges() run —
 * enough to restore it later. Persisted as part of a push batch (see
 * app/app/push-batch.server.ts); src/ itself never stores these.
 */
export interface PushBatchEntry {
  productId: string;
  variantId: string;
  inventoryItemId: string;
  productTitle: string;
  variantTitle: string;
  price: number;
  cost: number | null;
}
