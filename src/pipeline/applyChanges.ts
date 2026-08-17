import type { ShopContext } from "../shopify/client.js";
import { applyCostUpdates, applyPriceUpdates } from "../shopify/mutations.js";
import type { FixEntry } from "../sheets/fixSheet.js";
import type { PushBatchEntry } from "../types.js";

export interface ApplyChangesResult {
  pricesUpdated: number;
  costsUpdated: number;
  /** ID of the push batch saved before writing, for undoing it later. Empty when there was nothing to apply. */
  batchId: string;
}

/**
 * Writes the before-values for every entry to a push batch — implemented
 * against Prisma in app/app/push-batch.server.ts — so this file stays
 * database-agnostic the same way it's already Sheets/Shopify-context
 * agnostic (ShopContext/GoogleContext are passed in rather than looked up
 * globally).
 */
export interface PushBatchRecorder {
  recordBatch(shop: string, entries: PushBatchEntry[]): Promise<string>;
}

/**
 * Writes already-confirmed price/cost changes to Shopify. Never prompts —
 * the caller (CLI wrapper below, or the app's confirmation modal) is
 * responsible for deciding these entries should be applied before calling
 * this. Always saves a push batch of the pre-change values first, unless
 * there's nothing to do.
 */
export async function applyChanges(
  shopContext: ShopContext,
  confirmedEntries: FixEntry[],
  batchRecorder: PushBatchRecorder,
  onProgress?: (message: string) => void,
): Promise<ApplyChangesResult> {
  const report = onProgress ?? (() => {});

  if (confirmedEntries.length === 0) {
    return { pricesUpdated: 0, costsUpdated: 0, batchId: "" };
  }

  const batchEntries: PushBatchEntry[] = confirmedEntries.map((e) => ({
    productId: e.productId,
    variantId: e.variantId,
    inventoryItemId: e.inventoryItemId,
    productTitle: e.productTitle,
    variantTitle: e.variantTitle,
    price: e.currentPrice,
    cost: e.currentCost,
  }));
  const batchId = await batchRecorder.recordBatch(shopContext.shop, batchEntries);
  report(`Saved a snapshot of the old prices/costs (batch ${batchId}) before making changes.`);

  const priceUpdates = confirmedEntries
    .filter((e) => e.newPrice !== null)
    .map((e) => ({ productId: e.productId, variantId: e.variantId, price: e.newPrice! }));
  const costUpdates = confirmedEntries
    .filter((e) => e.newCost !== null)
    .map((e) => ({ inventoryItemId: e.inventoryItemId, cost: e.newCost! }));

  if (priceUpdates.length > 0) {
    report(`Updating ${priceUpdates.length} price(s)...`);
    await applyPriceUpdates(shopContext, priceUpdates);
  }
  if (costUpdates.length > 0) {
    report(`Updating ${costUpdates.length} cost(s)...`);
    await applyCostUpdates(shopContext, costUpdates);
  }

  report("Done.");

  return { pricesUpdated: priceUpdates.length, costsUpdated: costUpdates.length, batchId };
}
