import { applyCostUpdates, applyPriceUpdates } from "../shopify/mutations.js";
import { changedEntries, readFixEntries } from "../sheets/fixSheet.js";
import { saveBackup, type BackupEntry } from "./backup.js";
import { buildPreview, printPreview } from "./previewChanges.js";
import { confirm } from "./confirm.js";

async function main() {
  const entries = await readFixEntries();
  const changed = changedEntries(entries);

  if (changed.length === 0) {
    console.log("No New Price / New Cost values found in the Fix tab — nothing to apply.");
    return;
  }

  const preview = buildPreview(changed);
  printPreview(preview);

  const proceed = await confirm("\nApply these changes to your live Shopify store?");
  if (!proceed) {
    console.log("Cancelled. Nothing was changed.");
    return;
  }

  const backupEntries: BackupEntry[] = changed.map((e) => ({
    productId: e.productId,
    variantId: e.variantId,
    inventoryItemId: e.inventoryItemId,
    price: e.currentPrice,
    cost: e.currentCost,
  }));
  const backupPath = await saveBackup(backupEntries);
  console.log(`Saved a snapshot of the old prices/costs to ${backupPath}`);

  const priceUpdates = changed
    .filter((e) => e.newPrice !== null)
    .map((e) => ({ productId: e.productId, variantId: e.variantId, price: e.newPrice! }));
  const costUpdates = changed
    .filter((e) => e.newCost !== null)
    .map((e) => ({ inventoryItemId: e.inventoryItemId, cost: e.newCost! }));

  if (priceUpdates.length > 0) {
    console.log(`Updating ${priceUpdates.length} price(s)...`);
    await applyPriceUpdates(priceUpdates);
  }
  if (costUpdates.length > 0) {
    console.log(`Updating ${costUpdates.length} cost(s)...`);
    await applyCostUpdates(costUpdates);
  }

  console.log("Done. Run `npm run undo` if you need to restore the previous prices/costs.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
