import { applyCostUpdates, applyPriceUpdates } from "../shopify/mutations.js";
import { loadLatestBackup, markBackupApplied, type BackupEntry } from "./backup.js";
import { confirm } from "./confirm.js";

function describeVariant(entries: BackupEntry[], inventoryItemId: string): string {
  const entry = entries.find((e) => e.inventoryItemId === inventoryItemId);
  if (!entry) return inventoryItemId;
  return `${entry.productTitle} ${entry.variantTitle}`.trim();
}

async function main() {
  const backup = await loadLatestBackup();
  if (!backup) {
    console.log("No backups found in ./backups — nothing to undo.");
    return;
  }

  console.log(`Latest backup: ${backup.path}`);
  console.log(`It will restore ${backup.entries.length} variant(s) to their previous price/cost.`);

  const proceed = await confirm("Restore these previous prices/costs to your live Shopify store?");
  if (!proceed) {
    console.log("Cancelled. Nothing was changed.");
    return;
  }

  const priceUpdates = backup.entries.map((e) => ({
    productId: e.productId,
    variantId: e.variantId,
    price: e.price,
  }));
  const costUpdates = backup.entries.map((e) => ({
    inventoryItemId: e.inventoryItemId,
    cost: e.cost,
  }));

  console.log(`Restoring ${priceUpdates.length} price(s)...`);
  await applyPriceUpdates(priceUpdates);

  console.log(`Restoring ${costUpdates.length} cost(s)...`);
  const failedClears = await applyCostUpdates(costUpdates);
  if (failedClears.length > 0) {
    const names = failedClears.map((id) => describeVariant(backup.entries, id)).join(", ");
    console.warn(
      `Warning: could not clear cost back to "no cost recorded" for: ${names}. ` +
        "Their cost field may still show the value set by apply — check them manually in Shopify admin.",
    );
  }

  await markBackupApplied(backup.path);
  console.log("Done. Prices and costs restored from backup.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
