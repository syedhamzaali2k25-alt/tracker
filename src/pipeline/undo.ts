import type { ShopContext } from "../shopify/client.js";
import { applyCostUpdates, applyPriceUpdates } from "../shopify/mutations.js";
import type { BackupEntry } from "../types.js";

export interface UndoResult {
  restored: number;
}

function describeVariant(entries: BackupEntry[], inventoryItemId: string): string {
  const entry = entries.find((e) => e.inventoryItemId === inventoryItemId);
  if (!entry) return inventoryItemId;
  return `${entry.productTitle} ${entry.variantTitle}`.trim();
}

/**
 * Restores a specific batch's before-values to Shopify. Never prompts, and
 * doesn't check whether this batch was already reverted — the caller (the
 * app's History page) owns confirming first and the reverted-once guard,
 * since both need the batch row this function has no access to.
 */
export async function undoBatch(
  shopContext: ShopContext,
  entries: BackupEntry[],
  onProgress?: (message: string) => void,
): Promise<UndoResult> {
  const report = onProgress ?? (() => {});

  if (entries.length === 0) {
    return { restored: 0 };
  }

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
        "Their cost field may still show the value set by apply. Check them manually in Shopify admin.",
    );
  }

  report("Done. Prices and costs restored.");

  return { restored: entries.length };
}
