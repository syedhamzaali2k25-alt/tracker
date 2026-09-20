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

/** A single variant's pre-change price/cost, snapshotted before applyChanges() writes to Shopify. */
export interface BackupEntry {
  productId: string;
  variantId: string;
  inventoryItemId: string;
  productTitle: string;
  variantTitle: string;
  price: number;
  cost: number | null;
  /**
   * The product's title before this batch changed it, or null if this row
   * didn't carry the title change. Title applies to the whole product, not
   * a single variant, so on a multi-variant product only one of its rows'
   * entries has this set (see applyChanges.ts) — undo restores it from
   * whichever entry that is, instead of once per variant row.
   */
  title: string | null;
}
