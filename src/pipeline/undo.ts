import type { ShopContext } from "../shopify/client.js";
import { applyCostUpdates, applyPriceUpdates } from "../shopify/mutations.js";
import { loadLatestBackup, markBackupApplied, type BackupEntry } from "./backup.js";

export interface UndoResult {
  restored: number;
  backupId: string;
}

function describeVariant(entries: BackupEntry[], inventoryItemId: string): string {
  const entry = entries.find((e) => e.inventoryItemId === inventoryItemId);
  if (!entry) return inventoryItemId;
  return `${entry.productTitle} ${entry.variantTitle}`.trim();
}

/**
 * Restores the most recent pending backup. Never prompts — the caller is
 * responsible for confirming first. Throws if there's no pending backup to
 * restore, since there's no sensible zero-value result to hand back.
 */
export async function undoLatest(
  shopContext: ShopContext,
  onProgress?: (message: string) => void,
): Promise<UndoResult> {
  const report = onProgress ?? (() => {});

  const backup = await loadLatestBackup();
  if (!backup) {
    throw new Error("No backups found — nothing to undo.");
  }

  report(`Restoring ${backup.entries.length} variant(s) to their previous price/cost...`);

  const priceUpdates = backup.entries.map((e) => ({
    productId: e.productId,
    variantId: e.variantId,
    price: e.price,
  }));
  const costUpdates = backup.entries.map((e) => ({
    inventoryItemId: e.inventoryItemId,
    cost: e.cost,
  }));

  report(`Restoring ${priceUpdates.length} price(s)...`);
  await applyPriceUpdates(shopContext, priceUpdates);

  report(`Restoring ${costUpdates.length} cost(s)...`);
  const failedClears = await applyCostUpdates(shopContext, costUpdates);
  if (failedClears.length > 0) {
    const names = failedClears.map((id) => describeVariant(backup.entries, id)).join(", ");
    report(
      `Warning: could not clear cost back to "no cost recorded" for: ${names}. ` +
        "Their cost field may still show the value set by apply — check them manually in Shopify admin.",
    );
  }

  await markBackupApplied(backup.path);
  report("Done. Prices and costs restored from backup.");

  return { restored: backup.entries.length, backupId: backup.path };
}
