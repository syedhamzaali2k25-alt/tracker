import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { applyCostUpdates, applyPriceUpdates } from "../shopify/mutations.js";
import { changedEntries, readFixEntries, type FixEntry } from "../sheets/fixSheet.js";
import { saveBackup, type BackupEntry } from "./backup.js";
import { buildPreview, printPreview } from "./previewChanges.js";

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
    await applyPriceUpdates(priceUpdates);
  }
  if (costUpdates.length > 0) {
    report(`Updating ${costUpdates.length} cost(s)...`);
    await applyCostUpdates(costUpdates);
  }

  report("Done.");

  return { pricesUpdated: priceUpdates.length, costsUpdated: costUpdates.length, backupId };
}

async function confirmInCli(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${prompt} Type YES to confirm: `);
  rl.close();
  return answer.trim() === "YES";
}

async function main() {
  const report = (message: string) => console.log(message);

  const entries = await readFixEntries();
  const changed = changedEntries(entries);

  if (changed.length === 0) {
    report("No New Price / New Cost values found in the Fix tab — nothing to apply.");
    return;
  }

  printPreview(buildPreview(changed));

  const proceed = await confirmInCli("\nApply these changes to your live Shopify store?");
  if (!proceed) {
    report("Cancelled. Nothing was changed.");
    return;
  }

  await applyChanges(changed, report);
  report("Done. Run `npm run undo` if you need to restore the previous prices/costs.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
