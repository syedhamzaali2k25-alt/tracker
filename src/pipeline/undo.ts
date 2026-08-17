import type { ShopContext } from "../shopify/client.js";
import { applyCostUpdates, applyPriceUpdates } from "../shopify/mutations.js";
import type { PushBatchEntry } from "../types.js";

export interface UndoResult {
  restored: number;
}

function describeVariant(entries: PushBatchEntry[], inventoryItemId: string): string {
  const entry = entries.find((e) => e.inventoryItemId === inventoryItemId);
  if (!entry) return inventoryItemId;
  return `${entry.productTitle} ${entry.variantTitle}`.trim();
}

/**
 * Restores one push batch's before-values to Shopify. Never prompts, and
 * never checks whether the batch was already reverted or belongs to this
 * shop — the caller (the app's History route, via app/app/push-batch.server
 * .ts) is responsible for loading the right batch, confirming with the
 * merchant first, and marking it reverted afterward so it can't be applied
 * twice.
 */
export async function undoBatch(
  shopContext: ShopContext,
  entries: PushBatchEntry[],
  onProgress?: (message: string) => void,
): Promise<UndoResult> {
  const report = onProgress ?? (() => {});

  report(`Restoring ${entries.length} variant(s) to their previous price/cost...`);

  const priceUpdates = entries.map((e) => ({
    productId: e.productId,
    variantId: e.variantId,
    price: e.price,
  }));
  const costUpdates = entries.map((e) => ({
    inventoryItemId: e.inventoryItemId,
    cost: e.cost,
  }));

  report(`Restoring ${priceUpdates.length} price(s)...`);
  await applyPriceUpdates(shopContext, priceUpdates);

  report(`Restoring ${costUpdates.length} cost(s)...`);
  const failedClears = await applyCostUpdates(shopContext, costUpdates);
  if (failedClears.length > 0) {
    const names = failedClears.map((id) => describeVariant(entries, id)).join(", ");
    report(
      `Warning: could not clear cost back to "no cost recorded" for: ${names}. ` +
        "Their cost field may still show the value set by apply — check them manually in Shopify admin.",
    );
  }

  report("Done. Prices and costs restored from the batch.");

  return { restored: entries.length };
}
