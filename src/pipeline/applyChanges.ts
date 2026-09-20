import type { ShopContext } from "../shopify/client.js";
import { applyCostUpdates, applyPriceUpdates, applyTitleUpdates } from "../shopify/mutations.js";
import type { FixEntry } from "../sheets/fixSheet.js";
import type { BackupEntry } from "../types.js";

export interface ApplyChangesResult {
  pricesUpdated: number;
  costsUpdated: number;
  titlesUpdated: number;
  /** ID of the push-batch row saved before writing, for undo. Empty when there was nothing to apply. */
  batchId: string;
}

/**
 * Persists a batch's before-values somewhere durable and returns an ID for
 * it. Left to the caller rather than baked in here: the app backs this with
 * a database table (app/app/push-batches.server.ts), and this shared
 * pipeline code has no database of its own to reach for.
 */
export type SaveBatch = (shop: string, entries: BackupEntry[]) => Promise<string>;

/**
 * Writes already-confirmed price/cost changes to Shopify. Never prompts —
 * the caller (the app's confirmation modal) is responsible for deciding
 * these entries should be applied before calling this. Always saves a batch
 * of the pre-change values first, unless there's nothing to do.
 */
export async function applyChanges(
  shopContext: ShopContext,
  confirmedEntries: FixEntry[],
  saveBatch: SaveBatch,
  onProgress?: (message: string) => void,
): Promise<ApplyChangesResult> {
  const report = onProgress ?? (() => {});

  if (confirmedEntries.length === 0) {
    return { pricesUpdated: 0, costsUpdated: 0, titlesUpdated: 0, batchId: "" };
  }

  // A title change applies to the whole product, not one variant, so a
  // multi-variant product with several rows in the Fix tab only gets its
  // title backed up (and later pushed) once — from whichever row is first
  // among its rows to carry the change — rather than once per row.
  const titleChangeProductIds = new Set<string>();
  const backupEntries: BackupEntry[] = [];
  const titleUpdates: { productId: string; title: string }[] = [];

  for (const e of confirmedEntries) {
    const hasTitleChange = e.newTitle !== null && e.newTitle !== e.productTitle;
    const isFirstForProduct = hasTitleChange && !titleChangeProductIds.has(e.productId);
    if (isFirstForProduct) {
      titleChangeProductIds.add(e.productId);
      titleUpdates.push({ productId: e.productId, title: e.newTitle! });
    }
    backupEntries.push({
      productId: e.productId,
      variantId: e.variantId,
      inventoryItemId: e.inventoryItemId,
      productTitle: e.productTitle,
      variantTitle: e.variantTitle,
      price: e.currentPrice,
      cost: e.currentCost,
      title: isFirstForProduct ? e.productTitle : null,
    });
  }

  const batchId = await saveBatch(shopContext.shop, backupEntries);
  report(`Saved a snapshot of the old prices/costs/titles (batch ${batchId}).`);

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
  if (titleUpdates.length > 0) {
    report(`Updating ${titleUpdates.length} title(s)...`);
    await applyTitleUpdates(shopContext, titleUpdates);
  }

  report("Done.");

  return {
    pricesUpdated: priceUpdates.length,
    costsUpdated: costUpdates.length,
    titlesUpdated: titleUpdates.length,
    batchId,
  };
}
