// CLI entry point for `npm run undo`. See diagnostic.ts for why this lives
// in its own never-imported file instead of a guarded main() inside undo.ts.
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { getDevShopContext } from "../../shopify/devShopContext.js";
import { loadLatestBackup } from "../backup.js";
import { undoLatest } from "../undo.js";

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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
