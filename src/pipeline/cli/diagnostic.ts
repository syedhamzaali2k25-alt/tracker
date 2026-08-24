// CLI entry point for `npm run diagnostic`. Lives outside src/pipeline/'s
// importable modules on purpose: this file is never imported by anything
// (the app included) — it's only ever run directly via `tsx`. That means it
// doesn't need the old `import.meta.url === process.argv[1]` guard, which
// broke when the app's SSR server bundled runDiagnostic.ts into a single
// file and that guard started matching the bundle itself, auto-running this
// CLI logic (against SHOPIFY_SHOP/SHOPIFY_ACCESS_TOKEN) on every server boot.
//
// Sheets access moved to per-merchant Google OAuth (see app/app/google-auth
// .server.ts) — there's no service account or shared sheet ID left for a
// script to authenticate with, so this only prints the diagnostic to the
// console. Use the app's "Sync" + "Create sheet" buttons to get it into a
// spreadsheet.
import { getDevShopContext } from "../../shopify/devShopContext.js";
import { runDiagnostic } from "../runDiagnostic.js";

async function main() {
  const report = (message: string) => console.log(message);
  const shopContext = getDevShopContext();
  await runDiagnostic(shopContext, report);
  report(
    "Done. This CLI no longer writes to a Google Sheet: Sheets access is per-merchant OAuth " +
      "now, connected through the app. Run the app locally (`cd app && npm run dev`) and use " +
      "\"Sync\" + \"Create sheet\" instead.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
