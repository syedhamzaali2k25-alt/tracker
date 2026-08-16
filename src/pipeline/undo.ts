import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { ShopContext } from "../shopify/client.js";
import { getDevShopContext } from "../shopify/devShopContext.js";
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

async function confirmInCli(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${prompt} Type YES to confirm: `);
  rl.close();
  return answer.trim() === "YES";
}

async function main() {
  const report = (message: string) => console.log(message);
  const shopContext = getDevShopContext();

  // Peek at the backup before asking to confirm, so the prompt can say what
  // it's about to restore. undoLatest() re-reads it — a second cheap local
  // file read, not worth threading a parameter through just to avoid it.
  const backup = await loadLatestBackup();
  if (!backup) {
    report("No backups found in ./backups — nothing to undo.");
    return;
  }
  report(`Latest backup: ${backup.path}`);
  report(`It will restore ${backup.entries.length} variant(s) to their previous price/cost.`);

  const proceed = await confirmInCli(
    "Restore these previous prices/costs to your live Shopify store?",
  );
  if (!proceed) {
    report("Cancelled. Nothing was changed.");
    return;
  }

  await undoLatest(shopContext, report);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
