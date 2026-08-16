// CLI entry point for `npm run apply`. See diagnostic.ts for why this lives
// in its own never-imported file instead of a guarded main() inside
// applyChanges.ts.
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { getDevShopContext } from "../../shopify/devShopContext.js";
import { changedEntries, readFixEntries } from "../../sheets/fixSheet.js";
import { applyChanges } from "../applyChanges.js";
import { buildPreview, printPreview } from "../previewChanges.js";

async function confirmInCli(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${prompt} Type YES to confirm: `);
  rl.close();
  return answer.trim() === "YES";
}

async function main() {
  const report = (message: string) => console.log(message);
  const shopContext = getDevShopContext();

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

  await applyChanges(shopContext, changed, report);
  report("Done. Run `npm run undo` if you need to restore the previous prices/costs.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
