import { applyCostUpdates, applyPriceUpdates } from "../shopify/mutations.js";
import { loadLatestBackup } from "./backup.js";
import { confirm } from "./confirm.js";

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
  const costUpdates = backup.entries
    .filter((e) => e.cost !== null)
    .map((e) => ({ inventoryItemId: e.inventoryItemId, cost: e.cost! }));

  console.log(`Restoring ${priceUpdates.length} price(s)...`);
  await applyPriceUpdates(priceUpdates);
  if (costUpdates.length > 0) {
    console.log(`Restoring ${costUpdates.length} cost(s)...`);
    await applyCostUpdates(costUpdates);
  }

  console.log("Done. Prices and costs restored from backup.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
