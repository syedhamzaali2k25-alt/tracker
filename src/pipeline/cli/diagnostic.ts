// CLI entry point for `npm run diagnostic`. Lives outside src/pipeline/'s
// importable modules on purpose: this file is never imported by anything
// (the app included) — it's only ever run directly via `tsx`. That means it
// doesn't need the old `import.meta.url === process.argv[1]` guard, which
// broke when the app's SSR server bundled runDiagnostic.ts into a single
// file and that guard started matching the bundle itself, auto-running this
// CLI logic (against SHOPIFY_SHOP/SHOPIFY_ACCESS_TOKEN) on every server boot.
import { getDevShopContext } from "../../shopify/devShopContext.js";
import { runDiagnostic } from "../runDiagnostic.js";
import { writeDiagnostic } from "../../sheets/diagnosticSheet.js";

async function main() {
  const report = (message: string) => console.log(message);
  const shopContext = getDevShopContext();
  const { rows, summary } = await runDiagnostic(shopContext, report);

  report("Writing to Google Sheet...");
  const { preservedCount } = await writeDiagnostic(rows, summary);
  if (preservedCount > 0) {
    report(`Preserved ${preservedCount} pending edits from the Fix tab.`);
  }
  report("Done. Diagnostic and Fix tabs updated.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
