import type { ShopContext } from "../shopify/client.js";
import { applyCostUpdates, applyPriceUpdates } from "../shopify/mutations.js";
import type { FixEntry } from "../sheets/fixSheet.js";
import { saveBackup, type BackupEntry } from "./backup.js";

export interface ApplyChangesResult {
  pricesUpdated: number;
  costsUpdated: number;
  /** Path/identifier of the snapshot saved before writing, for undoLatest(). Empty when there was nothing to apply. */
  backupId: string;
}

/**
 * Writes already-confirmed price/cost changes to Shopify. Never prompts —
 * the caller (CLI wrapper below, or the app's confirmation modal) is
 * responsible for deciding these entries should be applied before calling
 * this. Always snapshots the pre-change values first, unless there's
 * nothing to do.
 */
export async function applyChanges(
  shopContext: ShopContext,
  confirmedEntries: FixEntry[],
  onProgress?: (message: string) => void,
): Promise<ApplyChangesResult> {
  const report = onProgress ?? (() => {});

  if (confirmedEntries.length === 0) {
    return { pricesUpdated: 0, costsUpdated: 0, backupId: "" };
  }

  const backupEntries: BackupEntry[] = confirmedEntries.map((e) => ({
    productId: e.productId,
    variantId: e.variantId,
    inventoryItemId: e.inventoryItemId,
    productTitle: e.productTitle,
    variantTitle: e.variantTitle,
    price: e.currentPrice,
    cost: e.currentCost,
  }));
  const backupId = await saveBackup(backupEntries);
  report(`Saved a snapshot of the old prices/costs to ${backupId}`);

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

  return { pricesUpdated: priceUpdates.length, costsUpdated: costUpdates.length, backupId };
}
